import { test, expect } from '@playwright/test';
import { api } from '../helpers/api.js';
import { simpleWorkflow } from '../helpers/fixtures.js';
import { waitForExecution } from '../helpers/wait.js';

const WF_NAME = '[E2E] Happy Path Workflow';

test.describe('Happy path: create → run → view results', () => {
  let workflowId: string;

  test.beforeAll(async () => {
    await api.cleanupStale();
    const { id } = await api.createWorkflow(WF_NAME, simpleWorkflow());
    workflowId = id;
  });

  test.afterAll(async () => {
    if (workflowId) {
      await api.deleteWorkflow(workflowId).catch(() => {});
    }
  });

  test('execute workflow from list and verify results on detail page', async ({ page }) => {
    // 1. Navigate to workflows list
    await page.goto('/workflows');
    await expect(page.locator('text=Orchestrator')).toBeVisible();

    // 2. Assert our workflow card is visible
    const workflowCard = page.locator(`text=${WF_NAME}`).first();
    await expect(workflowCard).toBeVisible();

    // 3. Click the Play (Execute) button and capture the response
    const responsePromise = page.waitForResponse((res) =>
      res.url().includes('/execute') && res.status() === 200,
    );

    // Find the card container that has our workflow name, then click its Execute button
    const card = page.locator(`.grid > div`).filter({ hasText: WF_NAME }).first();
    await card.locator('button[title="Execute"]').click();

    const response = await responsePromise;
    const { executionId } = await response.json();
    expect(executionId).toBeTruthy();

    // 4. Wait for execution to complete via API polling
    const execution = await waitForExecution(executionId);
    expect(execution.status).toBe('completed');

    // 5. Navigate to executions list
    await page.goto('/executions');
    await expect(page.locator('h2:has-text("Executions")')).toBeVisible();

    // 6. Assert the execution row exists and shows completed
    const executionRow = page.locator(`tr:has-text("${WF_NAME}")`).first();
    await expect(executionRow).toBeVisible();
    await expect(executionRow.locator('text=completed')).toBeVisible();

    // 7. Click into the execution detail
    await executionRow.locator(`a:has-text("${WF_NAME}")`).click();
    await page.waitForURL(/\/executions\//);

    // 8. Verify detail page
    await expect(page.locator('text=Execution Details')).toBeVisible();
    await expect(page.locator(`text=ID: ${executionId}`)).toBeVisible();

    // 9. Verify summary shows manual trigger
    await expect(page.locator('text=Summary')).toBeVisible();
    await expect(page.locator('text=Manual').first()).toBeVisible();

    // 10. Verify Node Results section
    await expect(page.locator('text=Node Results')).toBeVisible();

    // 11. Click Output expander on the code node
    const outputButtons = page.locator('button:has-text("Output")');
    const outputButtonCount = await outputButtons.count();
    expect(outputButtonCount).toBeGreaterThan(0);

    // Click the last Output button (code node is second, after trigger)
    await outputButtons.last().click();

    // 12. Assert output contains our e2e marker
    const jsonOutput = page.locator('pre');
    await expect(jsonOutput.last()).toContainText('hello from e2e');
  });
});
