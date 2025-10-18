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

const parsePackageInfo = (packageJsonPath: string) =>
  pipe(
    packageJsonPath,
    readPackageJson,
    Effect.andThen(getPackageName),
    Effect.map((name): PackageInfo => ({ name, path: packageJsonPath })),
    Effect.option
  );

const buildPackageInfo = (packagesDir: string) => (dir: string) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => {
      const packageJsonPath = path.join(packagesDir, dir, 'package.json');
      return parsePackageInfo(packageJsonPath);
    })
  );

const readPackageInfos = (packagesDir: string) => (dirs: readonly string[]) =>
  pipe(
    dirs,
    EffectArray.map(buildPackageInfo(packagesDir)),
    Effect.all,
    Effect.map(EffectArray.getSomes)
  );

const getPackageInfos = (packagesDir: string) =>
  pipe(packagesDir, readPackageDirectory, Effect.andThen(readPackageInfos(packagesDir)));

const getDependencies = (pkgJson: { readonly dependencies?: Record<string, string> }) =>
  pkgJson.dependencies || {};

const createDependencyChange = (
  packageName: string,
  depName: string,
  beforeVersion: string | undefined,
  afterVersion: string | undefined
): readonly DependencyChange[] => {
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

const getBothPackageJsons = (relativePath: string, pkgPath: string) =>
  Effect.all([getPackageJsonFromGit(relativePath, 'HEAD~1'), readPackageJson(pkgPath)]);

const extractChangesForPath = (pkg: PackageInfo) => (relativePath: string) =>
  pipe(
    relativePath,
    (path) => getBothPackageJsons(path, pkg.path),
    Effect.andThen(extractChangesFromPackage(pkg.name))
  );

const findDependencyChanges = (pkg: PackageInfo) =>
  pipe(
    rootDir,
    Effect.andThen((root) => resolveRelativePath(root, pkg.path)),
    Effect.andThen(extractChangesForPath(pkg))
  );

const flattenChanges = (
  changes: readonly (readonly DependencyChange[])[]
): readonly DependencyChange[] => changes.flat();

const collectAllChanges = (packages: readonly PackageInfo[]) =>
  pipe(packages, EffectArray.map(findDependencyChanges), Effect.all, Effect.map(flattenChanges));

const getAllDependencyChanges = pipe(
  rootDir,
  Effect.andThen(resolvePackagesDir),
  Effect.andThen(getPackageInfos),
  Effect.andThen(collectAllChanges)
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

const displayFirstMessage = (terminal: Terminal.Terminal) =>
  terminal.display('📦 Generated changeset for dependency updates:\n');

const displayChangesetMessages = (terminal: Terminal.Terminal, path: string) =>
  pipe(
    terminal,
    displayFirstMessage,
    Effect.andThen(() => terminal.display(`   ${path}\n`))
  );

const displayChangesetCreated = (path: string) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen((terminal) => displayChangesetMessages(terminal, path))
  );

const displaySingleChange = (terminal: Terminal.Terminal) => (change: DependencyChange) =>
  terminal.display(`   ${formatDependencyChange(change)}\n`);

const displayChangeList = (terminal: Terminal.Terminal, changes: readonly DependencyChange[]) =>
  pipe(changes, EffectArray.map(displaySingleChange(terminal)), Effect.all, Effect.asVoid);

const displayFoundMessage = (terminal: Terminal.Terminal, count: number) =>
  terminal.display(`\n📋 Found ${count} dependency change(s):\n`);

const displayChangeMessages = (terminal: Terminal.Terminal, changes: readonly DependencyChange[]) =>
  pipe(
    terminal,
    (t) => displayFoundMessage(t, changes.length),
    Effect.andThen(() => displayChangeList(terminal, changes)),
    Effect.andThen(() => terminal.display('\n'))
  );

const displayChanges = (changes: readonly DependencyChange[]) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen((terminal) => displayChangeMessages(terminal, changes))
  );

const generateContent = (changes: readonly DependencyChange[]) =>
  Effect.sync(() => generateChangesetContent(changes));

const processChanges = (changes: readonly DependencyChange[]) =>
  pipe(
    changes,
    displayChanges,
    Effect.andThen(() => generateContent(changes)),
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
  Effect.andThen(handleChanges),
  Effect.provide(BunContext.layer),
  Effect.catchAllCause(() => Effect.void)
);

// eslint-disable-next-line effect/no-intermediate-effect-variables -- Script entry point pattern
BunRuntime.runMain(program);
