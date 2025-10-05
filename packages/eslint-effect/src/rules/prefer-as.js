export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Effect.as() over Effect.map(() => value)',
    },
    messages: {
      preferAs:
        'Use Effect.as() when replacing with a constant value. Effect.map(() => value) should be Effect.as(value).',
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
          node.callee.property.name === 'map' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'ArrowFunctionExpression' &&
          node.arguments[0].params.length === 0
        ) {
          context.report({
            node,
            messageId: 'preferAs',
          });
        }
      },
    };
  },
};
