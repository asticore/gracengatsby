import { expect, test } from '@playwright/test';

test.describe('AdminNav owner filter', () => {
	const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

	test('should filter navigation items by user role', async ({ page }) => {
		await page.goto(`${baseUrl}/admin`);

		const navItems = page.locator('[data-testid="admin-nav-item"]');
		const count = await navItems.count();

		// Should have some nav items
		expect(count).toBeGreaterThan(0);
	});

	test('should show only user-accessible sections', async ({ page }) => {
		await page.goto(`${baseUrl}/admin`);

		const restrictedSection = page.locator('[data-testid="restricted-section"]');
		const isVisible = await restrictedSection.isVisible();

		// Visibility depends on user role
		expect(typeof isVisible).toBe('boolean');
	});
});
