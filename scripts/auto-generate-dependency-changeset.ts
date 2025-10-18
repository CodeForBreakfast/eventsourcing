#!/usr/bin/env bun

/**
 * Automatically generates a changeset for dependency updates that don't have one.
 * This runs in the release workflow before creating version PRs.
 *
 * It detects dependency changes since the last commit and creates a single
 * changeset describing all the dependency updates.
 */

import { Effect, pipe, Array as EffectArray, Match } from 'effect';
import { FileSystem, Path, Terminal, Command } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

type PackageInfo = {
  readonly name: string;
  readonly path: string;
};

type DependencyChange = {
  readonly packageName: string;
  readonly dependencyName: string;
  readonly before: string;
  readonly after: string;
};

const rootDir = pipe(
  Path.Path,
  Effect.andThen((path) => path.resolve(import.meta.dir, '..'))
);

const parsePackageJson = (content: string) => Effect.sync(() => JSON.parse(content));

const readPackageJson = (packagePath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.readFileString(packagePath)),
    Effect.andThen(parsePackageJson)
  );

const getPackageName = (pkgJson: { readonly name?: string }) =>
  Effect.succeed(pkgJson.name || 'unknown');

const resolvePackagesDir = (root: string) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => path.join(root, 'packages'))
  );

const readPackageDirectory = (packagesDir: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.readDirectory(packagesDir))
  );

const buildPackageInfo = (packagesDir: string, dir: string) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => {
      const packageJsonPath = path.join(packagesDir, dir, 'package.json');
      return pipe(
        readPackageJson(packageJsonPath),
        Effect.andThen(getPackageName),
        Effect.map((name): PackageInfo => ({ name, path: packageJsonPath })),
        Effect.option
      );
    })
  );

const readPackageInfos = (packagesDir: string) => (dirs: readonly string[]) =>
  pipe(
    dirs,
    EffectArray.map((dir) => buildPackageInfo(packagesDir, dir)),
    Effect.all,
    Effect.map(EffectArray.getSomes)
  );

const readAllPackages = pipe(
  rootDir,
  Effect.andThen(resolvePackagesDir),
  Effect.andThen((packagesDir) =>
    pipe(packagesDir, readPackageDirectory, Effect.andThen(readPackageInfos(packagesDir)))
  )
);

const getDependencies = (pkgJson: { readonly dependencies?: Record<string, string> }) =>
  pkgJson.dependencies || {};

const createDependencyChange = (
  packageName: string,
  depName: string,
  beforeVersion: string | undefined,
  afterVersion: string | undefined
): readonly DependencyChange[] => {
  // eslint-disable-next-line effect/prefer-match-over-ternary -- Simple value transformation, not pattern matching
  return beforeVersion !== afterVersion
    ? [
        {
          packageName,
          dependencyName: depName,
          before: beforeVersion || '(none)',
          after: afterVersion || '(removed)',
        },
      ]
    : [];
};

const extractDependencyChanges = (
  packageName: string,
  before: { readonly dependencies?: Record<string, string> },
  after: { readonly dependencies?: Record<string, string> }
): readonly DependencyChange[] => {
  const beforeDeps = getDependencies(before);
  const afterDeps = getDependencies(after);

  const allDeps = new Set([...Object.keys(beforeDeps), ...Object.keys(afterDeps)]);

  return Array.from(allDeps).flatMap((depName) =>
    createDependencyChange(packageName, depName, beforeDeps[depName], afterDeps[depName])
  );
};

const getPackageJsonFromGit = (packagePath: string, ref: string) =>
  pipe(
    Command.make('git', 'show', `${ref}:${packagePath}`),
    Command.string,
    Effect.andThen(parsePackageJson),
    Effect.catchAll(() => Effect.succeed({} as Record<string, unknown>))
  );

const resolveRelativePath = (root: string, packagePath: string) =>
  Effect.succeed(packagePath.replace(root + '/', ''));

const extractChangesFromPackage =
  (packageName: string) =>
  ([before, after]: readonly [
    { readonly dependencies?: Record<string, string> },
    { readonly dependencies?: Record<string, string> },
  ]) =>
    Effect.succeed(extractDependencyChanges(packageName, before, after));

const findDependencyChanges = (pkg: PackageInfo) =>
  pipe(
    rootDir,
    Effect.andThen((root) => resolveRelativePath(root, pkg.path)),
    Effect.andThen((relativePath) =>
      pipe(
        Effect.all([getPackageJsonFromGit(relativePath, 'HEAD~1'), readPackageJson(pkg.path)]),
        Effect.andThen(extractChangesFromPackage(pkg.name))
      )
    )
  );

const flattenChanges = (
  changes: readonly (readonly DependencyChange[])[]
): readonly DependencyChange[] => changes.flat();

const getAllDependencyChanges = pipe(
  readAllPackages,
  Effect.andThen((packages) =>
    pipe(packages, EffectArray.map(findDependencyChanges), Effect.all, Effect.map(flattenChanges))
  )
);

const formatRemovedDependency = (change: DependencyChange) =>
  `- Removed \`${change.dependencyName}\` from ${change.packageName}`;

const formatAddedDependency = (change: DependencyChange) =>
  `- Added \`${change.dependencyName}@${change.after}\` to ${change.packageName}`;

const formatUpdatedDependency = (change: DependencyChange) =>
  `- Updated \`${change.dependencyName}\` from ${change.before} to ${change.after} in ${change.packageName}`;

const formatDependencyChange = (change: DependencyChange): string =>
  pipe(
    change.after,
    Match.value,
    Match.when('(removed)', () => formatRemovedDependency(change)),
    Match.when(
      () => change.before === '(none)',
      () => formatAddedDependency(change)
    ),
    Match.orElse(() => formatUpdatedDependency(change))
  );

const generateChangesetContent = (changes: readonly DependencyChange[]): string => {
  const affectedPackages = new Set(changes.map((c) => c.packageName));

  const packageEntries = Array.from(affectedPackages)
    .map((pkg) => `'${pkg}': patch`)
    .join('\n');

  const changeDescriptions = changes.map(formatDependencyChange).join('\n');

  return `---
${packageEntries}
---

Updated dependencies:

${changeDescriptions}
`;
};

const resolveChangesetPath = (root: string) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => {
      const timestamp = Date.now();
      return path.join(root, '.changeset', `auto-deps-${timestamp}.md`);
    })
  );

const writeFile = (changesetPath: string, content: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.writeFileString(changesetPath, content)),
    Effect.as(changesetPath)
  );

const writeChangesetFile = (content: string) =>
  pipe(
    rootDir,
    Effect.andThen(resolveChangesetPath),
    Effect.andThen((path) => writeFile(path, content))
  );

const displayNoChanges = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('✅ No dependency changes detected - no changeset needed\n')
  )
);

const displayChangesetCreated = (path: string) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen((terminal) =>
      pipe(
        terminal.display('📦 Generated changeset for dependency updates:\n'),
        Effect.andThen(() => terminal.display(`   ${path}\n`))
      )
    )
  );

const displaySingleChange = (terminal: Terminal.Terminal) => (change: DependencyChange) =>
  terminal.display(`   ${formatDependencyChange(change)}\n`);

const displayChangeList = (terminal: Terminal.Terminal, changes: readonly DependencyChange[]) =>
  pipe(changes, EffectArray.map(displaySingleChange(terminal)), Effect.all, Effect.asVoid);

const displayChanges = (changes: readonly DependencyChange[]) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen((terminal) =>
      pipe(
        terminal.display(`\n📋 Found ${changes.length} dependency change(s):\n`),
        Effect.andThen(() => displayChangeList(terminal, changes)),
        Effect.andThen(() => terminal.display('\n'))
      )
    )
  );

const processChanges = (changes: readonly DependencyChange[]) =>
  pipe(
    displayChanges(changes),
    Effect.andThen(() => generateChangesetContent(changes)),
    Effect.andThen(writeChangesetFile),
    Effect.andThen(displayChangesetCreated)
  );

const handleChanges = (changes: readonly DependencyChange[]) =>
  Effect.if(changes.length === 0, {
    onTrue: () => displayNoChanges,
    onFalse: () => processChanges(changes),
  });

const program = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('🔍 Checking for dependency changes...\n\n')),
  Effect.andThen(() => getAllDependencyChanges),
  Effect.andThen((changes: readonly DependencyChange[]) => handleChanges(changes)),
  Effect.provide(BunContext.layer),
  Effect.catchAllCause(() => Effect.void)
);

// eslint-disable-next-line effect/no-intermediate-effect-variables -- Script entry point pattern
BunRuntime.runMain(program);
