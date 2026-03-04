// API Client

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Workflows API
export const workflowsApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    request<{ data: any[]; total: number }>(`/workflows?${new URLSearchParams(params as any)}`),

  get: (id: string) => request<any>(`/workflows/${id}`),

  create: (data: { name: string; definition: any; settings?: any }) =>
    request<any>('/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; definition?: any; settings?: any; active?: boolean }) =>
    request<any>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/workflows/${id}`, {
      method: 'DELETE',
    }),

  execute: (id: string, triggerData?: any) =>
    request<{ executionId: string; status: string }>(`/workflows/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ triggerData }),
    }),
};

// Executions API
export const executionsApi = {
  list: (params?: { workflowId?: string; status?: string; limit?: number; offset?: number }) =>
    request<{ data: any[]; total: number }>(`/executions?${new URLSearchParams(params as any)}`),

  get: (id: string) => request<any>(`/executions/${id}`),

  stop: (id: string) =>
    request<{ id: string; status: string }>(`/executions/${id}/stop`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    request<void>(`/executions/${id}`, {
      method: 'DELETE',
    }),
};

// HITL API
export const hitlApi = {
  list: (params?: { executionId?: string; status?: string }) =>
    request<{ data: any[] }>(`/hitl?${new URLSearchParams(params as any)}`),

  respond: (id: string, response: { action: string; data?: any; reason?: string }) =>
    request<{ id: string; status: string }>(`/hitl/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify(response),
    }),
};

// Credentials API
export const credentialsApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    request<{ data: any[]; total: number }>(`/credentials?${new URLSearchParams(params as any)}`),

  get: (id: string) => request<any>(`/credentials/${id}`),

  create: (data: { name: string; type: string; data: Record<string, unknown> }) =>
    request<any>('/credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; type?: string; data?: Record<string, unknown> }) =>
    request<any>(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/credentials/${id}`, {
      method: 'DELETE',
    }),
};

// Document Nodes API (catalog)
export const nodesApi = {
  catalog: () =>
    request<{ data: any[] }>('/nodes/catalog'),
};

// Custom Nodes API
export const customNodesApi = {
  list: () =>
    request<{ data: any[] }>('/custom-nodes'),

  get: (id: string) =>
    request<any>(`/custom-nodes/${id}`),

  create: (data: any) =>
    request<any>('/custom-nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: any) =>
    request<any>(`/custom-nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/custom-nodes/${id}`, {
      method: 'DELETE',
    }),

  toggle: (id: string) =>
    request<{ id: string; enabled: boolean }>(`/custom-nodes/${id}/toggle`, {
      method: 'POST',
    }),

  test: (id: string, data: { input: unknown; config: Record<string, unknown> }) =>
    request<{ result: unknown }>(`/custom-nodes/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Expert API - Domains
export const domainsApi = {
  list: () =>
    request<{ data: any[] }>('/expert/domains'),

  get: (id: string) =>
    request<any>(`/expert/domains/${id}`),

  create: (data: { name: string; slug: string; description?: string; icon?: string; agentId?: string; systemPrompt?: string }) =>
    request<any>('/expert/domains', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{ name: string; slug: string; description: string; icon: string; agentId: string; systemPrompt: string }>) =>
    request<any>(`/expert/domains/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/expert/domains/${id}`, {
      method: 'DELETE',
    }),
};

// Helper to filter undefined params
function cleanParams(params?: Record<string, string | undefined>): Record<string, string> {
  if (!params) return {};
  return Object.fromEntries(
    Object.entries(params).filter(([_, v]) => v !== undefined && v !== null)
  ) as Record<string, string>;
}

// Expert API - Scenarios
export const scenariosApi = {
  list: (params?: { domain_id?: string }) =>
    request<{ data: any[] }>(`/expert/scenarios?${new URLSearchParams(cleanParams(params))}`),

  get: (id: string) =>
    request<any>(`/expert/scenarios/${id}`),

  create: (data: {
    workflowId: string;
    domainId: string;
    toolName: string;
    name: string;
    shortDescription: string;
    whenToApply: string;
    inputsSchema?: Record<string, unknown>;
    outputsSchema?: Record<string, unknown>;
    riskClass?: string;
    estimatedDuration?: string;
    enabled?: boolean;
  }) =>
    request<any>('/expert/scenarios', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<any>) =>
    request<any>(`/expert/scenarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/expert/scenarios/${id}`, {
      method: 'DELETE',
    }),
};

// Expert API - Cases
export const casesApi = {
  list: (params?: { domain_id?: string; status?: string }) =>
    request<{ data: any[] }>(`/expert/cases?${new URLSearchParams(cleanParams(params))}`),

  get: (id: string) =>
    request<any>(`/expert/cases/${id}`),

  create: (data: { domainId: string; title?: string }) =>
    request<any>('/expert/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{ title: string; status: string; summary: string }>) =>
    request<any>(`/expert/cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/expert/cases/${id}`, {
      method: 'DELETE',
    }),
};

// Chat API
export const chatApi = {
  send: (caseId: string, message: string) =>
    request<{
      session_id: string;
      message: { role: string; content: string; tool_calls?: any[] };
      finish_reason: string;
      has_tool_calls: boolean;
    }>('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId, message }),
    }),

  upload: (caseId: string, message: string, files: File[]) => {
    const fd = new FormData();
    fd.append('case_id', caseId);
    fd.append('message', message);
    files.forEach((f) => fd.append('files', f));
    return requestFormData<{
      session_id?: string;
      message?: { role: string; content: string };
      finish_reason?: string;
      upload_only?: boolean;
    }>('/chat/upload', fd);
  },

  history: (caseId: string) =>
    request<{ case_id: string; steps: any[] }>(`/chat/history/${caseId}`),
};

// Artifacts API
export const artifactsApi = {
  list: (caseId: string) =>
    request<{ data: any[] }>(`/artifacts?case_id=${caseId}`),

  delete: (id: string) =>
    request<void>(`/artifacts/${id}`, { method: 'DELETE' }),
};

// Skills API (Phase B: Skill Generation)
export const skillsApi = {
  generate: (data: FormData) =>
    requestFormData<{ data: any }>('/skills/generate', data),

  save: (data: {
    domainId: string;
    workflowDefinition: any;
    scenario: {
      toolName: string;
      name: string;
      shortDescription: string;
      whenToApply: string;
      inputsSchema?: Record<string, unknown>;
      riskClass?: string;
      estimatedDuration?: string;
    };
  }) =>
    request<{ data: { workflow: any; scenario: any } }>('/skills/save', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  test: (workflowId: string, sampleFilePath?: string) =>
    request<{ data: { status: string; rowsProcessed?: number; outputSummary: string; error?: string } }>('/skills/test', {
      method: 'POST',
      body: JSON.stringify({ workflowId, sampleFilePath }),
    }),
};
