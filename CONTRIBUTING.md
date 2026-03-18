# Contributing to EV Charging Simulator

Thank you for your interest in contributing! This document outlines the development workflow and guidelines.

## Development Setup

### Prerequisites

- Node.js 18+ (verify with `node --version`)
- npm 9+ (verify with `npm --version`)
- Git

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-org/ev-charging-simulator.git
cd ev-charging-simulator/charger-service

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Watch for changes during development
npm run test:watch
```

## Code Style & Quality

### TypeScript

- Use strict mode (enabled in `tsconfig.json`)
- Export public API types
- Add JSDoc comments for public methods
- Keep function signatures clear and documented

### Testing

- Write tests for all new features
- Maintain >90% code coverage
- Use descriptive test names
- Test error cases, not just happy paths

```typescript
// ✅ Good test name
it('should reject invalid connector ID for setStatus', async () => {
  const charger = new Charger({ evseId: 'TEST', connectors: 1 });
  expect(() => charger.setStatus('Available', 999)).toThrow();
});

// ❌ Poor test name
it('test setStatus', async () => {
  // ...
});
```

### Avoid

- `console.log()` in production code (use `logger` instead)
- Hardcoded timeouts or magic numbers (define as constants)
- Unhandled promise rejections
- Memory leaks (always cleanup timers/listeners)

## Git Workflow

### Branch Naming

```
feature/     - New features (feature/async-connect)
fix/         - Bug fixes (fix/reconnection-timeout)
docs/        - Documentation (docs/readme-improvements)
chore/       - Dependencies, build, etc (chore/upgrade-typescript)
```

### Commits

Use conventional commits:

```bash
git commit -m "feat: add async connect with timeout handling"
git commit -m "fix: handle unhandled promise rejection in message handler"
git commit -m "docs: add comprehensive README with examples"
git commit -m "test: improve coverage for error scenarios"
```

### Pull Requests

1. **One feature per PR** — Keep changes focused
2. **Describe what & why** — Not just "what" changed
3. **Link issues** — Reference with `Fixes #123` or `Closes #456`
4. **Run local tests** — Ensure all pass before submitting

**PR Template:**

```markdown
## Description
What problem does this solve or what feature does it add?

## Changes
- Bullet list of changes
- Keep focused

## Testing
How was this tested?

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] TypeScript builds without errors
```

## Building & Testing

### Local

```bash
# Full build & test
npm run build && npm test

# Watch mode (auto-rebuild on save)
npm run test:watch

# Coverage report
npm run test:coverage
```

### GitHub Actions (Automatic)

Every push and PR runs:

1. **Test workflow** — Tests on Node 18, 20, 22
2. **Security scan** — Dependency audit, Trivy scan
3. **Release quality** — Validates version, README, structure
4. **Type checking** — Full TypeScript verification

## Release Process

### Version Bumping (Manual)

```bash
# Update version in package.json
npm version major|minor|patch

# This will:
# - Bump version in package.json
# - Create a git tag
# - Commit the change

# Push to trigger GitHub Actions publish
git push origin main --tags
```

### Automatic Publishing

Once a GitHub Release is created:

1. GitHub Actions runs full test suite
2. If all pass, automatically publishes to npm
3. Release assets are created on GitHub

**To create a release:**

1. Go to GitHub → Releases → "Create a new release"
2. Tag version: `v1.0.7`
3. Title: `Release v1.0.7 — Bug fixes and improvements`
4. Describe changes in release notes
5. Click "Create release"
6. Watch GitHub Actions automatically publish! ✅

## Documentation

### README

- Keep examples current and correct
- Use anonymous data (EVSE-ANON-1, GenericVendor, etc)
- Add new features to feature list
- Update troubleshooting if adding new error cases

### JSDoc

```typescript
/**
 * Establishes WebSocket connection and waits for boot notification.
 * 
 * @throws {Error} If CSMS is unreachable or boot notification times out
 * @returns Promise that resolves when charger is ready for transactions
 * 
 * @example
 * ```ts
 * const charger = new Charger({ evseId: 'TEST', connectors: 1 });
 * await charger.connect(); // Connected and ready
 * ```
 */
public async connect(): Promise<void> {
  // ...
}
```

## Common Issues

### Tests fail locally but pass in CI

- Ensure you're on the same Node version (check `.github/workflows/test.yml`)
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear TypeScript cache: `npm run build -- --clean`

### Cannot push to main

- Create a feature branch: `git checkout -b feature/my-feature`
- Submit PR for review
- Once approved, PR can be merged to main

### Merge conflicts

```bash
# Update main locally
git fetch origin
git rebase origin/main

# Or reset and start fresh
git reset --hard origin/main
git checkout -b feature/my-feature-v2
```

## Creating Issues

### Bug Reports

```markdown
## Description
[Clear description of the bug]

## Reproduction Steps
1. Create charger with config X
2. Call method Y
3. Observe error Z

## Expected vs Actual
- Expected: [what should happen]
- Actual: [what happens]

## Environment
- Node version: 20.x
- npm version: 10.x
- OS: Linux/macOS/Windows
```

### Feature Requests

```markdown
## Description
[Clear description of the feature]

## Use Case
Why is this valuable? Who needs this?

## Proposed Solution
How should this work?

## Alternatives Considered
Other approaches?
```

## Code Review Checklist

When reviewing PRs, check:

- ✅ Code follows style guide
- ✅ Tests are comprehensive
- ✅ No typos in comments/docs
- ✅ No hardcoded values/secrets
- ✅ Error handling is robust
- ✅ TypeScript types are correct
- ✅ No console.log in production code
- ✅ Async/await is properly handled

## Questions?

- Open an issue with `[question]` label
- Check existing issues/discussions first
- Check README troubleshooting section

---

**Thank you for contributing! 🎉**
