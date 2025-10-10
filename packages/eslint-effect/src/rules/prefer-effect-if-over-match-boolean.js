/**
 * Custom ESLint rule to detect Match.value used on boolean expressions in pipe
 * Suggests: Use Effect.if for boolean branching instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Effect.if over Match.value for boolean conditional branching. Match.value with boolean expressions leads to Match.when(true/false) which is less semantic than Effect.if.',
    },
    messages: {
      useEffectIf:
        'Use Effect.if instead of piping boolean to Match.value. Pattern: Effect.if(condition, { onTrue: () => effect, onFalse: () => effect }). Match.value should be used for pattern matching on multiple values, not booleans.',
    },
    schema: [],
  },

  create(context) {
    const isMatchValueIdentifier = (node) => {
      return (
        node &&
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'Match' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'value'
      );
    };

    const isBooleanExpression = (node) => {
      if (!node) return false;

      // Binary comparisons that return boolean
      if (node.type === 'BinaryExpression') {
        const booleanOps = ['===', '!==', '==', '!=', '<', '>', '<=', '>='];
        return booleanOps.includes(node.operator);
      }

      // Logical operators
      if (node.type === 'LogicalExpression') {
        return true;
      }

      // Unary not operator
      if (node.type === 'UnaryExpression' && node.operator === '!') {
        return true;
      }

      return false;
    };

    const isPipeCall = (node) => {
      return (
        node &&
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'pipe'
      );
    };

    return {
      CallExpression(node) {
        // Check for pipe(booleanExpression, Match.value, ...)
        if (isPipeCall(node) && node.arguments.length >= 2) {
          const firstArg = node.arguments[0];
          const secondArg = node.arguments[1];

          if (isBooleanExpression(firstArg) && isMatchValueIdentifier(secondArg)) {
            context.report({
              node: secondArg,
              messageId: 'useEffectIf',
            });
          }
        }
      },
    };
  },
};
