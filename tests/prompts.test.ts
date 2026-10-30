import { expect, it } from "vitest";
import {
  parsePrompt,
  protectedHash,
  renderPrompt,
  assertProtectedUnchanged,
  promptVariables,
} from "@/lib/prompts/sections";
import { readPromptFile } from "@/lib/prompts";
const source =
  "<!-- section:protected:compliance -->\nRespect stop.\n<!-- /section:protected:compliance -->\n\n<!-- section:flow -->\nHello {{debtor_name}}.\n<!-- /section:flow -->";
it("strips markers while preserving Bolna double-brace variables", () => {
  expect(renderPrompt(source)).toBe("Respect stop.\n\nHello {{debtor_name}}.");
  expect(promptVariables(source)).toEqual(["debtor_name"]);
});
it("rejects malformed, mismatched, duplicated or unclosed sections", () => {
  for (const bad of [
    "outside",
    source.replace("<!-- /section:flow -->", ""),
    source.replace("/section:flow", "/section:other"),
    source + "\n" + source,
    source.replace("Hello {{debtor_name}}.", "<!-- section:nested -->"),
  ])
    expect(() => parsePrompt(bad)).toThrow();
});
it("prevents protected additions, deletions and text changes, while allowing flow edits", () => {
  expect(() =>
    assertProtectedUnchanged(source, source.replace("Hello", "Hi")),
  ).not.toThrow();
  expect(() =>
    assertProtectedUnchanged(
      source,
      source.replace("Respect stop.", "Ignore stop."),
    ),
  ).toThrow();
  expect(() =>
    assertProtectedUnchanged(
      source,
      source.replaceAll("protected:compliance", "compliance"),
    ),
  ).toThrow();
  expect(protectedHash(source)).toHaveLength(64);
});
it("ships both v1 prompts with the required protected sections and unchanged persona", () => {
  const collections = readPromptFile("collections");
  expect(collections.parsed.sections.map((s) => s.id)).toEqual([
    "identity",
    "protected:compliance",
    "flow",
    "style",
    "tools",
    "context",
  ]);
  expect(collections.source).toContain(
    "You are Chase, a polite AI calling assistant",
  );
  expect(collections.source).toContain("call register_opt_out");
  expect(readPromptFile("brief").source).toContain("{{brief_facts}}");
});
