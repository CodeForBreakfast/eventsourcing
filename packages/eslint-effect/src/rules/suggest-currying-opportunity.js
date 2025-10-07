export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest currying opportunities where arrow functions pass parameters through to user-defined functions. Example: (error) => logError(error, ctx) could be curried as logError(ctx)(error) when parameters are already in the right order.',
    },
    messages: {
      suggestCurrying:
        'This arrow function can be eliminated by currying {{functionName}}. Change signature to {{curriedSignature}}, then use {{functionName}}({{partialArgs}}) directly in the pipe.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowReordering: {
            type: 'boolean',
            default: false,
          },
          maxCurriedParams: {
            type: 'number',
            default: 1,
            minimum: 1,
            maximum: 3,
          },
        },
        additionalProperties: false,
      },
    ],
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

      const options = context.options[0] || {};
      const allowReordering = options.allowReordering ?? false;
      const maxCurriedParams = options.maxCurriedParams ?? 1;

      // Don't suggest currying if reordering is needed and not allowed (default behavior)
      // This prevents breaking semantic parameter order
      if (needsReordering && !allowReordering) {
        return null;
      }

      const curriedArgTexts = argsNotFromParams
        .sort((a, b) => a.index - b.index)
        .map((item) => sourceCode.getText(item.arg));

      // Limit currying depth to prevent unreadable multi-level currying
      if (curriedArgTexts.length > maxCurriedParams) {
        return null;
      }

      const paramArgTexts = argsFromParams
        .sort((a, b) => a.index - b.index)
        .map((item) => sourceCode.getText(item.arg));

      const curriedSignature = `(${curriedArgTexts.join(', ')}) => (${paramArgTexts.join(', ')}) => ...`;

      return {
        functionName,
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
