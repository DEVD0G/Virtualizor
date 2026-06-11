// Package server implementiert den mTLS-HTTP-Server des Agents.
//
// Sicherheitsmodell: Die API-Oberfläche IST die Command-Whitelist — es gibt
// keinen generischen Exec-Endpoint. Jeder Handler validiert seine Inputs
// strikt, bevor irgendetwas den Host berührt.
package server

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/devd0g/virtualizor/agent/internal/config"
	"github.com/devd0g/virtualizor/agent/internal/firewall"
	"github.com/devd0g/virtualizor/agent/internal/metrics"
	"github.com/devd0g/virtualizor/agent/internal/storage"
	"github.com/devd0g/virtualizor/agent/internal/virt"
)

const (
	qemuImgBin    = "/usr/bin/qemu-img"
	lxcCreateBin  = "/usr/bin/lxc-create"
	lxcStartBin   = "/usr/bin/lxc-start"
	lxcStopBin    = "/usr/bin/lxc-stop"
	lxcDestroyBin = "/usr/bin/lxc-destroy"
	rsyncBin      = "/usr/bin/rsync"
	virshBin      = "/usr/bin/virsh"
)

type consoleEntry struct {
	vmName    string
	expiresAt time.Time
}

type Server struct {
	cfg           *config.Config
	virt          *virt.Manager
	store         *storage.Store
	collector     *metrics.Collector
	consoleMu     sync.Mutex
	consoleTokens map[string]consoleEntry
}

func New(cfg *config.Config, vm *virt.Manager, store *storage.Store, col *metrics.Collector) *Server {
	s := &Server{
		cfg:           cfg,
		virt:          vm,
		store:         store,
		collector:     col,
		consoleTokens: make(map[string]consoleEntry),
	}
	go s.sweepConsoleTokens()
	return s
}

// sweepConsoleTokens entfernt abgelaufene Einträge alle 30 Sekunden.
func (s *Server) sweepConsoleTokens() {
	t := time.NewTicker(30 * time.Second)
	for range t.C {
		now := time.Now()
		s.consoleMu.Lock()
		for tok, e := range s.consoleTokens {
			if now.After(e.expiresAt) {
				delete(s.consoleTokens, tok)
			}
		}
		s.consoleMu.Unlock()
	}
}

func (s *Server) ListenAndServe() error {
	caPem, err := os.ReadFile(s.cfg.TLS.CA)
	if err != nil {
		return fmt.Errorf("ca laden: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caPem) {
		return fmt.Errorf("ca ungültig")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", s.handleHealth)
	mux.HandleFunc("GET /v1/inventory", s.handleInventory)
	mux.HandleFunc("GET /v1/metrics", s.handleMetrics)
	mux.HandleFunc("POST /v1/vms", s.handleCreateVm)
	mux.HandleFunc("POST /v1/vms/{name}/start", s.vmAction(func(n string, _ map[string]any) error { return s.virt.Start(n) }))
	mux.HandleFunc("POST /v1/vms/{name}/stop", s.vmAction(func(n string, b map[string]any) error {
		force, _ := b["force"].(bool)
		return s.virt.Stop(n, force)
	}))
	mux.HandleFunc("POST /v1/vms/{name}/restart", s.vmAction(func(n string, _ map[string]any) error { return s.virt.Restart(n) }))
	mux.HandleFunc("DELETE /v1/vms/{name}", s.handleDeleteVm)
	mux.HandleFunc("POST /v1/vms/{name}/snapshot", s.vmAction(func(n string, b map[string]any) error {
		name, _ := b["name"].(string)
		return s.virt.SnapshotCreate(n, name)
	}))
	mux.HandleFunc("POST /v1/vms/{name}/snapshot-revert", s.vmAction(func(n string, b map[string]any) error {
		name, _ := b["name"].(string)
		return s.virt.SnapshotRevert(n, name)
	}))
	mux.HandleFunc("DELETE /v1/vms/{name}/snapshots/{snap}", s.handleDeleteSnapshot)
	mux.HandleFunc("POST /v1/vms/{name}/backup", s.handleBackupDirect)
	mux.HandleFunc("POST /v1/vms/{name}/firewall/apply", s.handleApplyFirewall)
	mux.HandleFunc("POST /v1/vms/{name}/resize", s.handleResizeVm)
	mux.HandleFunc("POST /v1/vms/{name}/disks/resize", s.handleResizeDisk)
	mux.HandleFunc("POST /v1/vms/{name}/clone", s.handleCloneVm)
	mux.HandleFunc("POST /v1/vms/{name}/iso/mount", s.handleMountIso)
	mux.HandleFunc("DELETE /v1/vms/{name}/iso", s.handleUnmountIso)
	mux.HandleFunc("POST /v1/vms/{name}/restore", s.handleRestoreVm)
	mux.HandleFunc("POST /v1/vms/{name}/migrate", s.handleMigrateVm)
	mux.HandleFunc("POST /v1/containers", s.handleCreateContainer)
	mux.HandleFunc("POST /v1/containers/{name}/start", s.containerAction(func(n string, _ map[string]any) error { return execCmd(lxcStartBin, "-n", n) }))
	mux.HandleFunc("POST /v1/containers/{name}/stop", s.containerAction(func(n string, _ map[string]any) error { return execCmd(lxcStopBin, "-n", n, "-t", "30") }))
	mux.HandleFunc("POST /v1/containers/{name}/restart", s.containerAction(func(n string, _ map[string]any) error {
		_ = execCmd(lxcStopBin, "-n", n, "-t", "30")
		return execCmd(lxcStartBin, "-n", n)
	}))
	mux.HandleFunc("DELETE /v1/containers/{name}", s.handleDeleteContainer)
	mux.HandleFunc("GET /v1/pci-devices", s.handleListPciDevices)
	mux.HandleFunc("POST /v1/console-token", s.handleConsoleToken)
	mux.HandleFunc("GET /v1/console/ws", s.handleConsoleWs)

	srv := &http.Server{
		Addr:    s.cfg.ListenAddr,
		Handler: mux,
		TLSConfig: &tls.Config{
			ClientAuth: tls.RequireAndVerifyClientCert, // nur Panel-CA-Clients
			ClientCAs:  pool,
			MinVersion: tls.VersionTLS12,
		},
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Minute, // lange Ops (Provision mit Template-Download)
	}
	slog.Info("agent lauscht (mTLS)", "addr", s.cfg.ListenAddr)
	return srv.ListenAndServeTLS(s.cfg.TLS.Cert, s.cfg.TLS.Key)
}

// ─── Handler ─────────────────────────────────────────────────────────────────

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) handleInventory(w http.ResponseWriter, _ *http.Request) {
	vms, err := s.virt.ListVMs()
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]any{"vms": vms})
}

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, s.collector.Collect())
}

type createVmReq struct {
	Name       string   `json:"name"`
	VCPUs      int      `json:"vcpus"`
	MemoryMB   int      `json:"memoryMb"`
	UEFI       bool     `json:"uefi"`
	CPUSockets int      `json:"cpuSockets"`
	CPUCores   int      `json:"cpuCores"`
	CPUThreads int      `json:"cpuThreads"`
	BootOrder  []string `json:"bootOrder"`
	PCIDevices []struct {
		Domain   string `json:"domain"`
		Bus      string `json:"bus"`
		Slot     string `json:"slot"`
		Function string `json:"function"`
	} `json:"pciDevices"`
	Disks []struct {
		Name           string `json:"name"`
		SizeGb         int    `json:"sizeGb"`
		TemplateURL    string `json:"templateUrl"`
		TemplateSha256 string `json:"templateSha256"`
	} `json:"disks"`
	Nics []struct {
		Mac     string `json:"mac"`
		Bridge  string `json:"bridge"`
		VlanTag int    `json:"vlanTag"`
		IP      string `json:"ip"`
	} `json:"nics"`
	CloudInit struct {
		Hostname string   `json:"hostname"`
		SSHKeys  []string `json:"sshKeys"`
		UserData string   `json:"userData"`
	} `json:"cloudInit"`
}

func (s *Server) handleCreateVm(w http.ResponseWriter, r *http.Request) {
	var req createVmReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeErr(w, 400, err)
		return
	}
	if !virt.ValidName(req.Name) || req.VCPUs < 1 || req.VCPUs > 128 ||
		req.MemoryMB < 256 || req.MemoryMB > 1<<20 || len(req.Disks) == 0 {
		writeErr(w, 400, fmt.Errorf("ungültige vm-spezifikation"))
		return
	}

	spec := virt.DomainSpec{
		Name:       req.Name,
		VCPUs:      req.VCPUs,
		MemoryMB:   req.MemoryMB,
		UEFI:       req.UEFI,
		CPUSockets: req.CPUSockets,
		CPUCores:   req.CPUCores,
		CPUThreads: req.CPUThreads,
		BootOrder:  req.BootOrder,
	}
	for _, p := range req.PCIDevices {
		spec.PCIDevices = append(spec.PCIDevices, virt.PCIDevice{
			Domain: p.Domain, Bus: p.Bus, Slot: p.Slot, Function: p.Function,
		})
	}

	devs := []string{"vda", "vdb", "vdc", "vdd", "vde", "vdf", "vdg", "vdh"}
	for i, d := range req.Disks {
		if !virt.ValidName(d.Name) || d.SizeGb < 1 || d.SizeGb > 16384 || i >= len(devs) {
			writeErr(w, 400, fmt.Errorf("ungültige disk-spezifikation"))
			return
		}
		templatePath := ""
		if d.TemplateURL != "" {
			p, err := s.store.EnsureTemplate(d.TemplateURL, d.TemplateSha256)
			if err != nil {
				writeErr(w, 500, err)
				return
			}
			templatePath = p
		}
		path, err := s.store.CreateVolume(d.Name, d.SizeGb, templatePath)
		if err != nil {
			writeErr(w, 500, err)
			return
		}
		spec.Disks = append(spec.Disks, virt.Disk{Path: path, Dev: devs[i]})
	}

	// cloud-init Seed-ISO
	seed, err := s.store.BuildSeedISO(req.Name, storage.CloudInit{
		Hostname: req.CloudInit.Hostname,
		SSHKeys:  req.CloudInit.SSHKeys,
		UserData: req.CloudInit.UserData,
	})
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	spec.Disks = append(spec.Disks, virt.Disk{Path: seed, Dev: "sda", IsCdrom: true})

	for _, n := range req.Nics {
		bridge := n.Bridge
		if bridge == "" {
			bridge = s.cfg.Network.DefaultBridge
		}
		if !validBridge(bridge) || !validMac(n.Mac) {
			writeErr(w, 400, fmt.Errorf("ungültige nic-spezifikation"))
			return
		}
		spec.Nics = append(spec.Nics, virt.Nic{Mac: n.Mac, Bridge: bridge, VlanTag: n.VlanTag})
	}

	if err := s.virt.DefineAndStart(spec); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, map[string]string{"status": "running"})
}

func (s *Server) handleDeleteVm(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	if err := s.virt.Undefine(name); err != nil {
		writeErr(w, 500, err)
		return
	}
	// Volumes nach Namenskonvention entfernen
	for i := 0; i < 8; i++ {
		_ = s.store.DeleteVolume(fmt.Sprintf("%s-disk%d", name, i))
	}
	_ = s.store.DeleteSeed(name)
	_ = firewall.Flush(name) // nftables-Regeln bereinigen
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

// handleBackupDirect schreibt die JSON-Antwort mit den Backup-Metadaten.
// Registriert als POST /v1/vms/{name}/backup (direkt, nicht via vmAction).
func (s *Server) handleBackupDirect(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var body map[string]any
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
	targetDir, _ := body["targetDir"].(string)
	if targetDir == "" {
		targetDir = "/var/lib/vcp/backups"
	}

	diskPaths, err := s.virt.DiskPaths(name)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	if len(diskPaths) == 0 {
		writeErr(w, 409, fmt.Errorf("keine Disks gefunden"))
		return
	}

	ts := time.Now().UTC().Format("20060102-150405")
	vmBackupDir := fmt.Sprintf("%s/%s", targetDir, name)

	type backupFile struct {
		Source string `json:"source"`
		Path   string `json:"path"`
		Bytes  int64  `json:"bytes"`
	}
	var files []backupFile
	var totalBytes int64

	for i, src := range diskPaths {
		filename := fmt.Sprintf("%s-disk%d-%s.qcow2", name, i, ts)
		outPath, size, err := s.store.BackupVolume(src, vmBackupDir, filename)
		if err != nil {
			writeErr(w, 500, err)
			return
		}
		files = append(files, backupFile{Source: src, Path: outPath, Bytes: size})
		totalBytes += size
	}

	writeJSON(w, 200, map[string]any{
		"timestamp":  ts,
		"targetDir":  vmBackupDir,
		"files":      files,
		"totalBytes": totalBytes,
	})
}

// handleApplyFirewall übersetzt gespeicherte Firewall-Regeln in nftables-Bridge-Regeln.
func (s *Server) handleApplyFirewall(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var rules []firewall.Rule
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&rules); err != nil {
		writeErr(w, 400, err)
		return
	}
	nics, err := s.virt.GetNics(name)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	if len(nics) == 0 {
		writeErr(w, 409, fmt.Errorf("keine Netzwerkinterfaces gefunden"))
		return
	}
	// Regeln für jedes NIC der VM anwenden (typischerweise eins).
	for _, nic := range nics {
		if err := firewall.Apply(name+"-"+nic.Mac[len(nic.Mac)-5:], nic.Mac, rules); err != nil {
			slog.Warn("nftables apply", "vm", name, "mac", nic.Mac, "err", err)
		}
	}
	writeJSON(w, 200, map[string]string{"status": "applied"})
}

// handleResizeVm ändert vCPU- und RAM-Konfiguration einer gestoppten VM.
func (s *Server) handleResizeVm(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var body struct {
		VCPUs    int `json:"vcpus"`
		MemoryMB int `json:"memoryMb"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeErr(w, 400, err)
		return
	}
	if body.VCPUs < 1 || body.VCPUs > 128 || body.MemoryMB < 256 || body.MemoryMB > 1<<20 {
		writeErr(w, 400, fmt.Errorf("ungültige resize-parameter"))
		return
	}
	if err := s.virt.ResizeDomain(name, body.VCPUs, body.MemoryMB); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]string{"status": "resized"})
}

// handleResizeDisk vergrößert eine qcow2-Disk (nur Wachstum, kein Schrumpfen).
func (s *Server) handleResizeDisk(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var body struct {
		DiskPath  string `json:"diskPath"`
		NewSizeGb int    `json:"newSizeGb"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeErr(w, 400, err)
		return
	}
	if body.DiskPath == "" || body.NewSizeGb < 1 || body.NewSizeGb > 16384 {
		writeErr(w, 400, fmt.Errorf("ungültige disk-parameter"))
		return
	}
	// Pfad muss im images-Verzeichnis liegen (Traversal-Schutz)
	if !strings.HasPrefix(body.DiskPath, s.store.ImagesDir+"/") {
		writeErr(w, 400, fmt.Errorf("diskPath außerhalb des storage-roots"))
		return
	}
	size := fmt.Sprintf("%dG", body.NewSizeGb)
	cmd := exec.Command(qemuImgBin, "resize", body.DiskPath, size)
	if out, err := cmd.CombinedOutput(); err != nil {
		writeErr(w, 500, fmt.Errorf("qemu-img resize: %s: %w", out, err))
		return
	}
	writeJSON(w, 200, map[string]string{"status": "resized"})
}

func (s *Server) handleDeleteSnapshot(w http.ResponseWriter, r *http.Request) {
	name, snap := r.PathValue("name"), r.PathValue("snap")
	if !virt.ValidName(name) || !virt.ValidName(snap) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	if err := s.virt.SnapshotDelete(name, snap); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

// handleConsoleToken erzeugt ein kurzlebiges Token (90s) für den VNC-WebSocket-Proxy.
func (s *Server) handleConsoleToken(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
	name, _ := body["vmName"].(string)
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		writeErr(w, 500, err)
		return
	}
	token := hex.EncodeToString(buf)
	s.consoleMu.Lock()
	s.consoleTokens[token] = consoleEntry{vmName: name, expiresAt: time.Now().Add(90 * time.Second)}
	s.consoleMu.Unlock()

	writeJSON(w, 200, map[string]any{
		"token":     token,
		"expiresIn": 90,
	})
}

// handleConsoleWs validiert das Token, ermittelt den VNC-Port und proxied
// die WebSocket-Verbindung zur lokalen VNC-TCP-Buchse (RFC 6455, binary frames).
func (s *Server) handleConsoleWs(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		writeErr(w, 400, fmt.Errorf("token fehlt"))
		return
	}

	s.consoleMu.Lock()
	entry, ok := s.consoleTokens[token]
	if ok && time.Now().Before(entry.expiresAt) {
		delete(s.consoleTokens, token) // Einmalnutzung
	} else {
		ok = false
	}
	s.consoleMu.Unlock()

	if !ok {
		writeErr(w, 403, fmt.Errorf("token ungültig oder abgelaufen"))
		return
	}

	vncPort, err := s.virt.VncPort(entry.vmName)
	if err != nil {
		writeErr(w, 409, err)
		return
	}

	// ─── WebSocket-Handshake (RFC 6455) ───────────────────────────────────────
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		writeErr(w, 400, fmt.Errorf("kein WebSocket-Upgrade"))
		return
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		writeErr(w, 400, fmt.Errorf("Sec-WebSocket-Key fehlt"))
		return
	}

	hj, ok2 := w.(http.Hijacker)
	if !ok2 {
		writeErr(w, 500, fmt.Errorf("Hijacker nicht verfügbar"))
		return
	}
	conn, bufrw, err := hj.Hijack()
	if err != nil {
		return
	}
	defer conn.Close()

	accept := wsAcceptKey(key)
	// Subprotocol "binary" wird von noVNC erwartet
	_, _ = fmt.Fprintf(bufrw,
		"HTTP/1.1 101 Switching Protocols\r\n"+
			"Upgrade: websocket\r\n"+
			"Connection: Upgrade\r\n"+
			"Sec-WebSocket-Accept: %s\r\n"+
			"Sec-WebSocket-Protocol: binary\r\n\r\n",
		accept,
	)
	_ = bufrw.Flush()

	// ─── VNC TCP-Verbindung ───────────────────────────────────────────────────
	vncConn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", vncPort), 5*time.Second)
	if err != nil {
		slog.Error("VNC dial", "err", err)
		return
	}
	defer vncConn.Close()

	// ─── Bidirektionale Bridge ────────────────────────────────────────────────
	// WS → VNC: Frames lesen, demaskieren, als Bytes an VNC senden
	// VNC → WS: Bytes lesen, als Binary-Frames wrappen, an Client senden
	done := make(chan struct{}, 2)
	go func() {
		defer func() { done <- struct{}{} }()
		wsBufRd := bufio.NewReader(conn)
		for {
			payload, err := wsReadFrame(wsBufRd)
			if err != nil {
				return
			}
			if _, err := vncConn.Write(payload); err != nil {
				return
			}
		}
	}()
	go func() {
		defer func() { done <- struct{}{} }()
		buf := make([]byte, 32*1024)
		for {
			n, err := vncConn.Read(buf)
			if err != nil {
				return
			}
			if err := wsWriteFrame(conn, buf[:n]); err != nil {
				return
			}
		}
	}()
	<-done
}

// wsAcceptKey berechnet den Sec-WebSocket-Accept-Wert (RFC 6455 §4.2.2).
func wsAcceptKey(key string) string {
	const magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	h := sha1.New()
	h.Write([]byte(key + magic))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

// wsReadFrame liest einen einzelnen WebSocket-Frame und gibt die demaskierte
// Nutzlast zurück (nur Binary/Text-Frames; Ping/Close werden still ignoriert).
func wsReadFrame(r io.Reader) ([]byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, err
	}
	// opcode := header[0] & 0x0f
	masked := header[1]&0x80 != 0
	payloadLen := int64(header[1] & 0x7f)

	switch payloadLen {
	case 126:
		ext := make([]byte, 2)
		if _, err := io.ReadFull(r, ext); err != nil {
			return nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint16(ext))
	case 127:
		ext := make([]byte, 8)
		if _, err := io.ReadFull(r, ext); err != nil {
			return nil, err
		}
		payloadLen = int64(binary.BigEndian.Uint64(ext))
	}

	var maskKey [4]byte
	if masked {
		if _, err := io.ReadFull(r, maskKey[:]); err != nil {
			return nil, err
		}
	}
	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}
	if masked {
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}
	}
	return payload, nil
}

// wsWriteFrame schreibt einen Binary-Frame (opcode=2, FIN=1, keine Maskierung).
func wsWriteFrame(w io.Writer, payload []byte) error {
	n := len(payload)
	var header []byte
	switch {
	case n <= 125:
		header = []byte{0x82, byte(n)}
	case n <= 65535:
		header = []byte{0x82, 126, byte(n >> 8), byte(n)}
	default:
		header = []byte{0x82, 127,
			0, 0, 0, 0,
			byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n),
		}
	}
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func (s *Server) handleCloneVm(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var body struct {
		TargetName string `json:"targetName"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeErr(w, 400, err)
		return
	}
	if !virt.ValidName(body.TargetName) {
		writeErr(w, 400, fmt.Errorf("ungültiger targetName"))
		return
	}
	if err := s.virt.CloneVM(name, body.TargetName, s.store.ImagesDir); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 201, map[string]string{"status": "cloned", "name": body.TargetName})
}

func (s *Server) handleMountIso(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var body struct {
		IsoURL  string `json:"isoUrl"`
		IsoPath string `json:"isoPath"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeErr(w, 400, err)
		return
	}
	var isoPath string
	switch {
	case body.IsoPath != "":
		if !strings.HasPrefix(body.IsoPath, s.store.IsosDir+"/") {
			writeErr(w, 400, fmt.Errorf("isoPath außerhalb des iso-verzeichnisses"))
			return
		}
		isoPath = body.IsoPath
	case body.IsoURL != "":
		p, err := s.store.EnsureISO(body.IsoURL)
		if err != nil {
			writeErr(w, 500, err)
			return
		}
		isoPath = p
	default:
		writeErr(w, 400, fmt.Errorf("isoUrl oder isoPath erforderlich"))
		return
	}
	if err := s.virt.MountISO(name, isoPath); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]string{"status": "mounted"})
}

func (s *Server) handleUnmountIso(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	if err := s.virt.UnmountISO(name); err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]string{"status": "unmounted"})
}

func (s *Server) handleRestoreVm(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var body struct {
		BackupFiles []string `json:"backupFiles"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body); err != nil {
		writeErr(w, 400, err)
		return
	}
	if len(body.BackupFiles) == 0 {
		writeErr(w, 400, fmt.Errorf("backupFiles erforderlich"))
		return
	}
	for _, bf := range body.BackupFiles {
		if !strings.HasPrefix(bf, "/var/lib/vcp/") && !strings.HasPrefix(bf, s.store.ImagesDir+"/") {
			writeErr(w, 400, fmt.Errorf("backupFile außerhalb des erlaubten Pfads: %s", bf))
			return
		}
	}
	_ = s.virt.Stop(name, true)
	diskPaths, err := s.virt.DiskPaths(name)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	if len(diskPaths) != len(body.BackupFiles) {
		writeErr(w, 400, fmt.Errorf("anzahl backup-dateien (%d) stimmt nicht mit disks (%d) überein",
			len(body.BackupFiles), len(diskPaths)))
		return
	}
	for i, bf := range body.BackupFiles {
		cmd := exec.Command(qemuImgBin, "convert", "-f", "qcow2", "-O", "qcow2", bf, diskPaths[i])
		if out, err := cmd.CombinedOutput(); err != nil {
			writeErr(w, 500, fmt.Errorf("restore disk %d: %s: %w", i, out, err))
			return
		}
	}
	if err := s.virt.Start(name); err != nil {
		writeErr(w, 500, fmt.Errorf("VM starten nach Restore: %w", err))
		return
	}
	writeJSON(w, 200, map[string]string{"status": "restored"})
}

func (s *Server) handleMigrateVm(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	var body struct {
		Mode       string `json:"mode"`
		TargetHost string `json:"targetHost"`
		TargetUser string `json:"targetUser"`
		TargetDir  string `json:"targetDir"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		writeErr(w, 400, err)
		return
	}
	if !validHostname(body.TargetHost) {
		writeErr(w, 400, fmt.Errorf("ungültiger targetHost"))
		return
	}
	user := "root"
	if body.TargetUser != "" {
		if !validAlphanumDash(body.TargetUser) {
			writeErr(w, 400, fmt.Errorf("ungültiger targetUser"))
			return
		}
		user = body.TargetUser
	}
	targetDir := s.store.ImagesDir
	if body.TargetDir != "" {
		if strings.ContainsAny(body.TargetDir, ";|&`$(){}") {
			writeErr(w, 400, fmt.Errorf("ungültiger targetDir"))
			return
		}
		targetDir = body.TargetDir
	}

	if body.Mode == "live" {
		dstURI := fmt.Sprintf("qemu+ssh://%s@%s/system", user, body.TargetHost)
		cmd := exec.Command(virshBin, "migrate", "--live", "--persistent",
			"--undefinesource", name, dstURI)
		if out, err := cmd.CombinedOutput(); err != nil {
			writeErr(w, 500, fmt.Errorf("live-migration: %s: %w", out, err))
			return
		}
		writeJSON(w, 200, map[string]string{"status": "migrated"})
		return
	}

	// Offline-Migration
	diskPaths, err := s.virt.DiskPaths(name)
	if err != nil {
		writeErr(w, 404, err)
		return
	}
	if err := s.virt.Stop(name, false); err != nil {
		writeErr(w, 500, fmt.Errorf("VM stoppen: %w", err))
		return
	}
	remote := fmt.Sprintf("%s@%s:%s", user, body.TargetHost, targetDir)
	for _, disk := range diskPaths {
		cmd := exec.Command(rsyncBin, "-az",
			"-e", "/usr/bin/ssh -o StrictHostKeyChecking=accept-new",
			disk, remote+"/")
		if out, err := cmd.CombinedOutput(); err != nil {
			writeErr(w, 500, fmt.Errorf("rsync %s: %s: %w", disk, out, err))
			return
		}
	}
	xmlStr, err := s.virt.ExportXML(name)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"status":    "migrated",
		"xml":       xmlStr,
		"diskPaths": diskPaths,
	})
}

func (s *Server) handleCreateContainer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Template string `json:"template"`
		MemoryMB int    `json:"memoryMb"`
		CPUs     int    `json:"cpus"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		writeErr(w, 400, err)
		return
	}
	if !virt.ValidName(req.Name) {
		writeErr(w, 400, fmt.Errorf("ungültiger container-name"))
		return
	}
	parts := strings.SplitN(req.Template, ":", 2)
	if len(parts) != 2 || !validAlphanumDash(parts[0]) || !validAlphanumDash(parts[1]) {
		writeErr(w, 400, fmt.Errorf("ungültiges template-format (erwartet 'distro:release')"))
		return
	}
	if req.MemoryMB < 64 {
		req.MemoryMB = 512
	}
	if req.CPUs < 1 {
		req.CPUs = 1
	}
	if err := execCmd(lxcCreateBin, "-n", req.Name, "-t", "download", "--",
		"-d", parts[0], "-r", parts[1], "-a", "amd64"); err != nil {
		writeErr(w, 500, fmt.Errorf("lxc-create: %w", err))
		return
	}
	cfgPath := filepath.Join("/var/lib/lxc", req.Name, "config")
	if f, err := os.OpenFile(cfgPath, os.O_APPEND|os.O_WRONLY, 0o600); err == nil {
		fmt.Fprintf(f, "\nlxc.cgroup2.memory.max = %dM\n", req.MemoryMB)
		fmt.Fprintf(f, "lxc.cgroup2.cpuset.cpus = 0-%d\n", req.CPUs-1)
		f.Close()
	}
	if err := execCmd(lxcStartBin, "-n", req.Name); err != nil {
		writeErr(w, 500, fmt.Errorf("lxc-start: %w", err))
		return
	}
	writeJSON(w, 201, map[string]string{"status": "running", "name": req.Name})
}

func (s *Server) handleDeleteContainer(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	_ = execCmd(lxcStopBin, "-n", name, "-k")
	if err := execCmd(lxcDestroyBin, "-n", name); err != nil {
		writeErr(w, 500, fmt.Errorf("lxc-destroy: %w", err))
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

type pciDeviceInfo struct {
	Address string `json:"address"`
	Vendor  string `json:"vendor"`
	Device  string `json:"device"`
	Class   string `json:"class"`
	Driver  string `json:"driver"`
}

func (s *Server) handleListPciDevices(w http.ResponseWriter, _ *http.Request) {
	entries, err := os.ReadDir("/sys/bus/pci/devices")
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	var devices []pciDeviceInfo
	for _, e := range entries {
		addr := e.Name()
		base := "/sys/bus/pci/devices/" + addr
		driverLink, _ := os.Readlink(base + "/driver")
		driver := filepath.Base(driverLink)
		if driver == "." {
			driver = ""
		}
		devices = append(devices, pciDeviceInfo{
			Address: addr,
			Vendor:  readSysFsHex(base + "/vendor"),
			Device:  readSysFsHex(base + "/device"),
			Class:   readSysFsHex(base + "/class"),
			Driver:  driver,
		})
	}
	writeJSON(w, 200, map[string]any{"devices": devices})
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (s *Server) vmAction(fn func(name string, body map[string]any) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if !virt.ValidName(name) {
			writeErr(w, 400, fmt.Errorf("ungültiger name"))
			return
		}
		var body map[string]any
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&body)
		if err := fn(name, body); err != nil {
			writeErr(w, 500, err)
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	}
}

func validBridge(name string) bool {
	return len(name) > 0 && len(name) <= 15 && !strings.ContainsAny(name, " /\\'\"`$;")
}

func validMac(mac string) bool {
	if len(mac) != 17 {
		return false
	}
	for i, c := range mac {
		if (i+1)%3 == 0 {
			if c != ':' {
				return false
			}
		} else if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
			return false
		}
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	slog.Warn("request fehlgeschlagen", "code", code, "err", err)
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

// execCmd führt einen externen Befehl mit festem Binärpfad aus (kein Shell-Aufruf).
func execCmd(bin string, args ...string) error {
	out, err := exec.Command(bin, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s: %w", filepath.Base(bin), strings.TrimSpace(string(out)), err)
	}
	return nil
}

func (s *Server) containerAction(fn func(name string, body map[string]any) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if !virt.ValidName(name) {
			writeErr(w, 400, fmt.Errorf("ungültiger name"))
			return
		}
		var body map[string]any
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
		if err := fn(name, body); err != nil {
			writeErr(w, 500, err)
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	}
}

func validHostname(h string) bool {
	if h == "" || len(h) > 253 {
		return false
	}
	for _, c := range h {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '.' || c == '-') {
			return false
		}
	}
	return true
}

func validAlphanumDash(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func readSysFsHex(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}
