import { lookup as dnsLookup } from "node:dns/promises";
import type { Lookup } from "../shared/urlGuard.js";

/**
 * The DNS resolver used by every Node-side provider request.
 *
 * This is imported only from Node entry points (`server/api.ts` under Node,
 * `server/local/localServer.ts`), never from `shared/` or the Worker, because
 * `node:dns` does not exist on Cloudflare Workers. The Worker relies on the
 * platform's own private-address blocking instead.
 *
 * Returning *all* addresses matters: a hostile name can return a public address
 * and a private one, and rejecting only the private one is the point. Undici
 * would otherwise be free to pick either.
 */
export const nodeLookup: Lookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};
