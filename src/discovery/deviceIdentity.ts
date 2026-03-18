export function makeDeviceUuid(chargerId: string): string {
  const normalized = chargerId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const seed = (normalized || 'alfenvirtual').padEnd(32, '0').slice(0, 32);
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-${seed.slice(12, 16)}-${seed.slice(16, 20)}-${seed.slice(20, 32)}`;
}
