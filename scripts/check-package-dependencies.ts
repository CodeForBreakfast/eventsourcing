#!/usr/bin/env bun

/**
 * Discovers workspace packages and their dependency relationships.
 * Outputs package information for use in changeset validation.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

interface Package {
  name: string;
  version: string;
  dependencies: Record<string, string>;
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

function main() {
  const packages = getAllPackages();

  // Output packages and their dependents as JSON for use in changeset validation
  const packageDependencyMap: Record<string, string[]> = {};

  for (const pkg of packages) {
    const dependents = getDependentPackages(pkg.name, packages);
    packageDependencyMap[pkg.name] = dependents.map((dep) => dep.name);
  }

  console.log(JSON.stringify(packageDependencyMap, null, 2));
}

main();
