/**
 * Forbid if statements in functional code
 * Use Effect.if for boolean conditionals with Effects, Match.value for pattern matching, or type-specific matchers
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid if statements in functional Effect code. Use Effect.if for boolean conditionals returning Effects, Match.value for pattern matching on discriminated unions, or type-specific matchers like Either.match, Option.match, Exit.match.',
    },
    messages: {
      noIfStatement:
        'if statements are forbidden in functional code. Use Effect.if for boolean conditionals with Effects, Match.value for pattern matching on discriminated unions, or type-specific matchers like Either.match, Option.match, Exit.match. For simple value selection, ternary operators are allowed.',
    },
    schema: [],
  },

  create(context) {
    return {
      IfStatement(node) {
        context.report({
          node,
          messageId: 'noIfStatement',
        });
      },
    };
  },
};
