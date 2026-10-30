const sensitiveKey =
  /key|token|secret|pass(?:word|code)?|authorization|cookie|credential|database.?url|connection.?string/i;
const REDACTED = "[REDACTED]";
function cleanString(value: string, knownSecrets: string[]): string {
  let safe = value;
  for (const secret of knownSecrets)
    if (secret.length >= 4) safe = safe.split(secret).join(REDACTED);
  return safe
    .replace(/Bearer\s+[^\s"',;}]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(?:sk[-_]|rk[-_]|AIza|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_./+-]+/g,
      REDACTED,
    )
    .replace(
      /\b(?:api[_-]?key|token|secret|password|passcode|authorization)\s*[:=]\s*["']?[^\s"',;}]+/gi,
      REDACTED,
    )
    .replace(
      /\b(?:postgres(?:ql)?|https?):\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi,
      REDACTED,
    )
    .replace(/\b[A-Za-z0-9_+/-]{32,}={0,2}\b/g, (candidate) =>
      // Entity UUIDs are audit references. Secret fields and known secrets were
      // already removed above, including credentials that happen to be UUIDs.
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate,
      )
        ? candidate
        : REDACTED,
    );
}
export function redact(value: unknown, secrets?: string[]): unknown {
  const knownSecrets =
    secrets ??
    Object.entries(process.env)
      .filter(([k, v]) => sensitiveKey.test(k) && v)
      .map(([, v]) => v!);
  const seen = new WeakSet<object>();
  const visit = (entry: unknown): unknown => {
    if (typeof entry === "string") return cleanString(entry, knownSecrets);
    if (entry === null || typeof entry !== "object") return entry;
    if (seen.has(entry)) return "[Circular]";
    seen.add(entry);
    if (entry instanceof Error)
      return {
        name: entry.name,
        message: cleanString(entry.message, knownSecrets),
      };
    if (Array.isArray(entry)) return entry.map(visit);
    return Object.fromEntries(
      Object.entries(entry).map(([key, v]) => [
        key,
        sensitiveKey.test(key) ? REDACTED : visit(v),
      ]),
    );
  };
  return visit(value);
}
export const log = {
  info: (message: string, fields: unknown = {}) =>
    console.info(JSON.stringify(redact({ level: "info", message, fields }))),
  warn: (message: string, fields: unknown = {}) =>
    console.warn(JSON.stringify(redact({ level: "warn", message, fields }))),
  error: (message: string, fields: unknown = {}) =>
    console.error(JSON.stringify(redact({ level: "error", message, fields }))),
  debug: (message: string, fields: unknown = {}) => {
    if (process.env.LOG_LEVEL === "debug")
      console.debug(
        JSON.stringify(redact({ level: "debug", message, fields })),
      );
  },
};
