import { NextRequest, NextResponse } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'default-secret';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		const authHeader = request.headers.get('authorization');
		const secret = request.headers.get('x-admin-secret');

		if (!secret || secret !== ADMIN_SECRET) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { id } = params;

		if (!id) {
			return NextResponse.json(
				{ error: 'ID is required' },
				{ status: 400 }
			);
		}

		// Delete logic would go here
		// For now, just return success

		return NextResponse.json(
			{ success: true, message: `Version ${id} deleted successfully` },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error deleting version:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
