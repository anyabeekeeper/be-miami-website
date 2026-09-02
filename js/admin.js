import { supabase } from "./supabase-client.js";

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const fleetView = document.getElementById("fleet-view");
const formView = document.getElementById("form-view");

let allYachts = [];
let editingId = null; // null => "add new"

// ---------- auth ----------

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    loginView.style.display = "none";
    appView.style.display = "block";
    await loadFleet();
  } else {
    loginView.style.display = "flex";
    appView.style.display = "none";
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    return;
  }
  await checkSession();
});

document.getElementById("nav-logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  await checkSession();
});

// ---------- fleet list ----------

document.getElementById("nav-fleet").addEventListener("click", () => showFleetView());
document.getElementById("nav-add").addEventListener("click", () => showFormView(null));
document.getElementById("cancel-form").addEventListener("click", () => showFleetView());

function showFleetView() {
  formView.style.display = "none";
  fleetView.style.display = "block";
  setActiveNav("nav-fleet");
  loadFleet();
}

function showFormView(yacht) {
  fleetView.style.display = "none";
  formView.style.display = "block";
  setActiveNav("nav-add");
  populateForm(yacht);
}

function setActiveNav(id) {
  document.querySelectorAll(".sidebar nav a").forEach(a => a.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

async function loadFleet() {
  const { data, error } = await supabase
    .from("yachts")
    .select("*, yacht_rates(*)")
    .order("sort_order", { ascending: true });

  if (error) {
    alert("Failed to load fleet: " + error.message);
    return;
  }
  allYachts = data;
  renderFleetTable(allYachts);
}

document.getElementById("search-input").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = q
    ? allYachts.filter(y => y.name.toLowerCase().includes(q))
    : allYachts;
  renderFleetTable(filtered);
});

function startingPrice(rates) {
  if (!rates || rates.length === 0) return null;
  return Math.min(...rates.map(r => r.price));
}

function renderFleetTable(list) {
  const tbody = document.getElementById("fleet-table-body");
  tbody.innerHTML = list.map(y => `
    <tr>
      <td><input type="number" value="${y.sort_order}" data-sort-id="${y.id}" style="width:60px;"></td>
      <td>${escapeHtml(y.name)}</td>
      <td>${y.length_ft}′</td>
      <td>${y.guest_capacity}</td>
      <td>${startingPrice(y.yacht_rates) != null ? "$" + startingPrice(y.yacht_rates).toLocaleString() : "—"}</td>
      <td><span class="status-badge ${y.active ? "status-active" : "status-inactive"}">${y.active ? "Active" : "Hidden"}</span></td>
      <td>
        <button class="btn btn-small btn-outline" data-edit-id="${y.id}">Edit</button>
        <button class="btn btn-small btn-outline" data-toggle-id="${y.id}">${y.active ? "Hide" : "Unhide"}</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const yacht = allYachts.find(y => y.id === btn.dataset.editId);
      showFormView(yacht);
    });
  });

  tbody.querySelectorAll("[data-toggle-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const yacht = allYachts.find(y => y.id === btn.dataset.toggleId);
      const { error } = await supabase.from("yachts").update({ active: !yacht.active }).eq("id", yacht.id);
      if (error) { alert("Failed: " + error.message); return; }
      await loadFleet();
    });
  });

  tbody.querySelectorAll("[data-sort-id]").forEach(input => {
    input.addEventListener("change", async () => {
      const { error } = await supabase
        .from("yachts")
        .update({ sort_order: parseInt(input.value, 10) || 0 })
        .eq("id", input.dataset.sortId);
      if (error) { alert("Failed to save order: " + error.message); return; }
      await loadFleet();
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

// ---------- add/edit form ----------

function ratesRowHtml(rate = {}) {
  return `
    <div class="row-repeat" data-rate-row>
      <input type="text" placeholder="Day band (optional)" class="r-day" value="${rate.day_band ?? ""}">
      <input type="text" placeholder="Duration (e.g. 4 HR)" class="r-dur" value="${rate.duration_label ?? ""}">
      <label style="flex:0 0 auto; display:flex; align-items:center; gap:4px;">
        <input type="checkbox" class="r-hourly" ${rate.is_hourly ? "checked" : ""}> Hourly
      </label>
      <input type="number" placeholder="Price" class="r-price" value="${rate.price ?? ""}">
      <input type="text" placeholder="Note (optional)" class="r-note" value="${rate.rate_note ?? ""}">
      <button type="button" class="btn btn-small btn-outline" data-remove-row>×</button>
    </div>`;
}

function detailsRowHtml(detail = {}) {
  return `
    <div class="row-repeat" data-detail-row>
      <input type="text" placeholder="Label (e.g. Gratuity)" class="d-label" value="${detail.label ?? ""}">
      <input type="text" placeholder="Value" class="d-value" value="${detail.value ?? ""}">
      <button type="button" class="btn btn-small btn-outline" data-remove-row>×</button>
    </div>`;
}

function photosRowHtml(photo = {}) {
  return `
    <div class="row-repeat" data-photo-row>
      <input type="text" placeholder="Image URL" class="p-url" value="${photo.url ?? ""}">
      <button type="button" class="btn btn-small btn-outline" data-remove-row>×</button>
    </div>`;
}

function wireRemoveButtons(container) {
  container.querySelectorAll("[data-remove-row]").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".row-repeat").remove());
  });
}

document.getElementById("add-rate-row").addEventListener("click", () => {
  const list = document.getElementById("rates-list");
  list.insertAdjacentHTML("beforeend", ratesRowHtml());
  wireRemoveButtons(list);
});
document.getElementById("add-detail-row").addEventListener("click", () => {
  const list = document.getElementById("details-list");
  list.insertAdjacentHTML("beforeend", detailsRowHtml());
  wireRemoveButtons(list);
});
document.getElementById("add-photo-row").addEventListener("click", () => {
  const list = document.getElementById("photos-list");
  list.insertAdjacentHTML("beforeend", photosRowHtml());
  wireRemoveButtons(list);
});

async function populateForm(yacht) {
  document.getElementById("form-error").textContent = "";
  editingId = yacht?.id ?? null;
  document.getElementById("form-title").textContent = yacht ? `Edit — ${yacht.name}` : "Add Yacht";
  document.getElementById("delete-yacht").style.display = yacht ? "inline-block" : "none";

  document.getElementById("f-name").value = yacht?.name ?? "";
  document.getElementById("f-length").value = yacht?.length_ft ?? "";
  document.getElementById("f-capacity").value = yacht?.guest_capacity ?? "";
  document.getElementById("f-pickup").value = yacht?.pickup_location ?? "";
  document.getElementById("f-image").value = yacht?.image_url ?? "";
  document.getElementById("f-gallery").value = yacht?.gallery_url ?? "";
  document.getElementById("f-sort").value = yacht?.sort_order ?? allYachts.length;
  document.getElementById("f-active").value = String(yacht?.active ?? true);

  const ratesList = document.getElementById("rates-list");
  const detailsList = document.getElementById("details-list");
  const photosList = document.getElementById("photos-list");
  ratesList.innerHTML = "";
  detailsList.innerHTML = "";
  photosList.innerHTML = "";

  if (yacht) {
    const [{ data: rates }, { data: details }, { data: photos }] = await Promise.all([
      supabase.from("yacht_rates").select("*").eq("yacht_id", yacht.id).order("sort_order"),
      supabase.from("yacht_details").select("*").eq("yacht_id", yacht.id).order("sort_order"),
      supabase.from("yacht_photos").select("*").eq("yacht_id", yacht.id).order("sort_order"),
    ]);
    (rates ?? []).forEach(r => ratesList.insertAdjacentHTML("beforeend", ratesRowHtml(r)));
    (details ?? []).forEach(d => detailsList.insertAdjacentHTML("beforeend", detailsRowHtml(d)));
    (photos ?? []).forEach(p => photosList.insertAdjacentHTML("beforeend", photosRowHtml(p)));
  }
  if (!ratesList.children.length) ratesList.insertAdjacentHTML("beforeend", ratesRowHtml());
  if (!detailsList.children.length) detailsList.insertAdjacentHTML("beforeend", detailsRowHtml());
  if (!photosList.children.length) photosList.insertAdjacentHTML("beforeend", photosRowHtml());

  wireRemoveButtons(ratesList);
  wireRemoveButtons(detailsList);
  wireRemoveButtons(photosList);
}

document.getElementById("yacht-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("form-error");
  errEl.textContent = "";

  const yachtPayload = {
    name: document.getElementById("f-name").value.trim(),
    length_ft: parseInt(document.getElementById("f-length").value, 10),
    guest_capacity: parseInt(document.getElementById("f-capacity").value, 10),
    pickup_location: document.getElementById("f-pickup").value.trim() || null,
    image_url: document.getElementById("f-image").value.trim() || null,
    gallery_url: document.getElementById("f-gallery").value.trim() || null,
    sort_order: parseInt(document.getElementById("f-sort").value, 10) || 0,
    active: document.getElementById("f-active").value === "true",
  };

  let yachtId = editingId;
  if (yachtId) {
    const { error } = await supabase.from("yachts").update(yachtPayload).eq("id", yachtId);
    if (error) { errEl.textContent = error.message; return; }
  } else {
    const { data, error } = await supabase.from("yachts").insert(yachtPayload).select().single();
    if (error) { errEl.textContent = error.message; return; }
    yachtId = data.id;
  }

  // Replace child rows wholesale — simplest correct approach for a single-admin,
  // low-concurrency dashboard like this one.
  const rateRows = [...document.querySelectorAll("[data-rate-row]")].map((row, i) => ({
    yacht_id: yachtId,
    day_band: row.querySelector(".r-day").value.trim() || null,
    duration_label: row.querySelector(".r-dur").value.trim(),
    is_hourly: row.querySelector(".r-hourly").checked,
    price: parseInt(row.querySelector(".r-price").value, 10),
    rate_note: row.querySelector(".r-note").value.trim() || null,
    sort_order: i,
  })).filter(r => r.duration_label && !Number.isNaN(r.price));

  const detailRows = [...document.querySelectorAll("[data-detail-row]")].map((row, i) => ({
    yacht_id: yachtId,
    label: row.querySelector(".d-label").value.trim(),
    value: row.querySelector(".d-value").value.trim(),
    sort_order: i,
  })).filter(d => d.label && d.value);

  const photoRows = [...document.querySelectorAll("[data-photo-row]")].map((row, i) => ({
    yacht_id: yachtId,
    url: row.querySelector(".p-url").value.trim(),
    sort_order: i,
  })).filter(p => p.url);

  await supabase.from("yacht_rates").delete().eq("yacht_id", yachtId);
  await supabase.from("yacht_details").delete().eq("yacht_id", yachtId);
  await supabase.from("yacht_photos").delete().eq("yacht_id", yachtId);

  if (rateRows.length) await supabase.from("yacht_rates").insert(rateRows);
  if (detailRows.length) await supabase.from("yacht_details").insert(detailRows);
  if (photoRows.length) await supabase.from("yacht_photos").insert(photoRows);

  showFleetView();
});

document.getElementById("delete-yacht").addEventListener("click", async () => {
  if (!editingId) return;
  if (!confirm("Delete this yacht permanently? This cannot be undone.")) return;
  const { error } = await supabase.from("yachts").delete().eq("id", editingId);
  if (error) { alert("Failed to delete: " + error.message); return; }
  showFleetView();
});

checkSession();
supabase.auth.onAuthStateChange(() => checkSession());
