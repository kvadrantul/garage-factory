/**
 * Pre-built workflow definitions for E2E tests.
 */

export function simpleWorkflow() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'manual-trigger',
        position: { x: 100, y: 200 },
        data: { name: 'Manual Trigger', config: {} },
      },
      {
        id: 'code1',
        type: 'code',
        position: { x: 400, y: 200 },
        data: {
          name: 'Code Node',
          config: {
            code: '$result = { message: "hello from e2e", timestamp: Date.now() };',
          },
        },
      },
    ],
    edges: [
      {
        id: 'e0',
        source: 'trigger',
        target: 'code1',
      },
    ],
  };
}

export function ifWorkflow() {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'manual-trigger',
        position: { x: 100, y: 200 },
        data: { name: 'Manual Trigger', config: {} },
      },
      {
        id: 'if1',
        type: 'if',
        position: { x: 400, y: 200 },
        data: {
          name: 'If Check',
          config: {
            conditions: [
              { field: 'triggerData.value', operation: 'equals', value: 'yes' },
            ],
            combineOperation: 'AND',
          },
        },
      },
      {
        id: 'true-branch',
        type: 'set',
        position: { x: 700, y: 100 },
        data: {
          name: 'True Branch',
          config: { values: { branch: 'true' }, mode: 'set', keepOnlySet: true },
        },
      },
      {
        id: 'false-branch',
        type: 'set',
        position: { x: 700, y: 300 },
        data: {
          name: 'False Branch',
          config: { values: { branch: 'false' }, mode: 'set', keepOnlySet: true },
        },
      },
    ],
    edges: [
      { id: 'e0', source: 'trigger', target: 'if1' },
      { id: 'e1', source: 'if1', target: 'true-branch', sourceHandle: 'output_0' },
      { id: 'e2', source: 'if1', target: 'false-branch', sourceHandle: 'output_1' },
    ],
  };
}
