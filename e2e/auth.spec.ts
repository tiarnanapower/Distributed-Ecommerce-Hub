import { expect, test } from '@playwright/test';

import { signIn } from './fixtures';

test.describe('local authentication', () => {
  test('protected routes redirect an anonymous visitor to the login page', async ({ page }) => {
    await page.goto('/overview');
    await page.waitForURL('**/login**');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('the login page is honest about being a development build', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Development build')).toBeVisible();
    await expect(page.getByText(/Local authentication is active/)).toBeVisible();
    await expect(page.getByText(/SQLite is the active datastore/)).toBeVisible();
    // There must be no way to register.
    await expect(page.getByRole('link', { name: /sign up|register|create account/i })).toHaveCount(0);
  });

  test('signing in locally reaches the dashboard', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('Demo mode').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stores' }).first()).toBeVisible();
  });

  test('signing out returns to the login page and re-protects routes', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.waitForURL('**/login**');

    await page.goto('/overview');
    await page.waitForURL('**/login**');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
