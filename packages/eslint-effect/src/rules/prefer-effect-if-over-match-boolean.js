/**
 * Custom ESLint rule to detect Match.when(true/false) patterns
 * Suggests: Use Effect.if for boolean branching instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Effect.if over Match.when(true/false) for boolean conditional branching. Effect.if is more semantic and idiomatic for boolean conditions.',
    },
    messages: {
      useEffectIf:
        'Use Effect.if instead of Match.when(true/false) for boolean branching. Pattern: Effect.if(condition, { onTrue: () => effect, onFalse: () => effect }). Match.when should be used for pattern matching on multiple values, not boolean true/false.',
    },
    schema: [],
  },

  create(context) {
    const isMatchWhenCall = (node) => {
      return (
        node &&
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Match' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'when'
      );
    };

    const isBooleanLiteral = (node) => {
      return (
        node &&
        node.type === 'Literal' &&
        (node.value === true || node.value === false)
      );
    };

    return {
      CallExpression(node) {
        // Check if this is Match.when(true/false, ...)
        if (isMatchWhenCall(node) && node.arguments.length >= 1) {
          const firstArg = node.arguments[0];

          if (isBooleanLiteral(firstArg)) {
            context.report({
              node,
              messageId: 'useEffectIf',
            });
          }
        }
      },
    };
  },
};
