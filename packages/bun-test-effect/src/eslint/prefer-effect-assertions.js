/**
 * Forbid wrapping expect() or assert*() calls in Effect.sync()
 * Use Effect-native assertions like expectSome, assertEqual, etc.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid wrapping expect() or assert*() calls in Effect.sync(). Use Effect-native assertions like expectSome, assertEqual, expectLeft, etc. from @codeforbreakfast/bun-test-effect instead.',
      recommended: true,
    },
    messages: {
      preferEffectAssertions:
        'Do not wrap expect() or assert*() in Effect.sync(). Use Effect-native assertions instead: expectSome for Options, expectLeft/expectRight for Either, assertEqual for value comparisons, or expectTrue/expectFalse for booleans.',
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

    const hasExpectOrAssertCall = (node) => {
      if (!node) return false;

      if (node.type === 'CallExpression') {
        if (node.callee.type === 'Identifier') {
          if (node.callee.name === 'expect') {
            return true;
          }
          if (node.callee.name.startsWith('assert')) {
            return true;
          }
        }
      }

      if (node.type === 'BlockStatement') {
        return node.body.some((statement) => {
          if (statement.type === 'ExpressionStatement') {
            return hasExpectOrAssertCall(statement.expression);
          }
          return false;
        });
      }

      if (node.type === 'MemberExpression') {
        return hasExpectOrAssertCall(node.object);
      }

      if (node.type === 'CallExpression') {
        return hasExpectOrAssertCall(node.callee);
      }

      return false;
    };

    return {
      CallExpression(node) {
        if (!isEffectSync(node)) return;

        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ArrowFunctionExpression') return;

        if (hasExpectOrAssertCall(arg.body)) {
          context.report({
            node,
            messageId: 'preferEffectAssertions',
          });
        }
      },
    };
  },
};
