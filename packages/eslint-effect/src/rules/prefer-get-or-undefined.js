import { createMethodCallChecker, isUndefinedReturn } from './utils.js';

const isGetOrElseCall = createMethodCallChecker('getOrElse', ['Option']);

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer getOrUndefined over getOrElse(() => undefined)',
      recommended: true,
    },
    messages: {
      preferGetOrUndefined:
        'Use Option.getOrUndefined instead of Option.getOrElse(() => undefined). This is more concise and clearly expresses intent.',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (!isGetOrElseCall(node)) return;

        const arg = node.arguments[0];
        if (!arg || arg.type !== 'ArrowFunctionExpression') {
          return;
        }

        if (!isUndefinedReturn(arg)) return;

        context.report({
          node,
          messageId: 'preferGetOrUndefined',
          fix(fixer) {
            return [fixer.replaceText(node.callee.property, 'getOrUndefined'), fixer.remove(arg)];
          },
        });
      },
    };
  },
};
