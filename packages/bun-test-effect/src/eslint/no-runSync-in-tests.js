/**
 * Forbid Effect.runSync() in test files
 * Tests should use it.effect() from @codeforbreakfast/bun-test-effect
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid Effect.runSync() in test files. Use it.effect() from @codeforbreakfast/bun-test-effect instead.',
    },
    messages: {
      noRunSyncInTests:
        'Use it.effect() from @codeforbreakfast/bun-test-effect instead of Effect.runSync() in tests.',
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
            messageId: 'noRunSyncInTests',
          });
        }
      },
    };
  },
};
