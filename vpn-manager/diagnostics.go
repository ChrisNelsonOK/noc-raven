package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// NetworkDiagnostics handles network diagnostic operations
type NetworkDiagnostics struct {
	mutex   sync.RWMutex
	results map[string]*DiagnosticResult
}

// DiagnosticResult represents the result of a network diagnostic test
type DiagnosticResult struct {
	TestType    string                 `json:"test_type"`
	Target      string                 `json:"target"`
	StartTime   time.Time              `json:"start_time"`
	EndTime     time.Time              `json:"end_time"`
	Duration    int                    `json:"duration_ms"`
	Success     bool                   `json:"success"`
	Error       string                 `json:"error,omitempty"`
	Data        map[string]interface{} `json:"data"`
	Parameters  map[string]interface{} `json:"parameters,omitempty"`
}

// PingResult represents ping test results
type PingResult struct {
	PacketsSent     int     `json:"packets_sent"`
	PacketsReceived int     `json:"packets_received"`
	PacketLoss      float64 `json:"packet_loss_percent"`
	MinRTT          float64 `json:"min_rtt_ms"`
	MaxRTT          float64 `json:"max_rtt_ms"`
	AvgRTT          float64 `json:"avg_rtt_ms"`
	StdDevRTT       float64 `json:"stddev_rtt_ms"`
	RTTs            []float64 `json:"rtts"`
}

// TracerouteHop represents a single hop in a traceroute
type TracerouteHop struct {
	HopNumber int       `json:"hop_number"`
	IP        string    `json:"ip"`
	Hostname  string    `json:"hostname,omitempty"`
	RTT1      float64   `json:"rtt1_ms"`
	RTT2      float64   `json:"rtt2_ms"`
	RTT3      float64   `json:"rtt3_ms"`
	AvgRTT    float64   `json:"avg_rtt_ms"`
	Timeout   bool      `json:"timeout"`
}

// TracerouteResult represents traceroute test results
type TracerouteResult struct {
	Target    string          `json:"target"`
	Hops      []TracerouteHop `json:"hops"`
	Completed bool            `json:"completed"`
	MaxHops   int             `json:"max_hops"`
}

// BandwidthResult represents bandwidth test results
type BandwidthResult struct {
	DownloadSpeed   float64 `json:"download_speed_mbps"`
	UploadSpeed     float64 `json:"upload_speed_mbps"`
	Latency         float64 `json:"latency_ms"`
	Jitter          float64 `json:"jitter_ms"`
	TestServer      string  `json:"test_server"`
	DataTransferred int64   `json:"data_transferred_bytes"`
}

// DNSResult represents DNS resolution test results
type DNSResult struct {
	Hostname     string   `json:"hostname"`
	IPs          []string `json:"ips"`
	ResponseTime float64  `json:"response_time_ms"`
	Server       string   `json:"dns_server"`
	RecordType   string   `json:"record_type"`
}

// PingParameters represents ping test parameters
type PingParameters struct {
	Count    int     `json:"count"`
	Timeout  int     `json:"timeout_seconds"`
	Interval float64 `json:"interval_seconds"`
	Size     int     `json:"packet_size"`
}

// TracerouteParameters represents traceroute test parameters
type TracerouteParameters struct {
	MaxHops int `json:"max_hops"`
	Timeout int `json:"timeout_seconds"`
	Queries int `json:"queries_per_hop"`
}

// NewNetworkDiagnostics creates a new network diagnostics instance
func NewNetworkDiagnostics() *NetworkDiagnostics {
	return &NetworkDiagnostics{
		results: make(map[string]*DiagnosticResult),
	}
}

// Ping performs a ping test to the specified host
func (nd *NetworkDiagnostics) Ping(host string, params *PingParameters) (*DiagnosticResult, error) {
	if params == nil {
		params = &PingParameters{
			Count:    4,
			Timeout:  5,
			Interval: 1.0,
			Size:     32,
		}
	}

	result := &DiagnosticResult{
		TestType:  "ping",
		Target:    host,
		StartTime: time.Now(),
		Parameters: map[string]interface{}{
			"count":    params.Count,
			"timeout":  params.Timeout,
			"interval": params.Interval,
			"size":     params.Size,
		},
		Data: make(map[string]interface{}),
	}

	// Build ping command
	args := []string{
		"-c", strconv.Itoa(params.Count),
		"-W", strconv.Itoa(params.Timeout),
		"-i", fmt.Sprintf("%.1f", params.Interval),
		"-s", strconv.Itoa(params.Size),
		host,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 
		time.Duration(params.Count*params.Timeout+10)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ping", args...)
	output, err := cmd.CombinedOutput()

	result.EndTime = time.Now()
	result.Duration = int(result.EndTime.Sub(result.StartTime).Milliseconds())

	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("ping command failed: %v", err)
		nd.storeResult(result)
		return result, err
	}

	// Parse ping output
	pingResult, parseErr := nd.parsePingOutput(string(output))
	if parseErr != nil {
		result.Success = false
		result.Error = fmt.Sprintf("failed to parse ping output: %v", parseErr)
		nd.storeResult(result)
		return result, parseErr
	}

	result.Success = true
	result.Data["ping"] = pingResult
	nd.storeResult(result)

	return result, nil
}

// parsePingOutput parses ping command output
func (nd *NetworkDiagnostics) parsePingOutput(output string) (*PingResult, error) {
	result := &PingResult{
		RTTs: make([]float64, 0),
	}

	lines := strings.Split(output, "\n")
	
	// Parse individual ping responses
	pingRegex := regexp.MustCompile(`time=([0-9.]+)\s*ms`)
	for _, line := range lines {
		if matches := pingRegex.FindStringSubmatch(line); matches != nil {
			if rtt, err := strconv.ParseFloat(matches[1], 64); err == nil {
				result.RTTs = append(result.RTTs, rtt)
			}
		}
	}

	// Parse summary statistics
	for _, line := range lines {
		line = strings.TrimSpace(line)
		
		// Parse packets transmitted/received
		if strings.Contains(line, "packets transmitted") {
			parts := strings.Fields(line)
			if len(parts) >= 4 {
				if sent, err := strconv.Atoi(parts[0]); err == nil {
					result.PacketsSent = sent
				}
				if received, err := strconv.Atoi(parts[3]); err == nil {
					result.PacketsReceived = received
				}
			}
			
			// Calculate packet loss
			if result.PacketsSent > 0 {
				result.PacketLoss = float64(result.PacketsSent-result.PacketsReceived) / 
					float64(result.PacketsSent) * 100.0
			}
		}
		
		// Parse RTT statistics (min/avg/max/stddev)
		if strings.Contains(line, "min/avg/max") {
			parts := strings.Split(line, "=")
			if len(parts) >= 2 {
				stats := strings.Split(strings.TrimSpace(parts[1]), "/")
				if len(stats) >= 4 {
					if min, err := strconv.ParseFloat(stats[0], 64); err == nil {
						result.MinRTT = min
					}
					if avg, err := strconv.ParseFloat(stats[1], 64); err == nil {
						result.AvgRTT = avg
					}
					if max, err := strconv.ParseFloat(stats[2], 64); err == nil {
						result.MaxRTT = max
					}
					if stddev, err := strconv.ParseFloat(stats[3], 64); err == nil {
						result.StdDevRTT = stddev
					}
				}
			}
		}
	}

	return result, nil
}

// Traceroute performs a traceroute test to the specified host
func (nd *NetworkDiagnostics) Traceroute(host string, params *TracerouteParameters) (*DiagnosticResult, error) {
	if params == nil {
		params = &TracerouteParameters{
			MaxHops: 30,
			Timeout: 5,
			Queries: 3,
		}
	}

	result := &DiagnosticResult{
		TestType:  "traceroute",
		Target:    host,
		StartTime: time.Now(),
		Parameters: map[string]interface{}{
			"max_hops": params.MaxHops,
			"timeout":  params.Timeout,
			"queries":  params.Queries,
		},
		Data: make(map[string]interface{}),
	}

	// Build traceroute command
	args := []string{
		"-m", strconv.Itoa(params.MaxHops),
		"-w", strconv.Itoa(params.Timeout),
		"-q", strconv.Itoa(params.Queries),
		host,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 
		time.Duration(params.MaxHops*params.Timeout*params.Queries+30)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "traceroute", args...)
	output, err := cmd.CombinedOutput()

	result.EndTime = time.Now()
	result.Duration = int(result.EndTime.Sub(result.StartTime).Milliseconds())

	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("traceroute command failed: %v", err)
		nd.storeResult(result)
		return result, err
	}

	// Parse traceroute output
	traceResult, parseErr := nd.parseTracerouteOutput(string(output))
	if parseErr != nil {
		result.Success = false
		result.Error = fmt.Sprintf("failed to parse traceroute output: %v", parseErr)
		nd.storeResult(result)
		return result, parseErr
	}

	result.Success = true
	result.Data["traceroute"] = traceResult
	nd.storeResult(result)

	return result, nil
}

// parseTracerouteOutput parses traceroute command output
func (nd *NetworkDiagnostics) parseTracerouteOutput(output string) (*TracerouteResult, error) {
	result := &TracerouteResult{
		Hops:    make([]TracerouteHop, 0),
		MaxHops: 30,
	}

	lines := strings.Split(output, "\n")
	
	// Skip the first line (header)
	for i, line := range lines {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue
		}

		hop, err := nd.parseTracerouteHop(line)
		if err == nil {
			result.Hops = append(result.Hops, hop)
		}
	}

	// Check if traceroute completed (reached target)
	if len(result.Hops) > 0 {
		lastHop := result.Hops[len(result.Hops)-1]
		result.Completed = !lastHop.Timeout
	}

	return result, nil
}

// parseTracerouteHop parses a single hop line from traceroute output
func (nd *NetworkDiagnostics) parseTracerouteHop(line string) (TracerouteHop, error) {
	hop := TracerouteHop{}

	// Parse hop number
	parts := strings.Fields(strings.TrimSpace(line))
	if len(parts) < 2 {
		return hop, fmt.Errorf("invalid hop line: %s", line)
	}

	// Extract hop number
	hopNumStr := strings.TrimSpace(parts[0])
	if hopNum, err := strconv.Atoi(hopNumStr); err == nil {
		hop.HopNumber = hopNum
	} else {
		return hop, fmt.Errorf("invalid hop number: %s", hopNumStr)
	}

	// Check for timeout (asterisks)
	if strings.Contains(line, "*") {
		hop.Timeout = true
		return hop, nil
	}

	// Parse IP/hostname and RTT values
	rttRegex := regexp.MustCompile(`([0-9.]+)\s*ms`)
	ipRegex := regexp.MustCompile(`\(([0-9.]+\.[0-9.]+\.[0-9.]+\.[0-9.]+)\)`)
	
	// Extract IP address
	if ipMatch := ipRegex.FindStringSubmatch(line); ipMatch != nil {
		hop.IP = ipMatch[1]
	}

	// Extract hostname (before the IP in parentheses)
	if ipMatch := ipRegex.FindStringSubmatch(line); ipMatch != nil {
		beforeIP := strings.Split(line, ipMatch[0])[0]
		parts := strings.Fields(beforeIP)
		if len(parts) >= 2 {
			hop.Hostname = parts[len(parts)-1]
		}
	}

	// Extract RTT values
	rttMatches := rttRegex.FindAllStringSubmatch(line, -1)
	rtts := make([]float64, 0)
	
	for _, match := range rttMatches {
		if rtt, err := strconv.ParseFloat(match[1], 64); err == nil {
			rtts = append(rtts, rtt)
		}
	}

	// Assign RTT values
	if len(rtts) >= 1 {
		hop.RTT1 = rtts[0]
	}
	if len(rtts) >= 2 {
		hop.RTT2 = rtts[1]
	}
	if len(rtts) >= 3 {
		hop.RTT3 = rtts[2]
	}

	// Calculate average RTT
	if len(rtts) > 0 {
		sum := 0.0
		for _, rtt := range rtts {
			sum += rtt
		}
		hop.AvgRTT = sum / float64(len(rtts))
	}

	return hop, nil
}

// TestBandwidth performs a simple bandwidth test
func (nd *NetworkDiagnostics) TestBandwidth(testURL string, durationSeconds int) (*DiagnosticResult, error) {
	if testURL == "" {
		testURL = "http://speedtest.wdc01.softlayer.com/downloads/test100.zip"
	}
	if durationSeconds <= 0 {
		durationSeconds = 10
	}

	result := &DiagnosticResult{
		TestType:  "bandwidth",
		Target:    testURL,
		StartTime: time.Now(),
		Parameters: map[string]interface{}{
			"duration": durationSeconds,
			"test_url": testURL,
		},
		Data: make(map[string]interface{}),
	}

	// Perform download test
	ctx, cancel := context.WithTimeout(context.Background(), 
		time.Duration(durationSeconds+10)*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", testURL, nil)
	if err != nil {
		result.EndTime = time.Now()
		result.Duration = int(result.EndTime.Sub(result.StartTime).Milliseconds())
		result.Success = false
		result.Error = fmt.Sprintf("failed to create request: %v", err)
		nd.storeResult(result)
		return result, err
	}

	client := &http.Client{
		Timeout: time.Duration(durationSeconds+5) * time.Second,
	}

	startTime := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		result.EndTime = time.Now()
		result.Duration = int(result.EndTime.Sub(result.StartTime).Milliseconds())
		result.Success = false
		result.Error = fmt.Sprintf("request failed: %v", err)
		nd.storeResult(result)
		return result, err
	}
	defer resp.Body.Close()

	// Read response body and measure bandwidth
	buffer := make([]byte, 8192)
	totalBytes := int64(0)
	testStart := time.Now()

	for {
		if time.Since(testStart) > time.Duration(durationSeconds)*time.Second {
			break
		}

		n, err := resp.Body.Read(buffer)
		if n > 0 {
			totalBytes += int64(n)
		}
		if err != nil {
			break
		}
	}

	elapsed := time.Since(startTime)
	result.EndTime = time.Now()
	result.Duration = int(result.EndTime.Sub(result.StartTime).Milliseconds())

	// Calculate download speed in Mbps
	downloadSpeed := float64(totalBytes*8) / (elapsed.Seconds() * 1000000) // Mbps

	bandwidthResult := &BandwidthResult{
		DownloadSpeed:   downloadSpeed,
		TestServer:      testURL,
		DataTransferred: totalBytes,
		Latency:         0, // Would need separate latency test
	}

	result.Success = true
	result.Data["bandwidth"] = bandwidthResult
	nd.storeResult(result)

	return result, nil
}

// TestDNS performs DNS resolution tests
func (nd *NetworkDiagnostics) TestDNS(hostname string, dnsServer string, recordType string) (*DiagnosticResult, error) {
	if recordType == "" {
		recordType = "A"
	}
	if dnsServer == "" {
		dnsServer = "8.8.8.8" // Google DNS as default
	}

	result := &DiagnosticResult{
		TestType:  "dns",
		Target:    hostname,
		StartTime: time.Now(),
		Parameters: map[string]interface{}{
			"dns_server":  dnsServer,
			"record_type": recordType,
		},
		Data: make(map[string]interface{}),
	}

	// Use system resolver for basic A record lookup
	if recordType == "A" {
		startTime := time.Now()
		ips, err := net.LookupHost(hostname)
		resolveTime := time.Since(startTime)

		result.EndTime = time.Now()
		result.Duration = int(result.EndTime.Sub(result.StartTime).Milliseconds())

		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("DNS lookup failed: %v", err)
			nd.storeResult(result)
			return result, err
		}

		dnsResult := &DNSResult{
			Hostname:     hostname,
			IPs:          ips,
			ResponseTime: float64(resolveTime.Nanoseconds()) / 1000000.0, // ms
			Server:       "system",
			RecordType:   recordType,
		}

		result.Success = true
		result.Data["dns"] = dnsResult
		nd.storeResult(result)
		return result, nil
	}

	// For other record types, use dig command
	return nd.testDNSWithDig(hostname, dnsServer, recordType, result)
}

// testDNSWithDig uses dig command for DNS testing
func (nd *NetworkDiagnostics) testDNSWithDig(hostname, dnsServer, recordType string, result *DiagnosticResult) (*DiagnosticResult, error) {
	args := []string{
		"@" + dnsServer,
		hostname,
		recordType,
		"+time=5",
		"+short",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "dig", args...)
	output, err := cmd.CombinedOutput()

	result.EndTime = time.Now()
	result.Duration = int(result.EndTime.Sub(result.StartTime).Milliseconds())

	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("dig command failed: %v", err)
		nd.storeResult(result)
		return result, err
	}

	// Parse dig output
	lines := strings.Split(string(output), "\n")
	ips := make([]string, 0)
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, ";") {
			ips = append(ips, line)
		}
	}

	dnsResult := &DNSResult{
		Hostname:     hostname,
		IPs:          ips,
		ResponseTime: float64(result.Duration), // Approximate
		Server:       dnsServer,
		RecordType:   recordType,
	}

	result.Success = true
	result.Data["dns"] = dnsResult
	nd.storeResult(result)

	return result, nil
}

// storeResult stores a diagnostic result
func (nd *NetworkDiagnostics) storeResult(result *DiagnosticResult) {
	nd.mutex.Lock()
	defer nd.mutex.Unlock()

	key := fmt.Sprintf("%s_%s_%d", result.TestType, result.Target, result.StartTime.Unix())
	nd.results[key] = result

	// Keep only the last 100 results
	if len(nd.results) > 100 {
		// Remove oldest results
		oldest := time.Now()
		oldestKey := ""
		
		for k, r := range nd.results {
			if r.StartTime.Before(oldest) {
				oldest = r.StartTime
				oldestKey = k
			}
		}
		
		if oldestKey != "" {
			delete(nd.results, oldestKey)
		}
	}
}

// GetResults returns all stored diagnostic results
func (nd *NetworkDiagnostics) GetResults() map[string]*DiagnosticResult {
	nd.mutex.RLock()
	defer nd.mutex.RUnlock()

	results := make(map[string]*DiagnosticResult)
	for k, v := range nd.results {
		results[k] = v
	}
	return results
}

// GetResult returns a specific diagnostic result
func (nd *NetworkDiagnostics) GetResult(key string) (*DiagnosticResult, bool) {
	nd.mutex.RLock()
	defer nd.mutex.RUnlock()

	result, exists := nd.results[key]
	return result, exists
}

// ClearResults clears all stored results
func (nd *NetworkDiagnostics) ClearResults() {
	nd.mutex.Lock()
	defer nd.mutex.Unlock()

	nd.results = make(map[string]*DiagnosticResult)
}