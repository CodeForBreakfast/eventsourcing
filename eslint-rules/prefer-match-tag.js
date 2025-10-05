/**
 * Custom ESLint rule to enforce Match.tag over Match.when for _tag matching
 * Flags: Match.when({ _tag: 'Value' }, handler)
 * Suggests: Match.tag('Value', handler)
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using Match.tag() instead of Match.when() when matching on _tag discriminator. Match.tag provides better type safety and clearer intent.',
    },
    messages: {
      preferMatchTag:
        'Use Match.tag() instead of Match.when() for _tag matching. Match.when({ _tag: "{{tagValue}}" }, ...) should be Match.tag("{{tagValue}}", ...).',
    },
    schema: [],
    fixable: 'code',
  },

  create(context) {
    return {
      CallExpression(node) {
        // Check for Match.when calls
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Match' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'when' &&
          node.arguments.length >= 1
        ) {
          const firstArg = node.arguments[0];

          // Check if first argument is an object literal with _tag property
          if (firstArg.type === 'ObjectExpression' && firstArg.properties.length === 1) {
            const prop = firstArg.properties[0];

            if (
              prop.type === 'Property' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === '_tag' &&
              prop.value.type === 'Literal' &&
              typeof prop.value.value === 'string'
            ) {
              const tagValue = prop.value.value;

              context.report({
                node,
                messageId: 'preferMatchTag',
                data: {
                  tagValue,
                },
                fix(fixer) {
                  const sourceCode = context.getSourceCode();
                  const tagString = sourceCode.getText(prop.value);
                  const restArgs = node.arguments.slice(1);
                  const restArgsText = restArgs.map((arg) => sourceCode.getText(arg)).join(', ');

                  return fixer.replaceText(
                    node,
                    `Match.tag(${tagString}${restArgsText ? `, ${restArgsText}` : ''})`
                  );
                },
              });
            }
          }
        }
      },
    };
  },
};
