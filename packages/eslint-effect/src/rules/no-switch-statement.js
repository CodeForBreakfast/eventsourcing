/**
 * Forbid switch statements in functional code
 * Use Match.value or Match.type for pattern matching instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid switch statements in functional Effect code. Use Match.value for general pattern matching, Match.type for discriminated unions, or specific matchers like Either.match, Option.match, Exit.match.',
    },
    messages: {
      noSwitchStatement:
        'switch statements are forbidden in functional code. Use Match.value for pattern matching on discriminated unions, or Match.type/Match.tag for type-safe exhaustive matching. For Effect types, use Either.match, Option.match, or Exit.match.',
    },
    schema: [],
  },

  create(context) {
    return {
      SwitchStatement(node) {
        context.report({
          node,
          messageId: 'noSwitchStatement',
        });
      },
    };
  },
};
