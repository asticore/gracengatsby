import { expect, test } from '@playwright/test';

test.describe('GettingStarted Feature', () => {
	const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

	test('should display getting started card on dashboard', async ({ page }) => {
		await page.goto(`${baseUrl}/dashboard`);

		// Look for getting started card
		const card = page.locator('[data-testid="getting-started-card"]');
		await expect(card).toBeVisible();
	});

	test('should show tasks in getting started card', async ({ page }) => {
		await page.goto(`${baseUrl}/dashboard`);

		const tasks = page.locator('[data-testid="getting-started-task"]');
		const count = await tasks.count();

		expect(count).toBeGreaterThan(0);
	});

	test('should allow marking task as complete', async ({ page }) => {
		await page.goto(`${baseUrl}/dashboard`);

		const firstTask = page.locator('[data-testid="getting-started-task"]').first();
		const checkbox = firstTask.locator('input[type="checkbox"]');

		await checkbox.click();
		await expect(checkbox).toBeChecked();
	});

	test('should persist completed tasks', async ({ page }) => {
		await page.goto(`${baseUrl}/dashboard`);

		const checkbox = page.locator('[data-testid="getting-started-task"]').first().locator('input[type="checkbox"]');
		await checkbox.click();

		// Reload page
		await page.reload();

		// Check should still be there
		await expect(checkbox).toBeChecked();
	});
});
