import express from 'express';

type FilterShape = {
  envId?: string;
  envName?: string;
  companyId?: string;
  companyName?: string;
  locationId?: string;
  locationName?: string;
};

type BaseClientEntry = {
  evseId: string;
  client: {
    isConnected: () => boolean;
    getPower: () => { amps: number; volts: number; watts: number };
    getHeartbeatPeriodMs: () => number;
    getLastMessageAt: () => number | null;
    getStateAll: () => Array<{ id: number; state: string; errorCode: string; transactionId: number | null }>;
  };
  bootOpts: unknown;
  csmsUrl: string;
  connectors: number;
  location?: { id?: string; name?: string };
  company?: { id?: string; name?: string };
  environment?: { id?: string; name?: string };
};

function parseFilterQuery(query: express.Request['query']): FilterShape {
  return {
    envId: typeof query?.envId === 'string' ? query.envId : undefined,
    envName: typeof query?.envName === 'string' ? query.envName : undefined,
    companyId: typeof query?.companyId === 'string' ? query.companyId : undefined,
    companyName: typeof query?.companyName === 'string' ? query.companyName : undefined,
    locationId: typeof query?.locationId === 'string' ? query.locationId : undefined,
    locationName: typeof query?.locationName === 'string' ? query.locationName : undefined,
  };
}

export function registerHealthInfoStatusRoutes<TEntry extends BaseClientEntry>(params: {
  app: express.Express;
  clients: Map<string, TEntry>;
  matchesFilters: (entry: TEntry, filters: FilterShape) => boolean;
  getContainerId: () => string;
}) {
  const { app, clients, matchesFilters, getContainerId } = params;

  app.get('/health', (_req, res) => {
    const filters = parseFilterQuery(_req.query);
    const entries = [...clients.values()].filter(entry => matchesFilters(entry, filters));
    const connectedCount = entries.filter(e => e.client.isConnected()).length;
    res.json({
      connected: connectedCount === entries.length,
      connectedCount,
      total: entries.length,
      evses: entries.map(e => ({ evseId: e.evseId, connected: e.client.isConnected() }))
    });
  });

  app.get('/info', (_req, res) => {
    const filters = parseFilterQuery(_req.query);
    const entries = [...clients.values()].filter(entry => matchesFilters(entry, filters));
    const payload = entries.map(e => {
      const p = e.client.getPower();
      return {
        chargerId: e.evseId,
        evseId: e.evseId,
        ...(e.bootOpts as Record<string, unknown> ?? {}),
        csmsUrl: e.csmsUrl,
        connectors: e.connectors,
        location: e.location,
        company: e.company,
        environment: e.environment,
        power: { amps: p.amps, volts: p.volts, watts: p.watts },
        heartbeatMs: e.client.getHeartbeatPeriodMs(),
        lastMessageAt: e.client.getLastMessageAt()
      };
    });

    if (payload.length === 1) {
      res.json({
        containerId: getContainerId(),
        ...payload[0]
      });
      return;
    }

    res.json({
      containerId: getContainerId(),
      evseCount: payload.length,
      evses: payload
    });
  });

  app.get('/status', (_req, res) => {
    const filters = parseFilterQuery(_req.query);
    const entries = [...clients.values()].filter(entry => matchesFilters(entry, filters));
    const payload = entries.map(e => ({
      chargerId: e.evseId,
      evseId: e.evseId,
      connected: e.client.isConnected(),
      connectors: e.client.getStateAll(),
      location: e.location,
      company: e.company,
      environment: e.environment
    }));

    if (payload.length === 1) {
      res.json({
        containerId: getContainerId(),
        ...payload[0]
      });
      return;
    }

    res.json({
      containerId: getContainerId(),
      evseCount: payload.length,
      evses: payload
    });
  });
}
