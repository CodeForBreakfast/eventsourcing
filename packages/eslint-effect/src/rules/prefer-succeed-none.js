export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Effect.succeedNone over Effect.succeed(Option.none())',
      recommended: true,
    },
    messages: {
      preferSucceedNone:
        'Use Effect.succeedNone instead of Effect.succeed(Option.none()). This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const isSucceedCall = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'succeed' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Effect'
      );
    };

    const isOptionNone = (node) => {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Option' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'none'
      ) {
        return true;
      }
      return false;
    };

    return {
      CallExpression(node) {
        if (!isSucceedCall(node)) return;

        const arg = node.arguments[0];
        if (!arg) return;

        if (!isOptionNone(arg)) return;

        context.report({
          node,
          messageId: 'preferSucceedNone',
          fix(fixer) {
            return [fixer.replaceText(node.callee.property, 'succeedNone'), fixer.remove(arg)];
          },
        });
      },
    };
  },
};
