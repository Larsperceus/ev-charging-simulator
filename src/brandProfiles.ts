import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { logger } from './utils/logger.js';

type UnknownRecord = Record<string, unknown>;

export type MdnsDiscoveryProfile = {
  serviceType: string;
  instancePrefix: string;
  vendor: string;
};

export type BrandProfile = {
  name: string;
  allowedActions: string[];
  config: {
    mode: 'strict' | 'lenient';
    allowedKeys: string[];
  };
  firmware: {
    rebootAfterInstall: boolean;
  };
  supportedProfiles: string[];
  discovery?: {
    mdns: MdnsDiscoveryProfile;
  };
};

export type BrandProfilesConfig = {
  default: string;
  brands: Record<string, BrandProfile>;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique];
}

const DEFAULT_MDNS: MdnsDiscoveryProfile = {
  serviceType: '_evse._tcp.local',
  instancePrefix: '',
  vendor: 'Virtual EVSE',
};

function normalizeMdnsProfile(raw: unknown, brandKey: string): MdnsDiscoveryProfile {
  if (!isRecord(raw)) return { ...DEFAULT_MDNS, vendor: brandKey };
  return {
    serviceType: typeof raw.serviceType === 'string' && raw.serviceType.trim() ? raw.serviceType.trim() : DEFAULT_MDNS.serviceType,
    instancePrefix: typeof raw.instancePrefix === 'string' ? raw.instancePrefix : '',
    vendor: typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim() : brandKey,
  };
}

function normalizeBrandProfile(rawProfile: unknown, brandKey: string): BrandProfile {
  const profile = isRecord(rawProfile) ? rawProfile : {};
  const configRaw = isRecord(profile.config) ? profile.config : {};
  const firmwareRaw = isRecord(profile.firmware) ? profile.firmware : {};
  const discoveryRaw = isRecord(profile.discovery) ? profile.discovery : {};

  const mode = configRaw.mode === 'strict' ? 'strict' : 'lenient';
  const allowedActions = asStringArray(profile.allowedActions);
  const allowedKeys = asStringArray(configRaw.allowedKeys);
  const supportedProfiles = asStringArray(profile.supportedProfiles);

  return {
    name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : brandKey,
    allowedActions,
    config: {
      mode,
      allowedKeys,
    },
    firmware: {
      rebootAfterInstall: typeof firmwareRaw.rebootAfterInstall === 'boolean' ? firmwareRaw.rebootAfterInstall : true,
    },
    supportedProfiles,
    discovery: {
      mdns: normalizeMdnsProfile(discoveryRaw.mdns, brandKey),
    },
  };
}

export function normalizeBrandProfilesConfig(input: unknown): BrandProfilesConfig | null {
  if (!isRecord(input)) return null;

  const rawBrands = isRecord(input.brands) ? input.brands : null;
  if (!rawBrands) return null;

  const normalizedBrands: Record<string, BrandProfile> = {};
  for (const [key, profile] of Object.entries(rawBrands)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    normalizedBrands[normalizedKey] = normalizeBrandProfile(profile, normalizedKey);
  }

  const brandKeys = Object.keys(normalizedBrands);
  if (brandKeys.length === 0) return null;

  const rawDefault = typeof input.default === 'string' ? input.default.trim().toLowerCase() : '';
  const defaultKey = rawDefault && normalizedBrands[rawDefault] ? rawDefault : brandKeys[0];

  return {
    default: defaultKey,
    brands: normalizedBrands,
  };
}

export async function loadBrandProfiles(): Promise<BrandProfilesConfig | null> {
  const configPath = resolve(process.cwd(), 'brand-profiles.json');
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeBrandProfilesConfig(parsed);
    if (!normalized) {
      logger.warn('brand-profiles.json invalid or missing brands');
      return null;
    }
    return normalized;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    logger.warn(`Failed to load brand-profiles.json: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function selectBrandProfile(config: BrandProfilesConfig | null, name: string | undefined): BrandProfile | null {
  if (!config) return null;
  const key = (name ?? '').trim().toLowerCase();
  return config.brands[key] ?? config.brands[config.default] ?? null;
}

export function isActionAllowed(profile: BrandProfile | null, action: string): boolean {
  if (!profile) return true;
  if (!profile.allowedActions || profile.allowedActions.length === 0) return true;
  return profile.allowedActions.includes(action);
}

export function isConfigKeyAllowed(profile: BrandProfile | null, key: string): boolean {
  if (!profile) return true;
  if (profile.config.mode !== 'strict') return true;
  if (!profile.config.allowedKeys || profile.config.allowedKeys.length === 0) return true;
  return profile.config.allowedKeys.includes(key);
}

export function filterConfigurationKeys(profile: BrandProfile | null, keys: string[]): string[] {
  if (!profile) return keys;
  if (profile.config.mode !== 'strict') return keys;
  if (!profile.config.allowedKeys || profile.config.allowedKeys.length === 0) return keys;
  return keys.filter(key => profile.config.allowedKeys.includes(key));
}
