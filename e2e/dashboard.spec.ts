import { expect, test } from './fixtures';

test.describe('executive dashboard', () => {
  test('shows headline metrics with a demo-mode label', async ({ authedPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Executive overview' })).toBeVisible();

    // Demo data must always be labelled as such.
    await expect(page.getByText('Demo mode').first()).toBeVisible();

    await expect(page.getByText('Connected stores')).toBeVisible();
    await expect(page.getByText('Orders', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Open conflicts').first()).toBeVisible();
  });

  test('labels converted multi-currency totals rather than presenting them as measured', async ({
    authedPage: page,
  }) => {
    await expect(page.getByText(/Reporting-currency totals are converted/)).toBeVisible();
    await expect(page.getByText(/demo exchange rates/).first()).toBeVisible();
  });

  test('explains a metric it cannot measure instead of inventing one', async ({ authedPage: page }) => {
    await expect(page.getByText(/Metrics that cannot be measured are shown as unavailable/)).toBeVisible();
  });

  test('date range filters change the reported period', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: 'Last 7 days' }).click();
    await page.waitForURL('**/overview?range=last7');
    await expect(page.getByText(/Last 7 days/).first()).toBeVisible();
  });
});
