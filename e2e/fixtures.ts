import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared e2e helpers.
 *
 * These tests run against the seeded SQLite database in demo mode. No
 * BigCommerce credentials exist, so no outbound call is possible — the demo
 * provider serves every read. That is deliberate: the suite must be runnable by
 * anyone who has just cloned the repository.
 */

export async function signIn(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  await page.waitForURL('**/overview');
  await expect(page.getByRole('heading', { name: 'Executive overview' })).toBeVisible();
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect };
