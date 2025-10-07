export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage unnecessary function aliases that provide no semantic value. When a constant is assigned directly to another function without adding clarity or abstraction, it should be inlined at the call site.',
    },
    messages: {
      unnecessaryAlias:
        'Unnecessary function alias "{{aliasName}}" for {{originalName}}. This alias is only used {{count}} time(s) and provides no semantic value. Consider inlining {{originalName}} directly at the call site.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxReferences: {
            type: 'integer',
            minimum: 1,
            default: 2,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const maxReferences = context.options[0]?.maxReferences ?? 2;
    const sourceCode = context.getSourceCode();

    const getOriginalName = (node) => {
      if (node.type === 'Identifier') {
        return node.name;
      }
      if (node.type === 'MemberExpression') {
        const object = node.object.type === 'Identifier' ? node.object.name : '...';
        const property = node.property.type === 'Identifier' ? node.property.name : '...';
        return `${object}.${property}`;
      }
      return null;
    };

    const isExported = (node) => {
      const parent = node.parent;
      if (!parent) return false;

      if (parent.type === 'ExportNamedDeclaration') return true;
      if (parent.type === 'ExportDefaultDeclaration') return true;

      return false;
    };

    const countReferences = (scope, variableName) => {
      const variable = scope.variables.find((v) => v.name === variableName);
      if (!variable) return 0;

      return variable.references.filter((ref) => !ref.init).length;
    };

    return {
      VariableDeclarator(node) {
        if (!node.init) return;
        if (node.id.type !== 'Identifier') return;

        const isDirectAlias =
          node.init.type === 'Identifier' || node.init.type === 'MemberExpression';

        if (!isDirectAlias) return;

        if (isExported(node.parent.parent)) return;

        const aliasName = node.id.name;
        const originalName = getOriginalName(node.init);

        if (!originalName) return;

        const scope = sourceCode.getScope(node);
        const referenceCount = countReferences(scope, aliasName);

        if (referenceCount > 0 && referenceCount <= maxReferences) {
          context.report({
            node: node.id,
            messageId: 'unnecessaryAlias',
            data: {
              aliasName,
              originalName,
              count: referenceCount.toString(),
            },
          });
        }
      },
    };
  },
};
