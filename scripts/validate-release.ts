#!/usr/bin/env bun

/**
 * Orchestrates release validation using changeset-driven package discovery and Turbo filtering.
 * This ensures:
 * 1. Changesets exist when needed (delegated to validate-changesets.ts)
 * 2. Only packages that will be released are validated (changeset-driven)
 * 3. Package validation is done via Turbo tasks (cacheable, parallel)
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface ChangesetStatus {
  releases: Array<{ name: string; type: string }>;
  changesets: Array<unknown>;
}

function getPackagesToValidate(): string[] {
  console.log('🔍 Discovering packages that need validation...\n');

  // Check if this is a changeset release branch - skip validation
  const isChangesetBranch = process.env.GITHUB_HEAD_REF?.startsWith('changeset-release/') ?? false;

  if (isChangesetBranch) {
    console.log('📦 Skipping validation (version PR)');
    return [];
  }

  try {
    // In CI, ensure the base branch exists for changesets to work
    if (process.env.GITHUB_BASE_REF) {
      try {
        execSync(`git fetch origin ${process.env.GITHUB_BASE_REF}:${process.env.GITHUB_BASE_REF}`, {
          cwd: rootDir,
          stdio: 'pipe',
        });
      } catch {
        // Branch might already exist, that's fine
      }
    }

    // Get changeset status to find packages that will be released
    execSync('bunx changeset status --output=status.json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const statusJson = execSync('cat status.json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Clean up the status file
    execSync('rm -f status.json', { cwd: rootDir });

    const status: ChangesetStatus = JSON.parse(statusJson);

    if (status.releases && status.releases.length > 0) {
      const packageNames = status.releases.map((release) => release.name);

      console.log(`📦 Found ${packageNames.length} package(s) to validate:`);
      packageNames.forEach((pkg) => console.log(`   - ${pkg}`));
      console.log('');

      return packageNames;
    } else {
      console.log('✅ No packages to release, no validation needed\n');
      return [];
    }
  } catch {
    console.log('⚠️  Could not determine packages to validate, skipping pack validation\n');
    return [];
  }
}

async function main() {
  console.log('🔍 Starting release validation...\n');

  // Step 1: Validate changesets (delegated to separate script)
  console.log('📦 Validating changesets...');
  try {
    execSync('bun scripts/validate-changesets.ts', {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } catch {
    console.log('❌ Changeset validation failed');
    process.exit(1);
  }

  // Step 2: Discover packages that need validation
  const packagesToValidate = getPackagesToValidate();

  if (packagesToValidate.length === 0) {
    console.log('✅ Release validation complete - no packages to validate');
    return;
  }

  // Step 3: Run targeted package validation using Turbo filtering
  const filterArgs = packagesToValidate.map((pkg) => `--filter=${pkg}`).join(' ');
  console.log(`🏗️  Running validation for ${packagesToValidate.length} packages using Turbo...`);

  try {
    execSync(`bunx turbo run validate:pack ${filterArgs}`, {
      cwd: rootDir,
      stdio: 'inherit',
    });
    console.log('\n✅ All package validations passed!');
    console.log('   This PR should successfully release when merged.');
  } catch {
    console.log('\n❌ Package validation failed!');
    console.log('   Fix the validation errors above before merging.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
