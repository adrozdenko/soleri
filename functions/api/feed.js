export async function onRequestGet() {
  const FEED_URL = "https://drozdnco.substack.com/feed";

  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "Soleri/1.0" },
    });

    if (!res.ok) {
      return Response.json({ articles: [], error: "Feed unavailable" }, { status: 502 });
    }

    const xml = await res.text();
    const articles = parseRSS(xml);

    return Response.json(
      { articles },
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

function parseRSS(xml) {
  var items = [];
  var itemRegex = /<item>([\s\S]*?)<\/item>/g;
  var match;

  while ((match = itemRegex.exec(xml)) !== null) {
    var block = match[1];
    items.push({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      description: stripHtml(extractTag(block, "description")).slice(0, 280),
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
    .replace(/\s+/g, " ")
    .trim();
}
