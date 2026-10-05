import { expect, test } from '@playwright/test';

test.describe('Panel preview', () => {
	const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

	test('should display panel preview correctly', async ({ page }) => {
		await page.goto(`${baseUrl}/panel/preview`);
		const content = page.locator('[data-testid="panel-content"]');
		await expect(content).toBeVisible();
	});
});
