import type { MigrateDownArgs, MigrateUpArgs } from '@/engine/db'

// Historical no-op. This slot used to move the engine's bookkeeping tables onto
// the `eg_` prefix; new databases now create them under that name from the
// start. The file stays so the recorded migration name remains valid on
// databases that already ran it.

export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
