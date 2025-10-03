import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import functionalPlugin from 'eslint-plugin-functional';

// Shared configuration pieces
const commonLanguageOptions = {
  parser,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
};

const commonPlugins = {
  '@typescript-eslint': typescript,
  'unused-imports': unusedImports,
  import: importPlugin,
};

// Common Effect-related syntax restrictions
const effectSyntaxRestrictions = [
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="gen"]',
    message: 'Effect.gen is forbidden. Use pipe and Effect.all/Effect.forEach instead.',
  },
  {
    selector: 'MemberExpression[object.name="Effect"][property.name="gen"]',
    message: 'Effect.gen is forbidden. Use pipe and Effect.all/Effect.forEach instead.',
  },
  {
    selector:
      'ClassDeclaration:not(:has(CallExpression[callee.object.name="Data"][callee.property.name="TaggedError"])):not(:has(CallExpression[callee.object.name="Effect"][callee.property.name="Tag"])):not(:has(CallExpression[callee.object.name="Context"][callee.property.name="Tag"])):not(:has(CallExpression[callee.object.name="Context"][callee.property.name="GenericTag"])):not(:has(CallExpression[callee.object.name="Schema"][callee.property.name="Class"]))',
    message:
      'Classes are forbidden in functional programming. Only Effect service tags (extending Context.Tag, Effect.Tag, or Context.GenericTag), error classes (extending Data.TaggedError), and Schema classes (extending Schema.Class) are allowed.',
  },
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="runSync"]',
    message:
      'Effect.runSync is forbidden in production code. Effects should be composed and run at the application boundary.',
  },
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="runPromise"]',
    message:
      'Effect.runPromise is forbidden in production code. Effects should be composed and run at the application boundary.',
  },
];

// Test-specific syntax restrictions
const testSyntaxRestrictions = [
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="runPromise"]',
    message:
      'Use it.effect() from @codeforbreakfast/buntest instead of Effect.runPromise() in tests.',
  },
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="runSync"]',
    message: 'Use it.effect() from @codeforbreakfast/buntest instead of Effect.runSync() in tests.',
  },
];

export default [
  {
    name: 'functional-immutability',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ...commonLanguageOptions,
      parserOptions: {
        ...commonLanguageOptions.parserOptions,
        project: true,
      },
    },
    plugins: {
      functional: functionalPlugin,
    },
    rules: {
      // Immutability rules
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
      'functional/no-method-signature': 'off', // Allow method signatures for Effect services
      'functional/no-mixed-types': 'off', // Allow mixed types for Effect services
      'functional/no-return-void': 'off', // Allow void returns for Effect
      'functional/functional-parameters': 'off', // Too strict for current codebase
      'functional/no-expression-statements': 'off', // Too restrictive
      'functional/no-conditional-statements': 'off', // Would require full rewrite
      'functional/no-loop-statements': 'error',
    },
  },
  {
    name: 'typescript-base',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
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
    },
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
    plugins: {
      '@typescript-eslint': typescript,
    },
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
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
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
      'no-restricted-syntax': ['error', ...effectSyntaxRestrictions, ...testSyntaxRestrictions],
      // Allow let in tests for setup/teardown patterns
      'functional/no-let': 'off',
      // Relax immutability for test data manipulation
      'functional/immutable-data': 'off',
    },
  },
  {
    name: 'testing-contracts-exceptions',
    files: [
      '**/eventsourcing-testing-contracts/**/*.ts',
      '**/eventsourcing-testing-contracts/**/*.tsx',
    ],
    languageOptions: commonLanguageOptions,
    plugins: {
      functional: functionalPlugin,
    },
    rules: {
      // Disable immutability rules for testing contract files
      'functional/prefer-immutable-types': 'off',
      'functional/prefer-readonly-type': 'off',
      'functional/no-let': 'off',
      'functional/immutable-data': 'off',
      'functional/type-declaration-immutability': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    name: 'simple-pipes',
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    ignores: ['**/buntest/**', '**/eventsourcing-testing-contracts/**'],
    languageOptions: commonLanguageOptions,
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name="pipe"]',
          message:
            'Method-based .pipe() is forbidden. Use the standalone pipe() function instead for consistency.',
        },
        {
          selector:
            'CallExpression[callee.type="CallExpression"][callee.callee.type="MemberExpression"]:not([callee.callee.object.name="Context"][callee.callee.property.name="Tag"]):not([callee.callee.object.name="Context"][callee.callee.property.name="GenericTag"]):not([callee.callee.object.name="Effect"][callee.callee.property.name="Tag"]):not([callee.callee.object.name="Data"][callee.callee.property.name="TaggedError"]):not([callee.callee.object.name="Schema"][callee.callee.property.name="Class"])',
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
      ],
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
