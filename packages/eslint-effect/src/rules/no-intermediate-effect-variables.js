/**
 * Forbid storing Effect/Stream/etc results in intermediate variables
 * Encourages composing everything into a single pipe chain
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid storing Effect/Stream/PubSub/etc results in intermediate variables. Compose everything into a single pipe chain instead.',
    },
    messages: {
      noIntermediateVariable:
        'Variable "{{varName}}" stores an Effect-like value but is then used as an argument to another function. Compose everything into a single pipe() chain instead.',
    },
    schema: [],
  },

  create(context) {
    const EFFECT_MODULES = new Set([
      'Effect',
      'Stream',
      'PubSub',
      'Queue',
      'Ref',
      'Deferred',
      'Fiber',
      'FiberRef',
      'FiberSet',
      'FiberMap',
      'Layer',
      'Pool',
      'Semaphore',
      'Schedule',
      'Scope',
      'STM',
      'TRef',
      'TQueue',
      'TPriorityQueue',
      'TSet',
      'TMap',
      'TArray',
      'TSemaphore',
      'TReentrantLock',
      'Sink',
      'Channel',
      'GroupBy',
      'KeyedPool',
      'Mailbox',
      'Metric',
      'Resource',
      'ResourcePool',
      'Runtime',
      'RcRef',
      'RcMap',
      'RcSet',
      'SubscriptionRef',
    ]);

    const trackedVariables = new Map();

    const isEffectModuleCall = (node) => {
      if (node.type !== 'CallExpression') {
        return false;
      }

      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        EFFECT_MODULES.has(node.callee.object.name)
      ) {
        return true;
      }

      if (node.callee.type === 'Identifier' && node.callee.name === 'pipe') {
        return true;
      }

      return false;
    };

    return {
      VariableDeclarator(node) {
        if (node.init && isEffectModuleCall(node.init)) {
          if (node.id.type === 'Identifier') {
            trackedVariables.set(node.id.name, {
              node: node.id,
              declarator: node,
            });
          }
        }
      },

      CallExpression(node) {
        for (const arg of node.arguments) {
          if (arg.type === 'Identifier' && trackedVariables.has(arg.name)) {
            const tracked = trackedVariables.get(arg.name);
            context.report({
              node: arg,
              messageId: 'noIntermediateVariable',
              data: {
                varName: arg.name,
              },
            });
          }
        }
      },

      'Program:exit': () => {
        trackedVariables.clear();
      },
    };
  },
};
