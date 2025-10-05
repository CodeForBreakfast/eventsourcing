import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import functionalPlugin from 'eslint-plugin-functional';
import eslintComments from 'eslint-plugin-eslint-comments';
import effectPlugin from '@codeforbreakfast/eslint-effect';

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
  effect: {
    rules: effectPlugin.rules,
  },
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

// Test-specific configurations defined locally (consumers configure these as needed)
// TODO: These should be exported from @codeforbreakfast/buntest package
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

const testFunctionalRules = {
  'functional/no-let': 'off',
  'functional/immutable-data': 'off',
  'functional/prefer-readonly-type': 'error',
  'functional/no-loop-statements': 'error',
};

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

// Testing contracts exception rules (all disabled)
const testingContractsExceptionRules = {
  'functional/prefer-immutable-types': 'off',
  'functional/prefer-readonly-type': 'off',
  'functional/no-let': 'off',
  'functional/immutable-data': 'off',
  'functional/type-declaration-immutability': 'off',
  'no-restricted-imports': 'off',
  'no-restricted-syntax': 'off',
  'effect/prefer-andThen': 'off',
  'effect/prefer-as': 'off',
  'effect/no-classes': 'off',
  'effect/no-gen': 'off',
  'effect/no-runSync': 'off',
  'effect/no-runPromise': 'off',
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

export default [
  {
    name: 'functional-immutability',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: commonLanguageOptionsWithProject,
    plugins: functionalPluginOnly,
    rules: effectPlugin.configs.functionalImmutabilityRules,
  },
  {
    name: 'typescript-base',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: typescriptBaseRules,
  },
  {
    ...effectPlugin.configs.recommended,
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    languageOptions: commonLanguageOptions,
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
      ...effectPlugin.configs.strict.rules,
      ...testFileImportRestrictions,
      // Override runPromise/runSync rules for tests - they use it.effect() instead
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
      'no-restricted-syntax': [
        'error',
        ...testSyntaxRestrictions,
        ...effectPlugin.configs.syntaxRestrictions.pipeStrict,
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
    ...effectPlugin.configs.noGen,
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    ignores: ['**/buntest/**', '**/eventsourcing-testing-contracts/**'],
    languageOptions: commonLanguageOptions,
  },
  {
    ...effectPlugin.configs.pipeStrict,
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    ignores: ['**/buntest/**', '**/eventsourcing-testing-contracts/**'],
    languageOptions: commonLanguageOptions,
  },
  {
    name: 'scripts-strict-with-runPromise-allowed',
    files: ['scripts/**/*.ts'],
    languageOptions: commonLanguageOptions,
    rules: {
      ...effectPlugin.configs.recommended.rules,
      ...effectPlugin.configs.noGen.rules,
      ...effectPlugin.configs.pipeStrict.rules,
      // Allow runPromise/runSync in scripts as they are application entry points
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
    },
  },
  {
    name: 'eslint-effect-test-exceptions',
    files: ['**/eslint-effect/test/**/*.ts', '**/eslint-effect/test/**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      ...effectPlugin.configs.strict.rules,
    },
  },
  {
    name: 'eventsourcing-layer-architecture',
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    ignores: ['packages/eventsourcing-protocol/**'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/eventsourcing-protocol/**/protocol',
                '**/eventsourcing-protocol/**/server-protocol',
              ],
              message:
                'Direct imports from protocol.ts or server-protocol.ts are forbidden outside the eventsourcing-protocol package. These files contain internal protocol implementation details (Protocol* types). Import from @codeforbreakfast/eventsourcing-protocol package index instead.',
            },
            {
              group: ['@codeforbreakfast/eventsourcing-protocol/src/**'],
              message:
                'Direct imports from eventsourcing-protocol internals are forbidden. Import from @codeforbreakfast/eventsourcing-protocol package index instead to respect layer boundaries.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'eventsourcing-commands-layer-separation',
    files: ['packages/eventsourcing-commands/**/*.ts', 'packages/eventsourcing-commands/**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@codeforbreakfast/eventsourcing-protocol',
                '@codeforbreakfast/eventsourcing-protocol/**',
              ],
              message:
                'The eventsourcing-commands package (Wire API - Layer 2) must not depend on eventsourcing-protocol (Protocol - Layer 3). Keep clear layer separation: Domain → Wire API → Protocol → Transport.',
            },
          ],
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
      '**/.turbo/**',
    ],
  },
];
