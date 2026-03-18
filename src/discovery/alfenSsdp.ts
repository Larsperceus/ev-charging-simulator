import dgram from 'node:dgram';
import { logger } from '../utils/logger.js';
import { makeDeviceUuid } from './deviceIdentity.js';

type SsdpController = {
  stop: () => void;
};

const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const SEARCH_TARGET = 'urn:schemas-upnp-org:device:Basic:1';

const ROOT_DEVICE = 'upnp:rootdevice';
const ALFEN_TARGET = 'urn:alfen:device:chargepoint:1';

function toHttpDate(value: Date): string {
  return value.toUTCString();
}

function parseSearchTarget(message: string): string | null {
  const text = message.toLowerCase();
  if (!text.includes('m-search * http/1.1')) return null;

  const stLine = text
    .split('\r\n')
    .find(line => line.startsWith('st:'));

  if (!stLine) return null;
  return stLine.split(':').slice(1).join(':').trim();
}

function isSearchForUs(st: string | null): boolean {
  if (!st) return true;

  return (
    st === 'ssdp:all'
    || st === ROOT_DEVICE
    || st === SEARCH_TARGET.toLowerCase()
    || st === ALFEN_TARGET
    || st.includes('alfen')
  );
}

export function startAlfenSsdp(params: {
  chargerId: string;
  chargerIds?: string[];
  port: number;
  scheme: 'http' | 'https';
  getLanIps: () => string[];
}): SsdpController {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const identities = (params.chargerIds && params.chargerIds.length > 0)
    ? params.chargerIds
    : [params.chargerId];

  const identityRecords = identities.map(id => ({ id, udn: `uuid:${makeDeviceUuid(id)}` }));

  const getLocation = (evseId?: string) => {
    const ip = params.getLanIps()[0] ?? '127.0.0.1';
    if (evseId) {
      return `${params.scheme}://${ip}:${params.port}/device.xml?evseId=${encodeURIComponent(evseId)}`;
    }
    return `${params.scheme}://${ip}:${params.port}/device.xml`;
  };

  const buildResponse = (st: string, identity: { id: string; udn: string }) => [
    'HTTP/1.1 200 OK',
    'CACHE-CONTROL: max-age=120',
    `DATE: ${toHttpDate(new Date())}`,
    'EXT:',
    `LOCATION: ${getLocation(identity.id)}`,
    'SERVER: Alfen/1.0 UPnP/1.1 VirtualEVSE/1.0',
    `ST: ${st}`,
    `USN: ${identity.udn}::${st}`,
    '',
    '',
  ].join('\r\n');

  const sendAliveNotify = () => {
    const ntValues = [ROOT_DEVICE, SEARCH_TARGET, ALFEN_TARGET];
    for (const identity of identityRecords) {
      for (const nt of ntValues) {
        const payload = [
          'NOTIFY * HTTP/1.1',
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
          'CACHE-CONTROL: max-age=120',
          `LOCATION: ${getLocation(identity.id)}`,
          `NT: ${nt}`,
          'NTS: ssdp:alive',
          'SERVER: Alfen/1.0 UPnP/1.1 VirtualEVSE/1.0',
          `USN: ${identity.udn}::${nt}`,
          '',
          '',
        ].join('\r\n');

        socket.send(Buffer.from(payload), SSDP_PORT, SSDP_ADDRESS);
      }
    }
  };

  socket.on('error', (error) => {
    logger.warn(`SSDP socket error: ${error.message}`);
  });

  socket.on('message', (buffer, remoteInfo) => {
    const message = buffer.toString('utf8');
    const st = parseSearchTarget(message);
    if (!isSearchForUs(st)) return;

    const targets = (st === 'ssdp:all' || st == null)
      ? [ROOT_DEVICE, SEARCH_TARGET, ALFEN_TARGET]
      : [st];

    for (const target of targets) {
      for (const identity of identityRecords) {
        const response = buildResponse(target, identity);
        socket.send(Buffer.from(response), remoteInfo.port, remoteInfo.address);
      }
    }
  });

  socket.bind(SSDP_PORT, () => {
    try {
      socket.addMembership(SSDP_ADDRESS);
    } catch (error) {
      logger.warn(`SSDP multicast membership failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    logger.info(`SSDP discovery active for ${SEARCH_TARGET} / ${ALFEN_TARGET} with ${identityRecords.length} EVSE identity record(s)`);
    sendAliveNotify();
  });

  const heartbeat = setInterval(sendAliveNotify, 30000);

  return {
    stop: () => {
      clearInterval(heartbeat);
      try {
        socket.close();
      } catch {
      }
    },
  };
}
