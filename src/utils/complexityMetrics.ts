import ts from 'typescript';

export interface FunctionComplexity {
  name: string;
  line: number;
  cyclomatic: number;
  cognitive: number;
  maintainability: number;
  lines: number;
  params: number;
  depth: number;
}

export interface FileComplexityReport {
  file: string;
  functions: FunctionComplexity[];
  summary: {
    totalFunctions: number;
    highComplexity: number;
    avgCyclomatic: number;
    avgCognitive: number;
    avgMaintainability: number;
  };
}

export function analyzeFileComplexity(
  content: string,
  filePath: string,
  highThreshold: number,
): FileComplexityReport {
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const functions: FunctionComplexity[] = [];

  const registerFunction = (
    node: ts.FunctionLikeDeclarationBase,
    name: string,
  ) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const lines = calculateLineSpan(node, source);
    const params = node.parameters?.length ?? 0;
    const cyclomatic = computeCyclomatic(node);
    const cognitive = computeCognitiveComplexity(node, 0);
    const depth = computeNestingDepth(node, 0);
    const maintainability = calculateMaintainability(
      cyclomatic,
      cognitive,
      params,
      lines,
      depth,
    );

    functions.push({
      name: name || 'anonymous',
      line,
      cyclomatic,
      cognitive,
      maintainability,
      lines,
      params,
      depth,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      registerFunction(node, node.name.text);
    } else if (
      (ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      ts.isClassLike(node.parent)
    ) {
      const className =
        (node.parent.name && node.parent.name.text) || 'AnonymousClass';
      const methodName = ts.isIdentifier(node.name)
        ? node.name.text
        : 'anonymousMethod';
      registerFunction(node, `${className}.${methodName}`);
    } else if (
      ts.isConstructorDeclaration(node) &&
      ts.isClassLike(node.parent)
    ) {
      const className =
        (node.parent.name && node.parent.name.text) || 'AnonymousClass';
      registerFunction(node, `${className}.constructor`);
    } else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        registerFunction(node, parent.name.text);
      } else {
        registerFunction(node, 'anonymous');
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  const totalFunctions = functions.length;
  const highComplexity = functions.filter(
    (fn) => fn.cyclomatic > highThreshold || fn.cognitive > highThreshold,
  ).length;

  return {
    file: filePath,
    functions,
    summary: {
      totalFunctions,
      highComplexity,
      avgCyclomatic: totalFunctions
        ? average(functions.map((fn) => fn.cyclomatic))
        : 0,
      avgCognitive: totalFunctions
        ? average(functions.map((fn) => fn.cognitive))
        : 0,
      avgMaintainability: totalFunctions
        ? average(functions.map((fn) => fn.maintainability))
        : 0,
    },
  };
}

function calculateLineSpan(node: ts.Node, source: ts.SourceFile): number {
  const start = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return Math.max(1, end - start + 1);
}

function computeCyclomatic(node: ts.Node): number {
  let complexity = 1;

  const walk = (child: ts.Node) => {
    if (child !== node && isFunctionLike(child)) {
      return; // ignore nested functions
    }

    if (
      ts.isIfStatement(child) ||
      ts.isForStatement(child) ||
      ts.isWhileStatement(child) ||
      ts.isForOfStatement(child) ||
      ts.isForInStatement(child) ||
      ts.isCaseClause(child) ||
      ts.isCatchClause(child) ||
      ts.isDoStatement(child)
    ) {
      complexity += 1;
    } else if (ts.isConditionalExpression(child)) {
      complexity += 1;
    } else if (
      ts.isBinaryExpression(child) &&
      (child.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        child.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      complexity += 1;
    }

    ts.forEachChild(child, walk);
  };

  ts.forEachChild(node, walk);
  return complexity;
}

function computeCognitiveComplexity(node: ts.Node, nesting: number): number {
  let score = 0;

  const walk = (child: ts.Node, innerNesting: number) => {
    if (child !== node && isFunctionLike(child)) {
      return; // skip nested functions
    }

    const isControl = isControlFlowNode(child);
    if (isControl) {
      score += 1 + innerNesting;
    }

    const nextNesting = isControl ? innerNesting + 1 : innerNesting;
    ts.forEachChild(child, (grandChild) => walk(grandChild, nextNesting));
  };

  ts.forEachChild(node, (child) => walk(child, nesting));
  return score;
}

function computeNestingDepth(node: ts.Node, depth: number): number {
  let maxDepth = depth;

  const walk = (child: ts.Node, currentDepth: number) => {
    if (child !== node && isFunctionLike(child)) {
      return;
    }

    const nextDepth = isControlFlowNode(child)
      ? currentDepth + 1
      : currentDepth;
    maxDepth = Math.max(maxDepth, nextDepth);

    ts.forEachChild(child, (grandChild) => walk(grandChild, nextDepth));
  };

  ts.forEachChild(node, (child) => walk(child, depth));
  return maxDepth;
}

function calculateMaintainability(
  cyclomatic: number,
  cognitive: number,
  params: number,
  lines: number,
  depth: number,
): number {
  const penalty =
    cyclomatic * 1.5 +
    cognitive * 1.2 +
    params * 2 +
    Math.log(lines + 1) * 5 +
    depth * 1.5;
  const score = Math.max(0, 100 - penalty);
  return Math.min(100, Number(score.toFixed(1)));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(1));
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLike {
  return (
    ts.isFunctionLike(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function isControlFlowNode(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isSwitchStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    (ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken))
  );
}
