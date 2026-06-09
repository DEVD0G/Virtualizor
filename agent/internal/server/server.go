// Package server implementiert den mTLS-HTTP-Server des Agents.
//
// Sicherheitsmodell: Die API-Oberfläche IST die Command-Whitelist — es gibt
// keinen generischen Exec-Endpoint. Jeder Handler validiert seine Inputs
// strikt, bevor irgendetwas den Host berührt.
package server

import (
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/devd0g/virtualizor/agent/internal/config"
	"github.com/devd0g/virtualizor/agent/internal/metrics"
	"github.com/devd0g/virtualizor/agent/internal/storage"
	"github.com/devd0g/virtualizor/agent/internal/virt"
)

type Server struct {
	cfg       *config.Config
	virt      *virt.Manager
	store     *storage.Store
	collector *metrics.Collector
}

func New(cfg *config.Config, vm *virt.Manager, store *storage.Store, col *metrics.Collector) *Server {
	return &Server{cfg: cfg, virt: vm, store: store, collector: col}
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
	mux.HandleFunc("POST /v1/console-token", s.handleConsoleToken)

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
	Name     string `json:"name"`
	VCPUs    int    `json:"vcpus"`
	MemoryMB int    `json:"memoryMb"`
	Disks    []struct {
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

	spec := virt.DomainSpec{Name: req.Name, VCPUs: req.VCPUs, MemoryMB: req.MemoryMB}

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
	writeJSON(w, 200, map[string]string{"status": "deleted"})
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

// handleConsoleToken erzeugt ein kurzlebiges Token für den VNC-Proxy (Phase 1:
// Token-Erzeugung; der WebSocket-Proxy folgt mit der noVNC-Einbettung).
func (s *Server) handleConsoleToken(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
	name, _ := body["vmName"].(string)
	if !virt.ValidName(name) {
		writeErr(w, 400, fmt.Errorf("ungültiger name"))
		return
	}
	buf := make([]byte, 24)
	_, _ = rand.Read(buf)
	writeJSON(w, 200, map[string]any{
		"token":     hex.EncodeToString(buf),
		"expiresIn": 60,
	})
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
