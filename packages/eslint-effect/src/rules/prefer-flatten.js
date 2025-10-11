const SUPPORTED_TYPES = ['Effect', 'Option', 'Array', 'Cause', 'STM'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer .flatten() over .flatMap(identity) for flattening nested structures',
      recommended: true,
    },
    messages: {
      preferFlatten:
        'Use {{effectType}}.flatten instead of {{effectType}}.flatMap(identity). This is more concise and clearly expresses intent.',
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

    const isIdentityFunction = (arrowFunc) => {
      if (!arrowFunc || arrowFunc.type !== 'ArrowFunctionExpression') {
        return false;
      }

      if (arrowFunc.params.length !== 1) {
        return false;
      }

      const param = arrowFunc.params[0];
      if (param.type !== 'Identifier') {
        return false;
      }

      const body = arrowFunc.body;
      if (body.type === 'Identifier' && body.name === param.name) {
        return true;
      }

      return false;
    };

    const isIdentityFunctionReference = (node) => {
      if (node.type === 'Identifier' && node.name === 'identity') {
        return true;
      }
      // Handle TypeScript generic instantiation: identity<Type>
      if (
        node.type === 'TSInstantiationExpression' &&
        node.expression.type === 'Identifier' &&
        node.expression.name === 'identity'
      ) {
        return true;
      }
      return false;
    };

    return {
      CallExpression(node) {
        if (!isFlatMapCall(node)) return;

        const flatMapArg = node.arguments[0];
        if (!flatMapArg) return;

        const isIdentity =
          isIdentityFunction(flatMapArg) || isIdentityFunctionReference(flatMapArg);

        if (!isIdentity) return;

        const effectType = node.callee.object.name;

        context.report({
          node,
          messageId: 'preferFlatten',
          data: { effectType },
          fix(fixer) {
            const fixes = [fixer.replaceText(node.callee.property, 'flatten')];

            // Remove the entire argument including parentheses
            if (node.arguments.length > 0) {
              // Find the opening paren of the call
              const openParen = sourceCode.getFirstTokenBetween(
                node.callee,
                flatMapArg,
                (token) => token.value === '('
              );
              // Find the closing paren of the call
              const closeParen = sourceCode.getTokenAfter(
                node.arguments[node.arguments.length - 1],
                (token) => token.value === ')'
              );

              if (openParen && closeParen) {
                fixes.push(fixer.removeRange([openParen.range[0], closeParen.range[1]]));
              }
            }

            return fixes;
          },
        });
      },
    };
  },
};
