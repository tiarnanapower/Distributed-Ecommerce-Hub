import { expect, test } from './fixtures';

test.describe('running a sync', () => {
  test('the Sync Centre offers a Run-a-sync action', async ({ authedPage: page }) => {
    await page.goto('/sync');
    await expect(page.getByRole('button', { name: 'Run a sync' })).toBeVisible();
  });

  test('a sync can be started and the job appears in the queue', async ({ authedPage: page }) => {
    await page.goto('/sync');
    await page.getByRole('button', { name: 'Run a sync' }).click();

    await expect(page.getByRole('heading', { name: 'Run a sync' })).toBeVisible();
    // Pulls must be described as read-only, because they are.
    await expect(page.getByText(/Nothing is written back to any store/)).toBeVisible();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: 'Start sync' }).click();

    await expect(page.getByText(/job.* queued/i)).toBeVisible({ timeout: 20_000 });
  });

  test('a deep link pre-opens the dialog with the right job selected', async ({ authedPage: page }) => {
    // This is the contract the buttons elsewhere in the app rely on.
    await page.goto('/sync?action=catalog');
    await expect(page.getByRole('heading', { name: 'Run a sync' })).toBeVisible();

    const catalogRow = page.locator('label').filter({ hasText: 'Catalog pull' });
    await expect(catalogRow.getByRole('checkbox')).toBeChecked();

    // Something not asked for must stay unticked.
    const orderRow = page.locator('label').filter({ hasText: 'Order pull' });
    await expect(orderRow.getByRole('checkbox')).not.toBeChecked();
  });

  test('a full-sync deep link selects every job type', async ({ authedPage: page }) => {
    await page.goto('/sync?action=full');
    await expect(page.getByRole('heading', { name: 'Run a sync' })).toBeVisible();

    for (const label of ['Connection refresh', 'Catalog pull', 'Order pull', 'Customer pull']) {
      await expect(
        page.locator('label').filter({ hasText: label }).getByRole('checkbox'),
      ).toBeChecked();
    }
  });

  test('navigating to a sync link does not start anything on its own', async ({ authedPage: page }) => {
    // A URL must never enqueue work — a bookmark or a prefetch would fire it.
    const before = await page.goto('/sync?action=catalog');
    expect(before?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'Run a sync' })).toBeVisible();
    // The dialog is open and waiting. The success toast — which only appears
    // once a job is genuinely enqueued — must not have fired.
    await expect(page.getByText('Progress appears below as each one runs.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start sync' })).toBeVisible();
  });

  test('the order pull exposes a lookback window', async ({ authedPage: page }) => {
    await page.goto('/sync?action=orders');
    await expect(page.getByLabel('How far back to pull orders')).toBeVisible();
  });

  test('demo stores are called out as needing no API call', async ({ authedPage: page }) => {
    await page.goto('/sync');
    await page.getByRole('button', { name: 'Run a sync' }).click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText(/no BigCommerce store is contacted/)).toBeVisible();
  });

  test('the empty orders view points at the pull that would fill it', async ({ authedPage: page }) => {
    // Scope to a store with no order snapshots so the empty state renders.
    await page.goto('/orders?store=does-not-exist');
    await expect(page.getByRole('link', { name: 'Pull orders' })).toBeVisible();
  });
});
