export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid classes except Effect service tags, error classes, and Schema classes',
    },
    messages: {
      noClasses:
        'Classes are forbidden in functional programming. Only Effect service tags (extending Context.Tag, Effect.Tag, or Context.GenericTag), error classes (extending Data.TaggedError), and Schema classes (extending Schema.Class) are allowed.',
    },
    schema: [],
  },

  create(context) {
    return {
      ClassDeclaration(node) {
        const superClass = node.superClass;

        // Check for allowed patterns:
        // 1. MemberExpression: extends Data.TaggedError, Schema.Class
        // 2. CallExpression: extends Context.Tag(...), Effect.Tag(...), Data.TaggedError(...), Schema.Class(...)
        if (superClass) {
          // Pattern: extends Data.TaggedError or Schema.Class (direct member expression)
          if (superClass.type === 'MemberExpression') {
            const object = superClass.object?.name;
            const property = superClass.property?.name;

            const allowedMemberExpressions = [
              { object: 'Data', property: 'TaggedError' },
              { object: 'Schema', property: 'Class' },
            ];

            const isAllowed = allowedMemberExpressions.some(
              (allowed) => object === allowed.object && property === allowed.property
            );

            if (isAllowed) {
              return;
            }
          }

          // Pattern: extends Context.Tag(...), Effect.Tag(...), Data.TaggedError(...), Schema.Class(...)
          // Can be: Context.Tag(...)() or Context.Tag(...)<T>()
          if (superClass.type === 'CallExpression') {
            let callee = superClass.callee;

            const allowedCallExpressions = [
              { object: 'Context', property: 'Tag' },
              { object: 'Effect', property: 'Tag' },
              { object: 'Context', property: 'GenericTag' },
              { object: 'Data', property: 'TaggedError' },
              { object: 'Schema', property: 'Class' },
            ];

            // Handle generic instantiation: Context.Tag(...)<T>()
            // The callee might be a CallExpression with type parameters
            if (callee.type === 'CallExpression' && callee.callee?.type === 'MemberExpression') {
              const object = callee.callee.object?.name;
              const property = callee.callee.property?.name;

              const isAllowed = allowedCallExpressions.some(
                (allowed) => object === allowed.object && property === allowed.property
              );

              if (isAllowed) {
                return;
              }
            }

            // Handle direct call: Context.Tag()(...)  or Data.TaggedError('...')<T>
            if (callee.type === 'MemberExpression') {
              const object = callee.object?.name;
              const property = callee.property?.name;

              const isAllowed = allowedCallExpressions.some(
                (allowed) => object === allowed.object && property === allowed.property
              );

              if (isAllowed) {
                return;
              }
            }
          }
        }

        context.report({
          node,
          messageId: 'noClasses',
        });
      },
    };
  },
};
