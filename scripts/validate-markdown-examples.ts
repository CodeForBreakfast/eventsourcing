#!/usr/bin/env bun

import { Effect, pipe, Array as EffectArray, Console, Option } from 'effect';
import { Path, Command, Terminal, FileSystem } from '@effect/platform';
import { BunContext, BunRuntime } from '@effect/platform-bun';

interface CodeBlock {
  readonly code: string;
  readonly file: string;
  readonly line: number;
  readonly index: number;
}

interface ValidationError {
  readonly file: string;
  readonly line: number;
  readonly index: number;
  readonly error: string;
}

interface ParserState {
  readonly blocks: readonly CodeBlock[];
  readonly inBlock: boolean;
  readonly currentBlock: readonly string[];
  readonly blockStartLine: number;
  readonly blockIndex: number;
}

const initialParserState: ParserState = {
  blocks: [],
  inBlock: false,
  currentBlock: [],
  blockStartLine: 0,
  blockIndex: 0,
};

const logMalformedCodeBlock = (filePath: string, lineIndex: number, state: ParserState) =>
  pipe(
    `Malformed code block at ${filePath}:${lineIndex + 1} - nested code fence`,
    Console.error,
    Effect.as(state)
  );

const processMarkdownLine =
  (filePath: string, lineIndex: number) =>
  (state: ParserState, line: string | undefined): Effect.Effect<ParserState, never, never> => {
    const trimmed = line?.trim() ?? '';

    if (trimmed.match(/^```(?:typescript|ts)$/)) {
      return state.inBlock
        ? logMalformedCodeBlock(filePath, lineIndex, state)
        : Effect.succeed({
            ...state,
            inBlock: true,
            currentBlock: [],
            blockStartLine: lineIndex + 1,
          });
    }

    if (trimmed === '```' && state.inBlock) {
      return Effect.succeed({
        ...state,
        blocks: [
          ...state.blocks,
          {
            code: state.currentBlock.join('\n'),
            file: filePath,
            line: state.blockStartLine,
            index: state.blockIndex,
          },
        ],
        inBlock: false,
        currentBlock: [],
        blockIndex: state.blockIndex + 1,
      });
    }

    if (state.inBlock) {
      return Effect.succeed({
        ...state,
        currentBlock: [...state.currentBlock, line ?? ''],
      });
    }

    return Effect.succeed(state);
  };

const logUnclosedBlock = (filePath: string, state: ParserState) =>
  pipe(
    `Unclosed code block at ${filePath}:${state.blockStartLine} - treating as complete`,
    Console.warn,
    Effect.as([
      ...state.blocks,
      {
        code: state.currentBlock.join('\n'),
        file: filePath,
        line: state.blockStartLine,
        index: state.blockIndex,
      },
    ])
  );

const finalizeParserState =
  (filePath: string) =>
  (state: ParserState): Effect.Effect<readonly CodeBlock[], never, never> => {
    if (!state.inBlock) {
      return Effect.succeed(state.blocks);
    }

    return logUnclosedBlock(filePath, state);
  };

const processLineWithState = (filePath: string, index: number, line: string) => {
  const processor = processMarkdownLine(filePath, index);
  return (state: ParserState) => processor(state, line);
};

const flatMapProcessLine = (filePath: string, index: number, line: string) =>
  Effect.flatMap(processLineWithState(filePath, index, line));

const reduceLineToParserState =
  (filePath: string) =>
  (accEffect: Effect.Effect<ParserState, never, never>, line: string, index: number) =>
    pipe(accEffect, flatMapProcessLine(filePath, index, line));

const extractCodeBlocks = (content: string, filePath: string) => {
  const lines = content.split('\n');
  return pipe(
    lines,
    EffectArray.reduce(Effect.succeed(initialParserState), reduceLineToParserState(filePath)),
    Effect.flatMap(finalizeParserState(filePath))
  );
};

const shouldSkipEntry = (name: string): boolean =>
  name === 'node_modules' || name === '.git' || name === 'dist';

const joinPath = (...segments: readonly string[]) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => path.join(...segments))
  );

const processDirectoryEntry =
  (currentDir: string, files: readonly string[]) =>
  (entry: {
    readonly name: string;
    readonly isDirectory: () => boolean;
    readonly isFile: () => boolean;
  }): Effect.Effect<readonly string[], Error, FileSystem.FileSystem | Path.Path> => {
    if (shouldSkipEntry(entry.name)) {
      return Effect.succeed(files);
    }

    return pipe(
      joinPath(currentDir, entry.name),
      Effect.flatMap((fullPath) => {
        if (entry.isDirectory()) {
          return processDirectory(fullPath, files);
        }

        if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('CHANGELOG')) {
          return Effect.succeed([...files, fullPath]);
        }

        return Effect.succeed(files);
      })
    );
  };

const applyEntryToFiles =
  (currentDir: string) =>
  (entry: {
    readonly name: string;
    readonly isDirectory: () => boolean;
    readonly isFile: () => boolean;
  }) =>
  (currentFiles: readonly string[]) => {
    const processor = processDirectoryEntry(currentDir, currentFiles);
    return processor(entry);
  };

const checkIsDirectory = (fullPath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.stat(fullPath)),
    Effect.map((info) => info.type === 'Directory'),
    Effect.orElseSucceed(() => false)
  );

const checkIsFile = (fullPath: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.stat(fullPath)),
    Effect.map((info) => info.type === 'File'),
    Effect.orElseSucceed(() => false)
  );

const createEntryWithTypes = (name: string) => (fullPath: string) => {
  const checks = [checkIsDirectory(fullPath), checkIsFile(fullPath)] as const;
  return pipe(
    checks,
    Effect.all,
    Effect.map(([isDir, isFile]) => ({
      name,
      isDirectory: () => isDir,
      isFile: () => isFile,
    }))
  );
};

const createEntryWithChecks = (currentDir: string) => (name: string) =>
  pipe(joinPath(currentDir, name), Effect.flatMap(createEntryWithTypes(name)));

const mapNamesToEntries = (currentDir: string) => (names: readonly string[]) =>
  Effect.all(names.map(createEntryWithChecks(currentDir)));

const flatMapEntryProcessor =
  (currentDir: string) =>
  (entry: {
    readonly name: string;
    readonly isDirectory: () => boolean;
    readonly isFile: () => boolean;
  }) => {
    const entryApplier = applyEntryToFiles(currentDir);
    const entryProcessor = entryApplier(entry);
    return Effect.flatMap(entryProcessor);
  };

const reduceDirectoryEntries =
  (files: readonly string[], currentDir: string) =>
  (
    entries: readonly {
      readonly name: string;
      readonly isDirectory: () => boolean;
      readonly isFile: () => boolean;
    }[]
  ): Effect.Effect<readonly string[], Error, FileSystem.FileSystem | Path.Path> =>
    EffectArray.reduce(
      entries,
      Effect.succeed(files) as Effect.Effect<
        readonly string[],
        Error,
        FileSystem.FileSystem | Path.Path
      >,
      (acc, entry) => {
        const flatMapProcessor = flatMapEntryProcessor(currentDir);
        const flatMapper = flatMapProcessor(entry);
        return pipe(acc, flatMapper);
      }
    );

const processDirectory = (
  currentDir: string,
  files: readonly string[] = []
): Effect.Effect<readonly string[], Error, FileSystem.FileSystem | Path.Path> => {
  const readdirEffect = pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.readDirectory(currentDir)),
    Effect.mapError((error) => new Error(`Failed to read directory ${currentDir}: ${error}`))
  );

  return pipe(
    readdirEffect,
    Effect.flatMap(mapNamesToEntries(currentDir)),
    Effect.flatMap(reduceDirectoryEntries(files, currentDir))
  );
};

const findMarkdownFiles = (dir: string) => processDirectory(dir, []);

interface BlockFile {
  readonly filename: string;
  readonly block: CodeBlock;
  readonly headerLines: number;
}

const tsConfigContent = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      noEmit: true,
    },
    include: ['*.ts'],
  },
  null,
  2
);

const writeFileStringToPath = (content: string) => (path: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.writeFileString(path, content)),
    Effect.mapError((error) => new Error(`Failed to write tsconfig: ${error}`))
  );

const writeTsConfig = (tempDir: string) =>
  pipe(joinPath(tempDir, 'tsconfig.json'), Effect.flatMap(writeFileStringToPath(tsConfigContent)));

const writeBlockFileContent =
  (content: string, filename: string, block: CodeBlock, headerLines: number) =>
  (filepath: string) =>
    pipe(
      FileSystem.FileSystem,
      Effect.andThen((fs) => fs.writeFileString(filepath, content)),
      Effect.mapError((error) => new Error(`Failed to write ${filename}: ${error}`)),
      Effect.as({ filename, block, headerLines })
    );

const writeBlockFile =
  (tempDir: string) =>
  (
    block: CodeBlock,
    index: number
  ): Effect.Effect<BlockFile, Error, FileSystem.FileSystem | Path.Path> => {
    const headerLines = 0;
    const filename = `example-${index + 1}.ts`;

    return pipe(
      joinPath(tempDir, filename),
      Effect.flatMap(writeBlockFileContent(block.code, filename, block, headerLines))
    );
  };

const writeAllBlockFiles = (
  blocks: readonly CodeBlock[],
  tempDir: string
): Effect.Effect<readonly BlockFile[], Error, FileSystem.FileSystem | Path.Path> => {
  const writeEffects = blocks.map((block, index) => {
    const writer = writeBlockFile(tempDir);
    return writer(block, index);
  });
  return Effect.all(writeEffects);
};

const createSeparateTempFiles = (
  blocks: readonly CodeBlock[],
  tempDir: string
): Effect.Effect<readonly BlockFile[], Error, FileSystem.FileSystem | Path.Path> => {
  const tsConfigEffect = writeTsConfig(tempDir);
  return pipe(tsConfigEffect, Effect.andThen(writeAllBlockFiles(blocks, tempDir)));
};

const typeCheckDirectory = (tempDir: string) =>
  pipe(
    Command.make('bun', 'tsc', '--project', tempDir, '--noEmit'),
    Command.string,
    Effect.flatMap((output) => (output.trim().length > 0 ? Effect.fail(output) : Effect.void))
  );

const findBlockFileByFilename = (filename: string, blockFiles: readonly BlockFile[]) =>
  EffectArray.findFirst(blockFiles, (bf) => bf.filename === filename);

const createValidationError = (
  blockFile: BlockFile,
  lineInFile: number,
  index: number,
  errorCode: string,
  errorMessage: string
): ValidationError => {
  const offsetInBlock = lineInFile - blockFile.headerLines;
  return {
    file: blockFile.block.file,
    line: blockFile.block.line + offsetInBlock,
    index,
    error: `TS${errorCode}: ${errorMessage}`,
  };
};

const displayWarningForMissingBlockFile = (filename: string) =>
  pipe(
    Terminal.Terminal,
    Effect.andThen((t) => t.display(`⚠️  Could not find block file ${filename}\n`)),
    Effect.provide(BunContext.layer)
  );

const processErrorLine =
  (blockFiles: readonly BlockFile[]) =>
  (line: string): readonly ValidationError[] => {
    const errorMatch = line.match(/(example-\d+)\.ts\((\d+),\d+\): error TS(\d+): (.+)/);
    if (!errorMatch) return [];

    const filename = `${errorMatch[1]!}.ts`;
    const lineInFile = parseInt(errorMatch[2]!, 10);
    const errorCode = errorMatch[3]!;
    const errorMessage = errorMatch[4]!;

    return pipe(
      findBlockFileByFilename(filename, blockFiles),
      Option.match({
        onNone: () => {
          Effect.runSync(displayWarningForMissingBlockFile(filename));
          return [];
        },
        onSome: (blockFile) => {
          if (lineInFile < blockFile.headerLines) {
            return [];
          }

          const index = blockFiles.indexOf(blockFile);
          return [createValidationError(blockFile, lineInFile, index, errorCode, errorMessage)];
        },
      })
    );
  };

const parseTypeErrors = (
  stdout: string,
  blockFiles: readonly BlockFile[]
): readonly ValidationError[] => {
  const lines = stdout.split('\n');
  return pipe(lines, EffectArray.flatMap(processErrorLine(blockFiles)));
};

const cleanupTempDir = (tempDir: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.remove(tempDir, { recursive: true })),
    Effect.mapError(() => new Error(`Failed to cleanup temp dir ${tempDir}`)),
    Effect.orElseSucceed(() => undefined)
  );

const formatErrorLine = (line: string): Effect.Effect<void, never, never> =>
  !line.includes('example-') || line.includes('error TS')
    ? Console.error(`   ${line}`)
    : Effect.void;

const appendFormattedLine = (acc: Effect.Effect<void, never, never>, line: string) =>
  Effect.andThen(acc, formatErrorLine(line));

const formatErrorLines = (errorLines: readonly string[]) =>
  pipe(
    errorLines,
    EffectArray.filter((line) => line.trim().length > 0),
    (lines) => EffectArray.reduce(lines, Effect.void, appendFormattedLine)
  );

const formatError = (error: ValidationError) => {
  const errorHeader = `\n❌ ${error.file}:${error.line} (example #${error.index + 1})`;
  return pipe(
    errorHeader,
    Console.error,
    Effect.andThen(Console.error('   Type checking failed:')),
    Effect.andThen(formatErrorLines(error.error.split('\n')))
  );
};

const cleanTempDirectory = (tempDir: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.remove(tempDir, { recursive: true })),
    Effect.mapError(() => new Error(`Failed to clean temp dir`)),
    Effect.orElseSucceed(() => undefined)
  );

const createTempDirectory = (tempDir: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.makeDirectory(tempDir, { recursive: true })),
    Effect.mapError((error) => new Error(`Failed to create temp dir: ${error}`))
  );

const getRelativePath = (from: string, to: string) =>
  pipe(
    Path.Path,
    Effect.andThen((path) => path.relative(from, to))
  );

const readFileAsString = (file: string) =>
  pipe(
    FileSystem.FileSystem,
    Effect.andThen((fs) => fs.readFileString(file)),
    Effect.mapError((error) => new Error(`Failed to read ${file}: ${error}`))
  );

const readAndExtractCodeBlocks =
  (file: string, packageDir: string) => (blocks: readonly CodeBlock[]) => {
    const operations = [readFileAsString(file), getRelativePath(packageDir, file)] as const;
    return pipe(
      operations,
      Effect.all,
      Effect.flatMap(([content, relativePath]) => extractCodeBlocks(content, relativePath)),
      Effect.map((newBlocks) => [...blocks, ...newBlocks])
    );
  };

const runTypeCheckAndParseErrors = (tempDir: string) => (blockFiles: readonly BlockFile[]) =>
  pipe(
    tempDir,
    typeCheckDirectory,
    Effect.as([] as readonly ValidationError[]),
    Effect.catchAll((stdout) => Effect.succeed(parseTypeErrors(stdout as string, blockFiles)))
  );

const appendFormattedError = (acc: Effect.Effect<void, never, never>, error: ValidationError) =>
  Effect.andThen(acc, formatError(error));

const formatAllErrors = (errors: readonly ValidationError[]) =>
  EffectArray.reduce(errors, Effect.void, appendFormattedError);

const displayErrorsAndFail = (errors: readonly ValidationError[]) => {
  const errorCountMessage = `\n❌ Found ${errors.length} invalid example(s):\n`;
  return pipe(
    errorCountMessage,
    Console.log,
    Effect.andThen(formatAllErrors(errors)),
    Effect.andThen(Console.log('\n💡 To fix these issues:')),
    Effect.andThen(Console.log('   1. Update the code examples to match current APIs')),
    Effect.andThen(Console.log('   2. Add missing imports or type annotations')),
    Effect.andThen(Console.log('   3. Verify examples compile with: bun run validate:docs\n')),
    Effect.andThen(Effect.fail(new Error('Validation failed')))
  );
};

const handleValidationErrors =
  (allBlocks: readonly CodeBlock[]) => (errors: readonly ValidationError[]) =>
    errors.length > 0
      ? displayErrorsAndFail(errors)
      : Console.log(`\n✅ All ${allBlocks.length} code examples are valid!`);

const typeCheckAndReportErrors = (allBlocks: readonly CodeBlock[], tempDir: string) => {
  const blockCountMessage = `📝 Found ${allBlocks.length} TypeScript code blocks\n`;
  return pipe(
    blockCountMessage,
    Console.log,
    Effect.andThen(Console.log('⚙️  Type checking examples...\n')),
    Effect.andThen(createSeparateTempFiles(allBlocks, tempDir)),
    Effect.flatMap(runTypeCheckAndParseErrors(tempDir)),
    Effect.flatMap(handleValidationErrors(allBlocks))
  );
};

const skipValidationIfNoBlocks = (tempDir: string) => {
  const message = '✅ No TypeScript code blocks found - skipping validation';
  return pipe(message, Console.log, Effect.andThen(cleanupTempDir(tempDir)), Effect.asVoid);
};

const processAllBlocks =
  (tempDir: string, _packageDir: string) => (allBlocks: readonly CodeBlock[]) =>
    allBlocks.length === 0
      ? skipValidationIfNoBlocks(tempDir)
      : typeCheckAndReportErrors(allBlocks, tempDir);

const collectAllCodeBlocks =
  (packageDir: string) =>
  (
    markdownFiles: readonly string[]
  ): Effect.Effect<readonly CodeBlock[], Error, FileSystem.FileSystem | Path.Path> =>
    EffectArray.reduce(
      markdownFiles,
      Effect.succeed([] as readonly CodeBlock[]) as Effect.Effect<
        readonly CodeBlock[],
        Error,
        FileSystem.FileSystem | Path.Path
      >,
      (acc, file) => Effect.flatMap(acc, readAndExtractCodeBlocks(file, packageDir))
    );

const runValidation = (packageDir: string, tempDir: string) => {
  const validationMessage = `🔍 Validating TypeScript examples in ${packageDir}...\n`;
  return pipe(
    validationMessage,
    Console.log,
    Effect.andThen(cleanTempDirectory(tempDir)),
    Effect.andThen(createTempDirectory(tempDir)),
    Effect.andThen(findMarkdownFiles(packageDir)),
    Effect.tap((files) => Console.log(`📄 Found ${files.length} markdown files`)),
    Effect.flatMap(collectAllCodeBlocks(packageDir)),
    Effect.flatMap(processAllBlocks(tempDir, packageDir))
  );
};

const resolveCwd = pipe(
  Path.Path,
  Effect.andThen((path) => path.resolve('.'))
);

const createValidationDirPaths = (cwd: string) =>
  pipe(
    joinPath(cwd, 'node_modules', '.cache', 'validate-docs'),
    Effect.map((tempDir) => ({
      packageDir: cwd,
      tempDir,
    }))
  );

const getValidationDirs = pipe(resolveCwd, Effect.flatMap(createValidationDirPaths));

const validateMarkdownExamples = pipe(
  getValidationDirs,
  Effect.flatMap(({ packageDir, tempDir }) => runValidation(packageDir, tempDir))
);

const logErrorAndFail = (error: Readonly<Error>) => {
  const errorMessage = `\n💥 ${error.message}`;
  return pipe(errorMessage, Console.error, Effect.andThen(Effect.fail(error)));
};

const program = pipe(validateMarkdownExamples, Effect.catchAll(logErrorAndFail));

BunRuntime.runMain(pipe(program, Effect.provide(BunContext.layer)));
