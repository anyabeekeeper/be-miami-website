import { supabase } from "./supabase-client.js";

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

// Matches the original site's derivation: strip quote marks from the display
// name so "Galeon \"Kira\"" becomes "Galeon Kira" in the pre-filled message.
function simplifyName(name) {
  return name.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
}

function inquireHref(yacht) {
  const text = `Hi, I'm interested in the ${yacht.length_ft}’ ${simplifyName(yacht.name)}`;
  const encoded = encodeURIComponent(text).replace(/'/g, "%27");
  return `https://wa.me/13215361126?text=${encoded}`;
}

function renderRates(rates) {
  if (!rates || rates.length === 0) return "";

  const hourly = rates.find(r => r.is_hourly);
  if (hourly) {
    const note = hourly.rate_note
      ? `<span class="rate-note">${esc(hourly.rate_note)}</span>`
      : "";
    return `<div class="rates"><div class="rate-pill rate-pill-hourly"><span class="rate-price">$${hourly.price.toLocaleString()}/hr</span>${note}</div></div>`;
  }

  const bands = [...new Set(rates.map(r => r.day_band).filter(Boolean))];
  if (bands.length > 0) {
    const groups = bands.map(band => {
      const rows = rates
        .filter(r => r.day_band === band)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(r => `<div class="rate-pill"><span class="rate-dur">${esc(r.duration_label)}</span><span class="rate-price">$${r.price.toLocaleString()}</span></div>`)
        .join("");
      return `<div class="rate-group"><div class="rate-group-label">${esc(band)}</div><div class="rate-row">${rows}</div></div>`;
    }).join("");
    return `<div class="rates rates-grouped">${groups}</div>`;
  }

  const pills = [...rates]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => `<div class="rate-pill"><span class="rate-dur">${esc(r.duration_label)}</span><span class="rate-price">$${r.price.toLocaleString()}</span></div>`)
    .join("");
  return `<div class="rates">${pills}</div>`;
}

function renderDetails(details) {
  return [...(details || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(d => `<div class="detail"><b>${esc(d.label)}:</b> ${esc(d.value)}</div>`)
    .join("\n    ");
}

function startingPrice(rates) {
  if (!rates || rates.length === 0) return 0;
  return Math.min(...rates.map(r => r.price));
}

function categoryFor(lengthFt) {
  if (lengthFt < 50) return "s1";
  if (lengthFt <= 80) return "s2";
  return "s3";
}

function renderCard(yacht) {
  const mainPhoto = yacht.image_url || (yacht.yacht_photos?.[0]?.url ?? "");
  return `
  <div class="yacht" id="${esc(yacht.slug || yacht.id)}" data-length="${yacht.length_ft}" data-price="${startingPrice(yacht.yacht_rates)}">
    <div class="yacht-media"><img src="${esc(mainPhoto)}" alt="${yacht.length_ft}' ${esc(yacht.name)} yacht charter Miami" loading="lazy" width="1100" height="688"></div>
    <div class="yacht-top"><span class="yacht-len-tag">${yacht.length_ft}′</span><h3>${yacht.url_slug ? `<a href="/yachts/${esc(yacht.url_slug)}">${esc(yacht.name)}</a>` : esc(yacht.name)}</h3><span class="yacht-cap">${yacht.guest_capacity} guests</span></div>
    <div class="yacht-pickup">Pickup: <b>${esc(yacht.pickup_location)}</b></div>
    ${renderRates(yacht.yacht_rates)}
    ${renderDetails(yacht.yacht_details)}
    <div class="yacht-actions">
      <a class="a-photos" href="${esc(yacht.gallery_url)}" target="_blank" rel="noopener">VIEW YACHT ↗</a>
      <a class="a-inquire" href="${inquireHref(yacht)}" target="_blank" rel="noopener">Inquire ↗</a>
    </div>
  </div>`;
}

function sectionHeader(id, label) {
  return `<div id="${id}" style="scroll-margin-top:70px; padding:36px 0 6px;"><div class="mono" style="font-family:'Playfair Display', serif; font-size:clamp(26px,3.2vw,34px); font-weight:600; letter-spacing:0.01em; color:var(--ink);">${label}</div></div>`;
}

export async function loadFleet() {
  const fleetEl = document.querySelector(".fleet");
  if (!fleetEl) return;

  const { data, error } = await supabase
    .from("yachts")
    .select("*, yacht_rates(*), yacht_details(*), yacht_photos(*)")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load fleet from Supabase:", error);
    fleetEl.innerHTML = `<p style="padding:6vw; color:var(--muted);">Fleet is temporarily unavailable. Please check back shortly.</p>`;
    return;
  }

  const under50 = data.filter(y => y.length_ft < 50);
  const mid = data.filter(y => y.length_ft >= 50 && y.length_ft <= 80);
  const over80 = data.filter(y => y.length_ft > 80);

  let html = "";
  if (under50.length) html += sectionHeader("s1", "Under 50 Feet") + under50.map(renderCard).join("");
  if (mid.length) html += sectionHeader("s2", "50–80 Feet") + mid.map(renderCard).join("");
  if (over80.length) html += sectionHeader("s3", "80+ Feet") + over80.map(renderCard).join("");

  fleetEl.innerHTML = html;

  // Hand off to the existing sort/filter script (applySort etc.) which reads
  // DOM nodes + data-length/data-price attributes exactly as before.
  window.dispatchEvent(new CustomEvent("fleet:rendered"));
}

document.addEventListener("DOMContentLoaded", loadFleet);
