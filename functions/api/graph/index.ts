import { handleGraphGet } from "../../_lib/graphHandlers";
import { getCloudflareGraphStore } from "../../_lib/cfStore";

export async function onRequestGet(): Promise<Response> {
  return handleGraphGet(getCloudflareGraphStore());
}
