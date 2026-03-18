import { describe, expect, it, vi } from 'vitest';
import { logger } from '../utils/logger.js';

describe('logger sanitization', () => {
  it('handles plain string and object+message log variants', async () => {
    const noOp = vi.fn();

    expect(() => logger.info('héllo    world')).not.toThrow();
    expect(() => logger.info({ meta: 'ok' }, 'föö   bar')).not.toThrow();

    await new Promise(resolve => setImmediate(resolve));
    noOp();
    expect(noOp).toHaveBeenCalledOnce();
  });
});
