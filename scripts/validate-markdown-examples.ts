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
    Effect.map(() => state)
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
    Effect.map(() => [
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

interface PaddedBlock {
  readonly code: string;
  readonly block: CodeBlock;
  readonly startLine: number;
  readonly endLine: number;
}

const createPaddedBlock = (currentLine: number) => (block: CodeBlock) => {
  const codeLines = block.code.split('\n');
  const padding = '\n'.repeat(Math.max(0, block.line - currentLine - 1));
  const paddedCode = padding + block.code;
  const blockStart = block.line - 1;
  const blockEnd = blockStart + codeLines.length;

  return {
    paddedBlock: {
      code: paddedCode,
      block,
      startLine: blockStart,
      endLine: blockEnd,
    },
    nextLine: blockEnd,
  };
};

const wrapCodeBlocks = (
  blocks: readonly CodeBlock[],
  headerLines: number
): readonly PaddedBlock[] =>
  pipe(
    blocks,
    EffectArray.reduce(
      { paddedBlocks: [] as readonly PaddedBlock[], currentLine: headerLines },
      (acc, block) => {
        const result = createPaddedBlock(acc.currentLine)(block);
        return {
          paddedBlocks: [...acc.paddedBlocks, result.paddedBlock],
          currentLine: result.nextLine,
        };
      }
    )
  ).paddedBlocks;

const writeAllTempFiles = (filepath: string, content: string, tempDir: string) => {
  const writeFilesEffect = Effect.all([
    Effect.tryPromise({
      try: () => writeFile(filepath, content),
      catch: (error) => new Error(`Failed to write temp file ${filepath}: ${error}`),
    }),
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
    }),
  ]);

  return pipe(
    writeFilesEffect,
    Effect.map(() => filepath)
  );
};

const generateTempFileContent = (
  packageName: string,
  blocks: readonly CodeBlock[],
  tempDir: string
): Effect.Effect<
  {
    readonly filepath: string;
    readonly paddedBlocks: readonly PaddedBlock[];
    readonly headerLines: number;
  },
  Error,
  never
> => {
  const header = `// Auto-generated file for type checking all examples
// Import everything the user would import
import * as PackageExports from '${packageName}';
import { Effect, Stream, Scope, pipe, Schema, Chunk, Option, Layer, Context, Match, Data } from 'effect';

// Destructure package exports so they're available directly
const {} = PackageExports;

`;

  const headerLines = header.split('\n').length;
  const paddedBlocks = wrapCodeBlocks(blocks, headerLines);
  const content = header + paddedBlocks.map((pb) => pb.code).join('\n');
  const filepath = join(tempDir, 'all-examples.ts');

  return pipe(
    writeAllTempFiles(filepath, content, tempDir),
    Effect.map((fp) => ({ filepath: fp, paddedBlocks, headerLines }))
  );
};

const createCombinedTempFile = (
  blocks: readonly CodeBlock[],
  tempDir: string,
  packageDir: string
): Effect.Effect<
  {
    readonly filepath: string;
    readonly paddedBlocks: readonly PaddedBlock[];
    readonly headerLines: number;
  },
  Error,
  never
> => {
  const readPackageJsonEffect = Effect.tryPromise({
    try: () => readFile(join(packageDir, 'package.json'), 'utf-8'),
    catch: (error) => new Error(`Failed to read package.json: ${error}`),
  });

  return pipe(
    readPackageJsonEffect,
    Effect.map((content) => JSON.parse(content).name as string),
    Effect.flatMap((packageName) => generateTempFileContent(packageName, blocks, tempDir))
  );
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

const typeCheckFile = (filepath: string, tempDir: string) => {
  const spawnEffect = Effect.sync(() =>
    Bun.spawn(['bun', 'tsc', '--project', tempDir, '--noEmit'], {
      stderr: 'pipe',
      stdout: 'pipe',
    })
  );

  return pipe(spawnEffect, Effect.flatMap(waitForTypeCheck));
};

const createBlockInfo = (index: number, pb: PaddedBlock, lineNumber: number) => ({
  block: pb.block,
  offsetInBlock: lineNumber - pb.startLine,
  index,
});

const mapPaddedBlockToInfo = (
  lineNumber: number,
  index: number,
  paddedBlocks: readonly PaddedBlock[]
) =>
  pipe(
    paddedBlocks[index],
    Option.fromNullable,
    Option.map((pb) => createBlockInfo(index, pb, lineNumber))
  );

const findBlockForLine = (lineNumber: number, paddedBlocks: readonly PaddedBlock[]) =>
  pipe(
    paddedBlocks,
    EffectArray.findFirstIndex((pb) => lineNumber >= pb.startLine && lineNumber < pb.endLine),
    Option.flatMap((index) => mapPaddedBlockToInfo(lineNumber, index, paddedBlocks))
  );

const createValidationError = (
  block: CodeBlock,
  offsetInBlock: number,
  index: number,
  errorCode: string,
  errorMessage: string
): ValidationError => ({
  file: block.file,
  line: block.line + offsetInBlock,
  index,
  error: `TS${errorCode}: ${errorMessage}`,
});

const processErrorLine = (
  line: string,
  paddedBlocks: readonly PaddedBlock[],
  headerLines: number
): readonly ValidationError[] => {
  const errorMatch = line.match(/all-examples\.ts\((\d+),(\d+)\): error TS(\d+): (.+)/);
  if (!errorMatch) return [];

  const errorLine = parseInt(errorMatch[1]!, 10);
  const errorCode = errorMatch[3]!;
  const errorMessage = errorMatch[4]!;

  if (errorLine < headerLines) {
    return [];
  }

  return pipe(
    findBlockForLine(errorLine, paddedBlocks),
    Option.match({
      onNone: () => {
        console.warn(
          `⚠️  Could not map error at line ${errorLine} to any code block. This might indicate a problem with the validation script.`
        );
        return [];
      },
      onSome: ({ block, offsetInBlock, index }) => [
        createValidationError(block, offsetInBlock, index, errorCode, errorMessage),
      ],
    })
  );
};

const parseTypeErrors = (
  stdout: string,
  paddedBlocks: readonly PaddedBlock[],
  headerLines: number
): readonly ValidationError[] => {
  const lines = stdout.split('\n');
  return pipe(
    lines,
    EffectArray.flatMap((line) => processErrorLine(line, paddedBlocks, headerLines))
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
  pipe(
    acc,
    Effect.flatMap(() => formatErrorLine(line))
  );

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
    Effect.flatMap(() => Console.error('   Type checking failed:')),
    Effect.flatMap(() => formatErrorLines(error.error.split('\n')))
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

const runTypeCheckAndParseErrors = (
  tempFile: string,
  tempDir: string,
  paddedBlocks: readonly PaddedBlock[],
  headerLines: number
) =>
  pipe(
    typeCheckFile(tempFile, tempDir),
    Effect.map(() => [] as readonly ValidationError[]),
    Effect.catchAll((stdout) =>
      Effect.succeed(parseTypeErrors(stdout as string, paddedBlocks, headerLines))
    )
  );

const formatErrorWithAcc = (error: ValidationError) => (acc: Effect.Effect<void, never, never>) =>
  pipe(
    acc,
    Effect.flatMap(() => formatError(error))
  );

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
    Effect.flatMap(() => formatAllErrors(errors)),
    Effect.flatMap(() => Console.log('\n💡 To fix these issues:')),
    Effect.flatMap(() => Console.log('   1. Update the code examples to match current APIs')),
    Effect.flatMap(() => Console.log('   2. Add missing imports or type annotations')),
    Effect.flatMap(() =>
      Console.log('   3. Verify examples compile with: bun run validate:docs\n')
    ),
    Effect.flatMap(() => Effect.fail(new Error('Validation failed')))
  );
};

const handleValidationErrors = (
  errors: readonly ValidationError[],
  allBlocks: readonly CodeBlock[]
) =>
  errors.length > 0
    ? displayErrorsAndFail(errors)
    : Console.log(`\n✅ All ${allBlocks.length} code examples are valid!`);

const typeCheckAndReportErrors = (
  allBlocks: readonly CodeBlock[],
  tempDir: string,
  packageDir: string
) => {
  const blockCountMessage = `📝 Found ${allBlocks.length} TypeScript code blocks\n`;
  return pipe(
    blockCountMessage,
    Console.log,
    Effect.flatMap(() => Console.log('⚙️  Type checking examples...\n')),
    Effect.flatMap(() => createCombinedTempFile(allBlocks, tempDir, packageDir)),
    Effect.flatMap(({ filepath, paddedBlocks, headerLines }) =>
      runTypeCheckAndParseErrors(filepath, tempDir, paddedBlocks, headerLines)
    ),
    Effect.flatMap((errors) => handleValidationErrors(errors, allBlocks))
  );
};

const skipValidationIfNoBlocks = (tempDir: string) => {
  const message = '✅ No TypeScript code blocks found - skipping validation';
  return pipe(
    message,
    Console.log,
    Effect.flatMap(() => cleanupTempDir(tempDir)),
    Effect.asVoid
  );
};

const processAllBlocks = (allBlocks: readonly CodeBlock[], tempDir: string, packageDir: string) =>
  allBlocks.length === 0
    ? skipValidationIfNoBlocks(tempDir)
    : typeCheckAndReportErrors(allBlocks, tempDir, packageDir);

const runValidation = (packageDir: string, tempDir: string) => {
  const validationMessage = `🔍 Validating TypeScript examples in ${packageDir}...\n`;
  return pipe(
    validationMessage,
    Console.log,
    Effect.flatMap(() => cleanTempDirectory(tempDir)),
    Effect.flatMap(() => createTempDirectory(tempDir)),
    Effect.flatMap(() => findMarkdownFiles(packageDir)),
    Effect.tap((files) => Console.log(`📄 Found ${files.length} markdown files`)),
    Effect.flatMap((markdownFiles) => collectAllCodeBlocks(markdownFiles, packageDir)),
    Effect.flatMap((allBlocks) => processAllBlocks(allBlocks, tempDir, packageDir))
  );
};

const getValidationDirs = Effect.sync(() => ({
  packageDir: process.cwd(),
  tempDir: join(process.cwd(), '.turbo', 'validate-docs'),
}));

const validateMarkdownExamples = pipe(
  getValidationDirs,
  Effect.flatMap(({ packageDir, tempDir }) => runValidation(packageDir, tempDir))
);

const logErrorAndFail = (error: Readonly<Error>) => {
  const errorMessage = `\n💥 ${error.message}`;
  return pipe(
    errorMessage,
    Console.error,
    Effect.flatMap(() => Effect.fail(error))
  );
};

const program = pipe(validateMarkdownExamples, Effect.catchAll(logErrorAndFail));

// eslint-disable-next-line no-restricted-syntax -- Script entry point: runPromise is acceptable at application boundary
Effect.runPromise(program)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
