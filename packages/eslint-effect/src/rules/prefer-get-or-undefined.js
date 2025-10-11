export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer getOrUndefined over getOrElse(() => undefined)',
      recommended: true,
    },
    messages: {
      preferGetOrUndefined:
        'Use Option.getOrUndefined instead of Option.getOrElse(() => undefined). This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isGetOrElseCall = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'getOrElse' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Option'
      );
    };

    const isUndefinedReturn = (arrowFunc) => {
      if (arrowFunc.params.length !== 0) {
        return false;
      }

      const body = arrowFunc.body;

      if (body.type === 'Identifier' && body.name === 'undefined') {
        return true;
      }

      return false;
    };

    return {
      CallExpression(node) {
        if (!isGetOrElseCall(node)) return;

        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ArrowFunctionExpression') {
          return;
        }

        if (!isUndefinedReturn(arg)) return;

        context.report({
          node,
          messageId: 'preferGetOrUndefined',
          fix(fixer) {
            return [fixer.replaceText(node.callee.property, 'getOrUndefined'), fixer.remove(arg)];
          },
        });
      },
    };
  },
};
