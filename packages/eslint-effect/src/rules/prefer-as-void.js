import { isVoidReturn } from './utils.js';

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Effect.asVoid over Effect.map(() => void) or Effect.map(() => undefined)',
      recommended: true,
    },
    messages: {
      preferAsVoid:
        'Use {{effectType}}.asVoid when discarding the result. {{effectType}}.map(() => {{returnValue}}) should be {{effectType}}.asVoid.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const getVoidReturnValue = (arrowFunc) => {
      const body = arrowFunc.body;
      if (!body) return false;

      if (
        body.type === 'UnaryExpression' &&
        body.operator === 'void' &&
        body.argument.type === 'Literal' &&
        body.argument.value === 0
      ) {
        return 'void 0';
      }

      if (body.type === 'Identifier' && body.name === 'undefined') {
        return 'undefined';
      }

      if (body.type === 'BlockStatement' && body.body.length === 0) {
        return '{}';
      }

      return false;
    };

    const isEffectMapCall = (node) => {
      return (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'map' &&
        node.callee.object.type === 'Identifier' &&
        (node.callee.object.name === 'Effect' ||
          node.callee.object.name === 'Option' ||
          node.callee.object.name === 'Stream')
      );
    };

    return {
      CallExpression(node) {
        if (!isEffectMapCall(node)) return;

        const mapArg = node.arguments[0];
        if (!mapArg || mapArg.type !== 'ArrowFunctionExpression' || mapArg.params.length !== 0) {
          return;
        }

        if (!isVoidReturn(mapArg)) return;

        const returnValue = getVoidReturnValue(mapArg);
        const effectType = node.callee.object.name;

        context.report({
          node,
          messageId: 'preferAsVoid',
          data: { returnValue, effectType },
          fix(fixer) {
            return [
              fixer.replaceText(node.callee.property, 'asVoid'),
              fixer.replaceTextRange(
                [node.arguments[0].range[0], node.arguments[node.arguments.length - 1].range[1]],
                ''
              ),
            ];
          },
        });
      },
    };
  },
};
