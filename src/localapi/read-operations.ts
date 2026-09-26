/**
 * Read operations - reimplemented from Payload 3.88.0's real Local API
 * `find`/`findByID`/`count` (`node_modules/payload/dist/collections/operations/
 * {find,findByID,count}.js` + their `local/*.js` wrappers) and globals'
 * `findOne` (`node_modules/payload/dist/globals/operations/{findOne,local/
 * findOne}.js`), composing stage 1a-1c (`./validators.ts` is NOT used here -
 * validation is a write-side concern, see its own file header) on top of the
 * already-proven `src/cms/db` read functions, per the Local API core stage of
 * the payload-removal plan (project doc `payload-removal-plan.md`).