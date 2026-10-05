import { expect, test } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('POST /internal/migrate - fresh install', () => {
	const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
	const adminPassword = process.env.ADMIN_PASSWORD || 'test-admin-password';

	test('should run migrations and create necessary tables on fresh install', async ({ request }) => {
		const response = await request.post(`${baseUrl}/internal/migrate`, {
			headers: {
				'X-Admin-Secret': adminPassword,
			},
		});

		expect(response.status()).toBe(200);

		const data = await response.json();
		expect(data).toHaveProperty('success', true);
		expect(data).toHaveProperty('tables');
		expect(Array.isArray(data.tables)).toBe(true);
		expect(data.tables.length).toBeGreaterThan(0);
	});

	test('should fail without admin secret', async ({ request }) => {
		const response = await request.post(`${baseUrl}/internal/migrate`);

		expect(response.status()).toBe(401);
	});

	test('should fail with wrong admin secret', async ({ request }) => {
		const response = await request.post(`${baseUrl}/internal/migrate`, {
			headers: {
				'X-Admin-Secret': 'wrong-secret',
			},
		});

		expect(response.status()).toBe(401);
	});
});
