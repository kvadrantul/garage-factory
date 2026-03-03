import { spawn } from 'child_process';
import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

interface AgentConfig {
  agentId?: string;
  message?: string;
  timeout?: number;
  provider?: 'openai' | 'anthropic' | 'openclaw';
  model?: string;
  systemPrompt?: string;
  temperature?: number;
}

export const agentNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as AgentConfig;
    const input = context.inputs.main[0];

    const message = config.message || JSON.stringify(input);
    const startTime = Date.now();

    // OpenClaw CLI mode
    if (config.provider === 'openclaw' && config.agentId) {
      return executeOpenClaw(context, config, message, startTime);
    }

    // OpenAI API mode
    if (config.provider === 'openai' || !config.provider) {
      const result = await executeOpenAI(context, config, message, startTime);
      if (result) return result;
    }

    // Fallback: pass-through with a note
    return {
      data: {
        response: `[Agent node: no API key configured. Input: ${JSON.stringify(input).slice(0, 200)}]`,
        agentId: config.agentId,
        duration: Date.now() - startTime,
      },
    };
  },
};

async function executeOpenClaw(
  context: NodeContext,
  config: AgentConfig,
  message: string,
  startTime: number,
): Promise<NodeResult> {
  return new Promise((resolve, reject) => {
    const args = ['agent', '--agent', config.agentId!];

    if (config.systemPrompt) {
      args.push('--system', config.systemPrompt);
    }
    if (config.model) {
      args.push('--model', config.model);
    }
    if (config.timeout) {
      args.push('--timeout', String(config.timeout));
    }

    args.push('-m', message);

    const proc = spawn('openclaw', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const chunks: string[] = [];
    let errorOutput = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      chunks.push(text);
      // Emit streaming chunk for real-time updates
      context.emit('agent:chunk', { text });
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });

    proc.on('error', (err) => {
      // OpenClaw CLI not found - fallback gracefully
      resolve({
        data: {
          response: `[OpenClaw CLI not found: ${err.message}]`,
          agentId: config.agentId,
          duration: Date.now() - startTime,
          error: 'openclaw_not_found',
        },
      });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          data: {
            response: chunks.join('').trim(),
            agentId: config.agentId,
            model: config.model,
            duration: Date.now() - startTime,
          },
        });
      } else {
        resolve({
          data: {
            response: `[OpenClaw error: ${errorOutput || `exit code ${code}`}]`,
            agentId: config.agentId,
            duration: Date.now() - startTime,
            error: errorOutput || `exit_code_${code}`,
          },
        });
      }
    });

    // Timeout handling
    const timeout = (config.timeout || 180) * 1000;
    setTimeout(() => {
      proc.kill();
      resolve({
        data: {
          response: '[OpenClaw timeout]',
          agentId: config.agentId,
          duration: Date.now() - startTime,
          error: 'timeout',
        },
      });
    }, timeout);
  });
}

async function executeOpenAI(
  context: NodeContext,
  config: AgentConfig,
  message: string,
  startTime: number,
): Promise<NodeResult | null> {
  let apiKey: string | undefined;
  try {
    const cred = await context.helpers.getCredential('openai') as Record<string, unknown>;
    apiKey = cred?.apiKey as string;
  } catch {
    // No credentials configured
  }

  if (!apiKey) return null;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [
        ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
        { role: 'user', content: message },
      ],
      temperature: config.temperature ?? 0.7,
    }),
  });

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (data.error) {
    return {
      data: {
        response: `[OpenAI error: ${data.error.message}]`,
        agentId: config.agentId,
        model: config.model || 'gpt-4o-mini',
        duration: Date.now() - startTime,
        error: data.error.message,
      },
    };
  }

  return {
    data: {
      response: data.choices?.[0]?.message?.content ?? '',
      agentId: config.agentId,
      model: config.model || 'gpt-4o-mini',
      duration: Date.now() - startTime,
    },
  };
}
