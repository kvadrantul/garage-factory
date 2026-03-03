/**
 * Expression resolver for workflow node configs.
 *
 * Supports:
 * - {{ $input.path }} — upstream node's output data
 * - {{ $json.path }} — alias for $input (n8n compatibility)
 * - {{ $node["nodeName"].json.path }} — reference specific node output
 * - {{ $vars.varName }} — workflow-level variables
 * - {{ $env.VAR_NAME }} — environment variables
 *
 * Inspired by n8n's expression system but deliberately simplified
 * to dot-path template resolution (no JS eval, no sandbox needed).
 */

const EXPRESSION_RE = /\{\{\s*(.*?)\s*\}\}/g;

export interface ExpressionContext {
  input: unknown;                                // $input / $json
  nodeResults: Record<string, unknown>;          // $node["name"].json
  workflowVars?: Record<string, unknown>;        // $vars
  env?: Record<string, string>;                  // $env
}

/**
 * Resolve a dot-path against an object, supporting array index notation.
 *
 * Examples:
 *   resolvePath({ a: { b: 1 } }, 'a.b')          → 1
 *   resolvePath({ items: [{ x: 10 }] }, 'items[0].x') → 10
 */
export function resolvePath(obj: unknown, path: string): unknown {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Resolve all expressions in a value tree.
 *
 * - Strings: replace {{ expr }} tokens; if the entire string is a
 *   single expression, return the resolved value as-is (preserving type).
 * - Objects: recurse on each value.
 * - Arrays: map each element.
 * - Primitives: return as-is.
 */
export function resolveExpressions(value: unknown, context: ExpressionContext | unknown): unknown {
  // Backward compatibility: if context is not ExpressionContext, treat as inputData
  const ctx: ExpressionContext = isExpressionContext(context) 
    ? context 
    : { input: context, nodeResults: {} };

  if (typeof value === 'string') {
    return resolveStringExpressions(value, ctx);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveExpressions(item, ctx));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveExpressions(val, ctx);
    }
    return result;
  }

  return value;
}

function isExpressionContext(obj: unknown): obj is ExpressionContext {
  return obj !== null && typeof obj === 'object' && 'input' in obj && 'nodeResults' in obj;
}

function resolveStringExpressions(str: string, ctx: ExpressionContext): unknown {
  // Check if the entire string is a single expression (preserve type)
  const trimmed = str.trim();
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    const inner = trimmed.slice(2, -2).trim();
    // Verify no other {{ }} in the middle
    if (!inner.includes('{{') && !inner.includes('}}')) {
      return resolveExpression(inner, ctx);
    }
  }

  // Embedded expressions: replace each {{ ... }} with its string value
  return str.replace(EXPRESSION_RE, (_match, expr: string) => {
    const resolved = resolveExpression(expr.trim(), ctx);
    return resolved === undefined ? '' : String(resolved);
  });
}

function resolveExpression(expr: string, ctx: ExpressionContext): unknown {
  // $input — upstream node output
  if (expr === '$input' || expr === '$json') {
    return ctx.input;
  }

  if (expr.startsWith('$input.')) {
    const path = expr.slice('$input.'.length);
    return resolvePath(ctx.input, path);
  }

  // $json — alias for $input (n8n compatibility)
  if (expr.startsWith('$json.')) {
    const path = expr.slice('$json.'.length);
    return resolvePath(ctx.input, path);
  }

  // $node["nodeName"] or $node['nodeName'] — reference specific node
  const nodeMatch = expr.match(/^\$node\[["']([^"']+)["']\](?:\.json)?(?:\.(.+))?$/);
  if (nodeMatch) {
    const [, nodeName, path] = nodeMatch;
    const nodeData = ctx.nodeResults[nodeName];
    if (path) {
      return resolvePath(nodeData, path);
    }
    return nodeData;
  }

  // $vars.varName — workflow variables
  if (expr === '$vars') {
    return ctx.workflowVars || {};
  }

  if (expr.startsWith('$vars.')) {
    const path = expr.slice('$vars.'.length);
    return resolvePath(ctx.workflowVars || {}, path);
  }

  // $env.VAR_NAME — environment variables
  if (expr === '$env') {
    return ctx.env || process.env;
  }

  if (expr.startsWith('$env.')) {
    const varName = expr.slice('$env.'.length);
    return (ctx.env || process.env)[varName];
  }

  // Unknown variable — return undefined (silent miss)
  return undefined;
}
