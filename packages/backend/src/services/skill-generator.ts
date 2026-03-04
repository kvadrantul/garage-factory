// Skill Generator
// Generates OpenClaw SKILL.md files for each scenario
// Skills are placed in ~/.openclaw/skills/ (global extraDirs) so the agent can discover them

import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const SKILLS_DIR = join(homedir(), '.openclaw', 'skills');

interface ScenarioInfo {
  toolName: string;
  name: string;
  shortDescription: string;
  whenToApply: string;
  inputsSchema?: Record<string, unknown> | null;
}

/**
 * Build SKILL.md content in OpenClaw format.
 * The agent reads this file and uses curl commands to call the bridge API.
 */
function buildSkillMd(
  scenario: ScenarioInfo,
  bridgeBaseUrl: string,
): string {
  const description = `${scenario.shortDescription}. Use when: ${scenario.whenToApply}`;

  // Parse inputsSchema if it's a string
  let schema: Record<string, unknown> | null = null;
  if (scenario.inputsSchema) {
    schema = typeof scenario.inputsSchema === 'string'
      ? JSON.parse(scenario.inputsSchema)
      : scenario.inputsSchema;
  }

  // Build input parameters documentation
  let paramsDoc = '';
  const exampleInputs: Record<string, string> = {};

  if (schema) {
    const props = schema.properties as Record<string, { type?: string; description?: string }> | undefined;
    const required = schema.required as string[] | undefined;

    if (props) {
      paramsDoc = '\n## Input Parameters\n\n';
      for (const [key, val] of Object.entries(props)) {
        const req = required?.includes(key) ? ' **(required)**' : '';
        paramsDoc += `- \`${key}\` (${val.type || 'string'})${req}: ${val.description || key}\n`;
        exampleInputs[key] = `<${val.description || key}>`;
      }
    }
  }

  return `---
name: ${scenario.toolName}
description: "${description.replace(/"/g, '\\"')}"
metadata: { "openclaw": { "emoji": "🔧", "requires": { "bins": ["curl"] } } }
---

# ${scenario.name}

${scenario.shortDescription}

## When to Use

✅ **USE this skill when:**

- ${scenario.whenToApply}
${paramsDoc}
## Commands

### Execute via Bridge API

\`\`\`bash
curl -s -X POST "${bridgeBaseUrl}/api/bridge/run" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer dev-bridge-token" \\
  -d '${JSON.stringify({ domain_id: "<DOMAIN_ID>", tool_name: scenario.toolName, inputs: exampleInputs, case_id: "<CASE_ID>" }, null, 2)}'
\`\`\`

### Check execution status

\`\`\`bash
curl -s -X POST "${bridgeBaseUrl}/api/bridge/status" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer dev-bridge-token" \\
  -d '{"job_id": "<JOB_ID>"}'
\`\`\`

## Response Format

The API returns JSON:
- \`job_id\`: Execution identifier
- \`status\`: "completed", "running", "failed", or "waiting_hitl"
- \`outputs\`: Result data when completed
- \`error\`: Error message if failed

## Notes

- This skill calls the Garage Factory Bridge API at ${bridgeBaseUrl}
- The bridge executes a workflow and returns structured results
`;
}

/**
 * Generate a SKILL.md for a scenario in the global skills directory.
 */
export async function generateSkill(
  agentId: string,
  scenario: ScenarioInfo,
  bridgeBaseUrl: string = 'http://localhost:3000',
): Promise<void> {
  const skillDir = join(SKILLS_DIR, scenario.toolName);
  await mkdir(skillDir, { recursive: true });

  const content = buildSkillMd(scenario, bridgeBaseUrl);
  await writeFile(join(skillDir, 'SKILL.md'), content, 'utf-8');

  console.log(`[skill-generator] Generated skill "${scenario.toolName}" in ${skillDir}`);
}

/**
 * Remove a skill directory.
 */
export async function removeSkill(
  agentId: string,
  toolName: string,
): Promise<void> {
  const skillDir = join(SKILLS_DIR, toolName);

  try {
    await rm(skillDir, { recursive: true, force: true });
    console.log(`[skill-generator] Removed skill "${toolName}"`);
  } catch (err) {
    console.warn(`[skill-generator] Failed to remove skill "${toolName}":`, err);
  }
}

/**
 * Regenerate all skills for a domain's agent based on enabled scenarios.
 */
export async function regenerateAllSkills(
  agentId: string,
  scenarios: ScenarioInfo[],
  bridgeBaseUrl?: string,
): Promise<void> {
  for (const scenario of scenarios) {
    await generateSkill(agentId, scenario, bridgeBaseUrl);
  }

  console.log(`[skill-generator] Regenerated ${scenarios.length} skills`);
}
