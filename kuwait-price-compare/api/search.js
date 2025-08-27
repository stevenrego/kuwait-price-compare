// CommonJS on Vercel Node 20
const { searchXcite } = require("../lib/adapters/xcite");
const { searchBlink } = require("../lib/adapters/blink");
const { searchEureka } = require("../lib/adapters/eureka");
const { sanitizeQuery } = require("../lib/normalize");

module.exports = async (req, res) => {
  try {
    const q = sanitizeQuery(req.query.q || req.body?.q || "");
    if (!q) return res.status(400).json({ error: "Missing query ?q=" });

    const started = Date.now();
    const [xcite, blink, eureka] = await Promise.allSettled([
      searchXcite(q, 5),
      searchBlink(q, 5),
      searchEureka(q, 5),
    ]);

    const pack = (name, p) => ({
      retailer: name,
      ok: p.status === "fulfilled",
      tookMs: p.status === "fulfilled" ? p.value._meta?.tookMs : undefined,
      error: p.status === "rejected" ? (p.reason?.message || String(p.reason)) : undefined,
      items: p.status === "fulfilled" ? p.value.items : [],
    });

    const payload = {
      query: q,
      currency: "KWD",
      tookMs: Date.now() - started,
      sources: [pack("xcite", xcite), pack("blink", blink), pack("eureka", eureka)],
    };

    // flatten + sort by price asc for convenience on the client
    payload.results = payload.sources
      .flatMap(s => s.items.map(x => ({ ...x, retailer: s.retailer })))
      .sort((a, b) => (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "server_error" });
  }
};
