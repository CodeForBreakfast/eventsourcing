export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid Effect.if with Option.isSome/Option.isNone checks. Use Option.match instead for cleaner, more idiomatic code.',
      recommended: true,
    },
    messages: {
      noEffectIfOptionCheck:
        'Do not use Effect.if with {{checkFunction}}. Use Option.match instead, which can return Effects directly from its branches: pipe(option, Option.match({ onNone: () => Effect.void, onSome: (value) => yourEffect })).',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isEffectIfCall = (node) => {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'if' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Effect'
      );
    };

    const isOptionCheck = (node) => {
      if (!node || node.type !== 'CallExpression') {
        return null;
      }

      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Option'
      ) {
        const methodName = node.callee.property.name;
        if (methodName === 'isSome' || methodName === 'isNone') {
          return `Option.${methodName}`;
        }
      }

      return null;
    };

    return {
      CallExpression(node) {
        if (!isEffectIfCall(node)) return;

        const firstArg = node.arguments[0];
        const checkFunction = isOptionCheck(firstArg);

        if (checkFunction) {
          context.report({
            node,
            messageId: 'noEffectIfOptionCheck',
            data: {
              checkFunction,
            },
          });
        }
      },
    };
  },
};
