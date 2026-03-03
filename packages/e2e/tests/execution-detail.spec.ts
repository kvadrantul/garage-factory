import { test, expect } from '@playwright/test';
import { api } from '../helpers/api.js';
import { simpleWorkflow } from '../helpers/fixtures.js';
import { waitForExecution } from '../helpers/wait.js';

const WF_NAME = '[E2E] Execution Detail Test';

test.describe('Execution list and detail page', () => {
  let workflowId: string;
  let executionId: string;

  test.beforeAll(async () => {
    // Seed everything via API before UI interaction
    const { id } = await api.createWorkflow(WF_NAME, simpleWorkflow());
    workflowId = id;

    const execResult = await api.executeWorkflow(workflowId);
    executionId = execResult.executionId;

    await waitForExecution(executionId);
  });

  test.afterAll(async () => {
    if (workflowId) {
      await api.deleteWorkflow(workflowId).catch(() => {});
    }
  });

  test('execution list shows completed row with duration', async ({ page }) => {
    await page.goto('/executions');

    // Table row for our workflow
    const row = page.locator(`tr:has-text("${WF_NAME}")`).first();
    await expect(row).toBeVisible();

    // Status shows completed
    await expect(row.locator('text=completed')).toBeVisible();

    // Duration column is not empty
    const durationCell = row.locator('td').nth(4);
    const durationText = await durationCell.textContent();
    expect(durationText?.trim()).not.toBe('-');
  });

  test('execution detail shows node results with data', async ({ page }) => {
    await page.goto(`/executions/${executionId}`);

    // Header
    await expect(page.locator('text=Execution Details')).toBeVisible();
    await expect(page.locator(`text=ID: ${executionId}`)).toBeVisible();

    // Status badge
    await expect(page.locator('text=Completed').first()).toBeVisible();

    // Summary card — workflow field shows workflowId (not name) in current implementation
    await expect(page.locator('text=Summary')).toBeVisible();
    await expect(page.locator('text=Manual').first()).toBeVisible();

    // Node Results
    await expect(page.locator('text=Node Results')).toBeVisible();

    // Should have at least 2 node entries (trigger + code)
    const nodeEntries = page.locator('.divide-y > div');
    await expect(nodeEntries).not.toHaveCount(0);
    const count = await nodeEntries.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Expand Output on code node and verify content
    const outputButtons = page.locator('button:has-text("Output")');
    await outputButtons.last().click();

    const preBlock = page.locator('pre').last();
    await expect(preBlock).toContainText('hello from e2e');
  });
});
