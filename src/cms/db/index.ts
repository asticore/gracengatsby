/**
 * The CMS's own data layer - the replacement in progress for src/engine/db.ts.
 *
 * STATUS: proof of concept, not wired in anywhere yet. src/engine/db.ts still
 * re-exports the original engine's real the vendor package adapter, and the live
 * site's reads/writes go through that adapter exclusively. This module talks
 * to the same D1 database and the same tables from the side, as a testbed -
 * see tests/int/cms-db-*.int.spec.ts, which prove a row written through this
 * code reads back correctly both here and through the original engine's own engine.
 *
 * PROGRESS SO FAR
 *
 * Phase 1 hand-wrote a schema and CRUD ops for one collection (Faqs) to prove
 * the approach against a real table before generalising. Phase 2 generalised
 * it: ./schema/generate.ts derives a drizzle table straight from a real
 * The original engine CollectionConfig's own field list, and ./generic.ts provides
 * find/create/update/delete/count for any table it produces - a collection's
 * own file (./collections/*.ts) is now just that factory call plus the types
 * callers see. EventRSVPs proved a single-target relationship field (`event`
 * -> an `event_id` FK column, still one row per document - the original engine only
 * needs a child table for hasMany/polymorphic relationships).
 *
 * Phase 3 added row/collapsible flattening (their fields land on the parent
 * table, same as the original engine's own schema does - confirmed against
 * eg_membership_tiers) and array fields as child tables: MembershipTiers'
 * `benefits` array generates eg_membership_tiers_benefits (`_order`,
 * `_parent_id` cascading on delete, a string `id` per row, then the array's
 * own subfields), and ./generic.ts assembles/replaces those child rows as
 * part of the parent document's find/create/update, matching the original engine's
 * document shape.
 *
 * Phase 4 added `blocks` fields and hasMany/polymorphic relationship/upload
 * fields together, because in this app's real config the second only ever
 * appears inside `blocks`.
 *
 * Phase 5 tightened the schema/generic coupling: a table's types now know which
 * fields are arrays/relationships (their Postgres types), so ./generic.ts assembles
 * them correctly without hardcoding. Added rollback logic to handle a stale schema
 * (old field list in .ts, fresh one from the config) and detected a schema error
 * (field in config but not in table - e.g. table not yet migrated after the config
 * change, or typo).
 *
 * Phase 6 extends generic CRUD to include all the finder methods on the original
 * engine's own class (`findOne`, `count`, pagination helpers, text search).
 *
 * NOTES ON ARCHITECTURE AND MIGRATION PATH
 *
 * The original engine is Payload CMS, whose schema/CRUD APIs do not match
 * what we're building here. Payload was chosen for getting a feature-complete
 * auth/admin system before we started; it has grown into more than we now need.
 * This code is the path to a smaller, tighter system.
 *
 * When this module is ready (all collections migrated, CRUD patterns validated),
 * src/engine/db.ts will start exporting from here instead of from the Payload
 * package, and all the Payload-specific code (src/db, src/engine/db) can be
 * phased out.
 *
 * The schema migration is mechanical: each collection config becomes a Drizzle
 * table definition (generated via ./schema/generate.ts), and we hand-write a
 * .ts file for each that calls the generic CRUD factory with the config +
 * table. The data migration is a one-shot: read every row from the old system,
 * reformat it to the new shape, and write to the new tables. (The test suite
 * proves the formats round-trip correctly.)
 *
 * The original engine serves as the source of truth for field types and
 * validation rules, at least until this module is wired in to the API and
 * forms. (So far, generic CRUD gives us straight storage - no schema-driven
 * UI generation yet.)
 *
 * Payload's auth token and admin session management are imported as-is: Payload
 * controllers (not touched by this refactor) still handle login + token grant.
 * In the future, we may want our own sessions; for now, we reuse those tokens
 * and the Payload session model.
 */

import { sql } from 'drizzle-orm';

// This is the root index for the cms database layer: when fully wired in,
// everything under src/features/* that reads the database will import from here
// instead of from src/engine/db.ts (which imports from Payload).

// Right now, the site still uses the original engine (Payload). When we're
// ready to switch, we'll update the re-exports here and in src/engine/db.ts.

// Export everything that the app currently reaches through src/engine/db.ts:
// this is the interface contract all features will see.

export { db, getDatabase } from './client';

// Collections - these are the records in the database
export { Faqs, createFaq, findFaqs, updateFaq, deleteFaq } from './collections/Faqs';
export { Users, createUser, findUsers, updateUser, deleteUser, findUserById, findUserByEmail, countUsers } from './collections/Users';
export { Roles, createRole, findRoles, updateRole, deleteRole } from './collections/Roles';
export { EventRSVPs, createEventRSVP, findEventRSVPs, updateEventRSVP, deleteEventRSVP } from './collections/EventRSVPs';
export { MembershipTiers, createMembershipTier, findMembershipTiers, updateMembershipTier, deleteMembershipTier } from './collections/MembershipTiers';
export { Events, createEvent, findEvents, updateEvent, deleteEvent } from './collections/Events';
export { GettingStartedTasks, createGettingStartedTask, findGettingStartedTasks, updateGettingStartedTask, deleteGettingStartedTask } from './collections/GettingStartedTasks';

// Types - types the app needs to import for type-checking
export type {
	Faq,
	FaqUpdate,
} from './collections/Faqs';

export type {
	User,
	UserUpdate,
	UserInsert,
} from './collections/Users';

export type {
	Role,
	RoleUpdate,
} from './collections/Roles';

export type {
	EventRSVP,
	EventRSVPUpdate,
} from './collections/EventRSVPs';

export type {
	MembershipTier,
	MembershipTierUpdate,
} from './collections/MembershipTiers';

export type {
	Event,
	EventUpdate,
} from './collections/Events';

export type {
	GettingStartedTask,
	GettingStartedTaskUpdate,
} from './collections/GettingStartedTasks';

// Re-export SQL utility for any raw queries (rare, but kept as a fallback)
export { sql };
