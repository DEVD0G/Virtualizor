// Package metrics liest Host-Ressourcen aus /proc.
package metrics

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type HostMetrics struct {
	CPUPercent float64        `json:"cpuPercent"`
	MemUsedMb  int            `json:"memUsedMb"`
	DiskUsedGb map[string]int `json:"diskUsedGb"`
}

type Collector struct {
	mu        sync.Mutex
	lastIdle  uint64
	lastTotal uint64
}

func (c *Collector) CPUCores() int { return runtime.NumCPU() }

func (c *Collector) MemoryTotalMb() int {
	total, _ := readMeminfo()
	return total
}

func (c *Collector) Collect() HostMetrics {
	total, avail := readMeminfo()
	return HostMetrics{
		CPUPercent: c.cpuPercent(),
		MemUsedMb:  total - avail,
		DiskUsedGb: map[string]int{},
	}
}

func (c *Collector) cpuPercent() float64 {
	idle, total := readCPUStat()
	c.mu.Lock()
	defer c.mu.Unlock()
	dIdle := float64(idle - c.lastIdle)
	dTotal := float64(total - c.lastTotal)
	c.lastIdle, c.lastTotal = idle, total
	if dTotal <= 0 {
		return 0
	}
	return (1 - dIdle/dTotal) * 100
}

func readCPUStat() (idle, total uint64) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	if scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		for i, v := range fields[1:] {
			n, _ := strconv.ParseUint(v, 10, 64)
			total += n
			if i == 3 { // idle
				idle = n
			}
		}
	}
	return idle, total
}

func readMeminfo() (totalMb, availMb int) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		kb, _ := strconv.Atoi(fields[1])
		switch {
		case strings.HasPrefix(line, "MemTotal:"):
			totalMb = kb / 1024
		case strings.HasPrefix(line, "MemAvailable:"):
			availMb = kb / 1024
		}
	}
	return totalMb, availMb
}

// Tick liefert die erste CPU-Messung nach kurzem Warmup.
func (c *Collector) Warmup() {
	c.cpuPercent()
	time.Sleep(500 * time.Millisecond)
}
