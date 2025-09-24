#!/usr/bin/env bun

/**
 * Validates that changesets include all packages that need version bumps.
 * This runs in PR checks to prevent merging changesets that would cause
 * npm publish failures due to missing version bumps in dependent packages.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface Package {
  name: string;
  version: string;
  path: string;
  dependencies: Record<string, string>;
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
        dependencies: {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        },
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
      packages.push(match[1]);
      // Use the highest change type found
      const type = match[2] as 'major' | 'minor' | 'patch';
      if (type === 'major') changeType = 'major';
      else if (type === 'minor' && changeType !== 'major') changeType = 'minor';
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

function getDependentPackages(packageName: string, allPackages: Package[]): Package[] {
  const dependents: Package[] = [];

  for (const pkg of allPackages) {
    for (const [depName, depVersion] of Object.entries(pkg.dependencies || {})) {
      if (
        depName === packageName &&
        (depVersion === 'workspace:*' || depVersion.startsWith('workspace:'))
      ) {
        dependents.push(pkg);
        break;
      }
    }
  }

  return dependents;
}

function validateChangesets(): void {
  console.log('🔍 Validating changesets for workspace dependencies...\n');

  const packages = getAllPackages();
  const changesets = getChangesets();

  if (changesets.length === 0) {
    console.log('No changesets found. Skipping validation.');
    return;
  }

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

  // Check for missing dependent packages
  const errors: Array<{ changed: string; missing: string[] }> = [];

  for (const changedPackage of changedPackages) {
    const dependents = getDependentPackages(changedPackage, packages);
    const missingDependents = dependents.filter((dep) => !changedPackages.has(dep.name));

    if (missingDependents.length > 0) {
      errors.push({
        changed: changedPackage,
        missing: missingDependents.map((dep) => dep.name),
      });
    }
  }

  // Report results
  if (errors.length > 0) {
    console.log('❌ Validation Failed!\n');
    console.log('The following packages have workspace dependencies that also need changesets:\n');

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
    console.log('4. Commit the changeset file\n');
    console.log('This prevents npm publish failures where dependent packages');
    console.log('still reference old versions of their dependencies.\n');

    process.exit(1);
  }

  console.log('✅ All changesets include necessary dependent packages!');
}

// Run validation
validateChangesets();
