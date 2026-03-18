import { describe, expect, it, vi } from 'vitest';
import { FirmwareManager } from '../firmwareManager.js';

describe('FirmwareManager', () => {
  it('runs firmware state machine to Installed', async () => {
    vi.useFakeTimers();

    const statuses: string[] = [];
    let version = '';
    const manager = new FirmwareManager({
      schedule: { downloadMs: 100, installMs: 100 },
      onStatus: status => { statuses.push(status); },
      onInstalled: v => { version = v; },
      onVersionResolve: () => '2.0.0'
    });

    const started = manager.start({
      location: 'https://example.com/fw-2.0.0.fwi',
      retrieveDate: new Date(Date.now())
    });

    expect(started).toBe(true);

    await vi.advanceTimersByTimeAsync(300);

    expect(statuses).toEqual(['Downloading', 'Downloaded', 'Installing', 'Installed']);
    expect(version).toBe('2.0.0');

    vi.useRealTimers();
  });

  it('handles download failure', async () => {
    vi.useFakeTimers();

    const statuses: string[] = [];
    const manager = new FirmwareManager({
      schedule: { downloadMs: 50, installMs: 50 },
      onStatus: status => { statuses.push(status); },
      onInstalled: () => undefined,
      onVersionResolve: () => '2.0.0'
    });

    manager.start({
      location: 'https://example.com/fw.fwi',
      retrieveDate: new Date(Date.now()),
      failStage: 'download'
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(statuses).toEqual(['Downloading', 'DownloadFailed']);

    vi.useRealTimers();
  });

  it('handles install failure', async () => {
    vi.useFakeTimers();

    const statuses: string[] = [];
    const manager = new FirmwareManager({
      schedule: { downloadMs: 50, installMs: 50 },
      onStatus: status => { statuses.push(status); },
      onInstalled: () => undefined,
      onVersionResolve: () => '2.0.0'
    });

    manager.start({
      location: 'https://example.com/fw.fwi',
      retrieveDate: new Date(Date.now()),
      failStage: 'install'
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(statuses).toEqual(['Downloading', 'Downloaded', 'Installing', 'InstallationFailed']);

    vi.useRealTimers();
  });

  it('rejects a second start while a job is already running', async () => {
    vi.useFakeTimers();

    const manager = new FirmwareManager({
      schedule: { downloadMs: 50, installMs: 50 },
      onStatus: () => undefined,
      onInstalled: () => undefined,
      onVersionResolve: () => '2.0.0'
    });

    const first = manager.start({
      location: 'https://example.com/fw.fwi',
      retrieveDate: new Date(Date.now())
    });
    const second = manager.start({
      location: 'https://example.com/fw2.fwi',
      retrieveDate: new Date(Date.now())
    });

    expect(first).toBe(true);
    expect(second).toBe(false);

    await vi.advanceTimersByTimeAsync(150);
    vi.useRealTimers();
  });

  it('waits until retrieveDate before starting transitions', async () => {
    vi.useFakeTimers();

    const statuses: string[] = [];
    const manager = new FirmwareManager({
      schedule: { downloadMs: 10, installMs: 10 },
      onStatus: status => { statuses.push(status); },
      onInstalled: () => undefined,
      onVersionResolve: () => '2.0.0'
    });

    manager.start({
      location: 'https://example.com/fw.fwi',
      retrieveDate: new Date(Date.now() + 100)
    });

    await vi.advanceTimersByTimeAsync(90);
    expect(statuses).toEqual([]);

    await vi.advanceTimersByTimeAsync(50);
    expect(statuses).toContain('Downloading');

    vi.useRealTimers();
  });

  it('retries failed download according to retry settings', async () => {
    vi.useFakeTimers();

    const statuses: string[] = [];
    const manager = new FirmwareManager({
      schedule: { downloadMs: 20, installMs: 20 },
      onStatus: status => { statuses.push(status); },
      onInstalled: () => undefined,
      onVersionResolve: () => '2.0.0'
    });

    manager.start({
      location: 'https://example.com/fw.fwi',
      retrieveDate: new Date(Date.now()),
      failStage: 'download',
      retries: 1,
      retryIntervalMs: 30
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(statuses).toEqual(['Downloading', 'DownloadFailed', 'Downloading', 'DownloadFailed']);

    vi.useRealTimers();
  });
});