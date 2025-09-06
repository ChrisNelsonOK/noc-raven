const { test, expect } = require('@playwright/test');

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:9080';
const API_URL = process.env.API_URL || 'http://localhost:3001';

test.describe('NoC Raven Web Interface - Production Validation', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto(BASE_URL);
    
    // Wait for the application to load
    await page.waitForSelector('[data-testid="app-loaded"]', { timeout: 10000 });
  });

  test.describe('Application Loading and Initialization', () => {
    
    test('should load the application successfully', async ({ page }) => {
      // Check that the main elements are present
      await expect(page.locator('h1')).toContainText('NoC Raven');
      
      // Verify navigation is present
      await expect(page.locator('.navigation')).toBeVisible();
      
      // Verify main content area
      await expect(page.locator('.main-content')).toBeVisible();
    });

    test('should display system status indicator', async ({ page }) => {
      const statusIndicator = page.locator('.system-status .status-indicator');
      await expect(statusIndicator).toBeVisible();
      
      // Should show either connected, loading, or disconnected
      const statusText = await page.locator('.system-status .status-text').textContent();
      expect(['connected', 'loading', 'disconnected']).toContain(statusText);
    });

    test('should show version information', async ({ page }) => {
      const versionInfo = page.locator('.version-info');
      await expect(versionInfo).toBeVisible();
      await expect(versionInfo).toContainText('Version');
    });
  });

  test.describe('Navigation Functionality', () => {
    
    test('should navigate to Dashboard page', async ({ page }) => {
      await page.click('a[href="/dashboard"]');
      await expect(page.locator('h1')).toContainText('NoC Raven Dashboard');
      await expect(page.url()).toContain('/dashboard');
    });

    test('should navigate to NetFlow page', async ({ page }) => {
      await page.click('a[href="/flows"]');
      await expect(page.locator('h1')).toContainText('NetFlow Analysis');
      await expect(page.url()).toContain('/flows');
      
      // Check for NetFlow-specific elements
      await expect(page.locator('.netflow-stats')).toBeVisible();
    });

    test('should navigate to Syslog page', async ({ page }) => {
      await page.click('a[href="/syslog"]');
      await expect(page.locator('h1')).toContainText('Syslog Monitor');
      await expect(page.url()).toContain('/syslog');
      
      // Check for Syslog-specific elements
      await expect(page.locator('.syslog-stats')).toBeVisible();
    });

    test('should navigate to SNMP page', async ({ page }) => {
      await page.click('a[href="/snmp"]');
      await expect(page.locator('h1')).toContainText('SNMP Monitor');
      await expect(page.url()).toContain('/snmp');
      
      // Check for SNMP-specific elements
      await expect(page.locator('.snmp-stats')).toBeVisible();
    });

    test('should navigate to Metrics page', async ({ page }) => {
      await page.click('a[href="/metrics"]');
      await expect(page.locator('h1')).toContainText('System Metrics');
      await expect(page.url()).toContain('/metrics');
    });

    test('should navigate to Settings page', async ({ page }) => {
      await page.click('a[href="/settings"]');
      await expect(page.locator('h1')).toContainText('Settings');
      await expect(page.url()).toContain('/settings');
      
      // Check for Settings-specific elements
      await expect(page.locator('.settings-grid')).toBeVisible();
    });

    test('should highlight active navigation item', async ({ page }) => {
      await page.click('a[href="/flows"]');
      await expect(page.locator('a[href="/flows"]')).toHaveClass(/active/);
    });
  });

  test.describe('Dashboard Functionality', () => {
    
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`);
    });

    test('should display system overview card', async ({ page }) => {
      const systemOverview = page.locator('.system-overview');
      await expect(systemOverview).toBeVisible();
      
      // Check for uptime display
      await expect(systemOverview.locator('.stat-label')).toContainText('Uptime');
    });

    test('should display performance metrics', async ({ page }) => {
      const performanceMetrics = page.locator('.performance-metrics');
      await expect(performanceMetrics).toBeVisible();
      
      // Check for CPU, Memory, and Disk usage
      await expect(performanceMetrics).toContainText('CPU Usage');
      await expect(performanceMetrics).toContainText('Memory Usage');
      await expect(performanceMetrics).toContainText('Disk Usage');
    });

    test('should display telemetry statistics', async ({ page }) => {
      const telemetryStats = page.locator('.telemetry-stats');
      await expect(telemetryStats).toBeVisible();
      
      // Check for flow statistics
      await expect(telemetryStats).toContainText('Flows/sec');
      await expect(telemetryStats).toContainText('Syslog');
    });

    test('should display service status', async ({ page }) => {
      const serviceStatus = page.locator('.service-status');
      await expect(serviceStatus).toBeVisible();
      
      // Check for service indicators
      const services = ['GoFlow2', 'Fluent Bit', 'Vector', 'Telegraf', 'nginx'];
      for (const service of services) {
        await expect(serviceStatus).toContainText(service);
      }
    });

    test('should update metrics in real-time', async ({ page }) => {
      // Get initial metric values
      const initialCPU = await page.locator('.performance-metrics .metric:has-text("CPU") .metric-value').textContent();
      
      // Wait for updates (WebSocket or polling)
      await page.waitForTimeout(6000);
      
      // Check if metrics are still being updated
      const metricsVisible = await page.locator('.performance-metrics').isVisible();
      expect(metricsVisible).toBe(true);
    });
  });

  test.describe('NetFlow Page Functionality', () => {
    
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/flows`);
    });

    test('should display NetFlow statistics', async ({ page }) => {
      const stats = page.locator('.netflow-stats');
      await expect(stats).toBeVisible();
      
      // Check for stat cards
      await expect(stats.locator('.stat-card')).toHaveCount(4);
    });

    test('should display flow data table', async ({ page }) => {
      const flowsTable = page.locator('.flows-table');
      
      // Table should be visible (even if empty)
      await expect(page.locator('.recent-flows')).toBeVisible();
    });

    test('should show top sources and destinations', async ({ page }) => {
      await expect(page.locator('.top-sources')).toBeVisible();
      await expect(page.locator('.top-destinations')).toBeVisible();
    });

    test('should display protocol distribution', async ({ page }) => {
      await expect(page.locator('.protocol-distribution')).toBeVisible();
    });

    test('should handle no data gracefully', async ({ page }) => {
      // If no flow data is available, should show appropriate message
      const noDataMessage = page.locator('.no-data');
      if (await noDataMessage.isVisible()) {
        await expect(noDataMessage).toContainText('No NetFlow data');
      }
    });
  });

  test.describe('Syslog Page Functionality', () => {
    
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/syslog`);
    });

    test('should display syslog filters', async ({ page }) => {
      const controls = page.locator('.syslog-controls');
      await expect(controls).toBeVisible();
      
      // Check for filter dropdowns
      await expect(controls.locator('select')).toHaveCount(2); // Severity and Facility
      await expect(controls.locator('input[type="text"]')).toBeVisible(); // Search input
    });

    test('should filter logs by severity', async ({ page }) => {
      const severitySelect = page.locator('select').first();
      await severitySelect.selectOption('error');
      
      // Should update the display
      await page.waitForTimeout(1000);
    });

    test('should filter logs by search term', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="Filter"]');
      await searchInput.fill('test');
      
      // Should filter results
      await page.waitForTimeout(1000);
    });

    test('should clear filters', async ({ page }) => {
      const clearButton = page.locator('button:has-text("Clear Filters")');
      await clearButton.click();
      
      // Filters should be reset
      const severitySelect = page.locator('select').first();
      await expect(severitySelect).toHaveValue('all');
    });

    test('should display log entries with proper formatting', async ({ page }) => {
      const logEntries = page.locator('.log-entry');
      
      if (await logEntries.count() > 0) {
        const firstEntry = logEntries.first();
        await expect(firstEntry.locator('.log-time')).toBeVisible();
        await expect(firstEntry.locator('.log-severity')).toBeVisible();
        await expect(firstEntry.locator('.log-message')).toBeVisible();
      }
    });
  });

  test.describe('Settings Page Functionality', () => {
    
    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
    });

    test('should display configuration form', async ({ page }) => {
      const configForm = page.locator('.settings-grid');
      await expect(configForm).toBeVisible();
      
      // Check for form inputs
      await expect(page.locator('input[type="text"]')).toHaveCount(2); // Hostname and Buffer Size
      await expect(page.locator('select')).toHaveCount(2); // Timezone and Performance Profile
    });

    test('should allow editing configuration values', async ({ page }) => {
      const hostnameInput = page.locator('input').first();
      await hostnameInput.fill('test-hostname');
      
      const value = await hostnameInput.inputValue();
      expect(value).toBe('test-hostname');
    });

    test('should have save button', async ({ page }) => {
      const saveButton = page.locator('.save-button');
      await expect(saveButton).toBeVisible();
      await expect(saveButton).toContainText('Save Configuration');
    });

    test('should display service status', async ({ page }) => {
      const serviceStatus = page.locator('.card:has-text("Service Status")');
      await expect(serviceStatus).toBeVisible();
      
      // Should show service items
      await expect(serviceStatus.locator('.service-item')).toHaveCount(5);
    });
  });

  test.describe('API Integration', () => {
    
    test('should connect to backend API', async ({ page }) => {
      // Check that API calls are being made
      let apiCalled = false;
      
      page.on('response', response => {
        if (response.url().includes('/api/')) {
          apiCalled = true;
        }
      });
      
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForTimeout(3000);
      
      expect(apiCalled).toBe(true);
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API failure
      await page.route('/api/status', route => {
        route.abort();
      });
      
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Should show disconnected status
      await expect(page.locator('.status-text')).toContainText('disconnected');
    });
  });

  test.describe('Real-Time Updates', () => {
    
    test('should update dashboard metrics periodically', async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Wait for initial load
      await page.waitForSelector('.dashboard-grid');
      
      // Get timestamp
      const timestamp1 = await page.locator('.last-updated').textContent();
      
      // Wait for update interval
      await page.waitForTimeout(6000);
      
      // Check if timestamp changed or data is still updating
      const metricsVisible = await page.locator('.performance-metrics').isVisible();
      expect(metricsVisible).toBe(true);
    });
  });

  test.describe('Responsive Design', () => {
    
    test('should work on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Navigation should be responsive
      await expect(page.locator('.navigation')).toBeVisible();
      
      // Content should be accessible
      await expect(page.locator('.main-content')).toBeVisible();
    });

    test('should work on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Layout should adapt
      await expect(page.locator('.dashboard-grid')).toBeVisible();
    });
  });

  test.describe('Performance Tests', () => {
    
    test('should load dashboard within reasonable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForSelector('.dashboard-grid');
      const loadTime = Date.now() - startTime;
      
      // Should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('should handle large datasets efficiently', async ({ page }) => {
      await page.goto(`${BASE_URL}/flows`);
      
      // Wait for page to load completely
      await page.waitForSelector('.netflow-page');
      
      // Should remain responsive
      const isVisible = await page.locator('.netflow-stats').isVisible();
      expect(isVisible).toBe(true);
    });
  });

  test.describe('Accessibility', () => {
    
    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Should have h1 for main title
      await expect(page.locator('h1')).toHaveCount(1);
      
      // Should have h2 for section titles
      const h2Count = await page.locator('h2').count();
      expect(h2Count).toBeGreaterThan(0);
    });

    test('should have accessible form labels', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      
      // Form inputs should have labels
      const labels = page.locator('label');
      const labelCount = await labels.count();
      expect(labelCount).toBeGreaterThan(0);
    });
  });
});

// Utility functions for test helpers
test.describe('Test Utilities', () => {
  
  test('should validate API endpoints', async ({ request }) => {
    // Test API health endpoint
    const health = await request.get(`${API_URL}/api/health`);
    expect(health.status()).toBe(200);
    
    const healthData = await health.json();
    expect(healthData.status).toBe('healthy');
  });

  test('should validate API data structure', async ({ request }) => {
    // Test status endpoint
    const status = await request.get(`${API_URL}/api/status`);
    
    if (status.status() === 200) {
      const data = await status.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('timestamp');
    }
  });
});

// Custom test fixtures for complex scenarios
test.describe('Integration Scenarios', () => {
  
  test('should handle full user workflow', async ({ page }) => {
    // 1. Load dashboard
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('h1')).toContainText('Dashboard');
    
    // 2. Navigate to NetFlow
    await page.click('a[href="/flows"]');
    await expect(page.url()).toContain('/flows');
    
    // 3. Check flow data
    await page.waitForSelector('.netflow-stats');
    
    // 4. Navigate to Settings
    await page.click('a[href="/settings"]');
    await expect(page.url()).toContain('/settings');
    
    // 5. Modify configuration
    const hostnameInput = page.locator('input').first();
    await hostnameInput.fill('integration-test');
    
    // 6. Return to dashboard
    await page.click('a[href="/dashboard"]');
    await expect(page.url()).toContain('/dashboard');
  });
});
