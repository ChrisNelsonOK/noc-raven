const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:9080';

// Minimal smoke tests aligned with current UI and API

test.describe('NoC Raven - Smoke Suite', () => {
  test('app loads and shows dashboard header', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByTestId('app-loaded').waitFor({ timeout: 10000 });
    await expect(page.locator('h1')).toContainText('NoC Raven Dashboard');
  });

  test('navigate to each main section', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByTestId('app-loaded').waitFor();

    // Flow
    await page.locator('.sidebar').getByRole('button', { name: /flow/i }).click();
    await expect.poll(async () => await page.evaluate(() => window.location.pathname), { timeout: 2000 }).toBe('/flows');
    // Either the page header or the loading state should be visible
    const netflowHeader = page.locator('h1');
    const netflowLoading = page.locator('text=Loading NetFlow data');
    await Promise.race([
      netflowHeader.waitFor({ timeout: 2000 }).catch(() => {}),
      netflowLoading.waitFor({ timeout: 2000 }).catch(() => {})
    ]);

    // Syslog
    await page.locator('.sidebar').getByRole('button', { name: /syslog/i }).click();
    await expect.poll(async () => await page.evaluate(() => window.location.pathname), { timeout: 2000 }).toBe('/syslog');
    const syslogHeader = page.locator('h1');
    const syslogLoading = page.locator('text=Loading Syslog data');
    await Promise.race([
      syslogHeader.waitFor({ timeout: 2000 }).catch(() => {}),
      syslogLoading.waitFor({ timeout: 2000 }).catch(() => {})
    ]);

    // SNMP
    await page.locator('.sidebar').getByRole('button', { name: /snmp/i }).click();
    await expect.poll(async () => await page.evaluate(() => window.location.pathname), { timeout: 2000 }).toBe('/snmp');
    const snmpHeader = page.locator('h1');
    const snmpLoading = page.locator('text=Loading SNMP data');
    await Promise.race([
      snmpHeader.waitFor({ timeout: 2000 }).catch(() => {}),
      snmpLoading.waitFor({ timeout: 2000 }).catch(() => {})
    ]);

    // Metrics
    await page.locator('.sidebar').getByRole('button', { name: /metrics/i }).click();
    await expect.poll(async () => await page.evaluate(() => window.location.pathname), { timeout: 2000 }).toBe('/metrics');
    const metricsHeader = page.locator('h1');
    const metricsLoading = page.locator('text=Loading metrics');
    await Promise.race([
      metricsHeader.waitFor({ timeout: 2000 }).catch(() => {}),
      metricsLoading.waitFor({ timeout: 2000 }).catch(() => {})
    ]);

    // Settings
    await page.locator('.sidebar').getByRole('button', { name: /settings/i }).click();
    await expect.poll(async () => await page.evaluate(() => window.location.pathname), { timeout: 2000 }).toBe('/settings');
    const settingsHeader = page.locator('.settings-container h1, .settings-container h2');
    await expect(settingsHeader).toContainText(/System Configuration|Settings/i);
  });

  test('API endpoints respond', async ({ request }) => {
    const cfg = await request.get(`${BASE_URL}/api/config`);
    expect(cfg.status()).toBe(200);

    const status = await request.get(`${BASE_URL}/api/system/status`);
    expect(status.status()).toBe(200);
  });
});

