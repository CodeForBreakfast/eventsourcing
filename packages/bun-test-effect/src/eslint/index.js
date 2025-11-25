import noRunPromiseInTests from './no-runPromise-in-tests.js';
import noRunSyncInTests from './no-runSync-in-tests.js';
import preferEffectAssertions from './prefer-effect-assertions.js';

const rules = {
  'no-runPromise-in-tests': noRunPromiseInTests,
  'no-runSync-in-tests': noRunSyncInTests,
  'prefer-effect-assertions': preferEffectAssertions,
};

const plugin = {
  rules,
  meta: {
    name: '@codeforbreakfast/bun-test-effect/eslint',
    version: '0.2.3',
  },
};

export { rules };

export default plugin;
