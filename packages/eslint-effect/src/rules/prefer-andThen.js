const SUPPORTED_TYPES = ['Effect', 'Option', 'Stream', 'STM'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer .andThen() over .flatMap() when discarding the input value',
      recommended: true,
    },
    messages: {
      preferAndThen:
        'Use {{effectType}}.andThen({{value}}) instead of {{effectType}}.flatMap(() => {{value}}). This is more concise and clearly expresses intent.',
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

    const isDiscardingParameter = (arrowFunc) => {
      if (!arrowFunc || arrowFunc.type !== 'ArrowFunctionExpression') {
        return false;
      }

      if (arrowFunc.params.length === 0) {
        return true;
      }

      if (arrowFunc.params.length !== 1) {
        return false;
      }

      const param = arrowFunc.params[0];
      if (param.type !== 'Identifier') {
        return false;
      }

      const paramName = param.name;
      const body = arrowFunc.body;

      const usesParam = sourceCode.getText(body).includes(paramName);
      return !usesParam;
    };

    return {
      CallExpression(node) {
        if (!isFlatMapCall(node)) return;

        const flatMapArg = node.arguments[0];
        if (!flatMapArg || flatMapArg.type !== 'ArrowFunctionExpression') {
          return;
        }

        if (!isDiscardingParameter(flatMapArg)) return;

        const effectType = node.callee.object.name;
        const bodyText = sourceCode.getText(flatMapArg.body);

        context.report({
          node,
          messageId: 'preferAndThen',
          data: { effectType, value: bodyText },
          fix(fixer) {
            return [
              fixer.replaceText(node.callee.property, 'andThen'),
              fixer.replaceText(flatMapArg, bodyText),
            ];
          },
        });
      },
    };
  },
};
