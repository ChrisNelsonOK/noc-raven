import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

// Mock the API service
jest.mock('../../hooks/useApiService', () => ({
  useSystemStatus: jest.fn(() => ({
    data: {
      status: 'healthy',
      uptime: '2 days, 3 hours',
      cpu_usage: 45,
      memory_usage: 62,
      services: {
        'fluent-bit': { status: 'running' },
        'goflow2': { status: 'running' },
        'telegraf': { status: 'running' },
        'vector': { status: 'running' }
      }
    },
    loading: false,
    error: null
  }))
}));

const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Dashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders dashboard header', () => {
    renderWithRouter(<Dashboard />);
    
    expect(screen.getByText('🦅 NoC Raven Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Real-time telemetry monitoring and control')).toBeInTheDocument();
  });

  test('displays system status metrics', async () => {
    renderWithRouter(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('System Status')).toBeInTheDocument();
      expect(screen.getByText('healthy')).toBeInTheDocument();
      expect(screen.getByText('Uptime: 2 days, 3 hours')).toBeInTheDocument();
    });
  });

  test('displays CPU and memory usage', async () => {
    renderWithRouter(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('Memory Usage')).toBeInTheDocument();
      expect(screen.getByText('62%')).toBeInTheDocument();
    });
  });

  test('displays service status cards', async () => {
    renderWithRouter(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Service Status')).toBeInTheDocument();
      expect(screen.getByText('fluent-bit')).toBeInTheDocument();
      expect(screen.getByText('goflow2')).toBeInTheDocument();
      expect(screen.getByText('telegraf')).toBeInTheDocument();
      expect(screen.getByText('vector')).toBeInTheDocument();
    });
  });

  test('handles loading state', () => {
    const { useSystemStatus } = require('../../hooks/useApiService');
    useSystemStatus.mockReturnValue({
      data: null,
      loading: true,
      error: null
    });

    renderWithRouter(<Dashboard />);
    
    expect(screen.getByText('Loading system status...')).toBeInTheDocument();
  });

  test('handles error state', () => {
    const { useSystemStatus } = require('../../hooks/useApiService');
    useSystemStatus.mockReturnValue({
      data: null,
      loading: false,
      error: 'Failed to fetch system status'
    });

    renderWithRouter(<Dashboard />);
    
    expect(screen.getByText(/Error loading system status/)).toBeInTheDocument();
  });

  test('displays metric bars with correct widths', async () => {
    renderWithRouter(<Dashboard />);
    
    await waitFor(() => {
      const cpuBar = screen.getByTestId('cpu-usage-bar');
      const memoryBar = screen.getByTestId('memory-usage-bar');
      
      expect(cpuBar).toHaveStyle('width: 45%');
      expect(memoryBar).toHaveStyle('width: 62%');
    });
  });
});
