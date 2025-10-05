/**
 * Forbid nested pipe() calls
 * Extract inner pipe to a separate named function
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid nested pipe() calls. Extract the inner pipe to a separate named function that returns an Effect.',
    },
    messages: {
      noNestedPipe:
        'Nested pipe() calls are forbidden. Extract the inner pipe to a separate named function that returns an Effect.',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'pipe') {
          let parent = node.parent;
          while (parent) {
            if (
              parent.type === 'CallExpression' &&
              parent.callee.type === 'Identifier' &&
              parent.callee.name === 'pipe'
            ) {
              context.report({
                node,
                messageId: 'noNestedPipe',
              });
              break;
            }
            parent = parent.parent;
          }
        }
      },
    };
  },
};
