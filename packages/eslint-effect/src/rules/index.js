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
};
