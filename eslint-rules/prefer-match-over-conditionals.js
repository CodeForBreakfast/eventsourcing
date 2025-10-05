/**
 * Custom ESLint rule to detect imperative conditionals in Effect callbacks
 * Flags: Effect.flatMap((x) => { if (x.type === 'foo') ... })
 * Suggests: Use Match.value + Match.tag pattern instead
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect imperative if statements in Effect callbacks that check discriminated union properties. Use Match.value with Match.tag for better type safety and functional composition.',
    },
    messages: {
      useMatchInstead:
        'Use Match.value with Match.tag instead of imperative if statements when checking discriminated unions. Example: pipe(value, Match.value, Match.tag("{{tagValue}}", handler)) instead of if (value.type === "{{tagValue}}")',
    },
    schema: [],
  },

  create(context) {
    const EFFECT_METHODS = new Set([
      'flatMap',
      'map',
      'tap',
      'tapError',
      'filterOrFail',
      'filterOrElse',
    ]);

    const DISCRIMINATOR_PROPERTIES = new Set(['type', '_tag', 'kind', 'variant']);

    const isEffectMethodCall = (node) => {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        EFFECT_METHODS.has(node.callee.property.name)
      );
    };

    const isFunctionLike = (node) => {
      return (
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration'
      );
    };

    const getCallbackBody = (callback) => {
      if (callback.body.type === 'BlockStatement') {
        return callback.body.body;
      }
      return null;
    };

    const isDiscriminatorCheck = (condition, paramName) => {
      // Check for: param.type === 'value' or param._tag === 'value'
      if (
        condition.type === 'BinaryExpression' &&
        (condition.operator === '===' || condition.operator === '==')
      ) {
        const { left, right } = condition;

        // Check if left side is accessing a discriminator property
        if (
          left.type === 'MemberExpression' &&
          left.object.type === 'Identifier' &&
          left.object.name === paramName &&
          left.property.type === 'Identifier' &&
          DISCRIMINATOR_PROPERTIES.has(left.property.name) &&
          right.type === 'Literal' &&
          typeof right.value === 'string'
        ) {
          return {
            property: left.property.name,
            value: right.value,
          };
        }

        // Also check the reverse: 'value' === param.type
        if (
          right.type === 'MemberExpression' &&
          right.object.type === 'Identifier' &&
          right.object.name === paramName &&
          right.property.type === 'Identifier' &&
          DISCRIMINATOR_PROPERTIES.has(right.property.name) &&
          left.type === 'Literal' &&
          typeof left.value === 'string'
        ) {
          return {
            property: right.property.name,
            value: left.value,
          };
        }
      }

      return null;
    };

    const hasReturnStatements = (statements) => {
      return statements.some(
        (stmt) => stmt.type === 'ReturnStatement' || stmt.type === 'IfStatement'
      );
    };

    return {
      CallExpression(node) {
        if (!isEffectMethodCall(node)) {
          return;
        }

        const callback = node.arguments[0];
        if (!callback || !isFunctionLike(callback)) {
          return;
        }

        // Get the parameter name (we're looking for single-param callbacks)
        if (callback.params.length !== 1 || callback.params[0].type !== 'Identifier') {
          return;
        }

        const paramName = callback.params[0].name;
        const bodyStatements = getCallbackBody(callback);

        if (!bodyStatements || !hasReturnStatements(bodyStatements)) {
          return;
        }

        // Look for if statements checking discriminator properties
        for (const statement of bodyStatements) {
          if (statement.type === 'IfStatement') {
            const discriminatorCheck = isDiscriminatorCheck(statement.test, paramName);

            if (discriminatorCheck) {
              context.report({
                node: statement,
                messageId: 'useMatchInstead',
                data: {
                  tagValue: discriminatorCheck.value,
                },
              });
            }
          }
        }
      },
    };
  },
};
