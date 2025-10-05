/**
 * Forbid method-based .pipe() syntax
 * Use standalone pipe() function for consistency
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid method-based .pipe() syntax. Use the standalone pipe() function instead for consistency.',
    },
    messages: {
      noMethodPipe:
        'Method-based .pipe() is forbidden. Use the standalone pipe() function instead for consistency.',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'pipe'
        ) {
          context.report({
            node,
            messageId: 'noMethodPipe',
          });
        }
      },
    };
  },
};
