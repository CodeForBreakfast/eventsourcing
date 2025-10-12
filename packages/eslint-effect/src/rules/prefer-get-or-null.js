import { createMethodCallChecker, isNullReturn } from './utils.js';

const isGetOrElseCall = createMethodCallChecker('getOrElse', ['Option']);

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer getOrNull over getOrElse(() => null)',
      recommended: true,
    },
    messages: {
      preferGetOrNull:
        'Use Option.getOrNull instead of Option.getOrElse(() => null). This is more concise and clearly expresses intent.',
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

        if (!isNullReturn(arg)) return;

        context.report({
          node,
          messageId: 'preferGetOrNull',
          fix(fixer) {
            return [fixer.replaceText(node.callee.property, 'getOrNull'), fixer.remove(arg)];
          },
        });
      },
    };
  },
};
