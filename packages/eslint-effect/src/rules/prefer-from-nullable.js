export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Option.fromNullable(value) over value != null ? some(value) : none()',
      recommended: true,
    },
    messages: {
      preferFromNullable:
        'Use Option.fromNullable({{value}}) instead of the ternary expression. This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isOptionSomeCall = (node) => {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Option' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'some' &&
        node.arguments.length === 1
      );
    };

    const isOptionNoneCall = (node) => {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Option' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'none' &&
        node.arguments.length === 0
      );
    };

    const isNullCheck = (node, testValue) => {
      if (!node || !testValue) return false;

      if (
        node.type === 'BinaryExpression' &&
        (node.operator === '!=' ||
          node.operator === '!==' ||
          node.operator === '==' ||
          node.operator === '===')
      ) {
        const isNullOrUndefined =
          (node.right.type === 'Literal' && node.right.value === null) ||
          (node.right.type === 'Identifier' && node.right.name === 'undefined');

        if (!isNullOrUndefined) return false;

        const leftText = sourceCode.getText(node.left);
        const testText = sourceCode.getText(testValue);

        return leftText === testText;
      }

      return false;
    };

    return {
      ConditionalExpression(node) {
        const { test, consequent, alternate } = node;

        if (
          test.type !== 'BinaryExpression' ||
          !['!=', '!==', '==', '==='].includes(test.operator)
        ) {
          return;
        }

        const isNullOrUndefinedLiteral =
          (test.right.type === 'Literal' && test.right.value === null) ||
          (test.right.type === 'Identifier' && test.right.name === 'undefined');

        if (!isNullOrUndefinedLiteral) {
          return;
        }

        const isNotNull = test.operator === '!=' || test.operator === '!==';
        const someCall = isNotNull ? consequent : alternate;
        const noneCall = isNotNull ? alternate : consequent;

        if (!isOptionSomeCall(someCall) || !isOptionNoneCall(noneCall)) {
          return;
        }

        const someArg = someCall.arguments[0];
        const testValue = test.left;

        const someArgText = sourceCode.getText(someArg);
        const testValueText = sourceCode.getText(testValue);

        if (someArgText !== testValueText) {
          return;
        }

        context.report({
          node,
          messageId: 'preferFromNullable',
          data: { value: testValueText },
          fix(fixer) {
            return fixer.replaceText(node, `Option.fromNullable(${testValueText})`);
          },
        });
      },
    };
  },
};
