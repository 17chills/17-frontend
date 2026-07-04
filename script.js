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
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// Navigation
function setupNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => goToPage(btn.dataset.page));
  });

  const listenBtn = document.getElementById("listen-btn");
  if (listenBtn) listenBtn.addEventListener("click", () => goToPage("catalog"));

  const adminBtn = document.getElementById("admin-login-btn");
  if (adminBtn) adminBtn.addEventListener("click", () => {
    const pinInput = document.getElementById("pin-input");
    const pinError = document.getElementById("pin-error");
    const loginModal = document.getElementById("login-modal");
    if (pinInput) pinInput.value = "";
    if (pinError) pinError.classList.add("hidden");
    if (loginModal) loginModal.classList.remove("hidden");
  });
}

function goToPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  const target = document.getElementById("page-" + page);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "library") {
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

// Render hero bio
function renderHeroBio() {
  const heroBio = document.getElementById("hero-bio");
  const aboutBio = document.getElementById("about-bio");
  if (settings.bio) {
    if (heroBio) heroBio.textContent = settings.bio.split(". ").slice(0, 2).join(". ") + ".";
    if (aboutBio) aboutBio.textContent = settings.bio;
  }
}

// Audio preview
function togglePlay(track) {
  if (playingId === track.id) { stopPlayback(); return; }
  stopPlayback();

  if (track.streamUrl) {
    audioEl = new Audio(API_BASE + track.streamUrl);
    audioEl.play().catch(() => showToast("Preview couldn't play."));
    audioEl.onended = () => { playingId = null; stopPlayback(); renderCatalog(); };
  } else {
    showToast("Preview not available");
  }
  playingId = track.id;
  const disc = document.getElementById("vinyl-disc");
  if (disc) disc.classList.add("spinning");
  renderCatalog();
}

function stopPlayback() {
  if (audioEl) { audioEl.pause(); audioEl = null; }
  playingId = null;
  const disc = document.getElementById("vinyl-disc");
  if (disc) disc.classList.remove("spinning");
}

// ==================== CATALOG ====================
function renderCatalog(filteredTracks = null) {
  const grid = document.getElementById("catalog-grid");
  if (!grid) return;
  grid.innerHTML = "";

  let list = filteredTracks || tracks;

  if (activeGenreFilters.size > 0) {
    list = list.filter(t => activeGenreFilters.has(t.genre));
  }

  const searchTerm = (document.getElementById("catalog-search")?.value || "").toLowerCase().trim();
  if (searchTerm) {
    list = list.filter(t =>
      t.title.toLowerCase().includes(searchTerm) ||
      (t.genre && t.genre.toLowerCase().includes(searchTerm)) ||
      (t.description && t.description.toLowerCase().includes(searchTerm))
    );
  }

  const sortMode = document.getElementById("catalog-sort")?.value || "newest";
  list = [...list].sort((a, b) => {
    if (sortMode === "price-low") return a.price - b.price;
    if (sortMode === "price-high") return b.price - a.price;
    if (sortMode === "title") return a.title.localeCompare(b.title);
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
      ? `background-image:url(${API_BASE + track.coverImageUrl}); background-size:cover; background-position:center;`
      : `background:${track.coverColor}`;

card.innerHTML = `
  <div class="track-cover" style="${coverStyle}"></div>
  <div class="track-info">
    ${track.featured ? `<span class="badge badge-featured">Featured</span>` : ""}
    ${soldOut ? `<span class="badge badge-soldout">Sold out</span>` : ""}
    <p class="track-title">${escapeHtml(track.title)}</p>
    <p class="track-meta">${escapeHtml(track.genre || "—")} · ${formatUGX(track.price)}</p>
    \( {track.description ? `<p class="track-desc"> \){escapeHtml(track.description)}</p>` : ""}

    <div class="track-actions">
      <button class="icon-btn play-btn" title="Play preview">
        ${isPlaying ? iconPause() : iconPlay()}
      </button>

      ${owned 
        ? `<button class="download-btn dl-btn" title="Download full track">${iconDownload()}</button>` 
        : soldOut 
          ? `<span class="sale-empty">Not available</span>` 
          : `<button class="buy-btn buy-track-btn">${iconCart()} Buy</button>`
      }

      \( {adminToken ? `<button class="icon-btn edit-track-btn" title="Edit"> \){iconEdit()}</button>` : ""}
      \( {adminToken ? `<button class="remove-btn remove-track-btn" title="Remove"> \){iconX()}</button>` : ""}
    </div>
  </div>
`;

    // Event listeners
    const playBtn = card.querySelector(".play-btn");
    if (playBtn) playBtn.addEventListener("click", () => togglePlay(track));

    if (owned) {
      const dlBtn = card.querySelector(".dl-btn");
      if (dlBtn) dlBtn.addEventListener("click", () => downloadTrack(track));
    } else if (!soldOut) {
      const buyBtn = card.querySelector(".buy-track-btn");
      if (buyBtn) buyBtn.addEventListener("click", () => openCheckout(track, "track"));
    }

    if (adminToken) {
      const removeBtn = card.querySelector(".remove-track-btn");
      if (removeBtn) removeBtn.addEventListener("click", () => {
        openConfirm(`Remove "${track.title}"? This cannot be undone.`, async () => {
          try {
            await apiSend(`/api/tracks/${track.id}`, "DELETE");
            await loadEverything();
            showToast("Track removed");
          } catch (e) { showToast(e.message); }
        });
      });

      const editBtn = card.querySelector(".edit-track-btn");
      if (editBtn) editBtn.addEventListener("click", () => openEditModal(track.id));
    }

    grid.appendChild(card);
  });
}

// ==================== CONFIRM MODAL (FIXED) ====================
function openConfirm(message, onConfirm) {
  const msgEl = document.getElementById("confirm-message");
  if (msgEl) msgEl.textContent = message;
  confirmAction = onConfirm;
  const modal = document.getElementById("confirm-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeConfirm() {
  const modal = document.getElementById("confirm-modal");
  if (modal) modal.classList.add("hidden");
  confirmAction = null;
}

function setupConfirmModalListeners() {
  const closeBtn = document.getElementById("confirm-close");
  const cancelBtn = document.getElementById("confirm-cancel-btn");
  const deleteBtn = document.getElementById("confirm-delete-btn");

  if (closeBtn) closeBtn.addEventListener("click", closeConfirm);
  if (cancelBtn) cancelBtn.addEventListener("click", closeConfirm);
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (confirmAction) confirmAction();
      closeConfirm();
    });
  }
}

// ==================== INITIALIZATION ====================
function initializeApp() {
  setupNavigation();
  setupConfirmModalListeners();

  const footerDot = document.getElementById("footer-dot");
  if (footerDot) {
    footerDot.addEventListener("click", () => {
      const pinInput = document.getElementById("pin-input");
      const pinError = document.getElementById("pin-error");
      const loginModal = document.getElementById("login-modal");
      if (pinInput) pinInput.value = "";
      if (pinError) pinError.classList.add("hidden");
      if (loginModal) loginModal.classList.remove("hidden");
    });
  }

  // Load everything
  loadEverything().then(() => {
    if (adminToken) {
      const adminPanel = document.getElementById("admin-panel");
      if (adminPanel) adminPanel.classList.remove("hidden");
    }
    // Show home page by default
    const homePage = document.getElementById("page-home");
    if (homePage) homePage.classList.remove("hidden");
  });
}

// Start the app
document.addEventListener("DOMContentLoaded", initializeApp);
