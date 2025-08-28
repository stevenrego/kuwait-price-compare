import React, { useState } from "react";

export default function App() {
  const [mode, setMode] = useState("products"); // "products" | "food"
  const [term, setTerm] = useState("");
  const [city, setCity] = useState("Kuwait");   // optional for food
  // ... keep your other state (loading, error, results, sources) ...


export default function App() {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);   // always an array
  const [sources, setSources] = useState([]);   // per-retailer evidence

  async function doSearch(e) {
    e?.preventDefault?.();
    const q = term.trim();
    if (!q) return;

    try {
      setLoading(true);
      setError(null);
      setResults([]);
      setSources([]);

      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" },
      });

      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await r.text();
        throw new Error(
          `Expected JSON, got ${ct || "unknown"}. Snippet: ${text.slice(0, 140)}…`
        );
      }
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`API ${r.status}: ${body}`);
      }

      const data = await r.json();

      const list = Array.isArray(data?.results) ? data.results : [];
      setResults(list);

      const srcs = Array.isArray(data?.sources) ? data.sources : [];
      setSources(srcs);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
<div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
  <label>
    <input
      type="radio"
      name="mode"
      value="products"
      checked={mode === "products"}
      onChange={() => setMode("products")}
    />{" "}
    Products
  </label>
  <label>
    <input
      type="radio"
      name="mode"
      value="food"
      checked={mode === "food"}
      onChange={() => setMode("food")}
    />{" "}
    Food (delivery)
  </label>

  {mode === "food" && (
    <input
      value={city}
      onChange={(e) => setCity(e.target.value)}
      placeholder="City (e.g., Kuwait)"
      style={{ marginLeft: 12, padding: "8px 10px", borderRadius: 8, border: "none" }}
    />
  )}
</div>

    
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "linear-gradient(135deg, rgba(111,134,214,1) 0%, rgba(119,75,200,1) 100%)",
        color: "#fff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontWeight: 800, marginBottom: 8 }}>Kuwait Price Compare</h1>
        <p style={{ opacity: 0.85, marginTop: 0 }}>
          Live comparison across Kuwait retailers (Xcite, Blink, Eureka). Type a product below.
        </p>

        <form onSubmit={doSearch} style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search e.g. iPhone 13"
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              outline: "none",
              color: "#1f2937",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#10b981",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {error && (
          <div
            style={{
              marginTop: 16,
              background: "#FEE2E2",
              color: "#7F1D1D",
              padding: 12,
              borderRadius: 12,
            }}
          >
            {error}
          </div>
        )}

        {!error && !loading && results.length === 0 && (
          <div style={{ marginTop: 20, opacity: 0.85 }}>
            No results yet. Try searching for something.
          </div>
        )}

        {results.length > 0 && (
          <div
            style={{
              marginTop: 20,
              background: "rgba(255,255,255,0.95)",
              borderRadius: 16,
              padding: 12,
              color: "#111827",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: 8 }}>Product</th>
                  <th style={{ padding: 8 }}>Retailer</th>
                  <th style={{ padding: 8 }}>Price (KWD)</th>
                  <th style={{ padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: 8 }}>
                      <div style={{ fontWeight: 600 }}>{r.title || "—"}</div>
                    </td>
                    <td style={{ padding: 8, textTransform: "capitalize" }}>
                      {r.retailer || "—"}
                    </td>
                    <td style={{ padding: 8 }}>{r.priceNum ?? r.price ?? "—"}</td>
                    <td style={{ padding: 8 }}>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#2563eb",
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          View →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sources.length > 0 && (
          <div
            style={{
              marginTop: 14,
              background: "rgba(255,255,255,0.2)",
              borderRadius: 14,
              padding: 10,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Fetch evidence</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {sources.map((s, i) => (
                <li key={i}>
                  {s.retailer}: {s.ok ? `OK (${s.items?.length || 0} items)` : `ERR: ${s.error || "unknown"}`}
                  {typeof s.tookMs === "number" ? ` • ${s.tookMs}ms` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

