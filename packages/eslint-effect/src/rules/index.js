import noUnnecessaryPipeWrapper from './no-unnecessary-pipe-wrapper.js';
import preferMatchTag from './prefer-match-tag.js';
import preferMatchOverConditionals from './prefer-match-over-conditionals.js';
import preferMatchOverTernary from './prefer-match-over-ternary.js';
import preferEffectIfOverMatchBoolean from './prefer-effect-if-over-match-boolean.js';
import preferSchemaValidationOverAssertions from './prefer-schema-validation-over-assertions.js';
import noClasses from './no-classes.js';
import noRunSync from './no-runSync.js';
import noRunPromise from './no-runPromise.js';
import preferAndThen from './prefer-andThen.js';
import preferAs from './prefer-as.js';
import preferAsVoid from './prefer-as-void.js';
import preferAsSome from './prefer-as-some.js';
import preferAsSomeError from './prefer-as-some-error.js';
import noGen from './no-gen.js';
import noDirectTagAccess from './no-direct-tag-access.js';
import noSwitchStatement from './no-switch-statement.js';
import noMethodPipe from './no-method-pipe.js';
import noCurriedCalls from './no-curried-calls.js';
import noIdentityTransform from './no-identity-transform.js';
import noPipeFirstArgCall from './no-pipe-first-arg-call.js';
import noNestedPipe from './no-nested-pipe.js';
import noNestedPipes from './no-nested-pipes.js';
import preferEffectPlatform from './prefer-effect-platform.js';
import suggestCurryingOpportunity from './suggest-currying-opportunity.js';
import noEtaExpansion from './no-eta-expansion.js';
import noUnnecessaryFunctionAlias from './no-unnecessary-function-alias.js';
import noIntermediateEffectVariables from './no-intermediate-effect-variables.js';
import noIfStatement from './no-if-statement.js';
import preferFlatten from './prefer-flatten.js';
import preferZipLeft from './prefer-zip-left.js';
import preferZipRight from './prefer-zip-right.js';
import preferIgnore from './prefer-ignore.js';
import preferIgnoreLogged from './prefer-ignore-logged.js';
import preferFromNullable from './prefer-from-nullable.js';
import preferGetOrElse from './prefer-get-or-else.js';
import preferGetOrNull from './prefer-get-or-null.js';
import preferSucceedNone from './prefer-succeed-none.js';

export default {
  'no-unnecessary-pipe-wrapper': noUnnecessaryPipeWrapper,
  'prefer-match-tag': preferMatchTag,
  'prefer-match-over-conditionals': preferMatchOverConditionals,
  'prefer-match-over-ternary': preferMatchOverTernary,
  'prefer-effect-if-over-match-boolean': preferEffectIfOverMatchBoolean,
  'prefer-schema-validation-over-assertions': preferSchemaValidationOverAssertions,
  'no-classes': noClasses,
  'no-runSync': noRunSync,
  'no-runPromise': noRunPromise,
  'prefer-andThen': preferAndThen,
  'prefer-as': preferAs,
  'prefer-as-void': preferAsVoid,
  'prefer-as-some': preferAsSome,
  'prefer-as-some-error': preferAsSomeError,
  'no-gen': noGen,
  'no-direct-tag-access': noDirectTagAccess,
  'no-switch-statement': noSwitchStatement,
  'no-method-pipe': noMethodPipe,
  'no-curried-calls': noCurriedCalls,
  'no-identity-transform': noIdentityTransform,
  'no-pipe-first-arg-call': noPipeFirstArgCall,
  'no-nested-pipe': noNestedPipe,
  'no-nested-pipes': noNestedPipes,
  'prefer-effect-platform': preferEffectPlatform,
  'suggest-currying-opportunity': suggestCurryingOpportunity,
  'no-eta-expansion': noEtaExpansion,
  'no-unnecessary-function-alias': noUnnecessaryFunctionAlias,
  'no-intermediate-effect-variables': noIntermediateEffectVariables,
  'no-if-statement': noIfStatement,
  'prefer-flatten': preferFlatten,
  'prefer-zip-left': preferZipLeft,
  'prefer-zip-right': preferZipRight,
  'prefer-ignore': preferIgnore,
  'prefer-ignore-logged': preferIgnoreLogged,
  'prefer-from-nullable': preferFromNullable,
  'prefer-get-or-else': preferGetOrElse,
  'prefer-get-or-null': preferGetOrNull,
  'prefer-succeed-none': preferSucceedNone,
};
