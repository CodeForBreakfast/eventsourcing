import noUnnecessaryPipeWrapper from './no-unnecessary-pipe-wrapper.js';
import preferMatchTag from './prefer-match-tag.js';
import preferMatchOverConditionals from './prefer-match-over-conditionals.js';
import preferSchemaValidationOverAssertions from './prefer-schema-validation-over-assertions.js';
import noClasses from './no-classes.js';
import noRunSync from './no-runSync.js';
import noRunPromise from './no-runPromise.js';
import preferAndThen from './prefer-andThen.js';
import preferAs from './prefer-as.js';
import noGen from './no-gen.js';
import noDirectTagAccess from './no-direct-tag-access.js';
import noSwitchOnTag from './no-switch-on-tag.js';
import noMethodPipe from './no-method-pipe.js';
import noCurriedCalls from './no-curried-calls.js';
import noIdentityTransform from './no-identity-transform.js';
import noPipeFirstArgCall from './no-pipe-first-arg-call.js';
import noNestedPipe from './no-nested-pipe.js';
import noMultiplePipes from './no-multiple-pipes.js';

export default {
  'no-unnecessary-pipe-wrapper': noUnnecessaryPipeWrapper,
  'prefer-match-tag': preferMatchTag,
  'prefer-match-over-conditionals': preferMatchOverConditionals,
  'prefer-schema-validation-over-assertions': preferSchemaValidationOverAssertions,
  'no-classes': noClasses,
  'no-runSync': noRunSync,
  'no-runPromise': noRunPromise,
  'prefer-andThen': preferAndThen,
  'prefer-as': preferAs,
  'no-gen': noGen,
  'no-direct-tag-access': noDirectTagAccess,
  'no-switch-on-tag': noSwitchOnTag,
  'no-method-pipe': noMethodPipe,
  'no-curried-calls': noCurriedCalls,
  'no-identity-transform': noIdentityTransform,
  'no-pipe-first-arg-call': noPipeFirstArgCall,
  'no-nested-pipe': noNestedPipe,
  'no-multiple-pipes': noMultiplePipes,
};
