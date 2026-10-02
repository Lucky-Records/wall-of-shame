import { handleGraphGet } from "../../_lib/graphHandlers";
import {
  getCloudflareGraphStore,
  type GraphEnv,
} from "../../_lib/cfStore";

export async function onRequestGet(context: {
  env: GraphEnv;
}): Promise<Response> {
  return handleGraphGet(getCloudflareGraphStore(context.env));
}
