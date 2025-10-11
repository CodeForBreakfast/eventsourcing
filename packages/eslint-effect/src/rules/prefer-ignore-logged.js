const SUPPORTED_TYPES = ['Effect'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer .ignoreLogged over .matchCauseEffect with logging onFailure and void onSuccess',
      recommended: true,
    },
    messages: {
      preferIgnoreLogged:
        'Use {{effectType}}.ignoreLogged instead of {{effectType}}.matchCauseEffect with logging handler. This is more concise and clearly expresses intent to ignore errors while logging them.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isMatchCauseEffectCall = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'matchCauseEffect' &&
        node.callee.object.type === 'Identifier' &&
        SUPPORTED_TYPES.includes(node.callee.object.name)
      );
    };

    const isVoidEffect = (node) => {
      if (!node) return false;

      // Check for Effect.void or core.void
      if (
        node.type === 'MemberExpression' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'void' &&
        node.object.type === 'Identifier' &&
        (node.object.name === 'Effect' || node.object.name === 'core')
      ) {
        return true;
      }

      // Check for arrow function returning void
      if (node.type === 'ArrowFunctionExpression') {
        const body = node.body;

        // Check for () => undefined or (_) => undefined
        if (body.type === 'Identifier' && body.name === 'undefined') {
          return true;
        }

        // Check for () => void 0
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

    const isLogDebugCall = (node) => {
      if (!node) return false;

      // Check for direct call to logDebug (with or without second argument)
      if (node.type === 'CallExpression') {
        const callee = node.callee;

        // Check for Effect.logDebug(...) or just logDebug(...)
        if (
          (callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'logDebug' &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'Effect') ||
          (callee.type === 'Identifier' && callee.name === 'logDebug')
        ) {
          return true;
        }
      }

      // Check for arrow function that calls logDebug
      if (node.type === 'ArrowFunctionExpression') {
        const body = node.body;

        // Check for (cause) => Effect.logDebug(cause) or similar
        if (body.type === 'CallExpression') {
          return isLogDebugCall(body);
        }

        // Check for block statement with single return or expression statement
        if (body.type === 'BlockStatement') {
          if (body.body.length === 1) {
            const stmt = body.body[0];
            if (stmt.type === 'ReturnStatement' && stmt.argument) {
              return isLogDebugCall(stmt.argument);
            }
            if (stmt.type === 'ExpressionStatement') {
              return isLogDebugCall(stmt.expression);
            }
          }
        }
      }

      return false;
    };

    return {
      CallExpression(node) {
        if (!isMatchCauseEffectCall(node)) return;

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

        // onFailure must call logDebug and onSuccess must return void
        if (!onFailure || !onSuccess || !isLogDebugCall(onFailure) || !isVoidEffect(onSuccess)) {
          return;
        }

        const effectType = node.callee.object.name;

        context.report({
          node,
          messageId: 'preferIgnoreLogged',
          data: { effectType },
          fix(fixer) {
            const fixes = [fixer.replaceText(node.callee.property, 'ignoreLogged')];

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
