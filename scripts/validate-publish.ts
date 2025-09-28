#!/usr/bin/env bun

/**
 * Discovers packages that need publish validation based on git changes.
 * Outputs package names for use with Turbo filtering.
 * Does NOT perform validation - that's delegated to Turbo tasks.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface Package {
  name: string;
  directory: string;
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
        directory: dir,
      });
    }
  }

  return packages;
}

function getChangedPackageNames(): string[] {
  const changedPackageNames: string[] = [];

  try {
    // Get changed files in this PR/commit
    const baseBranch = process.env.GITHUB_BASE_REF || 'origin/main';
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
      cwd: rootDir,
    });

    const changedFiles = output.split('\n').filter((f) => f.length > 0);
    const changedDirectories = new Set<string>();

    // Identify which package directories have changes
    for (const file of changedFiles) {
      const match = file.match(/^packages\/([^\/]+)\//);
      if (match) {
        changedDirectories.add(match[1]);
      }
    }

    // Convert directory names to package names
    if (changedDirectories.size > 0) {
      const allPackages = getAllPackages();
      for (const pkg of allPackages) {
        if (changedDirectories.has(pkg.directory)) {
          changedPackageNames.push(pkg.name);
        }
      }
    }
  } catch {
    console.warn('⚠️  Could not determine changed packages, validating all packages');
    // If we can't determine changes, validate everything
    const packages = getAllPackages();
    changedPackageNames.push(...packages.map((pkg) => pkg.name));
  }

  return changedPackageNames;
}

function main() {
  const changedPackageNames = getChangedPackageNames();

  if (changedPackageNames.length === 0) {
    console.log('No changed packages detected');
    return;
  }

  // Output package names for use with Turbo filtering
  changedPackageNames.forEach((pkg) => console.log(pkg));
}

main();
