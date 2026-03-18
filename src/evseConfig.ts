import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { logger } from './utils/logger.js';
import type { BootOptions } from './ocppClient.js';

export type EvseConfigEntry = {
  evseId: string;
  connectors?: number;
  csmsUrl?: string;
  brand?: string;
  power?: { amps?: number; volts?: number };
  boot?: Partial<BootOptions>;
  location?: { id?: string; name?: string };
  locationId?: string;
  company?: { id?: string; name?: string };
  environment?: { id?: string; name?: string };
};

type EvseConfigFile = {
  evseIds?: unknown;
  evses?: unknown;
  locations?: unknown;
  envs?: unknown;
  includes?: unknown;
};

type EnvMap = Record<string, any>;

function mergeEnvMaps(base: EnvMap, incoming: EnvMap) {
  for (const [envId, envValue] of Object.entries(incoming)) {
    if (!base[envId] || typeof base[envId] !== 'object') {
      base[envId] = envValue;
      continue;
    }

    if (typeof envValue?.name === 'string') {
      base[envId].name = envValue.name;
    }

    const baseCompanies = (base[envId].companies && typeof base[envId].companies === 'object')
      ? base[envId].companies as Record<string, any>
      : {};
    const incomingCompanies = (envValue?.companies && typeof envValue.companies === 'object')
      ? envValue.companies as Record<string, any>
      : {};

    for (const [companyId, companyValue] of Object.entries(incomingCompanies)) {
      if (!baseCompanies[companyId] || typeof baseCompanies[companyId] !== 'object') {
        baseCompanies[companyId] = companyValue;
        continue;
      }

      if (typeof companyValue?.name === 'string') {
        baseCompanies[companyId].name = companyValue.name;
      }

      const baseLocations = (baseCompanies[companyId].locations && typeof baseCompanies[companyId].locations === 'object')
        ? baseCompanies[companyId].locations as Record<string, any>
        : {};
      const incomingLocations = (companyValue?.locations && typeof companyValue.locations === 'object')
        ? companyValue.locations as Record<string, any>
        : {};

      for (const [locationId, locationValue] of Object.entries(incomingLocations)) {
        if (!baseLocations[locationId] || typeof baseLocations[locationId] !== 'object') {
          baseLocations[locationId] = locationValue;
          continue;
        }

        if (typeof locationValue?.name === 'string') {
          baseLocations[locationId].name = locationValue.name;
        }

        if (Array.isArray(locationValue?.evses)) {
          const existing = Array.isArray(baseLocations[locationId].evses) ? baseLocations[locationId].evses : [];
          baseLocations[locationId].evses = existing.concat(locationValue.evses);
        }
      }

      baseCompanies[companyId].locations = baseLocations;
    }

    base[envId].companies = baseCompanies;
  }
}

async function readConfigFile(path: string): Promise<EvseConfigFile | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as EvseConfigFile;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    logger.warn(`Failed to load ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function loadEvseConfig(customPath?: string): Promise<{ entries: EvseConfigEntry[]; source: 'hierarchical' | 'detailed' | 'simple' | 'none' }> {
  const configPath = customPath ? resolve(customPath) : resolve(process.cwd(), 'evse-config.json');
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as EvseConfigFile;
    const baseDir = dirname(configPath);
    const includes = Array.isArray(parsed?.includes) ? parsed.includes.filter(path => typeof path === 'string' && path.trim().length > 0) as string[] : [];

    if (includes.length > 0) {
      const baseEnvMap = (parsed?.envs && typeof parsed.envs === 'object') ? parsed.envs as EnvMap : {};
      for (const includePath of includes) {
        const resolved = resolve(baseDir, includePath);
        const includeConfig = await readConfigFile(resolved);
        if (!includeConfig) continue;

        if (includeConfig?.envs && typeof includeConfig.envs === 'object') {
          mergeEnvMaps(baseEnvMap, includeConfig.envs as EnvMap);
        }

        if (Array.isArray(includeConfig?.evses)) {
          parsed.evses = Array.isArray(parsed.evses) ? parsed.evses.concat(includeConfig.evses) : includeConfig.evses;
        }

        if (Array.isArray(includeConfig?.evseIds)) {
          parsed.evseIds = Array.isArray(parsed.evseIds) ? parsed.evseIds.concat(includeConfig.evseIds) : includeConfig.evseIds;
        }

        if (includeConfig?.locations && typeof includeConfig.locations === 'object') {
          parsed.locations = { ...(parsed.locations as Record<string, any> ?? {}), ...(includeConfig.locations as Record<string, any>) };
        }
      }
      parsed.envs = baseEnvMap;
    }

    const locations = (parsed?.locations && typeof parsed.locations === 'object') ? parsed.locations as Record<string, { name?: string }> : {};
    const envs = (parsed?.envs && typeof parsed.envs === 'object') ? parsed.envs as Record<string, any> : {};

    if (Object.keys(envs).length > 0) {
      const entries: EvseConfigEntry[] = [];
      for (const [envId, envValue] of Object.entries(envs)) {
        const envName = typeof envValue?.name === 'string' ? envValue.name : undefined;
        const companies = (envValue?.companies && typeof envValue.companies === 'object') ? envValue.companies as Record<string, any> : {};

        for (const [companyId, companyValue] of Object.entries(companies)) {
          const companyName = typeof companyValue?.name === 'string' ? companyValue.name : undefined;
          const locationsMap = (companyValue?.locations && typeof companyValue.locations === 'object') ? companyValue.locations as Record<string, any> : {};

          for (const [locationId, locationValue] of Object.entries(locationsMap)) {
            const locationName = typeof locationValue?.name === 'string' ? locationValue.name : undefined;
            const evses = Array.isArray(locationValue?.evses) ? locationValue.evses : [];

            for (const value of evses) {
              if (!value || typeof value.evseId !== 'string' || value.evseId.trim().length === 0) continue;
              entries.push({
                evseId: String(value.evseId).trim(),
                connectors: typeof value.connectors === 'number' ? value.connectors : undefined,
                csmsUrl: typeof value.csmsUrl === 'string' ? value.csmsUrl : undefined,
                brand: typeof value.brand === 'string' ? value.brand : undefined,
                power: value.power,
                boot: value.boot,
                locationId,
                location: { id: locationId, name: locationName },
                company: { id: companyId, name: companyName },
                environment: { id: envId, name: envName }
              });
            }
          }
        }
      }

      return { entries, source: 'hierarchical' };
    }

    if (Array.isArray(parsed?.evses)) {
      const entries = parsed.evses
        .map(value => value as Partial<EvseConfigEntry>)
        .filter(value => typeof value.evseId === 'string' && value.evseId.trim().length > 0)
        .map(value => ({
          evseId: String(value.evseId).trim(),
          connectors: typeof value.connectors === 'number' ? value.connectors : undefined,
          csmsUrl: typeof value.csmsUrl === 'string' ? value.csmsUrl : undefined,
          brand: typeof value.brand === 'string' ? value.brand : undefined,
          power: value.power,
          boot: value.boot,
          locationId: typeof value.locationId === 'string' ? value.locationId : undefined,
          location: typeof value.locationId === 'string' && locations[value.locationId]
            ? { id: value.locationId, name: locations[value.locationId]?.name }
            : value.location,
          company: value.company,
          environment: value.environment
        }));

      return { entries, source: 'detailed' };
    }

    if (Array.isArray(parsed?.evseIds)) {
      const entries = parsed.evseIds
        .map(value => String(value).trim())
        .filter(Boolean)
        .map(evseId => ({ evseId }));
      return { entries, source: 'simple' };
    }

    logger.warn('evse-config.json missing envs, evses or evseIds array; ignoring');
    return { entries: [], source: 'none' };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { entries: [], source: 'none' };
    logger.warn(`Failed to load evse-config.json: ${error instanceof Error ? error.message : String(error)}`);
    return { entries: [], source: 'none' };
  }
}

export function normalizeEvseConfigObject(input: unknown): { entries: EvseConfigEntry[]; source: 'hierarchical' | 'detailed' | 'simple' | 'none' } {
  const parsed = input as EvseConfigFile;

  const locations = (parsed?.locations && typeof parsed.locations === 'object') ? parsed.locations as Record<string, { name?: string }> : {};
  const envs = (parsed?.envs && typeof parsed.envs === 'object') ? parsed.envs as Record<string, any> : {};

  if (Object.keys(envs).length > 0) {
    const entries: EvseConfigEntry[] = [];
    for (const [envId, envValue] of Object.entries(envs)) {
      const envName = typeof envValue?.name === 'string' ? envValue.name : undefined;
      const companies = (envValue?.companies && typeof envValue.companies === 'object') ? envValue.companies as Record<string, any> : {};

      for (const [companyId, companyValue] of Object.entries(companies)) {
        const companyName = typeof companyValue?.name === 'string' ? companyValue.name : undefined;
        const locationsMap = (companyValue?.locations && typeof companyValue.locations === 'object') ? companyValue.locations as Record<string, any> : {};

        for (const [locationId, locationValue] of Object.entries(locationsMap)) {
          const locationName = typeof locationValue?.name === 'string' ? locationValue.name : undefined;
          const evses = Array.isArray(locationValue?.evses) ? locationValue.evses : [];

          for (const value of evses) {
            if (!value || typeof value.evseId !== 'string' || value.evseId.trim().length === 0) continue;
            entries.push({
              evseId: String(value.evseId).trim(),
              connectors: typeof value.connectors === 'number' ? value.connectors : undefined,
              csmsUrl: typeof value.csmsUrl === 'string' ? value.csmsUrl : undefined,
              brand: typeof value.brand === 'string' ? value.brand : undefined,
              power: value.power,
              boot: value.boot,
              locationId,
              location: { id: locationId, name: locationName },
              company: { id: companyId, name: companyName },
              environment: { id: envId, name: envName }
            });
          }
        }
      }
    }

    return { entries, source: 'hierarchical' };
  }

  if (Array.isArray(parsed?.evses)) {
    const entries = parsed.evses
      .map(value => value as Partial<EvseConfigEntry>)
      .filter(value => typeof value.evseId === 'string' && value.evseId.trim().length > 0)
      .map(value => ({
        evseId: String(value.evseId).trim(),
        connectors: typeof value.connectors === 'number' ? value.connectors : undefined,
        csmsUrl: typeof value.csmsUrl === 'string' ? value.csmsUrl : undefined,
        brand: typeof value.brand === 'string' ? value.brand : undefined,
        power: value.power,
        boot: value.boot,
        locationId: typeof value.locationId === 'string' ? value.locationId : undefined,
        location: typeof value.locationId === 'string' && locations[value.locationId]
          ? { id: value.locationId, name: locations[value.locationId]?.name }
          : value.location,
        company: value.company,
        environment: value.environment
      }));

    return { entries, source: 'detailed' };
  }

  if (Array.isArray(parsed?.evseIds)) {
    const entries = parsed.evseIds
      .map(value => String(value).trim())
      .filter(Boolean)
      .map(evseId => ({ evseId }));
    return { entries, source: 'simple' };
  }

  return { entries: [], source: 'none' };
}

