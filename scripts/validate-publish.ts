#!/usr/bin/env bun

import { Effect, pipe } from 'effect';
import { Command, FileSystem, Path, Terminal } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

const resolvePath = (relativePath: string) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => path.resolve(import.meta.dir, relativePath))
  );

const rootDir = resolvePath('..');

const joinToPath = (basePath: string, ...segments: ReadonlyArray<string>) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => path.join(basePath, ...segments))
  );

const readFileAsString = (filePath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.readFileString(filePath))
  );

const checkFileExists = (filePath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.exists(filePath))
  );

const readDirectoryContents = (dirPath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.readDirectory(dirPath))
  );

const parsePackageJson = (content: string) => {
  const pkg = JSON.parse(content);
  return { name: pkg.name, directory: '' };
};

const buildPackageMetadata = (dir: string) => (content: string) => {
  const pkgData = parsePackageJson(content);
  return [{ name: pkgData.name, directory: dir }];
};

const readPackageMetadataIfExists = (packageJsonPath: string, dir: string) => (exists: boolean) =>
  exists
    ? pipe(packageJsonPath, readFileAsString, Effect.map(buildPackageMetadata(dir)))
    : Effect.succeed([]);

const checkExistsAndRead = (dir: string) => (packageJsonPath: string) =>
  pipe(
    packageJsonPath,
    checkFileExists,
    Effect.andThen(readPackageMetadataIfExists(packageJsonPath, dir))
  );

const readPackageMetadata = (packagesDir: string) => (dir: string) =>
  pipe(joinToPath(packagesDir, dir, 'package.json'), Effect.andThen(checkExistsAndRead(dir)));

const processPackageDirectories = (packagesDir: string) => (dirs: ReadonlyArray<string>) =>
  pipe(
    Effect.forEach(dirs, readPackageMetadata(packagesDir), {
      concurrency: 'unbounded',
    }),
    Effect.map((results) => results.flat())
  );

const readAndProcessPackages = (packagesDir: string) =>
  pipe(packagesDir, readDirectoryContents, Effect.andThen(processPackageDirectories(packagesDir)));

const getAllPackages = pipe(
  rootDir,
  Effect.andThen((root) => joinToPath(root, 'packages')),
  Effect.andThen(readAndProcessPackages)
);

const getBaseBranch = Effect.sync(() => {
  const env = globalThis as {
    readonly process?: { readonly env?: Readonly<Record<string, string>> };
  };
  return env.process?.env?.['GITHUB_BASE_REF'] ?? 'origin/main';
});

const extractChangedDirectories = (output: string): ReadonlySet<string> =>
  output
    .split('\n')
    .filter((f) => f.length > 0)
    .reduce((acc, file) => {
      const match = file.match(/^packages\/([^\/]+)\//);
      if (match?.[1]) {
        return new Set([...acc, match[1]]);
      }
      return acc;
    }, new Set<string>());

const runGitDiffCommand = (root: string, baseBranch: string) =>
  pipe(
    Command.make('git', 'diff', '--name-only', `${baseBranch}...HEAD`),
    Command.workingDirectory(root),
    Command.string,
    Effect.map(extractChangedDirectories)
  );

const filterPackagesByDirectory =
  (changedDirectories: ReadonlySet<string>) =>
  (allPackages: ReadonlyArray<{ readonly name: string; readonly directory: string }>) =>
    allPackages.filter((pkg) => changedDirectories.has(pkg.directory)).map((pkg) => pkg.name);

const getPackagesForChangedDirs = (changedDirectories: ReadonlySet<string>) =>
  changedDirectories.size > 0
    ? pipe(
        // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script pattern: effect reused in main program logic
        getAllPackages,
        Effect.map(filterPackagesByDirectory(changedDirectories))
      )
    : Effect.succeed([]);

const displayWarningAndGetAllPackages = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) =>
    terminal.display('⚠️  Could not determine changed packages, validating all packages\n')
  ),
  Effect.andThen(() => getAllPackages),
  Effect.map((packages) => packages.map((pkg) => pkg.name))
);

const processGitDiffResult = (root: string) => (baseBranch: string) =>
  pipe(
    runGitDiffCommand(root, baseBranch),
    Effect.andThen(getPackagesForChangedDirs),
    Effect.catchAll(() => displayWarningAndGetAllPackages)
  );

const combineRootWithBaseBranch = (root: string) =>
  pipe(
    // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script pattern: effect reused in main program logic
    getBaseBranch,
    Effect.andThen(processGitDiffResult(root))
  );

const getChangedPackageNames = pipe(rootDir, Effect.andThen(combineRootWithBaseBranch));

const displayNoPackagesMessage = pipe(
  Terminal.Terminal,
  Effect.andThen((terminal) => terminal.display('No changed packages detected\n'))
);

const displayPackageList = (changedPackageNames: readonly string[]) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen((terminal) =>
      Effect.forEach(changedPackageNames, (pkg) => terminal.display(`${pkg}\n`), {
        discard: true,
      })
    )
  );

const displayPackages = (changedPackageNames: readonly string[]) =>
  changedPackageNames.length === 0
    ? displayNoPackagesMessage
    : displayPackageList(changedPackageNames);

const program = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script pattern: effect reused in main program logic
  getChangedPackageNames,
  Effect.andThen(displayPackages)
);

BunRuntime.runMain(
  pipe(
    // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script entry point pattern
    program,
    Effect.provide(BunContext.layer)
  )
);
