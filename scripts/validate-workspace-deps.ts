#!/usr/bin/env bun

/**
 * Validates that packages with workspace:* dependencies have been properly versioned
 * when their dependencies have changed versions. This prevents npm publish failures
 * where packages try to publish with the same version that already exists.
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
  dir: string;
  dependencies: Record<string, string>;
}

interface WorkspaceDependency {
  name: string;
  localVersion: string;
  npmVersion: string | null;
}

interface ValidationError {
  package: string;
  currentVersion: string;
  npmVersion: string;
  updatedDependencies: string[];
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
        dir: join(packagesDir, dir),
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

function getNpmVersion(packageName: string): string | null {
  try {
    const version = execSync(`npm view "${packageName}" version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr
    }).trim();
    return version;
  } catch (error) {
    // Package might not exist on npm yet
    return null;
  }
}

function getWorkspaceDependencies(pkg: Package, allPackages: Package[]): WorkspaceDependency[] {
  const workspaceDeps: WorkspaceDependency[] = [];
  const packagesByName = new Map(allPackages.map((p) => [p.name, p]));

  for (const [depName, depVersion] of Object.entries(pkg.dependencies || {})) {
    if (depVersion === 'workspace:*' || depVersion.startsWith('workspace:')) {
      const depPackage = packagesByName.get(depName);
      if (depPackage) {
        workspaceDeps.push({
          name: depName,
          localVersion: depPackage.version,
          npmVersion: getNpmVersion(depName),
        });
      }
    }
  }

  return workspaceDeps;
}

function validatePackages(): void {
  console.log('🔍 Validating workspace dependencies...\n');

  const packages = getAllPackages();
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  for (const pkg of packages) {
    const npmVersion = getNpmVersion(pkg.name);

    if (!npmVersion) {
      console.log(`✅ ${pkg.name}@${pkg.version} - New package (not yet on npm)`);
      continue;
    }

    const workspaceDeps = getWorkspaceDependencies(pkg, packages);

    // Check if this package's workspace dependencies have been updated
    const updatedDeps = workspaceDeps.filter((dep) => {
      return dep.npmVersion && dep.localVersion !== dep.npmVersion;
    });

    if (updatedDeps.length > 0 && pkg.version === npmVersion) {
      errors.push({
        package: pkg.name,
        currentVersion: pkg.version,
        npmVersion: npmVersion,
        updatedDependencies: updatedDeps.map(
          (d) => `${d.name} (${d.npmVersion} → ${d.localVersion})`
        ),
      });
    } else if (pkg.version === npmVersion) {
      warnings.push(`${pkg.name}@${pkg.version} - Same version as npm (no dependencies changed)`);
    } else {
      console.log(`✅ ${pkg.name}@${pkg.version} - Version bumped (npm: ${npmVersion})`);
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach((w) => console.log(`   ${w}`));
  }

  // Print errors
  if (errors.length > 0) {
    console.log('\n❌ Validation Failed!\n');
    console.log(
      'The following packages need version bumps because their dependencies have changed:\n'
    );

    for (const error of errors) {
      console.log(`  📦 ${error.package}`);
      console.log(`     Current version: ${error.currentVersion} (same as npm)`);
      console.log(`     Updated dependencies:`);
      error.updatedDependencies.forEach((dep) => {
        console.log(`       - ${dep}`);
      });
      console.log('');
    }

    console.log('To fix this issue:');
    console.log('1. Create a changeset for the affected packages:');
    console.log('   bun changeset');
    console.log('2. Select the packages listed above');
    console.log('3. Choose "patch" for the version bump');
    console.log('4. Run "bun version" to apply the changesets');
    console.log('5. Commit the changes\n');

    process.exit(1);
  }

  console.log('\n✅ All packages are properly versioned!');
}

// Run validation
validatePackages();
