import noRunPromiseInTests from './no-runPromise-in-tests.js';
import noRunSyncInTests from './no-runSync-in-tests.js';

const rules = {
  'no-runPromise-in-tests': noRunPromiseInTests,
  'no-runSync-in-tests': noRunSyncInTests,
};

const plugin = {
  rules,
  meta: {
    name: '@codeforbreakfast/buntest/eslint',
    version: '0.2.3',
  },
};

export { rules };

export default plugin;
