/**
 * Forbid Effect.runPromise() in test files
 * Tests should use it.effect() from @codeforbreakfast/buntest
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid Effect.runPromise() in test files. Use it.effect() from @codeforbreakfast/buntest instead.',
    },
    messages: {
      noRunPromiseInTests:
        'Use it.effect() from @codeforbreakfast/buntest instead of Effect.runPromise() in tests.',
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
          node.callee.property.name === 'runPromise'
        ) {
          context.report({
            node,
            messageId: 'noRunPromiseInTests',
          });
        }
      },
    };
  },
};
