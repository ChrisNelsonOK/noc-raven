package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// VPNProfile represents a parsed OpenVPN profile
type VPNProfile struct {
	ID               string                 `json:"id"`
	Name             string                 `json:"name"`
	Filename         string                 `json:"filename"`
	Remote           []VPNRemote            `json:"remote"`
	Port             int                    `json:"port,omitempty"`
	Protocol         string                 `json:"protocol"`
	Device           string                 `json:"device"`
	CipherMode       string                 `json:"cipher,omitempty"`
	AuthMethod       string                 `json:"auth,omitempty"`
	TLSVersion       string                 `json:"tls_version,omitempty"`
	CA               string                 `json:"ca,omitempty"`
	Certificate      string                 `json:"cert,omitempty"`
	PrivateKey       string                 `json:"key,omitempty"`
	AuthUserPass     string                 `json:"auth_user_pass,omitempty"`
	Keepalive        []int                  `json:"keepalive,omitempty"`
	Verb             int                    `json:"verb,omitempty"`
	Mute             int                    `json:"mute,omitempty"`
	Float            bool                   `json:"float"`
	Nobind           bool                   `json:"nobind"`
	PersistKey       bool                   `json:"persist_key"`
	PersistTun       bool                   `json:"persist_tun"`
	RemoteCertEKU    string                 `json:"remote_cert_eku,omitempty"`
	RenegSec         int                    `json:"reneg_sec,omitempty"`
	MuteReplayWarnings bool                 `json:"mute_replay_warnings"`
	CompLZO          string                 `json:"comp_lzo,omitempty"`
	CustomDirectives map[string]string      `json:"custom_directives,omitempty"`
	CreatedAt        time.Time              `json:"created_at"`
	LastModified     time.Time              `json:"last_modified"`
	Validated        bool                   `json:"validated"`
	ValidationError  string                 `json:"validation_error,omitempty"`
	Priority         int                    `json:"priority"`
	Active           bool                   `json:"active"`
}

// VPNRemote represents a remote server configuration
type VPNRemote struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// VPNConnectionState represents the current connection state
type VPNConnectionState struct {
	ProfileID        string            `json:"profile_id"`
	Connected        bool              `json:"connected"`
	ConnectedAt      *time.Time        `json:"connected_at,omitempty"`
	DisconnectedAt   *time.Time        `json:"disconnected_at,omitempty"`
	ConnectionTime   int               `json:"connection_time_seconds"`
	LocalIP          string            `json:"local_ip,omitempty"`
	RemoteIP         string            `json:"remote_ip,omitempty"`
	BytesReceived    int64             `json:"bytes_received"`
	BytesSent        int64             `json:"bytes_sent"`
	LastError        string            `json:"last_error,omitempty"`
	RetryCount       int               `json:"retry_count"`
	Health           VPNHealthMetrics  `json:"health"`
}

// VPNHealthMetrics represents VPN health monitoring data
type VPNHealthMetrics struct {
	Latency        int     `json:"latency_ms"`
	PacketLoss     float64 `json:"packet_loss_percent"`
	Throughput     int64   `json:"throughput_bps"`
	DNSResolution  bool    `json:"dns_resolution"`
	LastHealthCheck time.Time `json:"last_health_check"`
}

// VPNManager handles VPN profile management
type VPNManager struct {
	profilesPath      string
	statePath         string
	profiles          map[string]*VPNProfile
	currentState      *VPNConnectionState
	connectionManager *VPNConnectionManager
	diagnostics       *NetworkDiagnostics
	healthMonitor     *VPNHealthMonitor
}

// NewVPNManager creates a new VPN manager instance
func NewVPNManager(profilesPath, statePath string) *VPNManager {
	vm := &VPNManager{
		profilesPath: profilesPath,
		statePath:    statePath,
		profiles:     make(map[string]*VPNProfile),
		currentState: &VPNConnectionState{
			Connected: false,
			Health: VPNHealthMetrics{
				LastHealthCheck: time.Now(),
			},
		},
	}
	
	// Initialize connection manager
	vm.connectionManager = NewVPNConnectionManager(vm, filepath.Join(statePath, "connections"))
	
	// Initialize network diagnostics
	vm.diagnostics = NewNetworkDiagnostics()
	
	// Initialize health monitor
	vm.healthMonitor = NewVPNHealthMonitor(vm)
	
	return vm
}

// ParseOVPNFile parses a .ovpn file and returns a VPNProfile
func (vm *VPNManager) ParseOVPNFile(filepath string) (*VPNProfile, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	profile := &VPNProfile{
		ID:               generateProfileID(filepath),
		Name:             strings.TrimSuffix(filepath, ".ovpn"),
		Filename:         filepath,
		CreatedAt:        time.Now(),
		LastModified:     time.Now(),
		CustomDirectives: make(map[string]string),
		Protocol:         "udp", // default
		Device:           "tun",  // default
		Port:             1194,   // default
		Verb:             3,      // default
		Priority:         5,      // default
	}

	scanner := bufio.NewScanner(file)
	var currentSection string
	var sectionContent strings.Builder

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		
		// Skip comments and empty lines
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}

		// Handle inline certificate sections
		if strings.HasPrefix(line, "<") && strings.HasSuffix(line, ">") {
			if currentSection != "" {
				// End of section
				if err := vm.processCertificateSection(profile, currentSection, sectionContent.String()); err != nil {
					return nil, fmt.Errorf("failed to process %s section: %v", currentSection, err)
				}
				currentSection = ""
				sectionContent.Reset()
			} else {
				// Start of section
				currentSection = strings.Trim(line, "<>")
			}
			continue
		}

		if currentSection != "" {
			sectionContent.WriteString(line + "\n")
			continue
		}

		// Parse configuration directives
		parts := strings.Fields(line)
		if len(parts) == 0 {
			continue
		}

		directive := parts[0]
		args := parts[1:]

		if err := vm.parseDirective(profile, directive, args); err != nil {
			log.Printf("Warning: failed to parse directive '%s': %v", directive, err)
			// Store unknown directives as custom
			profile.CustomDirectives[directive] = strings.Join(args, " ")
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading file: %v", err)
	}

	// Validate the profile
	if err := vm.validateProfile(profile); err != nil {
		profile.ValidationError = err.Error()
		profile.Validated = false
	} else {
		profile.Validated = true
	}

	return profile, nil
}

// parseDirective parses individual OpenVPN directives
func (vm *VPNManager) parseDirective(profile *VPNProfile, directive string, args []string) error {
	switch strings.ToLower(directive) {
	case "remote":
		if len(args) < 1 {
			return fmt.Errorf("remote directive requires host argument")
		}
		remote := VPNRemote{Host: args[0]}
		if len(args) >= 2 {
			port, err := strconv.Atoi(args[1])
			if err == nil {
				remote.Port = port
			}
		}
		if remote.Port == 0 {
			remote.Port = profile.Port // use default
		}
		profile.Remote = append(profile.Remote, remote)

	case "port":
		if len(args) < 1 {
			return fmt.Errorf("port directive requires port number")
		}
		port, err := strconv.Atoi(args[0])
		if err != nil {
			return fmt.Errorf("invalid port number: %v", err)
		}
		profile.Port = port

	case "proto":
		if len(args) < 1 {
			return fmt.Errorf("proto directive requires protocol")
		}
		protocol := strings.ToLower(args[0])
		if protocol != "udp" && protocol != "tcp" && protocol != "tcp-client" {
			return fmt.Errorf("unsupported protocol: %s", protocol)
		}
		profile.Protocol = protocol

	case "dev":
		if len(args) < 1 {
			return fmt.Errorf("dev directive requires device type")
		}
		profile.Device = args[0]

	case "cipher":
		if len(args) < 1 {
			return fmt.Errorf("cipher directive requires cipher name")
		}
		profile.CipherMode = args[0]

	case "auth":
		if len(args) < 1 {
			return fmt.Errorf("auth directive requires auth method")
		}
		profile.AuthMethod = args[0]

	case "auth-user-pass":
		if len(args) > 0 {
			profile.AuthUserPass = args[0]
		} else {
			profile.AuthUserPass = "required"
		}

	case "keepalive":
		if len(args) >= 2 {
			ping, err1 := strconv.Atoi(args[0])
			restart, err2 := strconv.Atoi(args[1])
			if err1 == nil && err2 == nil {
				profile.Keepalive = []int{ping, restart}
			}
		}

	case "verb":
		if len(args) >= 1 {
			if verb, err := strconv.Atoi(args[0]); err == nil {
				profile.Verb = verb
			}
		}

	case "mute":
		if len(args) >= 1 {
			if mute, err := strconv.Atoi(args[0]); err == nil {
				profile.Mute = mute
			}
		}

	case "reneg-sec":
		if len(args) >= 1 {
			if reneg, err := strconv.Atoi(args[0]); err == nil {
				profile.RenegSec = reneg
			}
		}

	case "tls-version-min":
		if len(args) >= 1 {
			profile.TLSVersion = args[0]
		}

	case "remote-cert-eku":
		if len(args) >= 1 {
			profile.RemoteCertEKU = strings.Join(args, " ")
		}

	case "comp-lzo":
		if len(args) > 0 {
			profile.CompLZO = args[0]
		} else {
			profile.CompLZO = "adaptive"
		}

	case "float":
		profile.Float = true

	case "nobind":
		profile.Nobind = true

	case "persist-key":
		profile.PersistKey = true

	case "persist-tun":
		profile.PersistTun = true

	case "mute-replay-warnings":
		profile.MuteReplayWarnings = true

	case "client":
		// Client mode - this is expected for client configurations
		break

	default:
		return fmt.Errorf("unknown directive: %s", directive)
	}

	return nil
}

// processCertificateSection processes inline certificate sections
func (vm *VPNManager) processCertificateSection(profile *VPNProfile, section, content string) error {
	switch section {
	case "ca":
		profile.CA = content
	case "cert":
		profile.Certificate = content
	case "key":
		profile.PrivateKey = content
	default:
		return fmt.Errorf("unknown certificate section: %s", section)
	}
	return nil
}

// validateProfile validates a VPN profile for correctness
func (vm *VPNManager) validateProfile(profile *VPNProfile) error {
	// Check required fields
	if len(profile.Remote) == 0 {
		return fmt.Errorf("no remote servers configured")
	}

	// Validate remote servers
	for i, remote := range profile.Remote {
		if remote.Host == "" {
			return fmt.Errorf("remote server %d: empty host", i+1)
		}
		if remote.Port <= 0 || remote.Port > 65535 {
			return fmt.Errorf("remote server %d: invalid port %d", i+1, remote.Port)
		}

		// Test DNS resolution for host
		if net.ParseIP(remote.Host) == nil {
			// It's a hostname, try to resolve it
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			
			if _, err := net.DefaultResolver.LookupHost(ctx, remote.Host); err != nil {
				return fmt.Errorf("remote server %d: failed to resolve host %s: %v", i+1, remote.Host, err)
			}
		}
	}

	// Validate certificates if present
	if profile.CA != "" {
		if err := vm.validateCertificate(profile.CA, "CA"); err != nil {
			return fmt.Errorf("CA certificate validation failed: %v", err)
		}
	}

	if profile.Certificate != "" {
		if err := vm.validateCertificate(profile.Certificate, "client"); err != nil {
			return fmt.Errorf("client certificate validation failed: %v", err)
		}
	}

	if profile.PrivateKey != "" {
		if err := vm.validatePrivateKey(profile.PrivateKey); err != nil {
			return fmt.Errorf("private key validation failed: %v", err)
		}
	}

	// Validate protocol
	validProtocols := []string{"udp", "tcp", "tcp-client"}
	valid := false
	for _, p := range validProtocols {
		if profile.Protocol == p {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("invalid protocol: %s", profile.Protocol)
	}

	// Validate device type
	if profile.Device != "tun" && profile.Device != "tap" {
		return fmt.Errorf("invalid device type: %s", profile.Device)
	}

	return nil
}

// validateCertificate validates a PEM encoded certificate
func (vm *VPNManager) validateCertificate(certPEM, certType string) error {
	block, _ := pem.Decode([]byte(certPEM))
	if block == nil {
		return fmt.Errorf("failed to decode PEM certificate")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse certificate: %v", err)
	}

	// Check if certificate is expired
	now := time.Now()
	if now.Before(cert.NotBefore) {
		return fmt.Errorf("certificate not yet valid (valid from %v)", cert.NotBefore)
	}
	if now.After(cert.NotAfter) {
		return fmt.Errorf("certificate expired on %v", cert.NotAfter)
	}

	// Additional validation for client certificates
	if certType == "client" {
		if !cert.KeyUsage&x509.KeyUsageDigitalSignature != 0 {
			log.Printf("Warning: client certificate missing digital signature usage")
		}
	}

	return nil
}

// validatePrivateKey validates a PEM encoded private key
func (vm *VPNManager) validatePrivateKey(keyPEM string) error {
	block, _ := pem.Decode([]byte(keyPEM))
	if block == nil {
		return fmt.Errorf("failed to decode PEM private key")
	}

	// Try to parse as different key types
	if _, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return nil // RSA key
	}
	if _, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		return nil // PKCS8 key
	}
	if _, err := x509.ParseECPrivateKey(block.Bytes); err == nil {
		return nil // EC key
	}

	return fmt.Errorf("unsupported private key format")
}

// generateProfileID generates a unique ID for a VPN profile
func generateProfileID(filepath string) string {
	filename := strings.TrimSuffix(filepath, ".ovpn")
	timestamp := time.Now().UnixNano()
	return fmt.Sprintf("%s_%d", filename, timestamp)
}

// SaveProfile saves a VPN profile to disk
func (vm *VPNManager) SaveProfile(profile *VPNProfile) error {
	os.MkdirAll(vm.profilesPath, 0755)
	
	profileFile := filepath.Join(vm.profilesPath, profile.ID+".json")
	file, err := os.Create(profileFile)
	if err != nil {
		return fmt.Errorf("failed to create profile file: %v", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(profile); err != nil {
		return fmt.Errorf("failed to encode profile: %v", err)
	}

	vm.profiles[profile.ID] = profile
	return nil
}

// LoadProfiles loads all VPN profiles from disk
func (vm *VPNManager) LoadProfiles() error {
	if _, err := os.Stat(vm.profilesPath); os.IsNotExist(err) {
		os.MkdirAll(vm.profilesPath, 0755)
		return nil
	}

	files, err := filepath.Glob(filepath.Join(vm.profilesPath, "*.json"))
	if err != nil {
		return fmt.Errorf("failed to list profile files: %v", err)
	}

	for _, file := range files {
		profile, err := vm.loadProfileFromFile(file)
		if err != nil {
			log.Printf("Warning: failed to load profile %s: %v", file, err)
			continue
		}
		vm.profiles[profile.ID] = profile
	}

	return nil
}

// loadProfileFromFile loads a single profile from a JSON file
func (vm *VPNManager) loadProfileFromFile(filepath string) (*VPNProfile, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var profile VPNProfile
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&profile); err != nil {
		return nil, err
	}

	return &profile, nil
}

// GetProfiles returns all loaded VPN profiles
func (vm *VPNManager) GetProfiles() map[string]*VPNProfile {
	return vm.profiles
}

// GetProfile returns a specific VPN profile by ID
func (vm *VPNManager) GetProfile(id string) (*VPNProfile, bool) {
	profile, exists := vm.profiles[id]
	return profile, exists
}

// DeleteProfile removes a VPN profile
func (vm *VPNManager) DeleteProfile(id string) error {
	if _, exists := vm.profiles[id]; !exists {
		return fmt.Errorf("profile not found: %s", id)
	}

	// Remove from disk
	profileFile := filepath.Join(vm.profilesPath, id+".json")
	if err := os.Remove(profileFile); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove profile file: %v", err)
	}

	// Remove from memory
	delete(vm.profiles, id)
	return nil
}

// ImportProfile imports a .ovpn file and saves it as a profile
func (vm *VPNManager) ImportProfile(ovpnPath, profileName string) (*VPNProfile, error) {
	profile, err := vm.ParseOVPNFile(ovpnPath)
	if err != nil {
		return nil, fmt.Errorf("failed to parse OVPN file: %v", err)
	}

	if profileName != "" {
		profile.Name = profileName
	}

	if err := vm.SaveProfile(profile); err != nil {
		return nil, fmt.Errorf("failed to save profile: %v", err)
	}

	return profile, nil
}

// ExportProfile exports a profile to a .ovpn file
func (vm *VPNManager) ExportProfile(profileID, outputPath string) error {
	profile, exists := vm.profiles[profileID]
	if !exists {
		return fmt.Errorf("profile not found: %s", profileID)
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %v", err)
	}
	defer file.Close()

	return vm.writeOVPNFile(file, profile)
}

// writeOVPNFile writes a VPN profile to an .ovpn file
func (vm *VPNManager) writeOVPNFile(writer io.Writer, profile *VPNProfile) error {
	fmt.Fprintf(writer, "# Generated by NoC Raven VPN Manager\n")
	fmt.Fprintf(writer, "# Profile: %s\n", profile.Name)
	fmt.Fprintf(writer, "# Created: %s\n\n", profile.CreatedAt.Format("2006-01-02 15:04:05"))

	// Basic configuration
	fmt.Fprintf(writer, "client\n")
	fmt.Fprintf(writer, "dev %s\n", profile.Device)
	fmt.Fprintf(writer, "proto %s\n", profile.Protocol)

	// Remote servers
	for _, remote := range profile.Remote {
		fmt.Fprintf(writer, "remote %s %d\n", remote.Host, remote.Port)
	}

	// Optional configurations
	if profile.CipherMode != "" {
		fmt.Fprintf(writer, "cipher %s\n", profile.CipherMode)
	}
	if profile.AuthMethod != "" {
		fmt.Fprintf(writer, "auth %s\n", profile.AuthMethod)
	}
	if profile.TLSVersion != "" {
		fmt.Fprintf(writer, "tls-version-min %s\n", profile.TLSVersion)
	}
	if profile.RemoteCertEKU != "" {
		fmt.Fprintf(writer, "remote-cert-eku \"%s\"\n", profile.RemoteCertEKU)
	}

	// Keepalive
	if len(profile.Keepalive) >= 2 {
		fmt.Fprintf(writer, "keepalive %d %d\n", profile.Keepalive[0], profile.Keepalive[1])
	}

	// Numeric options
	if profile.Verb != 3 { // only if non-default
		fmt.Fprintf(writer, "verb %d\n", profile.Verb)
	}
	if profile.Mute != 0 {
		fmt.Fprintf(writer, "mute %d\n", profile.Mute)
	}
	if profile.RenegSec != 0 {
		fmt.Fprintf(writer, "reneg-sec %d\n", profile.RenegSec)
	}

	// Boolean options
	if profile.Float {
		fmt.Fprintf(writer, "float\n")
	}
	if profile.Nobind {
		fmt.Fprintf(writer, "nobind\n")
	}
	if profile.PersistKey {
		fmt.Fprintf(writer, "persist-key\n")
	}
	if profile.PersistTun {
		fmt.Fprintf(writer, "persist-tun\n")
	}
	if profile.MuteReplayWarnings {
		fmt.Fprintf(writer, "mute-replay-warnings\n")
	}

	// Authentication
	if profile.AuthUserPass != "" {
		if profile.AuthUserPass == "required" {
			fmt.Fprintf(writer, "auth-user-pass\n")
		} else {
			fmt.Fprintf(writer, "auth-user-pass %s\n", profile.AuthUserPass)
		}
	}

	// Compression
	if profile.CompLZO != "" {
		if profile.CompLZO == "adaptive" {
			fmt.Fprintf(writer, "comp-lzo\n")
		} else {
			fmt.Fprintf(writer, "comp-lzo %s\n", profile.CompLZO)
		}
	}

	// Custom directives
	for directive, value := range profile.CustomDirectives {
		if value == "" {
			fmt.Fprintf(writer, "%s\n", directive)
		} else {
			fmt.Fprintf(writer, "%s %s\n", directive, value)
		}
	}

	// Certificates
	if profile.CA != "" {
		fmt.Fprintf(writer, "<ca>\n%s</ca>\n", strings.TrimSpace(profile.CA))
	}
	if profile.Certificate != "" {
		fmt.Fprintf(writer, "<cert>\n%s</cert>\n", strings.TrimSpace(profile.Certificate))
	}
	if profile.PrivateKey != "" {
		fmt.Fprintf(writer, "<key>\n%s</key>\n", strings.TrimSpace(profile.PrivateKey))
	}

	return nil
}

// HTTP API handlers

// setupRoutes sets up the HTTP routes for the VPN manager
func (vm *VPNManager) setupRoutes() *mux.Router {
	router := mux.NewRouter()
	
	// API routes
	api := router.PathPrefix("/api/vpn").Subrouter()
	
	// Profile management
	api.HandleFunc("/profiles", vm.handleGetProfiles).Methods("GET")
	api.HandleFunc("/profiles", vm.handleImportProfile).Methods("POST")
	api.HandleFunc("/profiles/{id}", vm.handleGetProfile).Methods("GET")
	api.HandleFunc("/profiles/{id}", vm.handleDeleteProfile).Methods("DELETE")
	api.HandleFunc("/profiles/{id}/export", vm.handleExportProfile).Methods("GET")
	api.HandleFunc("/profiles/{id}/validate", vm.handleValidateProfile).Methods("POST")
	
	// Connection management
	api.HandleFunc("/connection/status", vm.handleConnectionStatus).Methods("GET")
	api.HandleFunc("/connection/connect/{id}", vm.handleConnect).Methods("POST")
	api.HandleFunc("/connection/connect-failover", vm.handleConnectWithFailover).Methods("POST")
	api.HandleFunc("/connection/disconnect", vm.handleDisconnect).Methods("POST")
	api.HandleFunc("/connection/history", vm.handleConnectionHistory).Methods("GET")
	api.HandleFunc("/failover/enable", vm.handleEnableFailover).Methods("POST")
	api.HandleFunc("/failover/disable", vm.handleDisableFailover).Methods("POST")
	api.HandleFunc("/failover/status", vm.handleFailoverStatus).Methods("GET")
	api.HandleFunc("/failover/trigger", vm.handleTriggerFailover).Methods("POST")
	api.HandleFunc("/failover/reset-attempts", vm.handleResetFailoverAttempts).Methods("POST")
	
	// Health and diagnostics
	api.HandleFunc("/health", vm.handleHealth).Methods("GET")
	api.HandleFunc("/health/current", vm.handleCurrentHealth).Methods("GET")
	api.HandleFunc("/health/summary", vm.handleHealthSummary).Methods("GET")
	api.HandleFunc("/health/history", vm.handleHealthHistory).Methods("GET")
	api.HandleFunc("/health/thresholds", vm.handleGetHealthThresholds).Methods("GET")
	api.HandleFunc("/health/thresholds", vm.handleSetHealthThresholds).Methods("PUT")
	api.HandleFunc("/health/monitoring/start", vm.handleStartHealthMonitoring).Methods("POST")
	api.HandleFunc("/health/monitoring/stop", vm.handleStopHealthMonitoring).Methods("POST")
	api.HandleFunc("/diagnostics/ping/{host}", vm.handlePing).Methods("POST")
	api.HandleFunc("/diagnostics/traceroute/{host}", vm.handleTraceroute).Methods("POST")
	api.HandleFunc("/diagnostics/bandwidth", vm.handleBandwidthTest).Methods("POST")
	api.HandleFunc("/diagnostics/dns/{hostname}", vm.handleDNSTest).Methods("POST")
	api.HandleFunc("/diagnostics/results", vm.handleDiagnosticsResults).Methods("GET")
	api.HandleFunc("/diagnostics/results/{key}", vm.handleDiagnosticsResult).Methods("GET")
	
	return router
}

// handleGetProfiles returns all VPN profiles
func (vm *VPNManager) handleGetProfiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vm.profiles)
}

// handleGetProfile returns a specific VPN profile
func (vm *VPNManager) handleGetProfile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	
	profile, exists := vm.profiles[id]
	if !exists {
		http.Error(w, "Profile not found", http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profile)
}

// handleImportProfile handles profile import from .ovpn file
func (vm *VPNManager) handleImportProfile(w http.ResponseWriter, r *http.Request) {
	// This will be implemented to handle file upload
	// For now, return a placeholder
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Profile import endpoint - implementation pending file upload handling",
	})
}

// handleDeleteProfile deletes a VPN profile
func (vm *VPNManager) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	
	if err := vm.DeleteProfile(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Profile deleted successfully",
	})
}

// Placeholder handlers for features to be implemented
func (vm *VPNManager) handleExportProfile(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "Export functionality - implementation pending", http.StatusNotImplemented)
}

func (vm *VPNManager) handleValidateProfile(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "Validation endpoint - implementation pending", http.StatusNotImplemented)
}

func (vm *VPNManager) handleConnectionStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	status := vm.connectionManager.GetConnectionStatus()
	json.NewEncoder(w).Encode(status)
}

func (vm *VPNManager) handleConnect(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	
	if err := vm.connectionManager.Connect(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "VPN connection initiated",
		"profile_id": id,
	})
}

func (vm *VPNManager) handleDisconnect(w http.ResponseWriter, r *http.Request) {
	if err := vm.connectionManager.Disconnect(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "VPN disconnected successfully",
	})
}

// handleConnectionHistory returns the VPN connection history
func (vm *VPNManager) handleConnectionHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	history := vm.connectionManager.GetConnectionHistory()
	json.NewEncoder(w).Encode(history)
}

// handleConnectWithFailover connects using failover-enabled connection
func (vm *VPNManager) handleConnectWithFailover(w http.ResponseWriter, r *http.Request) {
	if err := vm.connectionManager.ConnectWithFailover(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Failover connection initiated",
	})
}

// handleEnableFailover enables automatic failover
func (vm *VPNManager) handleEnableFailover(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ProfileIDs []string              `json:"profile_ids"`
		Thresholds *FailoverThresholds   `json:"thresholds,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request data", http.StatusBadRequest)
		return
	}
	
	if len(request.ProfileIDs) == 0 {
		http.Error(w, "At least one profile ID is required", http.StatusBadRequest)
		return
	}
	
	if err := vm.connectionManager.EnableFailover(request.ProfileIDs, request.Thresholds); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Failover enabled successfully",
		"profiles": request.ProfileIDs,
	})
}

// handleDisableFailover disables automatic failover
func (vm *VPNManager) handleDisableFailover(w http.ResponseWriter, r *http.Request) {
	vm.connectionManager.DisableFailover()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Failover disabled successfully",
	})
}

// handleFailoverStatus returns current failover status
func (vm *VPNManager) handleFailoverStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	status := vm.connectionManager.GetFailoverStatus()
	json.NewEncoder(w).Encode(status)
}

// handleTriggerFailover manually triggers a failover
func (vm *VPNManager) handleTriggerFailover(w http.ResponseWriter, r *http.Request) {
	// This will be done in a goroutine since performFailover expects the mutex
	go func() {
		vm.connectionManager.mutex.Lock()
		defer vm.connectionManager.mutex.Unlock()
		
		if err := vm.connectionManager.performFailover(); err != nil {
			log.Printf("Manual failover failed: %v", err)
		}
	}()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Failover triggered",
	})
}

// handleResetFailoverAttempts resets the failed connection attempt counters
func (vm *VPNManager) handleResetFailoverAttempts(w http.ResponseWriter, r *http.Request) {
	vm.connectionManager.ResetConnectionAttempts()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Connection attempt counters reset successfully",
	})
}

func (vm *VPNManager) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	health := map[string]interface{}{
		"vpn_manager": "running",
		"connection_status": vm.connectionManager.GetConnectionStatus(),
		"profiles_loaded": len(vm.profiles),
		"diagnostics_ready": vm.diagnostics != nil,
		"health_monitoring": vm.healthMonitor != nil,
		"timestamp": time.Now(),
	}
	
	json.NewEncoder(w).Encode(health)
}

// handleCurrentHealth returns the current VPN health snapshot
func (vm *VPNManager) handleCurrentHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	currentHealth := vm.healthMonitor.GetCurrentHealth()
	if currentHealth == nil {
		http.Error(w, "No health data available - monitoring may not be started", http.StatusNotFound)
		return
	}
	
	json.NewEncoder(w).Encode(currentHealth)
}

// handleHealthSummary returns aggregated health statistics
func (vm *VPNManager) handleHealthSummary(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	summary := vm.healthMonitor.GetHealthSummary()
	json.NewEncoder(w).Encode(summary)
}

// handleHealthHistory returns health history for a specified time period
func (vm *VPNManager) handleHealthHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	// Get minutes parameter from query
	minutesStr := r.URL.Query().Get("minutes")
	minutes := 60 // Default to 1 hour
	
	if minutesStr != "" {
		if m, err := strconv.Atoi(minutesStr); err == nil && m > 0 {
			minutes = m
		}
	}
	
	history := vm.healthMonitor.GetHealthHistory(minutes)
	json.NewEncoder(w).Encode(history)
}

// handleGetHealthThresholds returns current health alert thresholds
func (vm *VPNManager) handleGetHealthThresholds(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	thresholds := vm.healthMonitor.GetThresholds()
	json.NewEncoder(w).Encode(thresholds)
}

// handleSetHealthThresholds updates health alert thresholds
func (vm *VPNManager) handleSetHealthThresholds(w http.ResponseWriter, r *http.Request) {
	var thresholds VPNHealthThresholds
	if err := json.NewDecoder(r.Body).Decode(&thresholds); err != nil {
		http.Error(w, "Invalid threshold data", http.StatusBadRequest)
		return
	}
	
	// Validate thresholds
	if thresholds.MaxLatencyMs <= 0 || thresholds.MaxPacketLoss < 0 || thresholds.MaxPacketLoss > 100 {
		http.Error(w, "Invalid threshold values", http.StatusBadRequest)
		return
	}
	
	vm.healthMonitor.SetThresholds(thresholds)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Health thresholds updated successfully",
	})
}

// handleStartHealthMonitoring starts VPN health monitoring
func (vm *VPNManager) handleStartHealthMonitoring(w http.ResponseWriter, r *http.Request) {
	var params struct {
		IntervalSeconds int `json:"interval_seconds,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&params); err == nil {
		if params.IntervalSeconds > 0 {
			vm.healthMonitor.SetMonitoringInterval(params.IntervalSeconds)
		}
	}
	
	vm.healthMonitor.StartMonitoring()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Health monitoring started",
	})
}

// handleStopHealthMonitoring stops VPN health monitoring
func (vm *VPNManager) handleStopHealthMonitoring(w http.ResponseWriter, r *http.Request) {
	vm.healthMonitor.StopMonitoring()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Health monitoring stopped",
	})
}

func (vm *VPNManager) handlePing(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	host := vars["host"]
	
	// Parse request body for parameters
	var params PingParameters
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		// Use defaults if no parameters provided
		params = PingParameters{
			Count:    4,
			Timeout:  5,
			Interval: 1.0,
			Size:     32,
		}
	}
	
	result, err := vm.diagnostics.Ping(host, &params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (vm *VPNManager) handleTraceroute(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	host := vars["host"]
	
	// Parse request body for parameters
	var params TracerouteParameters
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		// Use defaults if no parameters provided
		params = TracerouteParameters{
			MaxHops: 30,
			Timeout: 5,
			Queries: 3,
		}
	}
	
	result, err := vm.diagnostics.Traceroute(host, &params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleBandwidthTest performs a bandwidth test
func (vm *VPNManager) handleBandwidthTest(w http.ResponseWriter, r *http.Request) {
	var params struct {
		TestURL  string `json:"test_url,omitempty"`
		Duration int    `json:"duration_seconds,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		// Use defaults if no parameters provided
		params.TestURL = "http://speedtest.wdc01.softlayer.com/downloads/test100.zip"
		params.Duration = 10
	}
	
	if params.TestURL == "" {
		params.TestURL = "http://speedtest.wdc01.softlayer.com/downloads/test100.zip"
	}
	if params.Duration <= 0 {
		params.Duration = 10
	}
	
	result, err := vm.diagnostics.TestBandwidth(params.TestURL, params.Duration)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleDNSTest performs a DNS resolution test
func (vm *VPNManager) handleDNSTest(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	hostname := vars["hostname"]
	
	var params struct {
		DNSServer  string `json:"dns_server,omitempty"`
		RecordType string `json:"record_type,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		// Use defaults if no parameters provided
		params.DNSServer = "8.8.8.8"
		params.RecordType = "A"
	}
	
	if params.DNSServer == "" {
		params.DNSServer = "8.8.8.8"
	}
	if params.RecordType == "" {
		params.RecordType = "A"
	}
	
	result, err := vm.diagnostics.TestDNS(hostname, params.DNSServer, params.RecordType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handleDiagnosticsResults returns all diagnostic results
func (vm *VPNManager) handleDiagnosticsResults(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	results := vm.diagnostics.GetResults()
	json.NewEncoder(w).Encode(results)
}

// handleDiagnosticsResult returns a specific diagnostic result
func (vm *VPNManager) handleDiagnosticsResult(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]
	
	result, exists := vm.diagnostics.GetResult(key)
	if !exists {
		http.Error(w, "Result not found", http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func main() {
	// Initialize VPN manager
	profilesPath := "/config/vpn/profiles"
	statePath := "/var/lib/noc-raven/vpn-state"
	
	vm := NewVPNManager(profilesPath, statePath)
	
	// Load existing profiles
	if err := vm.LoadProfiles(); err != nil {
		log.Fatalf("Failed to load VPN profiles: %v", err)
	}
	
	log.Printf("Loaded %d VPN profiles", len(vm.profiles))
	
	// Test with existing DRT.ovpn file
	if _, err := os.Stat("/config/vpn/DRT.ovpn"); err == nil {
		log.Println("Found DRT.ovpn, importing...")
		profile, err := vm.ImportProfile("/config/vpn/DRT.ovpn", "DRT VPN")
		if err != nil {
			log.Printf("Failed to import DRT.ovpn: %v", err)
		} else {
			log.Printf("Successfully imported profile: %s (validated: %v)", profile.Name, profile.Validated)
		}
	}
	
	// Set up HTTP server
	router := vm.setupRoutes()
	
	log.Println("Starting VPN Manager API server on :8084")
	if err := http.ListenAndServe(":8084", router); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}