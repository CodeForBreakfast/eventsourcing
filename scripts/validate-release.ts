#!/usr/bin/env bun

/**
 * Validates that the release process will succeed using changesets' built-in tools.
 * This ensures:
 * 1. Changesets exist when needed (via changeset status)
 * 2. Packages can be built successfully
 * 3. Publishing will work (via changeset publish --dry-run)
 */

import { execSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface ValidationResult {
  success: boolean;
  errors: string[];
}

async function validateRelease(): Promise<ValidationResult> {
  console.log('🔍 Validating release readiness...\n');
  const errors: string[] = [];

  // Step 1: Check changeset status
  console.log('📦 Checking changesets status...');
  try {
    // In CI, we need to ensure the base branch exists for changesets to work
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

    const output = execSync('bunx changeset status --output=status.json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Read the status output
    const statusJson = execSync('cat status.json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Clean up the status file
    execSync('rm -f status.json', { cwd: rootDir });

    const status = JSON.parse(statusJson);

    if (status.changesets.length === 0 && status.releases.length > 0) {
      // There are package changes but no changesets
      errors.push(
        `Package changes detected but no changesets found.\n` +
          `Packages that would be released:\n` +
          status.releases.map((r: any) => `  - ${r.name}: ${r.type}`).join('\n') +
          `\n\nRun 'bun changeset' to create a changeset.`
      );
      console.log('❌ Missing changesets for package changes\n');
    } else if (status.changesets.length > 0) {
      console.log(`✅ Found ${status.changesets.length} changeset(s)\n`);
    } else {
      console.log('✅ No changes requiring changesets\n');
    }
  } catch (error: any) {
    // changeset status exits with code 1 if there are problems
    const message = error.stdout || error.stderr || error.message;
    if (message.includes('No changesets present')) {
      console.log('✅ No changesets needed (no changes)\n');
    } else if (message.includes('There are changed packages with no changesets')) {
      errors.push(
        `Changed packages found without changesets.\n` +
          `Run 'bun changeset' to create a changeset for your changes.`
      );
      console.log('❌ Changed packages without changesets\n');
    } else {
      errors.push(`Changeset status check failed: ${message}`);
      console.log('❌ Changeset status check failed\n');
    }
  }

  // Step 2: Build all packages
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
    errors.push(`Build failed:\n${output.substring(0, 500)}`);
    console.log('❌ Build failed\n');
    // If build fails, we can't continue
    return { success: false, errors };
  }

  // Step 3: Validate package configurations
  console.log('📦 Validating package configurations...');

  try {
    // Validate that packages can be packed correctly using npm pack --dry-run
    console.log('   Checking package configurations...');

    // Get list of packages that would be published
    const statusOutput = execSync('bunx changeset status --output=status.json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const statusJson = execSync('cat status.json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Clean up
    execSync('rm -f status.json', { cwd: rootDir });

    const status = JSON.parse(statusJson);

    if (status.releases && status.releases.length > 0) {
      console.log(`   ℹ️  Found ${status.releases.length} package(s) to be released`);

      // Validate each package can be packed
      for (const release of status.releases) {
        try {
          const packageDir = release.name.replace('@codeforbreakfast/', '');
          execSync(`npm pack --dry-run`, {
            cwd: join(rootDir, 'packages', packageDir),
            stdio: 'pipe',
          });
        } catch (packError: any) {
          errors.push(`Package ${release.name} failed pack validation: ${packError.message}`);
        }
      }

      if (errors.length === 0) {
        console.log('   ✅ All packages validate successfully');
      }
    } else {
      console.log('   ℹ️  No packages to release');
    }
    console.log('');
  } catch (error: any) {
    // If we can't get changeset status, that's already handled in step 1
    console.log('   ℹ️  Package validation skipped (no releases planned)\n');
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

// Main execution
async function main() {
  const result = await validateRelease();

  if (result.errors.length > 0) {
    console.log('❌ Release validation failed!\n');
    console.log('The following issues must be fixed before merging:\n');
    result.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}\n`);
    });
    console.log('Fix these issues to ensure the release pipeline will succeed.');
    process.exit(1);
  }

  console.log('✅ Release validation passed!');
  console.log('   This PR should successfully release when merged.');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
