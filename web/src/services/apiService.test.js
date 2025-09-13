import apiService from './apiService';

// Mock fetch globally
global.fetch = jest.fn();

describe('apiService', () => {
  beforeEach(() => {
    fetch.mockClear();
    if (window.dispatchEvent && window.dispatchEvent.mockClear) {
      window.dispatchEvent.mockClear();
    }
  });

  describe('fetchData', () => {
    test('successfully fetches data', async () => {
      const mockData = { test: 'data' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      const result = await apiService.fetchData('/test');
      
      expect(fetch).toHaveBeenCalledWith('/api/test');
      expect(result).toEqual(mockData);
    });

    test('handles fetch error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await apiService.fetchData('/test');
      
      expect(result).toBeNull();
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          detail: expect.objectContaining({
            type: 'error',
            message: 'Network error: Network error'
          })
        })
      );
    });

    test('handles HTTP error response', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await apiService.fetchData('/test');
      
      expect(result).toBeNull();
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          detail: expect.objectContaining({
            type: 'error',
            message: 'HTTP 404: Not Found'
          })
        })
      );
    });
  });

  describe('postData', () => {
    test('successfully posts data', async () => {
      const mockResponse = { success: true };
      const postData = { key: 'value' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await apiService.postData('/test', postData);
      
      expect(fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
      });
      expect(result).toEqual(mockResponse);
    });

    test('handles post error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await apiService.postData('/test', {});
      
      expect(result).toBeNull();
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          detail: expect.objectContaining({
            type: 'error',
            message: 'Network error: Network error'
          })
        })
      );
    });
  });

  describe('restartService', () => {
    test('successfully restarts service', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Service restarted' })
      });

      const result = await apiService.restartService('fluent-bit');
      
      expect(fetch).toHaveBeenCalledWith('/api/services/fluent-bit/restart', {
        method: 'POST'
      });
      expect(result).toEqual({ message: 'Service restarted' });
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          detail: expect.objectContaining({
            type: 'success',
            message: 'Service fluent-bit restarted successfully'
          })
        })
      );
    });

    test('handles restart failure', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await apiService.restartService('fluent-bit');
      
      expect(result).toBeNull();
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          detail: expect.objectContaining({
            type: 'error',
            message: 'Failed to restart service fluent-bit: HTTP 500: Internal Server Error'
          })
        })
      );
    });
  });

  describe('getSystemStatus', () => {
    test('successfully gets system status', async () => {
      const mockStatus = { status: 'healthy', uptime: '1 day' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus
      });

      const result = await apiService.getSystemStatus();
      
      expect(fetch).toHaveBeenCalledWith('/api/system/status');
      expect(result).toEqual(mockStatus);
    });
  });

  describe('getConfig', () => {
    test('successfully gets config', async () => {
      const mockConfig = { syslog_port: 514 };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const result = await apiService.getConfig();
      
      expect(fetch).toHaveBeenCalledWith('/api/config');
      expect(result).toEqual(mockConfig);
    });
  });

  describe('saveConfig', () => {
    test('successfully saves config', async () => {
      const config = { syslog_port: 1514 };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const result = await apiService.saveConfig(config);
      
      expect(fetch).toHaveBeenCalledWith('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      expect(result).toEqual({ success: true });
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toast',
          detail: expect.objectContaining({
            type: 'success',
            message: 'Configuration saved successfully'
          })
        })
      );
    });
  });
});
