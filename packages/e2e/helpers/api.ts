const API_BASE = 'http://localhost:3051';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${options.method || 'GET'} ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  async healthCheck(): Promise<{ status: string }> {
    return request('/api/health');
  },

  async listWorkflows(): Promise<{ data: { id: string; name: string }[] }> {
    return request('/api/workflows');
  },

  async createWorkflow(name: string, definition: unknown): Promise<{ id: string }> {
    const result = await request<{ id: string }>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify({ name, definition }),
    });
    return { id: result.id };
  },

  async executeWorkflow(id: string, triggerData?: unknown): Promise<{ executionId: string }> {
    const result = await request<{ executionId: string }>(`/api/workflows/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ triggerData }),
    });
    return result;
  },

  async getExecution(id: string): Promise<Record<string, unknown>> {
    return request(`/api/executions/${id}`);
  },

  async deleteWorkflow(id: string): Promise<void> {
    return request(`/api/workflows/${id}`, { method: 'DELETE' });
  },

  async deleteExecution(id: string): Promise<void> {
    return request(`/api/executions/${id}`, { method: 'DELETE' });
  },

  async listCredentials(): Promise<{ data: { id: string; name: string }[] }> {
    return request('/api/credentials');
  },

  async createCredential(name: string, type: string, data: unknown): Promise<{ id: string }> {
    const result = await request<{ id: string }>('/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ name, type, data }),
    });
    return { id: result.id };
  },

  async deleteCredential(id: string): Promise<void> {
    return request(`/api/credentials/${id}`, { method: 'DELETE' });
  },

  /** Delete all workflows and credentials whose name starts with [E2E] */
  async cleanupStale(): Promise<void> {
    const { data: workflows } = await this.listWorkflows();
    for (const wf of workflows) {
      if (wf.name.startsWith('[E2E]')) {
        await this.deleteWorkflow(wf.id).catch(() => {});
      }
    }
    const { data: credentials } = await this.listCredentials();
    for (const cred of credentials) {
      if (cred.name.startsWith('[E2E]')) {
        await this.deleteCredential(cred.id).catch(() => {});
      }
    }
  },
};
