import { beforeAll, describe, expect, it } from 'vitest';
import { openApiSpec } from '../openapi.js';

let app: any;

function normalizeExpressPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function collectExpressRouteSignatures(expressApp: any): Set<string> {
  const signatures = new Set<string>();
  const stack = expressApp?._router?.stack ?? [];

  for (const layer of stack) {
    const route = layer?.route;
    if (!route || typeof route.path !== 'string' || !route.methods) continue;

    const normalizedPath = normalizeExpressPath(route.path);
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (!enabled) continue;
      signatures.add(`${String(method).toUpperCase()} ${normalizedPath}`);
    }
  }

  return signatures;
}

function collectOpenApiSignatures(): Set<string> {
  const signatures = new Set<string>();
  const allowedMethods = ['get', 'post', 'put', 'patch', 'delete'];

  for (const [path, pathItem] of Object.entries(openApiSpec.paths as Record<string, any>)) {
    // Skip WebSocket-only paths — they're not Express HTTP routes
    if (pathItem?.['x-websocket']) continue;
    for (const method of allowedMethods) {
      if (pathItem?.[method]) signatures.add(`${method.toUpperCase()} ${path}`);
    }
  }

  return signatures;
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const mod = await import('../index.js');
  app = mod.app;
});

describe('OpenAPI route contract', () => {
  it('keeps OpenAPI paths in sync with Express routes', () => {
    const expressRoutes = collectExpressRouteSignatures(app);
    const openApiRoutes = collectOpenApiSignatures();

    const missingInOpenApi = [...expressRoutes].filter(route => !openApiRoutes.has(route)).sort();
    const missingInExpress = [...openApiRoutes].filter(route => !expressRoutes.has(route)).sort();

    expect(missingInOpenApi).toEqual([]);
    expect(missingInExpress).toEqual([]);
  });
});
