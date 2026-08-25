import { expect, test } from './fixtures';

test.describe('store directory and detail', () => {
  test('lists the seeded estate and distinguishes stores from channels', async ({ authedPage: page }) => {
    await page.goto('/stores');
    await expect(page.getByRole('heading', { name: 'Store directory' })).toBeVisible();

    // The distinction the whole product rests on must be stated.
    await expect(page.getByText(/An .*independent store.* has its own store hash/)).toBeVisible();

    await expect(page.getByRole('link', { name: /Acme UK Flagship/ }).first()).toBeVisible();
  });

  test('switches between grid and table views', async ({ authedPage: page }) => {
    await page.goto('/stores');
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('columnheader', { name: /Store/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Grid' }).click();
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('opens a store and walks its tabs', async ({ authedPage: page }) => {
    await page.goto('/stores');
    await page.getByRole('link', { name: /Acme UK Flagship/ }).first().click();
    await page.waitForURL(/\/stores\/[a-z0-9]+/);

    await expect(page.getByRole('heading', { name: 'Acme UK Flagship' })).toBeVisible();
    await expect(page.getByText('Store identity')).toBeVisible();

    await page.getByRole('tab', { name: 'Configuration' }).click();
    await expect(page.getByText(/Each row shows the inheritance mode in force/)).toBeVisible();

    await page.getByRole('tab', { name: 'Capabilities' }).click();
    await expect(page.getByText(/honest account of what it can do/)).toBeVisible();

    await page.getByRole('tab', { name: 'Credentials' }).click();
    await expect(page.getByText('Secrets are never shown here')).toBeVisible();
  });

  test('never exposes a credential value', async ({ authedPage: page }) => {
    await page.goto('/stores');
    await page.getByRole('link', { name: /Acme UK Flagship/ }).first().click();
    await page.waitForURL(/\/stores\/[a-z0-9]+/);
    await page.getByRole('tab', { name: 'Credentials' }).click();

    // Only a masked hint may appear.
    await expect(page.getByText(/••••••••/).first()).toBeVisible();
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/[a-f0-9]{32,}/);
  });

  test('shows the capability matrix with reasons, not just absence', async ({ authedPage: page }) => {
    await page.goto('/stores');
    await page.getByRole('link', { name: /Acme UK Flagship/ }).first().click();
    await page.waitForURL(/\/stores\/[a-z0-9]+/);
    await page.getByRole('tab', { name: 'Capabilities' }).click();

    await expect(page.getByText('Available now')).toBeVisible();

    // This store's API account holds read scopes but not the matching write
    // scopes, so every write must be reported as read-only with the reason —
    // never hidden, and never shown as available.
    await expect(page.getByText('Read-only').first()).toBeVisible();
    await expect(page.getByText(/but not store_v2_/).first()).toBeVisible();

    // Operations BigCommerce has no API for must say so outright.
    await expect(page.getByText('Not supported').first()).toBeVisible();
  });

  test('reports an unhealthy store honestly', async ({ authedPage: page }) => {
    await page.goto('/stores?health=CRITICAL');
    await expect(page.getByRole('link', { name: /Acme Dealer Portal MEA/ }).first()).toBeVisible();
    await expect(page.getByText(/rejected the access token|token/i).first()).toBeVisible();
  });
});

test.describe('connection wizard', () => {
  test('offers guided provisioning and states that store creation has no API', async ({
    authedPage: page,
  }) => {
    await page.goto('/stores/new?mode=provisioning');
    await expect(
      page.getByText(/Creating a BigCommerce store is not an API operation/),
    ).toBeVisible();
    await expect(
      page.getByText(/no public API that creates a new BigCommerce store account/).first(),
    ).toBeVisible();
  });

  test('walks the connection wizard and can create a demo connection', async ({ authedPage: page }) => {
    await page.goto('/stores/new');
    await expect(page.getByRole('heading', { name: 'What are you connecting?' })).toBeVisible();

    await page.getByRole('button', { name: /Independent store/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Friendly store name').fill('E2E Test Store');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Creating it as a demo connection avoids needing any real credential.
    await page.getByText('Create as a demo connection').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Continue' }).click(); // placement
    await page.getByRole('button', { name: 'Continue' }).click(); // inheritance

    await expect(page.getByRole('heading', { name: 'Review and create' })).toBeVisible();
    await page.getByRole('button', { name: 'Create store connection' }).click();

    await expect(page.getByRole('heading', { name: 'Verify the connection' })).toBeVisible();

    await page.getByRole('button', { name: 'Run connection test' }).click();
    await expect(page.getByText('Connection succeeded')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Simulated')).toBeVisible();
  });
});
