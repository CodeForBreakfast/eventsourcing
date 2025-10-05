#!/usr/bin/env bun

import { Effect, pipe, Array as EffectArray, Console, Option } from 'effect';
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, relative } from 'path';

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

const processLineInState =
  (filePath: string, index: number, line: string) =>
  (accEffect: Effect.Effect<ParserState, never, never>) =>
    pipe(
      accEffect,
      Effect.flatMap((state) => processMarkdownLine(filePath, index)(state, line))
    );

const extractCodeBlocks = (content: string, filePath: string) => {
  const lines = content.split('\n');
  return pipe(
    lines,
    EffectArray.reduce(Effect.succeed(initialParserState), (accEffect, line, index) =>
      processLineInState(filePath, index, line)(accEffect)
    ),
    Effect.flatMap(finalizeParserState(filePath))
  );
};

const shouldSkipEntry = (name: string): boolean =>
  name === 'node_modules' || name === '.git' || name === 'dist';

const processDirectoryEntry =
  (currentDir: string, files: readonly string[]) =>
  (entry: {
    readonly name: string;
    readonly isDirectory: () => boolean;
    readonly isFile: () => boolean;
  }): Effect.Effect<readonly string[], Error, never> => {
    if (shouldSkipEntry(entry.name)) {
      return Effect.succeed(files);
    }

    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      return processDirectory(fullPath, files);
    }

    if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('CHANGELOG')) {
      return Effect.succeed([...files, fullPath]);
    }

    return Effect.succeed(files);
  };

const processEntryWithFiles =
  (
    currentDir: string,
    entry: {
      readonly name: string;
      readonly isDirectory: () => boolean;
      readonly isFile: () => boolean;
    }
  ) =>
  (acc: Effect.Effect<readonly string[], Error, never>) =>
    pipe(
      acc,
      Effect.flatMap((currentFiles) => processDirectoryEntry(currentDir, currentFiles)(entry))
    );

const reduceDirectoryEntries = (
  entries: readonly {
    readonly name: string;
    readonly isDirectory: () => boolean;
    readonly isFile: () => boolean;
  }[],
  files: readonly string[],
  currentDir: string
) =>
  pipe(
    entries,
    EffectArray.reduce(Effect.succeed(files), (acc, entry) =>
      processEntryWithFiles(currentDir, entry)(acc)
    )
  );

const processDirectory = (
  currentDir: string,
  files: readonly string[] = []
): Effect.Effect<readonly string[], Error, never> => {
  const readdirEffect = Effect.tryPromise({
    try: () => readdir(currentDir, { withFileTypes: true }),
    catch: (error) => new Error(`Failed to read directory ${currentDir}: ${error}`),
  });

  return pipe(
    readdirEffect,
    Effect.flatMap((entries) =>
      reduceDirectoryEntries(
        entries as readonly {
          readonly name: string;
          readonly isDirectory: () => boolean;
          readonly isFile: () => boolean;
        }[],
        files,
        currentDir
      )
    )
  );
};

const findMarkdownFiles = (dir: string) => processDirectory(dir, []);

interface BlockFile {
  readonly filename: string;
  readonly block: CodeBlock;
  readonly headerLines: number;
}

const writeTsConfig = (tempDir: string) =>
  Effect.tryPromise({
    try: () =>
      writeFile(
        join(tempDir, 'tsconfig.json'),
        JSON.stringify(
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
        )
      ),
    catch: (error) => new Error(`Failed to write tsconfig: ${error}`),
  });

const writeBlockFile = (
  block: CodeBlock,
  index: number,
  tempDir: string
): Effect.Effect<BlockFile, Error, never> => {
  const headerLines = 0;
  const filename = `example-${index + 1}.ts`;
  const filepath = join(tempDir, filename);
  const content = block.code;

  const writeFileEffect = Effect.tryPromise({
    try: () => writeFile(filepath, content),
    catch: (error) => new Error(`Failed to write ${filename}: ${error}`),
  });

  return pipe(writeFileEffect, Effect.as({ filename, block, headerLines }));
};

const writeAllBlockFiles = (
  blocks: readonly CodeBlock[],
  tempDir: string
): Effect.Effect<readonly BlockFile[], Error, never> => {
  const writeEffects = blocks.map((block, index) => writeBlockFile(block, index, tempDir));
  return Effect.all(writeEffects);
};

const createSeparateTempFiles = (
  blocks: readonly CodeBlock[],
  tempDir: string
): Effect.Effect<readonly BlockFile[], Error, never> => {
  const tsConfigEffect = writeTsConfig(tempDir);
  return pipe(tsConfigEffect, Effect.andThen(writeAllBlockFiles(blocks, tempDir)));
};

const handleTypeCheckResult = ([exitCode, stdoutText]: readonly [number, string]) =>
  exitCode !== 0 ? Effect.fail(stdoutText) : Effect.void;

const waitForTypeCheck = (proc: ReturnType<typeof Bun.spawn>) => {
  const exitAndOutputEffect = Effect.all([
    Effect.promise(() => proc.exited),
    Effect.promise(() => new Response(proc.stdout as ReadableStream).text()),
  ]);

  return pipe(exitAndOutputEffect, Effect.flatMap(handleTypeCheckResult));
};

const typeCheckDirectory = (tempDir: string) => {
  const spawnEffect = Effect.sync(() =>
    Bun.spawn(['bun', 'tsc', '--project', tempDir, '--noEmit'], {
      stderr: 'pipe',
      stdout: 'pipe',
    })
  );

  return pipe(spawnEffect, Effect.flatMap(waitForTypeCheck));
};

const findBlockFileByFilename = (filename: string, blockFiles: readonly BlockFile[]) =>
  pipe(
    blockFiles,
    EffectArray.findFirst((bf) => bf.filename === filename)
  );

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

const processErrorLine = (
  line: string,
  blockFiles: readonly BlockFile[]
): readonly ValidationError[] => {
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
        console.warn(`⚠️  Could not find block file ${filename}`);
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
  return pipe(
    lines,
    EffectArray.flatMap((line) => processErrorLine(line, blockFiles))
  );
};

const cleanupTempDir = (tempDir: string) => {
  const rmEffect = Effect.tryPromise({
    try: () => rm(tempDir, { recursive: true, force: true }),
    catch: () => new Error(`Failed to cleanup temp dir ${tempDir}`),
  });

  return pipe(
    rmEffect,
    Effect.orElseSucceed(() => undefined)
  );
};

const formatErrorLine = (line: string): Effect.Effect<void, never, never> =>
  !line.includes('example-') || line.includes('error TS')
    ? Console.error(`   ${line}`)
    : Effect.void;

const formatErrorLineWithAcc = (line: string) => (acc: Effect.Effect<void, never, never>) =>
  pipe(acc, Effect.andThen(formatErrorLine(line)));

const formatErrorLines = (errorLines: readonly string[]) =>
  pipe(
    errorLines,
    EffectArray.filter((line) => line.trim().length > 0),
    EffectArray.reduce(Effect.void, (acc, line) => formatErrorLineWithAcc(line)(acc))
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

const cleanTempDirectory = (tempDir: string) => {
  const rmEffect = Effect.tryPromise({
    try: () => rm(tempDir, { recursive: true, force: true }),
    catch: () => new Error(`Failed to clean temp dir`),
  });

  return pipe(
    rmEffect,
    Effect.orElseSucceed(() => undefined)
  );
};

const createTempDirectory = (tempDir: string) =>
  Effect.tryPromise({
    try: () => mkdir(tempDir, { recursive: true }),
    catch: (error) => new Error(`Failed to create temp dir: ${error}`),
  });

const readAndExtractCodeBlocks = (
  file: string,
  packageDir: string,
  blocks: readonly CodeBlock[]
) => {
  const readFileEffect = Effect.tryPromise({
    try: () => readFile(file, 'utf-8'),
    catch: (error) => new Error(`Failed to read ${file}: ${error}`),
  });

  return pipe(
    readFileEffect,
    Effect.flatMap((content) => extractCodeBlocks(content, relative(packageDir, file))),
    Effect.map((newBlocks) => [...blocks, ...newBlocks])
  );
};

const processFileWithBlocks =
  (packageDir: string, file: string) => (acc: Effect.Effect<readonly CodeBlock[], Error, never>) =>
    pipe(
      acc,
      Effect.flatMap((blocks) => readAndExtractCodeBlocks(file, packageDir, blocks))
    );

const collectAllCodeBlocks = (markdownFiles: readonly string[], packageDir: string) =>
  pipe(
    markdownFiles,
    EffectArray.reduce(Effect.succeed([] as readonly CodeBlock[]), (acc, file) =>
      processFileWithBlocks(packageDir, file)(acc)
    )
  );

const runTypeCheckAndParseErrors = (tempDir: string, blockFiles: readonly BlockFile[]) =>
  pipe(
    tempDir,
    typeCheckDirectory,
    Effect.as([] as readonly ValidationError[]),
    Effect.catchAll((stdout) => Effect.succeed(parseTypeErrors(stdout as string, blockFiles)))
  );

const formatErrorWithAcc = (error: ValidationError) => (acc: Effect.Effect<void, never, never>) =>
  pipe(acc, Effect.andThen(formatError(error)));

const formatAllErrors = (errors: readonly ValidationError[]) =>
  pipe(
    errors,
    EffectArray.reduce(Effect.void, (acc, error) => formatErrorWithAcc(error)(acc))
  );

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

const handleValidationErrors = (
  errors: readonly ValidationError[],
  allBlocks: readonly CodeBlock[]
) =>
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
    Effect.flatMap((blockFiles) => runTypeCheckAndParseErrors(tempDir, blockFiles)),
    Effect.flatMap((errors) => handleValidationErrors(errors, allBlocks))
  );
};

const skipValidationIfNoBlocks = (tempDir: string) => {
  const message = '✅ No TypeScript code blocks found - skipping validation';
  return pipe(message, Console.log, Effect.andThen(cleanupTempDir(tempDir)), Effect.asVoid);
};

const processAllBlocks = (allBlocks: readonly CodeBlock[], tempDir: string, _packageDir: string) =>
  allBlocks.length === 0
    ? skipValidationIfNoBlocks(tempDir)
    : typeCheckAndReportErrors(allBlocks, tempDir);

const runValidation = (packageDir: string, tempDir: string) => {
  const validationMessage = `🔍 Validating TypeScript examples in ${packageDir}...\n`;
  return pipe(
    validationMessage,
    Console.log,
    Effect.andThen(cleanTempDirectory(tempDir)),
    Effect.andThen(createTempDirectory(tempDir)),
    Effect.andThen(findMarkdownFiles(packageDir)),
    Effect.tap((files) => Console.log(`📄 Found ${files.length} markdown files`)),
    Effect.flatMap((markdownFiles) => collectAllCodeBlocks(markdownFiles, packageDir)),
    Effect.flatMap((allBlocks) => processAllBlocks(allBlocks, tempDir, packageDir))
  );
};

const getValidationDirs = Effect.sync(() => ({
  packageDir: process.cwd(),
  tempDir: join(process.cwd(), 'node_modules', '.cache', 'validate-docs'),
}));

const validateMarkdownExamples = pipe(
  getValidationDirs,
  Effect.flatMap(({ packageDir, tempDir }) => runValidation(packageDir, tempDir))
);

const logErrorAndFail = (error: Readonly<Error>) => {
  const errorMessage = `\n💥 ${error.message}`;
  return pipe(errorMessage, Console.error, Effect.andThen(Effect.fail(error)));
};

const program = pipe(validateMarkdownExamples, Effect.catchAll(logErrorAndFail));

// eslint-disable-next-line no-restricted-syntax -- Script entry point: runPromise is acceptable at application boundary
Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
