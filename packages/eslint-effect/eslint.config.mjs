import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';
import functionalPlugin from 'eslint-plugin-functional';
import effectPlugin from './src/index.js';

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
  functional: functionalPlugin,
  effect: {
    rules: effectPlugin.rules,
  },
};

const typescriptBaseRules = {
  ...typescript.configs['recommended'].rules,
  ...prettier.rules,
  'unused-imports/no-unused-imports': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any': 'error',
};

export default [
  {
    name: 'eslint-effect-typescript-base',
    files: ['test/**/*.ts', 'test/**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      ...typescriptBaseRules,
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    name: 'eslint-effect-test-isolation',
    files: ['test/**/*.ts', 'test/**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      // Each test file should only enable the rule it's testing
      // All other effect and functional rules are disabled by default
      'functional/prefer-readonly-type': 'off',
      'effect/no-classes': 'off',
      'effect/no-curried-calls': 'off',
      'effect/no-direct-tag-access': 'off',
      'effect/no-eta-expansion': 'off',
      'effect/no-gen': 'off',
      'effect/no-identity-transform': 'off',
      'effect/no-if-statement': 'off',
      'effect/no-intermediate-effect-variables': 'off',
      'effect/no-method-pipe': 'off',
      'effect/no-nested-pipe': 'off',
      'effect/no-nested-pipes': 'off',
      'effect/no-pipe-first-arg-call': 'off',
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
      'effect/no-switch-statement': 'off',
      'effect/no-unnecessary-function-alias': 'off',
      'effect/no-unnecessary-pipe-wrapper': 'off',
      'effect/prefer-andThen': 'off',
      'effect/prefer-as': 'off',
      'effect/prefer-as-void': 'off',
      'effect/prefer-effect-if-over-match-boolean': 'off',
      'effect/prefer-effect-platform': 'off',
      'effect/prefer-match-over-conditionals': 'off',
      'effect/prefer-match-over-ternary': 'off',
      'effect/prefer-match-tag': 'off',
      'effect/prefer-schema-validation-over-assertions': 'off',
      'effect/suggest-currying-opportunity': 'off',
    },
  },
  {
    name: 'ignore-patterns',
    ignores: ['**/node_modules/**', '**/dist/**', '**/*.js', '**/*.mjs', '**/*.d.ts'],
  },
];
