import { loadBrandProfiles, selectBrandProfile, type BrandProfile, type BrandProfilesConfig } from './brandProfiles.js';
import { loadEvseConfig, normalizeEvseConfigObject, type EvseConfigEntry } from './evseConfig.js';
import { type BootOptions, OcppClient, type ConnectorState } from './ocppClient.js';

const DEFAULT_CSMS_URL = 'ws://localhost:9000/ocpp1.6';

export type ChargerProperties = EvseConfigEntry & { evseId: string };

export type ChargerOptions = {
  csmsUrl?: string;
  connectors?: number;
  bootOverrides?: Partial<BootOptions>;
  brandProfile?: BrandProfile | null;
  chargerPassword?: string;
};

export type ChargerFleetLoadOptions = {
  csmsUrl?: string;
  connectors?: number;
  bootTemplate?: Partial<BootOptions>;
  bootOverrides?: Partial<BootOptions>;
  baseBrandName?: string;
  profilesConfig?: BrandProfilesConfig | null;
  chargerPassword?: string;
};

export type ChargerSnapshot = {
  evseId: string;
  csmsUrl: string;
  connectors: number;
  connected: boolean;
  state: ConnectorState;
  firmwareVersion: string;
  power: { amps: number; volts: number; watts: number };
};

function resolveBootOptions(evseId: string, source?: Partial<BootOptions>, overrides?: Partial<BootOptions>): BootOptions {
  const merged = {
    ...source,
    ...overrides,
  };

  return {
    chargeBoxSerialNumber: merged.chargeBoxSerialNumber ?? evseId,
    chargePointModel: merged.chargePointModel ?? 'GenericModel',
    chargePointSerialNumber: merged.chargePointSerialNumber ?? evseId,
    chargePointVendor: merged.chargePointVendor ?? 'GenericVendor',
    firmwareVersion: merged.firmwareVersion ?? '1.0.0',
  };
}

export class Charger {
  public readonly evseId: string;
  public readonly csmsUrl: string;
  public readonly connectors: number;
  public readonly bootOptions: BootOptions;
  public readonly brandProfile: BrandProfile | null;

  private readonly client: OcppClient;

  constructor(properties: ChargerProperties, options: ChargerOptions = {}) {
    if (typeof properties?.evseId !== 'string' || properties.evseId.trim().length === 0) {
      throw new Error('Charger requires a non-empty evseId');
    }

    this.evseId = properties.evseId.trim();
    this.csmsUrl = properties.csmsUrl ?? options.csmsUrl ?? process.env.CSMS_URL ?? DEFAULT_CSMS_URL;
    this.connectors = properties.connectors ?? options.connectors ?? 1;
    this.bootOptions = resolveBootOptions(this.evseId, properties.boot, options.bootOverrides);
    this.brandProfile = options.brandProfile ?? null;

    this.client = new OcppClient(
      this.evseId,
      this.bootOptions,
      this.csmsUrl,
      this.connectors,
      this.brandProfile,
    );

    if (properties.power) {
      this.client.setPower(properties.power.amps, properties.power.volts);
    }

    if (typeof options.chargerPassword === 'string' && options.chargerPassword.length > 0) {
      this.client.setChargerPassword(options.chargerPassword);
    }
  }

  public async connect(): Promise<void> {
    await this.client.connect();
  }

  public async shutdown(): Promise<void> {
    await this.client.shutdown();
  }

  public async disconnect(): Promise<void> {
    await this.client.disconnectWs();
  }

  public async reconnect(): Promise<void> {
    await this.client.reconnectWs();
  }

  public isConnected(): boolean {
    return this.client.isConnected();
  }

  public getState(): ConnectorState {
    return this.client.getState();
  }

  public getPower() {
    return this.client.getPower();
  }

  public setPower(amps?: number, volts?: number): void {
    this.client.setPower(amps, volts);
  }

  public async setStatus(status: ConnectorState, connectorId = 1): Promise<void> {
    await this.client.setConnectorStatus(connectorId, status);
  }

  public getClient(): OcppClient {
    return this.client;
  }

  public snapshot(): ChargerSnapshot {
    return {
      evseId: this.evseId,
      csmsUrl: this.csmsUrl,
      connectors: this.connectors,
      connected: this.client.isConnected(),
      state: this.client.getState(),
      firmwareVersion: this.client.getFirmwareVersion(),
      power: this.client.getPower(),
    };
  }
}

export function createChargers(
  propertiesList: ChargerProperties[],
  options: ChargerOptions = {},
): Charger[] {
  return propertiesList.map((properties) => new Charger(properties, options));
}

export type ChargerConfigSource =
  | string
  | ChargerProperties[]
  | Record<string, unknown>;

export async function loadChargersFromConfig(
  source: ChargerConfigSource = './evse-config.json',
  options: ChargerFleetLoadOptions = {},
): Promise<Charger[]> {
  let entries: EvseConfigEntry[];

  if (typeof source === 'string') {
    const config = await loadEvseConfig(source);
    entries = config.entries;
  } else if (Array.isArray(source)) {
    entries = source;
  } else if (source && typeof source === 'object') {
    const config = normalizeEvseConfigObject(source);
    entries = config.entries;
  } else {
    entries = [];
  }

  const profilesConfig = options.profilesConfig ?? await loadBrandProfiles();

  return entries.map((entry) => {
    const evseId = entry.evseId;
    const bootFromEntry = {
      ...options.bootTemplate,
      ...entry.boot,
      ...options.bootOverrides,
      chargeBoxSerialNumber: entry.evseId,
      chargePointSerialNumber: entry.evseId,
    };
    const brandName = entry.brand ?? options.baseBrandName;

    return new Charger(
      { ...entry, evseId, boot: bootFromEntry },
      {
        csmsUrl: entry.csmsUrl ?? options.csmsUrl,
        connectors: entry.connectors ?? options.connectors,
        brandProfile: selectBrandProfile(profilesConfig, brandName),
        chargerPassword: options.chargerPassword,
      },
    );
  });
}