/**
 * Custom ESLint rule to detect unnecessary pipe wrappers
 * Flags: (x) => pipe(x, fn) - where parameter matches first pipe argument
 * Allows: (x) => pipe(SomeIdentifier, fn) - where parameter differs from first argument
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Unnecessary function wrapper around single pipe operation. This function just passes a parameter through pipe() and could be simplified or inlined.',
    },
    messages: {
      unnecessaryWrapper:
        'Unnecessary function wrapper around single pipe operation. This function just passes a parameter through pipe() and could be simplified or inlined. Example: (x) => pipe(x, fn) is redundant - just use fn directly.',
    },
    schema: [],
  },

  create(context) {
    return {
      // Check arrow functions: (param) => pipe(param, fn)
      'ArrowFunctionExpression > CallExpression.body'(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'pipe' &&
          node.arguments.length === 2 &&
          node.arguments[0].type === 'Identifier'
        ) {
          const parent = node.parent;
          if (parent.params.length === 1 && parent.params[0].type === 'Identifier') {
            // Compare parameter name with first pipe argument name
            if (parent.params[0].name === node.arguments[0].name) {
              context.report({
                node,
                messageId: 'unnecessaryWrapper',
              });
            }
          }
        }
      },

      // Check function declarations: function foo(param) { return pipe(param, fn); }
      'FunctionDeclaration > BlockStatement > ReturnStatement > CallExpression.argument'(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'pipe' &&
          node.arguments.length === 2 &&
          node.arguments[0].type === 'Identifier'
        ) {
          const funcDecl = node.parent.parent.parent;
          if (funcDecl.params.length === 1 && funcDecl.params[0].type === 'Identifier') {
            if (funcDecl.params[0].name === node.arguments[0].name) {
              context.report({
                node,
                messageId: 'unnecessaryWrapper',
              });
            }
          }
        }
      },

      // Check function expressions: const foo = function(param) { return pipe(param, fn); }
      'FunctionExpression > BlockStatement > ReturnStatement > CallExpression.argument'(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'pipe' &&
          node.arguments.length === 2 &&
          node.arguments[0].type === 'Identifier'
        ) {
          const funcExpr = node.parent.parent.parent;
          if (funcExpr.params.length === 1 && funcExpr.params[0].type === 'Identifier') {
            if (funcExpr.params[0].name === node.arguments[0].name) {
              context.report({
                node,
                messageId: 'unnecessaryWrapper',
              });
            }
          }
        }
      },
    };
  },
};
