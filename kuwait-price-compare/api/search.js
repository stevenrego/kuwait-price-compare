// api/search.js — Kuwait price compare with URL discovery (CSE/duckduckgo) + robust price parse
// Deps: axios ^1.x, cheerio ^1.x

const axios = require("axios");
const cheerio = require("cheerio");

const RETAILERS = [
  { name: "xcite", domain: "xcite.com", base: "https://www.xcite.com" },
  { name: "blink", domain: "blink.com.kw", base: "https://www.blink.com.kw" },
  { name: "eureka", domain: "eureka.com.kw", base: "https://www.eureka.com.kw" },
  { name: "best", domain: "best.com.kw", base: "https://www.best.com.kw" },
  { name: "lulu", domain: "luluhypermarket.com", base: "https://www.luluhypermarket.com/en-kw" },
  { name: "carrefour", domain: "carrefourkuwait.com", base: "https://www.carrefourkuwait.com" },
];

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 (+kuwait-price-compare/1.2)",
  "Accept-Language": "en-KW,en;q=0.8,ar;q=0.6",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Cache-Control": "no-cache",
};

const ARABIC_DIGITS = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
const toAsciiDigits = (s="") => s.replace(/[٠-٩]/g, d => ARABIC_DIGITS[d] ?? d);

function parsePriceKWD(str="") {
  const cleaned = toAsciiDigits(String(str))
    .replace(/\s+/g, " ")
    .replace(/,/g, "")
    .replace(/(KWD|KD|د\.?ك|ك\.?د)/gi, "")
    .trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

function extractPriceFromHTML(html) {
  const $ = cheerio.load(html);

  // JSON-LD
  let jsonPrice;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const txt = $(el).contents().text().trim();
      if (!txt) return;
      const arr = Array.isArray(JSON.parse(txt)) ? JSON.parse(txt) : [JSON.parse(txt)];
      for (const obj of arr) {
        if (obj["@type"] === "Product") {
          const p = obj?.offers?.price ?? obj?.offers?.[0]?.price;
          if (p) { jsonPrice = parsePriceKWD(String(p)); return false; }
        }
        if (obj["@type"] === "ItemList" && Array.isArray(obj.itemListElement)) {
          for (const it of obj.itemListElement) {
            const prod = it.item || it;
            const p = prod?.offers?.price ?? prod?.offers?.[0]?.price;
            if (p) { jsonPrice = parsePriceKWD(String(p)); return false; }
          }
        }
      }
    } catch {}
  });
  if (jsonPrice) return jsonPrice;

  // meta/itemprop
  for (const sel of [
    'meta[itemprop="price"]',
    'meta[property="product:price:amount"]',
    'meta[name="twitter:data1"]'
  ]) {
    const v = $(sel).attr("content");
    const n = parsePriceKWD(v);
    if (n) return n;
  }

  // visible nodes
  const hits = [];
  $('[class*="price"], [class*="Price"], [id*="price"], [itemprop="price"], span, div').slice(0, 600).each((_, el) => {
    const t = ($(el).text() || "").replace(/\s+/g, " ").trim();
    if (/(\d+(?:[.,]\d+)?)\s*(KWD|KD|د\.?ك|ك\.?د)/i.test(t)) hits.push(t);
  });
  for (const t of hits) {
    const n = parsePriceKWD(t); if (n) return n;
  }

  // whole HTML fallback
  const m = toAsciiDigits(html).match(/(\d+(?:\.\d+)?)\s*(KWD|KD|د\.?ك|ك\.?د)/i);
  if (m) return Number(m[1]);
  return undefined;
}

async function httpGet(url, { timeout = 15000, headers = {}, params } = {}) {
  const t0 = Date.now();
  const r = await axios.get(url, {
    timeout, params,
    headers: { ...DEFAULT_HEADERS, ...headers },
    responseType: "text",
    maxRedirects: 5,
    validateStatus: s => s >= 200 && s < 400
  });
  const finalUrl = r.request?.res?.responseUrl || url;
  return { url: finalUrl, status: r.status, data: r.data, tookMs: Date.now() - t0 };
}

// --- URL discovery via Google CSE (preferred) ---
async function discoverViaCSE(query, domain, limit=6) {
  const cx = process.env.GOOGLE_CSE_ID;
  const key = process.env.GOOGLE_API_KEY;
  if (!cx || !key) return [];
  const { data } = await axios.get("https://www.googleapis.com/customsearch/v1", {
    params: { q: `site:${domain} ${query}`, cx, key, num: limit, safe: "off" },
    timeout: 10000
  });
  const items = (data?.items || []).map(it => it.link).filter(Boolean);
  return items;
}

// --- Fallback: DuckDuckGo HTML parser (no key needed) ---
async function discoverViaDuckDuckGo(query, domain, limit=5) {
  try {
    const r = await httpGet("https://duckduckgo.com/html/", {
      params: { q: `site:${domain} ${query}` },
      headers: { Accept: "text/html" },
      timeout: 12000
    });
    const $ = cheerio.load(r.data);
    const urls = [];
    $("a.result__a").each((_, a) => {
      const href = $(a).attr("href");
      if (href && href.includes(domain)) urls.push(href);
    });
    // older markup
    $('a[href^="https://duckduckgo.com/l/"]').each((_, a) => {
      const href = $(a).attr("href");
      if (href && href.includes(domain)) urls.push(href);
    });
    // sanitize / dedupe
    return Array.from(new Set(urls)).slice(0, limit);
  } catch { return []; }
}

// --- Last resort: on-site search page scan (if SSR renders links) ---
async function discoverViaSiteSearch(query, base, patterns, limit=6) {
  try {
    const r = await httpGet(`${base}/search`, { params: { q: query }, timeout: 12000 });
    const $ = cheerio.load(r.data);
    const urls = new Set();
    $('a[href]').each((_, a) => {
      const href = String($(a).attr("href") || "");
      if (patterns.some(rx => rx.test(href))) {
        urls.add(href.startsWith("http") ? href : base + href);
      }
    });
    return Array.from(urls).slice(0, limit);
  } catch { return []; }
}

async function discoverProductUrls(retailer, query) {
  // Prefer CSE, then DDG, then on-site scan
  let urls = await discoverViaCSE(query, retailer.domain, 8);
  if (!urls.length) urls = await discoverViaDuckDuckGo(query, retailer.domain, 8);

  if (!urls.length) {
    const patterns = [
      /\/products?\//i, /\/p(?:[\?#]|$)/i, /\/product\//i, /\/details\//i
    ];
    urls = await discoverViaSiteSearch(query, retailer.base, patterns, 8);
  }

  // Trim to PDP-looking paths
  const PDP_RX = /(\/p(?:[\?#]|$))|(\/product\/)|(\/products?\/)|(\/details?\/)/i;
  urls = urls.filter(u => PDP_RX.test(u)).slice(0, 6);
  return Array.from(new Set(urls));
}

async function fetchPDP(url, retailer) {
  const page = await httpGet(url);
  const $ = cheerio.load(page.data);
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  const image =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src");

  const priceNum = extractPriceFromHTML(page.data);
  if (!title || !priceNum) return null;

  return {
    title,
    url,
    image: image && (image.startsWith("http") ? image : retailer.base + image),
    currency: "KWD",
    priceNum,
    price: `${priceNum} KD`,
    seller: retailer.name
  };
}

async function runRetailer(retailer, query, limit=5) {
  const t0 = Date.now();
  const urls = await discoverProductUrls(retailer, query);
  const picked = urls.slice(0, Math.max(limit, 3));
  const out = [];

  for (const u of picked) {
    try {
      const item = await fetchPDP(u, retailer);
      if (item) out.push(item);
      if (out.length >= limit) break;
    } catch { /* ignore single PDP errors */ }
  }

  return {
    _meta: { discovered: urls.length, used: picked.length, tookMs: Date.now() - t0 },
    items: out
  };
}

// Blink still keeps the JSON suggest endpoint — keep it fast path
async function runBlink(query, limit=5) {
  try {
    const base = "https://www.blink.com.kw";
    const r = await axios.get(`${base}/search/suggest.json`, {
      params: { q: query, "resources[type]": "product", "resources[limit]": 10 },
      headers: { Accept: "application/json" }, timeout: 9000
    });
    const data = r.data && (typeof r.data === "string" ? JSON.parse(r.data) : r.data);
    const items = (data?.resources?.results?.products || []).slice(0, limit)
      .map(p => {
        const n = typeof p.price === "number" ? p.price : parsePriceKWD(p.price);
        return {
          title: p.title, url: base + p.url, image: p.image,
          currency: "KWD", priceNum: n, price: n ? `${n} KD` : undefined, seller: "blink"
        };
      }).filter(x => x.title && x.url && x.priceNum);
    if (items.length) return { _meta: { fastPath: true, tookMs: 0 }, items };
  } catch {}
  // fallback to generic flow
  return runRetailer(RETAILERS.find(r => r.name === "blink"), query, limit);
}

// ---- Handler
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const q = String(req.query.q || req.body?.q || "").trim().slice(0, 120);
  if (!q) return res.status(400).json({ error: "Missing query ?q=" });

  try {
    const started = Date.now();

    const tasks = RETAILERS.map(r =>
      r.name === "blink" ? runBlink(q, 5) : runRetailer(r, q, 5)
    );
    const settled = await Promise.allSettled(tasks);

    const sources = settled.map((p, i) => ({
      retailer: RETAILERS[i].name,
      ok: p.status === "fulfilled",
      tookMs: p.status === "fulfilled" ? p.value._meta?.tookMs : undefined,
      meta: p.status === "fulfilled" ? p.value._meta : undefined,
      error: p.status === "rejected" ? (p.reason?.message || String(p.reason)) : undefined,
      items: p.status === "fulfilled" ? p.value.items : [],
    }));

    const results = sources
      .flatMap(s => s.items.map(x => ({ ...x, retailer: s.retailer })))
      .sort((a, b) => (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity));

    res.status(200).json({
      query: q,
      currency: "KWD",
      tookMs: Date.now() - started,
      sources,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "server_error" });
  }
};
