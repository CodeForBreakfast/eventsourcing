const SUPPORTED_TYPES = ['Effect', 'Option'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer .zipRight() over .flatMap(() => b) for sequential execution while keeping the second result',
      recommended: true,
    },
    messages: {
      preferZipRight:
        'Use {{effectType}}.zipRight instead of {{effectType}}.flatMap(() => ...). This is more concise and clearly expresses the intent of executing both effects but keeping only the second result.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isFlatMapCall = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'flatMap' &&
        node.callee.object.type === 'Identifier' &&
        SUPPORTED_TYPES.includes(node.callee.object.name)
      );
    };

    const isZipRightPattern = (arrowFunc) => {
      if (!arrowFunc || arrowFunc.type !== 'ArrowFunctionExpression') {
        return null;
      }

      if (arrowFunc.params.length !== 0) {
        return null;
      }

      const body = arrowFunc.body;

      if (body.type === 'BlockStatement') {
        return null;
      }

      return { secondEffect: body };
    };

    return {
      CallExpression(node) {
        if (!isFlatMapCall(node)) return;

        const flatMapArg = node.arguments[0];
        if (!flatMapArg) return;

        const effectType = node.callee.object.name;
        const result = isZipRightPattern(flatMapArg);

        if (!result) return;

        context.report({
          node,
          messageId: 'preferZipRight',
          data: { effectType },
          fix(fixer) {
            const { secondEffect } = result;
            const secondEffectText = sourceCode.getText(secondEffect);

            return [
              fixer.replaceText(node.callee.property, 'zipRight'),
              fixer.replaceText(flatMapArg, secondEffectText),
            ];
          },
        });
      },
    };
  },
};
