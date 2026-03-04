// Agent Provisioner
// Manages OpenClaw agent lifecycle (create/update/delete) via CLI

import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

interface ProvisionResult {
  agentId: string;
  workspace: string;
}

interface DomainInfo {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  systemPrompt?: string | null;
}

/**
 * Run a CLI command and return { stdout, stderr, code }
 */
function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: { ...process.env },
      timeout: 30_000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on('error', (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

/**
 * Build IDENTITY.md content from domain info
 */
function buildIdentity(domain: DomainInfo): string {
  const icon = domain.icon ?? '';
  const desc = domain.description ?? domain.name;

  let identity = `# ${icon} ${domain.name}\n\n`;
  identity += `${desc}\n\n`;

  if (domain.systemPrompt) {
    identity += `## Instructions\n\n${domain.systemPrompt}\n\n`;
  }

  identity += `## Rules\n\n`;
  identity += `- Use ONLY the tools provided to you. Do not attempt to access external systems directly.\n`;
  identity += `- Always explain your reasoning before executing a tool.\n`;
  identity += `- If the user's request is unclear, ask clarifying questions.\n`;
  identity += `- Respond in the user's language.\n`;

  return identity;
}

/**
 * Provision a new OpenClaw agent for a domain.
 * Uses `openclaw agents add` CLI command.
 */
export async function provisionAgent(
  domain: DomainInfo,
  model?: string,
): Promise<ProvisionResult> {
  const agentName = `expert-${domain.slug}`;
  const workspace = join(homedir(), '.openclaw', `workspace-${agentName}`);

  // Create agent via CLI (non-interactive, requires --workspace)
  const result = await runCommand('openclaw', [
    'agents', 'add', domain.name,
    '--workspace', workspace,
    '--non-interactive',
    ...(model ? ['--model', model] : []),
    '--json',
  ]);

  if (result.code !== 0) {
    throw new Error(`Failed to provision agent: ${result.stderr || result.stdout}`);
  }

  // Parse JSON output to get agent ID and workspace path
  let agentId: string;
  let resolvedWorkspace: string;

  try {
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in output');
    const output = JSON.parse(jsonMatch[0]);
    agentId = output.id || output.agentId;
    resolvedWorkspace = output.workspace || output.workspaceDir || workspace;
  } catch {
    // Fallback: list agents and find the one we just created
    const listResult = await runCommand('openclaw', ['agents', 'list', '--json']);
    const agents = JSON.parse(listResult.stdout);
    const found = agents.find((a: { name: string }) => a.name === domain.name);
    if (!found) throw new Error('Agent created but could not find it in agent list');
    agentId = found.id;
    resolvedWorkspace = found.workspace || workspace;
  }

  // Write IDENTITY.md with domain-specific content
  const identity = buildIdentity(domain);
  await writeFile(join(resolvedWorkspace, 'IDENTITY.md'), identity, 'utf-8');

  console.log(`[agent-provisioner] Provisioned agent "${agentId}" for domain "${domain.slug}"`);

  return { agentId, workspace: resolvedWorkspace };
}

/**
 * Update IDENTITY.md for an existing agent when domain metadata changes.
 */
export async function updateAgentIdentity(
  agentId: string,
  domain: DomainInfo,
): Promise<void> {
  // Find workspace path from agent list
  const workspace = await getAgentWorkspace(agentId);
  if (!workspace) {
    console.warn(`[agent-provisioner] Workspace not found for agent "${agentId}", skipping identity update`);
    return;
  }

  const identity = buildIdentity(domain);
  await writeFile(join(workspace, 'IDENTITY.md'), identity, 'utf-8');

  console.log(`[agent-provisioner] Updated identity for agent "${agentId}"`);
}

/**
 * Delete an OpenClaw agent and its workspace.
 */
export async function deleteAgent(agentId: string): Promise<void> {
  const result = await runCommand('openclaw', [
    'agents', 'delete', agentId,
    '--force',
    '--json',
  ]);

  if (result.code !== 0) {
    console.warn(`[agent-provisioner] Failed to delete agent "${agentId}": ${result.stderr || result.stdout}`);
    return;
  }

  console.log(`[agent-provisioner] Deleted agent "${agentId}"`);
}

/**
 * Get workspace path for an agent by its ID.
 */
export async function getAgentWorkspace(agentId: string): Promise<string | null> {
  const result = await runCommand('openclaw', ['agents', 'list', '--json']);

  if (result.code !== 0) return null;

  try {
    const agents = JSON.parse(result.stdout);
    const agent = agents.find((a: { id: string }) => a.id === agentId);
    return agent?.workspace ?? null;
  } catch {
    return null;
  }
}
