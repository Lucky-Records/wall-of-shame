import { listLogins, requireAdmin, type AdminCtx } from "../../_lib/admin";

export async function onRequestGet(ctx: AdminCtx): Promise<Response> {
  const auth = requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  return listLogins(auth.db, ctx.request);
}
