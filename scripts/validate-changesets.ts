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

type PackageInternal = {
  readonly name: string;
  readonly version: string;
  readonly path: string;
};

type ChangesetInfoInternal = {
  readonly packages: ReadonlyArray<string>;
  readonly type: 'major' | 'minor' | 'patch';
};

const getAllPackages = (): readonly PackageInternal[] => {
  const packagesDir = join(rootDir, 'packages');

  const dirs = readdirSync(packagesDir);
  return dirs.reduce<readonly PackageInternal[]>((packages, dir) => {
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
        path: packagePath,
      },
    ];
  }, []);
};

const parseFrontmatter = (content: string): string => {
  const lines = content.split('\n');

  type FrontmatterState = {
    readonly inFrontmatter: boolean;
    readonly frontmatterContent: string;
    readonly done: boolean;
  };

  const result = lines.reduce<FrontmatterState>(
    (state, line) => {
      if (state.done) {
        return state;
      }

      if (line === '---') {
        if (!state.inFrontmatter) {
          return { ...state, inFrontmatter: true };
        }
        return { ...state, done: true };
      }

      if (state.inFrontmatter) {
        return {
          ...state,
          frontmatterContent: state.frontmatterContent + line + '\n',
        };
      }

      return state;
    },
    { inFrontmatter: false, frontmatterContent: '', done: false }
  );

  return result.frontmatterContent;
};

const parsePackagesFromFrontmatter = (
  frontmatterContent: string
): { readonly packages: readonly string[]; readonly changeType: 'major' | 'minor' | 'patch' } => {
  const packageRegex = /['"]([^'"]+)['"]\s*:\s*(major|minor|patch)/g;
  const matches = Array.from(frontmatterContent.matchAll(packageRegex));

  type ParseResult = {
    readonly packages: readonly string[];
    readonly changeType: 'major' | 'minor' | 'patch';
  };

  return matches.reduce<ParseResult>(
    (acc, match) => {
      const packageName = match[1];
      if (!packageName) {
        return acc;
      }

      const type = match[2] as 'major' | 'minor' | 'patch';
      const newChangeType =
        type === 'major'
          ? 'major'
          : type === 'minor' && acc.changeType !== 'major'
            ? 'minor'
            : acc.changeType;

      return {
        packages: [...acc.packages, packageName],
        changeType: newChangeType,
      };
    },
    { packages: [], changeType: 'patch' }
  );
};

const getChangesets = (): readonly ChangesetInfoInternal[] => {
  const changesetsDir = join(rootDir, '.changeset');

  if (!existsSync(changesetsDir)) {
    return [];
  }

  const files = readdirSync(changesetsDir);
  return files.reduce<readonly ChangesetInfoInternal[]>((changesets, file) => {
    if (file === 'README.md' || file === 'config.json' || !file.endsWith('.md')) {
      return changesets;
    }

    const content = readFileSync(join(changesetsDir, file), 'utf-8');
    const frontmatterContent = parseFrontmatter(content);
    const { packages, changeType } = parsePackagesFromFrontmatter(frontmatterContent);

    if (packages.length === 0) {
      return changesets;
    }

    return [
      ...changesets,
      {
        packages,
        type: changeType,
      },
    ];
  }, []);
};

const getPackageDependencyMap = (): Record<string, readonly string[]> => {
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
};

const getChangedFiles = (): readonly string[] => {
  try {
    const baseBranch = process.env.GITHUB_BASE_REF || 'origin/main';

    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
      cwd: rootDir,
    });

    return output.split('\n').filter((file) => file.length > 0);
  } catch {
    console.warn('⚠️  Could not determine changed files, assuming this is not a PR');
    return [];
  }
};

const hasCodeChanges = (changedFiles: readonly string[]): boolean => {
  const codePatterns: readonly RegExp[] = [
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

  return changedFiles.some((file) => {
    if (file === 'scripts/validate-changesets.ts') {
      return false;
    }
    return codePatterns.some((pattern) => pattern.test(file));
  });
};

const checkForUnpublishedPackages = (): readonly string[] => {
  try {
    execSync('bunx turbo run check:publishable', {
      cwd: rootDir,
      stdio: 'pipe',
    });
    return [];
  } catch (error: unknown) {
    const errorWithOutput = error as { readonly stdout?: string; readonly stderr?: string };
    const output = errorWithOutput.stdout || errorWithOutput.stderr || '';

    const lines = output.split('\n');
    return lines.reduce<readonly string[]>((unpublishable, line) => {
      if (!line.includes('check:publishable') || !line.includes('FAILED')) {
        return unpublishable;
      }

      const match = line.match(/@[\w-]+\/[\w-]+/);
      if (!match) {
        return unpublishable;
      }

      return [...unpublishable, match[0]];
    }, []);
  }
};

const validateChangesetPackages = (
  changesets: readonly ChangesetInfoInternal[],
  packages: readonly PackageInternal[],
  rootPackageJson: { readonly name: string }
): readonly string[] => {
  const validPackageNames = new Set(packages.map((p) => p.name));

  return changesets.flatMap((changeset) =>
    changeset.packages.flatMap((pkgName) => {
      if (validPackageNames.has(pkgName)) {
        return [];
      }

      if (pkgName === rootPackageJson.name) {
        return [
          `❌ Changeset references the private monorepo root package: ${pkgName}`,
          '   The monorepo root is private and cannot be published to npm.',
        ];
      }

      return [
        `❌ Changeset references non-existent package: ${pkgName}`,
        '   This package does not exist in the workspace.',
      ];
    })
  );
};

const validateChangesets = (): void => {
  console.log('🔍 Validating changesets and release readiness...\n');

  const packages = getAllPackages();
  const changesets = getChangesets();
  const changedFiles = getChangedFiles();

  const rootPackageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  const errors = validateChangesetPackages(changesets, packages, rootPackageJson);

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
    const changedPackages = changesets.reduce<ReadonlySet<string>>(
      (acc, changeset) =>
        changeset.packages.reduce((packageSet, pkg) => new Set([...packageSet, pkg]), acc),
      new Set<string>()
    );

    console.log('📦 Packages with changesets:');
    changedPackages.forEach((pkg) => console.log(`   - ${pkg}`));
    console.log('');

    const packageDependencyMap = getPackageDependencyMap();

    type MissingDependentError = {
      readonly changed: string;
      readonly missing: readonly string[];
    };

    const dependencyErrors = Array.from(changedPackages).reduce<readonly MissingDependentError[]>(
      (errors, changedPackage) => {
        const dependentNames = packageDependencyMap[changedPackage] || [];
        const missingDependents = dependentNames.filter((dep) => !changedPackages.has(dep));

        if (missingDependents.length === 0) {
          return errors;
        }

        return [
          ...errors,
          {
            changed: changedPackage,
            missing: missingDependents,
          },
        ];
      },
      []
    );

    if (dependencyErrors.length > 0) {
      console.log('❌ Validation Failed!\n');
      console.log(
        'The following packages have workspace dependencies that also need changesets:\n'
      );

      dependencyErrors.forEach((error) => {
        console.log(`  📦 ${error.changed} is being changed`);
        console.log(`     Missing changesets for dependent packages:`);
        error.missing.forEach((dep) => {
          console.log(`       - ${dep}`);
        });
        console.log('');
      });

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
};

validateChangesets();
