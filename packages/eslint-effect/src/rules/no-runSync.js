export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid Effect.runSync in production code',
    },
    messages: {
      noRunSync:
        'Effect.runSync is forbidden in production code. Effects should be composed and run at the application boundary.',
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
          node.callee.property.name === 'runSync'
        ) {
          context.report({
            node,
            messageId: 'noRunSync',
          });
        }
      },
    };
  },
};
