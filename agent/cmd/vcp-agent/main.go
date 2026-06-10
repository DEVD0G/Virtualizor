// vcp-agent — VCP Node Agent (Data Plane)
//
// Läuft als systemd-Service auf jedem Hypervisor-Host. Exponiert eine
// minimale, typisierte mTLS-API für das Panel und meldet Heartbeats.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/devd0g/virtualizor/agent/internal/config"
	"github.com/devd0g/virtualizor/agent/internal/heartbeat"
	"github.com/devd0g/virtualizor/agent/internal/metrics"
	"github.com/devd0g/virtualizor/agent/internal/server"
	"github.com/devd0g/virtualizor/agent/internal/storage"
	"github.com/devd0g/virtualizor/agent/internal/virt"
)

func main() {
	configPath := flag.String("config", "/etc/vcp/agent.yaml", "Pfad zur Agent-Konfiguration")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		slog.Error("konfiguration laden fehlgeschlagen", "err", err)
		os.Exit(1)
	}

	vm, err := virt.New()
	if err != nil {
		slog.Error("libvirt-verbindung fehlgeschlagen", "err", err)
		os.Exit(1)
	}

	store := &storage.Store{
		ImagesDir:    cfg.Storage.ImagesDir,
		IsosDir:      cfg.Storage.IsosDir,
		CloudInitDir: cfg.Storage.CloudInitDir,
	}
	for _, dir := range []string{store.ImagesDir, store.IsosDir, store.CloudInitDir} {
		if err := os.MkdirAll(dir, 0o711); err != nil {
			slog.Error("storage-verzeichnis", "dir", dir, "err", err)
			os.Exit(1)
		}
	}

	collector := &metrics.Collector{}
	collector.Warmup()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	reporter, err := heartbeat.New(cfg, vm, collector)
	if err != nil {
		slog.Error("heartbeat-init fehlgeschlagen", "err", err)
		os.Exit(1)
	}
	go reporter.Run(ctx)

	srv := server.New(cfg, vm, store, collector)
	if err := srv.ListenAndServe(); err != nil {
		slog.Error("server beendet", "err", err)
		os.Exit(1)
	}
}
