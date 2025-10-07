/**
 * Forbid curried function calls to encourage extraction of named, composable functions
 * Works with no-nested-pipe to enforce clean pipe composition
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid curried function calls like foo(a)(b). Extract a named function and use pipe() composition for clean, reusable code.',
    },
    messages: {
      noCurriedCalls:
        'Curried calls like "{{calleeName}}(...)()" create inline complexity. Extract a named function that returns a function, then use it in pipe(). Example: const myFn = (a, b) => (c) => pipe(c, foo(a, b)); then use pipe(data, myFn(a, b))',
    },
    schema: [],
  },

  create(context) {
    const ALLOWED_PATTERNS = new Set([
      'Context.Tag',
      'Context.GenericTag',
      'Effect.Tag',
      'Data.TaggedError',
      'Schema.Class',
    ]);

    const isAllowedPattern = (node) => {
      if (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.property.type === 'Identifier'
      ) {
        const pattern = `${node.object.name}.${node.property.name}`;
        return ALLOWED_PATTERNS.has(pattern);
      }
      return false;
    };

    const getCalleeName = (node) => {
      if (node.type === 'MemberExpression') {
        return `${node.object.name}.${node.property.name}`;
      }
      if (node.type === 'Identifier') {
        return node.name;
      }
      return 'function';
    };

    return {
      CallExpression(node) {
        if (node.callee.type !== 'CallExpression') {
          return;
        }

        const isMemberExpressionCurry =
          node.callee.callee.type === 'MemberExpression' &&
          node.callee.callee.object.type === 'Identifier' &&
          node.callee.callee.property.type === 'Identifier' &&
          !isAllowedPattern(node.callee.callee);

        const isPlainIdentifierCurry = node.callee.callee.type === 'Identifier';

        if (isMemberExpressionCurry || isPlainIdentifierCurry) {
          context.report({
            node,
            messageId: 'noCurriedCalls',
            data: {
              calleeName: getCalleeName(node.callee.callee),
            },
          });
        }
      },
    };
  },
};
