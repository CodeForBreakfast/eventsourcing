#!/usr/bin/env bun

/**
 * Discovers workspace packages and their dependency relationships.
 * Outputs package information for use in changeset validation.
 */

import { Effect, pipe, Array as EffectArray, Option, Match } from 'effect';
import { FileSystem, Path, Terminal } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

type PackageInfo = {
  readonly name: string;
  readonly version: string;
  readonly dependencies: { readonly [key: string]: string };
};

type PackageDependencyMap = Readonly<Record<string, readonly string[]>>;

const getScriptsDir = (currentPath: string) =>
  pipe(
    Path.Path,
    Effect.map((path) => path.dirname(currentPath))
  );

const resolveRootDir = (scriptsDir: string) =>
  pipe(
    Path.Path,
    Effect.map((path) => path.resolve(scriptsDir, '..'))
  );

const getCurrentPath = Effect.sync(() => new URL(import.meta.url).pathname);

const getRootDir = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script pattern: root directory resolver reused in main program logic
  getCurrentPath,
  Effect.flatMap(getScriptsDir),
  Effect.flatMap(resolveRootDir)
);

const parsePackageJson = (content: string): PackageInfo => {
  const pkg = JSON.parse(content);
  return {
    name: pkg.name,
    version: pkg.version,
    dependencies: {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    },
  };
};

const readPackageJson = (fs: FileSystem.FileSystem, packagePath: string) =>
  pipe(packagePath, fs.readFileString, Effect.map(parsePackageJson), Effect.map(Option.some));

const checkAndReadPackage = (fs: FileSystem.FileSystem, packagePath: string) => (exists: boolean) =>
  pipe(
    exists,
    Match.value,
    Match.when(true, () => readPackageJson(fs, packagePath)),
    Match.when(false, () => Effect.succeed(Option.none<PackageInfo>())),
    Match.exhaustive
  );

const readPackageIfExists = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packagesDir: string,
  dir: string
) => {
  const packagePath = path.join(packagesDir, dir, 'package.json');
  return pipe(packagePath, fs.exists, Effect.flatMap(checkAndReadPackage(fs, packagePath)));
};

const readPackage =
  (fs: FileSystem.FileSystem, path: Path.Path, packagesDir: string) => (dir: string) =>
    readPackageIfExists(fs, path, packagesDir, dir);

const readPackagesFromDirs =
  (fs: FileSystem.FileSystem, path: Path.Path, packagesDir: string) => (dirs: readonly string[]) =>
    pipe(
      dirs,
      EffectArray.map(readPackage(fs, path, packagesDir)),
      Effect.all,
      Effect.map(EffectArray.getSomes)
    );

const readPackagesDir = (fs: FileSystem.FileSystem, path: Path.Path, packagesDir: string) =>
  pipe(packagesDir, fs.readDirectory, Effect.flatMap(readPackagesFromDirs(fs, path, packagesDir)));

const getServicesAndRootDir = Effect.all([FileSystem.FileSystem, Path.Path, getRootDir]);

const getAllPackages = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script pattern: effect reused in main program logic
  getServicesAndRootDir,
  Effect.flatMap(([fs, path, rootDir]) => {
    const packagesDir = path.join(rootDir, 'packages');
    return readPackagesDir(fs, path, packagesDir);
  })
);

const isWorkspaceDependency = (depVersion: string): boolean =>
  depVersion === 'workspace:*' || depVersion.startsWith('workspace:');

const getDependentNames =
  (packageName: string) =>
  (pkg: PackageInfo): readonly string[] => {
    const hasDependency = Object.entries(pkg.dependencies || {}).some(
      ([depName, depVersion]) => depName === packageName && isWorkspaceDependency(depVersion)
    );
    return hasDependency ? [pkg.name] : [];
  };

const getDependentsForPackage = (
  packageName: string,
  allPackages: readonly PackageInfo[]
): readonly string[] => pipe(allPackages, EffectArray.flatMap(getDependentNames(packageName)));

const buildDependencyMap = (packages: readonly PackageInfo[]): PackageDependencyMap =>
  packages.reduce<PackageDependencyMap>((map, pkg) => {
    const dependents = getDependentsForPackage(pkg.name, packages);
    return {
      ...map,
      [pkg.name]: dependents,
    };
  }, {});

const outputDependencyMap = (dependencyMap: PackageDependencyMap) =>
  pipe(
    Terminal.Terminal,
    Effect.flatMap((terminal) => terminal.display(JSON.stringify(dependencyMap, null, 2) + '\n'))
  );

const program = pipe(
  // eslint-disable-next-line effect/no-intermediate-effect-variables -- Script pattern: effect reused in main program logic
  getAllPackages,
  Effect.map(buildDependencyMap),
  Effect.flatMap(outputDependencyMap),
  Effect.provide(BunContext.layer)
);

// eslint-disable-next-line effect/no-intermediate-effect-variables -- Script entry point pattern
BunRuntime.runMain(program);
