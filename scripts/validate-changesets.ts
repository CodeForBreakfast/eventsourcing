#!/usr/bin/env bun

/**
 * Validates that changesets exist when needed and include all necessary packages.
 * This runs in PR checks to prevent:
 * 1. Merging changes without changesets (would cause npm publish failures)
 * 2. Merging changesets that miss dependent packages
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

interface ChangesetInfo {
  packages: string[];
  type: 'major' | 'minor' | 'patch';
}

function getAllPackages(): Package[] {
  const packagesDir = join(rootDir, 'packages');
  const packages: Package[] = [];

  const dirs = readdirSync(packagesDir);
  for (const dir of dirs) {
    const packagePath = join(packagesDir, dir, 'package.json');
    if (existsSync(packagePath)) {
      const content = readFileSync(packagePath, 'utf-8');
      const pkg = JSON.parse(content);
      packages.push({
        name: pkg.name,
        version: pkg.version,
        path: packagePath,
      });
    }
  }

  return packages;
}

function getChangesets(): ChangesetInfo[] {
  const changesetsDir = join(rootDir, '.changeset');
  const changesets: ChangesetInfo[] = [];

  if (!existsSync(changesetsDir)) {
    return changesets;
  }

  const files = readdirSync(changesetsDir);
  for (const file of files) {
    // Skip README and config
    if (file === 'README.md' || file === 'config.json' || !file.endsWith('.md')) {
      continue;
    }

    const content = readFileSync(join(changesetsDir, file), 'utf-8');
    const lines = content.split('\n');

    // Parse the frontmatter
    let inFrontmatter = false;
    let frontmatterContent = '';

    for (const line of lines) {
      if (line === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          break;
        }
      } else if (inFrontmatter) {
        frontmatterContent += line + '\n';
      }
    }

    // Parse packages and version type from frontmatter
    const packages: string[] = [];
    let changeType: 'major' | 'minor' | 'patch' = 'patch';

    // Match patterns like:
    // "@codeforbreakfast/package": patch
    // '@codeforbreakfast/package': minor
    const packageRegex = /['"]([^'"]+)['"]\s*:\s*(major|minor|patch)/g;
    let match;

    while ((match = packageRegex.exec(frontmatterContent)) !== null) {
      const packageName = match[1];
      if (packageName) {
        packages.push(packageName);
        // Use the highest change type found
        const type = match[2] as 'major' | 'minor' | 'patch';
        if (type === 'major') changeType = 'major';
        else if (type === 'minor' && changeType !== 'major') changeType = 'minor';
      }
    }

    if (packages.length > 0) {
      changesets.push({
        packages,
        type: changeType,
      });
    }
  }

  return changesets;
}

function getPackageDependencyMap(): Record<string, string[]> {
  try {
    const output = execSync('bun scripts/check-package-dependencies.ts', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return JSON.parse(output);
  } catch {
    console.error('❌ Failed to get package dependency information');
    process.exit(1);
  }
}

function getChangedFiles(): string[] {
  try {
    // Get the base branch (usually main)
    const baseBranch = process.env.GITHUB_BASE_REF || 'origin/main';

    // Get list of changed files compared to base branch
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
      cwd: rootDir,
    });

    return output.split('\n').filter((file) => file.length > 0);
  } catch (error) {
    console.warn('⚠️  Could not determine changed files, assuming this is not a PR');
    return [];
  }
}

function hasCodeChanges(changedFiles: string[]): boolean {
  // Check if any changed files are in packages/ or affect the codebase
  // Exclude pure documentation changes at root level
  const codePatterns = [
    /^packages\//, // Any changes in packages/
    /^scripts\//, // Scripts changes
    /\.ts$/, // TypeScript files
    /\.tsx$/, // TypeScript React files
    /\.js$/, // JavaScript files
    /\.jsx$/, // JavaScript React files
    /^package\.json$/, // Root package.json
    /^bun\.lockb$/, // Lock file
    /^tsconfig/, // TypeScript config
    /^\.github\/workflows/, // Workflow changes (except this validation)
  ];

  for (const file of changedFiles) {
    // Check if it's a code change
    if (codePatterns.some((pattern) => pattern.test(file))) {
      // But exclude if it's only this validation script being updated
      if (file === 'scripts/validate-changesets.ts') {
        continue;
      }
      return true;
    }
  }

  return false;
}

function checkForUnpublishedPackages(): string[] {
  const unpublishable: string[] = [];

  try {
    // Use Turbo to check all packages in parallel
    execSync('bunx turbo run check:publishable', {
      cwd: rootDir,
      stdio: 'pipe',
    });
    // If all tasks pass, all packages are publishable
    return [];
  } catch (error: any) {
    // Parse the error output to find which packages failed (are unpublishable)
    const output = error.stdout || error.stderr || '';

    // Look for package names in the error output
    // Turbo will show which packages failed the check:publishable task
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('check:publishable') && line.includes('FAILED')) {
        const match = line.match(/@[\w-]+\/[\w-]+/);
        if (match) {
          unpublishable.push(match[0]);
        }
      }
    }

    return unpublishable;
  }
}

function validateChangesets(): void {
  console.log('🔍 Validating changesets and release readiness...\n');

  const packages = getAllPackages();
  const changesets = getChangesets();
  const changedFiles = getChangedFiles();

  // Check for changesets referencing non-existent or private packages
  const validPackageNames = new Set(packages.map((p) => p.name));
  const rootPackageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  const errors: string[] = [];

  for (const changeset of changesets) {
    for (const pkgName of changeset.packages) {
      if (!validPackageNames.has(pkgName)) {
        if (pkgName === rootPackageJson.name) {
          errors.push(`❌ Changeset references the private monorepo root package: ${pkgName}`);
          errors.push('   The monorepo root is private and cannot be published to npm.');
        } else {
          errors.push(`❌ Changeset references non-existent package: ${pkgName}`);
          errors.push('   This package does not exist in the workspace.');
        }
      }
    }
  }

  if (errors.length > 0) {
    console.log('❌ Invalid changesets detected!\n');
    errors.forEach((err) => console.log(err));
    console.log('\nThis would cause the release workflow to fail with:');
    console.log('"Found changeset for package which is not in the workspace"\n');
    console.log('To fix this issue:');
    console.log('1. Remove or update the invalid changeset file(s)');
    console.log('2. Only reference packages that exist in packages/ directory');
    console.log('3. Never reference the monorepo root package');
    console.log('\nValid packages are:');
    packages.forEach((p) => console.log(`   - ${p.name}`));
    process.exit(1);
  }

  // First check: if there are code changes, we need changesets
  if (changedFiles.length > 0 && hasCodeChanges(changedFiles)) {
    console.log('📝 Code changes detected in:');
    changedFiles
      .filter((f) => !f.startsWith('.changeset/') || f === '.changeset/config.json')
      .slice(0, 10)
      .forEach((file) => console.log(`   - ${file}`));
    if (changedFiles.length > 10) {
      console.log(`   ... and ${changedFiles.length - 10} more files`);
    }
    console.log('');

    if (changesets.length === 0) {
      console.log('❌ Validation Failed!\n');
      console.log('This PR contains code changes but no changesets.\n');
      console.log('Without a changeset, the release workflow will fail because it will');
      console.log(
        'attempt to publish packages that are already published at their current versions.\n'
      );
      console.log('To fix this issue:');
      console.log('1. Run: bun changeset');
      console.log('2. Select the packages that have changed');
      console.log('3. Choose appropriate version bumps:');
      console.log('   - patch: for bug fixes and minor updates (including docs)');
      console.log('   - minor: for new features');
      console.log('   - major: for breaking changes');
      console.log('4. Write a summary focused on what consumers need to know');
      console.log('5. Commit the changeset file\n');
      process.exit(1);
    }

    // Check if any packages would fail to publish using Turbo tasks
    const unpublishable = checkForUnpublishedPackages();
    if (unpublishable.length > 0 && changesets.length === 0) {
      console.log('❌ Validation Failed!\n');
      console.log('The following package versions already exist on npm:');
      unpublishable.forEach((pkg) => console.log(`   - ${pkg}`));
      console.log('\nThe release workflow would fail trying to republish these versions.');
      console.log('You must create a changeset to bump the versions.\n');
      process.exit(1);
    }
  } else if (changedFiles.length === 0) {
    console.log('No changes detected. This might not be a PR or might be the first commit.');
    return;
  } else {
    console.log('📄 Only documentation changes detected - changesets optional');
    if (changesets.length === 0) {
      console.log('');
      console.log('ℹ️  Consider adding a changeset for documentation updates to:');
      console.log('   - Track the documentation change in version history');
      console.log('   - Allow users to see docs were updated via npm');
      console.log('   - Prevent potential CI issues\n');
    }
  }

  if (changesets.length > 0) {
    // Collect all packages that are being changed
    const changedPackages = new Set<string>();
    for (const changeset of changesets) {
      for (const pkg of changeset.packages) {
        changedPackages.add(pkg);
      }
    }

    console.log('📦 Packages with changesets:');
    changedPackages.forEach((pkg) => console.log(`   - ${pkg}`));
    console.log('');

    // Check for missing dependent packages using discovery script
    const packageDependencyMap = getPackageDependencyMap();
    const errors: Array<{ changed: string; missing: string[] }> = [];

    for (const changedPackage of changedPackages) {
      const dependentNames = packageDependencyMap[changedPackage] || [];
      const missingDependents = dependentNames.filter((dep) => !changedPackages.has(dep));

      if (missingDependents.length > 0) {
        errors.push({
          changed: changedPackage,
          missing: missingDependents,
        });
      }
    }

    // Report results
    if (errors.length > 0) {
      console.log('❌ Validation Failed!\n');
      console.log(
        'The following packages have workspace dependencies that also need changesets:\n'
      );

      for (const error of errors) {
        console.log(`  📦 ${error.changed} is being changed`);
        console.log(`     Missing changesets for dependent packages:`);
        error.missing.forEach((dep) => {
          console.log(`       - ${dep}`);
        });
        console.log('');
      }

      console.log('To fix this issue:');
      console.log('1. Create a changeset that includes ALL affected packages:');
      console.log('   bun changeset');
      console.log('2. Select both the changed packages and their dependents listed above');
      console.log('3. Choose appropriate version bumps (usually patch for dependents)');
      console.log('4. Write a consumer-focused summary of changes');
      console.log('5. Commit the changeset file\n');
      console.log('This prevents npm publish failures where dependent packages');
      console.log('still reference old versions of their dependencies.\n');

      process.exit(1);
    }
  }

  console.log('✅ Changeset validation passed!');
  if (changesets.length > 0) {
    console.log('   All changesets include necessary dependent packages.');
  }
}

// Run validation
validateChangesets();
