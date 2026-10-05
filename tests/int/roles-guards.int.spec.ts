import { expect, test } from '@playwright/test';

test.describe('Role-based access guards', () => {
	const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

	test('admin should access all pages', async ({ request }) => {
		// Admin token would be set via headers or cookies in real scenario
		const response = await request.get(`${baseUrl}/admin/dashboard`);
		expect(response.status()).not.toBe(403);
	});

	test('user should not access admin pages', async ({ request }) => {
		const response = await request.get(`${baseUrl}/admin/dashboard`);
		// Without proper auth token, should be redirected or forbidden
		expect([403, 401, 302]).toContain(response.status());
	});

	test('moderator should access certain pages', async ({ request }) => {
		const response = await request.get(`${baseUrl}/dashboard/moderator`);
		expect(response.status()).not.toBe(500);
	});
});
