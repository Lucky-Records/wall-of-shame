import { handleConnectionsPost } from "../../_lib/graphHandlers";
import {
  getCloudflareGraphStore,
  type GraphEnv,
} from "../../_lib/cfStore";

export async function onRequestPost(context: {
  request: Request;
  env: GraphEnv;
}): Promise<Response> {
  return handleConnectionsPost(
    context.request,
    getCloudflareGraphStore(context.env),
  );
}
