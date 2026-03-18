# Security Policy

## Reporting Security Vulnerabilities

**Please do not open public issues for security vulnerabilities.**

Instead, email details to: **security@larsperceus.dev** (or use GitHub's private vulnerability reporting if available)

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Proposed fix (if any)

We aim to respond within **48 hours** and release a patch within **7 days**.

---

## Security Features

### Input Validation

- OCPP messages validated against JSON Schema (AJV)
- Configuration files validated on load
- HTTP requests validated via express middleware
- No unsanitized user input accepted

### Error Handling

- Errors logged with Pino (no sensitive data)
- Stack traces not exposed in HTTP responses
- Connection errors caught and handled safely
- No promise rejection goes unhandled

### WebSocket Security

- Uses wss:// (WebSocket Secure) for production
- Supports TLS/SSL certificate validation
- Connection timeouts prevent resource exhaustion
- Auto-reconnection has exponential backoff (prevents DOS)

### Dependency Security

- **Weekly automated scans** via `npm audit`
- **Container scanning** via Trivy
- No hardcoded secrets in code
- All dependencies pinned to specific versions

Check security status: [GitHub Security Tab](https://github.com/larsperceus/ev-charging-simulator/security)

---

## Best Practices for Users

### 1. Protect CSMS Credentials

```typescript
// ❌ Don't do this
const charger = new Charger({
  csmsUrl: 'ws://csms.production.com',
  chargePointId: process.env.CHARGER_ID,
  password: 'hardcoded-password' // Never!
});

// ✅ Do this
const charger = new Charger({
  csmsUrl: process.env.CSMS_URL || 'ws://localhost:9000',
  chargePointId: process.env.CHARGER_ID,
  password: process.env.CHARGER_PASSWORD,
});
```

### 2. Use Environment Variables

```bash
# .env (never commit this)
CSMS_URL=ws://csms.example.com
CHARGER_PASSWORD=your-secret-password
NODE_ENV=production
```

```typescript
import dotenv from 'dotenv';
dotenv.config();

const chargers = loadChargersFromConfig(process.env.CONFIG_PATH || './config.json');
```

### 3. Use HTTPS/WSS in Production

```typescript
// ✅ Production
const charger = new Charger({
  csmsUrl: 'wss://csms.example.com', // wss not ws
  chargePointId: 'OCPP-001',
});

// ❌ Development only
const charger = new Charger({
  csmsUrl: 'ws://localhost:9000', // ws only for local
});
```

### 4. Implement Authentication

```typescript
// Add authentication to your HTTP API
import basicAuth from 'express-basic-auth';

app.use(basicAuth({
  users: { 'admin': process.env.API_PASSWORD },
  challenge: true,
}));

// Now: curl http://admin:password@localhost:3000/health
```

### 5. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 6. Validate Configuration Files

```typescript
// ❌ Don't load untrusted JSON
const config = JSON.parse(fs.readFileSync('config.json'));

// ✅ Validate with schema
import Ajv from 'ajv';
const ajv = new Ajv();
const validate = ajv.compile(chargerConfigSchema);

if (!validate(config)) {
  throw new Error(`Invalid config: ${JSON.stringify(validate.errors)}`);
}
```

### 7. Monitor Logs

```typescript
// Watch for suspicious patterns
- Multiple failed connections
- Invalid OCPP messages
- Unauthorized API requests
- Unexpected errors

// Example: Alert on 10+ connection failures in 5 minutes
```

### 8. Use Connection Timeouts

```typescript
const charger = new Charger({
  evseId: 'OCPP-001',
  connectors: 2,
  bootNotificationTimeout: 10_000, // 10 sec timeout
  heartbeatInterval: 60_000,
});

// Connection will timeout if CSMS doesn't respond
```

---

## Vulnerability Response Process

### 1. Assessment (24 hours)

- Confirm vulnerability in codebase
- Determine affected versions
- Calculate severity (CVSS score)

### 2. Fix (5-7 days)

- Develop patch in private branch
- Test thoroughly
- Review by maintainers

### 3. Release (coordinated)

- Release patch version (e.g., 1.0.6 → 1.0.7)
- Publish security advisory
- Update GitHub Security page
- Notify downstream users if critical

### 4. Communication

- GitHub Security Advisory published
- npm security notice posted
- Changelog updated

---

## Secure Configuration Template

Use this for production deployments:

```typescript
// config.ts - Load from environment

import dotenv from 'dotenv';
dotenv.config();

export const chargerConfig = {
  // CSMS Connection
  csmsUrl: process.env.CSMS_URL,
  chargePointId: process.env.CHARGER_ID,
  password: process.env.CHARGER_PASSWORD,

  // Security
  tls: {
    enabled: process.env.NODE_ENV === 'production',
    rejectUnauthorized: process.env.NODE_ENV === 'production', // Validate certs
    key: process.env.TLS_KEY_PATH,
    cert: process.env.TLS_CERT_PATH,
    ca: process.env.TLS_CA_PATH,
  },

  // Timeouts & Limits
  bootNotificationTimeout: 10_000,
  heartbeatInterval: 60_000,
  messageTimeout: 30_000,

  // Authentication (if API is exposed)
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info', // Never 'debug' in prod
};
```

---

## Dependency Audit

### View Current Status

```bash
npm audit
npm audit --json  # Machine-readable

# Check specific package
npm audit ev-charging-simulator
```

### Update Dependencies

```bash
# Check for available updates
npm outdated

# Update minor/patch (safe)
npm update

# Update major (review breaking changes)
npm install <package>@latest
```

### Exclusions

Some vulnerabilities may be excluded if:
- The vulnerability doesn't affect our code path
- The maintainers have a roadmap to fix it
- No alternative package is available

Check [.npmrc](.npmrc) for audit exceptions.

---

## Code Security Scanning

The project runs automated security checks:

| Tool | Purpose | Frequency |
|------|---------|-----------|
| npm audit | Dependency vulnerabilities | Every push |
| Trivy | Container & source scanning | Weekly |
| TypeScript | Type safety validation | Every push |
| ESLint | Code quality | Every push |

View results in **Actions** → **security** workflow.

---

## TLS/SSL Configuration

For WebSocket Secure (wss://):

```typescript
import * as fs from 'fs';
import * as https from 'https';

const options = {
  key: fs.readFileSync(process.env.KEY_FILE),
  cert: fs.readFileSync(process.env.CERT_FILE),
};

const server = https.createServer(options, app);
server.listen(9000);
```

Generate self-signed cert for testing:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

---

## Supported Versions

| Version | Security | Status |
|---------|----------|--------|
| 1.0.x | ✅ Supported | Active |
| < 1.0.0 | ❌ Unsupported | Not maintained |

Older versions will not receive security patches.

---

## Compliance

This project aims for:

- ✅ **OWASP Top 10** compliance
- ✅ **CWE** (Common Weakness Enumeration) awareness
- ✅ **CVSS 3.1** severity scoring
- ⚠️ **NIST** guidance (not required for npm packages)

---

## Security Contacts

- **📧 Email:** security@larsperceus.dev
- **🐛 GitHub:** Use private vulnerability report
- **💬 Discussions:** GitHub Discussions board

---

## Additional Resources

- [OWASP Top 10 - 2021](https://owasp.org/Top10/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [npm Security](https://docs.npmjs.com/about-npm#security)
- [CVSS Calculator](https://www.first.org/cvss/calculator/3.1)

---

**Last updated:** 2024
**Maintained by:** [Your Name/Organization]
