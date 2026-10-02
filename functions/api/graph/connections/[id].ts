import { handleConnectionDelete } from "../../../_lib/graphHandlers";
import {
  getCloudflareGraphStore,
  type GraphEnv,
} from "../../../_lib/cfStore";

export async function onRequestDelete(context: {
  request: Request;
  env: GraphEnv;
  params: { id: string };
}): Promise<Response> {
  return handleConnectionDelete(
    context.request,
    getCloudflareGraphStore(context.env),
    decodeURIComponent(context.params.id),
  );
}
