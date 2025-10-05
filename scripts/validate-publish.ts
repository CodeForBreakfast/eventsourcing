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
  readonly name: string;
  readonly directory: string;
}

function getAllPackages(): readonly Package[] {
  const packagesDir = join(rootDir, 'packages');

  const dirs = readdirSync(packagesDir);
  return dirs
    .map((dir) => {
      const packageJsonPath = join(packagesDir, dir, 'package.json');
      if (existsSync(packageJsonPath)) {
        const content = readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        return {
          name: pkg.name,
          directory: dir,
        };
      }
      return null;
    })
    .filter((pkg): pkg is Package => pkg !== null);
}

function getChangedPackageNames(): readonly string[] {
  try {
    // Get changed files in this PR/commit
    const baseBranch = process.env.GITHUB_BASE_REF || 'origin/main';
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
      cwd: rootDir,
    });

    const changedFiles = output.split('\n').filter((f) => f.length > 0);

    // Identify which package directories have changes
    const changedDirectories = changedFiles.reduce((acc, file) => {
      const match = file.match(/^packages\/([^\/]+)\//);
      if (match && match[1]) {
        return new Set([...acc, match[1]]);
      }
      return acc;
    }, new Set<string>());

    // Convert directory names to package names
    if (changedDirectories.size > 0) {
      const allPackages = getAllPackages();
      return allPackages
        .filter((pkg) => changedDirectories.has(pkg.directory))
        .map((pkg) => pkg.name);
    }

    return [];
  } catch {
    console.warn('⚠️  Could not determine changed packages, validating all packages');
    // If we can't determine changes, validate everything
    const packages = getAllPackages();
    return packages.map((pkg) => pkg.name);
  }
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
