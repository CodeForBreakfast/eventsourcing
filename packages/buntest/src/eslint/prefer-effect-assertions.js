/**
 * Forbid wrapping expect() calls in Effect.sync()
 * Use Effect-native assertions like expectSome, assertEqual, etc.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid wrapping expect() calls in Effect.sync(). Use Effect-native assertions like expectSome, assertEqual, expectLeft, etc. from @codeforbreakfast/buntest instead.',
      recommended: true,
    },
    messages: {
      preferEffectAssertions:
        'Do not wrap expect() in Effect.sync(). Use Effect-native assertions instead: expectSome for Options, expectLeft/expectRight for Either, assertEqual for value comparisons, or expectTrue/expectFalse for booleans.',
    },
    schema: [],
  },

  create(context) {
    const isEffectSync = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Effect' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'sync'
      );
    };

    const hasExpectCall = (node) => {
      if (!node) return false;

      if (node.type === 'CallExpression' && node.callee.name === 'expect') {
        return true;
      }

      if (node.type === 'BlockStatement') {
        return node.body.some((statement) => {
          if (statement.type === 'ExpressionStatement') {
            return hasExpectCall(statement.expression);
          }
          return false;
        });
      }

      if (node.type === 'MemberExpression') {
        return hasExpectCall(node.object);
      }

      if (node.type === 'CallExpression') {
        return hasExpectCall(node.callee);
      }

      return false;
    };

    return {
      CallExpression(node) {
        if (!isEffectSync(node)) return;

        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ArrowFunctionExpression') return;

        if (hasExpectCall(arg.body)) {
          context.report({
            node,
            messageId: 'preferEffectAssertions',
          });
        }
      },
    };
  },
};
