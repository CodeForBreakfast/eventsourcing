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
