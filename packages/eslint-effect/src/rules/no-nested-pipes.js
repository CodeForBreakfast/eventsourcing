/**
 * Forbid nested pipe() calls
 * Nested pipes make code harder to read and debug
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid nested pipe() calls where one pipe is used as an argument to another pipe.',
    },
    messages: {
      noNestedPipes:
        'Nested pipe() calls are forbidden. Extract the inner pipe to a separate named function or use sequential pipe calls.',
    },
    schema: [],
  },

  create(context) {
    const checkForNestedPipes = (node) => {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'Identifier' ||
        node.callee.name !== 'pipe'
      ) {
        return;
      }

      const seen = new WeakSet();

      const findNestedPipe = (n, stopAtFunctionBoundary = false) => {
        if (!n || typeof n !== 'object' || seen.has(n)) {
          return null;
        }
        seen.add(n);

        // Stop at function boundaries to avoid flagging pipes in callbacks
        if (
          stopAtFunctionBoundary &&
          (n.type === 'ArrowFunctionExpression' ||
            n.type === 'FunctionExpression' ||
            n.type === 'FunctionDeclaration')
        ) {
          return null;
        }

        if (
          n.type === 'CallExpression' &&
          n.callee.type === 'Identifier' &&
          n.callee.name === 'pipe'
        ) {
          return n;
        }

        for (const key in n) {
          if (key === 'parent') continue;
          if (n[key] && typeof n[key] === 'object') {
            if (Array.isArray(n[key])) {
              for (const item of n[key]) {
                const result = findNestedPipe(item, true);
                if (result) return result;
              }
            } else if (n[key].type) {
              const result = findNestedPipe(n[key], true);
              if (result) return result;
            }
          }
        }
        return null;
      };

      // Check all arguments of this pipe call for nested pipes
      for (const arg of node.arguments) {
        const nestedPipe = findNestedPipe(arg, true);
        if (nestedPipe) {
          context.report({
            node: nestedPipe,
            messageId: 'noNestedPipes',
          });
        }
      }
    };

    return {
      CallExpression: checkForNestedPipes,
    };
  },
};
