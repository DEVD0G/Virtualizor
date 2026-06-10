// Package virt kapselt alle libvirt-Operationen. Es kommuniziert über den
// lokalen Unix-Socket (reines Go-RPC, kein cgo, kein virsh-Shellout).
package virt

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"net"
	"regexp"
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

type DomainSpec struct {
	Name     string
	VCPUs    int
	MemoryMB int
	Disks    []Disk
	Nics     []Nic
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
  <vcpu>{{.VCPUs}}</vcpu>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='hd'/>
  </os>
  <features><acpi/><apic/></features>
  <cpu mode='host-passthrough'/>
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
