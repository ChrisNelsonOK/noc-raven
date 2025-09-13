package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// VPNHealthMonitor provides comprehensive VPN health monitoring
type VPNHealthMonitor struct {
	vm                *VPNManager
	mutex             sync.RWMutex
	healthHistory     []*VPNHealthSnapshot
	monitoring        bool
	monitorStop       chan bool
	intervalSeconds   int
	alertThresholds   VPNHealthThresholds
}

// VPNHealthSnapshot represents a point-in-time health snapshot
type VPNHealthSnapshot struct {
	Timestamp         time.Time            `json:"timestamp"`
	Connected         bool                 `json:"connected"`
	ProfileID         string               `json:"profile_id,omitempty"`
	ProfileName       string               `json:"profile_name,omitempty"`
	ConnectionUptime  int                  `json:"connection_uptime_seconds"`
	LocalIP           string               `json:"local_ip,omitempty"`
	RemoteIP          string               `json:"remote_ip,omitempty"`
	Interface         string               `json:"interface,omitempty"`
	Latency           float64              `json:"latency_ms"`
	PacketLoss        float64              `json:"packet_loss_percent"`
	Throughput        VPNThroughputMetrics `json:"throughput"`
	DNSResolution     bool                 `json:"dns_resolution"`
	RemoteReachable   bool                 `json:"remote_reachable"`
	TunnelStable      bool                 `json:"tunnel_stable"`
	Errors            []string             `json:"errors,omitempty"`
	Warnings          []string             `json:"warnings,omitempty"`
}

// VPNThroughputMetrics represents throughput measurements
type VPNThroughputMetrics struct {
	DownloadSpeedMbps  float64 `json:"download_speed_mbps"`
	UploadSpeedMbps    float64 `json:"upload_speed_mbps"`
	BytesReceived      int64   `json:"bytes_received"`
	BytesSent          int64   `json:"bytes_sent"`
	BytesReceivedDelta int64   `json:"bytes_received_delta"`
	BytesSentDelta     int64   `json:"bytes_sent_delta"`
	MeasurementPeriod  int     `json:"measurement_period_seconds"`
}

// VPNHealthThresholds defines health alert thresholds
type VPNHealthThresholds struct {
	MaxLatencyMs       float64 `json:"max_latency_ms"`
	MaxPacketLoss      float64 `json:"max_packet_loss_percent"`
	MinThroughputMbps  float64 `json:"min_throughput_mbps"`
	MaxReconnectCount  int     `json:"max_reconnect_count"`
}

// VPNHealthSummary provides aggregated health statistics
type VPNHealthSummary struct {
	OverallStatus       string                 `json:"overall_status"` // "healthy", "warning", "critical", "disconnected"
	LastUpdate          time.Time              `json:"last_update"`
	ConnectionUptime    int                    `json:"connection_uptime_seconds"`
	TotalConnections    int                    `json:"total_connections"`
	TotalReconnects     int                    `json:"total_reconnects"`
	SuccessRate         float64                `json:"success_rate_percent"`
	AverageLatency      float64                `json:"average_latency_ms"`
	AveragePacketLoss   float64                `json:"average_packet_loss_percent"`
	AverageThroughput   VPNThroughputMetrics   `json:"average_throughput"`
	RecentAlerts        []VPNHealthAlert       `json:"recent_alerts"`
	PerformanceTrends   VPNPerformanceTrends   `json:"performance_trends"`
}

// VPNHealthAlert represents a health alert
type VPNHealthAlert struct {
	Timestamp   time.Time `json:"timestamp"`
	Severity    string    `json:"severity"` // "info", "warning", "critical"
	Type        string    `json:"type"`     // "latency", "packet_loss", "throughput", "connection"
	Message     string    `json:"message"`
	Value       float64   `json:"value,omitempty"`
	Threshold   float64   `json:"threshold,omitempty"`
	Resolved    bool      `json:"resolved"`
	ResolvedAt  *time.Time `json:"resolved_at,omitempty"`
}

// VPNPerformanceTrends represents performance trend data
type VPNPerformanceTrends struct {
	LatencyTrend       string  `json:"latency_trend"`       // "improving", "stable", "degrading"
	ThroughputTrend    string  `json:"throughput_trend"`    // "improving", "stable", "degrading"
	StabilityTrend     string  `json:"stability_trend"`     // "improving", "stable", "degrading"
	LatencyChange      float64 `json:"latency_change_percent"`
	ThroughputChange   float64 `json:"throughput_change_percent"`
	UptimePercentage   float64 `json:"uptime_percentage_24h"`
}

// NewVPNHealthMonitor creates a new health monitor
func NewVPNHealthMonitor(vm *VPNManager) *VPNHealthMonitor {
	return &VPNHealthMonitor{
		vm:              vm,
		healthHistory:   make([]*VPNHealthSnapshot, 0),
		monitorStop:     make(chan bool, 1),
		intervalSeconds: 30, // Default monitoring interval
		alertThresholds: VPNHealthThresholds{
			MaxLatencyMs:      200.0,
			MaxPacketLoss:     5.0,
			MinThroughputMbps: 1.0,
			MaxReconnectCount: 5,
		},
	}
}

// StartMonitoring begins health monitoring
func (hm *VPNHealthMonitor) StartMonitoring() {
	hm.mutex.Lock()
	if hm.monitoring {
		hm.mutex.Unlock()
		return
	}
	hm.monitoring = true
	hm.mutex.Unlock()

	go hm.monitoringLoop()
	log.Println("VPN health monitoring started")
}

// StopMonitoring stops health monitoring
func (hm *VPNHealthMonitor) StopMonitoring() {
	hm.mutex.Lock()
	if !hm.monitoring {
		hm.mutex.Unlock()
		return
	}
	hm.monitoring = false
	hm.mutex.Unlock()

	hm.monitorStop <- true
	log.Println("VPN health monitoring stopped")
}

// monitoringLoop runs the main health monitoring loop
func (hm *VPNHealthMonitor) monitoringLoop() {
	ticker := time.NewTicker(time.Duration(hm.intervalSeconds) * time.Second)
	defer ticker.Stop()

	var lastSnapshot *VPNHealthSnapshot

	for {
		select {
		case <-ticker.C:
			snapshot := hm.collectHealthSnapshot(lastSnapshot)
			hm.addHealthSnapshot(snapshot)
			lastSnapshot = snapshot

		case <-hm.monitorStop:
			return
		}
	}
}

// collectHealthSnapshot collects current health metrics
func (hm *VPNHealthMonitor) collectHealthSnapshot(lastSnapshot *VPNHealthSnapshot) *VPNHealthSnapshot {
	snapshot := &VPNHealthSnapshot{
		Timestamp: time.Now(),
		Errors:    make([]string, 0),
		Warnings:  make([]string, 0),
	}

	// Get connection status
	connStatus := hm.vm.connectionManager.GetConnectionStatus()
	snapshot.Connected = connStatus.Connected

	if !snapshot.Connected {
		return snapshot
	}

	snapshot.ProfileID = connStatus.ProfileID
	snapshot.ConnectionUptime = connStatus.ConnectionTime
	snapshot.LocalIP = connStatus.LocalIP
	snapshot.RemoteIP = connStatus.RemoteIP

	// Get profile name
	if profile, exists := hm.vm.GetProfile(connStatus.ProfileID); exists {
		snapshot.ProfileName = profile.Name
	}

	// Test latency using ping
	if snapshot.RemoteIP != "" {
		latency, err := hm.measureLatency(snapshot.RemoteIP)
		if err != nil {
			snapshot.Warnings = append(snapshot.Warnings, fmt.Sprintf("Failed to measure latency: %v", err))
		} else {
			snapshot.Latency = latency
			snapshot.RemoteReachable = true
		}
	}

	// Test packet loss
	if snapshot.RemoteIP != "" {
		packetLoss, err := hm.measurePacketLoss(snapshot.RemoteIP)
		if err != nil {
			snapshot.Warnings = append(snapshot.Warnings, fmt.Sprintf("Failed to measure packet loss: %v", err))
		} else {
			snapshot.PacketLoss = packetLoss
		}
	}

	// Measure throughput
	throughput := hm.measureThroughput(connStatus, lastSnapshot)
	snapshot.Throughput = throughput

	// Test DNS resolution
	dnsWorking := hm.testDNSResolution()
	snapshot.DNSResolution = dnsWorking
	if !dnsWorking {
		snapshot.Warnings = append(snapshot.Warnings, "DNS resolution is not working")
	}

	// Check tunnel stability
	snapshot.TunnelStable = hm.checkTunnelStability(snapshot, lastSnapshot)

	// Detect interface
	if connStatus.Connected {
		if iface := hm.detectVPNInterface(); iface != "" {
			snapshot.Interface = iface
		}
	}

	return snapshot
}

// measureLatency measures latency to the remote IP
func (hm *VPNHealthMonitor) measureLatency(remoteIP string) (float64, error) {
	cmd := exec.Command("ping", "-c", "3", "-W", "3", remoteIP)
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	// Parse ping output for average RTT
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "min/avg/max") {
			parts := strings.Split(line, "=")
			if len(parts) >= 2 {
				stats := strings.Split(strings.TrimSpace(parts[1]), "/")
				if len(stats) >= 2 {
					if avg, err := strconv.ParseFloat(stats[1], 64); err == nil {
						return avg, nil
					}
				}
			}
		}
	}

	return 0, fmt.Errorf("could not parse ping output")
}

// measurePacketLoss measures packet loss to the remote IP
func (hm *VPNHealthMonitor) measurePacketLoss(remoteIP string) (float64, error) {
	cmd := exec.Command("ping", "-c", "10", "-W", "3", remoteIP)
	output, err := cmd.Output()
	if err != nil {
		return 100.0, err // Assume 100% loss if command fails
	}

	// Parse ping output for packet loss percentage
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "packet loss") {
			// Extract percentage from line like "0 received, 0% packet loss"
			parts := strings.Fields(line)
			for _, part := range parts {
				if strings.HasSuffix(part, "%") {
					lossStr := strings.TrimSuffix(part, "%")
					if loss, err := strconv.ParseFloat(lossStr, 64); err == nil {
						return loss, nil
					}
				}
			}
		}
	}

	return 0, nil
}

// measureThroughput calculates throughput based on byte counters
func (hm *VPNHealthMonitor) measureThroughput(connStatus *VPNConnectionState, lastSnapshot *VPNHealthSnapshot) VPNThroughputMetrics {
	throughput := VPNThroughputMetrics{
		BytesReceived:     connStatus.BytesReceived,
		BytesSent:         connStatus.BytesSent,
		MeasurementPeriod: hm.intervalSeconds,
	}

	if lastSnapshot != nil {
		// Calculate deltas
		throughput.BytesReceivedDelta = throughput.BytesReceived - lastSnapshot.Throughput.BytesReceived
		throughput.BytesSentDelta = throughput.BytesSent - lastSnapshot.Throughput.BytesSent

		// Calculate speeds in Mbps
		periodSeconds := float64(hm.intervalSeconds)
		if periodSeconds > 0 {
			throughput.DownloadSpeedMbps = float64(throughput.BytesReceivedDelta*8) / (periodSeconds * 1000000)
			throughput.UploadSpeedMbps = float64(throughput.BytesSentDelta*8) / (periodSeconds * 1000000)
		}
	}

	return throughput
}

// testDNSResolution tests if DNS resolution is working
func (hm *VPNHealthMonitor) testDNSResolution() bool {
	// Try to resolve a well-known hostname
	_, err := net.LookupHost("google.com")
	return err == nil
}

// checkTunnelStability checks if the tunnel is stable
func (hm *VPNHealthMonitor) checkTunnelStability(current, last *VPNHealthSnapshot) bool {
	if last == nil {
		return true // First measurement, assume stable
	}

	// Check if connection parameters have changed unexpectedly
	if current.LocalIP != last.LocalIP && last.LocalIP != "" {
		current.Warnings = append(current.Warnings, "Local IP address changed unexpectedly")
		return false
	}

	if current.RemoteIP != last.RemoteIP && last.RemoteIP != "" {
		current.Warnings = append(current.Warnings, "Remote IP address changed unexpectedly")
		return false
	}

	// Check for significant latency spikes
	if last.Latency > 0 && current.Latency > last.Latency*3 {
		current.Warnings = append(current.Warnings, "Significant latency spike detected")
		return false
	}

	return true
}

// detectVPNInterface detects active VPN network interface
func (hm *VPNHealthMonitor) detectVPNInterface() string {
	cmd := exec.Command("ip", "route", "show")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "tun") || strings.Contains(line, "tap") {
			parts := strings.Fields(line)
			for _, part := range parts {
				if strings.HasPrefix(part, "tun") || strings.HasPrefix(part, "tap") {
					return part
				}
			}
		}
	}

	return ""
}

// addHealthSnapshot adds a health snapshot to history
func (hm *VPNHealthMonitor) addHealthSnapshot(snapshot *VPNHealthSnapshot) {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()

	hm.healthHistory = append(hm.healthHistory, snapshot)

	// Keep only the last 2880 snapshots (24 hours at 30-second intervals)
	maxHistory := 2880
	if len(hm.healthHistory) > maxHistory {
		hm.healthHistory = hm.healthHistory[len(hm.healthHistory)-maxHistory:]
	}

	// Check for alerts
	hm.checkHealthAlerts(snapshot)
}

// checkHealthAlerts checks if any health thresholds are exceeded
func (hm *VPNHealthMonitor) checkHealthAlerts(snapshot *VPNHealthSnapshot) {
	if !snapshot.Connected {
		return
	}

	// Check latency threshold
	if snapshot.Latency > hm.alertThresholds.MaxLatencyMs {
		log.Printf("Health Alert: High latency detected: %.2f ms (threshold: %.2f ms)", 
			snapshot.Latency, hm.alertThresholds.MaxLatencyMs)
	}

	// Check packet loss threshold
	if snapshot.PacketLoss > hm.alertThresholds.MaxPacketLoss {
		log.Printf("Health Alert: High packet loss detected: %.2f%% (threshold: %.2f%%)", 
			snapshot.PacketLoss, hm.alertThresholds.MaxPacketLoss)
	}

	// Check throughput threshold
	avgThroughput := (snapshot.Throughput.DownloadSpeedMbps + snapshot.Throughput.UploadSpeedMbps) / 2
	if avgThroughput > 0 && avgThroughput < hm.alertThresholds.MinThroughputMbps {
		log.Printf("Health Alert: Low throughput detected: %.2f Mbps (threshold: %.2f Mbps)", 
			avgThroughput, hm.alertThresholds.MinThroughputMbps)
	}
}

// GetCurrentHealth returns the current health status
func (hm *VPNHealthMonitor) GetCurrentHealth() *VPNHealthSnapshot {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()

	if len(hm.healthHistory) == 0 {
		return nil
	}

	return hm.healthHistory[len(hm.healthHistory)-1]
}

// GetHealthHistory returns recent health history
func (hm *VPNHealthMonitor) GetHealthHistory(minutes int) []*VPNHealthSnapshot {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()

	if minutes <= 0 {
		minutes = 60 // Default to last hour
	}

	cutoff := time.Now().Add(-time.Duration(minutes) * time.Minute)
	history := make([]*VPNHealthSnapshot, 0)

	for _, snapshot := range hm.healthHistory {
		if snapshot.Timestamp.After(cutoff) {
			history = append(history, snapshot)
		}
	}

	return history
}

// GetHealthSummary returns aggregated health statistics
func (hm *VPNHealthMonitor) GetHealthSummary() *VPNHealthSummary {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()

	summary := &VPNHealthSummary{
		LastUpdate:    time.Now(),
		RecentAlerts:  make([]VPNHealthAlert, 0),
	}

	if len(hm.healthHistory) == 0 {
		summary.OverallStatus = "unknown"
		return summary
	}

	latest := hm.healthHistory[len(hm.healthHistory)-1]
	if !latest.Connected {
		summary.OverallStatus = "disconnected"
		return summary
	}

	summary.ConnectionUptime = latest.ConnectionUptime

	// Calculate averages from last hour of data
	hourData := hm.GetHealthHistory(60)
	if len(hourData) == 0 {
		summary.OverallStatus = "unknown"
		return summary
	}

	var totalLatency, totalPacketLoss, totalDownload, totalUpload float64
	var validSamples int

	for _, snapshot := range hourData {
		if snapshot.Connected {
			totalLatency += snapshot.Latency
			totalPacketLoss += snapshot.PacketLoss
			totalDownload += snapshot.Throughput.DownloadSpeedMbps
			totalUpload += snapshot.Throughput.UploadSpeedMbps
			validSamples++
		}
	}

	if validSamples > 0 {
		summary.AverageLatency = totalLatency / float64(validSamples)
		summary.AveragePacketLoss = totalPacketLoss / float64(validSamples)
		summary.AverageThroughput = VPNThroughputMetrics{
			DownloadSpeedMbps: totalDownload / float64(validSamples),
			UploadSpeedMbps:   totalUpload / float64(validSamples),
		}
	}

	// Calculate success rate (uptime percentage)
	if len(hourData) > 0 {
		upSamples := 0
		for _, snapshot := range hourData {
			if snapshot.Connected {
				upSamples++
			}
		}
		summary.SuccessRate = float64(upSamples) / float64(len(hourData)) * 100.0
	}

	// Determine overall status
	if summary.AverageLatency > hm.alertThresholds.MaxLatencyMs || 
	   summary.AveragePacketLoss > hm.alertThresholds.MaxPacketLoss {
		summary.OverallStatus = "critical"
	} else if summary.AverageLatency > hm.alertThresholds.MaxLatencyMs*0.8 || 
	          summary.AveragePacketLoss > hm.alertThresholds.MaxPacketLoss*0.8 {
		summary.OverallStatus = "warning"
	} else {
		summary.OverallStatus = "healthy"
	}

	return summary
}

// SetThresholds updates health alert thresholds
func (hm *VPNHealthMonitor) SetThresholds(thresholds VPNHealthThresholds) {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()
	
	hm.alertThresholds = thresholds
}

// GetThresholds returns current health thresholds
func (hm *VPNHealthMonitor) GetThresholds() VPNHealthThresholds {
	hm.mutex.RLock()
	defer hm.mutex.RUnlock()
	
	return hm.alertThresholds
}

// SetMonitoringInterval sets the monitoring interval
func (hm *VPNHealthMonitor) SetMonitoringInterval(seconds int) {
	hm.mutex.Lock()
	defer hm.mutex.Unlock()
	
	if seconds < 10 {
		seconds = 10 // Minimum 10 second interval
	}
	hm.intervalSeconds = seconds
}