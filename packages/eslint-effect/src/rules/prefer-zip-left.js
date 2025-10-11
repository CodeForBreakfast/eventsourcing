const SUPPORTED_TYPES = ['Effect', 'Option'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer .zipLeft() over .flatMap(a => map(b, () => a)) for sequential execution while keeping the first result',
      recommended: true,
    },
    messages: {
      preferZipLeft:
        'Use {{effectType}}.zipLeft instead of {{effectType}}.flatMap(a => {{effectType}}.map(b, () => a)). This is more concise and clearly expresses the intent of executing both effects but keeping only the first result.',
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

    const isZipLeftPattern = (arrowFunc, effectType) => {
      if (!arrowFunc || arrowFunc.type !== 'ArrowFunctionExpression') {
        return null;
      }

      if (arrowFunc.params.length !== 1) {
        return null;
      }

      const param = arrowFunc.params[0];
      if (param.type !== 'Identifier') {
        return null;
      }

      const body = arrowFunc.body;

      if (body.type !== 'CallExpression') {
        return null;
      }

      if (
        body.callee.type !== 'MemberExpression' ||
        body.callee.property.type !== 'Identifier' ||
        body.callee.property.name !== 'map' ||
        body.callee.object.type !== 'Identifier' ||
        body.callee.object.name !== effectType
      ) {
        return null;
      }

      if (body.arguments.length !== 2) {
        return null;
      }

      const [secondEffect, mapFunc] = body.arguments;

      if (mapFunc.type !== 'ArrowFunctionExpression') {
        return null;
      }

      if (mapFunc.params.length !== 0) {
        return null;
      }

      const mapBody = mapFunc.body;
      if (mapBody.type !== 'Identifier' || mapBody.name !== param.name) {
        return null;
      }

      return { secondEffect };
    };

    return {
      CallExpression(node) {
        if (!isFlatMapCall(node)) return;

        const flatMapArg = node.arguments[0];
        if (!flatMapArg) return;

        const effectType = node.callee.object.name;
        const result = isZipLeftPattern(flatMapArg, effectType);

        if (!result) return;

        context.report({
          node,
          messageId: 'preferZipLeft',
          data: { effectType },
          fix(fixer) {
            const { secondEffect } = result;
            const secondEffectText = sourceCode.getText(secondEffect);

            return [
              fixer.replaceText(node.callee.property, 'zipLeft'),
              fixer.replaceText(flatMapArg, secondEffectText),
            ];
          },
        });
      },
    };
  },
};
