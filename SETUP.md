# 🚀 Setup Guide for Publishing

This guide walks you through the final steps to publish your package with professional badges and CI/CD.

**Status:** Your GitHub username and npm package name have been configured!

```
GitHub: https://github.com/larsperceus/ev-charging-simulator
npm: https://www.npmjs.com/package/ev-charging-simulator
```

---

## Step 1: Run Badge Setup Script ⚙️

This updates all README, deployment docs, and configs with your GitHub username automatically:

```bash
npm run setup:badges
```

**What it does:**
- ✅ Updates README.md badges with your GitHub URLs
- ✅ Updates package.json with correct repository links
- ✅ Updates all documentation files
- ✅ Configures Codecov for your repository
- ✅ Prints next steps and URLs

---

## Step 2: Create npm Token 🔐

You need an npm authentication token for automated publishing.

### 2a. Create the token

```bash
npm token create
```

**Follow the prompts:**
- OTP (if you have 2FA): Enter your code
- Scopes: **Select "Publish"** (not read-only)
- Expiration: 90 days (recommended for security)

**You'll get:** `npm_xxxxxxxxxxxxxxxxxxxxxx`

**⚠️ Important:** Copy this token somewhere safe - you won't see it again!

### 2b. Add to GitHub Secrets

1. **Open your GitHub repo** → https://github.com/larsperceus/ev-charging-simulator
2. Go to **Settings** (repo settings, not profile)
3. Left sidebar → **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Fill in:
   - **Name:** `NPM_TOKEN`
   - **Value:** (paste the token from step 2a)
6. Click **Add secret** ✅

**Done!** GitHub can now publish to npm for you.

---

## Step 3: Commit and Push Setup Changes 📤

The badges setup script created a new config file. Commit it:

```bash
git add .
git commit -m "chore: configure badges and CI/CD"
git push origin main
```

**Wait ~2 minutes** for GitHub Actions to run automatically.

Check GitHub → **Actions** tab to see test.yml pass.

---

## Step 4: Create Your First Release 🎉

Once test.yml passes, create a GitHub release to trigger publishing:

1. Go to your GitHub repo → **Releases** tab
2. Click **Create a new release**
3. Fill in:
   - **Tag version:** `v1.0.6`
   - **Release title:** `Release v1.0.6`
   - **Description:** Copy from CHANGELOG.md section
4. Click **Publish release**

### What happens automatically:

1. GitHub Actions **test.yml** runs full test suite
2. If tests pass, **publish.yml** triggers automatically
3. publish.yml runs:
   - ✅ Final build validation
   - ✅ Tests on Node 18/20/22
   - ✅ `npm publish` to npm registry
   - ✅ Creates GitHub release assets
4. Within 2-5 minutes: Package available on npm!

### Verify publication:

```bash
# Check npm registry
npm view ev-charging-simulator version
# Should show: 1.0.6

# Or check website
curl https://registry.npmjs.org/ev-charging-simulator
```

Or visit: https://www.npmjs.com/package/ev-charging-simulator

---

## Step 5: View Your Professional Badges 📊

After publishing, your npm.js page will show:

```
✅ Tests     - GitHub Actions CI status
✅ npm pkg   - Latest version
✅ Node.js   - Required version
✅ License   - MIT/Apache badge
✅ Coverage  - Live code coverage %
✅ Security  - Vulnerability scan status
```

Click the **coverage badge** to see detailed stats:
- Line-by-line coverage map
- Coverage history over time
- Commit-by-commit comparison

---

## Common Questions

### Q: What if I need to change GitHub username/package name?

Edit the top of `setup-badges.js`:

```javascript
const GITHUB_USER = 'new-username';
const GITHUB_REPO = 'new-repo-name';
const NPM_PACKAGE = 'new-npm-package';
```

Then run:
```bash
npm run setup:badges
```

### Q: How do I rotate my npm token?

```bash
# Generate a new token (follow Step 2a)
npm token create

# Update in GitHub secrets (Settings → Secrets)
# Select NPM_TOKEN → Update value → paste new token

# Optional: revoke old token
npm token revoke <old-token-id>
npm token list  # to see token IDs
```

### Q: Can I schedule automated releases?

Yes! Create a GitHub Action that runs on schedule:

```yaml
name: Auto Release

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm version patch
      - run: git push && git push --tags
```

### Q: What if npm publish fails?

Check the error in publish.yml logs:

| Error | Fix |
|-------|-----|
| `403 Forbidden` | NPM_TOKEN is invalid or expired. Create new token. |
| `Version already published` | Increment version in package.json |
| `Package name taken` | Use a scoped name: `@yourorg/package-name` |

---

## Final Checklist ✅

Before your first release:

- [ ] `npm run setup:badges` completed successfully
- [ ] npm token created and tested locally: `npm token list`
- [ ] NPM_TOKEN secret added to GitHub repo settings
- [ ] Git changes committed: `git push origin main`
- [ ] GitHub Actions **test.yml** passed on main branch
- [ ] You can see badges in your GitHub repo README
- [ ] Ready to create first GitHub release!

---

## Next Steps

1. **Run:** `npm run setup:badges`
2. **Create npm token:** `npm token create`
3. **Add to GitHub:** Settings → Secrets → NPM_TOKEN
4. **Commit:** `git add . && git commit -m "chore: configure badges" && git push`
5. **Create release:** GitHub → Releases → Create a new release
6. **Watch:** GitHub Actions auto-publishes! 🚀

---

## Resources

- [npm Token Docs](https://docs.npmjs.com/creating-and-viewing-authentication-tokens)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Semantic Versioning](https://semver.org/)
- [Codecov Setup](https://docs.codecov.com/docs)

---

**Questions?** Check [DEPLOYMENT.md](DEPLOYMENT.md) or [CONTRIBUTING.md](CONTRIBUTING.md).

**Ready?** Run `npm run setup:badges` now! 🎉
