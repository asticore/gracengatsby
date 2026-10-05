import { expect, test } from '@playwright/test';

test.describe('Admin visibility password route', () => {
	const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
	const correctPassword = process.env.ADMIN_PASSWORD || 'test-admin-password';

	test('POST route should work correctly', async ({ request }) => {
		const response = await request.post(`${baseUrl}/api/admin-visibility-password`, {
			data: { password: correctPassword },
		});

		expect(response.status()).toBe(200);
	});

	test('should store admin-visibility cookie', async ({ request }) => {
		const response = await request.post(`${baseUrl}/api/admin-visibility-password`, {
			data: { password: correctPassword },
		});

		const cookies = response.headers()['set-cookie'];
		expect(cookies).toContain('admin-visibility');
	});
});
