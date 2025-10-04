import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import functionalPlugin from 'eslint-plugin-functional';
import eslintComments from 'eslint-plugin-eslint-comments';

// Shared configuration pieces
const commonLanguageOptions = {
  parser,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
};

const commonLanguageOptionsWithProject = {
  ...commonLanguageOptions,
  parserOptions: {
    ...commonLanguageOptions.parserOptions,
    project: true,
  },
};

const commonPlugins = {
  '@typescript-eslint': typescript,
  'unused-imports': unusedImports,
  import: importPlugin,
  'eslint-comments': eslintComments,
};

const commonPluginsWithFunctional = {
  ...commonPlugins,
  functional: functionalPlugin,
};

const typescriptPlugin = {
  '@typescript-eslint': typescript,
};

const functionalPluginOnly = {
  functional: functionalPlugin,
};

// Common Effect-related syntax restrictions
const effectSyntaxRestrictions = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.type="Identifier"][callee.object.name="Effect"][callee.property.type="Identifier"][callee.property.name="gen"]',
    message: 'Effect.gen is forbidden. Use pipe and Effect.all/Effect.forEach instead.',
  },
  {
    selector:
      'ClassDeclaration:not(:has(CallExpression > MemberExpression.callee[object.type="Identifier"][object.name=/^(Data|Effect|Context|Schema)$/][property.type="Identifier"][property.name=/^(TaggedError|Tag|GenericTag|Class)$/]))',
    message:
      'Classes are forbidden in functional programming. Only Effect service tags (extending Context.Tag, Effect.Tag, or Context.GenericTag), error classes (extending Data.TaggedError), and Schema classes (extending Schema.Class) are allowed.',
  },
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.type="Identifier"][callee.object.name="Effect"][callee.property.type="Identifier"][callee.property.name="runSync"]',
    message:
      'Effect.runSync is forbidden in production code. Effects should be composed and run at the application boundary.',
  },
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.type="Identifier"][callee.object.name="Effect"][callee.property.type="Identifier"][callee.property.name="runPromise"]',
    message:
      'Effect.runPromise is forbidden in production code. Effects should be composed and run at the application boundary.',
  },
  {
    selector: 'MemberExpression[computed=false][property.type="Identifier"][property.name="_tag"]',
    message:
      "Direct _tag access is forbidden. Use Effect's type guards instead: Either.isLeft/isRight, Option.isSome/isNone, Exit.isSuccess/isFailure, or match() functions.",
  },
  {
    selector:
      'SwitchStatement > MemberExpression.discriminant[property.type="Identifier"][property.name="_tag"]',
    message:
      "switch on _tag is forbidden. Use Effect's match() functions instead: Either.match, Option.match, Exit.match, or Data.TaggedEnum.match.",
  },
];

// Test-specific syntax restrictions
const testSyntaxRestrictions = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.type="Identifier"][callee.object.name="Effect"][callee.property.type="Identifier"][callee.property.name="runPromise"]',
    message:
      'Use it.effect() from @codeforbreakfast/buntest instead of Effect.runPromise() in tests.',
  },
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.type="Identifier"][callee.object.name="Effect"][callee.property.type="Identifier"][callee.property.name="runSync"]',
    message: 'Use it.effect() from @codeforbreakfast/buntest instead of Effect.runSync() in tests.',
  },
];

// Simple pipe syntax restrictions
const simplePipeSyntaxRestrictions = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.property.type="Identifier"][callee.property.name="pipe"]',
    message:
      'Method-based .pipe() is forbidden. Use the standalone pipe() function instead for consistency.',
  },
  {
    selector:
      'CallExpression[callee.type="CallExpression"][callee.callee.type="MemberExpression"][callee.callee.object.type="Identifier"][callee.callee.property.type="Identifier"]:not([callee.callee.object.name="Context"][callee.callee.property.name="Tag"]):not([callee.callee.object.name="Context"][callee.callee.property.name="GenericTag"]):not([callee.callee.object.name="Effect"][callee.callee.property.name="Tag"]):not([callee.callee.object.name="Data"][callee.callee.property.name="TaggedError"]):not([callee.callee.object.name="Schema"][callee.callee.property.name="Class"])',
    message:
      'Curried function calls are forbidden. Use pipe() instead. Example: pipe(data, Schema.decodeUnknown(schema)) instead of Schema.decodeUnknown(schema)(data)',
  },
  {
    selector:
      'CallExpression[callee.type="Identifier"][callee.name="pipe"] CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Nested pipe() calls are forbidden. Extract the inner pipe to a separate named function that returns an Effect.',
  },
  {
    selector:
      'ArrowFunctionExpression:has(CallExpression[callee.type="Identifier"][callee.name="pipe"]) CallExpression[callee.type="Identifier"][callee.name="pipe"] ~ CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Multiple pipe() calls in a function are forbidden. Extract additional pipes to separate named functions.',
  },
  {
    selector:
      'FunctionDeclaration:has(CallExpression[callee.type="Identifier"][callee.name="pipe"]) CallExpression[callee.type="Identifier"][callee.name="pipe"] ~ CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Multiple pipe() calls in a function are forbidden. Extract additional pipes to separate named functions.',
  },
  {
    selector:
      'FunctionExpression:has(CallExpression[callee.type="Identifier"][callee.name="pipe"]) CallExpression[callee.type="Identifier"][callee.name="pipe"] ~ CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Multiple pipe() calls in a function are forbidden. Extract additional pipes to separate named functions.',
  },
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.property.type="Identifier"][callee.property.name=/^(map|flatMap|filterMap|tap|forEach)$/] > ArrowFunctionExpression[params.length=1][params.0.type="Identifier"][body.type="Identifier"]',
    message:
      'Identity function in transformation is pointless. Example: Effect.map((x) => x) does nothing. Remove it or replace with the actual transformation needed.',
  },
  {
    selector:
      'CallExpression[callee.type="Identifier"][callee.name="pipe"] > .arguments:first-child[type="CallExpression"][arguments.length=1]',
    message:
      'First argument in pipe() should not be a function call with a single argument. Instead of pipe(fn(x), ...), use pipe(x, fn, ...).',
  },
];

// Common functional immutability rules
const functionalImmutabilityRules = {
  'functional/prefer-immutable-types': [
    'error',
    {
      enforcement: 'ReadonlyShallow',
      ignoreInferredTypes: true,
      ignoreTypePattern: [
        // Effect types are immutable-by-contract but contain internal mutable state
        '^Ref\\.Ref<.*>$',
        '^Queue\\.Queue<.*>$',
        '^HashMap\\.HashMap<.*>$',
        '^HashSet\\.HashSet<.*>$',
        '^Stream\\.Stream<.*>$',
        '^PubSub\\.PubSub<.*>$',
        // Bun types wrapped in ReadonlyDeep are treated as immutable at boundaries
        'ServerWebSocket<.*>$',
        // Built-in types wrapped in ReadonlyDeep are treated as immutable
        '^ReadonlyDeep<Date>$',
      ],
      parameters: {
        // Use ReadonlyShallow for parameters because Effect types contain internal
        // mutable state. ReadonlyShallow ensures readonly wrappers while allowing
        // Effect types within the structure.
        enforcement: 'ReadonlyShallow',
      },
    },
  ],
  'functional/type-declaration-immutability': [
    'error',
    {
      rules: [
        {
          identifiers: ['I.+'],
          immutability: 'ReadonlyDeep',
          comparator: 'AtLeast',
        },
      ],
      ignoreIdentifierPattern: [
        // Interfaces/types containing Effect/Schema types which are immutable-by-contract
        '.*Internal.*',
        '.*State',
        '.*Store',
        'Incoming.*',
      ],
    },
  ],
  'functional/no-let': 'error',
  'functional/immutable-data': [
    'error',
    {
      ignoreImmediateMutation: true,
      ignoreClasses: true,
      ignoreAccessorPattern: ['draft.**', '**.draft'],
    },
  ],
  'functional/prefer-readonly-type': 'error',
  'functional/no-method-signature': 'off',
  'functional/no-mixed-types': 'off',
  'functional/no-return-void': 'off',
  'functional/functional-parameters': 'off',
  'functional/no-expression-statements': 'off',
  'functional/no-conditional-statements': 'off',
  'functional/no-loop-statements': 'error',
};

// Test-specific functional rules (more relaxed)
const testFunctionalRules = {
  'functional/no-let': 'off',
  'functional/immutable-data': 'off',
  'functional/prefer-readonly-type': 'error',
  'functional/no-loop-statements': 'error',
};

// Testing contracts exception rules (all disabled)
const testingContractsExceptionRules = {
  'functional/prefer-immutable-types': 'off',
  'functional/prefer-readonly-type': 'off',
  'functional/no-let': 'off',
  'functional/immutable-data': 'off',
  'functional/type-declaration-immutability': 'off',
  'no-restricted-imports': 'off',
  'no-restricted-syntax': 'off',
};

// Common TypeScript rules
const typescriptBaseRules = {
  ...typescript.configs['recommended'].rules,
  ...prettier.rules,
  'unused-imports/no-unused-imports': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any': 'error',
  'import/extensions': [
    'error',
    'never',
    {
      js: 'never',
      ts: 'never',
      tsx: 'never',
    },
  ],
  'eslint-comments/require-description': ['error', { ignore: [] }],
};

// Test file imports restrictions
const testFileImportRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['bun:test'],
          message:
            'Test files should prefer "@codeforbreakfast/buntest" over "bun:test" for better Effect integration. Use buntest unless you specifically need bun:test features.',
        },
      ],
    },
  ],
};

export default [
  {
    name: 'functional-immutability',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: commonLanguageOptionsWithProject,
    plugins: functionalPluginOnly,
    rules: functionalImmutabilityRules,
  },
  {
    name: 'typescript-base',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: typescriptBaseRules,
  },
  {
    name: 'effect-coding-standards',
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    languageOptions: commonLanguageOptions,
    plugins: typescriptPlugin,
    rules: {
      'no-restricted-syntax': ['error', ...effectSyntaxRestrictions],
    },
  },
  {
    name: 'buntest-integration',
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*test*.ts',
      '**/*test*.tsx',
      '**/testing/**/*.ts',
    ],
    ignores: ['**/buntest/**'],
    languageOptions: commonLanguageOptions,
    plugins: commonPluginsWithFunctional,
    rules: {
      ...testFileImportRestrictions,
      'no-restricted-syntax': [
        'error',
        ...effectSyntaxRestrictions,
        ...testSyntaxRestrictions,
        ...simplePipeSyntaxRestrictions,
      ],
      ...testFunctionalRules,
    },
  },
  {
    name: 'testing-contracts-exceptions',
    files: [
      '**/eventsourcing-testing-contracts/**/*.ts',
      '**/eventsourcing-testing-contracts/**/*.tsx',
    ],
    languageOptions: commonLanguageOptions,
    plugins: functionalPluginOnly,
    rules: testingContractsExceptionRules,
  },
  {
    name: 'simple-pipes',
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    ignores: ['**/buntest/**', '**/eventsourcing-testing-contracts/**'],
    languageOptions: commonLanguageOptions,
    plugins: typescriptPlugin,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...effectSyntaxRestrictions,
        ...simplePipeSyntaxRestrictions,
      ],
    },
  },
  {
    name: 'eslint-test-rules-exceptions',
    files: ['**/eslint-test-rules/**/*.ts', '**/eslint-test-rules/**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: typescriptPlugin,
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    name: 'ignore-patterns',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.js',
      '**/*.mjs',
      '**/build.ts',
    ],
  },
];
