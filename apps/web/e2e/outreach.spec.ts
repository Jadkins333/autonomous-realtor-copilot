import { test, expect } from '@playwright/test';

test('login and navigate to outreach drafts', async ({ page }) => {
  await page.goto('/login');
  // Fill credentials and submit
  await page.fill('input[type="email"]', 'agent@demo.local');
  await page.fill('input[type="password"]', 'password');
  await page.click('button:has-text("Log In")');

  // Ensure dashboard loads
  await expect(page).toHaveURL(/\/dashboard/);
  
  // Navigate to Outreach
  await page.click('text="Outreach"');
  await expect(page).toHaveURL(/\/outreach/);
  
  // Assert outreach interface rendering
  await expect(page.locator('text=Draft Packs')).toBeVisible();
});
