package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

type restartRecorder struct{ names []string }

func (r *restartRecorder) call(name string) error {
	r.names = append(r.names, name)
	return nil
}

func tempPaths(t *testing.T) (cfg, backups, logf string) {
	t.Helper()
	d := t.TempDir()
	return filepath.Join(d, "config.json"), filepath.Join(d, "backups"), filepath.Join(d, "config-service.log")
}

func withEnv(t *testing.T, key, val string) {
	t.Helper()
	old := os.Getenv(key)
	_ = os.Setenv(key, val)
	t.Cleanup(func() { _ = os.Setenv(key, old) })
}

func TestGETConfig_EmptyOK(t *testing.T) {
	cfg, bkp, lg := tempPaths(t)
	withEnv(t, "NOC_RAVEN_CONFIG_PATH", cfg)
	withEnv(t, "NOC_RAVEN_BACKUP_DIR", bkp)
	withEnv(t, "NOC_RAVEN_LOG_PATH", lg)

	// Ensure global paths pick up env (re-evaluate in this process)
	configPath = cfg
	backupDir = bkp
	logPath = lg

	rec := &restartRecorder{}
	restartSvc = rec.call
	t.Cleanup(func() { restartSvc = restartService })

	ts := httptest.NewServer(newMux())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/config")
	if err != nil { t.Fatalf("GET failed: %v", err) }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", resp.StatusCode)
	}
	var got map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 0 { t.Fatalf("expected empty object, got: %#v", got) }
}

func TestPOSTConfig_PersistAndRestart(t *testing.T) {
	cfg, bkp, lg := tempPaths(t)
	withEnv(t, "NOC_RAVEN_CONFIG_PATH", cfg)
	withEnv(t, "NOC_RAVEN_BACKUP_DIR", bkp)
	withEnv(t, "NOC_RAVEN_LOG_PATH", lg)
	configPath = cfg
	backupDir = bkp
	logPath = lg

	// write initial config
	initial := []byte(`{"collection":{"syslog":{"port":514,"enabled":true},"netflow":{"enabled":true,"ports":{"netflow_v5":2055,"ipfix":4739,"sflow":6343}},"snmp":{"trap_port":162,"enabled":true}}}`)
	if err := os.WriteFile(cfg, initial, 0644); err != nil { t.Fatal(err) }

	rec := &restartRecorder{}
	restartSvc = rec.call
	t.Cleanup(func() { restartSvc = restartService })

	ts := httptest.NewServer(newMux())
	defer ts.Close()

	// change syslog port and snmp trap
	updated := []byte(`{"collection":{"syslog":{"port":5514,"enabled":true},"netflow":{"enabled":true,"ports":{"netflow_v5":2055,"ipfix":4739,"sflow":6343}},"snmp":{"trap_port":1162,"enabled":true}}}`)
	resp, err := http.Post(ts.URL+"/api/config", "application/json", bytes.NewReader(updated))
	if err != nil { t.Fatalf("POST failed: %v", err) }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status: %d", resp.StatusCode)
	}

	// verify file contents
	data, err := os.ReadFile(cfg)
	if err != nil { t.Fatal(err) }
	if !bytes.Contains(data, []byte("5514")) { t.Fatalf("config not updated: %s", string(data)) }

	// verify a timestamped backup was created
	entries, err := os.ReadDir(bkp)
	if err != nil { t.Fatalf("read backups: %v", err) }
	if len(entries) == 0 {
		t.Fatalf("expected at least one backup file in %s", bkp)
	}
}

func TestPOSTConfig_InvalidJSON(t *testing.T) {
	cfg, bkp, lg := tempPaths(t)
	withEnv(t, "NOC_RAVEN_CONFIG_PATH", cfg)
	withEnv(t, "NOC_RAVEN_BACKUP_DIR", bkp)
	withEnv(t, "NOC_RAVEN_LOG_PATH", lg)
	configPath = cfg
	backupDir = bkp
	logPath = lg

	restartSvc = func(string) error { return nil }
	t.Cleanup(func() { restartSvc = restartService })

	ts := httptest.NewServer(newMux())
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/config", "application/json", bytes.NewReader([]byte("{")))
	if err != nil { t.Fatalf("POST failed: %v", err) }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestPOST_RestartEndpoint(t *testing.T) {
	cfg, bkp, lg := tempPaths(t)
	withEnv(t, "NOC_RAVEN_CONFIG_PATH", cfg)
	withEnv(t, "NOC_RAVEN_BACKUP_DIR", bkp)
	withEnv(t, "NOC_RAVEN_LOG_PATH", lg)
	configPath = cfg
	backupDir = bkp
	logPath = lg

	rec := &restartRecorder{}
	restartSvc = rec.call
	t.Cleanup(func() { restartSvc = restartService })

	ts := httptest.NewServer(newMux())
	defer ts.Close()

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/services/goflow2/restart", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil { t.Fatalf("POST failed: %v", err) }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if !slices.Contains(rec.names, "goflow2") {
		t.Fatalf("expected restart of goflow2, got %v", rec.names)
	}
}

func TestAuthOptionalAndEnabled(t *testing.T) {
	cfg, bkp, lg := tempPaths(t)
	withEnv(t, "NOC_RAVEN_CONFIG_PATH", cfg)
	withEnv(t, "NOC_RAVEN_BACKUP_DIR", bkp)
	withEnv(t, "NOC_RAVEN_LOG_PATH", lg)
	configPath = cfg
	backupDir = bkp
	logPath = lg

	// Enable API key auth
	withEnv(t, "NOC_RAVEN_API_KEY", "testkey")
	apiKey = "testkey"

	ts := httptest.NewServer(newMux())
	defer ts.Close()

	// Without key should be 401
	resp, err := http.Get(ts.URL + "/api/config")
	if err != nil { t.Fatalf("GET failed: %v", err) }
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// With key header should be 200
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/config", nil)
	req.Header.Set("X-API-Key", "testkey")
	resp2, err := http.DefaultClient.Do(req)
	if err != nil { t.Fatalf("GET with key failed: %v", err) }
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 with key, got %d", resp2.StatusCode)
	}

	// OPTIONS preflight should be allowed without key
	reqOpt, _ := http.NewRequest(http.MethodOptions, ts.URL+"/api/config", nil)
	resp3, err := http.DefaultClient.Do(reqOpt)
	if err != nil { t.Fatalf("OPTIONS failed: %v", err) }
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204 on OPTIONS, got %d", resp3.StatusCode)
	}
}

