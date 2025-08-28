// api/food.js — Kuwait delivery price compare with platform-aware discovery + debug
// Deps: axios ^1.x, cheerio ^1.x

const axios = require("axios");
const cheerio = require("cheerio");

/** Platforms */
const PLATFORMS = [
  { name: "talabat",   domain: "talabat.com",      base: "https://www.talabat.com" },
  { name: "deliveroo", domain: "deliveroo.com.kw", base: "https://deliveroo.com.kw" },
  { name: "jahez",     domain: "jahez.net",        base: "https://jahez.net" }, // KWT varies
];

// Include Zyda / Ordable subdomains via env (optional)
const EXTRA_DOMAINS = [
  ...String(process.env.ZYDA_DOMAINS || "")
    .split(",").map(s => s.trim()).filter(Boolean).map(d => ({ name: "zyda", domain: d, base: `https://${d}` })),
  ...String(process.env.ORDABLE_DOMAINS || "")
    .split(",").map(s => s.trim()).filter(Boolean).map(d => ({ name: "ordable", domain: d, base: `https://${d}` })),
];

const TARGETS = [...PLATFORMS, ...EXTRA_DOMAINS];

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 (+kuwait-food-compare/1.2)",
  "Accept-Language": "en-KW,en;q=0.8,ar;q=0.6",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Cache-Control": "no-cache",
};

/* ---------- utils ---------- */
const ARABIC_DIGITS = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
const toAscii = s => String(s || "").replace(/[٠-٩]/g, d => ARABIC_DIGITS[d] ?? d);
const parseKWD = s => {
  const m = toAscii(s).replace(/,/g,"").replace(/\s+/g," ")
    .replace(/(KWD|KD|د\.?ك|ك\.?د)/gi,"").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
};
const norm = s => toAscii(s).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/gi," ").replace(/\s+/g," ").trim();
const tokenize = s => Array.from(new Set(norm(s).split(" ").filter(Boolean)));
const tokenScore = (a,b) => {
  const A = new Set(tokenize(a)), B = new Set(tokenize(b));
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size || 1;
  const sub = norm(b).includes(norm(a)) || norm(a).includes(norm(b)) ? 0.15 : 0;
  return inter/union + sub;
};
const dedupeBy = (arr, keyFn) => {
  const seen = new Set();
  return arr.filter(x => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
};

async function httpGet(url, { timeout=15000, headers={}, params } = {}) {
  const t0 = Date.now();
  const resp = await axios.get(url, {
    timeout, params, maxRedirects: 5,
    headers: { ...DEFAULT_HEADERS, ...headers },
    responseType: "text",
    validateStatus: s => s >= 200 && s < 400
  });
  const finalUrl = resp.request?.res?.responseUrl || url;
  return { url: finalUrl, status: resp.status, data: resp.data, tookMs: Date.now() - t0 };
}

/* ---------- extraction ---------- */
function extractFromJSONLD(html) {
  const $ = cheerio.load(html); const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text().trim(); if (!raw) return;
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [JSON.parse(raw)];
      for (const obj of arr) {
        if (obj["@type"] === "Menu" || obj["@type"] === "MenuSection" || obj["@type"] === "MenuItem") {
          const stack = [obj];
          while (stack.length) {
            const cur = stack.pop();
            if (cur["@type"] === "MenuItem") {
              const name = cur.name || cur.title;
              const price = cur?.offers?.price ?? cur?.offers?.[0]?.price;
              if (name && price) out.push({ name, price: parseKWD(price) });
            }
            for (const k of ["hasMenuSection","hasMenuItem","menuItems","itemListElement"]) {
              const v = cur[k]; if (!v) continue;
              (Array.isArray(v) ? v : [v]).forEach(x => stack.push(x));
            }
          }
        }
      }
    } catch {}
  });
  return out.filter(x => x.price);
}

function extractFromNextData(html) {
  const $ = cheerio.load(html);
  const raw = $('#__NEXT_DATA__').text() || $('script#__NEXT_DATA__').text();
  if (!raw) return [];
  let json; try { json = JSON.parse(raw); } catch { return []; }
  const out = [];
  (function scan(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(scan);
    if (typeof node === "object") {
      const keys = Object.keys(node);
      if ((keys.includes("name") || keys.includes("title")) &&
          (keys.includes("price") || keys.includes("priceString") || keys.includes("amount"))) {
        const name = node.name || node.title;
        const price = node.price || node.amount || node.priceString;
        const p = parseKWD(price);
        if (name && p) out.push({ name, price: p });
      }
      for (const k of keys) scan(node[k]);
    }
  })(json);
  return out;
}

function extractFromVisible(html) {
  const $ = cheerio.load(html);
  const nodes = [];
  $('[class*="price"],[id*="price"],[data-test*="price"],span,div').each((_, el) => {
    const t = ($(el).text() || "").replace(/\s+/g, " ").trim();
    if (/(\d+(?:[.,]\d+)?)\s*(KWD|KD|د\.?ك|ك\.?د)/i.test(t)) nodes.push({ el, text: t });
  });
  const items = [];
  for (const n of nodes.slice(0, 200)) {
    const price = parseKWD(n.text); if (!price) continue;
    const $el = cheerio(n.el);
    const name =
      $el.closest("[class*='item'],[class*='row'],[class*='card'],[data-test*='item']").find("h3,h4,h2").first().text().trim() ||
      $el.parent().find("h3,h4,h2").first().text().trim() ||
      $el.prevAll("h3,h4").first().text().trim() ||
      "";
    if (name) items.push({ name, price });
    if (items.length > 20) break;
  }
  return items;
}

/* ---------- discovery ---------- */
async function discoverViaCSE(query, domain, city, limit=8) {
  const cx = process.env.GOOGLE_CSE_ID;
  const key = process.env.GOOGLE_API_KEY;
  if (!cx || !key) return [];
  const q = `site:${domain} ${query} ${city ? `"${city}"` : ""}`;
  const { data } = await axios.get("https://www.googleapis.com/customsearch/v1", {
    params: { q, cx, key, num: limit, safe: "off" }, timeout: 10000
  });
  return (data?.items || []).map(i => i.link).filter(Boolean);
}

async function discoverViaDuckDuckGo(query, domain, city, limit=8) {
  try {
    const r = await httpGet("https://duckduckgo.com/html/", {
      params: { q: `site:${domain} ${query} ${city||""}` }
    });
    const $ = cheerio.load(r.data);
    const urls = [];
    $("a.result__a").each((_, a) => {
      const h = $(a).attr("href");
      if (h && h.includes(domain)) urls.push(h);
    });
    $('a[href^="https://duckduckgo.com/l/"]').each((_, a) => {
      const h = $(a).attr("href");
      if (h && h.includes(domain)) urls.push(h);
    });
    return Array.from(new Set(urls)).slice(0, limit);
  } catch { return []; }
}

async function discoverViaSiteSearch(query, base, limit=8) {
  try {
    const r = await httpGet(`${base}/search`, { params: { q: query }, timeout: 12000 });
    const $ = cheerio.load(r.data);
    const urls = new Set();
    $('a[href]').each((_, a) => {
      const h = String($(a).attr("href") || "");
      if (/\/(menu|product|item|restaurant|restaurants|items|products)/i.test(h)) {
        urls.add(h.startsWith("http") ? h : base + h);
      }
    });
    return Array.from(urls).slice(0, limit);
  } catch { return []; }
}

/** NEW: platform-aware discovery with page parsing */
async function discoverViaPlatformSearch(query, target, city, limit=8) {
  // DELIVEROO
  if (target.domain.includes("deliveroo.com.kw")) {
    const candidates = [
      `${target.base}/en/search?keywords=${encodeURIComponent(query)}`,
      `${target.base}/en/kwt/search?keywords=${encodeURIComponent(query)}`,
      `${target.base}/en/kuwait/search?keywords=${encodeURIComponent(query)}`,
    ];
    const urls = new Set();
    for (const u of candidates) {
      try {
        const r = await httpGet(u, { timeout: 15000 });
        const $ = cheerio.load(r.data);
        // Grab menu / restaurant links
        $('a[href]').each((_, a) => {
          const h = String($(a).attr("href") || "");
          if (/\/menu/i.test(h) || /\/restaurant/i.test(h) || /\/restaurants/i.test(h)) {
            urls.add(h.startsWith("http") ? h : `${target.base}${h.startsWith("/") ? "" : "/"}${h}`);
          }
        });
        // Always include the search page itself (Next data often has priced items)
        urls.add(r.url);
      } catch { /* continue other candidates */ }
    }
    if (urls.size) return Array.from(urls).slice(0, limit);
    return candidates.slice(0, 1); // fallback
  }

  // TALABAT
  if (target.domain.includes("talabat.com")) {
    const url = `https://www.talabat.com/kuwait/search?q=${encodeURIComponent(query)}`;
    try {
      const r = await httpGet(url, { timeout: 15000 });
      const $ = cheerio.load(r.data);
      const urls = new Set([r.url]);
      $("a[href]").each((_, a) => {
        const h = String($(a).attr("href") || "");
        if (/\/kuwait\/restaurant\//i.test(h) || /\/menu/i.test(h) || /\/brands\//i.test(h)) {
          urls.add(h.startsWith("http") ? h : `https://www.talabat.com${h}`);
        }
      });
      return Array.from(urls).slice(0, limit);
    } catch {
      return [url];
    }
  }

  return [];
}

async function discoverUrls(target, query, city) {
  // 0) Best: platform-specific discovery
  let urls = await discoverViaPlatformSearch(query, target, city, 8);
  urls = urls.filter(Boolean);
  if (urls.length) return Array.from(new Set(urls)).slice(0, 8);

  // 1) Google CSE
  urls = await discoverViaCSE(query, target.domain, city, 10);

  // 2) DuckDuckGo fallback
  if (!urls.length) urls = await discoverViaDuckDuckGo(query, target.domain, city, 10);

  // 3) On-site search last
  if (!urls.length) urls = await discoverViaSiteSearch(query, target.base, 10);

  const MENU_RX = /(menu|item|product|order|restaurant|restaurants|items|products)/i;
  urls = urls.filter(u => MENU_RX.test(u)).slice(0, 8);
  return Array.from(new Set(urls));
}

/* ---------- run per platform ---------- */
async function runPlatform(target, query, city, limit=8, emitDebug=false) {
  const started = Date.now();
  const urls = await discoverUrls(target, query, city);
  let items = [];

  for (const url of urls) {
    try {
      const page = await httpGet(url, { timeout: 15000 });
      const found =
        extractFromJSONLD(page.data) ||
        extractFromNextData(page.data) ||
        extractFromVisible(page.data);

      const $ = cheerio.load(page.data);
      const title = $('meta[property="og:title"]').attr("content") || $("title").text().trim();

      (found || [])
        .filter(x => x && x.name && x.price)
        .forEach(x => items.push({
          item: x.name,
          priceNum: x.price,
          price: `${x.price} KWD`,
          url: page.url,
          platform: target.name,
          restaurant: title ? title.replace(/\s*\|\s*.*$/, "") : undefined
        }));

      if (items.length >= limit) break;
    } catch { /* keep going */ }
  }

  items = dedupeBy(items, x => `${x.platform}|${norm(x.restaurant || "")}|${norm(x.item)}`);

  return {
    _meta: { discovered: urls.length, used: Math.min(urls.length, limit), tookMs: Date.now() - started },
    items: items.slice(0, limit),
    ...(emitDebug ? { debugUrls: urls.slice(0, 8) } : {})
  };
}

/* ---------- handler ---------- */
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const q = String(req.query.q || req.body?.q || "").trim().slice(0, 120);
  const city = String(req.query.city || req.body?.city || "Kuwait").trim();
  const DEBUG = String(req.query.debug || req.body?.debug || "") === "1";
  if (!q) return res.status(400).json({ error: "Missing query ?q=" });

  try {
    const started = Date.now();
    const tasks = TARGETS.map(t => runPlatform(t, q, city, 8, DEBUG));
    const settled = await Promise.allSettled(tasks);

    const sources = settled.map((p, i) => ({
      platform: TARGETS[i].name,
      domain: TARGETS[i].domain,
      ok: p.status === "fulfilled",
      tookMs: p.status === "fulfilled" ? p.value._meta?.tookMs : undefined,
      meta: p.status === "fulfilled" ? p.value._meta : undefined,
      error: p.status === "rejected" ? (p.reason?.message || String(p.reason)) : undefined,
      items: p.status === "fulfilled" ? p.value.items : [],
      ...(DEBUG && p.status === "fulfilled" ? { debugUrls: p.value.debugUrls || [] } : {})
    }));

    const scored = sources.flatMap(s =>
      s.items.map(it => ({ ...it, score: tokenScore(q, it.item) }))
    );

    const results = scored
      .filter(r => r.score >= 0.25)
      .sort((a, b) => (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity))
      .slice(0, 30);

    res.status(200).json({
      type: "food",
      query: q,
      city,
      tookMs: Date.now() - started,
      sources,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "server_error" });
  }
};
