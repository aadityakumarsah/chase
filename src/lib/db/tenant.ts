import { sql } from "drizzle-orm";

/**
 * Tenant id of a debtor, as a scalar sub-select.
 *
 * Several helpers are only given a debtor id, but every tenant-scoped row must
 * carry its workspace. Resolving it inside the same statement keeps the write
 * atomic and makes it impossible to attribute a row to the wrong workspace by
 * passing a mismatched id from the caller.
 */
export const debtorBusinessId = (debtorId: string) =>
  sql<string>`(select "business_id" from "debtors" where "id" = ${debtorId})`;

/** Tenant id of a call, as a scalar sub-select. */
export const callBusinessId = (callId: string) =>
  sql<string>`(select "business_id" from "calls" where "id" = ${callId})`;
