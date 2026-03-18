import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, writeFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import {
  loadBrandProfiles,
  selectBrandProfile,
  isActionAllowed,
  isConfigKeyAllowed,
  normalizeBrandProfilesConfig,
} from '../brandProfiles.js';

const configPath = resolve(process.cwd(), 'brand-profiles.json');
let originalBrandProfiles: string | null = null;

beforeAll(async () => {
  try {
    originalBrandProfiles = await readFile(configPath, 'utf8');
  } catch {
    originalBrandProfiles = null;
  }
});

afterAll(async () => {
  if (originalBrandProfiles !== null) {
    await writeFile(configPath, originalBrandProfiles, 'utf8');
    return;
  }

  try {
    await unlink(configPath);
  } catch {
    // ignore
  }
});

describe('brand profiles', () => {
  it('loads brand profiles from config', async () => {
    const config = await loadBrandProfiles();
    expect(config).toBeTruthy();
    expect(config?.brands.alfen).toBeTruthy();
    expect(config?.brands.peblar).toBeTruthy();
  });

  it('selects a profile and enforces action rules', async () => {
    const config = await loadBrandProfiles();
    const peblar = selectBrandProfile(config, 'peblar');
    expect(peblar?.name).toBe('peblar');
    expect(isActionAllowed(peblar, 'ChangeConfiguration')).toBe(false);
    expect(isActionAllowed(peblar, 'RemoteStartTransaction')).toBe(true);
  });

  it('applies strict config key restrictions', async () => {
    const config = await loadBrandProfiles();
    const alfen = selectBrandProfile(config, 'alfen');
    expect(isConfigKeyAllowed(alfen, 'HeartbeatInterval')).toBe(true);
    expect(isConfigKeyAllowed(alfen, 'UnknownKey')).toBe(false);
  });

  it('falls back to default profile for unknown brand names', async () => {
    const config = await loadBrandProfiles();
    const fallback = selectBrandProfile(config, 'unknown-brand');
    expect(fallback?.name).toBe('generic');
  });

  it('normalizes malformed profile data safely', () => {
    const parsed = normalizeBrandProfilesConfig({
      default: 'missing',
      brands: {
        TeStBrand: {
          name: '  ',
          allowedActions: ['Reset', 'Reset', 123, ''],
          config: { mode: 'invalid', allowedKeys: ['HeartbeatInterval', '', 5] },
          firmware: {},
          supportedProfiles: ['Core', null, ''],
        },
      },
    });

    expect(parsed).toBeTruthy();
    expect(parsed?.default).toBe('testbrand');
    expect(parsed?.brands.testbrand.name).toBe('testbrand');
    expect(parsed?.brands.testbrand.config.mode).toBe('lenient');
    expect(parsed?.brands.testbrand.allowedActions).toEqual(['Reset']);
    expect(parsed?.brands.testbrand.config.allowedKeys).toEqual(['HeartbeatInterval']);
    expect(parsed?.brands.testbrand.firmware.rebootAfterInstall).toBe(true);
    expect(parsed?.brands.testbrand.supportedProfiles).toEqual(['Core']);
  });

  it('returns null when normalization input has no valid brands', () => {
    expect(normalizeBrandProfilesConfig(null)).toBeNull();
    expect(normalizeBrandProfilesConfig({})).toBeNull();
    expect(normalizeBrandProfilesConfig({ brands: {} })).toBeNull();
  });

  it('falls back to first valid brand when default is invalid', () => {
    const parsed = normalizeBrandProfilesConfig({
      default: 'missing',
      brands: {
        Alpha: {
          allowedActions: ['Reset'],
          config: { mode: 'strict', allowedKeys: [] },
          firmware: { rebootAfterInstall: true },
          supportedProfiles: ['Core'],
        },
      },
    });

    expect(parsed?.default).toBe('alpha');
    expect(selectBrandProfile(parsed ?? null, undefined)?.name).toBe('alpha');
  });

  it('returns null when brand-profiles file is missing', async () => {
    try {
      await unlink(configPath);
    } catch {
      // ignore
    }

    await expect(loadBrandProfiles()).resolves.toBeNull();
  });

  it('returns null when brand-profiles file is malformed json', async () => {
    await writeFile(configPath, '{"brands":', 'utf8');
    await expect(loadBrandProfiles()).resolves.toBeNull();
  });
});
