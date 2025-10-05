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
        const hasAllowedExtension = node.body.body.some((member) => {
          if (member.type === 'MethodDefinition' && member.kind === 'constructor') {
            return member.value.body.body.some((statement) => {
              if (
                statement.type === 'ExpressionStatement' &&
                statement.expression.type === 'CallExpression' &&
                statement.expression.callee.type === 'Super'
              ) {
                return true;
              }
              return false;
            });
          }
          return false;
        });

        const superClass = node.superClass;
        if (superClass && superClass.type === 'MemberExpression') {
          const object = superClass.object?.name;
          const property = superClass.property?.name;

          const allowedClasses = [
            { object: 'Data', property: 'TaggedError' },
            { object: 'Context', property: 'Tag' },
            { object: 'Effect', property: 'Tag' },
            { object: 'Context', property: 'GenericTag' },
            { object: 'Schema', property: 'Class' },
          ];

          const isAllowed = allowedClasses.some(
            (allowed) => object === allowed.object && property === allowed.property
          );

          if (isAllowed) {
            return;
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
