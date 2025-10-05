/**
 * Forbid multiple pipe() calls in the same function
 * Extract additional pipes to separate named functions
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid multiple pipe() calls in a function. Extract additional pipes to separate named functions.',
    },
    messages: {
      noMultiplePipes:
        'Multiple pipe() calls in a function are forbidden. Extract additional pipes to separate named functions.',
    },
    schema: [],
  },

  create(context) {
    const findPipeCalls = (node) => {
      const pipes = [];
      const seen = new WeakSet();

      const traverse = (n) => {
        if (!n || typeof n !== 'object' || seen.has(n)) {
          return;
        }
        seen.add(n);

        // Stop traversing if we hit a function boundary (arrow, function expression, or function declaration)
        // This prevents counting pipes in extracted functions that are called from this function
        if (
          n !== node &&
          (n.type === 'ArrowFunctionExpression' ||
            n.type === 'FunctionExpression' ||
            n.type === 'FunctionDeclaration')
        ) {
          return;
        }

        if (
          n.type === 'CallExpression' &&
          n.callee.type === 'Identifier' &&
          n.callee.name === 'pipe'
        ) {
          pipes.push(n);
        }

        for (const key in n) {
          if (key === 'parent') continue; // Skip parent references
          if (n[key] && typeof n[key] === 'object') {
            if (Array.isArray(n[key])) {
              n[key].forEach(traverse);
            } else if (n[key].type) {
              traverse(n[key]);
            }
          }
        }
      };
      traverse(node);
      return pipes;
    };

    const checkFunction = (node) => {
      const pipes = findPipeCalls(node.body);
      if (pipes.length > 1) {
        pipes.slice(1).forEach((pipe) => {
          context.report({
            node: pipe,
            messageId: 'noMultiplePipes',
          });
        });
      }
    };

    return {
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
    };
  },
};
