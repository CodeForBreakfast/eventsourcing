#!/usr/bin/env bun

/**
 * Orchestrates publish validation by discovering changed packages and running Turbo filtering.
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

function main() {
  console.log('🔍 Discovering packages that need publish validation...\n');

  // Step 1: Discover packages using the discovery script
  let packagesToValidate: string[];
  try {
    const output = execSync('bun scripts/validate-publish.ts', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    packagesToValidate = output
      .split('\n')
      .filter((line) => line.trim() && !line.includes('No changed packages detected'));
  } catch {
    console.log('❌ Failed to discover packages');
    process.exit(1);
  }

  if (packagesToValidate.length === 0) {
    console.log('✅ No packages need validation');
    return;
  }

  console.log(`📦 Found ${packagesToValidate.length} package(s) to validate:`);
  packagesToValidate.forEach((pkg) => console.log(`   - ${pkg}`));
  console.log('');

  // Step 2: Run validation using Turbo filtering
  const filterArgs = packagesToValidate.map((pkg) => `--filter=${pkg}`).join(' ');
  console.log(`🏗️  Running validation using Turbo...`);

  try {
    execSync(`bunx turbo run validate:pack ${filterArgs}`, {
      cwd: rootDir,
      stdio: 'inherit',
    });
    console.log('\n✅ All package validations passed!');
  } catch {
    console.log('\n❌ Package validation failed!');
    process.exit(1);
  }
}

main();
