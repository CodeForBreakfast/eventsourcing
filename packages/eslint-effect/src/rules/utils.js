export const isVoidReturn = (arrowFunc) => {
  const body = arrowFunc.body;
  if (!body) return false;

  if (
    body.type === 'UnaryExpression' &&
    body.operator === 'void' &&
    body.argument.type === 'Literal' &&
    body.argument.value === 0
  ) {
    return true;
  }

  if (body.type === 'Identifier' && body.name === 'undefined') {
    return true;
  }

  if (body.type === 'BlockStatement' && body.body.length === 0) {
    return true;
  }

  return false;
};

export const createMethodCallChecker = (methodName, supportedTypes) => (node) => {
  return (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === methodName &&
    node.callee.object.type === 'Identifier' &&
    supportedTypes.includes(node.callee.object.name)
  );
};

export const isNullReturn = (arrowFunc) => {
  if (arrowFunc.params.length !== 0) {
    return false;
  }

  const body = arrowFunc.body;

  if (body.type === 'Literal' && body.value === null) {
    return true;
  }

  if (body.type === 'Identifier' && body.name === 'null') {
    return true;
  }

  return false;
};

export const isUndefinedReturn = (arrowFunc) => {
  if (arrowFunc.params.length !== 0) {
    return false;
  }

  const body = arrowFunc.body;

  if (body.type === 'Identifier' && body.name === 'undefined') {
    return true;
  }

  return false;
};

export const isOptionSome = (node) => {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'Option' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'some'
  );
};

export const isVoidReturningFunction = (node) => {
  if (!node) return false;

  if (node.type === 'Identifier' && node.name === 'constVoid') {
    return true;
  }

  if (node.type === 'ArrowFunctionExpression') {
    const body = node.body;

    if (body.type === 'Identifier' && body.name === 'undefined') {
      return true;
    }

    if (
      body.type === 'UnaryExpression' &&
      body.operator === 'void' &&
      body.argument.type === 'Literal' &&
      body.argument.value === 0
    ) {
      return true;
    }

    if (body.type === 'BlockStatement' && body.body.length === 0) {
      return true;
    }
  }

  return false;
};
