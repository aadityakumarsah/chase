"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0f172a", color: "#f8fafc" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            fontFamily: "system-ui, sans-serif",
            padding: 24,
          }}
        >
          <section style={{ maxWidth: 440, textAlign: "center" }}>
            <h1>Chase could not start</h1>
            <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
              No call or payment action was started. Reload the application to
              recover.
            </p>
            <button
              onClick={reset}
              style={{ padding: "10px 16px", cursor: "pointer" }}
            >
              Reload
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
