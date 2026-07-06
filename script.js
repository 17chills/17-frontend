const API_BASE = window.API_BASE_URL || "http://one7-backend.onrender.com";
const SWATCH_COLORS = ["#A855F7", "#D946EF", "#7C3AED", "#6D28D9"];

// State
let tracks = [];
let merch = [];
let settings = {};
let purchased = loadJSON("17chills_purchases", {});
let fanPhone = localStorage.getItem("17chills_fan_phone") || "";
let adminToken = sessionStorage.getItem("17chills_admin_token") || null;
let selectedSwatch = SWATCH_COLORS[0];
let editingSwatch = SWATCH_COLORS[0];
let audioEl = null;
let playingId = null;
let checkoutItem = null;
let editingId = null;
let editingMerchId = null;
let confirmAction = null;
let activeGenreFilters = new Set();

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function savePurchasedCache() { localStorage.setItem("17chills_purchases", JSON.stringify(purchased)); }

function formatUGX(n) { return "UGX " + Number(n).toLocaleString("en-UG"); }
function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function authHeaders(extra = {}) { return adminToken ? { ...extra, Authorization: "Bearer " + adminToken } : extra; }

// Toast
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// Navigation
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => goToPage(btn.dataset.page));
});
document.getElementById("listen-btn").addEventListener("click", () => goToPage("catalog"));
document.getElementById("admin-login-btn").addEventListener("click", () => {
  document.getElementById("pin-input").value = "";
  document.getElementById("pin-error").classList.add("hidden");
  document.getElementById("login-modal").classList.remove("hidden");
});

function goToPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  const target = document.getElementById("page-" + page);
  if (target) target.classList.remove("hidden");
  
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "library") {
    // auto focus phone if empty
    setTimeout(() => {
      const phoneInput = document.getElementById("library-phone");
      if (phoneInput && !phoneInput.value) phoneInput.focus();
    }, 300);
  }
  if (page === "catalog") renderCatalog();
  if (page === "merch") renderMerch();
}

// API helpers
async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error((await safeJson(res))?.error || "Request failed");
  return res.json();
}
async function apiSend(path, method, body, isForm = false) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: authHeaders(isForm ? {} : { "Content-Type": "application/json" }),
    body: isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await safeJson(res))?.error || "Request failed");
  return res.json();
}
async function safeJson(res) { try { return await res.json(); } catch { return null; } }

async function loadEverything() {
  try {
    [tracks, merch, settings] = await Promise.all([
      apiGet("/api/tracks"),
      apiGet("/api/merch"),
      apiGet("/api/settings"),
    ]);
    renderCatalog();
    renderMerch();
    renderSettings();
    renderHeroBio();
  } catch (e) {
    showToast("Couldn't reach server. Is the backend running?");
    console.error(e);
  }
}

// Render hero bio from settings
function renderHeroBio() {
  const heroBio = document.getElementById("hero-bio");
  const aboutBio = document.getElementById("about-bio");
  if (settings.bio) {
    if (heroBio) heroBio.textContent = settings.bio.split(". ").slice(0, 2).join(". ") + ".";
    if (aboutBio) aboutBio.textContent = settings.bio;
  }
}

// Download a purchased track
function downloadTrack(track) {
  if (!track.streamUrl) { showToast("No audio file available for this track yet."); return; }
  const a = document.createElement("a");
  a.href = API_BASE + track.streamUrl;
  a.download = (track.title || "track") + ".mp3";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast(`Downloading "${track.title}"...`);
}

// Preview audio
function togglePlay(track) {
  if (playingId === track.id) { stopPlayback(); return; }
  stopPlayback();

 if (track.streamUrl) {
  // Fix: Use full Cloudinary URL directly if it starts with http, otherwise prepend backend URL
  const audioSrc = track.streamUrl.startsWith('http') 
    ? track.streamUrl 
    : API_BASE + track.streamUrl;

  audioEl = new Audio(audioSrc);
  audioEl.play().catch(() => showToast("Preview couldn't play."));
  audioEl.onended = () => { playingId = null; document.getElementById("vinyl-disc").classList.remove("spinning"); renderCatalog(); };
} else {
    // Fallback tone
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 220;
      gain.gain.value = 0.001; gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.1);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 2.2);
    } catch {}
    setTimeout(() => { if (playingId === track.id) stopPlayback(); }, 2200);
  }
  playingId = track.id;
  document.getElementById("vinyl-disc").classList.add("spinning");
  renderCatalog();
}
function stopPlayback() {
  if (audioEl) { audioEl.pause(); audioEl = null; }
  playingId = null;
  const disc = document.getElementById("vinyl-disc");
  if (disc) disc.classList.remove("spinning");
}

// ========== CATALOG RENDER + FILTERS ==========
function renderCatalog(filteredTracks = null) {
  const grid = document.getElementById("catalog-grid");
  grid.innerHTML = "";

  let list = filteredTracks || tracks;

  // Apply genre filters
  if (activeGenreFilters.size > 0) {
    list = list.filter(t => activeGenreFilters.has(t.genre));
  }

  // Apply search from input
  const searchTerm = (document.getElementById("catalog-search")?.value || "").toLowerCase().trim();
  if (searchTerm) {
    list = list.filter(t => 
      t.title.toLowerCase().includes(searchTerm) || 
      (t.genre && t.genre.toLowerCase().includes(searchTerm)) ||
      (t.description && t.description.toLowerCase().includes(searchTerm))
    );
  }

  // Apply sort
  const sortMode = document.getElementById("catalog-sort")?.value || "newest";
  list = [...list].sort((a, b) => {
    if (sortMode === "price-low") return a.price - b.price;
    if (sortMode === "price-high") return b.price - a.price;
    if (sortMode === "title") return a.title.localeCompare(b.title);
    // newest
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  if (list.length === 0) {
    grid.innerHTML = `<div class="card" style="padding:40px;text-align:center;opacity:.7">No tracks match your filters.</div>`;
    return;
  }

  list.forEach(track => {
    const owned = !!purchased[track.id];
    const isPlaying = playingId === track.id;
    const soldOut = !!track.soldOut;

    const card = document.createElement("div");
    card.className = `card track-card${soldOut ? " soldout" : ""}`;

    const coverStyle = track.coverImageUrl 
  ? `background-image:url(${track.coverImageUrl.startsWith('http') ? track.coverImageUrl : API_BASE + track.coverImageUrl});background-size:cover;background-position:center;`

    card.innerHTML = `
      <div class="track-cover" style="${coverStyle}"></div>
      <div class="track-info">
        ${track.featured ? `<span class="badge badge-featured">Featured</span>` : ""}
        ${soldOut ? `<span class="badge badge-soldout">Sold out</span>` : ""}
        <p class="track-title">${escapeHtml(track.title)}</p>
        <p class="track-meta">${escapeHtml(track.genre || "—")} · ${formatUGX(track.price)}</p>
        ${track.description ? `<p class="track-desc">${escapeHtml(track.description)}</p>` : ""}
        <div class="track-actions">
          <button class="icon-btn play-btn" title="Play preview">${isPlaying ? iconPause() : iconPlay()}</button>
          ${owned 
            ? `<button class="download-btn dl-btn" title="Download full track">${iconDownload()}</button>` 
            : soldOut 
              ? `<span class="sale-empty">Not available</span>` 
              : `<button class="buy-btn buy-track-btn">${iconCart()} Buy</button>`
          }
          ${adminToken ? `<button class="icon-btn edit-track-btn" title="Edit">${iconEdit()}</button>` : ""}
          ${adminToken ? `<button class="remove-btn remove-track-btn" title="Remove">${iconX()}</button>` : ""}
        </div>
        ${adminToken ? `
          <div class="admin-toggle-row">
            <button class="toggle-btn feature-toggle-btn ${track.featured ? "active" : ""}">${track.featured ? "★ Featured" : "☆ Mark featured"}</button>
            <button class="toggle-btn soldout-toggle-btn ${soldOut ? "active" : ""}">${soldOut ? "Mark in stock" : "Mark sold out"}</button>
          </div>` : ""}
      </div>
    `;

    // Event listeners
    card.querySelector(".play-btn").addEventListener("click", () => togglePlay(track));
    
    if (owned) {
      card.querySelector(".dl-btn").addEventListener("click", () => downloadTrack(track));
    } else if (!soldOut) {
      card.querySelector(".buy-track-btn").addEventListener("click", () => openCheckout(track, "track"));
    }
    
    if (adminToken) {
      card.querySelector(".remove-track-btn").addEventListener("click", () => {
        openConfirm(`Remove "${track.title}"? This cannot be undone.`, async () => {
          try {
            await apiSend(`/api/tracks/${track.id}`, "DELETE");
            await loadEverything();
            showToast("Track removed");
          } catch (e) { showToast(e.message); }
        });
      });
      card.querySelector(".edit-track-btn").addEventListener("click", () => openEditModal(track.id));
      
      const ft = card.querySelector(".feature-toggle-btn");
      if (ft) ft.addEventListener("click", async () => {
        try {
          await apiSend(`/api/tracks/${track.id}`, "PUT", buildTrackForm({ featured: !track.featured }));
          await loadEverything();
        } catch (e) { showToast(e.message); }
      });
      
      const so = card.querySelector(".soldout-toggle-btn");
      if (so) so.addEventListener("click", async () => {
        try {
          await apiSend(`/api/tracks/${track.id}`, "PUT", buildTrackForm({ soldOut: !track.soldOut }));
          await loadEverything();
        } catch (e) { showToast(e.message); }
      });
    }
    grid.appendChild(card);
  });
}

// Genre filter chips
function renderGenreFilters() {
  const wrap = document.getElementById("genre-filters");
  if (!wrap) return;
  wrap.innerHTML = "";
  
  const genres = [...new Set(tracks.map(t => t.genre).filter(Boolean))];
  if (genres.length === 0) return;

  // All chip
  const allChip = document.createElement("div");
  allChip.className = `chip ${activeGenreFilters.size === 0 ? "active" : ""}`;
  allChip.textContent = "All";
  allChip.onclick = () => { activeGenreFilters.clear(); renderCatalog(); renderGenreFilters(); };
  wrap.appendChild(allChip);

  genres.forEach(g => {
    const chip = document.createElement("div");
    chip.className = `chip ${activeGenreFilters.has(g) ? "active" : ""}`;
    chip.textContent = g;
    chip.onclick = () => {
      if (activeGenreFilters.has(g)) activeGenreFilters.delete(g);
      else activeGenreFilters.add(g);
      renderCatalog();
      renderGenreFilters();
    };
    wrap.appendChild(chip);
  });
}

// Search + sort listeners (catalog)
function setupCatalogControls() {
  const search = document.getElementById("catalog-search");
  const sort = document.getElementById("catalog-sort");
  if (search) search.addEventListener("input", () => renderCatalog());
  if (sort) sort.addEventListener("change", () => renderCatalog());
}

// Merch search + sort
function setupMerchControls() {
  const search = document.getElementById("merch-search");
  const sort = document.getElementById("merch-sort");
  if (search) search.addEventListener("input", () => renderMerch());
  if (sort) sort.addEventListener("change", () => renderMerch());
}

// ========== MERCH RENDER ==========
function renderMerch(filtered = null) {
  const grid = document.getElementById("merch-grid");
  grid.innerHTML = "";

  let list = filtered || merch;

  const searchTerm = (document.getElementById("merch-search")?.value || "").toLowerCase().trim();
  if (searchTerm) {
    list = list.filter(m => m.name.toLowerCase().includes(searchTerm));
  }

  const sortMode = document.getElementById("merch-sort")?.value || "newest";
  list = [...list].sort((a, b) => {
    if (sortMode === "price-low") return a.price - b.price;
    if (sortMode === "price-high") return b.price - a.price;
    if (sortMode === "name") return a.name.localeCompare(b.name);
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  list.forEach(item => {
    const owned = !!purchased[item.id];
    const card = document.createElement("div");
    card.className = "card";

    const thumbStyle = item.imageUrl 
      ? `background-image:url(${API_BASE + item.imageUrl}); background-size:cover; background-position:center;` 
      : "";

    card.innerHTML = `
      <div class="merch-thumb" style="${thumbStyle}">${item.imageUrl ? "" : iconImage()}</div>
      <p class="merch-name">${escapeHtml(item.name)}</p>
      <p class="merch-price">${formatUGX(item.price)}</p>
      ${owned 
        ? `<span class="owned-tag">${iconCheck()} Order placed</span>` 
        : `<button class="btn-primary full buy-merch-btn">Buy Now</button>`
      }
      ${adminToken ? `
      <div class="merch-actions">
        <button class="icon-btn edit-merch-btn" title="Edit">${iconEdit()}</button>
        <button class="remove-btn remove-merch-btn" title="Remove">${iconX()}</button>
      </div>` : ""}
    `;

    if (!owned) {
      card.querySelector(".buy-merch-btn").addEventListener("click", () => openCheckout(item, "merch"));
    }
    if (adminToken) {
      card.querySelector(".edit-merch-btn").addEventListener("click", () => openEditMerchModal(item.id));
      card.querySelector(".remove-merch-btn").addEventListener("click", () => {
        openConfirm(`Remove "${item.name}" from merch?`, async () => {
          try {
            await apiSend(`/api/merch/${item.id}`, "DELETE");
            await loadEverything();
            showToast("Merch removed");
          } catch (e) { showToast(e.message); }
        });
      });
    }
    grid.appendChild(card);
  });
}

// ========== SETTINGS + CONTACT ==========
function renderSettings() {
  if (!settings) return;

  // Contact quick bar
  const phoneEl = document.getElementById("contact-phone");
  if (phoneEl && settings.phone) {
    phoneEl.href = "tel:" + settings.phone.replace(/\s+/g, "");
    phoneEl.innerHTML = `<span>${settings.phone}</span>`;
  }
  
  const phone2El = document.getElementById("contact-phone2");
  if (phone2El && settings.phone2) {
    phone2El.href = "https://wa.me/" + settings.phone2.replace(/\D/g, "");
    phone2El.innerHTML = `<span>${settings.phone2} (WhatsApp)</span>`;
  }

  const emailEl = document.getElementById("contact-email");
  if (emailEl && settings.email) {
    emailEl.href = "mailto:" + settings.email;
    emailEl.innerHTML = `<span>${settings.email}</span>`;
  }

  // Pre-fill admin form
  const fields = ["phone", "phone2", "email", "instagram", "tiktok", "twitter", "facebook", "youtube", "bio"];
  fields.forEach(f => {
    const input = document.getElementById("settings-" + f);
    if (input && settings[f] !== undefined) {
      input.value = settings[f] || "";
    }
  });
}

document.getElementById("save-settings-btn").addEventListener("click", async () => {
  try {
    await apiSend("/api/settings", "PUT", {
      phone: document.getElementById("settings-phone").value.trim(),
      phone2: document.getElementById("settings-phone2").value.trim(),
      email: document.getElementById("settings-email").value.trim(),
      instagram: document.getElementById("settings-instagram").value.trim(),
      tiktok: document.getElementById("settings-tiktok").value.trim(),
      twitter: document.getElementById("settings-twitter").value.trim(),
      facebook: document.getElementById("settings-facebook").value.trim(),
      youtube: document.getElementById("settings-youtube").value.trim(),
      bio: document.getElementById("settings-bio").value.trim(),
    });
    await loadEverything();
    showToast("Bio & contact info updated — live for everyone!");
  } catch (e) { showToast(e.message); }
});

// ========== CHECKOUT ==========
function openCheckout(item, type) {
  checkoutItem = { ...item, _type: type };
  document.getElementById("checkout-title").textContent = item.title || item.name;
  document.getElementById("checkout-price").textContent = formatUGX(item.price);
  document.getElementById("checkout-phone").value = fanPhone;
  document.getElementById("checkout-status").textContent = "";
  document.getElementById("checkout-modal").classList.remove("hidden");
}
document.getElementById("checkout-close").addEventListener("click", () => {
  document.getElementById("checkout-modal").classList.add("hidden");
  checkoutItem = null;
});

document.getElementById("checkout-pay-btn").addEventListener("click", async () => {
  const phone = document.getElementById("checkout-phone").value.trim();
  if (!phone || phone.replace(/\D/g, "").length < 9) {
    showToast("Please enter a valid Mobile Money number");
    return;
  }

  const btn = document.getElementById("checkout-pay-btn");
  const statusEl = document.getElementById("checkout-status");

  btn.disabled = true;
  btn.textContent = "Connecting to mobile money...";
  statusEl.textContent = "Please wait while we open the payment page...";

  try {
    const result = await apiSend("/api/payments/initiate", "POST", {
      itemType: checkoutItem._type,
      itemId: checkoutItem.id,
      phone,
    });

    fanPhone = phone;
    localStorage.setItem("17chills_fan_phone", phone);

    // Small delay so user sees the message
    setTimeout(() => {
      window.location.href = result.paymentLink;
    }, 800);

  } catch (e) {
    statusEl.textContent = e.message || "Payment could not be started. Please try again.";
    btn.disabled = false;
    btn.textContent = "Pay Securely with Mobile Money / Card";
  }
});

    fanPhone = phone;
    localStorage.setItem("17chills_fan_phone", phone);
    // Redirect to Pesapal
    window.location.href = result.paymentLink;
  } catch (e) {
    statusEl.textContent = e.message || "Payment could not be started. Please try again.";
    btn.disabled = false;
    btn.textContent = "Pay Securely with Mobile Money / Card";
  }
});

// Return from payment
async function checkReturnFromPayment() {
  const params = new URLSearchParams(window.location.search);
  const paid = params.get("paid");
  const itemId = params.get("itemId");
  if (paid === "1" && itemId) {
    purchased[itemId] = true;
    savePurchasedCache();
    showToast("Payment confirmed! Thank you for supporting the music.");
    window.history.replaceState({}, "", window.location.pathname);
    await loadEverything();
  }
}

// ========== MY LIBRARY ==========
document.getElementById("library-load-btn").addEventListener("click", loadMyLibrary);

async function loadMyLibrary() {
  const phone = document.getElementById("library-phone").value.trim();
  if (!phone || phone.replace(/\D/g, "").length < 9) {
    showToast("Enter a valid phone number");
    return;
  }
  fanPhone = phone;
  localStorage.setItem("17chills_fan_phone", phone);

  const results = document.getElementById("library-results");
  const empty = document.getElementById("library-empty");
  const tracksWrap = document.getElementById("library-tracks");
  const merchWrap = document.getElementById("library-merch");

  tracksWrap.innerHTML = "";
  merchWrap.innerHTML = "";
  results.classList.add("hidden");
  empty.classList.add("hidden");

  // Check ownership for every track and merch using backend
  const ownedTracks = [];
  const ownedMerch = [];

  for (const track of tracks) {
    try {
      const res = await apiGet(`/api/payments/owns?phone=${encodeURIComponent(phone)}&itemId=${track.id}`);
      if (res.owns) ownedTracks.push(track);
    } catch {}
  }
  for (const item of merch) {
    try {
      const res = await apiGet(`/api/payments/owns?phone=${encodeURIComponent(phone)}&itemId=${item.id}`);
      if (res.owns) ownedMerch.push(item);
    } catch {}
  }

  if (ownedTracks.length === 0 && ownedMerch.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  results.classList.remove("hidden");

  // Render owned tracks
  ownedTracks.forEach(track => {
    const card = document.createElement("div");
    card.className = "card track-card";

    const coverStyle = track.coverImageUrl 
  ? `background-image:url(${track.coverImageUrl.startsWith('http') ? track.coverImageUrl : API_BASE + track.coverImageUrl}); background-size:cover; background-position:center;` 
  : `background:${track.coverColor}`;
    
    card.innerHTML = `
      <div class="track-cover" style="${coverStyle}"></div>
      <div class="track-info">
        <p class="track-title">${escapeHtml(track.title)}</p>
        <p class="track-meta">${escapeHtml(track.genre || "")} · ${formatUGX(track.price)}</p>
        <button class="download-btn dl-btn" style="margin-top:8px;width:auto;padding:0 16px;height:34px;border-radius:999px">Download MP3</button>
      </div>
    `;
    card.querySelector(".dl-btn").addEventListener("click", () => downloadTrack(track));
    tracksWrap.appendChild(card);
  });

  // Render owned merch
  ownedMerch.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";
    const thumbStyle = item.imageUrl ? `background-image:url(${API_BASE + item.imageUrl});background-size:cover;background-position:center;` : "";
    card.innerHTML = `
      <div class="merch-thumb" style="${thumbStyle}">${item.imageUrl ? "" : iconImage()}</div>
      <p class="merch-name">${escapeHtml(item.name)}</p>
      <p class="merch-price">${formatUGX(item.price)}</p>
      <span class="owned-tag">${iconCheck()} Order placed — thank you!</span>
    `;
    merchWrap.appendChild(card);
  });
}

// ========== ADMIN LOGIN ==========
document.getElementById("login-close").addEventListener("click", () => document.getElementById("login-modal").classList.add("hidden"));
document.getElementById("pin-submit-btn").addEventListener("click", submitPassword);
document.getElementById("pin-input").addEventListener("keydown", e => { if (e.key === "Enter") submitPassword(); });

async function submitPassword() {
  const val = document.getElementById("pin-input").value;
  try {
    const result = await apiSend("/api/auth/login", "POST", { password: val });
    adminToken = result.token;
    sessionStorage.setItem("17chills_admin_token", adminToken);
    document.getElementById("login-modal").classList.add("hidden");
    document.getElementById("admin-panel").classList.remove("hidden");
    await loadEverything();
    renderSalesHistory();
    renderGenreFilters();
    showToast("Welcome back, artist!");
  } catch (e) {
    const errEl = document.getElementById("pin-error");
    errEl.textContent = e.message || "Wrong password.";
    errEl.classList.remove("hidden");
  }
}

document.getElementById("exit-admin-btn").addEventListener("click", () => {
  adminToken = null;
  sessionStorage.removeItem("17chills_admin_token");
  document.getElementById("admin-panel").classList.add("hidden");
  renderCatalog();
  renderMerch();
});

// Change password
document.getElementById("change-password-btn").addEventListener("click", async () => {
  const val = document.getElementById("new-password-input").value.trim();
  if (val.length < 4) { showToast("Password must be at least 4 characters"); return; }
  try {
    await apiSend("/api/auth/change-password", "POST", { newPassword: val });
    document.getElementById("new-password-input").value = "";
    showToast("Password changed successfully");
  } catch (e) { showToast(e.message); }
});

// ========== EDIT TRACK ==========
function openEditModal(id) {
  const track = tracks.find(t => t.id === id);
  if (!track) return;
  editingId = id;
  editingSwatch = track.coverColor || SWATCH_COLORS[0];
  document.getElementById("edit-track-title").value = track.title;
  document.getElementById("edit-track-genre").value = track.genre || "";
  document.getElementById("edit-track-desc").value = track.description || "";
  document.getElementById("edit-track-price").value = track.price;
  document.getElementById("edit-track-cover-file").value = "";
  document.getElementById("edit-track-audio-file").value = "";
  renderEditSwatches();
  document.getElementById("edit-modal").classList.remove("hidden");
}
document.getElementById("edit-close").addEventListener("click", () => {
  document.getElementById("edit-modal").classList.add("hidden");
  editingId = null;
});

function renderEditSwatches() {
  const wrap = document.getElementById("edit-color-swatches");
  wrap.innerHTML = "";
  SWATCH_COLORS.forEach(c => {
    const b = document.createElement("button");
    b.className = "swatch" + (c === editingSwatch ? " selected" : "");
    b.style.background = c;
    b.onclick = () => { editingSwatch = c; renderEditSwatches(); };
    wrap.appendChild(b);
  });
}

document.getElementById("edit-save-btn").addEventListener("click", async () => {
  const title = document.getElementById("edit-track-title").value.trim();
  if (!title) { showToast("Title cannot be empty"); return; }

  const form = new FormData();
  form.append("title", title);
  form.append("genre", document.getElementById("edit-track-genre").value.trim());
  form.append("description", document.getElementById("edit-track-desc").value.trim());
  form.append("price", document.getElementById("edit-track-price").value);
  form.append("coverColor", editingSwatch);
  const coverFile = document.getElementById("edit-track-cover-file").files[0];
  const audioFile = document.getElementById("edit-track-audio-file").files[0];
  if (coverFile) form.append("cover", coverFile);
  if (audioFile) form.append("audio", audioFile);

  try {
    await apiSend(`/api/tracks/${editingId}`, "PUT", form, true);
    document.getElementById("edit-modal").classList.add("hidden");
    editingId = null;
    await loadEverything();
    showToast("Track updated");
  } catch (e) { showToast(e.message); }
});

// ========== EDIT MERCH ==========
function openEditMerchModal(id) {
  const item = merch.find(m => m.id === id);
  if (!item) return;
  editingMerchId = id;
  document.getElementById("edit-merch-name").value = item.name;
  document.getElementById("edit-merch-price").value = item.price;
  document.getElementById("edit-merch-image-file").value = "";
  document.getElementById("edit-merch-modal").classList.remove("hidden");
}
document.getElementById("edit-merch-close").addEventListener("click", () => {
  document.getElementById("edit-merch-modal").classList.add("hidden");
  editingMerchId = null;
});
document.getElementById("edit-merch-save-btn").addEventListener("click", async () => {
  const name = document.getElementById("edit-merch-name").value.trim();
  if (!name) { showToast("Name cannot be empty"); return; }

  const form = new FormData();
  form.append("name", name);
  form.append("price", document.getElementById("edit-merch-price").value);
  const img = document.getElementById("edit-merch-image-file").files[0];
  if (img) form.append("image", img);

  try {
    await apiSend(`/api/merch/${editingMerchId}`, "PUT", form, true);
    document.getElementById("edit-merch-modal").classList.add("hidden");
    editingMerchId = null;
    await loadEverything();
    showToast("Merch updated");
  } catch (e) { showToast(e.message); }
});

// ========== ADMIN ADD TRACK / MERCH ==========
function renderSwatches() {
  const wrap = document.getElementById("color-swatches");
  if (!wrap) return;
  wrap.innerHTML = "";
  SWATCH_COLORS.forEach(c => {
    const b = document.createElement("button");
    b.className = "swatch" + (c === selectedSwatch ? " selected" : "");
    b.style.background = c;
    b.onclick = () => { selectedSwatch = c; renderSwatches(); };
    wrap.appendChild(b);
  });
}

document.getElementById("add-track-btn").addEventListener("click", async () => {
  const title = document.getElementById("new-track-title").value.trim();
  if (!title) { showToast("Enter a track title"); return; }

  const form = new FormData();
  form.append("title", title);
  form.append("genre", document.getElementById("new-track-genre").value.trim());
  form.append("description", document.getElementById("new-track-desc").value.trim());
  form.append("price", document.getElementById("new-track-price").value);
  form.append("coverColor", selectedSwatch);
  const cover = document.getElementById("new-track-cover-file").files[0];
  const audio = document.getElementById("new-track-audio-file").files[0];
  if (cover) form.append("cover", cover);
  if (audio) form.append("audio", audio);

  try {
    await apiSend("/api/tracks", "POST", form, true);
    // reset form
    document.getElementById("new-track-title").value = "";
    document.getElementById("new-track-genre").value = "";
    document.getElementById("new-track-desc").value = "";
    document.getElementById("new-track-price").value = "3000";
    document.getElementById("new-track-cover-file").value = "";
    document.getElementById("new-track-audio-file").value = "";
    await loadEverything();
    showToast(`"${title}" added to catalog`);
  } catch (e) { showToast(e.message); }
});

document.getElementById("add-merch-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-merch-name").value.trim();
  if (!name) { showToast("Enter item name"); return; }

  const form = new FormData();
  form.append("name", name);
  form.append("price", document.getElementById("new-merch-price").value);
  const img = document.getElementById("new-merch-image-file").files[0];
  if (img) form.append("image", img);

  try {
    await apiSend("/api/merch", "POST", form, true);
    document.getElementById("new-merch-name").value = "";
    document.getElementById("new-merch-price").value = "35000";
    document.getElementById("new-merch-image-file").value = "";
    await loadEverything();
    showToast(`"${name}" added to merch`);
  } catch (e) { showToast(e.message); }
});

// Bulk price update
document.getElementById("bulk-apply-btn").addEventListener("click", async () => {
  const mode = document.getElementById("bulk-mode").value;
  const value = Number(document.getElementById("bulk-value").value);
  if (isNaN(value) || value < 0) { showToast("Enter a valid number"); return; }

  try {
    await Promise.all(tracks.map(t => {
      let newPrice = t.price;
      if (mode === "percent-off") newPrice = Math.max(0, Math.round(t.price * (1 - value / 100)));
      else if (mode === "percent-up") newPrice = Math.round(t.price * (1 + value / 100));
      else if (mode === "set-all") newPrice = Math.round(value);
      return apiSend(`/api/tracks/${t.id}`, "PUT", buildTrackForm({ price: newPrice }));
    }));
    await loadEverything();
    showToast("All track prices updated across the site");
  } catch (e) { showToast(e.message); }
});

function buildTrackForm(fields) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, v); });
  return form;
}

// Sales history
async function renderSalesHistory() {
  const wrap = document.getElementById("sales-history");
  try {
    const res = await fetch(API_BASE + "/api/payments/history", { headers: authHeaders() });
    const sales = await res.json();
    if (!res.ok) throw new Error();
    if (!sales.length) {
      wrap.innerHTML = `<p class="sale-empty">No sales recorded yet. Start promoting!</p>`;
      return;
    }
    wrap.innerHTML = sales.slice(0, 40).map(s => {
      const d = new Date(s.createdAt);
      const dateStr = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `<div class="sale-row"><span>${escapeHtml(s.itemName)}<br><span class="sale-empty">${dateStr}</span></span><span style="font-weight:600">${formatUGX(s.amount)}</span></div>`;
    }).join("");
  } catch {
    wrap.innerHTML = `<p class="sale-empty">Could not load sales history.</p>`;
  }
}

// Confirm modal
function openConfirm(message, onConfirm) {
  document.getElementById("confirm-message").textContent = message;
  confirmAction = onConfirm;
  document.getElementById("confirm-modal").classList.remove("hidden");
}
document.getElementById("confirm-close").addEventListener("click", closeConfirm);
document.getElementById("confirm-cancel-btn").addEventListener("click", closeConfirm);
function closeConfirm() { document.getElementById("confirm-modal").classList.add("hidden"); confirmAction = null; }
document.getElementById("confirm-delete-btn").addEventListener("click", () => { if (confirmAction) confirmAction(); closeConfirm(); });

// Icons
function iconPlay() { return `<svg class="icon small" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`; }
function iconPause() { return `<svg class="icon small" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; }
function iconDownload() { return `<svg class="icon small" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`; }
function iconCart() { return `<svg class="icon small" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`; }
function iconX() { return `<svg class="icon small" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`; }
function iconEdit() { return `<svg class="icon small" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`; }
function iconCheck() { return `<svg class="icon small" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`; }
function iconImage() { return `<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`; }

// Footer year + init
document.getElementById("footer-year").textContent = new Date().getFullYear();
document.getElementById("footer-dot").addEventListener("click", () => {
  document.getElementById("pin-input").value = "";
  document.getElementById("pin-error").classList.add("hidden");
  document.getElementById("login-modal").classList.remove("hidden");
});

// Initial setup
renderSwatches();
setupCatalogControls();
setupMerchControls();
checkReturnFromPayment();
loadEverything().then(() => {
  renderGenreFilters();
  if (adminToken) {
    document.getElementById("admin-panel").classList.remove("hidden");
    renderSalesHistory();
  }
  // Show home by default
  document.getElementById("page-home").classList.remove("hidden");
});

// Expose some for debugging if needed
window._17chills = { goToPage, loadEverything };
