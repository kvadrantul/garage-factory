import * as vm from 'node:vm';
import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

const CODE_TIMEOUT_MS = 10000;

export const codeNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as { code: string };
    const input = context.inputs.main[0];

    // Capture console.log output
    const logs: string[] = [];

    const sandbox = {
      $input: input,
      $inputs: context.inputs.main,
      $node: { name: context.node.data.name },
      $execution: context.execution,
      console: {
        log: (...args: unknown[]) => {
          logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
        },
        error: (...args: unknown[]) => {
          logs.push('[ERROR] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
        },
        warn: (...args: unknown[]) => {
          logs.push('[WARN] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
        },
      },
      // Provide setTimeout/Promise for async operations
      setTimeout,
      clearTimeout,
      Promise,
    };

    const vmContext = vm.createContext(sandbox);

    // Wrap user code in async IIFE that returns the result
    // User can either use `return` or set $result
    const wrappedCode = `
      (async () => {
        let $result;
        ${config.code}
        return $result;
      })()
    `;

    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'user-code.js',
      });

      // Run the script and get the promise
      const resultPromise = script.runInContext(vmContext);

      // Await with timeout
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Code execution timed out (10s)')), CODE_TIMEOUT_MS)
        ),
      ]);

      return {
        data: {
          result: result ?? input,
          logs: logs.length > 0 ? logs : undefined,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        data: {
          error: message,
          logs: logs.length > 0 ? logs : undefined,
        },
      };
    }
  },
};
