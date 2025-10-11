const SUPPORTED_TYPES = ['Effect'];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer .asSomeError over .mapError(Option.some) for wrapping errors in Option.some',
      recommended: true,
    },
    messages: {
      preferAsSomeError:
        'Use {{effectType}}.asSomeError instead of {{effectType}}.mapError(Option.some). This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const isMapErrorCall = (node) => {
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'mapError' &&
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
        const mapErrorInfo = isMapErrorCall(node);
        if (!mapErrorInfo) return;

        const mapErrorArg = node.arguments[0];
        if (!mapErrorArg) return;

        if (isOptionSome(mapErrorArg)) {
          const effectType = mapErrorInfo.type;

          context.report({
            node,
            messageId: 'preferAsSomeError',
            data: { effectType },
            fix(fixer) {
              return [
                fixer.replaceText(node.callee.property, 'asSomeError'),
                fixer.remove(mapErrorArg),
              ];
            },
          });
        }
      },
    };
  },
};
