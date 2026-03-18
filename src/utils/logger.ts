import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

function sanitizeMessage(value: string): string {
	// Strip non-ASCII to avoid garbled emoji output in some terminals
	return value.replace(/[\u0080-\uFFFF]/g, '').replace(/\s+/g, ' ').trim();
}

export const logger = pino({
	level,
	base: { service: 'charger-service' },
	timestamp: pino.stdTimeFunctions.isoTime,
	hooks: {
		logMethod(args, method) {
			if (typeof args[0] === 'string') {
				args[0] = sanitizeMessage(args[0]);
			} else if (args[0] && typeof args[1] === 'string') {
				args[1] = sanitizeMessage(args[1]);
			}
			method.apply(this, args);
		}
	}
});
