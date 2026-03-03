# Nodes Specification

## Node Interface

```typescript
// packages/shared/node-types.ts

export interface NodeDefinition {
  type: string;
  category: NodeCategory;
  name: string;
  description: string;
  icon: string;
  version: number;
  
  // Input/output configuration
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  
  // Configuration schema
  properties: PropertyDefinition[];
  
  // Credentials requirement
  credentials?: CredentialRequirement[];
}

export type NodeCategory = 
  | 'triggers' 
  | 'actions' 
  | 'logic' 
  | 'ai' 
  | 'utility';

export interface PortDefinition {
  name: string;
  type: 'main' | 'conditional';
  label?: string;
}

export interface PropertyDefinition {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'code' | 'expression';
  default?: any;
  required?: boolean;
  description?: string;
  options?: { label: string; value: any }[];
  placeholder?: string;
  // Conditional display
  displayOptions?: {
    show?: Record<string, any[]>;
    hide?: Record<string, any[]>;
  };
}

export interface CredentialRequirement {
  type: string;
  required: boolean;
}
```

## Node Runner Interface

```typescript
// packages/backend/executor/node-runner.ts

export interface NodeRunner {
  execute(context: NodeContext): Promise<NodeResult>;
}

export interface NodeContext {
  // Node configuration
  node: WorkflowNode;
  
  // Input data from connected nodes
  inputs: {
    main: any[];  // Array of inputs from each connection
  };
  
  // Resolved credentials
  credentials?: Record<string, any>;
  
  // Execution context
  execution: {
    id: string;
    workflowId: string;
  };
  
  // Utilities
  helpers: {
    httpRequest: (options: HttpRequestOptions) => Promise<HttpResponse>;
    getCredential: (name: string) => Promise<any>;
  };
  
  // Event emitter for streaming
  emit: (event: string, data: any) => void;
}

export interface NodeResult {
  // Output data
  data: any;
  
  // For HITL nodes - pause execution
  waitForHitl?: HITLRequest;
  
  // For conditional nodes - which output to use
  outputIndex?: number;
}
```

---

## Trigger Nodes

### 1. Webhook Trigger

**Type:** `webhook-trigger`  
**Category:** `triggers`

Receives incoming HTTP requests.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| method | select | HTTP method (GET, POST, PUT, DELETE) |
| path | string | Webhook path (auto-generated) |
| responseMode | select | immediate, lastNode, responseNode |
| responseCode | number | HTTP response code (default: 200) |

**Output:**
```typescript
{
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
  method: string;
  path: string;
}
```

**Implementation:**
```typescript
export const webhookTrigger: NodeRunner = {
  async execute(context) {
    // Webhook data is passed as trigger data
    const triggerData = context.inputs.main[0];
    
    return {
      data: {
        headers: triggerData.headers,
        query: triggerData.query,
        body: triggerData.body,
        method: triggerData.method,
        path: triggerData.path,
      }
    };
  }
};
```

---

### 2. Schedule Trigger

**Type:** `schedule-trigger`  
**Category:** `triggers`

Triggers workflow on a schedule (cron).

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| cronExpression | string | Cron expression (e.g., "0 9 * * *") |
| timezone | string | Timezone (default: system) |

**Output:**
```typescript
{
  timestamp: string;  // ISO timestamp
  scheduled: string;  // Scheduled time
}
```

---

### 3. Manual Trigger

**Type:** `manual-trigger`  
**Category:** `triggers`

Triggered manually via API or UI.

**Configuration:** None

**Output:**
```typescript
{
  timestamp: string;
  triggerData: any;  // Data passed via API
}
```

---

## Action Nodes

### 4. HTTP Request

**Type:** `http-request`  
**Category:** `actions`

Makes HTTP requests to external APIs.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| method | select | GET, POST, PUT, DELETE, PATCH |
| url | string | Request URL (supports expressions) |
| headers | json | Request headers |
| queryParams | json | Query parameters |
| body | json/string | Request body |
| bodyContentType | select | json, form, raw |
| timeout | number | Timeout in ms (default: 30000) |
| followRedirects | boolean | Follow redirects (default: true) |
| ignoreSSL | boolean | Ignore SSL errors (default: false) |

**Credentials:** Optional - `api_key`, `bearer_token`, `basic_auth`

**Output:**
```typescript
{
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}
```

**Implementation:**
```typescript
export const httpRequest: NodeRunner = {
  async execute(context) {
    const { url, method, headers, body, timeout } = context.node.data.config;
    
    // Apply credentials
    const finalHeaders = { ...headers };
    if (context.credentials) {
      if (context.credentials.type === 'bearer_token') {
        finalHeaders['Authorization'] = `Bearer ${context.credentials.token}`;
      }
      // ... other credential types
    }
    
    const response = await context.helpers.httpRequest({
      url,
      method,
      headers: finalHeaders,
      body,
      timeout,
    });
    
    return {
      data: {
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body,
      }
    };
  }
};
```

---

### 5. Code (Function)

**Type:** `code`  
**Category:** `actions`

Executes custom JavaScript code.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| code | code | JavaScript code to execute |
| mode | select | runOnceForAll, runForEach |

**Input Variables Available:**
- `$input` - Input data from previous node
- `$inputs` - All inputs array
- `$node` - Current node info
- `$execution` - Execution info

**Output:** Return value from code

**Implementation:**
```typescript
import { VM } from 'vm2';

export const codeNode: NodeRunner = {
  async execute(context) {
    const { code } = context.node.data.config;
    const input = context.inputs.main[0];
    
    const vm = new VM({
      timeout: 10000,
      sandbox: {
        $input: input,
        $inputs: context.inputs.main,
        $node: { name: context.node.data.name },
        $execution: context.execution,
        console: { log: () => {} }, // Sandboxed console
      }
    });
    
    const result = vm.run(`
      (async function() {
        ${code}
      })()
    `);
    
    return { data: await result };
  }
};
```

---

## Logic Nodes

### 6. If

**Type:** `if`  
**Category:** `logic`

Conditional branching based on expression.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| conditions | json | Array of conditions |
| combineOperation | select | AND, OR |

**Conditions Structure:**
```typescript
interface Condition {
  field: string;      // Expression to evaluate left side
  operation: 'equals' | 'notEquals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'isEmpty' | 'isNotEmpty';
  value: any;         // Value to compare
}
```

**Outputs:** 
- `true` (index 0)
- `false` (index 1)

**Implementation:**
```typescript
export const ifNode: NodeRunner = {
  async execute(context) {
    const { conditions, combineOperation } = context.node.data.config;
    const input = context.inputs.main[0];
    
    const results = conditions.map(cond => evaluateCondition(input, cond));
    
    const passed = combineOperation === 'AND' 
      ? results.every(r => r)
      : results.some(r => r);
    
    return {
      data: input,
      outputIndex: passed ? 0 : 1,
    };
  }
};
```

---

### 7. Switch

**Type:** `switch`  
**Category:** `logic`

Multi-way branching based on value.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| value | expression | Value to switch on |
| cases | json | Array of case definitions |
| fallback | boolean | Include fallback output |

**Cases Structure:**
```typescript
interface SwitchCase {
  value: any;
  label: string;
}
```

**Outputs:** Dynamic based on cases + optional fallback

---

### 8. Merge

**Type:** `merge`  
**Category:** `logic`

Merges multiple inputs into one.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| mode | select | append, combine, wait |

**Modes:**
- `append` - Concatenate all inputs into array
- `combine` - Deep merge objects
- `wait` - Wait for all inputs before continuing

**Inputs:** Multiple (configurable)
**Output:** Merged data

---

### 9. Set

**Type:** `set`  
**Category:** `utility`

Sets/modifies data.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| values | json | Key-value pairs to set |
| mode | select | set, append, remove |
| keepOnlySet | boolean | Remove other fields |

---

## AI Nodes

### 10. Agent (OpenClaw)

**Type:** `agent`  
**Category:** `ai`

Calls an OpenClaw agent.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| agentId | string | OpenClaw agent ID |
| message | expression | Message to send to agent |
| timeout | number | Timeout in seconds (default: 180) |
| sessionId | string | Optional session ID for context |

**Output:**
```typescript
{
  response: string;    // Agent response text
  agentId: string;
  sessionId: string;
  duration: number;    // Execution time in ms
}
```

**Implementation:**
```typescript
import { spawn } from 'child_process';

export const agentNode: NodeRunner = {
  async execute(context) {
    const { agentId, message, timeout = 180, sessionId } = context.node.data.config;
    const input = context.inputs.main[0];
    
    // Resolve expressions in message
    const resolvedMessage = resolveExpression(message, input);
    
    return new Promise((resolve, reject) => {
      const args = [
        'agent',
        '--agent', agentId,
        '-m', resolvedMessage,
        '--timeout', String(timeout),
      ];
      
      if (sessionId) {
        args.push('--session-id', sessionId);
      }
      
      const proc = spawn('openclaw', args);
      const chunks: Buffer[] = [];
      const startTime = Date.now();
      
      proc.stdout.on('data', (chunk) => {
        chunks.push(chunk);
        // Emit streaming update
        context.emit('agent:chunk', chunk.toString());
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({
            data: {
              response: Buffer.concat(chunks).toString().trim(),
              agentId,
              sessionId,
              duration: Date.now() - startTime,
            }
          });
        } else {
          reject(new Error(`Agent exited with code ${code}`));
        }
      });
    });
  }
};
```

---

### 11. HITL (Human-in-the-Loop)

**Type:** `hitl`  
**Category:** `ai`

Pauses execution for human decision.

**Configuration:**
| Property | Type | Description |
|----------|------|-------------|
| type | select | approval, input, selection |
| message | string | Message to display |
| details | expression | Additional context |
| timeout | number | Timeout in seconds (default: 3600) |
| fields | json | Fields for input type |
| options | json | Options for selection type |

**Output (Approval):**
```typescript
{
  approved: boolean;
  respondedAt: string;
  respondedBy?: string;
}
```

**Output (Input):**
```typescript
{
  data: Record<string, any>;  // Field values
  respondedAt: string;
}
```

**Implementation:**
```typescript
export const hitlNode: NodeRunner = {
  async execute(context) {
    const { type, message, details, timeout, fields, options } = context.node.data.config;
    const input = context.inputs.main[0];
    
    // Resolve expressions
    const resolvedDetails = resolveExpression(details, input);
    
    return {
      data: input,
      waitForHitl: {
        type,
        message,
        details: resolvedDetails,
        fields,
        options,
        timeoutSeconds: timeout,
      }
    };
  }
};
```

---

## Node Registry

```typescript
// packages/backend/nodes/registry.ts

import { webhookTrigger } from './triggers/webhook';
import { scheduleTrigger } from './triggers/schedule';
import { manualTrigger } from './triggers/manual';
import { httpRequest } from './actions/http-request';
import { codeNode } from './actions/code';
import { ifNode } from './logic/if';
import { switchNode } from './logic/switch';
import { mergeNode } from './logic/merge';
import { setNode } from './utility/set';
import { agentNode } from './ai/agent';
import { hitlNode } from './ai/hitl';

export const nodeRegistry: Record<string, NodeRunner> = {
  'webhook-trigger': webhookTrigger,
  'schedule-trigger': scheduleTrigger,
  'manual-trigger': manualTrigger,
  'http-request': httpRequest,
  'code': codeNode,
  'if': ifNode,
  'switch': switchNode,
  'merge': mergeNode,
  'set': setNode,
  'agent': agentNode,
  'hitl': hitlNode,
};

export const nodeDefinitions: NodeDefinition[] = [
  // ... definitions for UI
];
```

---

## Adding New Nodes

1. Create node runner in `packages/backend/nodes/`
2. Add node definition for UI
3. Register in `nodeRegistry`
4. Create React component in `packages/frontend/components/nodes/`
5. Add to node palette
