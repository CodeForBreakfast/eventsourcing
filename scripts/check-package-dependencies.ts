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
  readonly name: string;
  readonly version: string;
  readonly dependencies: Record<string, string>;
}

function getAllPackages(): readonly Package[] {
  const packagesDir = join(rootDir, 'packages');

  const dirs = readdirSync(packagesDir);
  return dirs.reduce<readonly Package[]>((packages, dir) => {
    const packagePath = join(packagesDir, dir, 'package.json');
    if (!existsSync(packagePath)) {
      return packages;
    }

    const content = readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(content);
    return [
      ...packages,
      {
        name: pkg.name,
        version: pkg.version,
        dependencies: {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        },
      },
    ];
  }, []);
}

function getDependentPackages(
  packageName: string,
  allPackages: readonly Package[]
): readonly Package[] {
  return allPackages.reduce<readonly Package[]>((dependents, pkg) => {
    const hasDependency = Object.entries(pkg.dependencies || {}).some(
      ([depName, depVersion]) =>
        depName === packageName &&
        (depVersion === 'workspace:*' || depVersion.startsWith('workspace:'))
    );

    return hasDependency ? [...dependents, pkg] : dependents;
  }, []);
}

function main() {
  const packages = getAllPackages();

  const packageDependencyMap: Record<string, readonly string[]> = packages.reduce<
    Record<string, readonly string[]>
  >((map, pkg) => {
    const dependents = getDependentPackages(pkg.name, packages);
    return {
      ...map,
      [pkg.name]: dependents.map((dep) => dep.name),
    };
  }, {});

  console.log(JSON.stringify(packageDependencyMap, null, 2));
}

main();
