import rules from './rules/index.js';
import {
  functionalImmutabilityRules,
  pluginRules,
  recommended,
  strict,
  noGen,
  preferMatch,
  pipeStrict,
  syntaxRestrictions,
} from './configs.js';

const plugin = {
  rules,
  meta: {
    name: '@codeforbreakfast/eslint-effect',
    version: '0.2.0',
  },
};

const configs = {
  functionalImmutabilityRules,
  plugin: pluginRules(),
  recommended: recommended(),
  strict: strict(),
  noGen: noGen(),
  preferMatch: preferMatch(),
  pipeStrict: pipeStrict(),
  syntaxRestrictions,
};

export { rules, functionalImmutabilityRules, syntaxRestrictions };

export default {
  ...plugin,
  configs,
};
