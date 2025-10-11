import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import functionalPlugin from 'eslint-plugin-functional';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import effectPlugin from '@codeforbreakfast/eslint-effect';
import buntestPlugin from '@codeforbreakfast/buntest/eslint';

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

const commonPluginsWithBuntest = {
  ...commonPluginsWithFunctional,
  buntest: {
    rules: buntestPlugin.rules,
  },
};

const typescriptPlugin = {
  '@typescript-eslint': typescript,
};

const functionalPluginOnly = {
  functional: functionalPlugin,
};

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
    ignores: [
      '**/eventsourcing-testing-contracts/**',
      '**/buntest/**',
      '**/eslint-effect/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/tests/**',
      '**/testing/**',
    ],
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
    name: 'effect-strict',
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/eventsourcing-testing-contracts/**',
      '**/buntest/**',
      '**/eslint-effect/**',
      '**/testing/**',
    ],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: effectPlugin.configs.strict.rules,
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
    ignores: ['**/buntest/**', '**/eventsourcing-testing-contracts/**', '**/eslint-effect/**'],
    languageOptions: commonLanguageOptions,
    plugins: commonPluginsWithBuntest,
    rules: {
      ...testFileImportRestrictions,
      // Override runPromise/runSync rules - tests use it.effect() instead
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
      // Allow if statements in test code where side effects (assertions) are expected
      'effect/no-if-statement': 'off',
      // Enforce buntest rules
      'buntest/no-runPromise-in-tests': 'error',
      'buntest/no-runSync-in-tests': 'error',
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
    name: 'scripts-strict-with-runPromise-allowed',
    files: ['scripts/**/*.ts'],
    languageOptions: commonLanguageOptions,
    rules: {
      // Allow runPromise/runSync in scripts as they are application entry points
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
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
      '**/*.d.ts',
      '**/*.d.ts.map',
      '**/build.ts',
      '**/.turbo/**',
    ],
  },
];
