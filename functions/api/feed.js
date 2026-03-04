var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function onRequestGet() {
  try {
    var articles = await tryJsonApi();
    if (!articles || articles.length === 0) {
      articles = await tryRssFeed();
    }

    return Response.json(
      { articles: articles || [] },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return Response.json({ articles: [], error: e.message }, { status: 500 });
  }
}

async function tryJsonApi() {
  var res = await fetch("https://drozdnco.substack.com/api/v1/posts?limit=20", {
    headers: HEADERS,
  });
  if (!res.ok) return null;

  var posts = await res.json();
  if (!Array.isArray(posts) || posts.length === 0) return null;

  return posts
    .filter(function (p) { return p.is_published; })
    .map(function (p) {
      return {
        title: p.title,
        link: "https://drozdnco.substack.com/p/" + p.slug,
        pubDate: p.post_date,
        description: stripHtml(p.description || p.subtitle || "").slice(0, 280),
        coverImage: p.cover_image || null,
        creator: "Andrii Drozdenko",
      };
    });
}

async function tryRssFeed() {
  var res = await fetch("https://drozdnco.substack.com/feed", {
    headers: HEADERS,
  });
  if (!res.ok) return null;

  var xml = await res.text();
  return parseRSS(xml);
}

function parseRSS(xml) {
  var items = [];
  var itemRegex = /<item>([\s\S]*?)<\/item>/g;
  var match;

  while ((match = itemRegex.exec(xml)) !== null) {
    var block = match[1];
    var enclosure = block.match(/enclosure[^>]+url="([^"]+)"/);
    items.push({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      description: stripHtml(extractTag(block, "description")).slice(0, 280),
      coverImage: enclosure ? enclosure[1] : null,
      creator: extractTag(block, "dc:creator"),
    });
  }

  return items;
}

function extractTag(xml, tag) {
  var cdataMatch = xml.match(
    new RegExp("<" + tag + "><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></" + tag + ">")
  );
  if (cdataMatch) return cdataMatch[1].trim();

  var plainMatch = xml.match(
    new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")
  );
  return plainMatch ? plainMatch[1].trim() : "";
}

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8209;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
