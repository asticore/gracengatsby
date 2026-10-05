import { eq } from 'drizzle-orm';
import { db, Users as UsersTable } from '../db';

export type User = typeof UsersTable.$inferSelect;
export type UserInsert = typeof UsersTable.$inferInsert;
export type UserUpdate = Partial<UserInsert>;

/**
 * Find all users, with optional filtering
 */
export async function findUsers(where?: any) {
	try {
		if (where) {
			return await db.select().from(UsersTable).where(where);
		}
		return await db.select().from(UsersTable);
	} catch (error) {
		console.error('Error finding users:', error);
		throw error;
	}
}

/**
 * Find a single user by ID
 */
export async function findUserById(id: string) {
	try {
		const result = await db.select().from(UsersTable).where(eq(UsersTable.id, id));
		return result[0] || null;
	} catch (error) {
		console.error('Error finding user by ID:', error);
		throw error;
	}
}

/**
 * Find a single user by email
 */
export async function findUserByEmail(email: string) {
	try {
		const result = await db.select().from(UsersTable).where(eq(UsersTable.email, email));
		return result[0] || null;
	} catch (error) {
		console.error('Error finding user by email:', error);
		throw error;
	}
}

/**
 * Create a new user
 */
export async function createUser(data: UserInsert) {
	try {
		const result = await db.insert(UsersTable).values(data).returning();
		return result[0];
	} catch (error) {
		console.error('Error creating user:', error);
		throw error;
	}
}

/**
 * Update a user
 */
export async function updateUser(id: string, data: UserUpdate) {
	try {
		const result = await db.update(UsersTable).set(data).where(eq(UsersTable.id, id)).returning();
		return result[0] || null;
	} catch (error) {
		console.error('Error updating user:', error);
		throw error;
	}
}

/**
 * Delete a user
 */
export async function deleteUser(id: string) {
	try {
		const result = await db.delete(UsersTable).where(eq(UsersTable.id, id)).returning();
		return result[0] || null;
	} catch (error) {
		console.error('Error deleting user:', error);
		throw error;
	}
}

/**
 * Count users
 */
export async function countUsers() {
	try {
		const result = await db.select().from(UsersTable);
		return result.length;
	} catch (error) {
		console.error('Error counting users:', error);
		throw error;
	}
}
