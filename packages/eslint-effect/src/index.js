import rules from './rules/index.js';
import {
  effectSyntaxRestrictions,
  simplePipeSyntaxRestrictions,
  functionalImmutabilityRules,
} from './configs.js';

export {
  rules,
  effectSyntaxRestrictions,
  simplePipeSyntaxRestrictions,
  functionalImmutabilityRules,
};

export default {
  rules,
  configs: {
    effectSyntaxRestrictions,
    simplePipeSyntaxRestrictions,
    functionalImmutabilityRules,
  },
};
