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
	"strings"
	"sync"
	"time"
)

type Config map[string]any

var (
	// Paths are overridable via environment for testing or customization
	configPath    = envDefault("NOC_RAVEN_CONFIG_PATH", "/opt/noc-raven/web/api/config.json")
	backupDir     = envDefault("NOC_RAVEN_BACKUP_DIR", "/opt/noc-raven/backups")
	logPath       = envDefault("NOC_RAVEN_LOG_PATH", "/var/log/noc-raven/config-service.log")
	restartScript = envDefault("NOC_RAVEN_RESTART_SCRIPT", "/opt/noc-raven/scripts/production-service-manager.sh")
apiKey        = strings.TrimSpace(os.Getenv("NOC_RAVEN_API_KEY")) // optional API key; if set, config endpoints require it

	mu          sync.Mutex // serialize read/write of config file
	// restartSvc allows tests to stub service restarts
	restartSvc  = restartService
)

func envDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func logf(format string, a ...any) {
	f, _ := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	defer func() { _ = f.Close() }()
	msg := fmt.Sprintf("[%s] ", time.Now().Format(time.RFC3339)) + fmt.Sprintf(format, a...) + "\n"
	_, _ = f.WriteString(msg)
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
		_ = os.CopyFS // noop to keep imports tidy
		backupFile := filepath.Join(backupDir, fmt.Sprintf("config_%s.json", stamp))
		if err := copyFile(configPath, backupFile); err != nil {
			logf("backup failed: %v", err)
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
	if err != nil { return err }
	defer s.Close()
	d, err := os.Create(dst)
	if err != nil { return err }
	defer d.Close()
	_, err = io.Copy(d, s)
	return err
}

func getNestedInt(cfg Config, path ...string) (int, bool) {
	var cur any = cfg
	for i, p := range path {
		m, ok := cur.(map[string]any)
		if !ok { return 0, false }
		v, ok := m[p]
		if !ok { return 0, false }
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
		if !ok { return false, false }
		v, ok := m[p]
		if !ok { return false, false }
		if i == len(path)-1 {
			b, ok := v.(bool)
			return b, ok
		}
		cur = v
	}
	return false, false
}

func restartService(name string) error {
	logf("restarting service: %s", name)
	cmd := exec.Command("bash", restartScript, "restart", name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		logf("restart %s failed: %v; out=%s", name, err, string(out))
		return err
	}
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
		logf("GET /api/config read error: %v", err)
		http.Error(w, fmt.Sprintf("read error: %v", err), http.StatusInternalServerError)
		return
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(cfg); err != nil {
		logf("GET /api/config encode error: %v", err)
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
		logf("POST /api/config invalid json: %v", err)
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	mu.Lock()
	oldCfg, _ := readJSONConfig()
	if err := writeJSONConfig(newCfg); err != nil {
		mu.Unlock()
		logf("POST /api/config write error: %v", err)
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
	if oldSysPort != newSysPort || oldSysEn != newSysEn { restarts = append(restarts, "fluent-bit") }
	// netflow/ipfix/sflow => goflow2
	oldNfv5, _ := getNestedInt(oldCfg, "collection", "netflow", "ports", "netflow_v5")
	newNfv5, _ := getNestedInt(newCfg, "collection", "netflow", "ports", "netflow_v5")
	oldIpfix, _ := getNestedInt(oldCfg, "collection", "netflow", "ports", "ipfix")
	newIpfix, _ := getNestedInt(newCfg, "collection", "netflow", "ports", "ipfix")
	oldSflow, _ := getNestedInt(oldCfg, "collection", "netflow", "ports", "sflow")
	newSflow, _ := getNestedInt(newCfg, "collection", "netflow", "ports", "sflow")
	oldNfEn, _ := getNestedBool(oldCfg, "collection", "netflow", "enabled")
	newNfEn, _ := getNestedBool(newCfg, "collection", "netflow", "enabled")
	if oldNfv5 != newNfv5 || oldIpfix != newIpfix || oldSflow != newSflow || oldNfEn != newNfEn { restarts = append(restarts, "goflow2") }
	// snmp => telegraf
	oldTrap, _ := getNestedInt(oldCfg, "collection", "snmp", "trap_port")
	newTrap, _ := getNestedInt(newCfg, "collection", "snmp", "trap_port")
	oldSnmpEn, _ := getNestedBool(oldCfg, "collection", "snmp", "enabled")
	newSnmpEn, _ := getNestedBool(newCfg, "collection", "snmp", "enabled")
	if oldTrap != newTrap || oldSnmpEn != newSnmpEn { restarts = append(restarts, "telegraf") }
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

func handleRestartService(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// path format: /api/services/{name}/restart
	parts := bytes.Split(bytes.Trim([]byte(r.URL.Path), "/"), []byte("/"))
	if len(parts) != 4 {
		http.Error(w, `{"success": false, "message": "invalid path"}`, http.StatusBadRequest)
		return
	}
	name := string(parts[2])
	if err := restartSvc(name); err != nil {
		http.Error(w, fmt.Sprintf(`{"success": false, "message": "restart failed: %v"}`, err), http.StatusInternalServerError)
		return
	}
	_, _ = w.Write([]byte(fmt.Sprintf(`{"success": true, "message": "Service %s restarted"}`, name)))
}

// newMux builds the HTTP routes (exported for tests)
func newMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
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
	return withCORS(withAuth(mux))
}

func main() {
	addr := ":5004"
	logf("starting config-service on %s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           newMux(),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      10 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil {
		logf("server error: %v", err)
		os.Exit(1)
	}
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

