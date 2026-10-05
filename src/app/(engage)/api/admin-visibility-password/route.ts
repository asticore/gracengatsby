import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const COOKIE_NAME = 'admin-visibility';
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24 hours

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { password } = body;

		if (!password) {
			return NextResponse.json(
				{ error: 'Password is required' },
				{ status: 401 }
			);
		}

		if (password !== ADMIN_PASSWORD) {
			return NextResponse.json(
				{ error: 'Invalid password' },
				{ status: 401 }
			);
		}

		const response = NextResponse.json(
			{ success: true, message: 'Admin visibility enabled' },
			{ status: 200 }
		);

		response.cookies.set({
			name: COOKIE_NAME,
			value: 'true',
			maxAge: COOKIE_MAX_AGE,
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
		});

		return response;
	} catch (error) {
		console.error('Error in admin-visibility-password route:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
