export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer getOrElse(() => default) over isSome(opt) ? opt.value : default',
      recommended: true,
    },
    messages: {
      preferGetOrElse:
        'Use pipe({{option}}, Option.getOrElse(() => {{defaultValue}})) instead of the ternary expression. This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isOptionIsSomeCall = (node, expectedArg) => {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'MemberExpression' ||
        node.callee.object.type !== 'Identifier' ||
        node.callee.object.name !== 'Option' ||
        node.callee.property.type !== 'Identifier' ||
        node.callee.property.name !== 'isSome' ||
        node.arguments.length !== 1
      ) {
        return false;
      }

      const argText = sourceCode.getText(node.arguments[0]);
      const expectedText = sourceCode.getText(expectedArg);
      return argText === expectedText;
    };

    const isValueAccess = (node, expectedOption) => {
      if (
        node.type !== 'MemberExpression' ||
        node.property.type !== 'Identifier' ||
        node.property.name !== 'value'
      ) {
        return false;
      }

      const objectText = sourceCode.getText(node.object);
      const expectedText = sourceCode.getText(expectedOption);
      return objectText === expectedText;
    };

    return {
      ConditionalExpression(node) {
        const { test, consequent, alternate } = node;

        if (test.type !== 'CallExpression') {
          return;
        }

        if (
          test.callee.type !== 'MemberExpression' ||
          test.callee.object.type !== 'Identifier' ||
          test.callee.object.name !== 'Option' ||
          test.callee.property.type !== 'Identifier' ||
          test.callee.property.name !== 'isSome' ||
          test.arguments.length !== 1
        ) {
          return;
        }

        const optionArg = test.arguments[0];
        const optionText = sourceCode.getText(optionArg);

        if (!isValueAccess(consequent, optionArg)) {
          return;
        }

        context.report({
          node,
          messageId: 'preferGetOrElse',
          data: {
            option: optionText,
            defaultValue: sourceCode.getText(alternate),
          },
          fix(fixer) {
            const defaultText = sourceCode.getText(alternate);
            return fixer.replaceText(
              node,
              `pipe(${optionText}, Option.getOrElse(() => ${defaultText}))`
            );
          },
        });
      },
    };
  },
};
