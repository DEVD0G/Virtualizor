package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type TLS struct {
	Cert string `yaml:"cert"`
	Key  string `yaml:"key"`
	CA   string `yaml:"ca"`
}

type Storage struct {
	ImagesDir    string `yaml:"imagesDir"`
	IsosDir      string `yaml:"isosDir"`
	CloudInitDir string `yaml:"cloudInitDir"`
}

type Network struct {
	DefaultBridge string `yaml:"defaultBridge"`
}

type Config struct {
	NodeID                   string  `yaml:"nodeId"`
	PanelURL                 string  `yaml:"panelUrl"`
	ListenAddr               string  `yaml:"listenAddr"`
	TLS                      TLS     `yaml:"tls"`
	Storage                  Storage `yaml:"storage"`
	Network                  Network `yaml:"network"`
	HeartbeatIntervalSeconds int     `yaml:"heartbeatIntervalSeconds"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	cfg := &Config{ListenAddr: "0.0.0.0:8443", HeartbeatIntervalSeconds: 10}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	if cfg.NodeID == "" || cfg.PanelURL == "" {
		return nil, fmt.Errorf("nodeId und panelUrl sind erforderlich")
	}
	return cfg, nil
}
