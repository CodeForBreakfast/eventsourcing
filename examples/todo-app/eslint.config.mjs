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
];
