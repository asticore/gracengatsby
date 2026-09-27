/**
 * Ecommerce GraphQL support (payload-removal-plan.md: "GraphQL types for the
 * 5 ecommerce collections" - scoped 2026-09-26, built 2026-09-27 once the
 * user asked to finish the ecommerce cutover in one pass).
 *
 * Real Payload's own `/api/graphql` (`GRAPHQL_POST` from `@payloadcms/next/
 * routes`, still mounted - see `src/engine/next/routes.ts`) dynamically
 * builds its schema from `buildConfig()`'s sanitized `config.collections` via
 * `@payloadcms/graphql`. Removing `shopPlugin()` from `engage.config.ts`
 * drops `orders`/`carts`/`transactions`/`addresses` from that config
 * entirely, and leaves `products` registered directly (see
 * `engage.config.ts`'s own comment on why) purely to satisfy real Payload's
 * `InvalidFieldRelationship` check for `Events`/`Courses`/`Forms`' real
 * `relationTo: 'products'` fields - if that registration were left to also
 * back live GraphQL traffic, a `createProduct`/`updateProduct` mutation would
 * run through real Payload's OWN native resolvers and DB-adapter-generated
 * queries, bypassing every access-control and business-logic fix this
 * project has built into the ecommerce write path (owner-vs-role access
 * checks, the `priceInAUD` unit-conversion fix, etc - none of that exists in
 * real Payload's native pipeline for these collections, all of it lives in
 * `src/localapi`/`src/cms/db`). Both problems are solved the same way
 * `src/localapi/rest.ts` already solves the REST equivalent: a hybrid
 * dispatcher that claims full ownership of any GraphQL operation touching
 * one of these 5 collections' known root fields, routing it through the
 * exact same `engine.find/findByID/create/update/delete` calls REST already
 * uses (same access control, same business logic, same write path), and
 * falling through untouched to real Payload's own resolver for everything
 * else (the other 21 collections + 17 globals' full typed schema, unaffected
 * by any of this).
 *
 * ---------------------------------------------------------------------------
 * Deliberate simplifications vs real Payload's auto-generated GraphQL schema
 * ---------------------------------------------------------------------------
 * Confirmed via grep across `src/`/`tests/` that this app has ZERO real
 * GraphQL consumers - this surface exists so removing `shopPlugin()` doesn't
 * silently drop capability, not because anything here calls it. Given that,
 * this deliberately does NOT reproduce real Payload's fully-typed per-field
 * schema (a distinct type per collection with one field per DB column, a
 * `<Collection>WhereInput`, etc - the ~600-800 line effort the original
 * scoping pass estimated for a from-scratch build): every document, `where`
 * filter, and mutation `data` payload is the same generic `JSON` scalar. This
 * still provides a real, introspectable Query/Mutation entry per collection
 * per operation - the actual capability at risk - without hand-maintaining a
 * second, fully-typed schema that would need to be kept in lockstep with
 * these 5 shadow collection configs forever. Also not reproduced: draft/
 * versions support (matches `handleRestRequest`'s own documented scope), a
 * `count` query, and cart-item/payments sub-endpoints (those stay REST-only,
 * matching real Payload's own plugin, which never exposed them over GraphQL
 * either). A guest cart's `secret` IS supported on `Cart`/`updateCart`/
 * `deleteCart` (mirrors `rest.ts`'s `bodySecretReq`) since it costs little
 * and keeps at least read/update/delete usable for a guest cart caller -
 * `add-item`/`remove-item`/etc remain REST-only regardless.
 *
 * ---------------------------------------------------------------------------
 * Dispatch mechanics
 * ---------------------------------------------------------------------------
 * `handleEcommerceGraphQL` parses the request body's `query` with `graphql`'s
 * own `parse()`, finds the operation being run (`operationName`, or the sole
 * operation if the document only has one), and collects its top-level
 * selection field names. If the operation is a `query`/`mutation` and EVERY
 * one of those names is in this module's own known field set for that
 * operation type, it runs entirely against this module's own small schema
 * and a `Response` is returned; otherwise (any unrecognized field, a `query`
 * mixing an ecommerce field with a real-Payload-only field, introspection
 * fields, a `subscription`, or a malformed query `parse()` can't handle) this
 * returns `null` so the caller falls through to real Payload's `GRAPHQL_POST`
 * untouched - the same null-means-fall-through convention `handleRestRequest`
 * already uses. `request.clone()` is used before reading the body so the
 * original `Request` is still fully intact for that fallthrough. A caller
 * mixing an ecommerce field with a non-ecommerce field in one operation is
 * the one real gap this leaves (falls through wholesale, so the ecommerce
 * part of a mixed query goes unanswered) - not reachable by any real caller
 * today, and no worse than the surface not existing at all.
 */
import {
  type FieldNode,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  type GraphQLFieldConfigMap,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  Kind,
  type OperationDefinitionNode,
  type ValueNode,
  graphql,
  parse,
} from 'graphql'

import type { Engine } from './engine'
import { createEngine } from './engine'

type EngineUser = Parameters<Engine['find']>[0]['user']
type Ctx = { engine: Engine; user: EngineUser }

/** Minimal recursive literal-to-JS conversion for the `JSON` scalar's `parseLiteral` - covers every AST node `graphql`'s own parser can produce for a value position. */
function parseLiteralJSON(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value)
    case Kind.NULL:
      return null
    case Kind.LIST:
      return ast.values.map(parseLiteralJSON)
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {}
      for (const field of ast.fields) obj[field.name.value] = parseLiteralJSON(field.value)
      return obj
    }
    default:
      return null
  }
}

/** See this file's header, "Deliberate simplifications" - every doc/`where`/`data` value in this schema is this scalar rather than a fully-typed per-field shape. */
const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value - see src/localapi/graphql.ts for why these 5 collections are not given a fully-typed GraphQL schema.',
  parseLiteral: parseLiteralJSON,
  parseValue: (value) => value,
  serialize: (value) => value,
})

const PaginatedResultType = new GraphQLObjectType({
  name: 'PaginatedResult',
  fields: {
    docs: { type: new GraphQLList(JSONScalar) },
    hasNextPage: { type: GraphQLBoolean },
    hasPrevPage: { type: GraphQLBoolean },
    limit: { type: GraphQLInt },
    nextPage: { type: GraphQLInt },
    page: { type: GraphQLInt },
    pagingCounter: { type: GraphQLInt },
    prevPage: { type: GraphQLInt },
    totalDocs: { type: GraphQLInt },
    totalPages: { type: GraphQLInt },
  },
})

/** The 5 collections this module covers - see `readRegistry.collections` (`./registry.ts`) for the same slugs used by REST. */
const COLLECTIONS = [
  { plural: 'Products', singular: 'Product', slug: 'products' },
  { plural: 'Orders', singular: 'Order', slug: 'orders' },
  { plural: 'Carts', singular: 'Cart', slug: 'carts' },
  { plural: 'Transactions', singular: 'Transaction', slug: 'transactions' },
  { plural: 'Addresses', singular: 'Address', slug: 'addresses' },
] as const

const queryFields: GraphQLFieldConfigMap<unknown, Ctx> = {}
const mutationFields: GraphQLFieldConfigMap<unknown, Ctx> = {}

for (const coll of COLLECTIONS) {
  const isCart = coll.slug === 'carts'

  queryFields[coll.plural] = {
    type: PaginatedResultType,
    args: {
      depth: { type: GraphQLInt },
      limit: { type: GraphQLInt },
      page: { type: GraphQLInt },
      sort: { type: GraphQLString },
      where: { type: JSONScalar },
    },
    resolve: async (_src, args: { depth?: number; limit?: number; page?: number; sort?: string; where?: unknown }, ctx) =>
      ctx.engine.find({
        collection: coll.slug,
        depth: args.depth,
        limit: args.limit,
        page: args.page,
        sort: args.sort,
        user: ctx.user,
        overrideAccess: false,
        where: args.where as Parameters<Engine['find']>[0]['where'],
      }),
  }

  queryFields[coll.singular] = {
    type: JSONScalar,
    args: {
      depth: { type: GraphQLInt },
      id: { type: new GraphQLNonNull(GraphQLInt) },
      ...(isCart ? { secret: { type: GraphQLString } } : {}),
    },
    resolve: async (_src, args: { depth?: number; id: number; secret?: string }, ctx) =>
      ctx.engine.findByID({
        collection: coll.slug,
        depth: args.depth,
        id: args.id,
        user: ctx.user,
        overrideAccess: false,
        ...(isCart ? { req: { query: { secret: args.secret } } } : {}),
      }),
  }

  mutationFields[`create${coll.singular}`] = {
    type: JSONScalar,
    args: { data: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: async (_src, args: { data: Record<string, unknown> }, ctx) =>
      ctx.engine.create({ collection: coll.slug, data: args.data, user: ctx.user }),
  }

  mutationFields[`update${coll.singular}`] = {
    type: JSONScalar,
    args: {
      data: { type: new GraphQLNonNull(JSONScalar) },
      id: { type: new GraphQLNonNull(GraphQLInt) },
      ...(isCart ? { secret: { type: GraphQLString } } : {}),
    },
    resolve: async (_src, args: { data: Record<string, unknown>; id: number; secret?: string }, ctx) =>
      ctx.engine.update({
        collection: coll.slug,
        data: args.data,
        id: args.id,
        user: ctx.user,
        ...(isCart ? { req: { query: { secret: args.secret } } } : {}),
      }),
  }

  mutationFields[`delete${coll.singular}`] = {
    type: JSONScalar,
    args: {
      id: { type: new GraphQLNonNull(GraphQLInt) },
      ...(isCart ? { secret: { type: GraphQLString } } : {}),
    },
    resolve: async (_src, args: { id: number; secret?: string }, ctx) =>
      ctx.engine.delete({
        collection: coll.slug,
        id: args.id,
        user: ctx.user,
        ...(isCart ? { req: { query: { secret: args.secret } } } : {}),
      }),
  }
}

const QUERY_FIELD_NAMES = new Set(Object.keys(queryFields))
const MUTATION_FIELD_NAMES = new Set(Object.keys(mutationFields))

const ECOMMERCE_SCHEMA = new GraphQLSchema({
  mutation: new GraphQLObjectType({ name: 'Mutation', fields: mutationFields }),
  query: new GraphQLObjectType({ name: 'Query', fields: queryFields }),
})

/** Which known-field set applies to an operation's root selection, or `null` for a `subscription` (not supported - always falls through). */
function knownFieldNamesFor(operation: OperationDefinitionNode): Set<string> | null {
  if (operation.operation === 'query') return QUERY_FIELD_NAMES
  if (operation.operation === 'mutation') return MUTATION_FIELD_NAMES
  return null
}

/** See this file's header, "Dispatch mechanics", for the full fallthrough contract. `engine` defaults to a freshly-built `createEngine()`, matching `handleRestRequest`'s own convention, but is injectable for tests. */
export async function handleEcommerceGraphQL(request: Request, engine: Engine = createEngine()): Promise<Response | null> {
  let body: { operationName?: unknown; query?: unknown; variables?: unknown }
  try {
    body = await request.clone().json()
  } catch {
    return null
  }
  if (typeof body.query !== 'string') return null

  let document: ReturnType<typeof parse>
  try {
    document = parse(body.query)
  } catch {
    return null
  }

  const operationName = typeof body.operationName === 'string' ? body.operationName : undefined
  const operations = document.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION)
  const operation = operationName ? operations.find((op) => op.name?.value === operationName) : operations.length === 1 ? operations[0] : undefined
  if (!operation) return null

  const knownNames = knownFieldNamesFor(operation)
  if (!knownNames) return null

  const rootFieldNames = operation.selectionSet.selections.filter((sel): sel is FieldNode => sel.kind === Kind.FIELD).map((sel) => sel.name.value)
  if (rootFieldNames.length === 0 || !rootFieldNames.every((name) => knownNames.has(name))) return null

  const { user } = await engine.auth({ headers: request.headers })
  const variables = typeof body.variables === 'object' && body.variables !== null ? (body.variables as Record<string, unknown>) : undefined

  const result = await graphql({
    contextValue: { engine, user } satisfies Ctx,
    operationName,
    schema: ECOMMERCE_SCHEMA,
    source: body.query,
    variableValues: variables,
  })
  return Response.json(result, { status: 200 })
}