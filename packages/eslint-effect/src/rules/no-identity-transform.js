/**
 * Forbid pointless identity functions in transformations
 * Example: Effect.map((x) => x) does nothing
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid identity functions in transformations. Example: Effect.map((x) => x) does nothing. Remove it or replace with the actual transformation needed.',
    },
    messages: {
      noIdentityTransform:
        'Identity function in transformation is pointless. Example: Effect.map((x) => x) does nothing. Remove it or replace with the actual transformation needed.',
    },
    schema: [],
  },

  create(context) {
    const TRANSFORM_METHODS = /^(map|flatMap|filterMap|tap|forEach)$/;

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          TRANSFORM_METHODS.test(node.callee.property.name)
        ) {
          const firstArg = node.arguments[0];
          if (
            firstArg &&
            firstArg.type === 'ArrowFunctionExpression' &&
            firstArg.params.length === 1 &&
            firstArg.params[0].type === 'Identifier' &&
            firstArg.body.type === 'Identifier' &&
            firstArg.params[0].name === firstArg.body.name
          ) {
            context.report({
              node,
              messageId: 'noIdentityTransform',
            });
          }
        }
      },
    };
  },
};
