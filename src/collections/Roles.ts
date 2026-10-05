import { eq } from 'drizzle-orm';
import { db, Roles as RolesTable } from '../db';

export type Role = typeof RolesTable.$inferSelect;
export type RoleUpdate = Partial<typeof RolesTable.$inferInsert>;

/**
 * Find all roles
 */
export async function findRoles(where?: any) {
	try {
		if (where) {
			return await db.select().from(RolesTable).where(where);
		}
		return await db.select().from(RolesTable);
	} catch (error) {
		console.error('Error finding roles:', error);
		throw error;
	}
}

/**
 * Find a single role by ID
 */
export async function findRoleById(id: string) {
	try {
		const result = await db.select().from(RolesTable).where(eq(RolesTable.id, id));
		return result[0] || null;
	} catch (error) {
		console.error('Error finding role by ID:', error);
		throw error;
	}
}

/**
 * Create a new role
 */
export async function createRole(data: any) {
	try {
		const result = await db.insert(RolesTable).values(data).returning();
		return result[0];
	} catch (error) {
		console.error('Error creating role:', error);
		throw error;
	}
}

/**
 * Update a role
 */
export async function updateRole(id: string, data: RoleUpdate) {
	try {
		const result = await db.update(RolesTable).set(data).where(eq(RolesTable.id, id)).returning();
		return result[0] || null;
	} catch (error) {
		console.error('Error updating role:', error);
		throw error;
	}
}

/**
 * Delete a role
 */
export async function deleteRole(id: string) {
	try {
		const result = await db.delete(RolesTable).where(eq(RolesTable.id, id)).returning();
		return result[0] || null;
	} catch (error) {
		console.error('Error deleting role:', error);
		throw error;
	}
}
