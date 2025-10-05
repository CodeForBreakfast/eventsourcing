/**
 * Forbid direct _tag property access
 * Use Effect's type guards or Match functions instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Forbid direct _tag access. Use Effect's type guards instead: Either.isLeft/isRight, Option.isSome/isNone, Exit.isSuccess/isFailure, or match() functions.",
    },
    messages: {
      noDirectTagAccess:
        "Direct _tag access is forbidden. Use Effect's type guards instead: Either.isLeft/isRight, Option.isSome/isNone, Exit.isSuccess/isFailure, or match() functions.",
    },
    schema: [],
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (
          !node.computed &&
          node.property.type === 'Identifier' &&
          node.property.name === '_tag'
        ) {
          context.report({
            node,
            messageId: 'noDirectTagAccess',
          });
        }
      },
    };
  },
};
