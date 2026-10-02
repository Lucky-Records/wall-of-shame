import {
  handlePersonDelete,
  handlePersonPatch,
} from "../../../_lib/graphHandlers";
import {
  getCloudflareGraphStore,
  type GraphEnv,
} from "../../../_lib/cfStore";

export async function onRequestPatch(context: {
  request: Request;
  env: GraphEnv;
  params: { id: string };
}): Promise<Response> {
  return handlePersonPatch(
    context.request,
    getCloudflareGraphStore(context.env),
    context.params.id,
  );
}

export async function onRequestDelete(context: {
  request: Request;
  env: GraphEnv;
  params: { id: string };
}): Promise<Response> {
  return handlePersonDelete(
    context.request,
    getCloudflareGraphStore(context.env),
    context.params.id,
  );
}
