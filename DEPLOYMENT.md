# GitHub Actions & Deployment Guide

This guide explains the CI/CD pipeline and how to configure it for automatic npm publishing.

## Overview

The project uses **4 GitHub Actions workflows** for automated testing, security scanning, and npm publishing:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **test.yml** | Every push & PR | Run tests on Node 18/20/22 |
| **security.yml** | Weekly + on push | Scan dependencies for vulnerabilities |
| **release-quality.yml** | Before release | Validate package completeness |
| **publish.yml** | On GitHub Release | Auto-publish to npm |

## 🔧 Setup Steps

### Step 1: Generate NPM Token

On your local machine or npm.com:

```bash
npm token create
# Follow prompts:
# Select "Publish"
# Set expiration (90 days recommended)
# You'll receive a token like: npm_xxxxxxxxxxxxxxxxxxxx
```

### Step 2: Add NPM Token to GitHub Secrets

1. **Open your GitHub repository**
2. Go to **Settings** (repo settings, not your profile)
3. Left sidebar → **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Fill in:
   - **Name:** `NPM_TOKEN`
   - **Value:** (paste your npm token)
6. Click **Add secret**

**Result:** GitHub now has permission to publish to npm on your behalf.

### Step 3: Update GitHub URLs in package.json

Edit [charger-service/package.json](charger-service/package.json):

**Find** (lines 12-17):
```json
"homepage": "https://github.com/larsperceus/ev-charging-simulator",
"repository": {
  "type": "git",
  "url": "https://github.com/larsperceus/ev-charging-simulator.git"
},
"bugs": {
  "url": "https://github.com/larsperceus/ev-charging-simulator/issues"
},
```

**Replace with your actual repository:**
```json
"homepage": "https://github.com/larsperceus/ev-charging-simulator",
"repository": {
  "type": "git",
  "url": "https://github.com/larsperceus/ev-charging-simulator.git"
},
"bugs": {
  "url": "https://github.com/larsperceus/ev-charging-simulator/issues"
},
```

### Step 4: Commit and Push

```bash
git add .
git commit -m "chore: update github urls"
git push origin main
```

**Wait ~2 minutes** for test.yml to run and pass. Check **Actions** tab to verify.

---

## 📦 Publishing to npm

### Method 1: GitHub Release (Recommended)

1. **Go to GitHub repo** → **Releases** tab
2. Click **Create a new release**
3. Fill in:
   - **Choose a tag:** `v1.0.6` ← must start with `v`
   - **Release title:** `EV Charging Simulator v1.0.6`
   - **Description:** (copy from changelog, e.g., "Bug fixes and improvements")
4. Click **Publish release**

**What happens automatically:**
- ✅ test.yml validates everything
- ✅ publish.yml builds and publishes to npm
- ✅ Package appears on npm in 2-5 minutes
- ✅ GitHub release assets are created

**Verify publication:**
```bash
npm search ev-charging-simulator
# or visit: https://www.npmjs.com/package/ev-charging-simulator
```

### Method 2: Manual Workflow Dispatch

If you want to test without creating a release:

1. Go to **Actions** tab
2. Select **publish** workflow
3. Click **Run workflow** → **Run workflow**
4. Select branch (main)
5. Click green **Run workflow** button

⚠️ **This requires you to manually update the version in package.json first.**

---

## 🧪 Workflow Details

### test.yml - Continuous Integration

**Triggers:**
- Every push to any branch
- Every pull request

**What it does:**
1. Checks out code
2. Sets up Node.js 18, 20, and 22
3. Installs dependencies
4. Builds TypeScript
5. Runs all tests with coverage
6. Uploads coverage to GitHub (visible in PR)
7. Checks code quality (no console.log, debugger)

**Check results:**
- Go to **Actions** tab
- Find your recent commit/PR
- Click to see full logs

### security.yml - Security Scanning

**Triggers:**
- Weekly (Sundays at 0:00 UTC)
- Every push to main/develop

**What it does:**
1. Runs `npm audit` (dependency vulnerabilities)
2. Runs Trivy scan (container image + source scanning)
3. Validates TypeScript compilation

**Check results:**
- Go to **Security** tab → **Code scanning alerts**
- Trivy findings appear here
- Fix any `high` or `critical` issues before releasing

### release-quality.yml - Pre-Release Validation

**Triggers:**
- Automatically before publishing (called by publish.yml)
- Can manually trigger in Actions tab

**What it checks:**
- ✅ package.json exists and is valid JSON
- ✅ README.md exists and has content
- ✅ LICENSE file exists
- ✅ tsconfig.json is present
- ✅ .gitignore is present
- ✅ package.json has required fields (name, version, main, etc.)
- ✅ README has minimum 1000 characters
- ✅ Version follows semantic versioning (vX.Y.Z)

**Example failure:**
```
❌ Version check failed: version '1.0' is not valid semver
💡 Hint: Use format v1.0.0, v1.1.2, v2.0.0-beta, etc.
```

### publish.yml - Automated Publishing

**Triggers:**
- When you create a GitHub release
- Or manual "Run workflow" in Actions tab

**What it does:**
1. Runs release-quality checks
2. Builds the project
3. Runs full test suite
4. Publishes to npm using NPM_TOKEN
5. Creates GitHub release assets
6. Posts success message

**Requires:**
- ✅ NPM_TOKEN secret configured
- ✅ Valid semantic version tag (vX.Y.Z)
- ✅ All tests passing
- ✅ Package.json metadata complete

**Failure scenarios:**
```
❌ NPM_TOKEN secret not found
→ Solution: Add NPM_TOKEN to Settings → Secrets

❌ npm ERR! 403 Forbidden
→ Solution: Verify NPM_TOKEN is valid and has "Publish" scope

❌ Version already published
→ Solution: Increment version in package.json before releasing
```

---

## 🔍 Monitoring & Troubleshooting

### View Workflow Runs

**GitHub UI:**
1. Go to repo → **Actions** tab
2. Select workflow (test, publish, security)
3. Click run to see details
4. Click job step to see logs

### Common Issues & Fixes

#### "Test failed on Node 20"
```
Solution:
1. Run locally: npm run build && npm test
2. Check which test failed (shown in logs)
3. Fix locally, commit, and push again
4. GitHub will automatically re-run
```

#### "NPM Publish failed - 403 Forbidden"
```
Solution:
1. Verify NPM_TOKEN in Settings → Secrets is correct
2. Ensure you have "npm npm_xxxx 2_factor_auth_unavailable"
   (tokens with 2FA tokens don't work)
3. Create new token without 2FA:
   npm token create --read-only false
4. Update the NPM_TOKEN secret
```

#### "Version already published to npm"
```
Solution:
1. Increment version in package.json
   Example: 1.0.6 → 1.0.7
2. Commit & push
3. Create new GitHub release with same version
```

#### "Workflow didn't trigger"
```
Check:
1. Is the tag format correct? (Must be v1.0.6, not 1.0.6)
2. Does test.yml pass? (publish.yml skips if tests fail)
3. Is main branch protected? (Check Settings → Branches)
4. Manually trigger: Actions tab → publish → Run workflow
```

### Debug Logs

To see more details during debugging:

```bash
# Locally test npm publish (dry-run)
npm publish --dry-run

# Check what would be published
npm pack --dry-run

# View current npm token
npm token list
```

---

## 📋 Release Checklist

Before creating a GitHub release:

- [ ] Increment version in `package.json` (e.g., 1.0.5 → 1.0.6)
- [ ] Update CHANGELOG.md or release notes
- [ ] Verify all tests pass locally: `npm test`
- [ ] Verify TypeScript builds: `npm run build`
- [ ] Commit: `git commit -m "chore: bump to v1.0.6"`
- [ ] Push: `git push origin main`
- [ ] Create GitHub release with tag `v1.0.6`
- [ ] Watch publish.yml run in Actions tab
- [ ] Verify on npm: `npm search ev-charging-simulator`

---

## 🚀 What Users See

Once published, users can install with:

```bash
npm install ev-charging-simulator
```

And on npm.js, they'll see:
- ✅ Package name and description
- ✅ Latest version
- ✅ GitHub repository link (from package.json)
- ✅ README (automatically fetched from GitHub)
- ✅ Weekly vulnerability scans (from security.yml)
- ✅ All release history with notes

---

## Advanced: Secrets Management

### Rotating NPM Token

```bash
# 1. Create new token locally
npm token create
# Copy the new token

# 2. Update GitHub secret
# Settings → Secrets → NPM_TOKEN → Update value
# (Paste new token)

# 3. Delete old token (optional but recommended)
npm token revoke <old-token-id>
# Find token IDs with: npm token list
```

### Using Organization Secrets

If you have multiple repositories:

1. **GitHub org** → **Settings** → **Secrets and variables** → **Actions**
2. Click **New organization secret**
3. Name: `NPM_TOKEN`
4. Scope: Select which repos can access
5. All repos can now use `${{ secrets.NPM_TOKEN }}`

---

## References

- [GitHub Actions Documentation](https://docs.github.com/actions)
- [npm Token Documentation](https://docs.npmjs.com/creating-and-viewing-authentication-tokens)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

**Questions?** Check the [CONTRIBUTING.md](CONTRIBUTING.md) guide or open an issue!
