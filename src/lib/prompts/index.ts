import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbExecutor } from "@/lib/db";
import { promptVersions } from "@/lib/db/schema";
import { emitEvent } from "@/lib/events";
import { parsePrompt, protectedHash, renderPrompt } from "./sections";

export const agentKeySchema = z.enum(["collections", "brief"]);
export type AgentKey = z.infer<typeof agentKeySchema>;

const PROMPT_DIR = path.join(process.cwd(), "prompts");
const FILE = /^([a-z]+)\.v(\d+)\.md$/;

/** Prompt files seed the database; the runtime always reads the active row. */
export function readPromptFile(agentKey: AgentKey, version?: number) {
  const key = agentKeySchema.parse(agentKey);
  const candidates = readdirSync(PROMPT_DIR)
    .map((name) => ({ name, match: FILE.exec(name) }))
    .filter((f) => f.match && f.match[1] === key)
    .map((f) => ({ name: f.name, version: Number(f.match![2]) }))
    .sort((a, b) => b.version - a.version);
  const chosen = version
    ? candidates.find((c) => c.version === version)
    : candidates[0];
  if (!chosen) throw new Error(`No prompt file for agent "${key}"`);
  const source = readFileSync(path.join(PROMPT_DIR, chosen.name), "utf8");
  const parsed = parsePrompt(source);
  return { file: chosen.name, version: chosen.version, source, parsed };
}

/**
 * Registering is idempotent for an unchanged file. A changed body under an
 * existing version number is rejected: versions are immutable so that a call
 * logged against a prompt version stays reproducible.
 */
export async function registerPromptVersion(
  input: {
    agentKey: AgentKey;
    source: string;
    version: number;
    createdBy?: "seed" | "prompt_pr" | "manual";
    notes?: string;
    activate?: boolean;
  },
  db: DbExecutor = getDb(),
) {
  const agentKey = agentKeySchema.parse(input.agentKey);
  const version = z.number().int().positive().max(100_000).parse(input.version);
  const hash = protectedHash(input.source);
  const activate = input.activate ?? true;
  const [existing] = await db
    .select()
    .from(promptVersions)
    .where(
      and(
        eq(promptVersions.agentKey, agentKey),
        eq(promptVersions.version, version),
      ),
    );
  if (
    existing &&
    !isSeedPlaceholder(existing) &&
    existing.body !== input.source
  )
    throw new Error(
      `Prompt ${agentKey} v${version} already exists with different text; add a new version instead`,
    );
  if (existing && isSeedPlaceholder(existing)) {
    await db
      .update(promptVersions)
      .set({ body: input.source, protectedHash: hash, notes: input.notes })
      .where(eq(promptVersions.id, existing.id));
    existing.body = input.source;
    existing.protectedHash = hash;
  }
  const row =
    existing ??
    (
      await db
        .insert(promptVersions)
        .values({
          agentKey,
          version,
          body: input.source,
          protectedHash: hash,
          createdBy: input.createdBy ?? "seed",
          notes: input.notes,
          isActive: false,
        })
        .returning()
    )[0];
  if (activate && !row.isActive) {
    // The partial unique index allows one active row per agent; clear first.
    await db
      .update(promptVersions)
      .set({ isActive: false })
      .where(
        and(
          eq(promptVersions.agentKey, agentKey),
          ne(promptVersions.id, row.id),
        ),
      );
    await db
      .update(promptVersions)
      .set({ isActive: true })
      .where(eq(promptVersions.id, row.id));
    row.isActive = true;
  }
  if (!existing)
    await emitEvent(
      "prompt.version.registered",
      { payload: { agentKey, version, protectedHash: hash } },
      db,
    );
  return row;
}

export async function activePrompt(
  agentKey: AgentKey,
  db: DbExecutor = getDb(),
) {
  const key = agentKeySchema.parse(agentKey);
  const [row] = await db
    .select()
    .from(promptVersions)
    .where(
      and(eq(promptVersions.agentKey, key), eq(promptVersions.isActive, true)),
    );
  if (!row) throw new Error(`No active prompt for agent "${key}"`);
  return row;
}

/** The prompt text Bolna receives for the active version. */
export async function activePromptBody(
  agentKey: AgentKey,
  db: DbExecutor = getDb(),
) {
  const row = await activePrompt(agentKey, db);
  return {
    id: row.id,
    version: row.version,
    protectedHash: row.protectedHash,
    rendered: renderPrompt(row.body),
  };
}

export {
  parsePrompt,
  renderPrompt,
  protectedHash,
  promptVariables,
} from "./sections";

function isSeedPlaceholder(row: typeof promptVersions.$inferSelect) {
  return (
    row.createdBy === "seed" &&
    !row.isActive &&
    row.version === 1 &&
    row.body.startsWith("PART 4 PLACEHOLDER — ")
  );
}

/** First sync replaces only the inactive seed placeholder, never active edits. */
export async function ensureActivePrompt(agentKey: AgentKey) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      (await import("drizzle-orm"))
        .sql`select pg_advisory_xact_lock(hashtext(${`prompt:${agentKey}`}))`,
    );
    const [active] = await tx
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.agentKey, agentKey),
          eq(promptVersions.isActive, true),
        ),
      );
    if (active) {
      protectedHash(active.body);
      return active;
    }
    const file = readPromptFile(agentKey, 1);
    return registerPromptVersion(
      { agentKey, source: file.source, version: 1, activate: true },
      tx,
    );
  });
}
