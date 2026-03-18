import { loadBrandProfiles, selectBrandProfile } from '../brandProfiles.js';
import { EvseConfigEntry } from '../evseConfig.js';
import { BootOptions, OcppClient } from '../ocppClient.js';

export function buildClientsFromConfig(params: {
  entries: EvseConfigEntry[];
  bootOpts: BootOptions;
  csmsUrl: string;
  connectors: number;
  profilesConfig: Awaited<ReturnType<typeof loadBrandProfiles>>;
  baseBrandName?: string;
}) {
  const baseBrandProfile = selectBrandProfile(params.profilesConfig, params.baseBrandName);
  return params.entries.map(entry => {
    const evseId = entry.evseId;
    const entryCsmsUrl = entry.csmsUrl ?? params.csmsUrl;
    const entryConnectors = entry.connectors ?? params.connectors;
    const entryBrand = entry.brand ?? params.baseBrandName;
    const entryBrandProfile = selectBrandProfile(params.profilesConfig, entryBrand) ?? baseBrandProfile;
    const evseBootOpts: BootOptions = {
      ...params.bootOpts,
      ...entry.boot,
      chargeBoxSerialNumber: evseId,
      chargePointSerialNumber: evseId
    };

    const client = new OcppClient(evseId, evseBootOpts, entryCsmsUrl, entryConnectors, entryBrandProfile);
    if (entry.power) {
      client.setPower(entry.power.amps, entry.power.volts);
    }

    return {
      evseId,
      client,
      bootOpts: evseBootOpts,
      csmsUrl: entryCsmsUrl,
      connectors: entryConnectors,
      location: entry.location,
      company: entry.company,
      environment: entry.environment
    };
  });
}
