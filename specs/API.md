# API Specification

## Base URL

```
http://localhost:3000/api
```

## Authentication

MVP: No authentication (localhost only)

Future: JWT tokens in `Authorization: Bearer <token>` header

---

## Workflows API

### List Workflows

```http
GET /api/workflows
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| limit | number | Max items (default: 50) |
| offset | number | Pagination offset |
| active | boolean | Filter by active status |

**Response:**
```json
{
  "data": [
    {
      "id": "clx123...",
      "name": "My Workflow",
      "description": "Process incoming orders",
      "active": true,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T12:00:00Z",
      "stats": {
        "totalExecutions": 150,
        "successRate": 0.95
      }
    }
  ],
  "total": 25,
  "limit": 50,
  "offset": 0
}
```

### Get Workflow

```http
GET /api/workflows/:id
```

**Response:**
```json
{
  "id": "clx123...",
  "name": "My Workflow",
  "description": "Process incoming orders",
  "active": true,
  "definition": {
    "nodes": [
      {
        "id": "node_1",
        "type": "webhook-trigger",
        "position": { "x": 100, "y": 100 },
        "data": {
          "name": "Webhook",
          "config": {
            "method": "POST",
            "path": "orders"
          }
        }
      },
      {
        "id": "node_2",
        "type": "http-request",
        "position": { "x": 300, "y": 100 },
        "data": {
          "name": "Send to API",
          "config": {
            "url": "https://api.example.com/orders",
            "method": "POST"
          }
        }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": "node_1",
        "target": "node_2"
      }
    ]
  },
  "settings": {
    "errorHandling": "stop",
    "timeout": 300
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

### Create Workflow

```http
POST /api/workflows
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New Workflow",
  "description": "Optional description",
  "definition": {
    "nodes": [],
    "edges": []
  },
  "settings": {}
}
```

**Response:** `201 Created` with workflow object

### Update Workflow

```http
PUT /api/workflows/:id
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "definition": { ... },
  "settings": { ... },
  "active": true
}
```

**Response:** `200 OK` with updated workflow object

### Delete Workflow

```http
DELETE /api/workflows/:id
```

**Response:** `204 No Content`

### Execute Workflow

```http
POST /api/workflows/:id/execute
Content-Type: application/json
```

**Request Body:**
```json
{
  "triggerData": {
    "key": "value"
  }
}
```

**Response:**
```json
{
  "executionId": "exec_abc123",
  "status": "running"
}
```

### Activate/Deactivate Workflow

```http
POST /api/workflows/:id/activate
POST /api/workflows/:id/deactivate
```

**Response:** `200 OK` with updated workflow object

---

## Executions API

### List Executions

```http
GET /api/executions
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| workflowId | string | Filter by workflow |
| status | string | Filter by status |
| limit | number | Max items (default: 50) |
| offset | number | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "id": "exec_abc123",
      "workflowId": "clx123...",
      "workflowName": "My Workflow",
      "status": "completed",
      "triggerType": "webhook",
      "startedAt": "2024-01-15T14:30:00Z",
      "finishedAt": "2024-01-15T14:30:05Z",
      "duration": 5000
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### Get Execution Details

```http
GET /api/executions/:id
```

**Response:**
```json
{
  "id": "exec_abc123",
  "workflowId": "clx123...",
  "status": "completed",
  "triggerType": "webhook",
  "triggerData": { "orderId": "12345" },
  "startedAt": "2024-01-15T14:30:00Z",
  "finishedAt": "2024-01-15T14:30:05Z",
  "nodes": {
    "node_1": {
      "status": "completed",
      "startedAt": "2024-01-15T14:30:00Z",
      "finishedAt": "2024-01-15T14:30:01Z",
      "input": null,
      "output": { "body": { "orderId": "12345" } }
    },
    "node_2": {
      "status": "completed",
      "startedAt": "2024-01-15T14:30:01Z",
      "finishedAt": "2024-01-15T14:30:05Z",
      "input": { "body": { "orderId": "12345" } },
      "output": { "statusCode": 200, "body": { "success": true } }
    }
  }
}
```

### Stop Execution

```http
POST /api/executions/:id/stop
```

**Response:**
```json
{
  "id": "exec_abc123",
  "status": "stopped"
}
```

### Delete Execution

```http
DELETE /api/executions/:id
```

**Response:** `204 No Content`

---

## HITL API

### Get Pending HITL Requests

```http
GET /api/hitl
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| executionId | string | Filter by execution |
| status | string | Filter by status (default: pending) |

**Response:**
```json
{
  "data": [
    {
      "id": "hitl_xyz789",
      "executionId": "exec_abc123",
      "nodeId": "node_3",
      "type": "approval",
      "status": "pending",
      "requestData": {
        "message": "Approve order processing?",
        "details": "Order #12345 for $500"
      },
      "expiresAt": "2024-01-15T15:00:00Z",
      "createdAt": "2024-01-15T14:30:02Z"
    }
  ]
}
```

### Respond to HITL Request

```http
POST /api/hitl/:id/respond
Content-Type: application/json
```

**Request Body (Approval):**
```json
{
  "action": "approve"
}
```

**Request Body (Rejection):**
```json
{
  "action": "reject",
  "reason": "Optional rejection reason"
}
```

**Request Body (Input):**
```json
{
  "action": "submit",
  "data": {
    "fieldName": "fieldValue"
  }
}
```

**Response:**
```json
{
  "id": "hitl_xyz789",
  "status": "approved",
  "respondedAt": "2024-01-15T14:35:00Z"
}
```

---

## Credentials API

### List Credentials

```http
GET /api/credentials
```

**Response:**
```json
{
  "data": [
    {
      "id": "cred_123",
      "name": "My API Key",
      "type": "api_key",
      "createdAt": "2024-01-10T10:00:00Z",
      "updatedAt": "2024-01-10T10:00:00Z"
    }
  ]
}
```

### Create Credential

```http
POST /api/credentials
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My API Key",
  "type": "api_key",
  "data": {
    "apiKey": "sk-xxx...",
    "headerName": "Authorization",
    "prefix": "Bearer "
  }
}
```

**Response:** `201 Created` with credential object (without sensitive data)

### Update Credential

```http
PUT /api/credentials/:id
Content-Type: application/json
```

### Delete Credential

```http
DELETE /api/credentials/:id
```

---

## Webhooks API

### Get Workflow Webhooks

```http
GET /api/workflows/:id/webhooks
```

**Response:**
```json
{
  "data": [
    {
      "id": "wh_abc",
      "nodeId": "node_1",
      "path": "abc123xyz",
      "method": "POST",
      "url": "http://localhost:3000/webhook/abc123xyz",
      "active": true
    }
  ]
}
```

### Webhook Endpoint (Dynamic)

```http
POST /webhook/:path
GET /webhook/:path
```

Triggers workflow execution when called.

**Response:**
```json
{
  "executionId": "exec_abc123",
  "status": "accepted"
}
```

---

## WebSocket API

### Connection

```
ws://localhost:3000/ws
```

### Subscribe to Execution Updates

**Client → Server:**
```json
{
  "type": "subscribe:execution",
  "executionId": "exec_abc123"
}
```

### Unsubscribe

**Client → Server:**
```json
{
  "type": "unsubscribe:execution",
  "executionId": "exec_abc123"
}
```

### Server Events

**Execution Started:**
```json
{
  "type": "execution:started",
  "payload": {
    "executionId": "exec_abc123",
    "workflowId": "clx123...",
    "startedAt": "2024-01-15T14:30:00Z"
  }
}
```

**Node Started:**
```json
{
  "type": "execution:node:started",
  "payload": {
    "executionId": "exec_abc123",
    "nodeId": "node_2",
    "startedAt": "2024-01-15T14:30:01Z"
  }
}
```

**Node Completed:**
```json
{
  "type": "execution:node:completed",
  "payload": {
    "executionId": "exec_abc123",
    "nodeId": "node_2",
    "output": { ... },
    "finishedAt": "2024-01-15T14:30:05Z"
  }
}
```

**Node Error:**
```json
{
  "type": "execution:node:error",
  "payload": {
    "executionId": "exec_abc123",
    "nodeId": "node_2",
    "error": "Connection timeout",
    "finishedAt": "2024-01-15T14:30:05Z"
  }
}
```

**HITL Required:**
```json
{
  "type": "hitl:required",
  "payload": {
    "executionId": "exec_abc123",
    "hitlId": "hitl_xyz789",
    "nodeId": "node_3",
    "type": "approval",
    "requestData": {
      "message": "Approve order?",
      "details": "Order #12345"
    },
    "expiresAt": "2024-01-15T15:00:00Z"
  }
}
```

**HITL Resolved:**
```json
{
  "type": "hitl:resolved",
  "payload": {
    "executionId": "exec_abc123",
    "hitlId": "hitl_xyz789",
    "status": "approved",
    "responseData": null
  }
}
```

**Execution Completed:**
```json
{
  "type": "execution:completed",
  "payload": {
    "executionId": "exec_abc123",
    "status": "completed",
    "finishedAt": "2024-01-15T14:30:10Z"
  }
}
```

**Execution Failed:**
```json
{
  "type": "execution:failed",
  "payload": {
    "executionId": "exec_abc123",
    "status": "failed",
    "error": "Node 'HTTP Request' failed: Connection refused",
    "finishedAt": "2024-01-15T14:30:05Z"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Workflow not found",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `EXECUTION_FAILED` | 500 | Execution error |
| `INTERNAL_ERROR` | 500 | Unexpected error |
