const SUPPORTED_TYPES = ['Effect'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer .asSome over .map(Option.some) for wrapping values in Option.some',
      recommended: true,
    },
    messages: {
      preferAsSome:
        'Use {{effectType}}.asSome instead of {{effectType}}.map(Option.some). This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const isMapCall = (node) => {
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'map' &&
        node.callee.object.type === 'Identifier' &&
        SUPPORTED_TYPES.includes(node.callee.object.name)
      ) {
        return { type: node.callee.object.name, isDataFirst: false };
      }
      return null;
    };

    const isOptionSome = (node) => {
      return (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'Option' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'some'
      );
    };

    return {
      CallExpression(node) {
        const mapInfo = isMapCall(node);
        if (!mapInfo) return;

        const mapArg = node.arguments[0];
        if (!mapArg) return;

        if (isOptionSome(mapArg)) {
          const effectType = mapInfo.type;

          context.report({
            node,
            messageId: 'preferAsSome',
            data: { effectType },
            fix(fixer) {
              return [fixer.replaceText(node.callee.property, 'asSome'), fixer.remove(mapArg)];
            },
          });
        }
      },
    };
  },
};
