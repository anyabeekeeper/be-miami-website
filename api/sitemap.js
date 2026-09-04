// Dynamic sitemap.xml — always reflects the live, active fleet. No manual
// maintenance and no rebuild needed when a yacht is added, hidden, or removed.

const SUPABASE_URL = "https://znqptcldczqneaqjuqvu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_y95yRNjl6Bg_cacmEOE-1A_GqsG0YbN";
const SITE_URL = "https://www.bemiamirentals.com";

module.exports = async function handler(req, res) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/yachts?active=eq.true&select=url_slug,updated_at&order=sort_order`,
    { headers: { apikey: SUPABASE_ANON_KEY } }
  );

  let yachts = [];
  if (resp.ok) {
    yachts = await resp.json();
  }

  const urls = [
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...yachts
      .filter((y) => y.url_slug)
      .map((y) => {
        const lastmod = y.updated_at ? `\n    <lastmod>${y.updated_at.slice(0, 10)}</lastmod>` : "";
        return `  <url>\n    <loc>${SITE_URL}/yachts/${y.url_slug}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
      }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(xml);
};
