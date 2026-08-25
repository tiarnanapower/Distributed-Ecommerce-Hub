import { expect, test } from './fixtures';

test.describe('catalog comparison', () => {
  test('shows the cross-store product matrix', async ({ authedPage: page }) => {
    await page.goto('/catalog');
    await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
    await expect(page.getByText('Distinct SKUs')).toBeVisible();
    await expect(page.getByText(/matched across stores by SKU/)).toBeVisible();
  });

  test('filters the matrix by status', async ({ authedPage: page }) => {
    await page.goto('/catalog');
    await page.getByRole('combobox').filter({ hasText: /statuses/i }).first().click();
    await page.getByRole('option', { name: 'Missing somewhere' }).click();
    await expect(page.getByText(/of \d+ SKUs/)).toBeVisible();
  });

  test('a product page shows a different local id per store', async ({ authedPage: page }) => {
    await page.goto('/catalog/AH-KETTLE-1000');
    await expect(page.getByText(/different numeric product id in every store/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Local product id' })).toBeVisible();
  });
});

test.describe('conflicts', () => {
  test('lists detected differences and explains the classification', async ({ authedPage: page }) => {
    await page.goto('/conflicts');
    await expect(page.getByRole('heading', { name: 'Conflicts' })).toBeVisible();
    await expect(page.getByText(/explained by a recorded local override/)).toBeVisible();
  });

  test('a conflict can be resolved and the decision is recorded', async ({ authedPage: page }) => {
    await page.goto('/conflicts');

    const resolveButton = page.getByRole('button', { name: 'Resolve' }).first();
    await expect(resolveButton).toBeVisible();
    await resolveButton.click();

    await expect(page.getByRole('heading', { name: 'Resolve this difference' })).toBeVisible();
    // Dry-run-only actions must be labelled as such.
    await expect(page.getByText('Dry-run only').first()).toBeVisible();

    await page.getByRole('button', { name: /Mark as accepted variance/ }).click();
    await page.getByLabel('Note (optional)').fill('Confirmed with the regional lead during the e2e run.');
    await page.getByRole('button', { name: 'Record decision' }).click();

    await expect(page.getByText('Decision recorded')).toBeVisible({ timeout: 15_000 });
  });

  test('a comparison scan can be started', async ({ authedPage: page }) => {
    await page.goto('/conflicts');
    await page.getByRole('button', { name: 'Run a comparison' }).click();
    await expect(page.getByRole('heading', { name: 'Compare stores' })).toBeVisible();
    await expect(page.getByText(/A comparison is read-only/)).toBeVisible();

    await page.getByRole('button', { name: 'Select all' }).click();
    await page.getByRole('button', { name: 'Run comparison' }).click();
    await expect(page.getByText('Comparison queued')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('deployments', () => {
  test('a dry-run produces a plan with a blast radius and writes nothing', async ({ authedPage: page }) => {
    await page.goto('/deployments/new');
    await expect(page.getByRole('heading', { name: 'New deployment' })).toBeVisible();

    await page.getByLabel('Name').fill('E2E dry-run');
    await page.getByRole('button', { name: 'Select all' }).click();

    await expect(page.getByText(/A dry-run never writes anything/)).toBeVisible();
    await page.getByRole('button', { name: 'Run dry-run' }).click();

    await page.waitForURL(/\/deployments\/[a-z0-9]+/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Blast radius' })).toBeVisible();
    await expect(page.getByText('Destructive')).toBeVisible();
    await expect(page.getByText('Stores', { exact: true }).first()).toBeVisible();
  });

  test('the deployment list shows status and risk', async ({ authedPage: page }) => {
    await page.goto('/deployments');
    await expect(page.getByRole('heading', { name: 'Deployments' })).toBeVisible();
    await expect(page.getByText(/A deployment never writes on creation/)).toBeVisible();
  });
});

test.describe('sync centre', () => {
  test('shows job history and is honest about the local runner', async ({ authedPage: page }) => {
    await page.goto('/sync');
    await expect(page.getByRole('heading', { name: 'Sync Centre' })).toBeVisible();
    await expect(page.getByText(/This is an in-process job runner/)).toBeVisible();
    await expect(page.getByText(/does not do is run while the Next.js process is stopped/)).toBeVisible();
  });
});

test.describe('audit log', () => {
  test('records the actions taken during this session', async ({ authedPage: page }) => {
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await expect(page.getByText(/No secret ever reaches an audit row/)).toBeVisible();

    // Signing in is itself audited, so the event must be present.
    await expect(page.getByText('auth.sign_in').first()).toBeVisible();
  });

  test('audit rows contain no secret-shaped values', async ({ authedPage: page }) => {
    await page.goto('/audit');
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/access_token=[A-Za-z0-9]{10,}/);
  });
});

test.describe('integrations', () => {
  test('is display-only and says so', async ({ authedPage: page }) => {
    await page.goto('/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
    await expect(page.getByText(/display-only in this release/)).toBeVisible();
    await expect(page.getByText('Feedonomics').first()).toBeVisible();
    await expect(page.getByText('Avalara').first()).toBeVisible();
  });
});

test.describe('customer groups', () => {
  test('models a template and compares it across stores', async ({ authedPage: page }) => {
    await page.goto('/customer-groups');
    await expect(page.getByRole('heading', { name: 'Customer groups' })).toBeVisible();
    await expect(page.getByText(/Group ids are store-local/)).toBeVisible();
    await expect(page.getByText('Trade Gold').first()).toBeVisible();
  });
});

test.describe('themes', () => {
  test('refuses to merge theme code and offers explicit choices instead', async ({ authedPage: page }) => {
    await page.goto('/themes');
    await expect(page.getByRole('heading', { name: 'Themes' })).toBeVisible();
    await expect(page.getByText(/will not attempt to merge theme code/)).toBeVisible();
    await expect(page.getByText('Preserve local version')).toBeVisible();
    await expect(page.getByText('Replace with managed version')).toBeVisible();
  });
});
