export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest currying opportunities where arrow functions pass parameters through to user-defined functions. Example: (error) => logError(error, ctx) could be reordered and curried as logError(ctx)(error)',
    },
    messages: {
      suggestCurrying:
        'Consider currying {{functionName}} to eliminate this arrow function. {{reorderMessage}}Change {{functionName}} signature to: {{curriedSignature}}, then use {{functionName}}({{partialArgs}}) directly.',
    },
    schema: [],
  },

  create(context) {
    const KNOWN_NAMESPACES = new Set([
      'Effect',
      'Schema',
      'Match',
      'Array',
      'Option',
      'Either',
      'Context',
      'Layer',
      'Ref',
      'Stream',
      'Sink',
      'Channel',
      'Cause',
      'Exit',
      'Fiber',
      'FiberRef',
      'Queue',
      'Schedule',
      'Scope',
      'Data',
      'Hash',
      'Equal',
      'String',
      'Number',
      'Boolean',
      'HashMap',
      'HashSet',
      'List',
      'Chunk',
      'Request',
      'RequestResolver',
      'Console',
      'Random',
      'Clock',
      'Duration',
      'DateTime',
      'Deferred',
      'SynchronizedRef',
      'SubscriptionRef',
    ]);

    const KNOWN_STANDALONE_FUNCTIONS = new Set(['pipe', 'flow', 'identity', 'constant', 'dual']);

    const isKnownLibraryFunction = (node) => {
      if (node.type === 'MemberExpression' && node.object.type === 'Identifier') {
        return KNOWN_NAMESPACES.has(node.object.name);
      }
      if (node.type === 'Identifier') {
        return KNOWN_STANDALONE_FUNCTIONS.has(node.name);
      }
      return false;
    };

    const getCallExpressionFromBody = (body) => {
      if (body.type === 'CallExpression') {
        return body;
      }
      if (
        body.type === 'BlockStatement' &&
        body.body.length === 1 &&
        body.body[0].type === 'ReturnStatement' &&
        body.body[0].argument?.type === 'CallExpression'
      ) {
        return body.body[0].argument;
      }
      return null;
    };

    const getFunctionName = (callee) => {
      if (callee.type === 'Identifier') {
        return callee.name;
      }
      if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        return callee.property.name;
      }
      return null;
    };

    const analyzeArrowFunction = (node) => {
      const callExpr = getCallExpressionFromBody(node.body);
      if (!callExpr) return null;

      if (isKnownLibraryFunction(callExpr.callee)) {
        return null;
      }

      const paramNames = new Set(
        node.params.map((p) => (p.type === 'Identifier' ? p.name : null)).filter(Boolean)
      );

      if (paramNames.size === 0) return null;

      const argsFromParams = [];
      const argsNotFromParams = [];

      callExpr.arguments.forEach((arg, index) => {
        if (arg.type === 'Identifier' && paramNames.has(arg.name)) {
          argsFromParams.push({ arg, index });
        } else {
          argsNotFromParams.push({ arg, index });
        }
      });

      if (argsFromParams.length === 0 || argsNotFromParams.length === 0) {
        return null;
      }

      if (argsFromParams.length !== paramNames.size) {
        return null;
      }

      const allParamsUsedInOrder = argsFromParams.every((item, idx) => {
        const paramIndex = node.params.findIndex(
          (p) => p.type === 'Identifier' && p.name === item.arg.name
        );
        return paramIndex === idx;
      });

      if (!allParamsUsedInOrder) {
        return null;
      }

      const functionName = getFunctionName(callExpr.callee);
      if (!functionName) return null;

      const sourceCode = context.sourceCode || context.getSourceCode();

      const lastParamArgIndex = Math.max(...argsFromParams.map((item) => item.index));
      const lastNonParamIndex = Math.max(...argsNotFromParams.map((item) => item.index));
      const needsReordering = lastNonParamIndex > lastParamArgIndex;

      const curriedArgTexts = argsNotFromParams
        .sort((a, b) => a.index - b.index)
        .map((item) => sourceCode.getText(item.arg));
      const paramArgTexts = argsFromParams
        .sort((a, b) => a.index - b.index)
        .map((item) => sourceCode.getText(item.arg));

      const reorderMessage = needsReordering
        ? 'Reorder parameters so curried args come first. '
        : '';

      const curriedSignature = `(${curriedArgTexts.join(', ')}) => (${paramArgTexts.join(', ')}) => ...`;

      return {
        functionName,
        reorderMessage,
        curriedSignature,
        partialArgs: curriedArgTexts.join(', '),
      };
    };

    return {
      ArrowFunctionExpression(node) {
        const analysis = analyzeArrowFunction(node);
        if (analysis) {
          context.report({
            node,
            messageId: 'suggestCurrying',
            data: analysis,
          });
        }
      },
    };
  },
};
