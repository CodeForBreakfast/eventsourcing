/**
 * Forbid switch statements on _tag discriminator
 * Use Effect's match() functions instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Forbid switch on _tag. Use Effect's match() functions instead: Either.match, Option.match, Exit.match, or Data.TaggedEnum.match.",
    },
    messages: {
      noSwitchOnTag:
        "switch on _tag is forbidden. Use Effect's match() functions instead: Either.match, Option.match, Exit.match, or Data.TaggedEnum.match.",
    },
    schema: [],
  },

  create(context) {
    return {
      SwitchStatement(node) {
        const discriminant = node.discriminant;
        if (
          discriminant.type === 'MemberExpression' &&
          discriminant.property.type === 'Identifier' &&
          discriminant.property.name === '_tag'
        ) {
          context.report({
            node,
            messageId: 'noSwitchOnTag',
          });
        }
      },
    };
  },
};
