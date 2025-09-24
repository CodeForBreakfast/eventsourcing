#!/usr/bin/env bun

/**
 * Validates that packages can be built and published successfully.
 * This runs as part of CI to ensure the release process will work.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface Package {
  name: string;
  version: string;
  path: string;
}

function getAllPackages(): Package[] {
  const packagesDir = join(rootDir, 'packages');
  const packages: Package[] = [];

  const dirs = readdirSync(packagesDir);
  for (const dir of dirs) {
    const packageJsonPath = join(packagesDir, dir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const content = readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      packages.push({
        name: pkg.name,
        version: pkg.version,
        path: packageJsonPath,
      });
    }
  }

  return packages;
}

function getChangedPackages(): Set<string> {
  const changedPackages = new Set<string>();

  try {
    // Get changed files in this PR/commit
    const baseBranch = process.env.GITHUB_BASE_REF || 'origin/main';
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
      cwd: rootDir,
    });

    const changedFiles = output.split('\n').filter((f) => f.length > 0);

    // Identify which packages have changes
    for (const file of changedFiles) {
      const match = file.match(/^packages\/([^\/]+)\//);
      if (match) {
        changedPackages.add(match[1]);
      }
    }
  } catch (error) {
    console.warn('Could not determine changed packages, validating all packages');
    // If we can't determine changes, validate everything
    const packages = getAllPackages();
    packages.forEach((pkg) => {
      const packageDir = pkg.path.split('/').slice(-2, -1)[0];
      changedPackages.add(packageDir);
    });
  }

  return changedPackages;
}

async function validatePublish(): Promise<void> {
  console.log('🔍 Validating package builds and publish readiness...\n');

  const errors: string[] = [];
  const changedPackages = getChangedPackages();

  if (changedPackages.size === 0) {
    console.log('✅ No package changes detected\n');
    return;
  }

  console.log('📦 Changed packages:');
  changedPackages.forEach((pkg) => console.log(`   - ${pkg}`));
  console.log('');

  // Step 1: Try to build all packages
  console.log('🏗️  Building packages...');
  try {
    execSync('bun run build', {
      cwd: rootDir,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    console.log('✅ All packages built successfully\n');
  } catch (error: any) {
    const output = error.stdout || error.stderr || error.message;
    errors.push(`Build failed:\n${output}`);
    console.log('❌ Build failed\n');
  }

  // Step 2: Check that changed packages have the necessary files for publishing
  console.log('📋 Checking publish requirements for changed packages...');
  const packagesDir = join(rootDir, 'packages');
  const publishProblems: string[] = [];

  for (const packageDir of changedPackages) {
    const packageJsonPath = join(packagesDir, packageDir, 'package.json');
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const packageName = packageJson.name;

    // Check required files exist
    const distDir = join(packagesDir, packageDir, 'dist');
    if (!existsSync(distDir)) {
      publishProblems.push(`${packageName}: missing dist directory`);
      continue;
    }

    const distFiles = readdirSync(distDir);
    if (!distFiles.some((f) => f === 'index.js')) {
      publishProblems.push(`${packageName}: missing dist/index.js`);
    }
    if (!distFiles.some((f) => f === 'index.d.ts')) {
      publishProblems.push(`${packageName}: missing dist/index.d.ts (TypeScript declarations)`);
    }

    // Check package.json has required fields
    if (!packageJson.main) {
      publishProblems.push(`${packageName}: missing "main" field in package.json`);
    }
    if (!packageJson.types && !packageJson.typings) {
      publishProblems.push(`${packageName}: missing "types" field in package.json`);
    }
  }

  if (publishProblems.length > 0) {
    errors.push(
      `Publish requirements not met:\n` + publishProblems.map((p) => `  - ${p}`).join('\n')
    );
    console.log(`❌ Found ${publishProblems.length} issues\n`);
  } else {
    console.log('✅ Changed packages are ready for publishing\n');
  }

  // Step 3: Run a publish dry-run for changed packages
  console.log('🚀 Running publish dry-run for changed packages...');
  for (const packageDir of changedPackages) {
    const packagePath = join(packagesDir, packageDir);
    const packageJsonPath = join(packagePath, 'package.json');

    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const packageName = packageJson.name;

    try {
      // Run npm pack to simulate what would be published
      execSync('npm pack --dry-run', {
        cwd: packagePath,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      console.log(`   ✅ ${packageName} ready for publish`);
    } catch (error: any) {
      errors.push(`${packageName} publish dry-run failed: ${error.message}`);
      console.log(`   ❌ ${packageName} publish dry-run failed`);
    }
  }

  console.log('');

  // Report results
  if (errors.length > 0) {
    console.log('❌ Validation failed!\n');
    console.log('The following issues must be fixed:\n');
    errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}\n`);
    });
    process.exit(1);
  }

  console.log('✅ All validations passed!');
  console.log('   Changed packages are ready for release.');
}

validatePublish().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
