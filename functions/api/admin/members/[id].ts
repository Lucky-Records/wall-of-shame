import { deleteMember, requireAdmin, updateMember, type AdminCtx } from "../../../_lib/admin";

export async function onRequestPatch(ctx: AdminCtx): Promise<Response> {
  const auth = requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  return updateMember(ctx, auth.db, auth.me);
}

export async function onRequestDelete(ctx: AdminCtx): Promise<Response> {
  const auth = requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  return deleteMember(ctx, auth.db, auth.me);
}
