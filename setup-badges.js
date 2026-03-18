#!/usr/bin/env node
/**
 * Setup Script for EV Charging Simulator
 * 
 * This script configures badges, URLs, and CI/CD settings
 * based on your GitHub and npm package details.
 * 
 * Run once before publishing: npm run setup:badges
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GITHUB_USER = 'larsperceus';
const GITHUB_REPO = 'ev-charging-simulator';
const NPM_PACKAGE = 'ev-charging-simulator';

const config = {
  githubUser: GITHUB_USER,
  githubRepo: GITHUB_REPO,
  npmPackage: NPM_PACKAGE,
  githubUrl: `https://github.com/${GITHUB_USER}/${GITHUB_REPO}`,
  codecovUrl: `https://codecov.io/gh/${GITHUB_USER}/${GITHUB_REPO}`,
  npmUrl: `https://www.npmjs.com/package/${NPM_PACKAGE}`,
};

console.log('🔧 Configuring badges and URLs...\n');
console.log(`GitHub: ${config.githubUrl}`);
console.log(`npm: ${config.npmUrl}`);
console.log(`Codecov: ${config.codecovUrl}\n`);

/**
 * Update file by replacing placeholders
 */
function updateFile(filePath, replacements) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;

    for (const [placeholder, value] of Object.entries(replacements)) {
      const regex = new RegExp(placeholder, 'g');
      if (regex.test(content)) {
        content = content.replace(regex, value);
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${path.basename(filePath)}`);
      return true;
    }
  } catch (err) {
    console.error(`❌ Error updating ${filePath}:`, err.message);
  }
  return false;
}

/**
 * Update README.md with correct badge URLs
 */
updateFile(
  path.join(__dirname, 'README.md'),
  {
    'your-org/ev-charging-simulator': `${GITHUB_USER}/${GITHUB_REPO}`,
    'your-org/ev-charging-simulator.git': `${GITHUB_USER}/${GITHUB_REPO}.git`,
    'your-org/ev-charging-simulator/issues': `${GITHUB_USER}/${GITHUB_REPO}/issues`,
  }
);

/**
 * Update DEPLOYMENT.md
 */
updateFile(
  path.join(__dirname, 'DEPLOYMENT.md'),
  {
    'your-org/ev-charging-simulator': `${GITHUB_USER}/${GITHUB_REPO}`,
    'yourusername/ev-charging-simulator': `${GITHUB_USER}/${GITHUB_REPO}`,
  }
);

/**
 * Update CONTRIBUTING.md
 */
updateFile(
  path.join(__dirname, 'CONTRIBUTING.md'),
  {
    'yourusername/ev-charging-simulator': `${GITHUB_USER}/${GITHUB_REPO}`,
  }
);

/**
 * Update package.json with correct URLs
 */
const packageJsonPath = path.join(__dirname, 'package.json');
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  let updated = false;

  if (packageJson.homepage !== config.npmUrl) {
    packageJson.homepage = config.npmUrl;
    updated = true;
  }

  if (packageJson.repository.url !== `${config.githubUrl}.git`) {
    packageJson.repository.url = `${config.githubUrl}.git`;
    updated = true;
  }

  if (packageJson.bugs.url !== `${config.githubUrl}/issues`) {
    packageJson.bugs.url = `${config.githubUrl}/issues`;
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated: package.json`);
  }
} catch (err) {
  console.error(`❌ Error updating package.json:`, err.message);
}

/**
 * Update GitHub Actions workflows
 */
const workflowFiles = [
  '.github/workflows/test.yml',
  '.github/workflows/publish.yml',
  '.github/workflows/security.yml',
  '.github/workflows/release-quality.yml',
];

workflowFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    // Workflows don't need URL updates typically, but check for any comments
    updateFile(filePath, {
      'your-org': GITHUB_USER,
    });
  }
});

/**
 * Update .codecov.yml
 */
updateFile(
  path.join(__dirname, '.codecov.yml'),
  {
    'your-org/ev-charging-simulator': `${GITHUB_USER}/${GITHUB_REPO}`,
  }
);

/**
 * Update SECURITY.md
 */
updateFile(
  path.join(__dirname, 'SECURITY.md'),
  {
    'your-organization': GITHUB_USER,
    'https://github.com/your-org/ev-charging-simulator/security': 
      `${config.githubUrl}/security`,
    'security@yourwebsite.com': `security@${GITHUB_USER}.dev`, // Suggest email
  }
);

console.log('\n✨ Setup complete!\n');
console.log('📋 Next steps:');
console.log('1. Create GitHub personal access token:');
console.log('   https://github.com/settings/tokens');
console.log('   - Scopes: repo, workflow, user:email');
console.log('   - Copy the token\n');

console.log('2. Add NPM_TOKEN secret to GitHub:');
console.log('   - Go to: Repo Settings → Secrets and variables → Actions');
console.log('   - Click "New repository secret"');
console.log('   - Name: NPM_TOKEN');
console.log('   - Value: (paste your npm token)\n');

console.log('3. Generate npm token:');
console.log('   npm token create\n');

console.log('4. Create first release:');
console.log('   - GitHub → Releases → Create a new release');
console.log('   - Tag: v1.0.6');
console.log('   - Publish → GitHub Actions auto-publishes to npm! 🚀\n');

console.log('📊 Badges will be live at:');
console.log(`   ${config.npmUrl}\n`);
