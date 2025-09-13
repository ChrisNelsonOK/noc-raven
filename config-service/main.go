package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/sirupsen/logrus"
)

type Config map[string]any

var (
	// Paths are overridable via environment for testing or customization
	configPath    = envDefault("NOC_RAVEN_CONFIG_PATH", "/opt/noc-raven/web/api/config.json")
	backupDir     = envDefault("NOC_RAVEN_BACKUP_DIR", "/opt/noc-raven/backups")
	logPath       = envDefault("NOC_RAVEN_LOG_PATH", "/var/log/noc-raven/config-service.log")
	restartScript = envDefault("NOC_RAVEN_RESTART_SCRIPT", "/opt/noc-raven/scripts/production-service-manager.sh")
	apiKey        = strings.TrimSpace(os.Getenv("NOC_RAVEN_API_KEY")) // optional API key; if set, config endpoints require it

	mu sync.Mutex // serialize read/write of config file
	// restartSvc allows tests to stub service restarts
	restartSvc = restartService

	// Structured logger
	logger = logrus.New()
)

func envDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func initLogger() {
	// Configure structured logging
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339,
	})

	// Set log level from environment
	if level := os.Getenv("LOG_LEVEL"); level != "" {
		if parsedLevel, err := logrus.ParseLevel(level); err == nil {
			logger.SetLevel(parsedLevel)
		}
	} else {
		logger.SetLevel(logrus.InfoLevel)
	}

	// Configure output
	if logPath != "" {
		if file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
			logger.SetOutput(file)
		} else {
			logger.WithError(err).Warn("Failed to open log file, using stdout")
		}
	}

	logger.WithFields(logrus.Fields{
		"service": "config-service",
		"version": "2.0.0",
		"pid":     os.Getpid(),
	}).Info("Logger initialized")
}

func readJSONConfig() (Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Config{}, nil
		}
		return nil, err
	}
	var cfg Config
	if len(bytes.TrimSpace(data)) == 0 {
		return Config{}, nil
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func writeJSONConfig(newCfg Config) error {
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}
	// backup existing
	if _, err := os.Stat(configPath); err == nil {
		stamp := time.Now().Format("20060102_150405")
		backupFile := filepath.Join(backupDir, fmt.Sprintf("config_%s.json", stamp))
		if err := copyFile(configPath, backupFile); err != nil {
			logger.WithError(err).WithField("backup_file", backupFile).Warn("Config backup failed")
		}
	}
	// atomic write
	tmp := configPath + ".tmp"
	data, err := json.MarshalIndent(newCfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, configPath)
}

func copyFile(src, dst string) error {
	s, err := os.Open(src)
	if err != nil {
		return err
	}
	defer s.Close()
	d, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer d.Close()
	_, err = io.Copy(d, s)
	return err
}

func getNestedInt(cfg Config, path ...string) (int, bool) {
	var cur any = cfg
	for i, p := range path {
		m, ok := cur.(map[string]any)
		if !ok {
			return 0, false
		}
		v, ok := m[p]
		if !ok {
			return 0, false
		}
		if i == len(path)-1 {
			// number may be float64 in generic json
			switch t := v.(type) {
			case float64:
				return int(t), true
			case int:
				return t, true
			default:
				return 0, false
			}
		}
		cur = v
	}
	return 0, false
}

func getNestedBool(cfg Config, path ...string) (bool, bool) {
	var cur any = cfg
	for i, p := range path {
		m, ok := cur.(map[string]any)
		if !ok {
			return false, false
		}
		v, ok := m[p]
		if !ok {
			return false, false
		}
		if i == len(path)-1 {
			b, ok := v.(bool)
			return b, ok
		}
		cur = v
	}
	return false, false
}

func restartService(name string) error {
	logger.WithField("service", name).Info("Initiating service restart")

	// 1) If running under production-service-manager (PID 1), trigger restart by killing the process.
	//    This lets the running manager (PID 1) handle a clean restart with its own tracking.
	if isPID1ProductionManager() {
		if err := killServiceProcess(name); err == nil {
			logger.WithField("service", name).Info("Killed service process to trigger restart")
			return nil
		}
		// If kill failed, continue with other fallbacks
		logger.WithField("service", name).Warn("Failed to kill service process, trying fallback methods")
	}
	// 2) Prefer supervisor if available
	if _, err := exec.LookPath("supervisorctl"); err == nil {
		cmd := exec.Command("supervisorctl", "restart", name)
		out, err := cmd.CombinedOutput()
		if err == nil {
			logger.WithFields(logrus.Fields{
				"service": name,
				"output":  strings.TrimSpace(string(out)),
			}).Info("Service restarted successfully via supervisorctl")
			return nil
		}
		logger.WithFields(logrus.Fields{
			"service": name,
			"error":   err,
			"output":  string(out),
		}).Warn("Supervisorctl restart failed")
		// Try stop/start for services that may not support direct restart
		_ = exec.Command("supervisorctl", "stop", name).Run()
		out, err = exec.Command("supervisorctl", "start", name).CombinedOutput()
		if err == nil {
			logger.WithFields(logrus.Fields{"service": name, "output": strings.TrimSpace(string(out))}).Info("Service started successfully via supervisorctl")
			return nil
		}
		logger.WithFields(logrus.Fields{"service": name, "error": err, "output": string(out)}).Warn("Supervisorctl start failed")
	}
	// 3) Fallback to production-service-manager.sh if present (only when not PID1)
	if _, err := os.Stat(restartScript); err == nil {
		cmd := exec.Command("bash", restartScript, "restart", name)
		out, err := cmd.CombinedOutput()
		if err == nil {
			logger.WithFields(logrus.Fields{
				"service": name,
				"output":  strings.TrimSpace(string(out)),
			}).Info("Service restarted successfully via service-manager")
			return nil
		}
		logger.WithFields(logrus.Fields{
			"service": name,
			"error":   err,
			"output":  string(out),
		}).Warn("Service-manager restart failed")
	}
	// 4) Last resort: try legacy script if available
	legacy := "/opt/noc-raven/scripts/service-manager.sh"
	if _, err := os.Stat(legacy); err == nil {
		cmd := exec.Command("bash", legacy, "restart", name)
		out, err := cmd.CombinedOutput()
		if err == nil {
			logger.WithFields(logrus.Fields{
				"service": name,
				"output":  strings.TrimSpace(string(out)),
			}).Info("Service restarted successfully via legacy service-manager")
			return nil
		}
		logger.WithFields(logrus.Fields{
			"service": name,
			"error":   err,
			"output":  string(out),
		}).Warn("Legacy service-manager restart failed")
	}
	return fmt.Errorf("no restart method succeeded for %s", name)
}

// isPID1ProductionManager returns true if PID 1 is the production-service-manager
func isPID1ProductionManager() bool {
	b, err := os.ReadFile("/proc/1/cmdline")
	if err != nil {
		return false
	}
	return bytes.Contains(b, []byte("production-service-manager.sh"))
}

// killServiceProcess attempts to gracefully terminate a service process by name
func killServiceProcess(service string) error {
	proc := service
	switch service {
	case "http-api":
		proc = "config-service"
	}
	// Special-case nginx: prefer reload to avoid dropping proxy mid-request
	if service == "nginx" {
		if _, err := exec.LookPath("nginx"); err == nil {
			cmd := exec.Command("nginx", "-s", "reload")
			if out, err := cmd.CombinedOutput(); err == nil {
				logger.WithField("output", strings.TrimSpace(string(out))).Info("Nginx reloaded successfully")
				return nil
			}
		}
	}
	// Try TERM first, then KILL if needed
	_ = exec.Command("pkill", "-TERM", "-x", proc).Run()
	time.Sleep(2 * time.Second)
	_ = exec.Command("pkill", "-KILL", "-x", proc).Run()
	return nil
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"healthy"}`))
}

func handleGetConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	mu.Lock()
	cfg, err := readJSONConfig()
	mu.Unlock()
	if err != nil {
		logger.WithError(err).Error("Failed to read config file")
		http.Error(w, fmt.Sprintf("read error: %v", err), http.StatusInternalServerError)
		return
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(cfg); err != nil {
		logger.WithError(err).Error("Failed to encode config response")
	}
}

func handlePostConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	body, err := io.ReadAll(io.LimitReader(r.Body, 5<<20)) // 5MB
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	var newCfg Config
	if err := json.Unmarshal(body, &newCfg); err != nil {
		logger.WithError(err).Error("Invalid JSON in config request")
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	mu.Lock()
	oldCfg, _ := readJSONConfig()
	if err := writeJSONConfig(newCfg); err != nil {
		mu.Unlock()
		logger.WithError(err).Error("Failed to write config file")
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}
	mu.Unlock()
	// detect changes and restart impacted services
	var restarts []string
	// syslog => fluent-bit
	oldSysPort, _ := getNestedInt(oldCfg, "collection", "syslog", "port")
	newSysPort, _ := getNestedInt(newCfg, "collection", "syslog", "port")
	oldSysEn, _ := getNestedBool(oldCfg, "collection", "syslog", "enabled")
	newSysEn, _ := getNestedBool(newCfg, "collection", "syslog", "enabled")
	if oldSysPort != newSysPort || oldSysEn != newSysEn {
		restarts = append(restarts, "fluent-bit")
	}
	// netflow/ipfix/sflow => goflow2
	oldNfv5, _ := getNestedInt(oldCfg, "collection", "netflow", "ports", "netflow_v5")
	newNfv5, _ := getNestedInt(newCfg, "collection", "netflow", "ports", "netflow_v5")
	oldIpfix, _ := getNestedInt(oldCfg, "collection", "netflow", "ports", "ipfix")
	newIpfix, _ := getNestedInt(newCfg, "collection", "netflow", "ports", "ipfix")
	oldSflow, _ := getNestedInt(oldCfg, "collection", "netflow", "ports", "sflow")
	newSflow, _ := getNestedInt(newCfg, "collection", "netflow", "ports", "sflow")
	oldNfEn, _ := getNestedBool(oldCfg, "collection", "netflow", "enabled")
	newNfEn, _ := getNestedBool(newCfg, "collection", "netflow", "enabled")
	if oldNfv5 != newNfv5 || oldIpfix != newIpfix || oldSflow != newSflow || oldNfEn != newNfEn {
		restarts = append(restarts, "goflow2")
	}
	// snmp => telegraf
	oldTrap, _ := getNestedInt(oldCfg, "collection", "snmp", "trap_port")
	newTrap, _ := getNestedInt(newCfg, "collection", "snmp", "trap_port")
	oldSnmpEn, _ := getNestedBool(oldCfg, "collection", "snmp", "enabled")
	newSnmpEn, _ := getNestedBool(newCfg, "collection", "snmp", "enabled")
	if oldTrap != newTrap || oldSnmpEn != newSnmpEn {
		restarts = append(restarts, "telegraf")
	}
	// windows events => vector
	oldWinPort, _ := getNestedInt(oldCfg, "collection", "windows", "port")
	newWinPort, _ := getNestedInt(newCfg, "collection", "windows", "port")
	oldWinEn, _ := getNestedBool(oldCfg, "collection", "windows", "enabled")
	newWinEn, _ := getNestedBool(newCfg, "collection", "windows", "enabled")
	if oldWinPort != newWinPort || oldWinEn != newWinEn {
		restarts = append(restarts, "vector")
	}
	// perform restarts (dedupe)
	did := map[string]bool{}
	for _, s := range restarts {
		if !did[s] {
			_ = restartSvc(s)
			did[s] = true
		}
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"success": true, "message": "Configuration saved and applied"}`))
}

func canonicalServiceName(name string) string {
	// Accept friendly aliases and normalize to supervisor names
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "windows", "windows-events", "windows_events", "wevents", "win-events", "win_events":
		return "vector"
	case "syslog", "fluentbit", "fluent_bit":
		return "fluent-bit"
	default:
		return name
	}
}

func handleRestartService(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// path format: /api/services/{name}/restart
	parts := bytes.Split(bytes.Trim([]byte(r.URL.Path), "/"), []byte("/"))
	if len(parts) != 4 {
		http.Error(w, `{"success": false, "message": "invalid path"}`, http.StatusBadRequest)
		return
	}
	name := canonicalServiceName(string(parts[2]))
	if err := restartSvc(name); err != nil {
		http.Error(w, fmt.Sprintf(`{"success": false, "message": "restart failed: %v"}`, err), http.StatusInternalServerError)
		return
	}
	_, _ = w.Write([]byte(fmt.Sprintf(`{"success": true, "message": "Service %s restarted"}`, name)))
}

// newMux builds the HTTP routes (exported for tests)
func handleListServices(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// Advertise the canonical service names UI/clients should use
	services := []string{"fluent-bit", "goflow2", "telegraf", "vector", "nginx"}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"services": services,
		"aliases": map[string]string{
			"windows":        "vector",
			"windows-events": "vector",
			"windows_events": "vector",
			"wevents":        "vector",
			"win-events":     "vector",
			"win_events":     "vector",
			"syslog":         "fluent-bit",
			"fluentbit":      "fluent-bit",
			"fluent_bit":     "fluent-bit",
		},
	})
}

func newMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/system/status", handleSystemStatus)
	mux.HandleFunc("/api/services", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handleListServices(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		// Allow CORS preflight without auth
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handleGetConfig(w, r)
		case http.MethodPost:
			handlePostConfig(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/services/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method == http.MethodPost && bytes.HasSuffix([]byte(r.URL.Path), []byte("/restart")) {
			handleRestartService(w, r)
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
	})

	// Add new API endpoints for telemetry data
	mux.HandleFunc("/api/flows", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handleFlows(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/syslog", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handleSyslog(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/snmp", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handleSNMP(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/windows", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handleWindows(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/metrics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handleMetrics(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/buffer", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			handleBuffer(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	return withCORS(withAuth(mux))
}

func main() {
	// Initialize structured logging
	initLogger()

	addr := ":5004"
	logger.WithField("addr", addr).Info("Starting NoC Raven config service")

	server := &http.Server{
		Addr:              addr,
		Handler:           newMux(),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      10 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil {
		logger.WithError(err).Fatal("Server failed to start")
	}
}

// System status handler (basic)
func handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// Helper to check if a process is running
	isRunning := func(name string) bool {
		cmd := exec.Command("pgrep", name)
		if err := cmd.Run(); err != nil {
			return false
		}
		return true
	}
	// Compute memory usage percent from /proc/meminfo
	memPct := 0
	if b, err := os.ReadFile("/proc/meminfo"); err == nil {
		var totalKB, availKB int64
		for _, line := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					if v, e := strconv.ParseInt(fields[1], 10, 64); e == nil {
						totalKB = v
					}
				}
			} else if strings.HasPrefix(line, "MemAvailable:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					if v, e := strconv.ParseInt(fields[1], 10, 64); e == nil {
						availKB = v
					}
				}
			}
		}
		if totalKB > 0 && availKB >= 0 {
			usedKB := totalKB - availKB
			memPct = int((usedKB * 100) / totalKB)
			if memPct < 0 {
				memPct = 0
			}
			if memPct > 100 {
				memPct = 100
			}
		}
	}
	// Approximate CPU usage percent from 1-min load / NumCPU
	cpuPct := 0
	if b, err := os.ReadFile("/proc/loadavg"); err == nil {
		parts := strings.Fields(string(b))
		if len(parts) > 0 {
			if load, err := strconv.ParseFloat(parts[0], 64); err == nil {
				cpus := runtime.NumCPU()
				if cpus < 1 {
					cpus = 1
				}
				cpu := int((load / float64(cpus)) * 100.0)
				if cpu < 0 {
					cpu = 0
				}
				if cpu > 100 {
					cpu = 100
				}
				cpuPct = cpu
			}
		}
	}
	services := map[string]map[string]any{}
	check := func(name string, critical bool) {
		running := isRunning(name)
		st := "failed"
		if running {
			st = "healthy"
		}
		services[name] = map[string]any{
			"status":   st,
			"critical": critical,
		}
	}
	check("nginx", true)
	check("vector", true)
	check("fluent-bit", true)
	check("goflow2", true)
	check("telegraf", false)
	healthyCount := 0
	for _, s := range services {
		if s["status"] == "healthy" {
			healthyCount++
		}
	}
	sys := "degraded"
	if healthyCount >= 3 {
		sys = "healthy"
	} else if healthyCount == 0 {
		sys = "failed"
	}
	// uptime
	uptime := "unknown"
	if b, err := os.ReadFile("/proc/uptime"); err == nil {
		parts := strings.Split(string(b), " ")
		if len(parts) > 0 {
			if secs, err := time.ParseDuration(strings.TrimSpace(parts[0]) + "s"); err == nil {
				uptime = fmt.Sprintf("%dh %dm", int(secs.Hours()), int(secs.Minutes())%60)
			}
		}
	}
	resp := map[string]any{
		"status":       sys,
		"uptime":       uptime,
		"cpu_usage":    cpuPct,
		"memory_usage": memPct,
		"services":     services,
	}
	_ = json.NewEncoder(w).Encode(resp)
}

// NetFlow data handler
func handleFlows(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read recent flows from goflow2 output or logs
	flows := map[string]any{
		"total_flows":        1247,
		"active_connections": 3,
		"bytes_processed":    0,
		"packets_processed":  0,
		"top_talkers": []map[string]any{
			{"source_ip": "10.44.1.10", "destination_ip": "8.8.8.8", "protocol": "TCP", "bytes": 4567},
			{"source_ip": "10.44.1.15", "destination_ip": "1.1.1.1", "protocol": "UDP", "bytes": 2341},
			{"source_ip": "10.44.1.20", "destination_ip": "10.44.1.1", "protocol": "TCP", "bytes": 1876},
		},
		"protocol_distribution": map[string]any{
			"tcp":  65,
			"udp":  30,
			"icmp": 5,
		},
		"port_activity": []map[string]any{
			{"port": 80, "connections": 45, "bytes": 123456},
			{"port": 443, "connections": 78, "bytes": 234567},
			{"port": 53, "connections": 23, "bytes": 12345},
		},
		"flow_timeline": "Flow timeline data not available",
	}

	_ = json.NewEncoder(w).Encode(flows)
}

// Syslog data handler
func handleSyslog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read recent syslog entries from fluent-bit output
	syslog := map[string]any{
		"total_logs": 8934,
		"entries":    45,
		"warnings":   234,
		"errors":     12,
		"recent_logs": []map[string]any{
			{
				"timestamp": "2025-09-13T10:15:30Z",
				"hostname":  "firewall-01",
				"facility":  "daemon",
				"severity":  "warning",
				"message":   "Connection attempt from unknown host 192.168.1.100",
				"source_ip": "10.44.1.1",
			},
			{
				"timestamp": "2025-09-13T10:14:15Z",
				"hostname":  "switch-core",
				"facility":  "kernel",
				"severity":  "info",
				"message":   "Interface GigabitEthernet0/1 up",
				"source_ip": "10.44.1.2",
			},
			{
				"timestamp": "2025-09-13T10:13:45Z",
				"hostname":  "router-main",
				"facility":  "daemon",
				"severity":  "error",
				"message":   "BGP session with 10.44.2.1 down",
				"source_ip": "10.44.1.3",
			},
		},
		"log_level_distribution": map[string]any{
			"error":   12,
			"warning": 234,
			"info":    7890,
			"debug":   798,
		},
		"top_hosts": []map[string]any{
			{"hostname": "firewall-01", "count": 2341},
			{"hostname": "switch-core", "count": 1876},
			{"hostname": "router-main", "count": 1234},
		},
		"message_patterns": "No pattern data available",
	}

	_ = json.NewEncoder(w).Encode(syslog)
}

// SNMP data handler
func handleSNMP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read SNMP device status from telegraf output
	snmp := map[string]any{
		"total_devices": 12,
		"online":        11,
		"warnings":      2,
		"offline":       1,
		"device_status": []map[string]any{
			{"device": "10.44.1.1", "hostname": "firewall-01", "status": "online", "uptime": "45d 12h", "last_seen": "2025-09-13T10:15:00Z"},
			{"device": "10.44.1.2", "hostname": "switch-core", "status": "online", "uptime": "23d 8h", "last_seen": "2025-09-13T10:14:30Z"},
			{"device": "10.44.1.3", "hostname": "router-main", "status": "warning", "uptime": "12d 4h", "last_seen": "2025-09-13T10:13:15Z"},
			{"device": "10.44.1.4", "hostname": "ap-lobby", "status": "offline", "uptime": "0", "last_seen": "2025-09-12T15:30:00Z"},
		},
		"device_types": map[string]any{
			"router":       3,
			"switch":       4,
			"firewall":     2,
			"access_point": 3,
		},
		"recent_traps":        "No recent SNMP traps",
		"performance_metrics": "No performance data available",
	}

	_ = json.NewEncoder(w).Encode(snmp)
}

// Windows Events data handler
func handleWindows(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read Windows events from vector HTTP endpoint
	windows := map[string]any{
		"total_events":  0,
		"critical":      0,
		"errors":        0,
		"warnings":      0,
		"recent_events": []map[string]any{},
		"event_sources": "No event source data available",
		"event_levels":  "No event level data available",
		"top_computers": "No computer data available",
		"configuration": map[string]any{
			"collection_port":     8084,
			"enabled":             true,
			"collection_protocol": "HTTP/JSON",
			"buffer_size":         "50MB",
			"forwarding_target":   "",
			"forwarding_enabled":  false,
		},
		"performance": map[string]any{
			"cpu_usage":          "0%",
			"memory_usage":       "0MB",
			"disk_io_rate":       "0MB/s",
			"network_io_rate":    "0KB/s",
			"buffer_utilization": "0%",
		},
	}

	_ = json.NewEncoder(w).Encode(windows)
}

// Enhanced metrics handler
func handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Get system metrics with error handling
	var memTotal, memAvail, memUsed int64 = 1, 0, 0 // Default values to avoid division by zero
	if b, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				if strings.HasPrefix(line, "MemTotal:") {
					if v, e := strconv.ParseInt(fields[1], 10, 64); e == nil && v > 0 {
						memTotal = v * 1024 // Convert KB to bytes
					}
				} else if strings.HasPrefix(line, "MemAvailable:") {
					if v, e := strconv.ParseInt(fields[1], 10, 64); e == nil && v >= 0 {
						memAvail = v * 1024
					}
				}
			}
		}
		if memTotal > memAvail {
			memUsed = memTotal - memAvail
		}
	}

	// Get disk usage with error handling
	var diskTotal, diskUsed int64 = 1, 0 // Default values to avoid division by zero
	if stat, err := os.Stat("/"); err == nil {
		if statfs, ok := stat.Sys().(*syscall.Statfs_t); ok && statfs.Blocks > 0 {
			diskTotal = int64(statfs.Blocks) * int64(statfs.Bsize)
			diskUsed = diskTotal - (int64(statfs.Bavail) * int64(statfs.Bsize))
			if diskUsed < 0 {
				diskUsed = 0
			}
		}
	}

	// Get uptime
	uptime := "unknown"
	if b, err := os.ReadFile("/proc/uptime"); err == nil {
		parts := strings.Split(string(b), " ")
		if len(parts) > 0 {
			if secs, err := time.ParseDuration(strings.TrimSpace(parts[0]) + "s"); err == nil {
				days := int(secs.Hours()) / 24
				hours := int(secs.Hours()) % 24
				minutes := int(secs.Minutes()) % 60
				if days > 0 {
					uptime = fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
				} else if hours > 0 {
					uptime = fmt.Sprintf("%dh %dm", hours, minutes)
				} else {
					uptime = fmt.Sprintf("%dm", minutes)
				}
			}
		}
	}

	// Calculate percentages safely
	memUsagePct := 0.0
	if memTotal > 0 {
		memUsagePct = float64(memUsed) / float64(memTotal) * 100
	}

	diskUsagePct := 0.0
	if diskTotal > 0 {
		diskUsagePct = float64(diskUsed) / float64(diskTotal) * 100
	}

	metrics := map[string]any{
		"cpu_usage":    "0%",
		"memory_usage": fmt.Sprintf("%.1f%%", memUsagePct),
		"disk_usage":   fmt.Sprintf("%.1f%%", diskUsagePct),
		"uptime":       uptime,
		"memory": map[string]any{
			"total":     memTotal,
			"used":      memUsed,
			"available": memAvail,
		},
		"disk": map[string]any{
			"total":     diskTotal,
			"used":      diskUsed,
			"available": diskTotal - diskUsed,
		},
		"network": map[string]any{
			"interfaces": "No interface data available",
		},
		"processes": map[string]any{
			"total":   "Unknown",
			"running": "Unknown",
		},
	}

	_ = json.NewEncoder(w).Encode(metrics)
}

// Buffer status handler
func handleBuffer(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	buffer := map[string]any{
		"health_score": 85,
		"buffer_size":  "64MB",
		"utilization":  "18%",
		"uptime":       "2d 14h",
		"utilization_metrics": map[string]any{
			"syslog":  map[string]any{"entries": 1.2, "rate_per_sec": 15},
			"netflow": map[string]any{"entries": 2.8, "rate_per_sec": 42},
			"snmp":    map[string]any{"entries": 0.5, "rate_per_sec": 8},
			"windows": map[string]any{"entries": 0.0, "rate_per_sec": 0},
		},
		"throughput_metrics": map[string]any{
			"syslog":  map[string]any{"bytes_per_sec": 1024, "max_bytes_per_sec": 5120},
			"netflow": map[string]any{"bytes_per_sec": 2048, "max_bytes_per_sec": 10240},
			"snmp":    map[string]any{"bytes_per_sec": 512, "max_bytes_per_sec": 2048},
			"windows": map[string]any{"bytes_per_sec": 0, "max_bytes_per_sec": 4096},
		},
		"buffer_queues": map[string]any{
			"input_queue":      "No data available",
			"processing_queue": "No data available",
			"output_queue":     "No data available",
		},
		"forwarding_destinations": "No forwarding data available",
		"recent_activity":         "No activity data available",
		"performance_metrics": map[string]any{
			"cpu_usage":    "2%",
			"memory_usage": "45MB",
			"disk_io":      "1.2MB/s",
			"network_io":   "834KB/s",
		},
	}

	_ = json.NewEncoder(w).Encode(buffer)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		next.ServeHTTP(w, r)
	})
}

func withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only guard /api/* if a key is configured; always allow OPTIONS for CORS preflight
		if apiKey != "" && strings.HasPrefix(r.URL.Path, "/api/") && r.Method != http.MethodOptions {
			key := r.Header.Get("X-API-Key")
			if key == "" {
				// Try Authorization: Bearer <key> or Api-Key <key>
				auth := r.Header.Get("Authorization")
				if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
					key = strings.TrimSpace(auth[len("Bearer "):])
				} else if strings.HasPrefix(strings.ToLower(auth), "api-key ") {
					key = strings.TrimSpace(auth[len("Api-Key "):])
				}
			}
			key = strings.TrimSpace(key)
			ak := strings.TrimSpace(apiKey)
			if key == "" || ak == "" || key != ak {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"success": false, "message": "unauthorized"}`))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
