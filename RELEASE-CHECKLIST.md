# Pre-Release Checklist

Use this checklist before publishing your first release to npm.

## 🔍 Pre-Flight Verification

### Code Quality
- [ ] `npm run build` completes without errors
- [ ] `npm test` - all 97 tests pass
- [ ] No TypeScript errors: `tsc --noEmit`
- [ ] No hardcoded secrets in code
- [ ] No `console.log()` in src/ files
- [ ] All async functions have proper error handling

```bash
# Run all checks
npm run build && npm test && npm run lint
```

### Documentation
- [ ] README.md is comprehensive and current
- [ ] All API methods have JSDoc comments
- [ ] Example code in README actually works
- [ ] No company-specific references (Optimile, Alfen, etc.)
- [ ] package.json description is clear and professional

```bash
# Verify README length
wc -l README.md  # Should be 500+ lines
```

### Files & Structure
- [ ] LICENSE file exists (MIT or Apache 2.0 recommended)
- [ ] .gitignore exists and excludes node_modules
- [ ] .npmignore exists (keeps package lean)
- [ ] tsconfig.json is correct
- [ ] package.json "files" array includes dist/ and README
- [ ] build/ or dist/ folder is in .gitignore

```bash
# Verify structure
ls -la
# Should show: CHANGELOG.md CONTRIBUTING.md DEPLOYMENT.md LICENSE README.md SECURITY.md
```

### Git Repository
- [ ] Code is committed: `git status` shows clean
- [ ] No large files (>10MB) committed
- [ ] Git history is clean (no accidental secrets)
- [ ] .git/config has correct remote URL

```bash
git status
git log --oneline | head -5
```

### package.json
- [ ] Name is unique and lowercase
- [ ] Version is valid semver (e.g., 1.0.6)
- [ ] Description is clear (50-160 chars)
- [ ] Keywords include 5-15 relevant terms
- [ ] Author is set
- [ ] License is specified
- [ ] Repository URL is correct
- [ ] Bugs URL is correct
- [ ] Homepage URL is correct
- [ ] Main points to dist/index.js or build/index.js
- [ ] Types points to dist/index.d.ts
- [ ] Node engine requires 18+
- [ ] All dependencies are necessary and pinned

```bash
npm pkg get | jq .
# Review all fields
```

## 🚀 Deployment Readiness

### GitHub Setup
- [ ] Repository is public on GitHub
- [ ] NPM_TOKEN secret created in Settings → Secrets
- [ ] GitHub URLs in package.json are updated
  - [ ] homepage
  - [ ] repository.url
  - [ ] bugs.url

```bash
grep -E "your-org|your-username" package.json
# Should be EMPTY (return nothing)
```

### Workflows
- [ ] `.github/workflows/test.yml` exists
- [ ] `.github/workflows/publish.yml` exists
- [ ] `.github/workflows/security.yml` exists
- [ ] `.github/workflows/release-quality.yml` exists
- [ ] Test workflow passes locally: `git push` and check Actions tab
- [ ] All workflows are enabled in Settings → Actions

```bash
ls -la .github/workflows/
# Should show 4 .yml files
```

### npm Account
- [ ] npm account created at npmjs.com
- [ ] 2FA enabled (recommended): `npm profile enable-2fa auth-only`
- [ ] npm token created: `npm token list`
- [ ] Token value matches NPM_TOKEN secret in GitHub

## 📦 Package Contents

### What Gets Published
```
ev-charging-simulator/
├── dist/                      # Compiled JavaScript
│   ├── index.js
│   ├── charger.js
│   ├── types/
│   └── ...
├── package.json              # Metadata
├── README.md                 # Main documentation
├── LICENSE                   # License file
├── CHANGELOG.md              # Version history
└── (node_modules excluded)   # Not published!
```

### Verify Package Contents
```bash
# See what would be published
npm pack --dry-run

# Or create a .tgz and inspect
npm pack
tar tzf ev-charging-simulator-1.0.6.tgz | head -20
```

## ✅ Final Verification

### Local Smoke Test
```bash
# In a temporary directory
mkdir test-install && cd test-install
npm init -y
npm install ../charger-service  # or npm install ev-charging-simulator
```

Then create test file:
```typescript
// test.mjs
import { Charger } from 'ev-charging-simulator';

const charger = new Charger({
  evseId: 'TEST-CHARGER',
  connectors: 1,
});

console.log('✅ Package imports successfully');
console.log('✅ Charger class available');
console.log(`✅ Ready to connect to: ${charger.bootOptions.chargePointVendor}`);
```

Run it:
```bash
node test.mjs
# Output should show all ✅ marks
```

## 🚢 Release Steps

Once all checks pass:

### 1. Update Version
```bash
# Edit package.json
"version": "1.0.6"

git add package.json
git commit -m "chore: bump to v1.0.6"
git push origin main
```

### 2. Wait for test.yml to pass
- Go to Actions tab
- Verify test.yml passes on Node 18/20/22
- Should take ~2 minutes

### 3. Create GitHub Release
- Go to Releases tab
- Click "Create a new release"
- Tag: `v1.0.6` (must start with 'v')
- Title: `Release v1.0.6 — Bug fixes and improvements`
- Body: (copy from CHANGELOG.md section)
- Click "Publish release"

### 4. Watch publish.yml
- This runs automatically after step 3
- Should take ~3-5 minutes
- Check Actions tab for progress
- Logs will show `npm publish` success

### 5. Verify Publication
```bash
# Option 1: Check npm registry
npm view ev-charging-simulator version
# Should show 1.0.6

# Option 2: Test installation
npm install ev-charging-simulator@1.0.6

# Option 3: Visit npmjs.com
# https://www.npmjs.com/package/ev-charging-simulator
```

## 🔒 Security Checklist

- [ ] No API keys in .env (use .env.example)
- [ ] No passwords in README or examples
- [ ] No private/internal documentation exposed
- [ ] No development only packages in dependencies
- [ ] npm audit passes: `npm audit`
- [ ] Dependencies are pinned to specific versions
- [ ] No eval() or Function() constructor usage

## 📋 Success Criteria

After your first release, users should:
- ✅ Find package on npmjs.com
- ✅ Install with `npm install ev-charging-simulator`
- ✅ Import types: `import { Charger, ConnectorState } from 'ev-charging-simulator'`
- ✅ See GitHub repository link on npm.js
- ✅ Read full README on npm.js
- ✅ See security scanning badges in GitHub

## 🆘 Troubleshooting

### My test.yml failed
```
Solution:
1. Check error message in Actions tab
2. Run locally: npm run build && npm test
3. Fix the issue
4. Commit and push - test.yml runs again
```

### NPM publish failed with 403
```
Solution:
1. Verify NPM_TOKEN secret exists in Settings
2. Check token hasn't expired: npm token list
3. Create new token if needed: npm token create
4. Update secret in GitHub Settings
```

### Package didn't appear on npm
```
Solution:
1. Check publish.yml ran successfully
2. Check version isn't already published
3. Increment version and try again
```

---

## 📚 Resources

- [package.json Fields Guide](https://docs.npmjs.com/cli/v9/configuring-npm/package-json)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

---

**Ready to publish?** Follow the steps above and you'll be on npmjs.com! 🎉

Need help? Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.
