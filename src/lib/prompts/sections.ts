import { createHash } from "node:crypto";
import { z } from "zod";

export type PromptSection = { id: string; protected: boolean; body: string };
export type ParsedPrompt = { sections: PromptSection[] };
export function parsePrompt(source: string): ParsedPrompt {
  z.string().min(1).max(200_000).parse(source);
  const sections: PromptSection[] = [];
  let current: { id: string; lines: string[] } | undefined;
  for (const line of source.split(/\r?\n/)) {
    const open = /^<!-- section:((?:protected:)?[a-z][a-z0-9_]*) -->$/.exec(
      line,
    );
    const close = /^<!-- \/section:(.+) -->$/.exec(line);
    if (open) {
      if (current) throw new Error("Nested prompt section");
      current = { id: open[1], lines: [] };
    } else if (close) {
      if (!current || current.id !== close[1])
        throw new Error("Mismatched prompt section");
      const body = current.lines.join("\n").trim();
      if (!body || sections.some((s) => s.id === current!.id))
        throw new Error("Empty or duplicate prompt section");
      sections.push({
        id: current.id,
        protected: current.id.startsWith("protected:"),
        body,
      });
      current = undefined;
    } else if (line.includes("<!--")) throw new Error("Unknown prompt marker");
    else if (current) current.lines.push(line);
    else if (line.trim()) throw new Error("Prompt text outside sections");
  }
  if (current || !sections.length)
    throw new Error("Incomplete prompt sections");
  return { sections };
}
export function renderPrompt(source: string) {
  return parsePrompt(source)
    .sections.map((s) => s.body)
    .join("\n\n");
}
export function protectedHash(input: string | ParsedPrompt) {
  const sections = (
    typeof input === "string" ? parsePrompt(input) : input
  ).sections.filter((s) => s.protected);
  if (!sections.length) throw new Error("No protected prompt sections");
  return createHash("sha256").update(JSON.stringify(sections)).digest("hex");
}
export function assertProtectedUnchanged(before: string, after: string) {
  if (protectedHash(before) !== protectedHash(after))
    throw new Error("Protected prompt sections cannot change");
}
export function promptVariables(source: string) {
  return [
    ...new Set(
      [...source.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map((m) => m[1]),
    ),
  ].sort();
}
