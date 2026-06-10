// Package firewall rendert VM-Firewall-Regeln als nftables-Bridge-Filter.
// Jede VM bekommt eine eigene Chain im Table "bridge vcp-firewall".
// Änderungen an einer VM-Chain sind atomar (flush + re-add via `nft -f -`).
package firewall

import (
	"fmt"
	"os/exec"
	"strings"
)

const (
	nftBin      = "/usr/sbin/nft"
	nftTable    = "vcp-firewall"
	nftFwdChain = "FORWARD"
)

// Rule beschreibt eine Firewall-Regel (gespiegelt vom Backend-JSON).
type Rule struct {
	Direction string `json:"direction"` // in | out
	Action    string `json:"action"`    // accept | drop
	Protocol  string `json:"protocol"`  // tcp | udp | icmp | any
	PortFrom  int    `json:"portFrom"`
	PortTo    int    `json:"portTo"`
	CIDR      string `json:"cidr"`
	Priority  int    `json:"priority"`
}

// Apply wendet die übergebenen Regeln für eine VM (identifiziert durch ihre MAC-Adresse) an.
// Bestehende Regeln dieser VM werden atomar ersetzt.
func Apply(vmName, mac string, rules []Rule) error {
	chain := vmChain(vmName)

	// Schritt 1: Tabelle und FORWARD-Chain sicherstellen (idempotent).
	infraScript := fmt.Sprintf(
		"add table bridge %s\nadd chain bridge %s %s { type filter hook forward priority 0; policy accept; }\nadd chain bridge %s %s\n",
		nftTable, nftTable, nftFwdChain, nftTable, chain,
	)
	// Fehler hier ignorieren (Tabellen / Chains existieren bereits).
	infra := exec.Command(nftBin, "-f", "-")
	infra.Stdin = strings.NewReader(infraScript)
	_ = infra.Run()

	// Schritt 2: Jump-Regel von FORWARD → VM-Chain nur einmalig einfügen.
	listOut, _ := exec.Command(nftBin, "list", "chain", "bridge", nftTable, nftFwdChain).Output()
	if !strings.Contains(string(listOut), "jump "+chain) {
		_ = exec.Command(nftBin, "add", "rule", "bridge", nftTable, nftFwdChain, "jump", chain).Run()
	}

	// Schritt 3: VM-Chain leeren und neue Regeln atomisch einfügen.
	var script strings.Builder
	script.WriteString(fmt.Sprintf("flush chain bridge %s %s\n", nftTable, chain))

	for _, r := range rules {
		line := buildRule(r, mac)
		if line != "" {
			script.WriteString(fmt.Sprintf("add rule bridge %s %s %s\n", nftTable, chain, line))
		}
	}
	// Implizites Drop am Ende der Inbound-Kette, falls mindestens eine in-Regel existiert.
	hasIn  := false
	hasOut := false
	for _, r := range rules {
		if r.Direction == "in"  { hasIn = true }
		if r.Direction == "out" { hasOut = true }
	}
	if hasIn {
		script.WriteString(fmt.Sprintf(
			"add rule bridge %s %s ether daddr %s drop\n", nftTable, chain, mac))
	}
	if hasOut {
		script.WriteString(fmt.Sprintf(
			"add rule bridge %s %s ether saddr %s drop\n", nftTable, chain, mac))
	}

	apply := exec.Command(nftBin, "-f", "-")
	apply.Stdin = strings.NewReader(script.String())
	if out, err := apply.CombinedOutput(); err != nil {
		return fmt.Errorf("nft apply: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// Flush entfernt alle Regeln aus der VM-Chain (beim Löschen einer VM).
func Flush(vmName string) error {
	chain := vmChain(vmName)
	// Chain leeren — falls sie nicht existiert, ist das ok.
	_ = exec.Command(nftBin, "flush", "chain", "bridge", nftTable, chain).Run()
	_ = exec.Command(nftBin, "delete", "chain", "bridge", nftTable, chain).Run()
	return nil
}

func vmChain(vmName string) string { return "vcp-" + vmName }

func buildRule(r Rule, mac string) string {
	if r.Direction != "in" && r.Direction != "out" {
		return ""
	}
	if r.Action != "accept" && r.Action != "drop" {
		return ""
	}

	var parts []string

	// MAC-Richtungs-Match (Layer 2 Bridge-Filter).
	if r.Direction == "in" {
		parts = append(parts, "ether daddr "+mac)
	} else {
		parts = append(parts, "ether saddr "+mac)
	}

	// CIDR-Match auf Layer 3.
	if r.CIDR != "" && r.CIDR != "0.0.0.0/0" {
		if r.Direction == "in" {
			parts = append(parts, "ip saddr "+r.CIDR)
		} else {
			parts = append(parts, "ip daddr "+r.CIDR)
		}
	}

	// Protokoll + Port.
	switch r.Protocol {
	case "tcp", "udp":
		parts = append(parts, r.Protocol)
		if r.PortFrom > 0 {
			if r.PortTo > 0 && r.PortTo != r.PortFrom {
				parts = append(parts, fmt.Sprintf("dport %d-%d", r.PortFrom, r.PortTo))
			} else {
				parts = append(parts, fmt.Sprintf("dport %d", r.PortFrom))
			}
		}
	case "icmp":
		parts = append(parts, "ip protocol icmp")
	}

	parts = append(parts, r.Action)
	return strings.Join(parts, " ")
}
