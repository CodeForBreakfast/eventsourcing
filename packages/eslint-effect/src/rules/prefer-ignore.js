const SUPPORTED_TYPES = ['Effect', 'STM'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer .ignore over .match with constVoid handlers',
      recommended: true,
    },
    messages: {
      preferIgnore:
        'Use {{effectType}}.ignore instead of {{effectType}}.match with void-returning handlers. This is more concise and clearly expresses intent to discard both success and error values.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isMatchCall = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'match' &&
        node.callee.object.type === 'Identifier' &&
        SUPPORTED_TYPES.includes(node.callee.object.name)
      );
    };

    const isVoidReturningFunction = (node) => {
      if (!node) return false;

      // Check for constVoid identifier
      if (node.type === 'Identifier' && node.name === 'constVoid') {
        return true;
      }

      // Check for arrow function
      if (node.type === 'ArrowFunctionExpression') {
        const body = node.body;

        // Check for () => undefined or (_) => undefined
        if (body.type === 'Identifier' && body.name === 'undefined') {
          return true;
        }

        // Check for () => void 0 or (_) => void 0 (UnaryExpression with void operator)
        if (
          body.type === 'UnaryExpression' &&
          body.operator === 'void' &&
          body.argument.type === 'Literal' &&
          body.argument.value === 0
        ) {
          return true;
        }

        // Check for () => {} (empty block)
        if (body.type === 'BlockStatement' && body.body.length === 0) {
          return true;
        }
      }

      return false;
    };

    return {
      CallExpression(node) {
        if (!isMatchCall(node)) return;

        const matchArg = node.arguments[0];
        if (!matchArg || matchArg.type !== 'ObjectExpression') return;

        // Find onFailure and onSuccess properties
        let onFailure = null;
        let onSuccess = null;

        for (const prop of matchArg.properties) {
          if (prop.type === 'Property' && prop.key.type === 'Identifier') {
            if (prop.key.name === 'onFailure') {
              onFailure = prop.value;
            } else if (prop.key.name === 'onSuccess') {
              onSuccess = prop.value;
            }
          }
        }

        // Both must be present and void-returning
        if (
          !onFailure ||
          !onSuccess ||
          !isVoidReturningFunction(onFailure) ||
          !isVoidReturningFunction(onSuccess)
        ) {
          return;
        }

        const effectType = node.callee.object.name;

        context.report({
          node,
          messageId: 'preferIgnore',
          data: { effectType },
          fix(fixer) {
            const fixes = [fixer.replaceText(node.callee.property, 'ignore')];

            // Remove the entire argument including parentheses
            if (node.arguments.length > 0) {
              // Find the opening paren of the call
              const openParen = sourceCode.getFirstTokenBetween(
                node.callee,
                matchArg,
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
