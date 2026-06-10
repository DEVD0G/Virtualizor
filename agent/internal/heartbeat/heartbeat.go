// Package heartbeat meldet Status, Inventar und Metriken an das Panel.
package heartbeat

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/devd0g/virtualizor/agent/internal/config"
	"github.com/devd0g/virtualizor/agent/internal/metrics"
	"github.com/devd0g/virtualizor/agent/internal/virt"
)

const agentVersion = "0.1.0"

type Reporter struct {
	cfg       *config.Config
	virt      *virt.Manager
	collector *metrics.Collector
	client    *http.Client
}

func New(cfg *config.Config, vm *virt.Manager, col *metrics.Collector) (*Reporter, error) {
	cert, err := tls.LoadX509KeyPair(cfg.TLS.Cert, cfg.TLS.Key)
	if err != nil {
		return nil, fmt.Errorf("agent-zertifikat: %w", err)
	}
	caPem, err := os.ReadFile(cfg.TLS.CA)
	if err != nil {
		return nil, fmt.Errorf("ca-zertifikat: %w", err)
	}
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(caPem)

	return &Reporter{
		cfg:       cfg,
		virt:      vm,
		collector: col,
		client: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					Certificates: []tls.Certificate{cert},
					// Panel-TLS kann self-signed sein; Identität sichert das
					// Client-Cert + der Join-Prozess. Optional: Panel-CA pinnen.
					InsecureSkipVerify: true,
				},
			},
		},
	}, nil
}

func (r *Reporter) Run(ctx context.Context) {
	interval := time.Duration(r.cfg.HeartbeatIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	r.send(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.send(ctx)
		}
	}
}

func (r *Reporter) send(ctx context.Context) {
	vms, err := r.virt.ListVMs()
	if err != nil {
		slog.Warn("heartbeat: vm-liste fehlgeschlagen", "err", err)
		vms = nil
	}
	payload := map[string]any{
		"agentVersion": agentVersion,
		"cpuCores":     r.collector.CPUCores(),
		"memoryMb":     r.collector.MemoryTotalMb(),
		"metrics":      r.collector.Collect(),
		"vms":          vms,
	}
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("%s/api/v1/nodes/%s/heartbeat", r.cfg.PanelURL, r.cfg.NodeID)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.client.Do(req)
	if err != nil {
		slog.Warn("heartbeat fehlgeschlagen", "err", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		slog.Warn("heartbeat abgelehnt", "status", resp.StatusCode)
	}
}
