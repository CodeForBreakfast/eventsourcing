/**
 * Forbid curried function calls outside of pipe
 * Use pipe() composition instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid curried function calls. Use pipe() instead. Example: pipe(data, Schema.decodeUnknown(schema)) instead of Schema.decodeUnknown(schema)(data)',
    },
    messages: {
      noCurriedCalls:
        'Curried function calls are forbidden. Use pipe() instead. Example: pipe(data, Schema.decodeUnknown(schema)) instead of Schema.decodeUnknown(schema)(data)',
    },
    schema: [],
  },

  create(context) {
    const ALLOWED_PATTERNS = new Set([
      'Context.Tag',
      'Context.GenericTag',
      'Effect.Tag',
      'Data.TaggedError',
      'Schema.Class',
    ]);

    const isAllowedPattern = (node) => {
      if (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.property.type === 'Identifier'
      ) {
        const pattern = `${node.object.name}.${node.property.name}`;
        return ALLOWED_PATTERNS.has(pattern);
      }
      return false;
    };

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'CallExpression' &&
          node.callee.callee.type === 'MemberExpression' &&
          node.callee.callee.object.type === 'Identifier' &&
          node.callee.callee.property.type === 'Identifier' &&
          !isAllowedPattern(node.callee.callee)
        ) {
          context.report({
            node,
            messageId: 'noCurriedCalls',
          });
        }
      },
    };
  },
};
