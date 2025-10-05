/**
 * Custom ESLint rule to discourage type assertions in Effect callbacks
 * Flags: Effect.flatMap((x) => handler(x as SomeType))
 * Suggests: Use Schema.decodeUnknown for runtime validation instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage type assertions in Effect callbacks. Use Schema.decodeUnknown for runtime type validation instead of unsafe type assertions.',
    },
    messages: {
      useSchemaValidation:
        'Avoid type assertions in Effect callbacks. Use Schema.decodeUnknown to validate data at runtime instead of unsafe "as" casts',
    },
    schema: [],
  },

  create(context) {
    const EFFECT_METHODS = new Set([
      'flatMap',
      'map',
      'tap',
      'tapError',
      'filterOrFail',
      'filterOrElse',
      'andThen',
    ]);

    const isEffectMethodCall = (node) => {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        EFFECT_METHODS.has(node.callee.property.name)
      );
    };

    const isFunctionLike = (node) => {
      return (
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration'
      );
    };

    const isInsideEffectCallback = (node) => {
      let current = node.parent;

      // Walk up the AST to find if we're inside an Effect callback
      while (current) {
        // If we hit a function boundary, check if it's an Effect callback
        if (isFunctionLike(current)) {
          const parent = current.parent;
          // Check if this function is a callback to an Effect method
          if (parent && parent.type === 'CallExpression') {
            if (isEffectMethodCall(parent)) {
              return true;
            }
          }
          // Stop searching once we hit a function that's not an Effect callback
          return false;
        }
        current = current.parent;
      }
      return false;
    };

    return {
      TSAsExpression(node) {
        if (isInsideEffectCallback(node)) {
          context.report({
            node,
            messageId: 'useSchemaValidation',
          });
        }
      },
    };
  },
};
