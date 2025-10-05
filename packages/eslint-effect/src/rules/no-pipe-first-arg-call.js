/**
 * Forbid function calls as first argument to pipe()
 * The value should be first, then transformations
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'First argument in pipe() should not be a function call with a single argument. Instead of pipe(fn(x), ...), use pipe(x, fn, ...).',
    },
    messages: {
      noPipeFirstArgCall:
        'First argument in pipe() should not be a function call with a single argument. Instead of pipe(fn(x), ...), use pipe(x, fn, ...).',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'pipe' &&
          node.arguments.length > 0
        ) {
          const firstArg = node.arguments[0];
          if (firstArg.type === 'CallExpression' && firstArg.arguments.length === 1) {
            context.report({
              node: firstArg,
              messageId: 'noPipeFirstArgCall',
            });
          }
        }
      },
    };
  },
};
