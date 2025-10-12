import { createMethodCallChecker, isOptionSome } from './utils.js';

const SUPPORTED_TYPES = ['Effect'];
const isMapCall = createMethodCallChecker('map', SUPPORTED_TYPES);

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
    return {
      CallExpression(node) {
        if (!isMapCall(node)) return;

        const mapArg = node.arguments[0];
        if (!mapArg) return;

        if (isOptionSome(mapArg)) {
          const effectType = node.callee.object.name;

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
