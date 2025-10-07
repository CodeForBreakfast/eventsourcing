/**
 * Detect eta-expansion (unnecessary function wrappers)
 * Flags: (x) => fn(x), (a, b) => fn(a, b), etc.
 * These can be simplified to just: fn
 *
 * This is also known as "eta reduction" in functional programming.
 * The term comes from lambda calculus: λx.f(x) can be reduced to just f
 * when x doesn't appear elsewhere in the expression.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect unnecessary function wrappers (eta-expansion). A function that only passes its parameters directly to another function can be replaced with that function. Example: (x) => fn(x) should be just fn.',
    },
    messages: {
      etaExpansion:
        'Unnecessary function wrapper (eta-expansion). This function only passes parameters directly to {{callee}}. Replace with {{callee}} directly for point-free style.',
    },
    schema: [],
  },

  create(context) {
    const checkParametersMatch = (params, args) => {
      if (params.length !== args.length) return false;

      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const arg = args[i];

        // Parameter must be identifier
        if (param.type !== 'Identifier') return false;

        // Argument must be identifier with same name
        if (arg.type !== 'Identifier' || arg.name !== param.name) return false;
      }

      return true;
    };

    const getCalleeName = (callee) => {
      if (callee.type === 'Identifier') {
        return callee.name;
      }
      if (callee.type === 'MemberExpression') {
        const object = callee.object.type === 'Identifier' ? callee.object.name : '...';
        const property = callee.property.type === 'Identifier' ? callee.property.name : '...';
        return `${object}.${property}`;
      }
      return 'the function';
    };

    return {
      // Arrow functions: (x) => fn(x)
      ArrowFunctionExpression(node) {
        // Body must be a call expression
        if (node.body.type !== 'CallExpression') return;

        const callExpr = node.body;

        // Check if parameters match arguments exactly
        if (checkParametersMatch(node.params, callExpr.arguments)) {
          const calleeName = getCalleeName(callExpr.callee);

          context.report({
            node,
            messageId: 'etaExpansion',
            data: {
              callee: calleeName,
            },
          });
        }
      },

      // Function declarations: function foo(x) { return fn(x); }
      FunctionDeclaration(node) {
        // Must have a block body with single return statement
        if (
          !node.body ||
          node.body.type !== 'BlockStatement' ||
          node.body.body.length !== 1 ||
          node.body.body[0].type !== 'ReturnStatement'
        ) {
          return;
        }

        const returnStmt = node.body.body[0];

        // Return value must be a call expression
        if (!returnStmt.argument || returnStmt.argument.type !== 'CallExpression') return;

        const callExpr = returnStmt.argument;

        // Check if parameters match arguments exactly
        if (checkParametersMatch(node.params, callExpr.arguments)) {
          const calleeName = getCalleeName(callExpr.callee);

          context.report({
            node,
            messageId: 'etaExpansion',
            data: {
              callee: calleeName,
            },
          });
        }
      },

      // Function expressions: const foo = function(x) { return fn(x); }
      'VariableDeclarator > FunctionExpression'(node) {
        // Must have a block body with single return statement
        if (
          !node.body ||
          node.body.type !== 'BlockStatement' ||
          node.body.body.length !== 1 ||
          node.body.body[0].type !== 'ReturnStatement'
        ) {
          return;
        }

        const returnStmt = node.body.body[0];

        // Return value must be a call expression
        if (!returnStmt.argument || returnStmt.argument.type !== 'CallExpression') return;

        const callExpr = returnStmt.argument;

        // Check if parameters match arguments exactly
        if (checkParametersMatch(node.params, callExpr.arguments)) {
          const calleeName = getCalleeName(callExpr.callee);

          context.report({
            node,
            messageId: 'etaExpansion',
            data: {
              callee: calleeName,
            },
          });
        }
      },
    };
  },
};
