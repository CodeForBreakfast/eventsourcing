export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer getOrNull over getOrElse(() => null)',
      recommended: true,
    },
    messages: {
      preferGetOrNull:
        'Use Option.getOrNull instead of Option.getOrElse(() => null). This is more concise and clearly expresses intent.',
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

    const isNullReturn = (arrowFunc) => {
      if (arrowFunc.params.length !== 0) {
        return false;
      }

      const body = arrowFunc.body;

      if (body.type === 'Literal' && body.value === null) {
        return true;
      }

      if (body.type === 'Identifier' && body.name === 'null') {
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

        if (!isNullReturn(arg)) return;

        context.report({
          node,
          messageId: 'preferGetOrNull',
          fix(fixer) {
            return [fixer.replaceText(node.callee.property, 'getOrNull'), fixer.remove(arg)];
          },
        });
      },
    };
  },
};
