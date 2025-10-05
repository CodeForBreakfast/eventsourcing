export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Effect.andThen() over Effect.flatMap(() => ...)',
    },
    messages: {
      preferAndThen:
        'Use Effect.andThen() when discarding the input value. Effect.flatMap(() => expr) should be Effect.andThen(expr).',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Effect' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'flatMap' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'ArrowFunctionExpression' &&
          node.arguments[0].params.length === 0
        ) {
          context.report({
            node,
            messageId: 'preferAndThen',
          });
        }
      },
    };
  },
};
