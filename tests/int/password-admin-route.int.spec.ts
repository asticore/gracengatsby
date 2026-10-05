import { expect, test } from '@playwright/test';

test.describe('POST /api/admin-visibility-password', () => {
	const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
	const correctPassword = process.env.ADMIN_PASSWORD || 'test-admin-password';

	test('should return 401 when no password is provided', async ({ request }) => {
		const response = await request.post(`${baseUrl}/api/admin-visibility-password`, {
			data: {},
		});

		expect(response.status()).toBe(401);
	});

	test('should return 401 when wrong password is provided', async ({ request }) => {
		const response = await request.post(`${baseUrl}/api/admin-visibility-password`, {
			data: {
				password: 'wrong-password',
			},
		});

		expect(response.status()).toBe(401);
	});

	test('should return 200 and set cookie when correct password is provided', async ({ request }) => {
		const response = await request.post(`${baseUrl}/api/admin-visibility-password`, {
			data: {
				password: correctPassword,
			},
		});

		expect(response.status()).toBe(200);
		const cookies = response.headers()['set-cookie'];
		expect(cookies).toBeTruthy();
		expect(cookies).toContain('admin-visibility');
	});

	test('should return 200 with cookie allowing subsequent requests', async ({ request }) => {
		const loginResponse = await request.post(`${baseUrl}/api/admin-visibility-password`, {
			data: {
				password: correctPassword,
			},
		});

		expect(loginResponse.status()).toBe(200);

		// Extract cookie from response
		const setCookieHeader = loginResponse.headers()['set-cookie'];
		const cookies = setCookieHeader.split(';')[0];

		// Use cookie in subsequent request
		const protectedResponse = await request.get(`${baseUrl}/api/dashboard`, {
			headers: {
				Cookie: cookies,
			},
		});

		// The protected route should not return 401 (cookie valid)
		expect(protectedResponse.status()).not.toBe(401);
	});
});
