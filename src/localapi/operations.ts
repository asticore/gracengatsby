/**
 * From-scratch reimplementation of Payload 3.88.0's Local API WRITE
 * operations - `create`, `update` (single-ID only), `delete` (single-ID
 * only), and `updateGlobal` - built on top of this app's already-proven
 * `src/localapi/{validators,access,hooks}.ts` (stages 1a/1b/1c) and the
 * already-cut-over `src/cms/db` data layer, so this app's eventual Payload
 * removal (see the `payload-removal-plan.md` project doc) has a write
 * pipeline that makes the exact same access/validation/hook/draft decisions
 * real Payload's `create.js` / `utilities/update.js` / `updateByID.js` /
 * `deleteByID.js` / `globals/operations/update.js` make today, for the
 * single-ID-only shape this app actually uses (confirmed by investigation:
 * this app never calls a bulk, `where`-based `update`/`delete` - every real
 * call site passes a concrete `id`).