import { createMethodCallChecker, isOptionSome } from './utils.js';

const SUPPORTED_TYPES = ['Effect'];
const isMapErrorCall = createMethodCallChecker('mapError', SUPPORTED_TYPES);

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
    return {
      CallExpression(node) {
        if (!isMapErrorCall(node)) return;

        const mapErrorArg = node.arguments[0];
        if (!mapErrorArg) return;

        if (isOptionSome(mapErrorArg)) {
          const effectType = node.callee.object.name;

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
