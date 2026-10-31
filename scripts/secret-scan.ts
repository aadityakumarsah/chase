import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const available = spawnSync("gitleaks", ["version"], { stdio: "ignore" });
if (available.status === 0) {
  const result = spawnSync(
    "gitleaks",
    ["git", "--redact", "--no-banner", "--exit-code", "1"],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

const listed = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
);
if (listed.status !== 0)
  throw new Error("Could not enumerate repository files");

const patterns = [
  new RegExp("b" + "n-[A-Za-z0-9_-]{16,}", "g"),
  new RegExp("s" + "k-ant-[A-Za-z0-9_-]{16,}", "g"),
  new RegExp("r" + "zp_(?:live|test)_[A-Za-z0-9]{8,}", "g"),
  new RegExp("E" + "AA[A-Za-z0-9]{20,}", "g"),
  new RegExp("A" + "C[0-9a-fA-F]{32}", "g"),
];
const findings: string[] = [];
for (const file of listed.stdout.split("\0").filter(Boolean)) {
  const bytes = readFileSync(file);
  if (bytes.length > 2_000_000 || bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  if (patterns.some((pattern) => ((pattern.lastIndex = 0), pattern.test(text))))
    findings.push(file);
}
if (findings.length) {
  console.error(
    `Potential credential pattern found in: ${findings.join(", ")}`,
  );
  process.exit(1);
}
console.log(
  "Secret scan clean (repository files; credential values not printed).",
);
