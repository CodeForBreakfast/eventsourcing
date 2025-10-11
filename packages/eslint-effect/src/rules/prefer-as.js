import { isVoidReturn } from './utils.js';

const SUPPORTED_TYPES = [
  'Effect',
  'Option',
  'Stream',
  'Schedule',
  'Channel',
  'STM',
  'Sink',
  'Cause',
];

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer .as(value) over .map(() => value) for returning constant values',
      recommended: true,
    },
    messages: {
      preferAs:
        'Use {{effectType}}.as({{value}}) instead of {{effectType}}.map(() => {{value}}). This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    const isMapCall = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'map' &&
        node.callee.object.type === 'Identifier' &&
        SUPPORTED_TYPES.includes(node.callee.object.name)
      );
    };

    const isConstantReturn = (arrowFunc) => {
      if (arrowFunc.params.length !== 0) {
        return false;
      }

      const body = arrowFunc.body;

      if (body.type === 'UnaryExpression' && body.operator === 'void') {
        return false;
      }
      if (body.type === 'Identifier' && body.name === 'undefined') {
        return false;
      }
      if (body.type === 'BlockStatement' && body.body.length === 0) {
        return false;
      }

      if (body.type === 'BlockStatement') {
        return false;
      }

      return true;
    };

    return {
      CallExpression(node) {
        if (!isMapCall(node)) return;

        const mapArg = node.arguments[0];
        if (!mapArg || mapArg.type !== 'ArrowFunctionExpression') {
          return;
        }

        if (!isConstantReturn(mapArg)) return;

        if (isVoidReturn(mapArg)) {
          return;
        }

        const effectType = node.callee.object.name;
        const valueText = sourceCode.getText(mapArg.body);

        context.report({
          node,
          messageId: 'preferAs',
          data: { effectType, value: valueText },
          fix(fixer) {
            return [
              fixer.replaceText(node.callee.property, 'as'),
              fixer.replaceText(mapArg, valueText),
            ];
          },
        });
      },
    };
  },
};
