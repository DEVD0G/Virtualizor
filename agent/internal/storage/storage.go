// Package storage verwaltet qcow2-Volumes, Template-Caching und cloud-init
// Seed-ISOs. Externe Tools werden ausschließlich mit festem Binärpfad und
// Argument-Array gestartet — niemals über eine Shell.
package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	qemuImgBin     = "/usr/bin/qemu-img"
	genisoimageBin = "/usr/bin/genisoimage"
)

type Store struct {
	ImagesDir    string
	IsosDir      string
	CloudInitDir string
}

// safePath stellt sicher, dass der Zielpfad unterhalb von root liegt.
func safePath(root, name string) (string, error) {
	p := filepath.Clean(filepath.Join(root, name))
	if !strings.HasPrefix(p, filepath.Clean(root)+string(os.PathSeparator)) {
		return "", fmt.Errorf("pfad außerhalb des storage-roots")
	}
	return p, nil
}

// EnsureTemplate lädt ein Cloud-Image in den Cache (einmalig) und prüft die
// SHA-256-Checksumme, falls angegeben.
func (s *Store) EnsureTemplate(url, sha string) (string, error) {
	sum := sha256.Sum256([]byte(url))
	cached, err := safePath(s.IsosDir, "template-"+hex.EncodeToString(sum[:8])+".img")
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(cached); err == nil {
		return cached, nil
	}

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("template-download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("template-download: HTTP %d", resp.StatusCode)
	}

	tmp := cached + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(f, h), resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return "", err
	}
	f.Close()
	if sha != "" && hex.EncodeToString(h.Sum(nil)) != strings.ToLower(sha) {
		os.Remove(tmp)
		return "", fmt.Errorf("template-checksumme stimmt nicht")
	}
	return cached, os.Rename(tmp, cached)
}

// EnsureISO lädt ein ISO-Image in den Cache (einmalig) und gibt den lokalen Pfad zurück.
func (s *Store) EnsureISO(url string) (string, error) {
	sum := sha256.Sum256([]byte(url))
	cached, err := safePath(s.IsosDir, "iso-"+hex.EncodeToString(sum[:8])+".iso")
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(cached); err == nil {
		return cached, nil
	}
	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("iso-download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("iso-download: HTTP %d", resp.StatusCode)
	}
	tmp := cached + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return "", err
	}
	f.Close()
	return cached, os.Rename(tmp, cached)
}

// CreateVolume legt ein qcow2-Volume an; mit Template als Backing-File
// (Copy-on-Write) oder leer.
func (s *Store) CreateVolume(name string, sizeGb int, templatePath string) (string, error) {
	path, err := safePath(s.ImagesDir, name+".qcow2")
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(path); err == nil {
		return path, nil // idempotent
	}
	size := fmt.Sprintf("%dG", sizeGb)
	var cmd *exec.Cmd
	if templatePath != "" {
		cmd = exec.Command(qemuImgBin, "create", "-f", "qcow2",
			"-F", "qcow2", "-b", templatePath, path, size)
	} else {
		cmd = exec.Command(qemuImgBin, "create", "-f", "qcow2", path, size)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("qemu-img: %s: %w", out, err)
	}
	return path, nil
}

// BackupVolume erstellt eine kompakte, eigenständige qcow2-Kopie eines Volumes
// im Zielverzeichnis. Gibt den Zielpfad und die Dateigröße zurück.
// Läuft auch bei laufender VM (QEMU COW sichert Konsistenz auf Blockebene).
func (s *Store) BackupVolume(sourcePath, targetDir, filename string) (string, int64, error) {
	if err := os.MkdirAll(targetDir, 0o750); err != nil {
		return "", 0, fmt.Errorf("backup-verzeichnis: %w", err)
	}
	outPath := filepath.Join(targetDir, filename)
	cmd := exec.Command(qemuImgBin, "convert", "-O", "qcow2", "-c", sourcePath, outPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", 0, fmt.Errorf("qemu-img convert: %s: %w", out, err)
	}
	fi, err := os.Stat(outPath)
	if err != nil {
		return "", 0, err
	}
	return outPath, fi.Size(), nil
}

func (s *Store) DeleteVolume(name string) error {
	path, err := safePath(s.ImagesDir, name+".qcow2")
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

type CloudInit struct {
	Hostname string   `json:"hostname"`
	SSHKeys  []string `json:"sshKeys"`
	UserData string   `json:"userData"`
	IP       string   `json:"ip"`
	Gateway  string   `json:"gateway"`
}

// BuildSeedISO erzeugt ein cloud-init NoCloud Seed-ISO für die VM.
func (s *Store) BuildSeedISO(vmName string, ci CloudInit) (string, error) {
	dir, err := safePath(s.CloudInitDir, vmName)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}

	userData := ci.UserData
	if userData == "" {
		var b strings.Builder
		b.WriteString("#cloud-config\n")
		if len(ci.SSHKeys) > 0 {
			b.WriteString("ssh_authorized_keys:\n")
			for _, k := range ci.SSHKeys {
				b.WriteString("  - " + strings.TrimSpace(k) + "\n")
			}
		}
		b.WriteString("package_update: true\n")
		userData = b.String()
	}
	metaData := fmt.Sprintf("instance-id: %s\nlocal-hostname: %s\n", vmName, ci.Hostname)

	if err := os.WriteFile(filepath.Join(dir, "user-data"), []byte(userData), 0o600); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, "meta-data"), []byte(metaData), 0o600); err != nil {
		return "", err
	}

	isoPath := filepath.Join(dir, "seed.iso")
	cmd := exec.Command(genisoimageBin, "-output", isoPath, "-volid", "cidata",
		"-joliet", "-rock", filepath.Join(dir, "user-data"), filepath.Join(dir, "meta-data"))
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("genisoimage: %s: %w", out, err)
	}
	return isoPath, nil
}

func (s *Store) DeleteSeed(vmName string) error {
	dir, err := safePath(s.CloudInitDir, vmName)
	if err != nil {
		return err
	}
	return os.RemoveAll(dir)
}
