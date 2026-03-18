import multicastDns from 'multicast-dns';
import { logger } from '../utils/logger.js';

type MdnsController = {
  stop: () => void;
};

function sanitizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'alfen-virtual';
}

export function startAlfenMdns(params: {
  chargerId: string;
  chargerIds?: string[];
  port: number;
  firmwareVersion?: string;
  model?: string;
  getLanIps: () => string[];
}): MdnsController {
  const serviceType = '_alfen._tcp.local';
  const identities = (params.chargerIds && params.chargerIds.length > 0)
    ? params.chargerIds
    : [params.chargerId];

  const instances = identities.map(id => {
    const serviceInstanceLabel = sanitizeLabel(id);
    return {
      id,
      instanceName: `${serviceInstanceLabel}._alfen._tcp.local`,
      hostName: `${serviceInstanceLabel}.local`,
    };
  });

  const mdns = multicastDns({
    ip: '224.0.0.251',
    port: 5353,
    loopback: true,
    reuseAddr: true,
    multicast: true,
  });

  const buildRecords = () => {
    const ips = params.getLanIps();
    const primaryIp = ips[0];

    const records: any[] = [];
    for (const instance of instances) {
      records.push({
        name: serviceType,
        type: 'PTR',
        ttl: 120,
        data: instance.instanceName,
      });
      records.push({
        name: instance.instanceName,
        type: 'SRV',
        ttl: 120,
        data: {
          port: params.port,
          target: instance.hostName,
          priority: 0,
          weight: 0,
        },
      });
      records.push({
        name: instance.instanceName,
        type: 'TXT',
        ttl: 120,
        data: [
          `id=${instance.id}`,
          'vendor=Alfen',
          `model=${params.model ?? 'Virtual EVSE'}`,
          `firmware=${params.firmwareVersion ?? ''}`,
          `device=/device.xml?evseId=${encodeURIComponent(instance.id)}`,
        ],
      });

      if (primaryIp) {
        records.push({
          name: instance.hostName,
          type: 'A',
          ttl: 120,
          data: primaryIp,
        });
      }
    }

    return records;
  };

  const answerDiscovery = () => {
    try {
      mdns.respond({
        answers: buildRecords(),
      });
    } catch (error) {
      logger.warn(`mDNS announce failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const isQuestionRelevant = (question: { name?: string; type?: string }) => {
    const qName = (question.name ?? '').toLowerCase();
    if (qName === serviceType) return true;
    for (const instance of instances) {
      if (qName === instance.instanceName) return true;
      if (qName === instance.hostName) return true;
    }
    return false;
  };

  mdns.on('query', (query: { questions?: Array<{ name?: string; type?: string }> }) => {
    const questions = query.questions ?? [];
    if (!questions.some(isQuestionRelevant)) return;
    answerDiscovery();
  });

  answerDiscovery();
  const heartbeat = setInterval(answerDiscovery, 10000);

  logger.info(`mDNS discovery active for ${serviceType} with ${instances.length} EVSE identity record(s)`);

  return {
    stop: () => {
      clearInterval(heartbeat);
      try {
        mdns.destroy();
      } catch {
      }
    },
  };
}
