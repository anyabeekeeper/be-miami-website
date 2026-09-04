// Server-rendered individual yacht page.
// Isolated from the homepage on purpose: this file owns its own copy of the
// brand CSS rather than sharing index.html's <style> block, so homepage
// changes can never accidentally break this page (or vice versa).

const SUPABASE_URL = "https://znqptcldczqneaqjuqvu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_y95yRNjl6Bg_cacmEOE-1A_GqsG0YbN";
const SITE_URL = "https://www.bemiamirentals.com";
const WHATSAPP_NUMBER = "13215361126";

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function simplifyName(name) {
  return name.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
}

function inquireHref(yacht) {
  const text = `Hi, I'm interested in the ${yacht.length_ft}’ ${simplifyName(yacht.name)}`;
  const encoded = encodeURIComponent(text).replace(/'/g, "%27");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
}

function renderRates(rates) {
  if (!rates || rates.length === 0) return "";

  const hourly = rates.find((r) => r.is_hourly);
  if (hourly) {
    const note = hourly.rate_note
      ? `<span class="rate-note">${esc(hourly.rate_note)}</span>`
      : "";
    return `<div class="rates"><div class="rate-pill rate-pill-hourly"><span class="rate-price">$${hourly.price.toLocaleString()}/hr</span>${note}</div></div>`;
  }

  const bands = [...new Set(rates.map((r) => r.day_band).filter(Boolean))];
  if (bands.length > 0) {
    const groups = bands
      .map((band) => {
        const rows = rates
          .filter((r) => r.day_band === band)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => `<div class="rate-pill"><span class="rate-dur">${esc(r.duration_label)}</span><span class="rate-price">$${r.price.toLocaleString()}</span></div>`)
          .join("");
        return `<div class="rate-group"><div class="rate-group-label">${esc(band)}</div><div class="rate-row">${rows}</div></div>`;
      })
      .join("");
    return `<div class="rates rates-grouped">${groups}</div>`;
  }

  const pills = [...rates]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => `<div class="rate-pill"><span class="rate-dur">${esc(r.duration_label)}</span><span class="rate-price">$${r.price.toLocaleString()}</span></div>`)
    .join("");
  return `<div class="rates">${pills}</div>`;
}

function renderDetails(details) {
  return [...(details || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((d) => `<div class="detail"><b>${esc(d.label)}:</b> ${esc(d.value)}</div>`)
    .join("\n      ");
}

function startingPrice(rates) {
  if (!rates || rates.length === 0) return null;
  return Math.min(...rates.map((r) => r.price));
}

function offersJsonLd(rates) {
  if (!rates || rates.length === 0) return [];
  return rates.map((r) => {
    const name = r.is_hourly
      ? "Hourly Charter" + (r.rate_note ? ` (${r.rate_note})` : "")
      : (r.day_band ? `${r.day_band} — ${r.duration_label}` : r.duration_label);
    return {
      "@type": "Offer",
      "name": name,
      "price": r.price,
      "priceCurrency": "USD",
    };
  });
}

function pageNotFound(res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(404).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="robots" content="noindex">
<title>Yacht Not Found | Be Miami</title>
<style>
  body{font-family:Inter,sans-serif; background:#FAF8F3; color:#14181B; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; padding:24px;}
  a{color:#E08A3E;}
</style>
</head><body>
  <div>
    <h1 style="font-family:'Playfair Display',serif;">This yacht isn't available.</h1>
    <p>It may have been removed or is currently hidden from the fleet.</p>
    <p><a href="/#fleet">Browse the current fleet &rarr;</a></p>
  </div>
</body></html>`);
}

module.exports = async function handler(req, res) {
  const { slug } = req.query;

  if (!slug || typeof slug !== "string") {
    return pageNotFound(res);
  }

  // Check redirects first (renamed/removed yachts pointing at a replacement).
  const redirectResp = await fetch(
    `${SUPABASE_URL}/rest/v1/yacht_redirects?old_slug=eq.${encodeURIComponent(slug)}&select=new_slug`,
    { headers: { apikey: SUPABASE_ANON_KEY } }
  );
  if (redirectResp.ok) {
    const redirects = await redirectResp.json();
    if (redirects.length > 0) {
      res.setHeader("Location", `/yachts/${redirects[0].new_slug}`);
      return res.status(301).end();
    }
  }

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/yachts?url_slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=*,yacht_rates(*),yacht_details(*),yacht_photos(*)`,
    { headers: { apikey: SUPABASE_ANON_KEY } }
  );

  if (!resp.ok) {
    res.status(502);
    return res.send("Temporarily unavailable. Please try again shortly.");
  }

  const rows = await resp.json();
  if (rows.length === 0) {
    return pageNotFound(res);
  }

  const yacht = rows[0];
  const mainPhoto = yacht.image_url || (yacht.yacht_photos?.[0]?.url ?? "");
  const photoUrl = mainPhoto.startsWith("http") ? mainPhoto : `${SITE_URL}/${mainPhoto}`;
  const canonicalUrl = `${SITE_URL}/yachts/${yacht.url_slug}`;
  const title = `${yacht.name} — ${yacht.length_ft}' Yacht Charter in Miami | Be Miami`;
  const price = startingPrice(yacht.yacht_rates);
  const priceText = price != null ? ` Charters from $${price.toLocaleString()}.` : "";
  const pickupText = yacht.pickup_location ? `, departs from ${yacht.pickup_location}` : "";
  const description = `${yacht.length_ft}' ${simplifyName(yacht.name)} — private yacht charter in Miami. Up to ${yacht.guest_capacity} guests${pickupText}.${priceText}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Yacht Charter",
    "name": `${yacht.name} — ${yacht.length_ft}' Yacht Charter`,
    "description": description,
    "provider": {
      "@type": "LocalBusiness",
      "name": "Be Miami",
      "url": SITE_URL + "/",
      "telephone": "+13215361126",
    },
    "areaServed": { "@type": "City", "name": "Miami, Florida" },
    "image": photoUrl,
    "offers": offersJsonLd(yacht.yacht_rates),
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-4L4WNS6X7R"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-4L4WNS6X7R');
</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonicalUrl}">

<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:image" content="${esc(photoUrl)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(photoUrl)}">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --black:#0B0F12; --ink:#14181B; --paper:#FAF8F3; --paper-2:#F2EEE5;
    --gold:#B8925A; --gold-light:#D4B183; --line:#E3DED2; --muted:#5C5952;
    --white:#FFFFFF; --accent:#E08A3E; --accent-dark:#C97530;
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  body{background:var(--paper); color:var(--ink); font-family:'Inter',sans-serif; -webkit-font-smoothing:antialiased;}
  a{color:inherit; text-decoration:none;}
  .topbar{
    display:flex; align-items:center; justify-content:space-between;
    padding:22px 6vw; border-bottom:1px solid var(--line);
  }
  .topbar img{height:40px; width:auto; display:block;}
  .back-link{
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600; letter-spacing:0.03em;
    text-transform:uppercase; color:var(--muted);
  }
  .back-link:hover{color:var(--ink);}
  .wrap{max-width:900px; margin:0 auto; padding:48px 6vw 80px;}
  .yacht-media{
    aspect-ratio:16/10; background:linear-gradient(160deg,#1c242b,#0b0f12);
    position:relative; overflow:hidden; margin-bottom:28px; border-radius:2px;
  }
  .yacht-media img{width:100%; height:100%; object-fit:cover; display:block;}
  .yacht-top{display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin-bottom:8px;}
  .yacht-len-tag{
    font-family:'Inter',sans-serif; font-size:13px; font-weight:600; color:var(--white);
    background:var(--ink); padding:4px 12px;
  }
  h1{font-family:'Playfair Display',serif; font-weight:600; font-size:clamp(28px,4vw,40px); flex:1; min-width:220px; text-wrap:balance;}
  .yacht-cap{font-family:'Inter',sans-serif; font-size:14px; color:#4A473F;}
  .yacht-pickup{font-size:14.5px; color:var(--muted); margin:10px 0 28px;}
  .yacht-pickup b{color:var(--ink); font-weight:600;}
  .rates{display:flex; flex-wrap:wrap; column-gap:32px; row-gap:16px; margin-bottom:26px; padding-bottom:26px; border-bottom:1px solid var(--line);}
  .rate-pill{display:flex; flex-direction:column; gap:3px;}
  .rate-dur{font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--muted);}
  .rate-price{font-family:'Inter',sans-serif; font-size:19px; font-weight:600; color:var(--ink);}
  .rate-note{font-family:'Inter',sans-serif; font-size:13px; color:var(--muted); font-weight:400;}
  .rate-pill-hourly{flex-direction:row; align-items:baseline; gap:10px;}
  .rate-group{margin-bottom:14px;}
  .rate-group:last-child{margin-bottom:0;}
  .rate-group-label{font-family:'Inter',sans-serif; font-size:11.5px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink); margin-bottom:9px;}
  .rates.rates-grouped{display:block;}
  .rates.rates-grouped .rate-row{display:flex; flex-wrap:wrap; column-gap:32px; row-gap:16px;}
  .detail{font-size:14px; line-height:1.7; color:var(--muted); margin-bottom:7px;}
  .detail b{color:#4A473F; font-weight:600;}
  .yacht-actions{display:flex; gap:12px; margin-top:26px; flex-wrap:wrap;}
  .yacht-actions a{
    font-family:'Inter',sans-serif; font-size:12.5px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase;
    padding:14px 24px; min-width:150px; text-align:center;
    transition:background-color .2s ease, color .2s ease, border-color .2s ease;
  }
  .a-photos{border:1px solid var(--ink); color:var(--ink);}
  .a-photos:hover{background:var(--ink); color:var(--white);}
  .a-inquire{background:var(--ink); color:var(--white); border:1px solid var(--ink);}
  .a-inquire:hover{background:var(--black);}
  .a-fleet{border:1px solid var(--line); color:var(--muted);}
  .a-fleet:hover{border-color:var(--ink); color:var(--ink);}
  footer{background:var(--black); color:rgba(255,255,255,0.7); padding:56px 6vw 28px; margin-top:40px;}
  .foot-grid{display:grid; grid-template-columns:2fr 1fr 1fr; gap:40px; max-width:1100px; margin:0 auto;}
  .foot-brand p{font-size:13.5px; line-height:1.7; max-width:320px;}
  .foot-col .h{font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.5); margin-bottom:14px;}
  .foot-col a{display:block; font-size:14px; margin-bottom:10px; color:rgba(255,255,255,0.85);}
  .foot-col a:hover{color:var(--white);}
  .foot-bottom{max-width:1100px; margin:40px auto 0; padding-top:24px; border-top:1px solid rgba(255,255,255,0.12); font-size:12.5px; color:rgba(255,255,255,0.4);}
  @media(max-width:700px){
    .foot-grid{grid-template-columns:1fr; gap:28px;}
  }
</style>
</head>
<body>

<div class="topbar">
  <a href="/"><img src="${SITE_URL}/images/logo.png" alt="Be Miami"></a>
  <a class="back-link" href="/#fleet">&larr; Back to Fleet</a>
</div>

<div class="wrap">
  <div class="yacht-media"><img src="${esc(photoUrl)}" alt="${yacht.length_ft}' ${esc(yacht.name)} yacht charter Miami" width="1100" height="688"></div>
  <div class="yacht-top">
    <span class="yacht-len-tag">${yacht.length_ft}′</span>
    <h1>${esc(yacht.name)}</h1>
    <span class="yacht-cap">${yacht.guest_capacity} guests</span>
  </div>
  ${yacht.pickup_location ? `<div class="yacht-pickup">Pickup: <b>${esc(yacht.pickup_location)}</b></div>` : ""}
  ${renderRates(yacht.yacht_rates)}
  ${renderDetails(yacht.yacht_details)}
  <div class="yacht-actions">
    <a class="a-inquire" href="${inquireHref(yacht)}" target="_blank" rel="noopener">Inquire Now &#8599;</a>
    ${yacht.gallery_url ? `<a class="a-photos" href="${esc(yacht.gallery_url)}" target="_blank" rel="noopener">More Photos &#8599;</a>` : ""}
    <a class="a-fleet" href="/#fleet">View Full Fleet</a>
  </div>
</div>

<footer>
  <div class="foot-grid">
    <div class="foot-brand">
      <img src="${SITE_URL}/images/logo.png" alt="Be Miami — Luxury Fun" style="height:56px; width:auto; margin-bottom:14px;">
      <p>Miami is better from the water.<br>Private yacht charters for celebrations, family days, sunset cruises, and everything in between.</p>
    </div>
    <div class="foot-col">
      <div class="h">Explore</div>
      <a href="/#fleet">The Fleet</a>
      <a href="/#good-to-know">Good to Know</a>
    </div>
    <div class="foot-col">
      <div class="h">Booking</div>
      <a href="https://wa.me/${WHATSAPP_NUMBER}">WhatsApp</a>
      <a href="tel:+13215361126">+1 (321) 536-1126</a>
      <a href="mailto:info@bemiamirentals.com">info@bemiamirentals.com</a>
      <a href="https://instagram.com/be.miami">@be.miami</a>
    </div>
  </div>
  <div class="foot-bottom">&copy; 2026 Be Miami. All rights reserved.</div>
</footer>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(html);
};
