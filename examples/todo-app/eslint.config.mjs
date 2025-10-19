import rootConfig from '../../eslint.config.mjs';

export default [
  ...rootConfig,
  {
    files: ['src/frontend/**/*.ts', 'src/frontend/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.frontend.json',
      },
    },
    rules: {
      'functional/immutable-data': 'off',
      'functional/prefer-readonly-type': 'off',
    },
  },
  {
    files: ['e2e/**/*.ts', 'e2e/**/*.spec.ts'],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
    rules: {
      'functional/no-loop-statements': 'off',
      'functional/prefer-immutable-types': 'off',
    },
  },
  {
    name: 'playwright-config-override',
    files: ['playwright.config.ts'],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
    rules: {
      'effect/prefer-effect-platform': 'off',
    },
  },
];
