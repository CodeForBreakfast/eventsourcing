/**
 * Custom ESLint rule to detect ternary operators that could be Match patterns
 * Flags: condition ? effectA : effectB or condition ? fnA : fnB
 * Suggests: Use Match.value for declarative branching
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer Match.value over ternary operators for conditional Effect/function selection. Ternary operators are imperative and less composable than Match patterns.',
    },
    messages: {
      useMatchInstead:
        'Use Match.value instead of ternary for conditional branching. Pattern: pipe(Match.value(condition), Match.when(...), Match.exhaustive). Alternative: move simple literal equality (x === "value") inside Effect constructor to avoid duplication.',
      useMatchInEffectConstructor:
        'Use Match.value to select the value, then wrap result in Effect constructor. Pattern: pipe(Match.value(condition), Match.when(true, () => a), Match.when(false, () => b), Match.exhaustive, Effect.succeed). Avoid duplicating Effect.succeed/fail in each branch. Note: Simple literal equality (x === "value" ? a : b) is allowed.',
      useEffectIf:
        'Use Effect.if instead of ternary for boolean conditional branching. Pattern: Effect.if(condition, { onTrue: () => effectIfTrue, onFalse: () => effectIfFalse }). Effect.if is more semantic for boolean conditions and avoids nested pipe issues.',
    },
    schema: [],
  },

  create(context) {
    const isEffectCall = (node) => {
      if (!node || node.type !== 'CallExpression') {
        return false;
      }

      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Effect'
      ) {
        return true;
      }

      if (
        node.callee.type === 'Identifier' &&
        (node.callee.name.startsWith('Effect') || node.callee.name.endsWith('Effect'))
      ) {
        return true;
      }

      return false;
    };

    const isCallExpression = (node) => {
      return node && node.type === 'CallExpression';
    };

    const isSimpleLiteralEquality = (condition) => {
      if (condition.type !== 'BinaryExpression') {
        return false;
      }

      if (condition.operator !== '===' && condition.operator !== '==') {
        return false;
      }

      const { left, right } = condition;

      // Check if one side is a simple identifier and the other is a literal
      const hasIdentifier =
        (left.type === 'Identifier' && right.type === 'Literal') ||
        (right.type === 'Identifier' && left.type === 'Literal');

      // Also allow simple member access like obj.prop === 'literal'
      const hasMemberAccess =
        (left.type === 'MemberExpression' &&
          !left.computed &&
          right.type === 'Literal' &&
          typeof right.value === 'string') ||
        (right.type === 'MemberExpression' &&
          !right.computed &&
          left.type === 'Literal' &&
          typeof left.value === 'string');

      return hasIdentifier || hasMemberAccess;
    };

    const isBooleanCondition = (condition) => {
      // Direct boolean checks: if (x), if (!x), if (Boolean(x))
      if (
        condition.type === 'Identifier' ||
        condition.type === 'UnaryExpression' ||
        condition.type === 'CallExpression'
      ) {
        return true;
      }

      // Comparison operators that return boolean
      if (condition.type === 'BinaryExpression') {
        const booleanOperators = ['===', '!==', '==', '!=', '<', '>', '<=', '>='];
        return booleanOperators.includes(condition.operator);
      }

      // Logical operators: &&, ||
      if (condition.type === 'LogicalExpression') {
        return true;
      }

      return false;
    };

    const isRelevantTernary = (node) => {
      if (node.type !== 'ConditionalExpression') {
        return false;
      }

      const consequentIsCall = isCallExpression(node.consequent);
      const alternateIsCall = isCallExpression(node.alternate);

      if (!consequentIsCall && !alternateIsCall) {
        return false;
      }

      const consequentIsEffect = isEffectCall(node.consequent);
      const alternateIsEffect = isEffectCall(node.alternate);

      if (consequentIsEffect || alternateIsEffect) {
        return true;
      }

      if (consequentIsCall && alternateIsCall) {
        return true;
      }

      return false;
    };

    const isEffectConstructor = (node) => {
      if (!node || node.type !== 'CallExpression') {
        return false;
      }

      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Effect' &&
        node.callee.property.type === 'Identifier'
      ) {
        const methodName = node.callee.property.name;
        return (
          methodName === 'succeed' ||
          methodName === 'fail' ||
          methodName === 'sync' ||
          methodName === 'promise'
        );
      }

      return false;
    };

    const isInReturnOrAssignment = (node) => {
      if (!node.parent) {
        return false;
      }

      if (node.parent.type === 'ReturnStatement') {
        return true;
      }

      if (
        node.parent.type === 'VariableDeclarator' ||
        node.parent.type === 'AssignmentExpression'
      ) {
        return true;
      }

      if (node.parent.type === 'ArrowFunctionExpression' && node.parent.body === node) {
        return true;
      }

      // Check if ternary is argument to Effect constructor
      if (node.parent.type === 'CallExpression' && isEffectConstructor(node.parent)) {
        return true;
      }

      return false;
    };

    return {
      ConditionalExpression(node) {
        // Check if ternary is inside Effect constructor first
        const inEffectConstructor =
          node.parent && node.parent.type === 'CallExpression' && isEffectConstructor(node.parent);

        // For Effect constructors, catch ALL ternaries (not just function calls)
        // EXCEPT simple literal equality checks (like id === 'user-1')
        if (inEffectConstructor) {
          // Allow simple literal equality even in Effect constructors
          if (isSimpleLiteralEquality(node.test)) {
            return;
          }

          context.report({
            node,
            messageId: 'useMatchInEffectConstructor',
          });
          return;
        }

        // For other contexts, only flag ternaries with function calls
        if (!isRelevantTernary(node)) {
          return;
        }

        if (!isInReturnOrAssignment(node)) {
          return;
        }

        // Allow simple literal equality checks even with function calls in branches
        if (isSimpleLiteralEquality(node.test)) {
          return;
        }

        // For boolean conditions with Effect calls, suggest Effect.if
        const consequentIsEffect = isEffectCall(node.consequent);
        const alternateIsEffect = isEffectCall(node.alternate);
        if ((consequentIsEffect || alternateIsEffect) && isBooleanCondition(node.test)) {
          context.report({
            node,
            messageId: 'useEffectIf',
          });
          return;
        }

        context.report({
          node,
          messageId: 'useMatchInstead',
        });
      },
    };
  },
};
