import { logger } from '../utils/logger.js';
import { loadEvseConfig } from '../evseConfig.js';
import { loadBrandProfiles, selectBrandProfile, type BrandProfile } from '../brandProfiles.js';
import { parseBrandArg, parseEvseIds } from './cliArgs.js';
import { buildClientsFromConfig } from './clientFactory.js';
import type { BootOptions } from '../ocppClient.js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export type RuntimeInitialization = {
  containerId: string;
  bootOpts: BootOptions;
  csmsUrl: string;
  connectors: number;
  defaultEvseId: string;
  brandName: string | undefined;
  brandProfile: BrandProfile | null;
  apiLoginPasswordProtected: boolean;
  apiLoginPassword: string | undefined;
  entries: ReturnType<typeof buildClientsFromConfig>;
};

function isPackagedExecutable(): boolean {
  return typeof (process as NodeJS.Process & { pkg?: unknown }).pkg !== 'undefined';
}

const FIRMWARE_QUICKSET_VERSIONS = [
  '7.3.0-4377',
  '7.2.0-4362',
  '7.1.6-4345',
  '7.1.3-4342',
  '7.1.0-4339',
  '7.0.5-4375',
  '7.0.2-4322',
  '7.0.0-4318',
  '6.6.2-4351-BL-upgrade-B',
  '6.6.2',
  '6.3.0-4361',
  '6.0.0',
  '5.8.1-4123',
  '5.6.1-4381-A',
  '5.6.1-4381-B',
  '5.6.1-4381',
  '4.15.7-4054',
  '4.15.6',
  '4.14.0',
  '4.12.0',
  '4.8.0',
] as const;

async function promptOptimileId(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const value = (await rl.question('Hey, enter an ID for Optimile: ')).trim();
      if (value.length > 0) return value;
      output.write('A non-empty ID is required.\n');
    }
  } finally {
    rl.close();
  }
}

function generateSetupPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
  }
  return value;
}

async function promptPasswordProtection(): Promise<{ protected: boolean; password?: string }> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question('Password protect ACE login? (yes/no): ')).trim().toLowerCase();
      if (['y', 'yes'].includes(answer)) {
        const entered = (await rl.question('Enter password (leave empty to auto-generate): ')).trim();
        const password = entered.length > 0 ? entered : generateSetupPassword();
        return { protected: true, password };
      }
      if (['n', 'no', ''].includes(answer)) {
        return { protected: false };
      }
      output.write('Please answer yes or no.\n');
    }
  } finally {
    rl.close();
  }
}

async function promptConnectorCount(): Promise<1 | 2> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question('Connector setup (1=single, 2=double): ')).trim().toLowerCase();
      if (answer === '' || answer === '2' || answer === 'double' || answer === 'd' || answer === 'duo') return 2;
      if (answer === '1' || answer === 'single' || answer === 's') return 1;
      output.write('Please enter 1 or 2.\n');
    }
  } finally {
    rl.close();
  }
}

async function promptBulkChargerCount(): Promise<number> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question('How many chargers to start? [1]: ')).trim();
      if (answer.length === 0) return 1;
      const parsed = Number(answer);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 500) return parsed;
      output.write('Please enter an integer between 1 and 500.\n');
    }
  } finally {
    rl.close();
  }
}

async function promptInitialFirmwareVersion(defaultVersion = '7.3.0-4377'): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const quicksets = [...FIRMWARE_QUICKSET_VERSIONS];
    const defaultIndex = Math.max(0, quicksets.findIndex(v => v === defaultVersion));
    output.write('Firmware quickset versions:\n');
    quicksets.forEach((version, index) => {
      const suffix = index === defaultIndex ? ' (default)' : '';
      output.write(`  ${index + 1}. ${version}${suffix}\n`);
    });
    while (true) {
      const answer = (await rl.question(`Choose quickset [${defaultIndex + 1}] or type custom version: `)).trim();
      if (answer.length === 0) return defaultVersion;

      const asNumber = Number(answer);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= quicksets.length) {
        return quicksets[asNumber - 1];
      }

      if (answer.length > 0) return answer;
      output.write('Please enter a valid quickset number, a firmware version, or press Enter for default.\n');
    }
  } finally {
    rl.close();
  }
}

async function scanConfigFiles(): Promise<string[]> {
  const configDir = resolve(process.cwd(), 'evse-config');
  try {
    const files = await readdir(configDir);
    return files
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => resolve(configDir, f));
  } catch {
    return [];
  }
}

function configFileName(fullPath: string): string {
  return fullPath.replace(/\\/g, '/').split('/').pop() ?? fullPath;
}

async function promptConfigFileSelection(files: string[]): Promise<string | null> {
  const rl = createInterface({ input, output });
  try {
    output.write('\nAvailable evse-config files:\n');
    files.forEach((file, index) => {
      output.write(`  ${index + 1}. ${configFileName(file)}\n`);
    });
    output.write(`  ${files.length + 1}. Skip (manual setup)\n`);
    while (true) {
      const answer = (await rl.question(`Select config file [${files.length + 1}]: `)).trim();
      if (answer === '' || answer === String(files.length + 1)) return null;
      const num = Number(answer);
      if (Number.isInteger(num) && num >= 1 && num <= files.length) return files[num - 1];
      output.write(`Please enter a number between 1 and ${files.length + 1}.\n`);
    }
  } finally {
    rl.close();
  }
}

export async function initializeRuntime(): Promise<RuntimeInitialization> {
  const packagedExe = isPackagedExecutable();
  let containerId = process.env.CHARGER_ID ?? 'CP-1';
  const cliEvseIds = parseEvseIds(process.argv.slice(2));
  const config = await loadEvseConfig();
  let evseEntries = config.entries;
  let interactiveConnectorCount: 1 | 2 | null = null;
  let interactiveFirmwareVersion: string | null = null;
  let apiLoginPasswordProtected = false;
  let apiLoginPassword: string | undefined;
  const configuredLoginPassword = (process.env.ACE_LOGIN_PASSWORD ?? '').trim();

  let useInteractiveAlfenDefaults = false;
  if (evseEntries.length === 0 && packagedExe) {
    if (!input.isTTY || !output.isTTY) {
      throw new Error('Interactive EXE setup requires a terminal (TTY).');
    }

    // Offer config file selection before manual prompts
    const configFiles = await scanConfigFiles();
    if (configFiles.length > 0) {
      const selectedFile = await promptConfigFileSelection(configFiles);
      if (selectedFile) {
        const fileConfig = await loadEvseConfig(selectedFile);
        if (fileConfig.entries.length > 0) {
          evseEntries = fileConfig.entries;
          containerId = evseEntries[0]?.evseId ?? containerId;
          logger.info(`Loaded ${evseEntries.length} EVSE(s) from ${configFileName(selectedFile)}`);
        } else {
          logger.warn(`Config file ${configFileName(selectedFile)} contained no EVSE entries, falling back to manual setup`);
        }
      }
    }

    if (evseEntries.length === 0) {
      const optimileId = await promptOptimileId();
      const chargerCount = await promptBulkChargerCount();
      const connectorCount = await promptConnectorCount();
      const firmwareVersion = await promptInitialFirmwareVersion();
      const passwordProtection = await promptPasswordProtection();
      containerId = optimileId;
      evseEntries = Array.from({ length: chargerCount }, (_unused, index) => {
        const evseId = chargerCount === 1
          ? optimileId
          : `${optimileId}_${index + 1}`;
        return {
          evseId,
          brand: 'alfen',
          connectors: connectorCount,
        };
      });
      interactiveConnectorCount = connectorCount;
      interactiveFirmwareVersion = firmwareVersion;
      useInteractiveAlfenDefaults = true;
      apiLoginPasswordProtected = passwordProtection.protected;
      apiLoginPassword = passwordProtection.password;
      logger.info(`Using interactive Alfen setup with ${chargerCount} EVSE(s) (${connectorCount} connector${connectorCount > 1 ? 's' : ''})`);
      if (chargerCount > 1) {
        const firstId = evseEntries[0]?.evseId;
        const lastId = evseEntries[evseEntries.length - 1]?.evseId;
        logger.info(`Bulk EVSE range: ${firstId} -> ${lastId}`);
      }
      if (apiLoginPasswordProtected) {
        logger.info('🔐 ACE login password protection enabled');
        logger.info(`🔑 ACE login password: ${apiLoginPassword}`);
      } else {
        logger.info('🔓 ACE login password protection disabled');
      }
    }
  }

  if (configuredLoginPassword.length > 0) {
    apiLoginPasswordProtected = true;
    apiLoginPassword = configuredLoginPassword;
    logger.info('🔐 ACE login password loaded from ACE_LOGIN_PASSWORD');
  }

  if (evseEntries.length === 0) {
    throw new Error('evse-config.json is required and must include evses/evseIds');
  }
  if (cliEvseIds.length > 0) {
    logger.warn('CLI EVSE list ignored because evse-config.json is required');
  }

  const profilesConfig = await loadBrandProfiles();
  const brandName = parseBrandArg(process.argv.slice(2)) || (useInteractiveAlfenDefaults ? 'alfen' : undefined);
  const defaultModel = interactiveConnectorCount === 1 ? 'NG910-60023' : 'NG920-61002';
  const bootOpts: BootOptions = {
    chargeBoxSerialNumber: process.env.CHARGEBOX_SERIAL ?? (useInteractiveAlfenDefaults ? containerId : 'DEFAULT_BOX'),
    chargePointModel: process.env.CHARGEPOINT_MODEL ?? (useInteractiveAlfenDefaults ? defaultModel : 'DEFAULT_MODEL'),
    chargePointSerialNumber: process.env.CHARGEBOX_SERIAL ?? (useInteractiveAlfenDefaults ? containerId : 'DEFAULT_SERIAL'),
    chargePointVendor: process.env.CHARGEPOINT_VENDOR ?? (useInteractiveAlfenDefaults ? 'Alfen' : 'Default Vendor'),
    firmwareVersion: process.env.FIRMWARE_VERSION ?? (useInteractiveAlfenDefaults ? (interactiveFirmwareVersion ?? '7.3.0-4377') : '1.0.0'),
  };
  const csmsUrl = process.env.CSMS_URL ?? 'ws://proxy.optimile-dev.eu:80/services/ocppj';
  const connectors = interactiveConnectorCount ?? Number(process.env.CONNECTORS || 1);

  logger.info('Using environment configuration');

  if (config.source === 'detailed') {
    logger.info(`Config EVSE list loaded (${evseEntries.length}) from evse-config.json (detailed)`);
  } else if (config.source === 'simple') {
    logger.info(`Config EVSE list loaded (${evseEntries.length}) from evse-config.json`);
  }

  const logBrandProfile = selectBrandProfile(profilesConfig, brandName);
  if (logBrandProfile) {
    logger.info(`Brand profile loaded: ${logBrandProfile.name}`);
  } else {
    logger.info('Brand profile not set; using default behavior');
  }

  const entries = buildClientsFromConfig({
    entries: evseEntries,
    bootOpts,
    csmsUrl,
    connectors,
    profilesConfig,
    baseBrandName: brandName
  });

  return {
    containerId,
    bootOpts,
    csmsUrl,
    connectors,
    defaultEvseId: evseEntries[0]?.evseId ?? containerId,
    brandName,
    brandProfile: logBrandProfile,
    apiLoginPasswordProtected,
    apiLoginPassword,
    entries,
  };
}
