/**
 * Custom ESLint rule to detect Match.value used on boolean expressions in pipe
 * Suggests: Use Effect.if for boolean branching instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Effect.if over Match.value for boolean conditional branching. Match.value with boolean expressions leads to Match.when(true/false) which is less semantic than Effect.if.',
    },
    messages: {
      useEffectIf:
        'Use Effect.if instead of piping boolean to Match.value. Pattern: Effect.if(condition, { onTrue: () => effect, onFalse: () => effect }). Match.value should be used for pattern matching on multiple values, not booleans.',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode;

    const isMatchValueIdentifier = (node) => {
      return (
        node &&
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'Match' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'value'
      );
    };

    const hasExplicitBooleanType = (identifier, sourceCode) => {
      // Find the variable/parameter declaration for this identifier
      const scope = sourceCode.getScope(identifier);
      let currentScope = scope;

      while (currentScope) {
        const variable = currentScope.variables.find((v) => v.name === identifier.name);

        if (variable && variable.defs.length > 0) {
          const def = variable.defs[0];

          // Check parameter with type annotation
          if (def.type === 'Parameter' && def.node.typeAnnotation) {
            const typeAnnotation = def.node.typeAnnotation.typeAnnotation;
            if (typeAnnotation && typeAnnotation.type === 'TSBooleanKeyword') {
              return true;
            }
          }

          // Check variable declaration with type annotation
          if (def.type === 'Variable' && def.node.typeAnnotation) {
            const typeAnnotation = def.node.typeAnnotation.typeAnnotation;
            if (typeAnnotation && typeAnnotation.type === 'TSBooleanKeyword') {
              return true;
            }
          }

          return false;
        }

        currentScope = currentScope.upper;
      }

      return false;
    };

    const isBooleanExpression = (node, sourceCode) => {
      if (!node) return false;

      // Check if identifier has explicit boolean type annotation
      if (node.type === 'Identifier' && hasExplicitBooleanType(node, sourceCode)) {
        return true;
      }

      // Binary comparisons that return boolean
      if (node.type === 'BinaryExpression') {
        const booleanOps = ['===', '!==', '==', '!=', '<', '>', '<=', '>='];
        return booleanOps.includes(node.operator);
      }

      // Logical operators
      if (node.type === 'LogicalExpression') {
        return true;
      }

      // Unary not operator
      if (node.type === 'UnaryExpression' && node.operator === '!') {
        return true;
      }

      return false;
    };

    const isPipeCall = (node) => {
      return (
        node &&
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'pipe'
      );
    };

    const isMatchValueCall = (node) => {
      return (
        node &&
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Match' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'value'
      );
    };

    return {
      CallExpression(node) {
        // Check for pipe(booleanExpression, Match.value, ...)
        if (isPipeCall(node) && node.arguments.length >= 2) {
          const firstArg = node.arguments[0];
          const secondArg = node.arguments[1];

          if (isBooleanExpression(firstArg, sourceCode) && isMatchValueIdentifier(secondArg)) {
            context.report({
              node: secondArg,
              messageId: 'useEffectIf',
            });
          }
        }

        // Check for Match.value(booleanExpression)
        if (isMatchValueCall(node) && node.arguments.length >= 1) {
          const firstArg = node.arguments[0];

          if (isBooleanExpression(firstArg, sourceCode)) {
            context.report({
              node,
              messageId: 'useEffectIf',
            });
          }
        }
      },
    };
  },
};
