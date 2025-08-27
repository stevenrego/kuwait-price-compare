// api/search.js  — single-file live scraper for Kuwait retailers
// Works on Vercel Node 20 (CommonJS). Requires: axios, cheerio in package.json deps.

const axios = require("axios");
const cheerio = require("cheerio");

// ---------- helpers ----------
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 (+price-compare/1.0)",
  "Accept-Language": "en-KW,en;q=0.8,ar;q=0.7",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Cache-Control": "no-cache",
};

async function httpGet(url, { timeout = 12000, headers = {}, params } = {}) {
  const t0 = Date.now();
  const resp = await axios.get(url, {
    timeout,
    params,
    headers: { ...DEFAULT_HEADERS, ...headers },
    responseType: "text",
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const finalUrl = resp.request?.res?.responseUrl || url;
  return { url: finalUrl, status: resp.status, data: resp.data, tookMs: Date.now() - t0 };
}

const ARABIC_DIGITS = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
const toAsciiDigits = (s = "") => s.replace(/[٠-٩]/g, (d) => ARABIC_DIGITS[d] ?? d);

function parsePriceKWD(str = "") {
  const cleaned = toAsciiDigits(String(str))
    .replace(/[, ]/g, "")
    .replace(/(KWD|KD|ك\.?د|د\.?ك)/gi, "")
    .trim();
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

function extractJsonLdProducts(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const txt = $(el).contents().text().trim();
      if (!txt) return;
      const json = JSON.parse(txt);
      const arr = Array.isArray(json) ? json : [json];

      for (const obj of arr) {
        // ItemList of Products
        if (obj["@type"] === "ItemList" && Array.isArray(obj.itemListElement)) {
          for (const it of obj.itemListElement) {
            const prod = it.item || it;
            if (prod && (prod["@type"] === "Product" || prod.name)) {
              const url = prod.url || prod["@id"];
              const price = prod?.offers?.price ?? prod?.offers?.[0]?.price;
              out.push({
                title: prod.name,
                url,
                image: Array.isArray(prod.image) ? prod.image[0] : prod.image,
                price: price ? `${price} KD` : undefined,
                priceNum: price ? parsePriceKWD(price) : undefined,
              });
            }
          }
        }
        // Single Product object
        if (obj["@type"] === "Product" && obj.name) {
          const price = obj?.offers?.price ?? obj?.offers?.[0]?.price;
          out.push({
            title: obj.name,
            url: obj.url || obj["@id"],
            image: Array.isArray(obj.image) ? obj.image[0] : obj.image,
            price: price ? `${price} KD` : undefined,
            priceNum: price ? parsePriceKWD(price) : undefined,
          });
        }
      }
    } catch {}
  });
  return out;
}

const sanitizeQuery = (q) => String(q || "").slice(0, 100).trim();

// ---------- adapters (xcite, blink, eureka) ----------
async function searchXcite(query, limit = 5) {
  const url = `https://www.xcite.com/search?q=${encodeURIComponent(query)}`;
  const page = await httpGet(url);

  let items = extractJsonLdProducts(page.data)
    .filter((x) => x.title && x.url && (x.priceNum ?? parsePriceKWD(x.price)))
    .slice(0, limit)
    .map((x) => ({
      title: x.title,
      url: x.url?.startsWith("http") ? x.url : `https://www.xcite.com${x.url || ""}`,
      image: x.image,
      currency: "KWD",
      priceNum: x.priceNum ?? parsePriceKWD(x.price),
      price: x.priceNum ? `${x.priceNum} KD` : x.price,
      seller: "xcite",
    }));

  if (!items.length) {
    // fallback: fetch product pages linked on search results that match /p
    const $ = cheerio.load(page.data);
    const links = new Set();
    $("a[href]").each((_, a) => {
      const href = String($(a).attr("href") || "");
      if (/\/p(\?|$)/.test(href)) {
        links.add(href.startsWith("http") ? href : `https://www.xcite.com${href}`);
      }
    });
    const top = [...links].slice(0, limit);
    const details = await Promise.allSettled(
      top.map(async (href) => {
        const p = await httpGet(href);
        const prod = extractJsonLdProducts(p.data).find((x) => (x.priceNum ?? parsePriceKWD(x.price)) && x.title);
        if (!prod) return null;
        const priceNum = prod.priceNum ?? parsePriceKWD(prod.price);
        return {
          title: prod.title,
          url: href,
          image: prod.image,
          currency: "KWD",
          priceNum,
          price: priceNum ? `${priceNum} KD` : undefined,
          seller: "xcite",
        };
      })
    );
    items = details.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
  }

  return { _meta: { url: page.url, tookMs: page.tookMs }, items: items.slice(0, limit) };
}

async function searchBlink(query, limit = 5) {
  // Try Shopify-like suggest first
  try {
    const suggest = await httpGet("https://www.blink.com.kw/search/suggest.json", {
      params: {
        q: query,
        "resources[type]": "product",
        "resources[limit]": 10,
      },
      headers: { Accept: "application/json" },
      timeout: 9000,
    });
    const data = JSON.parse(suggest.data);
    const products = data?.resources?.results?.products || [];
    const items = products
      .slice(0, limit)
      .map((p) => ({
        title: p.title,
        url: `https://www.blink.com.kw${p.url}`,
        image: p.image,
        currency: "KWD",
        priceNum: typeof p.price === "number" ? p.price : parsePriceKWD(p.price),
        price: typeof p.price === "number" ? `${p.price} KD` : p.price ? `${parsePriceKWD(p.price)} KD` : undefined,
        seller: "blink",
      }))
      .filter((x) => x.title && x.url && x.priceNum);
    if (items.length) {
      return { _meta: { url: suggest.url, tookMs: suggest.tookMs }, items };
    }
  } catch (_) {
    // ignore and fall back
  }

  // Fallback: HTML search page
  const page = await httpGet(`https://www.blink.com.kw/search`, { params: { q: query } });
  const parsed = extractJsonLdProducts(page.data).map((x) => ({
    title: x.title,
    url: x.url?.startsWith("http") ? x.url : `https://www.blink.com.kw${x.url || ""}`,
    image: x.image,
    currency: "KWD",
    priceNum: x.priceNum ?? parsePriceKWD(x.price),
    price: x.priceNum ? `${x.priceNum} KD` : x.price,
    seller: "blink",
  }));
  const items = parsed.filter((x) => x.title && x.url && x.priceNum).slice(0, limit);
  return { _meta: { url: page.url, tookMs: page.tookMs }, items };
}

async function searchEureka(query, limit = 5) {
  const tryUrls = [
    `https://www.eureka.com.kw/search?keyword=${encodeURIComponent(query)}`,
    `https://www.eureka.com.kw/?s=${encodeURIComponent(query)}`,
  ];
  for (const u of tryUrls) {
    try {
      const page = await httpGet(u, { timeout: 12000 });
      let items = extractJsonLdProducts(page.data)
        .map((x) => ({
          title: x.title,
          url: x.url?.startsWith("http") ? x.url : `https://www.eureka.com.kw${x.url || ""}`,
          image: x.image,
          currency: "KWD",
          priceNum: x.priceNum ?? parsePriceKWD(x.price),
          price: x.priceNum ? `${x.priceNum} KD` : x.price,
          seller: "eureka",
        }))
        .filter((x) => x.title && x.url && x.priceNum);

      if (items.length) return { _meta: { url: page.url, tookMs: page.tookMs }, items: items.slice(0, limit) };
    } catch {
      // try next pattern
    }
  }
  return { _meta: { url: tryUrls[0], tookMs: 0 }, items: [] };
}

// ---------- handler ----------
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

    payload.results = payload.sources
      .flatMap((s) => s.items.map((x) => ({ ...x, retailer: s.retailer })))
      .sort((a, b) => (a.priceNum ?? Infinity) - (b.priceNum ?? Infinity));

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "server_error" });
  }
};

