import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

export const httpRequestNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      timeout?: number;
    };

    const headers: Record<string, string> = { ...config.headers };

    // Apply credentials
    if (context.credentials) {
      const cred = context.credentials as Record<string, unknown>;
      if (cred.type === 'bearer_token') {
        headers['Authorization'] = `Bearer ${cred.token}`;
      } else if (cred.type === 'api_key') {
        const headerName = (cred.headerName as string) || 'X-API-Key';
        headers[headerName] = cred.apiKey as string;
      } else if (cred.type === 'basic_auth') {
        const encoded = Buffer.from(`${cred.username}:${cred.password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }
    }

    const response = await context.helpers.httpRequest({
      url: config.url,
      method: (config.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') || 'GET',
      headers,
      body: config.body,
      timeout: config.timeout || 30000,
    });

    return {
      data: {
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body,
      },
    };
  },
};
