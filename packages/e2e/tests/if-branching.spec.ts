import { test, expect } from '@playwright/test';
import { api } from '../helpers/api.js';
import { ifWorkflow } from '../helpers/fixtures.js';
import { waitForExecution } from '../helpers/wait.js';

const WF_NAME = '[E2E] If Branching Test';

test.describe('If-node conditional branching', () => {
  let workflowId: string;

  test.beforeAll(async () => {
    const { id } = await api.createWorkflow(WF_NAME, ifWorkflow());
    workflowId = id;
  });

  test.afterAll(async () => {
    if (workflowId) {
      await api.deleteWorkflow(workflowId).catch(() => {});
    }
  });

  test('true branch executes when condition matches', async ({ page }) => {
    // Execute with value="yes" → condition passes → true branch taken
    const { executionId } = await api.executeWorkflow(workflowId, { value: 'yes' });
    await waitForExecution(executionId);

    await page.goto(`/executions/${executionId}`);
    await expect(page.locator('text=Execution Details')).toBeVisible();
    await expect(page.locator('text=Completed').first()).toBeVisible();

    // Node Results section
    await expect(page.locator('text=Node Results')).toBeVisible();

    // if1 node should be completed
    await expect(page.locator('h3:has-text("if1")')).toBeVisible();

    // true-branch should be completed
    const trueBranch = page.locator('h3:has-text("true-branch")');
    await expect(trueBranch).toBeVisible();

    // false-branch should NOT be present (it was never executed)
    const falseBranch = page.locator('h3:has-text("false-branch")');
    await expect(falseBranch).toHaveCount(0);
  });

  test('false branch executes when condition does not match', async ({ page }) => {
    // Execute with value="no" → condition fails → false branch taken
    const { executionId } = await api.executeWorkflow(workflowId, { value: 'no' });
    await waitForExecution(executionId);

    await page.goto(`/executions/${executionId}`);
    await expect(page.locator('text=Execution Details')).toBeVisible();
    await expect(page.locator('text=Completed').first()).toBeVisible();

    // Node Results section
    await expect(page.locator('text=Node Results')).toBeVisible();

    // if1 node should be completed
    await expect(page.locator('h3:has-text("if1")')).toBeVisible();

    // false-branch should be completed
    const falseBranch = page.locator('h3:has-text("false-branch")');
    await expect(falseBranch).toBeVisible();

    // true-branch should NOT be present
    const trueBranch = page.locator('h3:has-text("true-branch")');
    await expect(trueBranch).toHaveCount(0);
  });
});
