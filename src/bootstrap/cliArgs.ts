export function parseEvseIds(argv: string[]): string[] {
  const direct = argv.find(arg => arg.startsWith('--evse-ids='));
  if (direct) {
    return direct
      .split('=', 2)[1]
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  }

  const idx = argv.indexOf('--evse-ids');
  if (idx >= 0) {
    const next = argv[idx + 1] ?? '';
    return next
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  }

  return [];
}

export function parseBrandArg(argv: string[]): string | undefined {
  const direct = argv.find(arg => arg.startsWith('--brand='));
  if (direct) return direct.split('=', 2)[1]?.trim();

  const idx = argv.indexOf('--brand');
  if (idx >= 0) return (argv[idx + 1] ?? '').trim();

  return undefined;
}
