// Package virt kapselt alle libvirt-Operationen. Es kommuniziert über den
// lokalen Unix-Socket (reines Go-RPC, kein cgo, kein virsh-Shellout).
package virt

import (
	"bytes"
	"crypto/rand"
	"encoding/xml"
	"fmt"
	"net"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"text/template"
	"time"

	"github.com/digitalocean/go-libvirt"
)

var nameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,62}$`)

// ValidName prüft VM-/Snapshot-Namen gegen die Whitelist-Regel.
func ValidName(name string) bool { return nameRe.MatchString(name) }

type Disk struct {
	Path      string
	Dev       string // vda, vdb, …
	IsCdrom   bool
}

type Nic struct {
	Mac     string
	Bridge  string
	VlanTag int
}

type PCIDevice struct {
	Domain, Bus, Slot, Function string
}

type DomainSpec struct {
	Name       string
	VCPUs      int
	MemoryMB   int
	UEFI       bool
	CPUSockets int
	CPUCores   int
	CPUThreads int
	BootOrder  []string
	Disks      []Disk
	Nics       []Nic
	PCIDevices []PCIDevice
}

type VMInfo struct {
	Name  string `json:"name"`
	State string `json:"state"` // running | stopped | paused
}

type Manager struct {
	l *libvirt.Libvirt
}

func New() (*Manager, error) {
	conn, err := net.DialTimeout("unix", "/var/run/libvirt/libvirt-sock", 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("libvirt-Socket: %w", err)
	}
	l := libvirt.New(conn)
	if err := l.Connect(); err != nil {
		return nil, fmt.Errorf("libvirt connect: %w", err)
	}
	return &Manager{l: l}, nil
}

const domainXML = `<domain type='kvm'>
  <name>{{.Name}}</name>
  <memory unit='MiB'>{{.MemoryMB}}</memory>
  <vcpu placement='static'>{{.VCPUs}}</vcpu>
  <os{{if .UEFI}} firmware='efi'{{end}}>
    <type arch='x86_64' machine='q35'>hvm</type>
{{- if .UEFI}}
    <loader readonly='yes' type='pflash'>/usr/share/OVMF/OVMF_CODE.fd</loader>
    <nvram template='/usr/share/OVMF/OVMF_VARS.fd'>/var/lib/libvirt/qemu/nvram/{{.Name}}_VARS.fd</nvram>
{{- end}}
{{- if .BootOrder}}
{{- range .BootOrder}}    <boot dev='{{.}}'/>
{{end}}{{- else}}
    <boot dev='hd'/>
{{- end}}
  </os>
  <features><acpi/><apic/></features>
  <cpu mode='host-passthrough'>
{{- if and .CPUSockets .CPUCores}}
    <topology sockets='{{.CPUSockets}}' cores='{{.CPUCores}}' threads='{{if .CPUThreads}}{{.CPUThreads}}{{else}}1{{end}}'/>
{{- end}}
  </cpu>
  <clock offset='utc'/>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
{{- range .Disks}}
{{- if .IsCdrom}}
    <disk type='file' device='cdrom'>
      <driver name='qemu' type='raw'/>
      <source file='{{.Path}}'/>
      <target dev='{{.Dev}}' bus='sata'/>
      <readonly/>
    </disk>
{{- else}}
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2' discard='unmap'/>
      <source file='{{.Path}}'/>
      <target dev='{{.Dev}}' bus='virtio'/>
    </disk>
{{- end}}
{{- end}}
{{- range .Nics}}
    <interface type='bridge'>
      <mac address='{{.Mac}}'/>
      <source bridge='{{.Bridge}}'/>
{{- if gt .VlanTag 0}}
      <vlan><tag id='{{.VlanTag}}'/></vlan>
{{- end}}
      <model type='virtio'/>
    </interface>
{{- end}}
{{- range .PCIDevices}}
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='{{.Domain}}' bus='{{.Bus}}' slot='{{.Slot}}' function='{{.Function}}'/>
      </source>
    </hostdev>
{{- end}}
    <serial type='pty'><target port='0'/></serial>
    <console type='pty'><target type='serial' port='0'/></console>
    <graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'/>
    <video><model type='virtio'/></video>
    <memballoon model='virtio'/>
    <rng model='virtio'><backend model='random'>/dev/urandom</backend></rng>
  </devices>
</domain>`

var domainTpl = template.Must(template.New("domain").Parse(domainXML))

// DefineAndStart ist idempotent: existiert die Domain bereits, wird nur
// sichergestellt, dass sie läuft.
func (m *Manager) DefineAndStart(spec DomainSpec) error {
	if !ValidName(spec.Name) {
		return fmt.Errorf("ungültiger Domain-Name")
	}
	if dom, err := m.l.DomainLookupByName(spec.Name); err == nil {
		return m.ensureRunning(dom)
	}
	var buf bytes.Buffer
	if err := domainTpl.Execute(&buf, spec); err != nil {
		return err
	}
	dom, err := m.l.DomainDefineXML(buf.String())
	if err != nil {
		return fmt.Errorf("define: %w", err)
	}
	return m.ensureRunning(dom)
}

func (m *Manager) Start(name string) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return fmt.Errorf("VM nicht gefunden: %w", err)
	}
	return m.ensureRunning(dom)
}

func (m *Manager) Stop(name string, force bool) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return fmt.Errorf("VM nicht gefunden: %w", err)
	}
	state, _, err := m.l.DomainGetState(dom, 0)
	if err == nil && libvirt.DomainState(state) == libvirt.DomainShutoff {
		return nil
	}
	if force {
		return m.l.DomainDestroy(dom)
	}
	if err := m.l.DomainShutdown(dom); err != nil {
		return err
	}
	// Auf ACPI-Shutdown warten, nach 60s hart abschalten
	for i := 0; i < 60; i++ {
		time.Sleep(time.Second)
		state, _, err := m.l.DomainGetState(dom, 0)
		if err != nil || libvirt.DomainState(state) == libvirt.DomainShutoff {
			return nil
		}
	}
	return m.l.DomainDestroy(dom)
}

func (m *Manager) Restart(name string) error {
	if err := m.Stop(name, false); err != nil {
		return err
	}
	return m.Start(name)
}

// Undefine entfernt die Domain (ohne Volumes — das macht der Storage-Layer).
func (m *Manager) Undefine(name string) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return nil // bereits weg → idempotent ok
	}
	state, _, _ := m.l.DomainGetState(dom, 0)
	if libvirt.DomainState(state) == libvirt.DomainRunning {
		_ = m.l.DomainDestroy(dom)
	}
	return m.l.DomainUndefineFlags(dom,
		libvirt.DomainUndefineManagedSave|libvirt.DomainUndefineSnapshotsMetadata|libvirt.DomainUndefineNvram)
}

func (m *Manager) SnapshotCreate(name, snapName string) error {
	if !ValidName(snapName) {
		return fmt.Errorf("ungültiger Snapshot-Name")
	}
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return err
	}
	xml := fmt.Sprintf("<domainsnapshot><name>%s</name></domainsnapshot>", snapName)
	_, err = m.l.DomainSnapshotCreateXML(dom, xml, 0)
	return err
}

func (m *Manager) SnapshotRevert(name, snapName string) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return err
	}
	snap, err := m.l.DomainSnapshotLookupByName(dom, snapName, 0)
	if err != nil {
		return err
	}
	return m.l.DomainRevertToSnapshot(snap, 0)
}

func (m *Manager) SnapshotDelete(name, snapName string) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return nil
	}
	snap, err := m.l.DomainSnapshotLookupByName(dom, snapName, 0)
	if err != nil {
		return nil // bereits weg
	}
	return m.l.DomainSnapshotDelete(snap, 0)
}

func (m *Manager) ListVMs() ([]VMInfo, error) {
	domains, _, err := m.l.ConnectListAllDomains(1, 0)
	if err != nil {
		return nil, err
	}
	var out []VMInfo
	for _, dom := range domains {
		state, _, err := m.l.DomainGetState(dom, 0)
		if err != nil {
			continue
		}
		out = append(out, VMInfo{Name: dom.Name, State: stateString(libvirt.DomainState(state))})
	}
	return out, nil
}

func (m *Manager) ensureRunning(dom libvirt.Domain) error {
	state, _, err := m.l.DomainGetState(dom, 0)
	if err == nil && libvirt.DomainState(state) == libvirt.DomainRunning {
		return nil
	}
	return m.l.DomainCreate(dom)
}

// DiskPaths gibt die Dateipfade aller Nicht-CDROM-Disks der Domain zurück.
func (m *Manager) DiskPaths(name string) ([]string, error) {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return nil, fmt.Errorf("VM nicht gefunden: %w", err)
	}
	xmlStr, err := m.l.DomainGetXMLDesc(dom, 0)
	if err != nil {
		return nil, err
	}

	type sourceXML struct {
		File string `xml:"file,attr"`
	}
	type diskXML struct {
		Device string    `xml:"device,attr"`
		Source sourceXML `xml:"source"`
	}
	type devicesXML struct {
		Disks []diskXML `xml:"disk"`
	}
	type domainDoc struct {
		Devices devicesXML `xml:"devices"`
	}

	var doc domainDoc
	if err := xml.Unmarshal([]byte(xmlStr), &doc); err != nil {
		return nil, err
	}
	var paths []string
	for _, d := range doc.Devices.Disks {
		if d.Device != "cdrom" && d.Source.File != "" {
			paths = append(paths, d.Source.File)
		}
	}
	return paths, nil
}

// ResizeDomain ändert vCPU- und RAM-Konfiguration einer gestoppten Domain.
// Die Änderungen werden als persistente Konfiguration (Config-Flag) gespeichert.
func (m *Manager) ResizeDomain(name string, vcpus, memMb int) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return fmt.Errorf("VM nicht gefunden: %w", err)
	}
	state, _, _ := m.l.DomainGetState(dom, 0)
	if libvirt.DomainState(state) == libvirt.DomainRunning {
		return fmt.Errorf("VM muss gestoppt sein für Resize")
	}
	xmlStr, err := m.l.DomainGetXMLDesc(dom, libvirt.DomainXMLInactive)
	if err != nil {
		return fmt.Errorf("DomainGetXMLDesc: %w", err)
	}
	// Ersetze <vcpu …>N</vcpu> und <memory …>N</memory> / <currentMemory …>N</currentMemory>
	// in der zurückgegebenen XML (Einheit: KiB).
	patVcpu := regexp.MustCompile(`<vcpu[^>]*>\d+</vcpu>`)
	patMem  := regexp.MustCompile(`<memory[^>]*>\d+</memory>`)
	patCur  := regexp.MustCompile(`<currentMemory[^>]*>\d+</currentMemory>`)
	memKib  := fmt.Sprintf("%d", memMb*1024)
	xmlStr = patVcpu.ReplaceAllString(xmlStr, fmt.Sprintf("<vcpu placement='static'>%d</vcpu>", vcpus))
	xmlStr = patMem.ReplaceAllString(xmlStr, "<memory unit='KiB'>"+memKib+"</memory>")
	xmlStr = patCur.ReplaceAllString(xmlStr, "<currentMemory unit='KiB'>"+memKib+"</currentMemory>")
	if !strings.Contains(xmlStr, "<currentMemory") {
		xmlStr = strings.Replace(xmlStr, "</memory>",
			"</memory>\n  <currentMemory unit='KiB'>"+memKib+"</currentMemory>", 1)
	}
	_, err = m.l.DomainDefineXML(xmlStr)
	return err
}

// NicInfo enthält MAC und Bridge eines VM-Netzwerkinterfaces.
type NicInfo struct {
	Mac    string
	Bridge string
}

// GetNics liest die Netzwerkinterfaces einer Domain aus der XML-Beschreibung.
func (m *Manager) GetNics(name string) ([]NicInfo, error) {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return nil, fmt.Errorf("VM nicht gefunden: %w", err)
	}
	xmlStr, err := m.l.DomainGetXMLDesc(dom, 0)
	if err != nil {
		return nil, fmt.Errorf("DomainGetXMLDesc: %w", err)
	}
	type macXML struct {
		Address string `xml:"address,attr"`
	}
	type sourceXML struct {
		Bridge string `xml:"bridge,attr"`
	}
	type ifaceXML struct {
		Type   string    `xml:"type,attr"`
		Mac    macXML    `xml:"mac"`
		Source sourceXML `xml:"source"`
	}
	type devicesXML struct {
		Ifaces []ifaceXML `xml:"interface"`
	}
	type domainDoc struct {
		Devices devicesXML `xml:"devices"`
	}
	var doc domainDoc
	if err := xml.Unmarshal([]byte(xmlStr), &doc); err != nil {
		return nil, err
	}
	var nics []NicInfo
	for _, i := range doc.Devices.Ifaces {
		if i.Type == "bridge" && i.Mac.Address != "" {
			nics = append(nics, NicInfo{Mac: i.Mac.Address, Bridge: i.Source.Bridge})
		}
	}
	return nics, nil
}

// VncPort gibt den vom QEMU zugewiesenen VNC-TCP-Port der laufenden Domain zurück.
func (m *Manager) VncPort(name string) (int, error) {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return 0, fmt.Errorf("VM nicht gefunden: %w", err)
	}
	xmlStr, err := m.l.DomainGetXMLDesc(dom, 0)
	if err != nil {
		return 0, fmt.Errorf("DomainGetXMLDesc: %w", err)
	}

	type graphicsXML struct {
		Type string `xml:"type,attr"`
		Port int    `xml:"port,attr"`
	}
	type devicesXML struct {
		Graphics []graphicsXML `xml:"graphics"`
	}
	type domainXMLDoc struct {
		Devices devicesXML `xml:"devices"`
	}

	var doc domainXMLDoc
	if err := xml.Unmarshal([]byte(xmlStr), &doc); err != nil {
		return 0, fmt.Errorf("XML parsen: %w", err)
	}
	for _, g := range doc.Devices.Graphics {
		if g.Type == "vnc" && g.Port > 0 {
			return g.Port, nil
		}
	}
	return 0, fmt.Errorf("kein aktiver VNC-Endpunkt für VM %q", name)
}

// randomMac erzeugt eine zufällige locally-administered Unicast-MAC-Adresse
// im QEMU-Präfix-Format 52:54:xx:xx:xx:xx.
func randomMac() string {
	b := make([]byte, 6)
	rand.Read(b)
	b[0] = (b[0] & 0xfe) | 0x02 // locally administered, unicast
	return fmt.Sprintf("52:54:%02x:%02x:%02x:%02x", b[2], b[3], b[4], b[5])
}

// CloneVM erstellt eine vollständige Kopie der Quell-Domain unter einem neuen Namen.
// Die Quell-Domain wird vorher gestoppt. Gibt einen Fehler zurück, wenn targetName
// bereits existiert.
func (m *Manager) CloneVM(sourceName, targetName, imagesDir string) error {
	// Prüfen ob Ziel bereits existiert
	if _, err := m.l.DomainLookupByName(targetName); err == nil {
		return fmt.Errorf("VM %q existiert bereits", targetName)
	}

	// Quell-Domain holen
	dom, err := m.l.DomainLookupByName(sourceName)
	if err != nil {
		return fmt.Errorf("Quell-VM nicht gefunden: %w", err)
	}

	// Stoppen falls laufend
	state, _, _ := m.l.DomainGetState(dom, 0)
	if libvirt.DomainState(state) == libvirt.DomainRunning {
		if err := m.Stop(sourceName, true); err != nil {
			return fmt.Errorf("VM stoppen: %w", err)
		}
	}

	// XML der gestoppten Domain holen
	xmlStr, err := m.l.DomainGetXMLDesc(dom, libvirt.DomainXMLInactive)
	if err != nil {
		return fmt.Errorf("DomainGetXMLDesc: %w", err)
	}

	// Disk-Pfade ermitteln
	diskPaths, err := m.DiskPaths(sourceName)
	if err != nil {
		return fmt.Errorf("DiskPaths: %w", err)
	}

	// Für jede Disk eine neue Kopie erstellen
	newDiskPaths := make([]string, len(diskPaths))
	for i, src := range diskPaths {
		newPath := filepath.Join(imagesDir, targetName+"-disk"+strconv.Itoa(i)+".qcow2")
		cmd := exec.Command("/usr/bin/qemu-img", "convert", "-f", "qcow2", "-O", "qcow2", "-c", src, newPath)
		if out, err := cmd.CombinedOutput(); err != nil {
			// Bereits erstellte Disks aufräumen
			for j := 0; j < i; j++ {
				_ = exec.Command("rm", "-f", newDiskPaths[j]).Run()
			}
			return fmt.Errorf("qemu-img convert disk %d: %s: %w", i, out, err)
		}
		newDiskPaths[i] = newPath
	}

	// XML anpassen: Name, UUID, Disk-Pfade, MACs
	newXML := xmlStr

	// Name ersetzen
	nameRx := regexp.MustCompile(`<name>[^<]*</name>`)
	newXML = nameRx.ReplaceAllString(newXML, "<name>"+targetName+"</name>")

	// UUID entfernen (libvirt generiert neue)
	uuidRx := regexp.MustCompile(`\s*<uuid>[^<]*</uuid>`)
	newXML = uuidRx.ReplaceAllString(newXML, "")

	// Disk-Pfade ersetzen
	for i, src := range diskPaths {
		newXML = strings.ReplaceAll(newXML, src, newDiskPaths[i])
	}

	// MACs ersetzen
	macRx := regexp.MustCompile(`<mac address='[^']*'/>`)
	newXML = macRx.ReplaceAllStringFunc(newXML, func(_ string) string {
		return "<mac address='" + randomMac() + "'/>"
	})

	// Neue Domain definieren
	newDom, err := m.l.DomainDefineXML(newXML)
	if err != nil {
		return fmt.Errorf("DomainDefineXML: %w", err)
	}

	// Neue Domain starten
	return m.l.DomainCreate(newDom)
}

// MountISO hängt ein CDROM-Gerät mit dem angegebenen ISO-Pfad an die Domain.
// Funktioniert sowohl für laufende (live attach) als auch gestoppte VMs.
func (m *Manager) MountISO(name, isoPath string) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return fmt.Errorf("VM nicht gefunden: %w", err)
	}
	cdromXML := fmt.Sprintf(`<disk type='file' device='cdrom'>
  <driver name='qemu' type='raw'/>
  <source file='%s'/>
  <target dev='sdb' bus='sata'/>
  <readonly/>
</disk>`, isoPath)

	state, _, _ := m.l.DomainGetState(dom, 0)
	var flags uint32
	if libvirt.DomainState(state) == libvirt.DomainRunning {
		flags = uint32(libvirt.DomainDeviceModifyLive | libvirt.DomainDeviceModifyConfig)
	} else {
		flags = uint32(libvirt.DomainDeviceModifyConfig)
	}
	return m.l.DomainAttachDeviceFlags(dom, cdromXML, flags)
}

// UnmountISO entfernt alle CDROM-Geräte (außer dem cloud-init seed) von der Domain.
func (m *Manager) UnmountISO(name string) error {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return fmt.Errorf("VM nicht gefunden: %w", err)
	}
	xmlStr, err := m.l.DomainGetXMLDesc(dom, 0)
	if err != nil {
		return err
	}

	type sourceXML struct {
		File string `xml:"file,attr"`
	}
	type targetXML struct {
		Dev string `xml:"dev,attr"`
	}
	type diskXML struct {
		Device string    `xml:"device,attr"`
		Source sourceXML `xml:"source"`
		Target targetXML `xml:"target"`
	}
	type devicesXML struct {
		Disks []diskXML `xml:"disk"`
	}
	type domainDoc struct {
		Devices devicesXML `xml:"devices"`
	}
	var doc domainDoc
	xml.Unmarshal([]byte(xmlStr), &doc)

	state, _, _ := m.l.DomainGetState(dom, 0)
	var flags libvirt.DomainDeviceModifyFlags
	if libvirt.DomainState(state) == libvirt.DomainRunning {
		flags = libvirt.DomainDeviceModifyLive | libvirt.DomainDeviceModifyConfig
	} else {
		flags = libvirt.DomainDeviceModifyConfig
	}

	for _, disk := range doc.Devices.Disks {
		if disk.Device == "cdrom" && !strings.HasSuffix(disk.Source.File, "seed.iso") {
			emptyXML := fmt.Sprintf(`<disk type='file' device='cdrom'>
  <driver name='qemu' type='raw'/>
  <target dev='%s' bus='sata'/>
  <readonly/>
</disk>`, disk.Target.Dev)
			_ = m.l.DomainUpdateDeviceFlags(dom, emptyXML, flags)
		}
	}
	return nil
}

// ExportXML gibt die persistente (inaktive) Domain-XML zurück (für Migration).
func (m *Manager) ExportXML(name string) (string, error) {
	dom, err := m.l.DomainLookupByName(name)
	if err != nil {
		return "", fmt.Errorf("VM nicht gefunden: %w", err)
	}
	return m.l.DomainGetXMLDesc(dom, libvirt.DomainXMLInactive)
}

func stateString(s libvirt.DomainState) string {
	switch s {
	case libvirt.DomainRunning:
		return "running"
	case libvirt.DomainPaused:
		return "paused"
	default:
		return "stopped"
	}
}
