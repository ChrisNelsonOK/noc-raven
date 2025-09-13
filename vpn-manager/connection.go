package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// VPNConnectionHistory represents historical connection data
type VPNConnectionHistory struct {
	ProfileID        string    `json:"profile_id"`
	ProfileName      string    `json:"profile_name"`
	ConnectedAt      time.Time `json:"connected_at"`
	DisconnectedAt   *time.Time `json:"disconnected_at,omitempty"`
	Duration         int       `json:"duration_seconds"`
	BytesReceived    int64     `json:"bytes_received"`
	BytesSent        int64     `json:"bytes_sent"`
	DisconnectReason string    `json:"disconnect_reason,omitempty"`
	Success          bool      `json:"success"`
}

// VPNConnectionManager handles VPN connection lifecycle
type VPNConnectionManager struct {
	vm                  *VPNManager
	statePath           string
	historyPath         string
	mutex               sync.RWMutex
	activeConn          *VPNConnection
	history             []*VPNConnectionHistory
	statusFile          string
	historyFile         string
	monitoring          bool
	monitorStop         chan bool
	failoverEnabled     bool
	failoverProfiles    []string // Profile IDs in priority order
	failoverThresholds  FailoverThresholds
	connectionAttempts  map[string]int // Track failed connection attempts per profile
	lastFailoverTime    time.Time
	failoverCooldown    time.Duration
}

// FailoverThresholds defines when to trigger failover
type FailoverThresholds struct {
	MaxLatencyMs        float64       `json:"max_latency_ms"`
	MaxPacketLoss       float64       `json:"max_packet_loss_percent"`
	MaxConnectionTime   time.Duration `json:"max_connection_time_seconds"`
	MaxFailedAttempts   int           `json:"max_failed_attempts"`
	HealthCheckInterval time.Duration `json:"health_check_interval_seconds"`
}

// VPNProfileConfig represents profile-specific configuration
type VPNProfileConfig struct {
	ProfileID      string `json:"profile_id"`
	Priority       int    `json:"priority"` // Lower number = higher priority
	Enabled        bool   `json:"enabled"`
	MaxRetries     int    `json:"max_retries"`
	RetryDelay     int    `json:"retry_delay_seconds"`
	HealthRequired bool   `json:"health_required"` // Require health checks before considering stable
}

// VPNConnection represents an active VPN connection
type VPNConnection struct {
	Profile       *VPNProfile      `json:"profile"`
	Process       *os.Process      `json:"-"`
	PidFile       string           `json:"pid_file"`
	LogFile       string           `json:"log_file"`
	StatusFile    string           `json:"status_file"`
	ConfigFile    string           `json:"config_file"`
	StartedAt     time.Time        `json:"started_at"`
	LastSeen      time.Time        `json:"last_seen"`
	State         string           `json:"state"` // "connecting", "connected", "disconnecting", "disconnected"
	Interface     string           `json:"interface,omitempty"`
	LocalIP       string           `json:"local_ip,omitempty"`
	RemoteIP      string           `json:"remote_ip,omitempty"`
	BytesIn       int64            `json:"bytes_in"`
	BytesOut      int64            `json:"bytes_out"`
	Reconnects    int              `json:"reconnects"`
}

// NewVPNConnectionManager creates a new connection manager
func NewVPNConnectionManager(vm *VPNManager, statePath string) *VPNConnectionManager {
	cm := &VPNConnectionManager{
		vm:                 vm,
		statePath:          statePath,
		historyPath:        filepath.Join(statePath, "history"),
		statusFile:         filepath.Join(statePath, "current_connection.json"),
		historyFile:        filepath.Join(statePath, "connection_history.json"),
		monitorStop:        make(chan bool, 1),
		failoverEnabled:    false,
		failoverProfiles:   make([]string, 0),
		connectionAttempts: make(map[string]int),
		failoverCooldown:   5 * time.Minute,
		failoverThresholds: FailoverThresholds{
			MaxLatencyMs:        300.0,
			MaxPacketLoss:       10.0,
			MaxConnectionTime:   30 * time.Second,
			MaxFailedAttempts:   3,
			HealthCheckInterval: 60 * time.Second,
		},
	}

	// Ensure directories exist
	os.MkdirAll(statePath, 0755)
	os.MkdirAll(cm.historyPath, 0755)

	// Load existing state
	cm.loadConnectionState()
	cm.loadConnectionHistory()

	return cm
}

// Connect establishes a VPN connection using the specified profile
func (cm *VPNConnectionManager) Connect(profileID string) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	// Check if already connected
	if cm.activeConn != nil && cm.activeConn.State == "connected" {
		return fmt.Errorf("VPN already connected to profile: %s", cm.activeConn.Profile.Name)
	}

	return cm.connectInternal(profileID)
}

// Disconnect terminates the current VPN connection
func (cm *VPNConnectionManager) Disconnect() error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	
	return cm.disconnectInternal()
}

// disconnectInternal performs the actual disconnection (requires lock)
func (cm *VPNConnectionManager) disconnectInternal() error {
	if cm.activeConn == nil {
		return fmt.Errorf("no active connection")
	}

	conn := cm.activeConn
	conn.State = "disconnecting"
	cm.saveConnectionState()

	// Terminate OpenVPN process
	if err := cm.stopOpenVPN(conn); err != nil {
		log.Printf("Warning: error stopping OpenVPN: %v", err)
	}

	// Record connection history
	duration := int(time.Since(conn.StartedAt).Seconds())
	history := &VPNConnectionHistory{
		ProfileID:        conn.Profile.ID,
		ProfileName:      conn.Profile.Name,
		ConnectedAt:      conn.StartedAt,
		DisconnectedAt:   &[]time.Time{time.Now()}[0],
		Duration:         duration,
		BytesReceived:    conn.BytesIn,
		BytesSent:        conn.BytesOut,
		DisconnectReason: "user_requested",
		Success:          conn.State == "connected",
	}

	cm.addConnectionHistory(history)

	// Clean up temporary files
	os.Remove(conn.ConfigFile)
	os.Remove(conn.PidFile)
	os.Remove(conn.StatusFile)

	cm.activeConn = nil
	cm.saveConnectionState()

	log.Printf("VPN disconnected from profile: %s (duration: %d seconds)", 
		conn.Profile.Name, duration)
	
	return nil
}

// startOpenVPN starts the OpenVPN process
func (cm *VPNConnectionManager) startOpenVPN(conn *VPNConnection) error {
	// Build OpenVPN command
	args := []string{
		"--config", conn.ConfigFile,
		"--daemon",
		"--log", conn.LogFile,
		"--writepid", conn.PidFile,
		"--status", conn.StatusFile, "10",
		"--script-security", "2",
		"--up-delay",
		"--up-restart",
		"--connect-retry-max", "3",
		"--connect-retry", "10",
		"--verb", "3",
	}

	// Add auth file if required
	if conn.Profile.AuthUserPass != "" && conn.Profile.AuthUserPass != "required" {
		args = append(args, "--auth-user-pass", conn.Profile.AuthUserPass)
	}

	// Start the process
	cmd := exec.Command("openvpn", args...)
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start OpenVPN process: %v", err)
	}

	conn.Process = cmd.Process
	log.Printf("Started OpenVPN process PID %d for profile %s", 
		cmd.Process.Pid, conn.Profile.Name)

	return nil
}

// stopOpenVPN stops the OpenVPN process
func (cm *VPNConnectionManager) stopOpenVPN(conn *VPNConnection) error {
	// Try to read PID from file
	if pidData, err := os.ReadFile(conn.PidFile); err == nil {
		if pid, err := strconv.Atoi(strings.TrimSpace(string(pidData))); err == nil {
			if process, err := os.FindProcess(pid); err == nil {
				log.Printf("Terminating OpenVPN process PID %d", pid)
				if err := process.Signal(os.Interrupt); err == nil {
					// Give it time to shut down gracefully
					time.Sleep(2 * time.Second)
					// Force kill if still running
					process.Kill()
				}
			}
		}
	}

	// Also try to kill by process if we have it
	if conn.Process != nil {
		conn.Process.Signal(os.Interrupt)
		time.Sleep(2 * time.Second)
		conn.Process.Kill()
	}

	// Kill any remaining OpenVPN processes (nuclear option)
	exec.Command("pkill", "-f", "openvpn.*"+conn.Profile.ID).Run()

	return nil
}

// startConnectionMonitoring monitors the VPN connection status
func (cm *VPNConnectionManager) startConnectionMonitoring() {
	cm.monitoring = true
	defer func() { cm.monitoring = false }()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	log.Println("Starting VPN connection monitoring")

	for {
		select {
		case <-ticker.C:
			cm.mutex.Lock()
			if cm.activeConn != nil {
				cm.updateConnectionStatus(cm.activeConn)
				cm.saveConnectionState()
			}
			cm.mutex.Unlock()

		case <-cm.monitorStop:
			log.Println("Stopping VPN connection monitoring")
			return
		}
	}
}

// updateConnectionStatus updates the connection status by reading OpenVPN status
func (cm *VPNConnectionManager) updateConnectionStatus(conn *VPNConnection) {
	conn.LastSeen = time.Now()

	// Check if process is still running
	if !cm.isProcessRunning(conn) {
		if conn.State == "connected" || conn.State == "connecting" {
			log.Printf("OpenVPN process died unexpectedly for profile: %s", conn.Profile.Name)
			conn.State = "disconnected"
			
			// Record failure in history
			duration := int(time.Since(conn.StartedAt).Seconds())
			history := &VPNConnectionHistory{
				ProfileID:        conn.Profile.ID,
				ProfileName:      conn.Profile.Name,
				ConnectedAt:      conn.StartedAt,
				DisconnectedAt:   &[]time.Time{time.Now()}[0],
				Duration:         duration,
				BytesReceived:    conn.BytesIn,
				BytesSent:        conn.BytesOut,
				DisconnectReason: "process_died",
				Success:          false,
			}
			cm.addConnectionHistory(history)
			cm.activeConn = nil

			// Attempt automatic failover if enabled
			if cm.failoverEnabled {
				log.Println("Attempting automatic failover due to connection failure")
				go func() {
					// Small delay to allow cleanup
					time.Sleep(2 * time.Second)
					if err := cm.performFailover(); err != nil {
						log.Printf("Automatic failover failed: %v", err)
					}
				}()
			}
		}
		return
	}

	// Check for failover conditions if connected
	if conn.State == "connected" || conn.State == "connecting" {
		if cm.checkFailoverConditions(conn) {
			log.Println("Failover conditions met, attempting failover")
			go func() {
				if err := cm.performFailover(); err != nil {
					log.Printf("Failover attempt failed: %v", err)
				}
			}()
			return
		}
	}

	// Read OpenVPN status file
	if statusData, err := os.ReadFile(conn.StatusFile); err == nil {
		cm.parseOpenVPNStatus(conn, string(statusData))
	}

	// Check for VPN interface
	if conn.State == "connecting" || conn.State == "connected" {
		if iface := cm.detectVPNInterface(); iface != "" {
			conn.Interface = iface
			if conn.State == "connecting" {
				conn.State = "connected"
				log.Printf("VPN connection established for profile: %s (interface: %s)", 
					conn.Profile.Name, conn.Interface)
			}
		}
	}

	// Update traffic statistics
	if conn.Interface != "" {
		if stats := cm.getInterfaceStats(conn.Interface); stats != nil {
			conn.BytesIn = stats.BytesReceived
			conn.BytesOut = stats.BytesSent
		}
	}
}

// parseOpenVPNStatus parses OpenVPN status file output
func (cm *VPNConnectionManager) parseOpenVPNStatus(conn *VPNConnection, statusContent string) {
	lines := strings.Split(statusContent, "\n")
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		
		if strings.HasPrefix(line, "Virtual Address,") {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 {
				conn.LocalIP = parts[1]
			}
		} else if strings.HasPrefix(line, "Real Address,") {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 {
				conn.RemoteIP = parts[1]
			}
		}
	}
}

// isProcessRunning checks if the OpenVPN process is still running
func (cm *VPNConnectionManager) isProcessRunning(conn *VPNConnection) bool {
	// Check PID file
	if pidData, err := os.ReadFile(conn.PidFile); err == nil {
		if pid, err := strconv.Atoi(strings.TrimSpace(string(pidData))); err == nil {
			if process, err := os.FindProcess(pid); err == nil {
				// Send signal 0 to check if process exists
				if err := process.Signal(os.Signal(0)); err == nil {
					return true
				}
			}
		}
	}

	// Also check our stored process
	if conn.Process != nil {
		if err := conn.Process.Signal(os.Signal(0)); err == nil {
			return true
		}
	}

	return false
}

// detectVPNInterface detects the VPN network interface
func (cm *VPNConnectionManager) detectVPNInterface() string {
	// Check for tun/tap interfaces
	cmd := exec.Command("ip", "link", "show")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "tun") || strings.Contains(line, "tap") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name := strings.TrimSuffix(parts[1], ":")
				if strings.HasPrefix(name, "tun") || strings.HasPrefix(name, "tap") {
					return name
				}
			}
		}
	}

	return ""
}

// getInterfaceStats gets network interface statistics
func (cm *VPNConnectionManager) getInterfaceStats(iface string) *VPNHealthMetrics {
	statsFile := fmt.Sprintf("/sys/class/net/%s/statistics", iface)
	
	rxBytesData, err1 := os.ReadFile(filepath.Join(statsFile, "rx_bytes"))
	txBytesData, err2 := os.ReadFile(filepath.Join(statsFile, "tx_bytes"))
	
	if err1 != nil || err2 != nil {
		return nil
	}

	rxBytes, err1 := strconv.ParseInt(strings.TrimSpace(string(rxBytesData)), 10, 64)
	txBytes, err2 := strconv.ParseInt(strings.TrimSpace(string(txBytesData)), 10, 64)
	
	if err1 != nil || err2 != nil {
		return nil
	}

	return &VPNHealthMetrics{
		LastHealthCheck: time.Now(),
	}
}

// GetConnectionStatus returns the current connection status
func (cm *VPNConnectionManager) GetConnectionStatus() *VPNConnectionState {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	if cm.activeConn == nil {
		return &VPNConnectionState{
			Connected: false,
			Health: VPNHealthMetrics{
				LastHealthCheck: time.Now(),
			},
		}
	}

	conn := cm.activeConn
	connectedAt := conn.StartedAt
	var connectionTime int
	if conn.State == "connected" {
		connectionTime = int(time.Since(conn.StartedAt).Seconds())
	}

	return &VPNConnectionState{
		ProfileID:      conn.Profile.ID,
		Connected:      conn.State == "connected",
		ConnectedAt:    &connectedAt,
		ConnectionTime: connectionTime,
		LocalIP:        conn.LocalIP,
		RemoteIP:       conn.RemoteIP,
		BytesReceived:  conn.BytesIn,
		BytesSent:      conn.BytesOut,
		RetryCount:     conn.Reconnects,
		Health: VPNHealthMetrics{
			LastHealthCheck: conn.LastSeen,
		},
	}
}

// GetConnectionHistory returns the connection history
func (cm *VPNConnectionManager) GetConnectionHistory() []*VPNConnectionHistory {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()
	
	// Return a copy to prevent race conditions
	history := make([]*VPNConnectionHistory, len(cm.history))
	copy(history, cm.history)
	return history
}

// saveConnectionState saves the current connection state to disk
func (cm *VPNConnectionManager) saveConnectionState() {
	if cm.activeConn == nil {
		// Remove status file if no active connection
		os.Remove(cm.statusFile)
		return
	}

	file, err := os.Create(cm.statusFile)
	if err != nil {
		log.Printf("Warning: failed to save connection state: %v", err)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(cm.activeConn); err != nil {
		log.Printf("Warning: failed to encode connection state: %v", err)
	}
}

// loadConnectionState loads the connection state from disk
func (cm *VPNConnectionManager) loadConnectionState() {
	file, err := os.Open(cm.statusFile)
	if err != nil {
		// No existing state file is OK
		return
	}
	defer file.Close()

	var conn VPNConnection
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&conn); err != nil {
		log.Printf("Warning: failed to decode connection state: %v", err)
		return
	}

	// Verify the connection is still valid
	if cm.isProcessRunning(&conn) {
		cm.activeConn = &conn
		log.Printf("Restored VPN connection state for profile: %s", conn.Profile.Name)
		
		// Resume monitoring
		if !cm.monitoring {
			go cm.startConnectionMonitoring()
		}
	} else {
		// Connection was lost, clean up
		log.Printf("Previous VPN connection to %s was lost", conn.Profile.Name)
		os.Remove(conn.ConfigFile)
		os.Remove(conn.PidFile)
		os.Remove(conn.StatusFile)
		os.Remove(cm.statusFile)
	}
}

// addConnectionHistory adds a connection record to history
func (cm *VPNConnectionManager) addConnectionHistory(history *VPNConnectionHistory) {
	cm.history = append(cm.history, history)
	
	// Keep only last 100 entries
	if len(cm.history) > 100 {
		cm.history = cm.history[len(cm.history)-100:]
	}
	
	cm.saveConnectionHistory()
}

// saveConnectionHistory saves connection history to disk
func (cm *VPNConnectionManager) saveConnectionHistory() {
	file, err := os.Create(cm.historyFile)
	if err != nil {
		log.Printf("Warning: failed to save connection history: %v", err)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(cm.history); err != nil {
		log.Printf("Warning: failed to encode connection history: %v", err)
	}
}

// loadConnectionHistory loads connection history from disk
func (cm *VPNConnectionManager) loadConnectionHistory() {
	file, err := os.Open(cm.historyFile)
	if err != nil {
		// No existing history file is OK
		return
	}
	defer file.Close()

	var history []*VPNConnectionHistory
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&history); err != nil {
		log.Printf("Warning: failed to decode connection history: %v", err)
		return
	}

	cm.history = history
	log.Printf("Loaded %d connection history records", len(cm.history))
}

// EnableFailover enables automatic failover with the specified profile list
func (cm *VPNConnectionManager) EnableFailover(profileIDs []string, thresholds *FailoverThresholds) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	// Validate all profiles exist and are valid
	for _, profileID := range profileIDs {
		profile, exists := cm.vm.GetProfile(profileID)
		if !exists {
			return fmt.Errorf("profile not found: %s", profileID)
		}
		if !profile.Validated {
			return fmt.Errorf("profile not validated: %s (%s)", profileID, profile.ValidationError)
		}
	}

	cm.failoverEnabled = true
	cm.failoverProfiles = profileIDs
	if thresholds != nil {
		cm.failoverThresholds = *thresholds
	}

	// Reset connection attempts
	cm.connectionAttempts = make(map[string]int)

	log.Printf("Failover enabled with %d profiles", len(profileIDs))
	return nil
}

// DisableFailover disables automatic failover
func (cm *VPNConnectionManager) DisableFailover() {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	cm.failoverEnabled = false
	cm.failoverProfiles = make([]string, 0)
	log.Println("Failover disabled")
}

// ConnectWithFailover attempts to connect with failover support
func (cm *VPNConnectionManager) ConnectWithFailover() error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	if !cm.failoverEnabled || len(cm.failoverProfiles) == 0 {
		return fmt.Errorf("failover not enabled or no profiles configured")
	}

	// Try profiles in priority order
	for _, profileID := range cm.failoverProfiles {
		// Skip profiles that have exceeded max attempts
		if cm.connectionAttempts[profileID] >= cm.failoverThresholds.MaxFailedAttempts {
			log.Printf("Skipping profile %s: max attempts exceeded", profileID)
			continue
		}

		log.Printf("Attempting to connect to profile: %s", profileID)
		if err := cm.connectInternal(profileID); err != nil {
			cm.connectionAttempts[profileID]++
			log.Printf("Connection to profile %s failed (attempt %d): %v", 
				profileID, cm.connectionAttempts[profileID], err)
			continue
		}

		// Connection successful, reset attempt counter
		cm.connectionAttempts[profileID] = 0
		return nil
	}

	return fmt.Errorf("all failover profiles exhausted")
}

// connectInternal internal connection method used by both Connect and failover
func (cm *VPNConnectionManager) connectInternal(profileID string) error {
	// Get the profile
	profile, exists := cm.vm.GetProfile(profileID)
	if !exists {
		return fmt.Errorf("profile not found: %s", profileID)
	}

	if !profile.Validated {
		return fmt.Errorf("profile not validated: %s", profile.ValidationError)
	}

	// Disconnect existing connection if any
	if cm.activeConn != nil {
		if err := cm.disconnectInternal(); err != nil {
			log.Printf("Warning: failed to disconnect existing connection: %v", err)
		}
	}

	// Create connection
	conn := &VPNConnection{
		Profile:    profile,
		StartedAt:  time.Now(),
		LastSeen:   time.Now(),
		State:      "connecting",
		PidFile:    filepath.Join(cm.statePath, fmt.Sprintf("openvpn_%s.pid", profile.ID)),
		LogFile:    filepath.Join(cm.statePath, fmt.Sprintf("openvpn_%s.log", profile.ID)),
		StatusFile: filepath.Join(cm.statePath, fmt.Sprintf("openvpn_%s.status", profile.ID)),
		ConfigFile: filepath.Join(cm.statePath, fmt.Sprintf("temp_%s.ovpn", profile.ID)),
	}

	// Export profile to temporary config file
	if err := cm.vm.ExportProfile(profileID, conn.ConfigFile); err != nil {
		return fmt.Errorf("failed to export profile config: %v", err)
	}

	// Start OpenVPN process
	if err := cm.startOpenVPN(conn); err != nil {
		return fmt.Errorf("failed to start OpenVPN: %v", err)
	}

	cm.activeConn = conn
	
	// Save state immediately
	cm.saveConnectionState()

	// Start monitoring if not already running
	if !cm.monitoring {
		go cm.startConnectionMonitoring()
	}

	log.Printf("VPN connection initiated for profile: %s", profile.Name)
	return nil
}

// checkFailoverConditions checks if failover should be triggered
func (cm *VPNConnectionManager) checkFailoverConditions(conn *VPNConnection) bool {
	if !cm.failoverEnabled || len(cm.failoverProfiles) <= 1 {
		return false
	}

	// Don't failover too frequently
	if time.Since(cm.lastFailoverTime) < cm.failoverCooldown {
		return false
	}

	// Get current health metrics if available
	if cm.vm.healthMonitor != nil {
		currentHealth := cm.vm.healthMonitor.GetCurrentHealth()
		if currentHealth != nil && currentHealth.Connected {
			// Check latency threshold
			if currentHealth.Latency > cm.failoverThresholds.MaxLatencyMs {
				log.Printf("Failover triggered by high latency: %.2f ms", currentHealth.Latency)
				return true
			}

			// Check packet loss threshold
			if currentHealth.PacketLoss > cm.failoverThresholds.MaxPacketLoss {
				log.Printf("Failover triggered by high packet loss: %.2f%%", currentHealth.PacketLoss)
				return true
			}
		}
	}

	// Check connection time (if taking too long to establish)
	if conn.State == "connecting" && time.Since(conn.StartedAt) > cm.failoverThresholds.MaxConnectionTime {
		log.Printf("Failover triggered by connection timeout: %v", time.Since(conn.StartedAt))
		return true
	}

	return false
}

// performFailover performs automatic failover to the next available profile
func (cm *VPNConnectionManager) performFailover() error {
	if !cm.failoverEnabled || len(cm.failoverProfiles) <= 1 {
		return fmt.Errorf("failover not enabled or insufficient profiles")
	}

	// Find current profile index
	currentProfileID := ""
	if cm.activeConn != nil {
		currentProfileID = cm.activeConn.Profile.ID
	}

	currentIndex := -1
	for i, profileID := range cm.failoverProfiles {
		if profileID == currentProfileID {
			currentIndex = i
			break
		}
	}

	// Try next profiles in order
	startIndex := (currentIndex + 1) % len(cm.failoverProfiles)
	for i := 0; i < len(cm.failoverProfiles)-1; i++ {
		nextIndex := (startIndex + i) % len(cm.failoverProfiles)
		nextProfileID := cm.failoverProfiles[nextIndex]

		// Skip if max attempts exceeded
		if cm.connectionAttempts[nextProfileID] >= cm.failoverThresholds.MaxFailedAttempts {
			continue
		}

		log.Printf("Attempting failover to profile: %s", nextProfileID)
		if err := cm.connectInternal(nextProfileID); err != nil {
			cm.connectionAttempts[nextProfileID]++
			log.Printf("Failover to profile %s failed: %v", nextProfileID, err)
			continue
		}

		// Successful failover
		cm.lastFailoverTime = time.Now()
		cm.connectionAttempts[nextProfileID] = 0
		log.Printf("Failover successful to profile: %s", nextProfileID)
		return nil
	}

	return fmt.Errorf("all failover profiles failed")
}

// GetFailoverStatus returns current failover configuration and status
func (cm *VPNConnectionManager) GetFailoverStatus() map[string]interface{} {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	status := map[string]interface{}{
		"enabled":              cm.failoverEnabled,
		"profiles":             cm.failoverProfiles,
		"thresholds":           cm.failoverThresholds,
		"connection_attempts":  cm.connectionAttempts,
		"last_failover_time":   cm.lastFailoverTime,
		"failover_cooldown":    cm.failoverCooldown,
	}

	if cm.activeConn != nil {
		status["current_profile"] = cm.activeConn.Profile.ID
		status["current_profile_name"] = cm.activeConn.Profile.Name
	}

	return status
}

// ResetConnectionAttempts resets the failed connection attempt counters
func (cm *VPNConnectionManager) ResetConnectionAttempts() {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	cm.connectionAttempts = make(map[string]int)
	log.Println("Connection attempt counters reset")
}

// Stop stops the connection manager and cleans up
func (cm *VPNConnectionManager) Stop() {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	if cm.monitoring {
		cm.monitorStop <- true
	}

	if cm.activeConn != nil {
		cm.disconnectInternal()
	}
}
