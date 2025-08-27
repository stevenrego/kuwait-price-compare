// api/search.js — robust live scraper for Kuwait retailers (Xcite/Blink/Eureka)
// Requires: axios ^1.x, cheerio ^1.x in package.json

const axios = require("axios");
const cheerio = require("cheerio");

// ---------- HTTP helper ----------
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 (+price-compare/1.1)",
  "Accept-Language": "en-KW,en;q=0.8,ar;q=0.7",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Cache-Control": "no-cache",
};

async function httpGet(url, { timeout = 15000, headers = {}, params } = {}) {
  const t0 = Date.now();
  const resp = await axios.get(url, {
    timeout,
    params,
    headers: { ...DEFAULT_HEADERS, ...headers },
    responseType: "text",
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const finalUrl = resp.request?.res?.responseUrl || url;
  return { url: finalUrl, status: resp.status, data: resp.data, tookMs: Date.now() - t0 };
}

// ---------- price helpers ----------
const ARABIC_DIGITS = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
const toAsciiDigits = (s = "") => s.replace(/[٠-٩]/g, (d) => ARABIC_DIGITS[d] ?? d);

function parsePriceKWD(str = "") {
  const cleaned = toAsciiDigits(String(str))
    .replace(/\s+/g, " ")
    .replace(/,/g, "")
    .replace(/(KWD|KD|د\.?ك|ك\.?د)/gi, "")
    .trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

// Try multiple ways to locate a price on a product page
function extractPriceFromHTML(html) {
  const $ = cheerio.load(html);

  // 1) JSON-LD Product/Offer
  let jsonPrice;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const txt = $(el).contents().text().trim();
      if (!txt) return;
      const json = JSON.parse(txt);
      const list = Array.isArray(json) ? json : [json];
      for (const obj of list) {
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

  // 2) Common meta/itemprop
  const metaSel = [
    'meta[itemprop="price"]',
    'meta[property="product:price:amount"]',
    'meta[name="twitter:data1"]', // sometimes used for price
  ];
  for (const sel of metaSel) {
    const v = $(sel).attr("content");
    const num = parsePriceKWD(v);
    if (num) return num;
  }

  // 3) Visible price nodes (very lenient)
  const textHits = [];
  $('[class*="price"], [class*="Price"], [id*="price"], [itemprop="price"], span, div')
    .slice(0, 500)
    .each((_, el) => {
      const t = ($(el).text() || "").replace(/\s+/g, " ").trim();
      if (/(\d+[.,]?\d*)\s*(KWD|KD|د\.?ك|ك\.?د)/i.test(t)) textHits.push(t);
    });
  for (const t of textHits) {
    const n = parsePriceKWD(t);
    if (n) return n;
  }

  // 4) Last resort: search the whole HTML (cheap regex)
  const m = toAsciiDigits(html).match(/(\d+(?:\.\d+)?)\s*(KWD|KD|د\.?ك|ك\.?د)/i);
  if (m) return Number(m[1]);

  return undefined;
}

const sanitizeQuery = (q) => String(q || "").slice(0, 100).trim();

// ---------- XCITE ----------
async function searchXcite(query, limit = 5) {
  const base = "https://www.xcite.com";
  const searchUrl = `${base}/search?q=${encodeURIComponent(query)}`;
  const page = await httpGet(searchUrl);

  const $ = cheerio.load(page.data);
  const links = new Set();

  // Product tiles often link to ".../p"
  $('a[href]').each((_, a) => {
    const href = String($(a).attr('href') || "");
    if (/\/p(?:[\?#]|$)/.test(href)) {
      links.add(href.startsWith("http") ? href : base + href);
    }
  });

  const picked = [...links].slice(0, Math.max(3, limit)); // grab a few; price is on PDP
  const items = [];
  for (const href of picked) {
    try {
      const p = await httpGet(href);
      const $$ = cheerio.load(p.data);

      // title (fallback to <title>)
      let title =
        $$('h1, h2, [itemprop="name"], meta[property="og:title"]').first().text().trim() ||
        $$('meta[property="og:title"]').attr("content") ||
        $$.root().find("title").text().trim();

      // image
      const image =
        $$('meta[property="og:image"]').attr("content") ||
        $$('img').first().attr("src");

      const priceNum = extractPriceFromHTML(p.data);
      if (title && priceNum) {
        items.push({
          title,
          url: href,
          image: image && (image.startsWith("http") ? image : base + image),
          currency: "KWD",
          priceNum,
          price: `${priceNum} KD`,
          seller: "xcite",
        });
      }
      if (items.length >= limit) break;
    } catch (_) {}
  }

  return { _meta: { url: page.url, tookMs: page.tookMs, foundLinks: links.size }, items };
}

// ---------- BLINK ----------
async function searchBlink(query, limit = 5) {
  const base = "https://www.blink.com.kw";

  // Try suggest JSON first (works on many Shopify-like Blink setups)
  try {
    const suggest = await httpGet(`${base}/search/suggest.json`, {
      params: {
        q: query,
        "resources[type]": "product",
        "resources[limit]": 10,
      },
      headers: { Accept: "application/json" },
      timeout: 10000,
    });
    const data = JSON.parse(suggest.data);
    const products = data?.resources?.results?.products || [];
    const items = products
      .map((p) => {
        const priceNum =
          typeof p.price === "number" ? p.price : parsePriceKWD(p.price);
        return {
          title: p.title,
          url: base + p.url,
          image: p.image,
          currency: "KWD",
          priceNum,
          price: priceNum ? `${priceNum} KD` : undefined,
          seller: "blink",
        };
      })
      .filter((x) => x.title && x.url && x.priceNum)
      .slice(0, limit);
    if (items.length) return { _meta: { url: suggest.url, tookMs: suggest.tookMs }, items };
  } catch (_) {}

  // Fallback: search page → PDPs → extract price
  const search = await httpGet(`${base}/search`, { params: { q: query } });
  const $ = cheerio.load(search.data);
  const links = new Set();
  $('a[href]').each((_, a) => {
    const href = String($(a).attr('href') || "");
    if (/\/products\//.test(href)) links.add(href.startsWith("http") ? href : base + href);
  });

  const items = [];
  for (const href of [...links].slice(0, Math.max(3, limit))) {
    try {
      const p = await httpGet(href);
      const priceNum = extractPriceFromHTML(p.data);
      const $$ = cheerio.load(p.data);
      const title =
        $$('meta[property="og:title"]').attr("content") ||
        $$('h1').first().text().trim();
      const image =
        $$('meta[property="og:image"]').attr("content") ||
        $$('img').first().attr("src");
      if (title && priceNum) {
        items.push({
          title,
          url: href,
          image: image && (image.startsWith("http") ? image : base + image),
          currency: "KWD",
          priceNum,
          price: `${priceNum} KD`,
          seller: "blink",
        });
      }
      if (items.length >= limit) break;
    } catch (_) {}
  }

  return { _meta: { url: search.url, tookMs: search.tookMs, foundLinks: links.size }, items };
}

// ---------- EUREKA ----------
async function searchEureka(query, limit = 5) {
  const base = "https://www.eureka.com.kw";
  const tryUrls = [
    `${base}/search?keyword=${encodeURIComponent(query)}`,
    `${base}/?s=${encodeURIComponent(query)}`,
  ];

  for (const u of tryUrls) {
    try {
      const search = await httpGet(u);
      const $ = cheerio.load(search.data);
      const links = new Set();

      $('a[href]').each((_, a) => {
        const href = String($(a).attr('href') || "");
        if (/\/products\/details\//.test(href) || /\/product\//.test(href)) {
          links.add(href.startsWith("http") ? href : base + href);
        }
      });

      const items = [];
      for (const href of [...links].slice(0, Math.max(3, limit))) {
        try {
          const p = await httpGet(href);
          const priceNum = extractPriceFromHTML(p.data);
          const $$ = cheerio.load(p.data);
          const title =
            $$('meta[property="og:title"]').attr("content") ||
            $$('h1').first().text().trim();
          const image =
            $$('meta[property="og:image"]').attr("content") ||
            $$('img').first().attr("src");
          if (title && priceNum) {
            items.push({
              title,
              url: href,
              image: image && (image.startsWith("http") ? image : base + image),
              currency: "KWD",
              priceNum,
              price: `${priceNum} KD`,
              seller: "eureka",
            });
          }
          if (items.length >= limit) break;
        } catch (_) {}
      }

      if (items.length) {
        return { _meta: { url: search.url, tookMs: search.tookMs, foundLinks: links.size }, items };
      }
    } catch (_) {}
  }
  return { _meta: { url: tryUrls[0], tookMs: 0, foundLinks: 0 }, items: [] };
}

// ---------- handler ----------
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

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
      meta: p.status === "fulfilled" ? p.value._meta : undefined,
      error: p.status === "rejected" ? (p.reason?.message || String(p.reason)) : undefined,
      items: p.status === "fulfilled" ? p.value.items : [],
    });

    const sources = [pack("xcite", xcite), pack("blink", blink), pack("eureka", eureka)];
    const results = sources
      .flatMap((s) => s.items.map((x) => ({ ...x, retailer: s.retailer })))
      .sort((a, b) => (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity));

    return res.status(200).json({
      query: q,
      currency: "KWD",
      tookMs: Date.now() - started,
      sources,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "server_error" });
  }
};
