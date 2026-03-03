export class ExecutionError extends Error {
  constructor(
    message: string,
    public nodeId?: string,
    public executionId?: string,
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

export class NodeExecutionError extends ExecutionError {
  constructor(
    message: string,
    nodeId: string,
    public nodeType: string,
    executionId?: string,
  ) {
    super(message, nodeId, executionId);
    this.name = 'NodeExecutionError';
  }
}

export class HITLTimeoutError extends ExecutionError {
  constructor(nodeId: string, executionId: string) {
    super('HITL request timed out', nodeId, executionId);
    this.name = 'HITLTimeoutError';
  }
}

export class AbortedError extends ExecutionError {
  constructor(executionId: string) {
    super('Execution was aborted', undefined, executionId);
    this.name = 'AbortedError';
  }
}
