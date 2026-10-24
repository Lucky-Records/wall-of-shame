import { createMember, listMembers, requireAdmin, type AdminCtx } from "../../_lib/admin";

export async function onRequestGet(ctx: AdminCtx): Promise<Response> {
  const auth = requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  return listMembers(auth.db);
}

export async function onRequestPost(ctx: AdminCtx): Promise<Response> {
  const auth = requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  return createMember(auth.db, ctx.request);
}
