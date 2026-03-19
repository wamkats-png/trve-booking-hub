/**
 * TRVE Booking Hub — app.js
 * The Rift Valley Explorer · Safari Operations Dashboard
 * Vanilla JS, no frameworks
 */

(function () {
  'use strict';

  /* ============================================================
     LOGIN GATE
     ============================================================ */
  // SHA-256 hash of the employee password (not stored in plaintext)
  const PASSWORD_HASH = '4879a4eb47de72fb5a3c33d7385b17c48eb91237936741b394fb286ed22afa58';

  // In-memory auth flag (persists for this page session)
  let _trveAuth = false;

  function getAuthState() {
    return _trveAuth;
  }
  function setAuthState() {
    _trveAuth = true;
  }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function initLoginGate() {
    var gate = document.getElementById('loginGate');
    var form = document.getElementById('loginForm');
    var input = document.getElementById('loginPassword');
    var errorEl = document.getElementById('loginError');
    var toggleBtn = document.getElementById('loginToggleVis');
    var card = document.querySelector('.login-card');

    // Already authenticated this session
    if (getAuthState()) {
      gate.classList.add('hidden');
      return;
    }

    // Show the gate
    gate.classList.remove('hidden');

    // Toggle password visibility
    toggleBtn.addEventListener('click', function () {
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });

    // Handle login
    document.getElementById('loginSubmit').addEventListener('click', async function (e) {
      e.preventDefault();
      var val = input.value.trim();
      if (!val) {
        input.focus();
        return;
      }

      var hash = await sha256(val);
      if (hash === PASSWORD_HASH) {
        setAuthState();
        gate.style.transition = 'opacity 0.3s ease';
        gate.style.opacity = '0';
        setTimeout(function () {
          gate.classList.add('hidden');
          gate.style.opacity = '';
          gate.style.transition = '';
        }, 300);
      } else {
        errorEl.classList.remove('hidden');
        card.classList.remove('shake');
        void card.offsetWidth; // reflow
        card.classList.add('shake');
        input.select();
        input.focus();
      }
    });

    // Clear error on input
    input.addEventListener('input', function () {
      errorEl.classList.add('hidden');
    });
  }

  // Run login gate immediately on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginGate);
  } else {
    initLoginGate();
  }

  /* ============================================================
     CONFIG
     ============================================================ */
  // MAJOR-24: Configurable API URL — override via window.TRVE_API_URL or config.js
  // Auto-detect: if hosted on Render (or any same-origin server), use relative path;
  // if running inside Perplexity Computer sandbox, use the port proxy.
  const API = window.TRVE_API_URL || (window.location.hostname.includes('pplx') ? 'port/8000' : '');

  const INTERESTS = [
    'gorilla_trekking', 'chimp_trekking', 'wildlife_safari', 'primate',
    'birding', 'cultural', 'adventure', 'luxury', 'scenic', 'boat_cruise',
    'tree_climbing_lions', 'off_beaten_path', 'community', 'beach',
    'big_five', 'cross_border', 'history'
  ];

  const INTEREST_LABELS = {
    gorilla_trekking: 'Gorilla Trekking',
    chimp_trekking: 'Chimp Trekking',
    wildlife_safari: 'Wildlife Safari',
    primate: 'Primates',
    birding: 'Birding',
    cultural: 'Cultural',
    adventure: 'Adventure',
    luxury: 'Luxury',
    scenic: 'Scenic',
    boat_cruise: 'Boat Cruise',
    tree_climbing_lions: 'Tree Lions',
    off_beaten_path: 'Off The Beaten Path',
    community: 'Community',
    beach: 'Beach',
    big_five: 'Big Five',
    cross_border: 'Cross-Border',
    history: 'History'
  };

  const STATUS_COLUMNS = [
    'New_Inquiry', 'Active_Quote', 'Confirmed', 'In_Progress', 'Completed', 'Cancelled', 'Unconfirmed'
  ];

  const STATUS_LABELS = {
    New_Inquiry: 'New Inquiry',
    Active_Quote: 'Active Quote',
    Confirmed: 'Confirmed',
    In_Progress: 'In Progress',
    Completed: 'Completed',
    Cancelled: 'Cancelled',
    Unconfirmed: 'Unconfirmed'
  };

  const STATUS_BADGE_CLASS = {
    New_Inquiry: 'badge-new',
    Active_Quote: 'badge-active',
    Confirmed: 'badge-confirmed',
    In_Progress: 'badge-inprogress',
    Completed: 'badge-completed',
    Cancelled: 'badge-cancelled',
    Unconfirmed: 'badge-unconfirmed'
  };

  const CHANNEL_BADGE_CLASS = {
    whatsapp: 'badge-ch-whatsapp',
    email: 'badge-ch-email',
    b2b: 'badge-ch-b2b',
    hornbill: 'badge-ch-hornbill',
    direct: 'badge-ch-direct',
    website: 'badge-ch-website'
  };

  /* ============================================================
     STATE
     ============================================================ */
  const state = {
    currentView: 'pipeline',
    coordinator: 'Desire',
    enquiries: [],
    itineraries: [],
    lodges: [],
    curation: {
      enquiryId: null,
      suggestions: [],
      selectedItineraryId: null,
      selectedItineraryName: ''
    },
    quotations: [],
    liveFx: 3575,          // live USD/UGX — updated on init from open.er-api.com
    liveFxAt: null,        // ISO timestamp of last fetch
    apiConfig: null,
    syncInterval: null,
    activities: [],
    guestRecords: [],      // [{id:'G-2026-001', name:'', room_idx:null, sub_room:null}]
    _guestIdSeq: 0,        // auto-increment counter for guest IDs
    staffRooms: [],        // [{idx, role, lodge, roomType, nights, mealPlan, pricingOption, occupantName, rateUsd}]
    _staffRoomSeq: 0,      // stable index for staff rooms
    childAges: [],         // [age|null, ...] one entry per child, null = age not entered
    childSharingConfirmed: {}, // {roomKey: bool} — user confirmed child sharing per room slot
    guestPool: [],         // [{id,type,label,age}] — guest objects derived from Basic Details pax
    roomAssignments: {},   // {guestId: 'rowIdx:roomIdx'} — absent/null = unassigned (in pool)
    roomExtras: {},        // {rowKey: {dietary, packedLunch}} — per-room special requirements
    accomHistory: [],      // undo stack — each entry is a snapshot of lodge-row config
    accomFuture:  [],      // redo stack
    roomOverrides: {},     // {roomKey: {overridden:bool, reason:string, timestamp:string}} — soft-warning overrides
    overrideLog:  [],      // audit log [{roomKey, reason, timestamp, guestIds}]
    accommodation: {
      base_cost: 0,
      adjustment: { type: null, value: 0, reason: '' },
      final_cost: 0,
      adjustmentLog: [],      // audit trail [{type, value, reason, user, timestamp, prevFinal, newFinal}]
      adjustmentHistory: [],  // undo stack for adjustments
      adjustmentFuture:  [],  // redo stack for adjustments
    },
  };

  /* ============================================================
     PERMIT PRICING TABLE — UWA Conservation Tariff 2024-2026
     Source: https://ugandawildlife.org/wp-content/uploads/2024/03/UWA-Conservation-Tariff-July-2024-June-2026.pdf
     From July 2026: https://marvelgorilla.com/uganda-gorilla-trekking-permit-price-changes-2026/
     ============================================================ */
  const PERMIT_PRICES = {
    gorilla_tracking_uganda: {
      label: 'Gorilla Tracking (Uganda)',
      FNR: { usd: 800 }, FR: { usd: 700 }, ROA: { usd: 500 },
      EAC: { ugx: 300000 }, Ugandan: { ugx: 300000 },
      low_season: { FNR: { usd: 600 }, FR: { usd: 500 } },
      unit: 'permit'
    },
    gorilla_habituation_uganda: {
      label: 'Gorilla Habituation (Uganda)',
      FNR: { usd: 1500 }, FR: { usd: 1000 }, ROA: { usd: 800 },
      EAC: { ugx: 500000 }, Ugandan: { ugx: 500000 },
      // From July 2026: FNR $1,800
      post_july_2026: { FNR: { usd: 1800 }, FR: { usd: 1200 } },
      unit: 'permit'
    },
    gorilla_tracking_rwanda: {
      label: 'Gorilla Tracking (Rwanda)',
      FNR: { usd: 1500 }, FR: { usd: 500 }, ROA: { usd: 500 },
      EAC: { usd: 200 }, Ugandan: { usd: 200 },
      low_season: { FNR: { usd: 1050 } }, // RDB 30% discount Nov-May
      unit: 'permit'
    },
    chimp_tracking: {
      label: 'Chimp Tracking',
      FNR: { usd: 250 }, FR: { usd: 200 }, ROA: { usd: 200 },
      EAC: { ugx: 180000 }, Ugandan: { ugx: 180000 },
      low_season: { FNR: { usd: 200 }, FR: { usd: 150 } },
      // From July 2026: FNR $300
      post_july_2026: { FNR: { usd: 300 }, FR: { usd: 250 } },
      unit: 'permit'
    },
    chimp_habituation: {
      label: 'Chimp Habituation',
      FNR: { usd: 400 }, FR: { usd: 350 }, ROA: { usd: 350 },
      EAC: { ugx: 250000 }, Ugandan: { ugx: 250000 },
      unit: 'permit'
    },
    golden_monkey: {
      label: 'Golden Monkey',
      FNR: { usd: 100 }, FR: { usd: 90 }, ROA: { usd: 80 },
      EAC: { ugx: 50000 }, Ugandan: { ugx: 50000 },
      unit: 'permit'
    },
    park_entry_a_plus: {
      label: 'Park Entry A+ (Murchison Falls)',
      FNR: { usd: 45 }, FR: { usd: 35 }, ROA: { usd: 30 },
      EAC: { ugx: 25000 }, Ugandan: { ugx: 25000 },
      unit: 'day'
    },
    park_entry_a: {
      label: 'Park Entry A (QENP, Kibale, Bwindi, Kidepo, L. Mburo)',
      FNR: { usd: 40 }, FR: { usd: 30 }, ROA: { usd: 25 },
      EAC: { ugx: 20000 }, Ugandan: { ugx: 20000 },
      unit: 'day'
    },
    park_entry_b: {
      label: 'Park Entry B (Semuliki, Rwenzori, Mt Elgon)',
      FNR: { usd: 35 }, FR: { usd: 25 }, ROA: { usd: 20 },
      EAC: { ugx: 15000 }, Ugandan: { ugx: 15000 },
      unit: 'day'
    },
    vehicle_entry: {
      // Uganda-registered tour 4WD: UGX 30,000/day — same for all guest tiers (UWA tariff 2024-2026)
      label: 'Vehicle Entry \u2014 4WD/Tour (Standard Parks)',
      FNR: { ugx: 30000 }, FR: { ugx: 30000 }, ROA: { ugx: 30000 },
      EAC: { ugx: 30000 }, Ugandan: { ugx: 30000 },
      unit: 'day',
      per_vehicle: true
    },
    vehicle_entry_murchison: {
      // UGX 30,000 standard + UGX 10,000 MFNP surcharge = UGX 40,000/day (UWA tariff 2024-2026)
      label: 'Vehicle Entry \u2014 4WD/Tour (Murchison Falls)',
      FNR: { ugx: 40000 }, FR: { ugx: 40000 }, ROA: { ugx: 40000 },
      EAC: { ugx: 40000 }, Ugandan: { ugx: 40000 },
      unit: 'day',
      per_vehicle: true
    }
  };

  // UWA low-season months: April (4), May (5), November (11)
  const LOW_SEASON_MONTHS = [4, 5, 11];

  /**
   * Get permit price for a given permit type, nationality tier, and travel date.
   * Returns { usd: number } or { ugx: number } depending on tier.
   */
  function getPermitPrice(permitKey, tier, travelStartDate) {
    const permit = PERMIT_PRICES[permitKey];
    if (!permit) return null;
    const tierKey = tier || 'FNR';

    // Check date-aware pricing (July 2026+ increases)
    if (travelStartDate && permit.post_july_2026) {
      const d = new Date(travelStartDate);
      if (d >= new Date('2026-07-01') && permit.post_july_2026[tierKey]) {
        return permit.post_july_2026[tierKey];
      }
    }

    // Check low-season discounts
    if (travelStartDate && permit.low_season) {
      const month = new Date(travelStartDate).getMonth() + 1;
      if (LOW_SEASON_MONTHS.includes(month) && permit.low_season[tierKey]) {
        return permit.low_season[tierKey];
      }
    }

    return permit[tierKey] || permit.FNR;
  }

  /**
   * Update all permit labels based on selected nationality tier and travel date.
   */
  function updatePermitLabels() {
    const tierSel = document.getElementById('pricingNationality');
    const dateSel = document.getElementById('pricingTravelStartDate');
    if (!tierSel) return;
    const tier = tierSel.value;
    const travelDate = dateSel ? dateSel.value : null;

    document.querySelectorAll('#permitsSection .permit-toggle-label[data-permit]').forEach(span => {
      const permitKey = span.dataset.permit;
      const permit = PERMIT_PRICES[permitKey];
      if (!permit) return;
      const price = getPermitPrice(permitKey, tier, travelDate);
      const unit = permit.unit === 'day' ? '/day' : '';
      let priceStr;
      if (price.ugx) {
        priceStr = `UGX ${Number(price.ugx).toLocaleString('en-US')}${unit}`;
      } else {
        priceStr = `$${price.usd}${unit}`;
      }

      // Check if low-season or post-July-2026 rate applies
      let badge = '';
      if (travelDate) {
        const month = new Date(travelDate).getMonth() + 1;
        const d = new Date(travelDate);
        if (permit.post_july_2026 && d >= new Date('2026-07-01') && permit.post_july_2026[tier]) {
          badge = ' <span style="color:var(--color-warning);font-size:var(--text-xs)">(Jul 2026+ rate)</span>';
        } else if (permit.low_season && LOW_SEASON_MONTHS.includes(month) && permit.low_season[tier]) {
          badge = ' <span style="color:var(--success);font-size:var(--text-xs)">(low season)</span>';
        }
      }

      span.innerHTML = `${escapeHtml(permit.label)} \u2014 ${priceStr}${badge}`;
    });
  }

  /* ============================================================
     UTILS
     ============================================================ */
  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d)) return dateStr;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return dateStr; }
  }

  function fmtMoney(amount, currency = 'USD') {
    if (amount == null || isNaN(amount)) return '—';
    if (currency === 'UGX') return `UGX ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function fmtNum(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-US');
  }

  // MINOR-21: slugify() removed — was dead code

  function safeJSON(str, fallback = []) {
    if (!str) return fallback;
    if (Array.isArray(str)) return str;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch (_) {
      // Handle comma-separated strings gracefully
      if (typeof str === 'string' && str.includes(',')) {
        return str.split(',').map(s => s.trim()).filter(Boolean);
      }
      return fallback;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function capitalise(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
  }

  /* ============================================================
     API HELPERS
     ============================================================ */
  // MAJOR-24: In-memory cache for read-only offline fallback
  const _memCache = {};

  function cacheSet(key, data) {
    _memCache[key] = data;
  }
  function cacheGet(key) {
    return _memCache[key] || null;
  }

  // Disconnect banner management
  let _disconnected = false;
  function showDisconnectBanner(show) {
    let banner = document.getElementById('disconnectBanner');
    if (show && !banner) {
      banner = document.createElement('div');
      banner.id = 'disconnectBanner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:1100;background:var(--danger);color:#fff;text-align:center;padding:8px 16px;font-size:var(--text-sm);font-weight:600;';
      banner.innerHTML = '\u26a0 Backend Disconnected \u2014 showing cached data. Some features unavailable. <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;margin-left:12px;text-decoration:underline;font-size:inherit">Dismiss</button>';
      document.body.prepend(banner);
      _disconnected = true;
    } else if (!show && banner) {
      banner.remove();
      _disconnected = false;
    }
  }

  async function apiFetch(path, options = {}) {
    const url = `${API}${path}`;
    const defaults = { headers: { 'Content-Type': 'application/json' } };
    const merged = { ...defaults, ...options };
    const isGet = !merged.method || merged.method === 'GET';
    if (merged.body && typeof merged.body === 'object') {
      merged.body = JSON.stringify(merged.body);
    }
    let res;
    try {
      res = await fetch(url, merged);
    } catch (networkErr) {
      // MAJOR-24: Fall back to cache for GET requests
      if (isGet) {
        const cached = cacheGet(path);
        if (cached) {
          showDisconnectBanner(true);
          return cached;
        }
      }
      showDisconnectBanner(true);
      throw new Error('Network error \u2014 please check your connection and try again');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let msg = data.message || `HTTP ${res.status}`;
      if (data.detail) {
        msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
      throw new Error(msg);
    }
    // Cache successful GET responses
    if (isGet) {
      cacheSet(path, data);
      showDisconnectBanner(false);
    }
    return data;
  }

  /* ============================================================
     TOAST SYSTEM
     ============================================================ */
  function toast(type, title, message = '', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const icons = {
      success: `<svg class="toast-icon" style="color:var(--success)" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      error:   `<svg class="toast-icon" style="color:var(--danger)" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      warning: `<svg class="toast-icon" style="color:var(--warning)" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3L18 17H2L10 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 9v4M10 15h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      info:    `<svg class="toast-icon" style="color:var(--info)" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5M10 7h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
    };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      ${icons[type] || icons.info}
      <div class="toast-body">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;
    el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
    container.appendChild(el);
    if (duration > 0) setTimeout(() => removeToast(el), duration);
    return el;
  }

  function removeToast(el) {
    if (el._removing) return;
    el._removing = true;
    el.classList.add('removing');
    // Primary: remove immediately when CSS transition ends
    const cleanup = () => { if (el.parentNode) el.remove(); };
    el.addEventListener('transitionend', cleanup, { once: true });
    // Fallback: guarantee DOM removal even if transitionend doesn't fire
    // (e.g. element scrolled offscreen, tab backgrounded, or transition skipped)
    setTimeout(cleanup, 300);
  }

  /* ============================================================
     SLIDE-OVER
     ============================================================ */
  function openSlideover(title, subtitle, bodyHtml, footerHtml = '') {
    document.getElementById('slideoverTitle').textContent = title;
    document.getElementById('slideoverSubtitle').textContent = subtitle || '';
    document.getElementById('slideoverBody').innerHTML = bodyHtml;
    document.getElementById('slideoverFooter').innerHTML = footerHtml;
    document.getElementById('slideoverOverlay').classList.add('open');
    document.getElementById('slideover').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSlideover() {
    document.getElementById('slideoverOverlay').classList.remove('open');
    document.getElementById('slideover').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  const VIEW_TITLES = {
    enquiry:    'New Enquiry',
    pipeline:   'Pipeline Board',
    curation:   'Itinerary Matching',
    pricing:    'Pricing Calculator',
    quotations: 'Quotations',
    invoices:   'Invoices & Vouchers',
    reports:    'Reports & Analytics',
    sync:       'Sheets Sync',
    tasks:      'Tasks',
    manifests:  'Manifests',
    fleet:      'Fleet',
  };

  function updateBottomNavActive(viewId) {
    const primaryViews = ['pipeline', 'enquiry', 'pricing', 'clients'];
    document.querySelectorAll('#bottomNav .bottom-nav-item[data-view]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.view === viewId));
    const moreBtn = document.getElementById('bnMore');
    if (moreBtn) moreBtn.classList.toggle('active', !primaryViews.includes(viewId));
    document.querySelectorAll('.bottom-nav-more-item[data-view]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.view === viewId));
  }

  function navigate(viewId) {
    // Clear sync auto-refresh when leaving that view
    if (state.syncInterval && viewId !== 'sync') {
      clearInterval(state.syncInterval);
      state.syncInterval = null;
    }

    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    // Deactivate nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show target view
    const viewEl = document.getElementById(`view-${viewId}`);
    if (viewEl) viewEl.classList.add('active');

    // Activate nav item
    const navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (navItem) navItem.classList.add('active');

    // Update title
    document.getElementById('pageTitle').textContent = VIEW_TITLES[viewId] || viewId;

    // Update bottom nav active state
    updateBottomNavActive(viewId);

    state.currentView = viewId;

    // Lazy load data
    if (viewId === 'pipeline') loadPipeline();
    if (viewId === 'curation') loadCurationEnquiries();
    if (viewId === 'pricing') loadPricingItineraries(); // handles curation pre-select internally after data loads
    if (viewId === 'tools') initToolsView();
    if (viewId === 'quotations') loadQuotations();
    if (viewId === 'invoices') loadInvoicesView();
    if (viewId === 'reports') loadReportsView();
    if (viewId === 'sync') renderSyncView();
    if (viewId === 'lodges') { loadLodgesView(); }
    // Phase 3 views
    if (viewId === 'tasks') loadTasksView();
    if (viewId === 'manifests') initManifestsView();
    if (viewId === 'fleet') initFleetView();
  }

  // Expose for inline onclick use
  window.TRVE = {
    navigate, loadPipeline, loadReportsView, saveFxRateAtQuote, addActivityCost, addVehicleItem,
    _updateGuestName, _updateLodgeRowDates, _toggleGuestRoom, _syncLodgeGuestAssignments,
    _renderGuestAssignmentUI: () => _renderGuestAssignmentUI?.(),
    _syncGuestPool: () => _syncGuestPool?.(),
  };

  /* ============================================================
     SIDEBAR TOGGLE
     ============================================================ */
  function initSidebar() {
    const layout = document.getElementById('appLayout');
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');
    const hamburger = document.getElementById('hamburgerBtn');
    const overlay = document.getElementById('mobileOverlay');

    toggle.addEventListener('click', () => {
      layout.classList.toggle('sidebar-collapsed');
    });

    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });

    // Coordinator selector
    const coordSel = document.getElementById('coordinatorSelector');
    coordSel.addEventListener('change', () => {
      state.coordinator = coordSel.value;
    });

    // Nav item click
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        navigate(item.dataset.view);
        // Close mobile sidebar
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });
    });

    // Quotations link inside pricing
    document.querySelectorAll('[data-view]').forEach(el => {
      if (!el.classList.contains('nav-item')) {
        el.addEventListener('click', () => navigate(el.dataset.view));
      }
    });

    // Slide-over close
    document.getElementById('slideoverClose').addEventListener('click', closeSlideover);
    document.getElementById('slideoverOverlay').addEventListener('click', closeSlideover);

        // === SIDEBAR ENHANCEMENTS ===
    // Add tooltips for collapsed sidebar
    const tooltipMap = {
      'enquiry': 'New Enquiry',
      'pipeline': 'Pipeline Board',
      'curation': 'Itinerary Matching',
      'pricing': 'Pricing Calculator',
      'quotations': 'Quotations',
      'sync': 'Google Sheets Sync'
    };
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      const view = item.dataset.view;
      if (tooltipMap[view]) {
        item.setAttribute('data-tooltip', tooltipMap[view]);
      }
    });

    // Add keyboard shortcut hints to nav labels
    const shortcutMap = {
      'enquiry': '1',
      'pipeline': '2',
      'curation': '3',
      'pricing': '4',
      'quotations': '5',
      'sync': '6',
      'reports': '7'
    };
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      const view = item.dataset.view;
      if (shortcutMap[view]) {
        const hint = document.createElement('span');
        hint.className = 'nav-shortcut';
        hint.textContent = shortcutMap[view];
        hint.title = `Keyboard shortcut: press ${shortcutMap[view]}`;
        hint.setAttribute('aria-label', `Keyboard shortcut: press ${shortcutMap[view]}`);
        item.appendChild(hint);
      }
    });

    // Keyboard navigation (1-7 keys when not in input)
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      const keyMap = { '1': 'enquiry', '2': 'pipeline', '3': 'curation', '4': 'pricing', '5': 'quotations', '6': 'sync', '7': 'reports' };
      if (keyMap[e.key]) {
        e.preventDefault();
        navigate(keyMap[e.key]);
      }
    });

    // Add pipeline badge (updated dynamically)
    function updateSidebarBadges() {
      const pipelineItem = document.querySelector('.nav-item[data-view="pipeline"]');
      if (!pipelineItem) return;
      let badge = pipelineItem.querySelector('.nav-badge');
      const count = state.enquiries ? state.enquiries.filter(e => e.status === 'New_Inquiry').length : 0;
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-badge';
          pipelineItem.appendChild(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    }
    // Expose for use after data loads
    window.TRVE.updateSidebarBadges = updateSidebarBadges;

    // Start sidebar expanded by default on desktop
    if (window.innerWidth >= 1024) {
      layout.classList.remove('sidebar-collapsed');
    }

    // Bottom nav (mobile)
    function initBottomNav() {
      const morePanel = document.getElementById('bottomNavMorePanel');
      const moreBtn   = document.getElementById('bnMore');
      if (!morePanel || !moreBtn) return;

      document.querySelectorAll('#bottomNav .bottom-nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
          navigate(btn.dataset.view);
          sidebar.classList.remove('mobile-open');
          overlay.classList.remove('active');
          morePanel.classList.remove('open');
        });
      });

      moreBtn.addEventListener('click', e => {
        e.stopPropagation();
        morePanel.classList.toggle('open');
      });

      morePanel.querySelectorAll('.bottom-nav-more-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
          navigate(btn.dataset.view);
          sidebar.classList.remove('mobile-open');
          overlay.classList.remove('active');
          morePanel.classList.remove('open');
        });
      });

      document.addEventListener('click', e => {
        if (!morePanel.contains(e.target) && e.target !== moreBtn)
          morePanel.classList.remove('open');
      });
    }
    initBottomNav();
  }

  /* ============================================================
     HEALTH CHECK
     ============================================================ */
  async function checkHealth() {
    const dot = document.getElementById('healthDot');
    const status = document.getElementById('healthStatus');
    try {
      const data = await apiFetch('/api/health');
      dot.style.background = 'var(--success)';
      dot.style.animation = '';
      status.textContent = `v${data.version} \u00b7 ${data.enquiries_count} enquiries`;
      showDisconnectBanner(false);
    } catch (err) {
      dot.style.background = 'var(--danger)';
      dot.style.animation = 'none';
      status.textContent = 'Reconnecting\u2026';
    }
  }

  /* ============================================================
     INTERESTS CHECKBOXES (reusable)
     ============================================================ */
  function renderInterestCheckboxes(containerId, namePrefix = 'interest') {
    const container = document.getElementById(containerId);
    if (!container) return;
    // MINOR-35: Use <span> instead of nested <label> for valid HTML
    container.innerHTML = INTERESTS.map(i => `
      <label class="checkbox-item">
        <input type="checkbox" name="${namePrefix}_${i}" value="${i}">
        <span>${INTEREST_LABELS[i] || capitalise(i)}</span>
      </label>
    `).join('');
  }

  /* ============================================================
     VIEW: NEW ENQUIRY FORM
     ============================================================ */
  /* MINOR-15: Destination tag-input component */
  const _destTags = [];
  function initDestinationTagInput() {
    const wrap = document.getElementById('destinationsTagWrap');
    const input = document.getElementById('destinationsInput');
    const tagsContainer = document.getElementById('destinationsTags');
    const hiddenField = document.getElementById('destinationsRequested');
    if (!wrap || !input) return;

    function addTag(text) {
      const val = text.trim();
      if (!val || _destTags.includes(val)) return;
      _destTags.push(val);
      renderTags();
      input.value = '';
    }
    function removeTag(val) {
      const idx = _destTags.indexOf(val);
      if (idx !== -1) _destTags.splice(idx, 1);
      renderTags();
    }
    function renderTags() {
      tagsContainer.innerHTML = _destTags.map(t =>
        `<span class="tag-input-tag">${escapeHtml(t)}<button type="button" data-val="${escapeHtml(t)}" aria-label="Remove ${escapeHtml(t)}">&times;</button></span>`
      ).join('');
      tagsContainer.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => removeTag(btn.dataset.val));
      });
      hiddenField.value = _destTags.join(',');
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(input.value);
      }
      if (e.key === 'Backspace' && !input.value && _destTags.length > 0) {
        removeTag(_destTags[_destTags.length - 1]);
      }
    });
    // Handle datalist selection (fires 'input' event)
    input.addEventListener('input', () => {
      // Check if the value matches a datalist option exactly
      const opts = document.querySelectorAll('#destinationsList option');
      for (const opt of opts) {
        if (opt.value === input.value) {
          addTag(input.value);
          break;
        }
      }
    });
    wrap.addEventListener('click', () => input.focus());
  }
  function clearDestinationTags() {
    _destTags.length = 0;
    const tagsContainer = document.getElementById('destinationsTags');
    const hiddenField = document.getElementById('destinationsRequested');
    if (tagsContainer) tagsContainer.innerHTML = '';
    if (hiddenField) hiddenField.value = '';
  }

  function initEnquiryForm() {
    renderInterestCheckboxes('interestsCheckboxes', 'interest');
    initDestinationTagInput();

    const form = document.getElementById('enquiryForm');
    const channelSel = document.getElementById('channel');
    const agentRow = document.getElementById('agentNameRow');
    const startDate = document.getElementById('travelStartDate');
    const endDate = document.getElementById('travelEndDate');
    const durationField = document.getElementById('durationDays');

    // Show agent name for b2b / hornbill
    channelSel.addEventListener('change', () => {
      const show = ['b2b', 'hornbill'].includes(channelSel.value);
      agentRow.style.display = show ? 'grid' : 'none';
    });

    // Auto-calc duration with validation (MAJOR-11)
    const dateRangeErr = document.getElementById('dateRangeError');
    function calcDuration() {
      if (startDate.value && endDate.value) {
        const s = new Date(startDate.value);
        const e = new Date(endDate.value);
        const diff = Math.round((e - s) / 86400000);
        if (diff <= 0) {
          dateRangeErr.classList.remove('hidden');
          durationField.value = '';
          return;
        }
        dateRangeErr.classList.add('hidden');
        durationField.value = diff;
      }
    }
    startDate.addEventListener('change', () => {
      // Dynamically set min on end date
      if (startDate.value) endDate.min = startDate.value;
      calcDuration();
    });
    endDate.addEventListener('change', calcDuration);

    // Reset
    document.getElementById('enquiryReset').addEventListener('click', () => {
      form.reset();
      agentRow.style.display = 'none';
      durationField.value = '';
      clearDestinationTags(); // MINOR-15
      document.getElementById('enquirySuccessBanner').classList.add('hidden');
      document.getElementById('enquirySuccessBanner').innerHTML = '';
    });

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameEl = document.getElementById('clientName');
      const nameErr = document.getElementById('clientNameError');

      if (!nameEl.value.trim()) {
        nameErr.classList.remove('hidden');
        nameEl.focus();
        return;
      }
      nameErr.classList.add('hidden');

      // Email validation (CRITICAL-09: novalidate bypass fix)
      const emailEl = document.getElementById('clientEmail');
      const emailErr = document.getElementById('clientEmailError');
      const emailVal = emailEl.value.trim();
      if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        emailErr.classList.remove('hidden');
        emailEl.focus();
        return;
      }
      if (emailErr) emailErr.classList.add('hidden');

      // Phone validation (CRITICAL-10: min 7 digits)
      const phoneEl = document.getElementById('clientPhone');
      const phoneErr = document.getElementById('clientPhoneError');
      const phoneVal = phoneEl.value.trim();
      const phoneDigits = phoneVal.replace(/\D/g, '');
      if (phoneVal && phoneDigits.length < 7) {
        phoneErr.classList.remove('hidden');
        phoneEl.focus();
        return;
      }
      if (phoneErr) phoneErr.classList.add('hidden');

      // Date range validation (MAJOR-11)
      const sDate = document.getElementById('travelStartDate').value;
      const eDate = document.getElementById('travelEndDate').value;
      if (sDate && eDate && new Date(eDate) <= new Date(sDate)) {
        const drErr = document.getElementById('dateRangeError');
        if (drErr) drErr.classList.remove('hidden');
        document.getElementById('travelEndDate').focus();
        return;
      }

      // Pax validation (MAJOR-12)
      const paxEl = document.getElementById('pax');
      const paxErr = document.getElementById('paxError');
      const paxVal = parseInt(paxEl.value);
      if (isNaN(paxVal) || paxVal < 1 || paxVal > 50) {
        if (paxErr) paxErr.classList.remove('hidden');
        paxEl.focus();
        return;
      }
      if (paxErr) paxErr.classList.add('hidden');

      const tierEl = document.getElementById('nationalityTier');
      if (!tierEl.value) {
        tierEl.focus();
        toast('warning', 'Nationality tier required',
          'Select the guest nationality tier. UWA permit rates differ by up to 9× across tiers (e.g. gorilla tracking: FNR $800 vs EAC $83).');
        return;
      }

      const submitBtn = document.getElementById('enquirySubmit');
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      // Collect interests
      const interests = [];
      document.querySelectorAll('#interestsCheckboxes input[type="checkbox"]:checked').forEach(cb => {
        interests.push(cb.value);
      });

      // Collect destinations (MINOR-15: from tag-input hidden field)
      const destRaw = document.getElementById('destinationsRequested').value.trim();
      const destinations = destRaw ? destRaw.split(',').map(d => d.trim()).filter(Boolean) : [];

      const payload = {
        client_name: nameEl.value.trim(),
        email: document.getElementById('clientEmail').value.trim() || null,
        phone: document.getElementById('clientPhone').value.trim() || null,
        country: document.getElementById('clientCountry').value.trim() || null,
        nationality_tier: document.getElementById('nationalityTier').value,
        channel: document.getElementById('channel').value,
        tour_type: document.getElementById('tourType').value.trim() || null,
        travel_start_date: document.getElementById('travelStartDate').value || null,
        travel_end_date: document.getElementById('travelEndDate').value || null,
        duration_days: durationField.value ? parseInt(durationField.value) : null,
        pax: parseInt(document.getElementById('pax').value) || 1,
        interests: interests,
        destinations_requested: destinations,
        budget_range: document.getElementById('budgetRange').value || null,
        special_requests: document.getElementById('specialRequests').value.trim() || null,
        agent_name: document.getElementById('agentName').value.trim() || null,
        coordinator: state.coordinator,
        inquiry_date: new Date().toISOString()
      };

      try {
        const result = await apiFetch('/api/enquiries', { method: 'POST', body: payload });
        toast('success', 'Enquiry created!', `Booking ref: ${result.booking_ref}`);

        // Show success banner
        showEnquirySuccess(result);

        form.reset();
        agentRow.style.display = 'none';
        durationField.value = '';
        clearDestinationTags(); // MINOR-15

      } catch (err) {
        toast('error', 'Failed to create enquiry', err.message);
      } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
      }
    });
  }

  function showEnquirySuccess(enquiry) {
    const banner = document.getElementById('enquirySuccessBanner');
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div class="success-banner">
        <div class="success-banner-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke="currentColor" stroke-width="1.5"/><path d="M9 14l3.5 3.5L19 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="flex:1">
          <div class="success-banner-label">Enquiry Successfully Submitted</div>
          <div class="success-banner-ref">${escapeHtml(enquiry.booking_ref)}</div>
          <div style="font-size:var(--text-sm); color:var(--text-secondary); margin-top:4px;">
            Client: ${escapeHtml(enquiry.client_name)} &middot; Status: <span class="badge ${STATUS_BADGE_CLASS[enquiry.status] || ''}">${escapeHtml(enquiry.status)}</span>
          </div>
        </div>
        <button class="btn btn-gold" id="bannerRunCuration" data-enquiry-id="${escapeHtml(enquiry.id)}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l1.4 4.2H13l-3.8 2.8 1.4 4.2L7 9.9l-3.6 2.8 1.4-4.2L1 5.7h4.6L7 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          Find Best Itineraries
        </button>
      </div>
    `;
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Hook up curation button
    document.getElementById('bannerRunCuration').addEventListener('click', async (e) => {
      const enquiryId = e.currentTarget.dataset.enquiryId;
      navigate('curation');
      await loadCurationEnquiries();
      // Pre-select the enquiry
      const sel = document.getElementById('curationEnquirySelect');
      sel.value = enquiryId;
      sel.dispatchEvent(new Event('change'));
      // Trigger curation
      await runCurationFromEnquiry(enquiryId);
    });
  }

  /* ============================================================
     VIEW: PIPELINE KANBAN BOARD
     ============================================================ */
  async function loadPipeline() {
    const board = document.getElementById('kanbanBoard');
    board.innerHTML = renderKanbanSkeletons();

    try {
      const data = await apiFetch('/api/enquiries?limit=200');
      state.enquiries = data.items || [];
      renderPipeline();
      renderPipelineStats();
      renderFxExposurePanel();
            if (window.TRVE && window.TRVE.updateSidebarBadges) window.TRVE.updateSidebarBadges();
    } catch (err) {
      board.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Failed to load pipeline</div>
          <div class="empty-text">${escapeHtml(err.message || String(err))}</div>
          <button class="btn btn-primary" onclick="window.TRVE.loadPipeline()">Retry</button>
        </div>
      `;
    }
  }

  function renderKanbanSkeletons() {
    return STATUS_COLUMNS.map(col => `
      <div class="kanban-column">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${STATUS_LABELS[col]}</span>
          <span class="kanban-col-count">—</span>
        </div>
        <div class="kanban-cards">
          ${[1,2].map(() => `<div class="kanban-card"><div class="skeleton skeleton-text" style="width:70%; margin-bottom:6px"></div><div class="skeleton skeleton-text" style="width:50%"></div></div>`).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderPipelineStats() {
    const enquiries = state.enquiries;
    const total = enquiries.length;
    const active = enquiries.filter(e => e.status === 'Active_Quote').length;
    const confirmed = enquiries.filter(e => e.status === 'Confirmed').length;
    const completed = enquiries.filter(e => e.status === 'Completed').length;

    // Also compute conversion rate
    const conversionPct = total > 0 ? ((confirmed + completed) / total * 100).toFixed(1) : '0.0';

    const statsRow = document.getElementById('pipelineStats');
    statsRow.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Enquiries</div>
        <div class="stat-value">${total}</div>
        <div class="stat-sub">All time (unfiltered)</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Quotes</div>
        <div class="stat-value">${active}</div>
        <div class="stat-sub">In progress</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Confirmed</div>
        <div class="stat-value">${confirmed}</div>
        <div class="stat-sub">Booked</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Conversion</div>
        <div class="stat-value">${conversionPct}%</div>
        <div class="stat-sub">Confirmed + Completed</div>
      </div>
    `;
  }

  // ── FX Exposure Panel — shows USD bookings with locked rate vs live rate ──
  function renderFxExposurePanel() {
    const panel = document.getElementById('fxExposurePanel');
    if (!panel) return;

    // Only bookings in Confirmed/In_Progress stage with quoted_usd AND fx_rate_at_quote set
    const exposed = state.enquiries.filter(e =>
      (e.status === 'Confirmed' || e.status === 'In_Progress') &&
      e.quoted_usd && parseFloat(e.quoted_usd) > 0 &&
      e.fx_rate_at_quote && parseFloat(e.fx_rate_at_quote) > 0
    );

    if (exposed.length === 0) {
      panel.innerHTML = '';
      return;
    }

    const liveFx = state.liveFx;
    let totalAtLocked = 0, totalAtLive = 0;

    const rows = exposed.map(e => {
      const q       = parseFloat(e.quoted_usd);
      const locked  = parseFloat(e.fx_rate_at_quote);
      const atLocked = Math.round(q * locked);
      const atLive   = Math.round(q * liveFx);
      const delta    = atLive - atLocked;
      const pct      = ((delta / atLocked) * 100).toFixed(1);
      const pos      = delta >= 0;
      totalAtLocked += atLocked;
      totalAtLive   += atLive;
      return `
        <div style="display:grid;grid-template-columns:120px 1fr 80px 90px 100px 120px 120px 130px;
                    align-items:center;padding:7px 16px;border-top:1px solid var(--border-subtle);
                    font-size:12px;font-family:'Courier New',monospace">
          <div style="color:var(--text-muted)">${escapeHtml(e.booking_ref || '—')}</div>
          <div style="color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.client_name || '—')}</div>
          <div style="text-align:right;color:var(--text-muted)">${e.travel_start_date ? e.travel_start_date.slice(0,7) : '—'}</div>
          <div style="text-align:right;color:var(--teal-400)">$${parseFloat(e.quoted_usd).toLocaleString()}</div>
          <div style="text-align:right">
            <div style="color:var(--teal-600)">${locked.toLocaleString()}</div>
            <div style="font-size:10px;color:var(--text-muted)">live: ${liveFx.toLocaleString()}</div>
          </div>
          <div style="text-align:right;color:var(--text-muted)">${atLocked.toLocaleString()}</div>
          <div style="text-align:right;color:var(--text-primary)">${atLive.toLocaleString()}</div>
          <div style="text-align:right">
            <div style="font-weight:600;color:${pos ? 'var(--success)' : 'var(--danger)'}">${pos ? '+' : ''}${delta.toLocaleString()}</div>
            <div style="font-size:10px;color:${pos ? 'var(--success)' : 'var(--danger)'}">${pos ? '▲ +' : '▼ '}${pct}%</div>
          </div>
        </div>`;
    }).join('');

    const totalDelta = totalAtLive - totalAtLocked;
    const totalPos   = totalDelta >= 0;

    panel.innerHTML = `
      <div style="margin:12px 0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface)">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:10px;font-family:'Courier New',monospace;letter-spacing:2px;
                         color:var(--teal-500);font-weight:600">⟳ FX EXPOSURE</span>
            <span style="font-size:11px;color:var(--text-muted)">${exposed.length} confirmed booking${exposed.length > 1 ? 's' : ''} with locked FX rate</span>
          </div>
          <div style="display:flex;gap:24px;align-items:center">
            ${[
              ['BOOKED @ LOCKED FX', totalAtLocked.toLocaleString() + ' UGX', 'var(--text-muted)'],
              ['VALUE @ LIVE FX',    totalAtLive.toLocaleString()   + ' UGX', 'var(--text-primary)'],
              ['NET FX IMPACT',      (totalPos ? '+' : '') + totalDelta.toLocaleString() + ' UGX',
                                     totalPos ? 'var(--success)' : 'var(--danger)']
            ].map(([label, val, col]) => `
              <div style="text-align:right">
                <div style="font-size:9px;font-family:'Courier New',monospace;letter-spacing:1.2px;
                            color:var(--text-muted);margin-bottom:2px">${label}</div>
                <div style="font-size:13px;font-family:'Courier New',monospace;
                            font-weight:700;color:${col}">${val}</div>
              </div>`).join('')}
          </div>
        </div>
        <!-- Column headers -->
        <div style="display:grid;grid-template-columns:120px 1fr 80px 90px 100px 120px 120px 130px;
                    padding:5px 16px;background:var(--surface-alt,var(--surface))">
          ${['REF','CLIENT','TRAVEL','QUOTED','BOOKED FX','@ LOCKED','@ LIVE','GAIN / LOSS'].map((h,i) =>
            `<div style="font-size:9px;font-family:'Courier New',monospace;letter-spacing:1.2px;
                         color:var(--text-muted);text-align:${i<2?'left':'right'}">${h}</div>`
          ).join('')}
        </div>
        <!-- Rows -->
        ${rows}
      </div>`;
  }

  function getFilteredEnquiries() {
    const search = document.getElementById('pipelineSearch').value.toLowerCase().trim();
    const statusFilter = document.querySelector('.filter-pills .pill.active')?.dataset.status || 'all';
    const sortBy = document.getElementById('pipelineSort').value;

    let items = [...state.enquiries];

    if (statusFilter !== 'all') {
      items = items.filter(e => e.status === statusFilter);
    }

    if (search) {
      items = items.filter(e =>
        (e.client_name || '').toLowerCase().includes(search) ||
        (e.booking_ref || '').toLowerCase().includes(search)
      );
    }

    items.sort((a, b) => {
      if (sortBy === 'client_name') return (a.client_name || '').localeCompare(b.client_name || '');
      if (sortBy === 'travel_start_date') return (a.travel_start_date || '') > (b.travel_start_date || '') ? 1 : -1;
      // Default: inquiry_date descending
      return (b.inquiry_date || '') > (a.inquiry_date || '') ? 1 : -1;
    });

    return items;
  }

  function renderPipeline() {
    const board = document.getElementById('kanbanBoard');
    const filtered = getFilteredEnquiries();
    const grouped = {};
    STATUS_COLUMNS.forEach(col => grouped[col] = []);
    filtered.forEach(e => {
      const col = STATUS_COLUMNS.includes(e.status) ? e.status : 'Unconfirmed';
      grouped[col].push(e);
    });

    board.innerHTML = STATUS_COLUMNS.map(col => {
      const cards = grouped[col];
      const cardsHtml = cards.length === 0
        ? `<div style="padding:var(--space-3); text-align:center; font-size:var(--text-xs); color:var(--text-muted)">No enquiries</div>`
        : cards.map(e => renderKanbanCard(e)).join('');

      return `
        <div class="kanban-column">
          <div class="kanban-col-header">
            <span class="kanban-col-title">${STATUS_LABELS[col]}</span>
            <span class="kanban-col-count">${cards.length}</span>
          </div>
          <div class="kanban-cards">${cardsHtml}</div>
        </div>
      `;
    }).join('');

    // Mobile: collapsible kanban columns (tap header to expand/collapse)
    if (window.innerWidth <= 600) {
      board.querySelectorAll('.kanban-column').forEach(col => {
        const header = col.querySelector('.kanban-col-header');
        if (!header) return;
        const title = header.querySelector('.kanban-col-title')?.textContent || '';
        if (!['New Inquiry', 'Active Quote'].some(p => title.includes(p)))
          col.classList.add('collapsed');
        header.addEventListener('click', () => col.classList.toggle('collapsed'));
      });
    }

    // Attach click + keyboard handlers (MINOR-22: null guard, MINOR-23: keyboard nav)
    board.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click', () => {
        const eid = card.dataset.enquiryId;
        if (!eid) { toast('error', 'Missing enquiry ID', 'This card has no linked enquiry data.'); return; }
        openEnquiryDetail(eid);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
    });
  }

  function renderKanbanCard(e) {
    const channelClass = CHANNEL_BADGE_CLASS[e.channel?.toLowerCase()] || 'badge-ch-direct';
    const startDate = e.travel_start_date ? fmtDate(e.travel_start_date) : null;

    // Payment progress bar for confirmed/in-progress cards
    const showPayBar = ['Confirmed', 'In_Progress', 'Completed'].includes(e.status);
    const quoted = parseFloat(e.quoted_usd) || 0;
    const received = parseFloat(e.revenue_usd) || 0;
    const payPct = quoted > 0 ? Math.min(100, Math.round((received / quoted) * 100)) : 0;
    const payBarColor = received >= quoted - 0.01 && quoted > 0 ? 'var(--success)' : received > 0 ? 'var(--brand-gold)' : 'var(--danger)';

    // Phase 2 indicators
    const isReturning = e.client_id && parseInt(e.client_booking_count || 0) > 1;
    const guestComplete = e.guest_info_complete === 1 || e.guest_info_complete === true;
    const isConfirmedForGuest = ['Confirmed','In_Progress','Completed'].includes(e.status);

    return `
      <div class="kanban-card" data-enquiry-id="${escapeHtml(e.id)}" role="button" tabindex="0">
        <div class="kanban-card-ref">${escapeHtml(e.booking_ref || '—')}</div>
        <div class="kanban-card-name">${escapeHtml(e.client_name || 'Unknown')}</div>
        <div class="kanban-card-meta">
          <span class="badge ${channelClass}">${escapeHtml(e.channel || 'direct')}</span>
          ${e.coordinator ? `<span class="badge badge-teal">${escapeHtml(e.coordinator)}</span>` : ''}
          ${isReturning ? `<span class="badge badge-returning" title="Returning client">&#9733; Returning</span>` : ''}
        </div>
        ${isConfirmedForGuest ? `<div style="display:flex;align-items:center;gap:4px;margin-top:4px">
          <span class="guest-info-dot ${guestComplete ? 'complete' : 'missing'}"
                title="${guestComplete ? 'Guest info submitted' : 'Guest info not yet submitted'}">
          </span>
          <span style="font-size:9px;color:${guestComplete ? 'var(--success)' : 'var(--danger)'}">
            ${guestComplete ? 'Guests ✓' : 'Guests needed'}
          </span>
        </div>` : ''}
        ${showPayBar && quoted > 0 ? `
        <div class="kanban-pay-bar" title="${payPct}% paid — ${fmtMoney(received)} of ${fmtMoney(quoted)}">
          <div class="kanban-pay-bar-fill" style="width:${payPct}%;background:${payBarColor}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-top:2px;padding:0 1px">
          <span>${payPct}% paid</span>
          <span class="mono">${fmtMoney(received)}</span>
        </div>` : ''}
        <div class="kanban-card-footer">
          <span class="kanban-card-pax">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="4" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M1 10c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="9.5" cy="3.5" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M9 8.5c0-1 .5-2 1.5-2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            ${e.pax || 1} pax
          </span>
          <span class="kanban-card-date">${startDate || '—'}</span>
        </div>
      </div>
    `;
  }

  function initPipelineControls() {
    document.getElementById('pipelineSearch').addEventListener('input', () => renderPipeline());
    document.getElementById('pipelineSort').addEventListener('change', () => renderPipeline());

    document.getElementById('pipelineFilters').addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderPipeline();
    });

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        const url = `${API}/api/enquiries/export.csv`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `TRVE_Pipeline_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('info', 'Downloading CSV', 'Pipeline export started');
      });
    }
  }

  /* ============================================================
     ENQUIRY DETAIL SLIDE-OVER
     ============================================================ */
  async function openEnquiryDetail(enquiryId) {
    const enquiry = state.enquiries.find(e => e.id === enquiryId);
    if (!enquiry) return;

    const interests = safeJSON(enquiry.interests, []);
    const destinations = safeJSON(enquiry.destinations_requested, []);

    const bodyHtml = `
      <div class="detail-grid mb-4">
        <div class="detail-field">
          <div class="detail-field-label">Booking Ref</div>
          <div class="detail-field-value mono">${escapeHtml(enquiry.booking_ref || '—')}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Status</div>
          <div class="detail-field-value">
            <select class="form-control" id="detailStatusSelect" style="max-width:200px">
              ${STATUS_COLUMNS.map(s => `<option value="${s}" ${s === enquiry.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Channel</div>
          <div class="detail-field-value"><span class="badge ${CHANNEL_BADGE_CLASS[enquiry.channel?.toLowerCase()] || 'badge-ch-direct'}">${escapeHtml(enquiry.channel || '—')}</span></div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Coordinator</div>
          <div class="detail-field-value">${escapeHtml(enquiry.coordinator || '—')}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="detail-grid mb-4">
        <div class="detail-field">
          <div class="detail-field-label">Email</div>
          <div class="detail-field-value">${escapeHtml(enquiry.email || '—')}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Phone</div>
          <div class="detail-field-value">${escapeHtml(enquiry.phone || '—')}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Country</div>
          <div class="detail-field-value">${escapeHtml(enquiry.country || '—')}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Nationality Tier</div>
          <div class="detail-field-value"><span class="badge badge-gold">${escapeHtml(enquiry.nationality_tier || '—')}</span></div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="detail-grid mb-4">
        <div class="detail-field">
          <div class="detail-field-label">Tour Type</div>
          <div class="detail-field-value">${escapeHtml(enquiry.tour_type || '—')}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Pax</div>
          <div class="detail-field-value mono">${enquiry.pax || '—'}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Travel Start</div>
          <div class="detail-field-value mono">${fmtDate(enquiry.travel_start_date)}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Travel End</div>
          <div class="detail-field-value mono">${fmtDate(enquiry.travel_end_date)}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Duration</div>
          <div class="detail-field-value mono">${enquiry.duration_days ? enquiry.duration_days + ' days' : '—'}</div>
        </div>
        <div class="detail-field">
          <div class="detail-field-label">Budget Range</div>
          <div class="detail-field-value">${enquiry.budget_range ? capitalise(enquiry.budget_range) : '—'}</div>
        </div>
      </div>

      ${interests.length > 0 ? `
      <div class="detail-field mb-4">
        <div class="detail-field-label">Interests</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
          ${interests.map(i => `<span class="badge badge-teal">${escapeHtml(INTEREST_LABELS[i] || i)}</span>`).join('')}
        </div>
      </div>` : ''}

      ${destinations.length > 0 ? `
      <div class="detail-field mb-4">
        <div class="detail-field-label">Destinations</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
          ${destinations.map(d => `<span class="badge badge-gold">${escapeHtml(d)}</span>`).join('')}
        </div>
      </div>` : ''}

      ${enquiry.special_requests ? `
      <div class="detail-field mb-4">
        <div class="detail-field-label">Special Requests</div>
        <div class="detail-field-value" style="white-space:pre-wrap">${escapeHtml(enquiry.special_requests)}</div>
      </div>` : ''}

      <!-- Working Itinerary -->
      <div class="detail-field mb-4" id="workingItinSection">
        <div class="detail-field-label" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px">
          <span>Working Itinerary</span>
          <div style="display:flex;gap:4px;align-items:center">
            <button type="button" class="btn btn-ghost btn-sm" id="btnEditWorkingItin" style="font-size:10px;padding:2px 8px">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btnWIHistory" style="font-size:10px;padding:2px 8px" title="Version history">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style="vertical-align:-1px">
                <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" stroke-width="1.2"/>
                <path d="M5.5 3.2v2.4l1.4 1.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg> History
            </button>
            <button type="button" class="btn btn-gold btn-sm" id="btnWICreateInvoice" style="font-size:10px;padding:2px 8px" title="Create invoice from this booking">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style="vertical-align:-1px">
                <path d="M1 9h9M1 1h9v8H1V1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                <path d="M3.5 4h4M3.5 6.5h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg> Create Invoice
            </button>
          </div>
        </div>
        <div id="workingItinDisplay" style="white-space:pre-wrap;font-size:var(--text-sm);color:var(--text-secondary);margin-top:4px;min-height:24px;line-height:1.6">
          ${enquiry.working_itinerary
            ? escapeHtml(enquiry.working_itinerary)
            : '<span style="color:var(--text-muted);font-style:italic">No working itinerary saved yet. Click Edit to add a day-by-day plan.</span>'}
        </div>
        <div id="workingItinEditor" style="display:none;margin-top:8px">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">Edit the day-by-day plan below. Auto-saves on Save.</div>
          <textarea id="workingItinText" class="form-control" rows="10"
            placeholder="Day 1: Arrive Entebbe. Airport pickup, evening briefing.&#10;Day 2: Transfer to Bwindi. Check in, afternoon nature walk.&#10;Day 3: Gorilla tracking permit. Full day in the forest."
            style="font-size:var(--text-sm);width:100%;resize:vertical;font-family:'Courier New',monospace">${escapeHtml(enquiry.working_itinerary || '')}</textarea>
          <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary btn-sm" id="btnSaveWorkingItin">Save</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btnCancelWorkingItin">Cancel</button>
            <span id="workingItinSaveStatus" style="font-size:10px;color:var(--success);align-self:center"></span>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      ${(enquiry.quoted_usd || enquiry.revenue_usd || enquiry.balance_usd || enquiry.payment_status) ? `
      <div class="detail-financial-summary mb-4">
        <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--teal-700);margin-bottom:var(--space-3)">
          Financial Summary
        </div>
        <div class="detail-grid" style="margin-bottom:0">
          ${enquiry.quoted_usd != null ? `
          <div class="detail-field" style="margin-bottom:0">
            <div class="detail-field-label">Quoted</div>
            <div class="detail-field-value mono">${fmtMoney(enquiry.quoted_usd)}</div>
          </div>` : ''}
          ${enquiry.revenue_usd != null ? `
          <div class="detail-field" style="margin-bottom:0">
            <div class="detail-field-label">Revenue</div>
            <div class="detail-field-value mono">${fmtMoney(enquiry.revenue_usd)}</div>
          </div>` : ''}
          ${enquiry.balance_usd != null ? `
          <div class="detail-field" style="margin-bottom:0">
            <div class="detail-field-label">Balance</div>
            <div class="detail-field-value mono" style="color:${enquiry.balance_usd > 0 ? 'var(--danger)' : 'var(--success)'}">${fmtMoney(enquiry.balance_usd)}</div>
          </div>` : ''}
          ${enquiry.payment_status ? `
          <div class="detail-field" style="margin-bottom:0">
            <div class="detail-field-label">Payment</div>
            <div class="detail-field-value">
              <span class="badge ${enquiry.payment_status === 'paid' ? 'badge-confirmed' : enquiry.payment_status === 'partial' ? 'badge-active' : 'badge-unconfirmed'}">${escapeHtml(enquiry.payment_status)}</span>
            </div>
          </div>` : ''}
          ${enquiry.quoted_usd ? `
          <div class="detail-field" style="margin-bottom:0;grid-column:1/-1">
            <div class="detail-field-label" style="display:flex;align-items:center;gap:6px">
              FX @ Quote
              <span style="font-size:10px;font-weight:400;color:var(--text-muted)">live: ${state.liveFx.toLocaleString()} UGX/$</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <input
                type="number"
                id="fxRateAtQuote_${enquiry.id}"
                value="${enquiry.fx_rate_at_quote || ''}"
                placeholder="${state.liveFx}"
                min="1000" max="10000" step="1"
                style="width:110px;padding:4px 8px;font-family:'Courier New',monospace;font-size:13px;border:1px solid ${enquiry.fx_rate_at_quote ? 'var(--teal-500)' : 'var(--border)'};border-radius:6px;background:var(--surface);color:var(--text-primary)"
                onchange="window.TRVE.saveFxRateAtQuote('${enquiry.id}', this.value)"
              />
              ${enquiry.fx_rate_at_quote && enquiry.quoted_usd ? (() => {
                const q = parseFloat(enquiry.quoted_usd);
                const locked = parseFloat(enquiry.fx_rate_at_quote);
                const live   = state.liveFx;
                if (!q || !locked || !live) return '';
                const atLocked  = Math.round(q * locked);
                const atLive    = Math.round(q * live);
                const delta     = atLive - atLocked;
                const pct       = ((delta / atLocked) * 100).toFixed(1);
                const pos       = delta >= 0;
                return `<span style="font-size:11px;font-family:'Courier New',monospace;color:${pos ? 'var(--success)' : 'var(--danger)'}">
                  ${pos ? '▲' : '▼'} ${pos ? '+' : ''}${delta.toLocaleString()} UGX (${pos ? '+' : ''}${pct}%)
                </span>`;
              })() : ''}
            </div>
          </div>` : ''}
        </div>
      </div>
      <div class="divider"></div>` : ''}

      <!-- Payment Ledger -->
      <div class="detail-financial-summary mb-4" id="paymentLedgerSection">
        <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--teal-700);margin-bottom:var(--space-3);display:flex;align-items:center;justify-content:space-between">
          <span>Payments Received</span>
          <button class="btn btn-gold btn-sm" id="btnAddPayment" style="font-size:10px;padding:3px 8px">+ Record Payment</button>
        </div>
        <div id="paymentLedgerList" style="font-size:var(--text-xs);color:var(--text-muted)">Loading…</div>
        <!-- Add payment form (hidden until button clicked) -->
        <div id="addPaymentForm" style="display:none;margin-top:var(--space-3);background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3)">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--teal-700);margin-bottom:var(--space-2)">New Payment</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-2)">
            <div>
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Amount (USD) *</label>
              <input id="payAmt" type="number" min="0" step="0.01" placeholder="e.g. 5000"
                class="form-control" style="font-family:var(--font-mono);font-size:var(--text-xs);padding:4px 6px">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Date</label>
              <input id="payDate" type="date" class="form-control" style="font-size:var(--text-xs);padding:4px 6px"
                value="${new Date().toISOString().slice(0,10)}">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-2)">
            <div>
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Method</label>
              <select id="payMethod" class="form-control" style="font-size:var(--text-xs);padding:4px 6px">
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
              </select>
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Reference</label>
              <input id="payRef" type="text" placeholder="TXN ref or receipt #"
                class="form-control" style="font-size:var(--text-xs);padding:4px 6px">
            </div>
          </div>
          <div style="margin-bottom:var(--space-2)">
            <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Notes</label>
            <input id="payNotes" type="text" placeholder="Optional notes"
              class="form-control" style="font-size:var(--text-xs);padding:4px 6px">
          </div>
          <div style="display:flex;gap:6px">
            <button id="btnSavePayment" class="btn btn-primary btn-sm" style="font-size:10px">Save Payment</button>
            <button id="btnCancelPayment" class="btn btn-ghost btn-sm" style="font-size:10px">Cancel</button>
          </div>
        </div>
      </div>
      <div class="divider"></div>

      <div class="form-group mb-4">
        <label class="form-label" for="detailNotes">Notes</label>
        <textarea class="form-control" id="detailNotes" rows="3">${escapeHtml(enquiry.notes || '')}</textarea>
      </div>

      ${enquiry.curation_status && enquiry.curation_status !== 'pending' ? `
      <div style="background:var(--teal-50);border:1px solid var(--teal-100);border-radius:var(--radius-lg);padding:var(--space-3);margin-top:var(--space-3)">
        <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--teal-700);margin-bottom:4px">Matching Status</div>
        <div style="font-size:var(--text-sm)">${escapeHtml(enquiry.curation_status)}</div>
        ${enquiry.curated_itinerary_id ? `<div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px">Itinerary: ${escapeHtml(enquiry.curated_itinerary_id)}</div>` : ''}
      </div>` : ''}

      <!-- Phase 2: Shareable Itinerary Panel (confirmed+ only) -->
      ${['Confirmed','In_Progress','Completed'].includes(enquiry.status) ? `
      <div class="divider"></div>
      <div style="margin-bottom:var(--space-4)">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2);display:flex;align-items:center;gap:6px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.5h3v3M11.5 1.5L7 6M5.5 2.5h-3a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Shareable Itinerary Link
        </div>
        <div id="shareLinksPanel" style="font-size:var(--text-xs);color:var(--text-muted)">Loading&hellip;</div>
        <div style="display:flex;gap:6px;margin-top:var(--space-2);flex-wrap:wrap;align-items:center">
          <select id="shareExpirySelect" class="form-control" style="font-size:var(--text-xs);height:30px;padding:0 8px;width:auto">
            <option value="">No expiry</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
          <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-xs);font-weight:600;color:var(--text-muted);cursor:pointer">
            <input type="checkbox" id="shareIncludePricing"> Include pricing
          </label>
          <button class="btn btn-sm btn-primary" id="generateShareBtn"
                  data-enquiry-id="${escapeHtml(enquiry.id)}" data-booking-ref="${escapeHtml(enquiry.booking_ref || '')}">
            Generate Link
          </button>
        </div>
      </div>` : ''}

      <!-- Phase 2: Guest Info Panel -->
      <div class="divider"></div>
      <div style="margin-bottom:var(--space-4)">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2);display:flex;align-items:center;gap:6px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 12c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          Guest Information
        </div>
        <div id="guestInfoPanel" style="font-size:var(--text-xs);color:var(--text-muted)">Loading&hellip;</div>
        <button class="btn btn-sm btn-secondary" id="generateGuestFormBtn" style="margin-top:var(--space-2)"
                data-enquiry-id="${escapeHtml(enquiry.id)}">
          Send Guest Form Link
        </button>
      </div>

      <!-- Phase 3: Driver & Vehicle Assignment -->
      <div class="divider"></div>
      <div style="margin-bottom:var(--space-4)">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2);display:flex;align-items:center;gap:6px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="5" width="11" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 5V3.5a3.5 3.5 0 017 0V5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="4" cy="11" r="1" fill="currentColor"/><circle cx="9" cy="11" r="1" fill="currentColor"/></svg>
          Driver &amp; Vehicle
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:10px">Driver</label>
            <select class="form-control" id="detailDriverSelect" style="font-size:12px;height:34px" data-enquiry-id="${escapeHtml(enquiry.id)}" data-current="${escapeHtml(enquiry.driver_id || '')}">
              <option value="">— Unassigned —</option>
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:10px">Vehicle</label>
            <select class="form-control" id="detailVehicleSelect" style="font-size:12px;height:34px" data-enquiry-id="${escapeHtml(enquiry.id)}" data-current="${escapeHtml(enquiry.vehicle_id || '')}">
              <option value="">— Unassigned —</option>
            </select>
          </div>
        </div>
        <span id="driverVehicleSavedMsg" style="font-size:10px;color:var(--success);display:none">Saved</span>
      </div>

      <!-- Phase 3: Task List -->
      <div class="divider"></div>
      <div style="margin-bottom:var(--space-4)">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2);display:flex;align-items:center;gap:6px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M4 6.5l2 2 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Tasks
        </div>
        <div id="taskListPanel" data-booking-ref="${escapeHtml(enquiry.booking_ref || '')}" style="font-size:var(--text-xs);color:var(--text-muted)">Loading&hellip;</div>
      </div>

      <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--space-4);display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
        <span>Created: ${fmtDate(enquiry.inquiry_date)} &middot; Last updated: ${fmtDate(enquiry.last_updated)}</span>
        ${enquiry.sheets_synced != null ? `
        <span class="badge ${enquiry.sheets_synced ? 'badge-confirmed' : 'badge-unconfirmed'}" style="font-size:var(--text-xs)">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="margin-right:3px">
            ${enquiry.sheets_synced
              ? '<path d="M2 5l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
              : '<path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
            }
          </svg>
          ${enquiry.sheets_synced ? 'Synced' : 'Unsynced'}
        </span>` : ''}
      </div>
    `;

    const isConfirmedOrLater = ['Confirmed', 'In_Progress', 'Completed'].includes(enquiry.status);
    const footerHtml = `
      <button class="btn btn-primary" id="detailSaveBtn" data-enquiry-id="${escapeHtml(enquiry.id)}">Save Changes</button>
      <button class="btn btn-gold" id="detailCurationBtn" data-enquiry-id="${escapeHtml(enquiry.id)}">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l1.4 4.2H13l-3.8 2.8 1.4 4.2L7 9.9l-3.6 2.8 1.4-4.2L1 5.7h4.6L7 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        Find Best Itineraries
      </button>
      ${isConfirmedOrLater ? `
      <button class="btn btn-secondary btn-sm" id="detailInvoiceBtn" data-enquiry-id="${escapeHtml(enquiry.id)}" title="Generate tax invoice">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M7.5 1H2.5A1 1 0 001.5 2v9a1 1 0 001 1h8a1 1 0 001-1V4.5l-3-3.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.5 1v3.5H11M3.5 7h6M3.5 9h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Invoice
      </button>
      <button class="btn btn-secondary btn-sm" id="detailVouchersBtn" data-enquiry-id="${escapeHtml(enquiry.id)}" title="Generate supplier vouchers">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="3" width="11" height="7" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M1 5.5h11M4 3V2M9 3V2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Vouchers
      </button>` : ''}
      <button class="btn btn-secondary btn-sm" id="detailManifestPdfBtn" data-enquiry-id="${escapeHtml(enquiry.id)}" title="Download trip manifest PDF">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M7 1H3a1 1 0 00-1 1v9a1 1 0 001 1h7a1 1 0 001-1V4.5L7 1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 1v3.5H11M4 7h5M4 9h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Manifest
      </button>
      <button class="btn btn-secondary btn-sm" id="detailDriverBriefingBtn" data-enquiry-id="${escapeHtml(enquiry.id)}" title="Download driver briefing PDF">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="4" width="11" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 4V3a4 4 0 016 0v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Driver Brief
      </button>
      <button class="btn btn-ghost" id="detailCancelBtn">Cancel</button>
    `;

    openSlideover(
      enquiry.client_name || 'Enquiry Details',
      enquiry.booking_ref || '',
      bodyHtml,
      footerHtml
    );

    // After rendering, wire up buttons
    document.getElementById('detailCancelBtn').addEventListener('click', closeSlideover);

    // Phase 2: Load share links panel
    if (document.getElementById('shareLinksPanel')) {
      _loadShareLinksPanel(enquiry.booking_ref || enquiry.id);
    }
    // Phase 2: Load guest info panel
    _loadGuestInfoPanel(enquiry.id);

    // Phase 3: Load driver/vehicle dropdowns
    _loadDriverVehicleDropdowns(enquiry);

    // Phase 3: Load task list
    const taskPanel = document.getElementById('taskListPanel');
    if (taskPanel) _loadTaskListPanel(enquiry.booking_ref || enquiry.id);

    // Phase 3: Manifest PDF button
    const manifestPdfBtn = document.getElementById('detailManifestPdfBtn');
    if (manifestPdfBtn) {
      manifestPdfBtn.addEventListener('click', () => {
        const eid = manifestPdfBtn.dataset.enquiryId;
        window.open(`/api/enquiries/${encodeURIComponent(eid)}/manifest/pdf`, '_blank');
      });
    }

    // Phase 3: Driver briefing PDF button
    const driverBriefingBtn = document.getElementById('detailDriverBriefingBtn');
    if (driverBriefingBtn) {
      driverBriefingBtn.addEventListener('click', () => {
        const eid = driverBriefingBtn.dataset.enquiryId;
        window.open(`/api/enquiries/${encodeURIComponent(eid)}/driver-briefing/pdf`, '_blank');
      });
    }

    // Phase 2: Generate share link
    const generateShareBtn = document.getElementById('generateShareBtn');
    if (generateShareBtn) {
      generateShareBtn.addEventListener('click', async () => {
        const bookingRef = generateShareBtn.dataset.bookingRef;
        const expiryDays = parseInt(document.getElementById('shareExpirySelect').value) || null;
        const includePricing = document.getElementById('shareIncludePricing').checked;
        generateShareBtn.disabled = true; generateShareBtn.textContent = 'Generating…';
        try {
          const res = await apiFetch(`/api/share/${bookingRef}`, {
            method: 'POST',
            body: JSON.stringify({ expires_days: expiryDays, include_pricing: includePricing }),
          });
          if (res.url) {
            await _loadShareLinksPanel(bookingRef);
            toast('success', 'Share link created', res.url);
          }
        } catch (e) {
          toast('error', 'Failed to generate link', e.message || '');
        } finally {
          generateShareBtn.disabled = false; generateShareBtn.textContent = 'Generate Link';
        }
      });
    }

    // Phase 2: Generate guest form link
    const guestFormBtn = document.getElementById('generateGuestFormBtn');
    if (guestFormBtn) {
      guestFormBtn.addEventListener('click', async () => {
        const enquiryId = guestFormBtn.dataset.enquiryId;
        guestFormBtn.disabled = true; guestFormBtn.textContent = 'Generating…';
        try {
          const res = await apiFetch(`/api/enquiries/${enquiryId}/guest-form`, { method: 'POST' });
          if (res.token) {
            const url = `${location.origin}/guest-form/${res.token}`;
            await navigator.clipboard.writeText(url).catch(() => {});
            toast('success', 'Guest form link copied!', url, 6000);
            await _loadGuestInfoPanel(enquiryId);
          }
        } catch (e) {
          toast('error', 'Failed to generate guest form', e.message || '');
        } finally {
          guestFormBtn.disabled = false; guestFormBtn.textContent = 'Send Guest Form Link';
        }
      });
    }

    document.getElementById('detailSaveBtn').addEventListener('click', async () => {
      const statusSel = document.getElementById('detailStatusSelect');
      const notesEl = document.getElementById('detailNotes');
      const newStatus = statusSel.value;
      const oldStatus = enquiry.status;

      // MAJOR-17: Confirm destructive status changes
      const destructiveStatuses = ['Cancelled', 'Lost'];
      const pipelineOrder = ['New', 'Active_Quote', 'Follow_Up', 'Confirmed', 'Deposit_Paid', 'Completed', 'Cancelled', 'Lost'];
      const oldIdx = pipelineOrder.indexOf(oldStatus);
      const newIdx = pipelineOrder.indexOf(newStatus);
      const isBackward = oldIdx >= 3 && newIdx < oldIdx; // Moving back from Confirmed+
      const isDestructive = destructiveStatuses.includes(newStatus) && !destructiveStatuses.includes(oldStatus);

      if (isDestructive || isBackward) {
        const msg = isDestructive
          ? `Are you sure you want to change this enquiry from "${oldStatus.replace(/_/g, ' ')}" to "${newStatus}"? This is a destructive change.`
          : `This moves the enquiry backward from "${oldStatus.replace(/_/g, ' ')}" to "${newStatus.replace(/_/g, ' ')}". Are you sure?`;
        if (!confirm(msg)) return;
      }

      // Payment validation before save
      const receivedInput = document.getElementById('detailPaymentReceived');
      const receivedAmt = receivedInput && receivedInput.value !== '' ? parseFloat(receivedInput.value) : null;
      const reqTransfer = enquiry.required_transfer_amount;
      const bankChargesOnInvoice = !!enquiry.include_bank_charges_in_invoice;
      const threshold = bankChargesOnInvoice && reqTransfer ? reqTransfer : (enquiry.quoted_usd || null);

      if (receivedAmt != null && threshold != null && receivedAmt < threshold - 0.01) {
        const shortfall = Math.round((threshold - receivedAmt) * 100) / 100;
        const payWarn = document.getElementById('detailPaymentWarning');
        if (payWarn) {
          payWarn.style.display = 'block';
          payWarn.innerHTML = `⚠ Underpaid — shortfall of <strong class="mono">${fmtMoney(shortfall)}</strong>. Invoice settlement blocked until full amount is received.`;
        }
        const payOk = document.getElementById('detailPaymentOk');
        if (payOk) payOk.style.display = 'none';
        // If moving to Completed, block it
        if (newStatus === 'Completed') {
          toast('warning', 'Payment insufficient', `Received ${fmtMoney(receivedAmt)} but ${fmtMoney(threshold)} is required. Cannot mark as Completed.`);
          return;
        }
      } else if (receivedAmt != null && threshold != null) {
        const payOk = document.getElementById('detailPaymentOk');
        if (payOk) payOk.style.display = 'block';
        const payWarn = document.getElementById('detailPaymentWarning');
        if (payWarn) payWarn.style.display = 'none';
      }

      // Determine payment_status from received amount
      let paymentStatus = enquiry.payment_status;
      if (receivedAmt != null && threshold != null) {
        if (receivedAmt >= threshold - 0.01) paymentStatus = 'paid';
        else if (receivedAmt > 0) paymentStatus = 'partial';
        else paymentStatus = 'unpaid';
      } else if (receivedAmt != null && receivedAmt > 0) {
        paymentStatus = 'partial';
      }

      const btn = document.getElementById('detailSaveBtn');
      btn.classList.add('loading');
      btn.disabled = true;
      const patchBody = { status: newStatus, notes: notesEl.value };
      if (receivedAmt != null) { patchBody.revenue_usd = receivedAmt; }
      if (paymentStatus) { patchBody.payment_status = paymentStatus; }
      try {
        await apiFetch(`/api/enquiries/${enquiry.id}`, {
          method: 'PATCH',
          body: patchBody,
        });
        // Update local state
        const idx = state.enquiries.findIndex(e => e.id === enquiry.id);
        if (idx !== -1) {
          state.enquiries[idx].status = newStatus;
          state.enquiries[idx].notes = notesEl.value;
          if (receivedAmt != null) state.enquiries[idx].revenue_usd = receivedAmt;
          if (paymentStatus) state.enquiries[idx].payment_status = paymentStatus;
        }
        toast('success', 'Enquiry updated');
        renderPipeline();
        closeSlideover();
      } catch (err) {
        toast('error', 'Update failed', err.message);
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });

    // Live payment validation as user types received amount
    const livePayInput = document.getElementById('detailPaymentReceived');
    if (livePayInput) {
      const bcOnInvoice = !!enquiry.include_bank_charges_in_invoice;
      const reqXfer = enquiry.required_transfer_amount;
      const invoiceThreshold = bcOnInvoice && reqXfer ? reqXfer : (enquiry.quoted_usd || null);
      livePayInput.addEventListener('input', () => {
        const amt = livePayInput.value !== '' ? parseFloat(livePayInput.value) : null;
        const warnEl = document.getElementById('detailPaymentWarning');
        const okEl   = document.getElementById('detailPaymentOk');
        if (amt == null || invoiceThreshold == null) { if (warnEl) warnEl.style.display = 'none'; if (okEl) okEl.style.display = 'none'; return; }
        const sf = Math.round((invoiceThreshold - amt) * 100) / 100;
        if (sf > 0.01) {
          if (warnEl) { warnEl.style.display = 'block'; warnEl.innerHTML = `⚠ Underpaid — shortfall of <strong class="mono">${fmtMoney(sf)}</strong>. Invoice settlement blocked until full amount is received.`; }
          if (okEl) okEl.style.display = 'none';
        } else {
          if (warnEl) warnEl.style.display = 'none';
          if (okEl) okEl.style.display = 'block';
        }
      });
    }

    // Working itinerary — Edit / Save / Cancel
    const btnEditWI   = document.getElementById('btnEditWorkingItin');
    const btnSaveWI   = document.getElementById('btnSaveWorkingItin');
    const btnCancelWI = document.getElementById('btnCancelWorkingItin');
    const btnWIHist   = document.getElementById('btnWIHistory');
    const btnWIInv    = document.getElementById('btnWICreateInvoice');

    if (btnEditWI) {
      btnEditWI.addEventListener('click', () => {
        document.getElementById('workingItinEditor').style.display = '';
        document.getElementById('workingItinDisplay').style.display = 'none';
        btnEditWI.style.display = 'none';
      });
    }

    if (btnSaveWI) {
      btnSaveWI.addEventListener('click', async () => {
        const text = document.getElementById('workingItinText').value;
        const statusEl = document.getElementById('workingItinSaveStatus');
        try {
          btnSaveWI.disabled = true;
          btnSaveWI.textContent = 'Saving…';
          await apiFetch(`/api/enquiries/${enquiry.id}`, { method: 'PATCH', body: { working_itinerary: text } });
          document.getElementById('workingItinDisplay').innerHTML = text
            ? escapeHtml(text).replace(/\n/g, '<br>')
            : '<span style="color:var(--text-muted);font-style:italic">No working itinerary saved yet. Click Edit to add a day-by-day plan.</span>';
          document.getElementById('workingItinDisplay').style.display = '';
          document.getElementById('workingItinEditor').style.display = 'none';
          if (btnEditWI) btnEditWI.style.display = '';
          enquiry.working_itinerary = text;
          if (statusEl) { statusEl.textContent = 'Saved ' + new Date().toLocaleTimeString(); }
          toast('success', 'Working itinerary saved', 'Version history updated.');
        } catch (err) {
          toast('error', 'Save failed', err.message);
        } finally {
          btnSaveWI.disabled = false;
          btnSaveWI.textContent = 'Save';
        }
      });
    }

    if (btnCancelWI) {
      btnCancelWI.addEventListener('click', () => {
        document.getElementById('workingItinEditor').style.display = 'none';
        document.getElementById('workingItinDisplay').style.display = '';
        if (btnEditWI) btnEditWI.style.display = '';
      });
    }

    // Version history button
    if (btnWIHist) {
      btnWIHist.addEventListener('click', () => showItineraryVersionHistory(enquiry.id));
    }

    // Create Invoice from enquiry detail panel
    if (btnWIInv) {
      btnWIInv.addEventListener('click', async () => {
        try {
          btnWIInv.disabled = true;
          btnWIInv.textContent = 'Creating…';
          const result = await apiFetch(`/api/enquiries/${enquiry.id}/create-invoice`, { method: 'POST', body: {} });
          toast('success', 'Invoice created', `${result.invoice_number} · $${(result.total_usd || 0).toLocaleString()}${result.line_items_count ? ` · ${result.line_items_count} line items` : ''}`);
          navigate('invoices');
          closeSlideover();
        } catch (e) {
          toast('error', 'Invoice creation failed', e.message);
        } finally {
          if (btnWIInv) {
            btnWIInv.disabled = false;
            btnWIInv.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" style="vertical-align:-1px"><path d="M1 9h9M1 1h9v8H1V1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M3.5 4h4M3.5 6.5h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> Create Invoice`;
          }
        }
      });
    }

    document.getElementById('detailCurationBtn').addEventListener('click', async () => {
      closeSlideover();
      navigate('curation');
      await loadCurationEnquiries();
      const sel = document.getElementById('curationEnquirySelect');
      sel.value = enquiry.id;
      sel.dispatchEvent(new Event('change'));
      await runCurationFromEnquiry(enquiry.id);
    });

    // --- Payment ledger ---
    async function loadPaymentLedger() {
      const ledgerEl = document.getElementById('paymentLedgerList');
      if (!ledgerEl) return;
      try {
        const payments = await apiFetch(`/api/payments?booking_ref=${encodeURIComponent(enquiry.booking_ref)}`);
        const quoted = parseFloat(enquiry.quoted_usd) || 0;
        const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount_usd) || 0), 0);
        const balance = quoted - totalPaid;

        if (!payments.length) {
          ledgerEl.innerHTML = `<div style="color:var(--text-muted);padding:var(--space-2) 0">No payments recorded yet.</div>`;
        } else {
          ledgerEl.innerHTML = payments.map(p => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">
              <div>
                <span class="mono" style="font-size:11px;font-weight:600;color:var(--teal-700)">${fmtMoney(p.amount_usd)}</span>
                <span style="color:var(--text-muted);margin-left:6px">${escapeHtml(p.method || 'bank_transfer').replace('_',' ')}</span>
                ${p.reference ? `<span style="color:var(--text-muted);margin-left:4px">· ${escapeHtml(p.reference)}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px;color:var(--text-muted)">${fmtDate(p.payment_date || p.created_at)}</span>
                <button style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:11px;padding:2px 4px"
                  onclick="window._deletePayment('${escapeHtml(p.id)}', '${escapeHtml(enquiry.booking_ref)}')">×</button>
              </div>
            </div>
          `).join('');
        }

        // Summary bar
        if (quoted > 0) {
          const pct = Math.min(100, (totalPaid / quoted) * 100);
          const barColor = totalPaid >= quoted - 0.01 ? 'var(--success)' : totalPaid > 0 ? 'var(--brand-gold)' : 'var(--border)';
          ledgerEl.innerHTML += `
            <div style="margin-top:var(--space-2)">
              <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${barColor};transition:width 0.3s"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--text-muted)">
                <span>Received: <strong class="mono">${fmtMoney(totalPaid)}</strong></span>
                <span>Balance: <strong class="mono" style="color:${balance > 0.01 ? 'var(--danger)' : 'var(--success)'}">${fmtMoney(Math.max(0, balance))}</strong></span>
              </div>
            </div>`;
        }

        // Update local enquiry state so kanban card refreshes
        const idx = state.enquiries.findIndex(e => e.id === enquiry.id);
        if (idx !== -1) {
          state.enquiries[idx].revenue_usd = totalPaid;
          state.enquiries[idx].balance_usd = balance;
        }
      } catch (err) {
        const ledgerEl2 = document.getElementById('paymentLedgerList');
        if (ledgerEl2) ledgerEl2.textContent = 'Failed to load payments.';
      }
    }
    loadPaymentLedger();

    const btnAddPay = document.getElementById('btnAddPayment');
    if (btnAddPay) {
      btnAddPay.addEventListener('click', () => {
        const form = document.getElementById('addPaymentForm');
        if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
      });
    }

    const btnCancelPay = document.getElementById('btnCancelPayment');
    if (btnCancelPay) btnCancelPay.addEventListener('click', () => {
      const form = document.getElementById('addPaymentForm');
      if (form) form.style.display = 'none';
    });

    const btnSavePay = document.getElementById('btnSavePayment');
    if (btnSavePay) {
      btnSavePay.addEventListener('click', async () => {
        const amt = parseFloat(document.getElementById('payAmt')?.value);
        if (!amt || amt <= 0) { toast('warning', 'Enter a valid amount'); return; }
        const payDate = document.getElementById('payDate')?.value;
        const method = document.getElementById('payMethod')?.value;
        const ref = document.getElementById('payRef')?.value;
        const notes = document.getElementById('payNotes')?.value;
        btnSavePay.classList.add('loading'); btnSavePay.disabled = true;
        try {
          await apiFetch('/api/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_ref: enquiry.booking_ref,
              amount_usd: amt,
              payment_date: payDate,
              method: method || 'bank_transfer',
              reference: ref || '',
              notes: notes || '',
              recorded_by: state.coordinator,
            }),
          });
          const form = document.getElementById('addPaymentForm');
          if (form) form.style.display = 'none';
          const amtEl = document.getElementById('payAmt');
          const refEl = document.getElementById('payRef');
          const notesEl2 = document.getElementById('payNotes');
          if (amtEl) amtEl.value = '';
          if (refEl) refEl.value = '';
          if (notesEl2) notesEl2.value = '';
          toast('success', 'Payment recorded', `${fmtMoney(amt)} saved`);
          await loadPaymentLedger();
          renderPipeline();
        } catch (err) {
          toast('error', 'Failed to save payment', err.message);
        } finally {
          btnSavePay.classList.remove('loading'); btnSavePay.disabled = false;
        }
      });
    }

    window._deletePayment = async function(payId, bookingRef) {
      if (!confirm('Delete this payment record?')) return;
      try {
        await apiFetch(`/api/payments/${payId}`, { method: 'DELETE' });
        toast('info', 'Payment deleted', '');
        await loadPaymentLedger();
        renderPipeline();
      } catch (err) {
        toast('error', 'Delete failed', err.message);
      }
    };

    // --- Invoice button ---
    const btnInvoice = document.getElementById('detailInvoiceBtn');
    if (btnInvoice) {
      btnInvoice.addEventListener('click', async () => {
        btnInvoice.classList.add('loading'); btnInvoice.disabled = true;
        try {
          const result = await apiFetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_ref: enquiry.booking_ref,
              client_name: enquiry.client_name,
              client_email: enquiry.email || '',
            }),
          });
          toast('success', `Invoice ${result.invoice_number} created`, `Total: ${fmtMoney(result.total_usd)}`);
          // Open PDF in new tab
          window.open(`${API}/api/invoices/${result.id}/pdf`, '_blank');
        } catch (err) {
          toast('error', 'Invoice generation failed', err.message);
        } finally {
          btnInvoice.classList.remove('loading'); btnInvoice.disabled = false;
        }
      });
    }

    // --- Vouchers button ---
    const btnVouchers = document.getElementById('detailVouchersBtn');
    if (btnVouchers) {
      btnVouchers.addEventListener('click', async () => {
        btnVouchers.classList.add('loading'); btnVouchers.disabled = true;
        try {
          const result = await apiFetch('/api/vouchers/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_ref: enquiry.booking_ref,
              client_name: enquiry.client_name,
              travel_start_date: enquiry.travel_start_date || '',
              special_requests: enquiry.special_requests || '',
            }),
          });
          if (result.created === 0) {
            toast('warning', 'No vouchers generated', 'No pricing data found. Generate a quotation first.');
          } else {
            toast('success', `${result.created} voucher${result.created !== 1 ? 's' : ''} generated`, result.vouchers.map(v => v.supplier).join(', '));
          }
        } catch (err) {
          toast('error', 'Voucher generation failed', err.message);
        } finally {
          btnVouchers.classList.remove('loading'); btnVouchers.disabled = false;
        }
      });
    }
  }

  /* ============================================================
     VIEW: ITINERARY MATCHING PANEL
     ============================================================ */
  async function loadCurationEnquiries() {
    try {
      const data = await apiFetch('/api/enquiries?limit=200');
      state.enquiries = data.items || [];
      const sel = document.getElementById('curationEnquirySelect');
      const current = sel.value;
      sel.innerHTML = '<option value="">— Choose enquiry —</option>' +
        state.enquiries.map(e =>
          `<option value="${escapeHtml(e.id)}">${escapeHtml(e.booking_ref)} — ${escapeHtml(e.client_name)}</option>`
        ).join('');
      if (current) sel.value = current;
    } catch (e) { void e; }
  }

  function initCurationPanel() {
    renderInterestCheckboxes('curationInterestsCheckboxes', 'cur_interest');

    const sel = document.getElementById('curationEnquirySelect');
    const btnFromEnquiry = document.getElementById('btnRunCurationFromEnquiry');

    sel.addEventListener('change', () => {
      btnFromEnquiry.disabled = !sel.value;
    });

    btnFromEnquiry.addEventListener('click', async () => {
      if (!sel.value) return;
      await runCurationFromEnquiry(sel.value);
    });

    document.getElementById('btnRunManualCuration').addEventListener('click', async () => {
      await runManualCuration();
    });

    document.getElementById('btnApproveItinerary').addEventListener('click', async () => {
      await approveItinerary();
    });
  }

  async function runCurationFromEnquiry(enquiryId) {
    state.curation.enquiryId = enquiryId;
    state.curation.selectedItineraryId = null;
    document.getElementById('approvalPanel').classList.add('hidden');

    const resultsEl = document.getElementById('curationResults');
    resultsEl.innerHTML = renderCurationSkeleton();

    const btn = document.getElementById('btnRunCurationFromEnquiry');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const data = await apiFetch('/api/curate-itinerary', {
        method: 'POST',
        body: { enquiry_id: enquiryId }
      });
      state.curation.suggestions = data.suggestions || [];
      state.curation.enquiryId = data.enquiry_id || enquiryId;
      renderCurationResults(data);
      toast('success', 'Matching complete', `${state.curation.suggestions.length} itineraries ranked`);
    } catch (err) {
      resultsEl.innerHTML = `
        <div class="empty-state card">
          <div class="empty-title">Matching Failed</div>
          <div class="empty-text">${escapeHtml(err.message)}</div>
        </div>
      `;
      toast('error', 'Matching failed', err.message);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  async function runManualCuration() {
    state.curation.enquiryId = null;
    state.curation.selectedItineraryId = null;
    document.getElementById('approvalPanel').classList.add('hidden');

    const resultsEl = document.getElementById('curationResults');
    resultsEl.innerHTML = renderCurationSkeleton();

    const btn = document.getElementById('btnRunManualCuration');
    btn.classList.add('loading');
    btn.disabled = true;

    const interests = [];
    document.querySelectorAll('#curationInterestsCheckboxes input[type="checkbox"]:checked').forEach(cb => {
      interests.push(cb.value);
    });

    const destRaw = document.getElementById('curDestinations').value.trim();
    const destinations = destRaw || '';

    const payload = {
      duration_days: parseInt(document.getElementById('curDuration').value) || null,
      budget_tier: document.getElementById('curBudget').value || null,
      nationality_tier: document.getElementById('curNationality').value,
      pax: parseInt(document.getElementById('curPax').value) || 2,
      interests,
      destinations
    };

    try {
      const data = await apiFetch('/api/curate-itinerary', { method: 'POST', body: payload });
      state.curation.suggestions = data.suggestions || [];
      state.curation.enquiryId = data.enquiry_id || null;
      renderCurationResults(data);
      toast('success', 'Matching complete', `${state.curation.suggestions.length} itineraries ranked`);
    } catch (err) {
      resultsEl.innerHTML = `
        <div class="empty-state card">
          <div class="empty-title">Matching Failed</div>
          <div class="empty-text">${escapeHtml(err.message)}</div>
        </div>
      `;
      toast('error', 'Matching failed', err.message);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  function renderCurationSkeleton() {
    return [1,2,3].map(() => `
      <div class="card" style="margin-bottom:var(--space-4);padding:var(--space-5)">
        <div class="skeleton skeleton-title" style="width:60%;margin-bottom:var(--space-3)"></div>
        <div class="skeleton skeleton-text" style="width:40%;margin-bottom:var(--space-2)"></div>
        <div class="skeleton skeleton-text" style="width:80%"></div>
      </div>
    `).join('');
  }

  function renderCurationResults(data) {
    const resultsEl = document.getElementById('curationResults');
    const suggestions = data.suggestions || [];

    if (suggestions.length === 0) {
      resultsEl.innerHTML = `
        <div class="empty-state card">
          <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3l3 8.5H25l-7 5.1 2.7 8.4L14 20l-6.7 5 2.7-8.4L3 11.5h8L14 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
          <div class="empty-title">No Matches Found</div>
          <div class="empty-text">Try adjusting the parameters for better matches.</div>
        </div>
      `;
      return;
    }

    resultsEl.innerHTML = `
      <div style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--space-4)">
        ${suggestions.length} itinerary suggestions — click to select
      </div>
      ${suggestions.map((s, idx) => renderSuggestionCard(s, idx)).join('')}
    `;

    // Wire up selection
    resultsEl.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.itineraryId;
        const name = card.dataset.itineraryName;
        selectSuggestion(id, name, card);
      });
    });
  }

  function renderSuggestionCard(suggestion, rank) {
    // API returns flat fields: itinerary_id, itinerary_name, score, reasons, penalties, modifications, duration_days, budget_tier, countries
    const score = Math.round(suggestion.score || 0);
    const circumference = 2 * Math.PI * 24; // r=24
    const offset = circumference - (score / 100) * circumference;

    const scoreColor = score >= 70 ? 'var(--teal-700)' : score >= 50 ? 'var(--gold-500)' : 'var(--danger)';
    const scoreRingBg = score >= 70 ? 'var(--teal-100)' : score >= 50 ? 'var(--gold-100)' : '#FEE2E2';

    const reasons = suggestion.reasons || [];
    const penalties = suggestion.penalties || [];
    const modifications = suggestion.modifications || [];
    const countries = (suggestion.countries || []).join(', ');
    const itnName = suggestion.itinerary_name || 'Unnamed Itinerary';
    const itnId = suggestion.itinerary_id || '';

    return `
      <div class="suggestion-card" data-itinerary-id="${escapeHtml(itnId)}" data-itinerary-name="${escapeHtml(itnName)}">
        <div class="suggestion-header">
          <div>
            <span class="badge badge-teal" style="margin-bottom:6px">#${rank + 1} Match</span>
          </div>
          <svg class="curation-score-ring" viewBox="0 0 60 60" aria-label="Score ${score}">
            <circle class="score-ring-bg" cx="30" cy="30" r="24" style="stroke:${scoreRingBg}"/>
            <circle class="score-ring-fg" cx="30" cy="30" r="24"
              style="stroke:${scoreColor};stroke-dasharray:${circumference};stroke-dashoffset:${offset}"
              transform="rotate(-90, 30, 30)"/>
            <text x="30" y="30" class="score-ring-text" style="fill:${scoreColor}">${score}</text>
          </svg>
        </div>
        <div class="suggestion-info">
          <div class="suggestion-name">${escapeHtml(itnName)}</div>
          <div class="suggestion-meta">
            <span>${suggestion.duration_days ? suggestion.duration_days + ' days' : '—'}</span>
            ${countries ? `<span>&middot; ${escapeHtml(countries)}</span>` : ''}
            ${suggestion.budget_tier ? `<span class="badge badge-gold">${capitalise(suggestion.budget_tier)}</span>` : ''}
          </div>
        </div>

        ${reasons.length > 0 ? `
        <div class="highlights-list" style="margin-top:var(--space-2)">
          ${reasons.map(r => `<span class="highlight-tag">${escapeHtml(r)}</span>`).join('')}
        </div>` : ''}

        ${penalties.length > 0 ? `
        <div style="margin-top:var(--space-2);font-size:var(--text-xs);color:var(--danger)">
          ${penalties.map(p => `<div>⚠ ${escapeHtml(p)}</div>`).join('')}
        </div>` : ''}

        ${modifications.length > 0 ? `
        <div style="margin-top:var(--space-2);font-size:var(--text-xs);color:var(--text-muted)">
          <strong>Suggested modifications:</strong>
          ${modifications.map(m => `<div>→ ${escapeHtml(m)}</div>`).join('')}
        </div>` : ''}

        <div class="score-breakdown">
          <div class="score-item">
            <div class="score-item-label">Overall Score</div>
            <div class="score-item-value">${score}/100</div>
          </div>
          <div class="score-item">
            <div class="score-item-label">Duration</div>
            <div class="score-item-value">${suggestion.duration_days || '—'} days</div>
          </div>
          <div class="score-item">
            <div class="score-item-label">Budget</div>
            <div class="score-item-value">${suggestion.budget_tier ? capitalise(suggestion.budget_tier) : '—'}</div>
          </div>
        </div>

        <button class="btn btn-primary w-full" style="margin-top:var(--space-4)" onclick="event.stopPropagation(); this.closest('.suggestion-card').click();">
          Select This Itinerary
        </button>
      </div>
    `;
  }

  function selectSuggestion(itineraryId, itineraryName, cardEl) {
    // Deselect all
    document.querySelectorAll('.suggestion-card').forEach(c => c.classList.remove('selected'));
    cardEl.classList.add('selected');

    state.curation.selectedItineraryId = itineraryId;
    state.curation.selectedItineraryName = itineraryName;

    // Show approval panel
    const panel = document.getElementById('approvalPanel');
    panel.classList.remove('hidden');
    document.getElementById('approvalSelectedName').textContent = itineraryName;
    document.getElementById('approvalNotes').value = '';
    document.getElementById('approvedBy').value = '';

    // Clear any lingering validation errors from a previous attempt
    panel.querySelector('.approval-validation-error')?.remove();

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function approveItinerary() {
    if (!state.curation.selectedItineraryId) {
      toast('warning', 'No itinerary selected');
      return;
    }
    if (!state.curation.enquiryId) {
      toast('warning', 'No enquiry linked', 'Use "Match from Enquiry" to link an enquiry first.');
      return;
    }
    const approvedBy = document.getElementById('approvedBy').value;
    if (!approvedBy) {
      toast('warning', 'Select approver', 'Choose who is approving this itinerary.');
      return;
    }

    const panel = document.getElementById('approvalPanel');

    // ── Pre-approval validation ─────────────────────────────────────────────
    // 1. Nationality tier must be set on the linked enquiry.
    //    UWA permit rates differ by up to 9× across tiers (FNR / FR / ROA / EAC / Ugandan).
    const approvedEnq = state.enquiries.find(
      e => String(e.id) === String(state.curation.enquiryId) ||
           e.booking_ref === String(state.curation.enquiryId)
    );
    if (!approvedEnq?.nationality_tier?.trim()) {
      panel.querySelector('.approval-validation-error')?.remove();
      const errBanner = document.createElement('div');
      errBanner.className = 'approval-validation-error';
      errBanner.style.cssText = 'margin-top:14px;padding:12px 14px;background:rgba(220,38,38,.05);border:1px solid rgba(220,38,38,.35);border-radius:var(--radius-md);font-size:var(--text-xs)';
      errBanner.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:var(--danger);margin-bottom:6px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M6.5 3.5v3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="6.5" cy="9" r=".6" fill="currentColor"/></svg>
          Approval blocked: nationality tier required
        </div>
        <div style="color:var(--text-secondary);margin-bottom:10px;line-height:1.5">
          The linked enquiry has no nationality tier set. UWA permit rates differ by
          up to 9× across tiers (FNR&nbsp;$800 vs EAC&nbsp;$83 for gorilla tracking).
          Open the enquiry and set the nationality before approving.
        </div>
        <button class="btn btn-primary" style="font-size:var(--text-xs)" onclick="window.TRVE.navigate('enquiries')">
          Go to Enquiries — Set Nationality Tier
        </button>
      `;
      panel.appendChild(errBanner);
      toast('error', 'Approval blocked', 'Set nationality tier on the enquiry first.');
      return;
    }

    // 2. Validate selected itinerary is compatible with the enquiry's nationality tier.
    const selectedItn = state.curation.suggestions?.find(
      s => String(s.itinerary_id) === String(state.curation.selectedItineraryId)
    );
    if (selectedItn?.itinerary?.nationality_tiers?.length > 0 &&
        !selectedItn.itinerary.nationality_tiers.includes(approvedEnq.nationality_tier)) {
      panel.querySelector('.approval-validation-error')?.remove();
      const warnBanner = document.createElement('div');
      warnBanner.className = 'approval-validation-error';
      warnBanner.style.cssText = 'margin-top:14px;padding:12px 14px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.4);border-radius:var(--radius-md);font-size:var(--text-xs)';
      warnBanner.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:var(--brand-gold-dark,#b45309);margin-bottom:6px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L12 11.5H1L6.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="6.5" cy="9.5" r=".5" fill="currentColor"/></svg>
          Tier compatibility warning
        </div>
        <div style="color:var(--text-secondary);margin-bottom:10px;line-height:1.5">
          This itinerary is not listed as compatible with <strong>${escapeHtml(approvedEnq.nationality_tier)}</strong>.
          Compatible tiers: <strong>${escapeHtml(selectedItn.itinerary.nationality_tiers.join(', '))}</strong>.
          You can still proceed — coordinator will need to verify permit availability.
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" style="font-size:var(--text-xs)" id="btnProceedAnyway">Proceed Anyway</button>
          <button class="btn btn-ghost" style="font-size:var(--text-xs)" onclick="this.closest('.approval-validation-error').remove()">Cancel</button>
        </div>
      `;
      panel.appendChild(warnBanner);
      // Wire the "Proceed Anyway" button to call approveItinerary after removing the warning
      warnBanner.querySelector('#btnProceedAnyway').addEventListener('click', () => {
        warnBanner.remove();
        approveItinerary();
      });
      return;
    }

    // All validation passed — clear any previous error banners
    panel.querySelector('.approval-validation-error')?.remove();
    // ───────────────────────────────────────────────────────────────────────────

    const btn = document.getElementById('btnApproveItinerary');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      await apiFetch(`/api/curate-itinerary/${state.curation.enquiryId}/approve`, {
        method: 'POST',
        body: {
          approved: true,
          selected_itinerary_id: state.curation.selectedItineraryId,
          reviewer: approvedBy,
          modifications: document.getElementById('approvalNotes').value.trim() || null
        }
      });

      // Pre-load enquiry data into pricing form fields NOW, before user navigates.
      // This prevents the "nationality tier not set" warning when the pricing view opens.
      if (approvedEnq) {
        const natSel = document.getElementById('pricingNationality');
        if (natSel && approvedEnq.nationality_tier) natSel.value = approvedEnq.nationality_tier;
        const adultsEl   = document.getElementById('pricingAdults');
        const childrenEl = document.getElementById('pricingChildren');
        if (approvedEnq.pax && adultsEl) {
          adultsEl.value = approvedEnq.pax;
          if (childrenEl) childrenEl.value = 0;
        }
        const dateEl = document.getElementById('pricingTravelStartDate');
        if (dateEl && approvedEnq.travel_start_date) dateEl.value = approvedEnq.travel_start_date;
        const daysEl = document.getElementById('pricingDays');
        if (daysEl && approvedEnq.duration_days) daysEl.value = approvedEnq.duration_days;
        // Derive and populate travel_end_date so nights calculation has both bounds
        const endDateEl = document.getElementById('pricingTravelEndDate');
        if (endDateEl && approvedEnq.travel_start_date && approvedEnq.duration_days && !endDateEl.value) {
          const endDate = new Date(approvedEnq.travel_start_date);
          endDate.setDate(endDate.getDate() + approvedEnq.duration_days - 1); // inclusive
          endDateEl.value = endDate.toISOString().slice(0, 10);
        }
      }

      const tierLabel = approvedEnq.nationality_tier ? ` · Nationality: ${approvedEnq.nationality_tier}` : '';
      toast('success', 'Itinerary approved!', `${state.curation.selectedItineraryName} linked to enquiry${tierLabel}.`);

      // Replace approval panel with clean confirmed state — no warning icons
      panel.innerHTML = `
        <div style="text-align:center;padding:var(--space-6)">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="color:var(--success);margin:0 auto var(--space-4)">
            <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="1.5"/>
            <path d="M15 24l6 6 12-12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div style="font-size:var(--text-xl);font-weight:600;color:var(--success);margin-bottom:var(--space-2)">Approved!</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:4px">
            ${escapeHtml(state.curation.selectedItineraryName)} approved by ${escapeHtml(approvedBy)}.
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-4)">
            Nationality: <strong>${escapeHtml(approvedEnq.nationality_tier)}</strong>
            &nbsp;·&nbsp; Pricing form pre-loaded ✓
          </div>
          <button class="btn btn-gold" onclick="window.TRVE.navigate('pricing')">
            Proceed to Pricing Calculator
          </button>
        </div>
      `;

    } catch (err) {
      toast('error', 'Approval failed', err.message);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  /* ============================================================
     VIEW: PRICING CALCULATOR
     ============================================================ */
  async function loadPricingItineraries() {
    try {
      const data = await apiFetch('/api/itineraries?limit=100');
      state.itineraries = data.items || [];
      const sel = document.getElementById('pricingItinerary');
      sel.innerHTML = '<option value="">— Manual entry —</option>' +
        state.itineraries.map(i =>
          `<option value="${escapeHtml(i.id)}">${escapeHtml(i.id)} — ${escapeHtml(i.name)}</option>`
        ).join('');

      // Populate itinerary auto-fill (MAJOR-20: expanded)
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        const itn = state.itineraries.find(i => i.id === sel.value);
        if (itn) {
          if (itn.duration_days) {
            const daysEl = document.getElementById('pricingDays');
            if (daysEl) daysEl.value = itn.duration_days;
            // Vehicle days default to duration - 1 (arrival day has no game drive)
            const vDaysEl = document.getElementById('pricingVehicleDays');
            if (vDaysEl) vDaysEl.value = itn.vehicle_days || Math.max(1, (itn.duration_days || 7) - 1);
          }
          // Auto-check permits based on itinerary destinations/activities
          const activities = [].concat(itn.activities || itn.highlights || []).join(' ').toLowerCase();
          const dests = (itn.destinations || []).join(' ').toLowerCase();
          const combined = activities + ' ' + dests + ' ' + (itn.name || '').toLowerCase();

          // Gorilla tracking
          const gorillaChk = document.querySelector('[name="permit_gorilla_uganda"]');
          if (gorillaChk) gorillaChk.checked = /gorilla|bwindi|mgahinga/.test(combined);

          // Chimp tracking
          const chimpChk = document.querySelector('[name="permit_chimp"]');
          if (chimpChk) chimpChk.checked = /chimp|kibale/.test(combined);

          // Golden monkey
          const goldenChk = document.querySelector('[name="permit_golden"]');
          if (goldenChk) goldenChk.checked = /golden monkey|mgahinga/.test(combined);

          // Park entry categories based on destinations
          const parkAPlus = document.querySelector('[name="permit_park_a_plus"]');
          if (parkAPlus) parkAPlus.checked = /murchison/.test(combined);
          const parkA = document.querySelector('[name="permit_park_a"]');
          if (parkA) parkA.checked = /queen elizabeth|qenp|kibale|bwindi|kidepo|lake mburo|mburo/.test(combined);
          const parkB = document.querySelector('[name="permit_park_b"]');
          if (parkB) parkB.checked = /semuliki|rwenzori|mt elgon|elgon/.test(combined);

          // Sync nationality tier from linked enquiry (critical for UWA permit pricing)
          if (state.curation && state.curation.enquiryId) {
            const enq = state.enquiries.find(e => e.id === state.curation.enquiryId);
            if (enq) {
              if (enq.nationality_tier) {
                const natSel = document.getElementById('pricingNationality');
                if (natSel) {
                  natSel.value = enq.nationality_tier;
                }
              }
              if (enq.pax) {
                const aEl = document.getElementById('pricingAdults');
                if (aEl) aEl.value = enq.pax;
                const cEl = document.getElementById('pricingChildren');
                if (cEl) cEl.value = 0;
              }
              if (enq.travel_start_date) {
                const tsdEl = document.getElementById('pricingTravelStartDate');
                if (tsdEl) tsdEl.value = enq.travel_start_date;
              }
            }
          }

          // Update permit labels and activity prices for the new date/tier context
          updatePermitLabels();
          renderActivityPresets();

          // Validate nationality is set — warn if missing
          const natEl = document.getElementById('pricingNationality');
          const tierVal = natEl ? natEl.value : '';
          if (!tierVal) {
            toast('warning', 'Nationality tier not set',
              'Set the guest nationality tier. UWA permit rates differ significantly by category (FNR / FR / EAC).');
          } else {
            toast('info', 'Itinerary loaded',
              `${itn.name || itn.id} — ${itn.duration_days || '?'} days · Permits & vehicle days auto-filled · Nationality: ${tierVal}`);
          }

          // Generate AI day-by-day itinerary description
          if (itn.highlights || itn.description) {
            generateItineraryText(itn);
          }
        }
      });

      // After data loads, apply pre-selected itinerary from curation approval
      // This replaces the fragile 500ms setTimeout in navigate()
      if (state.curation && state.curation.selectedItineraryId) {
        const preId = state.curation.selectedItineraryId;
        if (state.itineraries.find(i => i.id === preId)) {
          sel.value = preId;
          sel.dispatchEvent(new Event('change'));
        }
      }
    } catch (e) { void e; }

    // Load lodges
    try {
      const lodges = await apiFetch('/api/lodge-rates/lodges');
      state.lodgeData = Array.isArray(lodges) ? lodges : [];
      state.lodges = state.lodgeData.map(l => l.name || l.lodge_name || '').filter(Boolean);
      if (state.lodges.length === 0) {
        // Try the /api/lodges endpoint as fallback
        const lodges2 = await apiFetch('/api/lodges?limit=200');
        const items = lodges2.items || lodges2 || [];
        // Build same structure as lodge-rates/lodges
        const lodgeMap = {};
        for (const l of items) {
          const n = l.lodge_name;
          if (!lodgeMap[n]) lodgeMap[n] = { name: n, country: l.country, location: l.location, room_types: [] };
          lodgeMap[n].room_types.push({ room_type: l.room_type, net_rate_usd: l.net_rate_usd, rack_rate_usd: l.rack_rate_usd, meal_plan: l.meal_plan, valid_from: l.valid_from, valid_to: l.valid_to });
        }
        state.lodgeData = Object.values(lodgeMap);
        state.lodges = state.lodgeData.map(l => l.name).filter(Boolean);
      }
      addLodgeItem(); // Add first lodge row
    } catch (_) {
      addLodgeItem();
    }
    _syncGuestPool();
    _renderGuestAssignmentUI();
  }

  // cfg optional: {lodgeName, roomType, rooms, nights, mealPlan, skipHistory}
  // Pass skipHistory:true when called from _restoreAccomSnapshot to avoid re-pushing.
  function addLodgeItem(cfg = {}) {
    if (!cfg.skipHistory) _accomPushHistory();

    const container = document.getElementById('lodgeItems');
    const idx = container.children.length;
    const el = document.createElement('div');
    el.className = 'lodge-item';
    el.dataset.idx = idx;

    const lodgeOptions = state.lodges.length > 0
      ? state.lodges.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')
      : '<option value="" disabled>⚠ No lodges — check backend connection</option>';

    // Auto-derive nights from trip dates (checkout − checkin) or days − 1
    // computeTripDates: duration_days = (endDate - startDate) + 1 (inclusive); nights = duration_days - 1
    const startDateVal = document.getElementById('pricingTravelStartDate')?.value || '';
    const endDateVal   = document.getElementById('pricingTravelEndDate')?.value   || '';
    const tripDays = parseInt(document.getElementById('pricingDays')?.value) || 0;
    let totalNights;
    if (startDateVal && endDateVal) {
      // Primary: compute from actual date range
      const diff = Math.round((new Date(endDateVal) - new Date(startDateVal)) / 86400000);
      totalNights = Math.max(1, diff); // nights = endDate - startDate (not +1 which would be duration_days)
    } else if (tripDays > 0) {
      // Secondary: derive from duration field (nights = duration_days - 1)
      totalNights = Math.max(1, tripDays - 1);
    } else {
      // No data yet — safe minimum; avoids the hardcoded-7 / 6-nights false default
      totalNights = 1;
    }

    // For 2nd+ lodges, default to remaining unallocated nights (min 1)
    let autoNights = totalNights;
    if (idx > 0 && !cfg.nights) {
      let usedNights = 0;
      document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
        usedNights += parseInt(row.querySelector('.lodge-nights-input')?.value) || 0;
      });
      autoNights = Math.max(1, totalNights - usedNights);
    }

    const initRooms   = cfg.rooms   || 1;
    const initNights  = cfg.nights  ?? autoNights;
    const initMeal    = cfg.mealPlan || 'FB';

    // Check-in / check-out display
    let checkInDisplay = '—', checkOutDisplay = '—';
    const fmtD = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    if (startDateVal) {
      const ci = new Date(startDateVal);
      checkInDisplay = fmtD(ci);
      if (endDateVal) {
        checkOutDisplay = fmtD(new Date(endDateVal));
      } else {
        const co = new Date(ci); co.setDate(co.getDate() + initNights);
        checkOutDisplay = fmtD(co);
      }
    }

    el.innerHTML = `
      <div class="lodge-item-body">

        <!-- ① Date bar — auto-synced (cascading across lodge rows) -->
        <div class="lodge-date-bar" style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:7px 10px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);font-size:var(--text-xs);color:var(--text-secondary)">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1.5" width="9" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1 4h9" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 1v1.5M7.5 1v1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          Check-in:&nbsp;<strong class="lodge-checkin-display">${checkInDisplay}</strong>
          &nbsp;&rarr;&nbsp;
          Check-out:&nbsp;<strong class="lodge-checkout-display">${checkOutDisplay}</strong>
          <span class="lodge-nights-badge" style="color:var(--text-muted);margin-left:4px">(${initNights} nights)</span>
          <label style="display:flex;align-items:center;gap:4px;margin-left:auto;cursor:pointer;font-size:var(--text-xs);color:var(--text-muted)">
            <input type="checkbox" class="lodge-custom-dates-toggle" style="width:11px;height:11px">
            Custom stay dates
          </label>
          <input type="date" name="lodge_checkin_${idx}" class="lodge-custom-checkin form-control" style="display:none;height:24px;font-size:var(--text-xs);width:130px">
          <input type="date" name="lodge_checkout_${idx}" class="lodge-custom-checkout form-control" style="display:none;height:24px;font-size:var(--text-xs);width:130px">
        </div>

        <!-- ② Lodge selection -->
        <div style="margin-bottom:8px">
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Lodge</label>
          <select class="form-control" name="lodge_name_${idx}">
            <option value="">— Select lodge —</option>
            ${lodgeOptions}
          </select>
        </div>

        <!-- ③ Nights at this lodge + Meal Plan (shared across all room types) -->
        <div style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:end;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Nights at this lodge</label>
            <div class="lodge-nights-pill" style="display:flex;align-items:center;gap:4px">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v1.5M5.5 8.5V10M1 5.5h1.5M8.5 5.5H10M2.6 2.6l1 1M7.4 7.4l1 1M2.6 8.4l1-1M7.4 3.6l1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="5.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2"/></svg>
              <input type="number" name="nights_${idx}" class="lodge-nights-input form-control" min="1" value="${initNights}"
                style="width:52px;height:30px;font-size:var(--text-sm);font-weight:600;text-align:center"
                title="Nights at this lodge. Multi-lodge trips: allocate total nights across all lodges."
                oninput="window.TRVE._updateLodgeRowDates(this.closest('.lodge-item'));window.TRVE._validateAndShowNightsSummary()">
              <span class="lodge-nights-hint" style="font-size:var(--text-xs);color:var(--text-muted)">nights</span>
            </div>
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Meal Plan</label>
            <select class="form-control" name="meal_plan_${idx}" style="font-size:var(--text-xs);height:30px">
              <option value="RO"${initMeal==='RO'?' selected':''}>RO — Room Only (no meals)</option>
              <option value="BB"${initMeal==='BB'?' selected':''}>BB — Bed &amp; Breakfast (breakfast)</option>
              <option value="HB"${initMeal==='HB'?' selected':''}>HB — Half Board (breakfast + dinner)</option>
              <option value="FB"${initMeal==='FB'?' selected':''}>FB — Full Board (all meals)</option>
              <option value="AI"${initMeal==='AI'?' selected':''}>AI — All Inclusive (meals + drinks)</option>
            </select>
          </div>
        </div>

        <!-- ④ Room Types section (Task 3: nested room type entries) -->
        <div class="lodge-room-type-section" style="margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px;flex-wrap:wrap">
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Room Types</span>
            <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
              <button type="button" class="btn btn-xs"
                style="font-size:10px;padding:3px 9px;height:22px;background:var(--teal-600);color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:600;white-space:nowrap"
                onclick="window.TRVE._autoAssignGuests()" title="Automatically assign all guests to rooms, respecting lodge policy. You can then drag to adjust.">
                ✦ Auto-Assign Guests
              </button>
              <span class="lodge-occupancy-badge" style="font-size:10px;padding:1px 6px;border:1px solid var(--border);border-radius:9px;background:var(--bg-surface);color:var(--text-muted);font-weight:600">—</span>
            </div>
          </div>

          <!-- Room type entries container -->
          <div class="room-type-entries">

            <!-- First room type entry (index 0) — uses legacy name attributes for backward compat -->
            <div class="room-type-entry" data-rt-idx="0"
              style="border:1px solid var(--border);border-radius:var(--radius-md);padding:10px;margin-bottom:8px;background:var(--bg-surface)">
              <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-bottom:8px">
                <div>
                  <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Room Type</label>
                  <select class="form-control room-type-select" name="room_type_${idx}" style="font-size:var(--text-xs)">
                    <option value="">— select lodge first —</option>
                  </select>
                  <div class="lodge-rate-freshness" style="display:none;font-size:var(--text-xs);margin-top:4px"></div>
                </div>
                <div>
                  <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Rooms</label>
                  <div style="display:flex;align-items:center;gap:4px">
                    <button type="button" class="btn btn-xs"
                      style="width:24px;height:30px;padding:0;font-size:14px;line-height:1;background:var(--bg-subtle);border:1px solid var(--border)"
                      onclick="window.TRVE._changeRoomTypeEntryCount(this.closest('.room-type-entry'),-1)" title="Remove one room">−</button>
                    <input type="number" name="rooms_${idx}" class="form-control rooms-input" min="1" value="${initRooms}"
                      style="width:44px;height:30px;font-size:var(--text-sm);font-weight:600;text-align:center"
                      title="Number of rooms of this type">
                    <button type="button" class="btn btn-xs"
                      style="width:24px;height:30px;padding:0;font-size:14px;line-height:1;background:var(--bg-subtle);border:1px solid var(--border)"
                      onclick="window.TRVE._changeRoomTypeEntryCount(this.closest('.room-type-entry'),+1)" title="Add one room">+</button>
                  </div>
                </div>
              </div>
              <!-- Rate control row (STO / Rack / custom override) -->
              ${_buildRateControlHTML(`rate_override_${idx}`)}
              <!-- Occupancy hint for this room type entry -->
              <div class="lodge-computed-occ" style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 10px;margin-bottom:8px;font-size:var(--text-xs);color:var(--text-secondary)">
                Occupancy computed from Basic Details guest count.
              </div>
              <!-- Guest assignment cards for this room type entry -->
              <div class="lodge-guest-assign" style="margin-top:4px">
                <div class="lodge-guest-assign-list"></div>
              </div>
            </div>

          </div><!-- /.room-type-entries -->

          <!-- Add Room Type button -->
          <button type="button" class="btn btn-ghost"
            style="width:100%;font-size:var(--text-xs);border:1px dashed var(--border);padding:6px;color:var(--text-muted)"
            onclick="window.TRVE._addRoomTypeEntry(this.closest('.lodge-item'))">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style="vertical-align:-1px"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            Add Room Type
          </button>
        </div><!-- /.lodge-room-type-section -->

        <!-- ⑤ Assignment footer and special requirements -->
        <div class="lodge-assignment-footer" style="font-size:10px;color:var(--text-secondary);text-align:right;margin-bottom:8px">
          Assigned to this lodge: <strong class="assigned-count">0</strong>
        </div>
        <div class="lodge-special-requirements" style="margin-top:6px;padding:8px 10px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md)">
        </div>

      </div>
      <button type="button" class="btn btn-ghost btn-icon"
        onclick="window.TRVE._removeLodgeItem(this.closest('.lodge-item'))" title="Remove lodge">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);

    // Lodge → populate room types in ALL room-type-entry selects within this lodge row
    const lodgeSelect = el.querySelector(`[name^="lodge_name_"]`);
    if (lodgeSelect) {
      lodgeSelect.addEventListener('change', function() {
        _accomPushHistory();
        _getRoomTypeEntries(el).forEach(entry => {
          const rtSel = entry.querySelector('.room-type-select');
          if (rtSel) populateRoomTypes(this.value, rtSel);
          // Reset chips to show new lodge's rates
          _updateRateChips(entry, this.value, entry.querySelector('.room-type-select')?.value || '');
        });
        _autoSyncRoomGuests(el);
      });
    }

    // Meal plan change → refresh rate chips and pricing summary
    const mealPlanSelect = el.querySelector(`[name^="meal_plan_"]`);
    if (mealPlanSelect) {
      mealPlanSelect.addEventListener('change', function() {
        const lodgeName = el.querySelector('[name^="lodge_name_"]')?.value || '';
        _getRoomTypeEntries(el).forEach(entry => {
          _updateRateChips(entry, lodgeName, entry.querySelector('.room-type-select')?.value || '');
        });
        _renderAccommPricingSummary();
      });
    }

    // Wire each room-type-entry's select and rooms input
    function _wireRoomTypeEntry(entry) {
      const rtSel = entry.querySelector('.room-type-select');
      if (rtSel) {
        rtSel.addEventListener('change', function() {
          _accomPushHistory();
          const lodgeName = el.querySelector('[name^="lodge_name_"]')?.value || '';
          _autoSyncRoomGuests(el);
          _showRateFreshnessForEntry(entry, lodgeName, this.value);
          // Update STO/Rack chip labels and auto-fill STO when field is blank
          _updateRateChips(entry, lodgeName, this.value);
          const rateInp = entry.querySelector('.rate-override-input');
          if (rateInp && (!rateInp.value || parseFloat(rateInp.value) === 0)) {
            const lodge = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
            const rt = lodge ? (lodge.room_types || []).find(r => r.room_type === this.value) : null;
            // Leave blank by default — backend uses DB rate; chips allow quick override
          }
        });
      }
      const roomsInp = entry.querySelector('[name^="rooms_"]');
      if (roomsInp) {
        roomsInp.addEventListener('change', () => { _accomPushHistory(); _autoSyncRoomGuests(el); });
        roomsInp.addEventListener('input',  () => _autoSyncRoomGuests(el));
      }
      // Wire rate override input to highlight chip on manual edit
      const rateInp = entry.querySelector('.rate-override-input');
      if (rateInp) {
        rateInp.addEventListener('input', () => {
          const lodgeName = el.querySelector('[name^="lodge_name_"]')?.value || '';
          const roomType  = rtSel ? rtSel.value : '';
          _updateRateChips(entry, lodgeName, roomType);
          _renderAccommPricingSummary();
        });
      }
    }
    _getRoomTypeEntries(el).forEach(entry => _wireRoomTypeEntry(entry));
    // Expose the wiring helper so _addRoomTypeEntry can reuse it
    el._wireRoomTypeEntry = _wireRoomTypeEntry;

    // Custom dates toggle
    const customToggle  = el.querySelector('.lodge-custom-dates-toggle');
    const customCheckin = el.querySelector('.lodge-custom-checkin');
    const customCheckout= el.querySelector('.lodge-custom-checkout');
    const ciDisplay     = el.querySelector('.lodge-checkin-display');
    const coDisplay     = el.querySelector('.lodge-checkout-display');
    if (customToggle) {
      customToggle.addEventListener('change', function() {
        const on = this.checked;
        customCheckin.style.display  = on ? '' : 'none';
        customCheckout.style.display = on ? '' : 'none';
        if (ciDisplay) ciDisplay.style.display = on ? 'none' : '';
        if (coDisplay) coDisplay.style.display = on ? 'none' : '';
        if (!on) _updateLodgeRowDates(el);
      });
      customCheckin.addEventListener('change',  () => _updateLodgeRowDates(el));
      customCheckout.addEventListener('change', () => _updateLodgeRowDates(el));
    }

    // Restore from snapshot: set lodge + room type values
    if (cfg.lodgeName && lodgeSelect) {
      lodgeSelect.value = cfg.lodgeName;
      _getRoomTypeEntries(el).forEach(entry => {
        const rtSel = entry.querySelector('.room-type-select');
        if (rtSel) populateRoomTypes(cfg.lodgeName, rtSel);
      });
      const firstEntry = _getRoomTypeEntries(el)[0];
      const firstRtSel = firstEntry?.querySelector('.room-type-select');
      if (cfg.roomType && firstRtSel) firstRtSel.value = cfg.roomType;
    }

    // Initial render
    _autoSyncRoomGuests(el);
    if (!cfg.skipRender) _renderAccommPricingSummary();
    _updateLodgeRowDates(); // cascade dates including this new row
    _validateAndShowNightsSummary();
  }

  // Update the computed-occupancy summary bar on each room-type-entry in a lodge row.
  // For multi-room-type lodges, each entry shows its own per-room occupancy hint.
  function _updateLodgeTotalGuestsHint(row) {
    const { adults: totalAdults, children: totalChildren } = _getBasicPax();
    const totalGuests = totalAdults + totalChildren;
    const lodgeName   = row.querySelector('[name^="lodge_name_"]')?.value || '';
    const entries     = _getRoomTypeEntries(row);

    // Helper to update a single entry's .lodge-computed-occ element
    const updateEntryOcc = (entry, rooms, roomType) => {
      const occEl  = entry.querySelector('.lodge-computed-occ');
      if (!occEl) return;
      const maxOcc = _getMaxOccupancy(roomType, lodgeName) || 2;
      const perRoom = rooms > 0 && totalGuests > 0 ? Math.ceil(totalGuests / rooms) : 0;
      const overcrowded = perRoom > maxOcc && !_childSharingApplies(
        Math.ceil(totalAdults / rooms), Math.ceil(totalChildren / rooms), maxOcc
      );
      occEl.style.borderColor = overcrowded ? 'var(--danger)' : 'var(--border)';
      occEl.style.background  = overcrowded ? 'rgba(220,38,38,.05)' : 'var(--bg-subtle)';
      occEl.innerHTML = totalGuests === 0
        ? '<em style="color:var(--text-muted)">Set guest count in Basic Details above.</em>'
        : `<span style="color:var(--text-muted)">
             <strong style="color:var(--text-secondary)">${totalGuests} guests</strong>
             &nbsp;·&nbsp; ${rooms} room${rooms !== 1 ? 's' : ''} of this type
             &nbsp;·&nbsp; <strong style="${overcrowded ? 'color:var(--danger)' : ''}">${perRoom} per room</strong>
             (max ${maxOcc})
             ${overcrowded ? '<span style="margin-left:4px;color:var(--danger);font-weight:700">⚠ Overcrowded</span>' : ''}
           </span>`;
    };

    if (entries.length === 0) {
      // Legacy: single room type from row-level fields
      const occEl = row.querySelector('.lodge-computed-occ');
      if (occEl) {
        const rooms    = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
        const roomType = row.querySelector('[name^="room_type_"]')?.value || '';
        const maxOcc   = _getMaxOccupancy(roomType, lodgeName) || 2;
        const perRoom  = rooms > 0 && totalGuests > 0 ? Math.ceil(totalGuests / rooms) : 0;
        // Use same child-sharing check as multi-room-type path (was missing here — bug fix)
        const overcrowded = perRoom > maxOcc && !_childSharingApplies(
          Math.ceil(totalAdults / rooms), Math.ceil(totalChildren / rooms), maxOcc
        );
        occEl.style.borderColor = overcrowded ? 'var(--danger)' : 'var(--border)';
        occEl.style.background  = overcrowded ? 'rgba(220,38,38,.05)' : 'var(--bg-subtle)';
        occEl.innerHTML = totalGuests === 0
          ? '<em style="color:var(--text-muted)">Set guest count in Basic Details above.</em>'
          : `<span style="color:var(--text-muted)">
               <strong style="color:var(--text-secondary)">${totalGuests} guests</strong>
               from Basic Details
               &nbsp;·&nbsp; ${rooms} room${rooms !== 1 ? 's' : ''}
               &nbsp;·&nbsp; <strong style="${overcrowded ? 'color:var(--danger)' : ''}">${perRoom} per room needed</strong>
               (max ${maxOcc})
               ${overcrowded ? '<span style="margin-left:4px;color:var(--danger);font-weight:700">⚠ Overcrowded</span>' : ''}
             </span>`;
      }
      return;
    }

    entries.forEach(entry => {
      const rooms    = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
      const roomType = entry.querySelector('.room-type-select')?.value || entry.querySelector('[name^="room_type_"]')?.value || '';
      updateEntryOcc(entry, rooms, roomType);
    });
  }

  // Drop any roomAssignments pointing to rooms that no longer exist in this row.
  // Called whenever rooms count changes so guests reappear in the unassigned pool.
  function _purgeStaleRoomAssignments(row) {
    if (!state.roomAssignments) return;
    const rowIdx  = parseInt(row.dataset.idx);
    const entries = _getRoomTypeEntries(row);
    const validKeys = new Set();
    entries.forEach((entry, rtIdx) => {
      const rooms = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
      for (let r = 0; r < rooms; r++) {
        validKeys.add(_makeRoomKey(rowIdx, rtIdx, r));
        if (rtIdx === 0) validKeys.add(`${rowIdx}:${r}`); // legacy 2-part key
      }
    });
    for (const [gid, key] of Object.entries(state.roomAssignments)) {
      if (!key.startsWith(`${rowIdx}:`)) continue;
      if (!validKeys.has(key)) delete state.roomAssignments[gid];
    }
  }

  // Refresh all derived display for a lodge row.
  function _autoSyncRoomGuests(row) {
    const rowIdx = parseInt(row.dataset.idx);
    _purgeStaleRoomAssignments(row);
    _updateLodgeTotalGuestsHint(row);
    _renderLodgeRoomCards(row, rowIdx);
    _updateRoomOccupancyBadge(row, rowIdx);
    _checkCapacityMismatch();
  }

  // Remove a lodge row with undo support.
  function _removeLodgeItem(el) {
    _accomPushHistory();
    el.remove();
    // Re-index remaining rows so idx matches DOM position
    document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, i) => {
      row.dataset.idx = i;
    });
    _syncLodgeGuestAssignments();
    _checkCapacityMismatch();
    _renderAccommPricingSummary();
    _updateLodgeRowDates(); // re-cascade dates after removal
    _validateAndShowNightsSummary();
  }
  window.TRVE._removeLodgeItem = _removeLodgeItem;
  window.TRVE.addLodgeItem     = addLodgeItem;

  // ── Task 3: Room type entry management ──────────────────────────────────────

  // Add a new room type entry to a lodge row.
  function _addRoomTypeEntry(lodgeRow) {
    _accomPushHistory();
    const entriesContainer = lodgeRow.querySelector('.room-type-entries');
    if (!entriesContainer) return;
    const lodgeName = lodgeRow.querySelector('[name^="lodge_name_"]')?.value || '';
    const rowIdx    = parseInt(lodgeRow.dataset.idx);
    const rtIdx     = entriesContainer.children.length; // next index

    const entry = document.createElement('div');
    entry.className = 'room-type-entry';
    entry.dataset.rtIdx = rtIdx;
    entry.style.cssText = 'border:1px solid var(--border);border-radius:var(--radius-md);padding:10px;margin-bottom:8px;background:var(--bg-surface);position:relative';

    entry.innerHTML = `
      <button type="button" class="btn btn-ghost btn-icon"
        style="position:absolute;top:6px;right:6px;width:20px;height:20px;padding:0;font-size:11px"
        onclick="window.TRVE._removeRoomTypeEntry(this.closest('.room-type-entry'))" title="Remove this room type">×</button>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-bottom:8px;padding-right:24px">
        <div>
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Room Type</label>
          <select class="form-control room-type-select" name="room_type_${rowIdx}_rt${rtIdx}" style="font-size:var(--text-xs)">
            <option value="">— select room type —</option>
          </select>
          <div class="lodge-rate-freshness" style="display:none;font-size:var(--text-xs);margin-top:4px"></div>
        </div>
        <div>
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Rooms</label>
          <div style="display:flex;align-items:center;gap:4px">
            <button type="button" class="btn btn-xs"
              style="width:24px;height:30px;padding:0;font-size:14px;line-height:1;background:var(--bg-subtle);border:1px solid var(--border)"
              onclick="window.TRVE._changeRoomTypeEntryCount(this.closest('.room-type-entry'),-1)">−</button>
            <input type="number" name="rooms_${rowIdx}_rt${rtIdx}" class="form-control rooms-input" min="1" value="1"
              style="width:44px;height:30px;font-size:var(--text-sm);font-weight:600;text-align:center">
            <button type="button" class="btn btn-xs"
              style="width:24px;height:30px;padding:0;font-size:14px;line-height:1;background:var(--bg-subtle);border:1px solid var(--border)"
              onclick="window.TRVE._changeRoomTypeEntryCount(this.closest('.room-type-entry'),+1)">+</button>
          </div>
        </div>
      </div>
      <!-- Rate control row (STO / Rack / custom override) -->
      ${_buildRateControlHTML(`rate_override_${rowIdx}_rt${rtIdx}`)}
      <!-- Occupancy hint -->
      <div class="lodge-computed-occ" style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 10px;margin-bottom:8px;font-size:var(--text-xs);color:var(--text-secondary)">
        Select room type above, then assign guests.
      </div>
      <!-- Guest assignment cards -->
      <div class="lodge-guest-assign" style="margin-top:4px">
        <div class="lodge-guest-assign-list"></div>
      </div>
    `;

    entriesContainer.appendChild(entry);

    // Populate room types dropdown from current lodge selection
    const rtSel = entry.querySelector('.room-type-select');
    if (lodgeName && rtSel) populateRoomTypes(lodgeName, rtSel);

    // Wire events
    if (lodgeRow._wireRoomTypeEntry) lodgeRow._wireRoomTypeEntry(entry);
    else {
      rtSel?.addEventListener('change', () => { _accomPushHistory(); _autoSyncRoomGuests(lodgeRow); });
      entry.querySelector('[name^="rooms_"]')?.addEventListener('change', () => { _accomPushHistory(); _autoSyncRoomGuests(lodgeRow); });
      entry.querySelector('[name^="rooms_"]')?.addEventListener('input',  () => _autoSyncRoomGuests(lodgeRow));
    }

    _autoSyncRoomGuests(lodgeRow);
    _renderAccommPricingSummary();
  }
  window.TRVE._addRoomTypeEntry = _addRoomTypeEntry;

  // Remove a room type entry (not the first one — it can be cleared but not removed).
  function _removeRoomTypeEntry(entry) {
    const lodgeRow = entry.closest('.lodge-item');
    if (!lodgeRow) return;
    const entriesContainer = lodgeRow.querySelector('.room-type-entries');
    // Don't remove the last entry
    if (entriesContainer && entriesContainer.children.length <= 1) {
      toast('warning', 'At least one room type required', 'Cannot remove the only room type entry. Clear the selection instead.');
      return;
    }
    _accomPushHistory();
    // Remove room assignments that were in this entry
    const rtIdx = parseInt(entry.dataset.rtIdx);
    const rowIdx = parseInt(lodgeRow.dataset.idx);
    const prefix = `${rowIdx}:${rtIdx}:`;
    for (const gid of Object.keys(state.roomAssignments || {})) {
      if ((state.roomAssignments[gid] || '').startsWith(prefix)) {
        delete state.roomAssignments[gid];
      }
    }
    entry.remove();
    // Re-index remaining entries so their data-rt-idx is contiguous
    const remaining = lodgeRow.querySelectorAll('.room-type-entry');
    remaining.forEach((e, i) => { e.dataset.rtIdx = i; });
    _autoSyncRoomGuests(lodgeRow);
    _renderAccommPricingSummary();
    _checkCapacityMismatch();
  }
  window.TRVE._removeRoomTypeEntry = _removeRoomTypeEntry;

  // Increment / decrement rooms count on a single room-type-entry.
  function _changeRoomTypeEntryCount(entry, delta) {
    _accomPushHistory();
    const inp = entry.querySelector('[name^="rooms_"]');
    if (!inp) return;
    inp.value = Math.max(1, (parseInt(inp.value) || 1) + delta);
    const lodgeRow = entry.closest('.lodge-item');
    if (lodgeRow) _autoSyncRoomGuests(lodgeRow);
  }
  window.TRVE._changeRoomTypeEntryCount = _changeRoomTypeEntryCount;

  // Show rate freshness hint for a specific room-type-entry.
  function _showRateFreshnessForEntry(entry, lodgeName, roomType) {
    const freshnessEl = entry.querySelector('.lodge-rate-freshness');
    if (!freshnessEl) return;
    if (!lodgeName || !roomType) { freshnessEl.style.display = 'none'; return; }
    const lodge = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
    if (!lodge) { freshnessEl.style.display = 'none'; return; }
    const rt = (lodge.room_types || []).find(r => r.room_type === roomType);
    if (!rt?.source_email_date) { freshnessEl.style.display = 'none'; return; }
    const ageDays = Math.floor((Date.now() - new Date(rt.source_email_date).getTime()) / 86400000);
    if (ageDays > 90) {
      freshnessEl.style.display = '';
      freshnessEl.style.color = 'var(--danger)';
      freshnessEl.textContent = `⚠ Rate from email ${ageDays} days ago — may be outdated`;
    } else {
      freshnessEl.style.display = '';
      freshnessEl.style.color = 'var(--text-muted)';
      freshnessEl.textContent = `Rate sourced from email dated ${rt.source_email_date}`;
    }
  }
  window.TRVE._showRateFreshnessForEntry = _showRateFreshnessForEntry;

  // Keep _changeRoomsCount as backward-compat alias — increments first room type entry
  function _changeRoomsCount(row, delta) {
    _accomPushHistory();
    const firstEntry = _getRoomTypeEntries(row)[0];
    const inp = firstEntry
      ? firstEntry.querySelector('[name^="rooms_"]')
      : row.querySelector('[name^="rooms_"]');
    if (!inp) return;
    inp.value = Math.max(1, (parseInt(inp.value) || 1) + delta);
    _autoSyncRoomGuests(row);
  }
  window.TRVE._changeRoomsCount = _changeRoomsCount;
  // ─────────────────────────────────────────────────────────────────────────────

  // When trip days change, auto-update nights in all lodge rows (single-lodge path only).
  // With multiple lodge rows, nights are distributed manually — only reset if just one row.
  function _syncLodgeNightsFromDays(days) {
    const nights = Math.max(1, days - 1);
    const rows = document.querySelectorAll('#lodgeItems .lodge-item');
    if (rows.length <= 1) {
      // Single lodge: auto-set to full trip nights
      rows.forEach(row => {
        const nightsInput = row.querySelector('.lodge-nights-input');
        const nightsHint = row.querySelector('.lodge-nights-hint');
        if (nightsInput) nightsInput.value = nights;
        if (nightsHint) nightsHint.textContent = `nights`;
      });
    }
    _updateAccommodationDates();
    _validateAndShowNightsSummary();
  }

  // ── Task 2: Nights validation ───────────────────────────────────────────────
  // Computes expected nights (trip duration − 1), sums lodge nights, shows
  // a real-time summary banner, and returns true if totals match.
  function _validateAndShowNightsSummary() {
    const days = parseInt(document.getElementById('pricingDays')?.value) || 0;
    const expected = days > 0 ? Math.max(1, days - 1) : null;

    // Collect per-row data
    const rows = Array.from(document.querySelectorAll('#lodgeItems .lodge-item'));
    const rowData = rows.map((row, i) => ({
      nights: parseInt(row.querySelector('.lodge-nights-input')?.value) || 0,
      name:   row.querySelector('[name^="lodge_name_"]')?.value || `Lodge ${i + 1}`,
    }));
    const assigned = rowData.reduce((s, r) => s + r.nights, 0);

    // Check for any zero-night rows (data integrity)
    const zeroNightRows = rowData.filter(r => r.nights === 0);

    // Get or create the banner element
    let banner = document.getElementById('nightsSummaryBanner');
    if (!banner) {
      const lodgeItems = document.getElementById('lodgeItems');
      if (!lodgeItems) return expected === null || assigned === expected;
      banner = document.createElement('div');
      banner.id = 'nightsSummaryBanner';
      banner.style.cssText = 'margin-top:8px;margin-bottom:4px';
      lodgeItems.parentNode.insertBefore(banner, lodgeItems.nextSibling);
    }

    // Hide banner if no data yet
    if (rows.length === 0 || expected === null) {
      banner.style.display = 'none';
      return true;
    }

    const match = assigned === expected && zeroNightRows.length === 0;
    const diff  = assigned - expected;

    if (match) {
      banner.style.display = '';
      const multiInfo = rows.length > 1
        ? ` &nbsp;·&nbsp; ${rows.length} lodges: ${rowData.map(r => `${r.name.split(' ')[0]} = ${r.nights}n`).join(' + ')}`
        : '';
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.3);border-radius:var(--radius-md);font-size:var(--text-xs)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="var(--success)" stroke-width="1.3"/><path d="M3.5 6l2 2 3-3" stroke="var(--success)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span style="color:var(--success);font-weight:700">Nights match</span>
          <span style="color:var(--text-secondary)">Total nights assigned: <strong>${assigned}</strong> = expected (${days} days − 1)${multiInfo}</span>
        </div>`;
    } else {
      const overUnder = diff > 0 ? 'over by' : 'short by';
      const absD = Math.abs(diff);
      let detail = '';
      if (zeroNightRows.length > 0) {
        detail = `Lodges with 0 nights: ${zeroNightRows.map(r => r.name.split(' ')[0]).join(', ')}. Set at least 1 night per lodge.`;
      } else if (rows.length > 1) {
        const remaining = expected - assigned;
        detail = `Adjust lodge nights so they sum to ${expected}. Current: ${rowData.map(r => `${r.name.split(' ')[0]} = ${r.nights}`).join(' + ')} = ${assigned}.`
               + (remaining > 0 ? ` Need ${remaining} more night${remaining !== 1 ? 's' : ''}.` : ` Remove ${Math.abs(remaining)} night${Math.abs(remaining) !== 1 ? 's' : ''}.`);
      } else {
        detail = `Set this lodge's nights to ${expected} to match the ${days}-day trip.`;
      }
      banner.style.display = '';
      banner.innerHTML = `
        <div style="display:flex;align-items:start;gap:8px;padding:10px 12px;background:rgba(220,38,38,.05);border:1px solid rgba(220,38,38,.35);border-radius:var(--radius-md);font-size:var(--text-xs)">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="6.5" cy="6.5" r="5.5" stroke="var(--danger)" stroke-width="1.3"/><path d="M6.5 3.5v3.2" stroke="var(--danger)" stroke-width="1.5" stroke-linecap="round"/><circle cx="6.5" cy="9" r=".6" fill="var(--danger)"/></svg>
          <div style="flex:1">
            <div style="font-weight:700;color:var(--danger);margin-bottom:3px">Nights mismatch — pricing and quotation blocked</div>
            <div style="color:var(--text-secondary);margin-bottom:4px">
              Total nights assigned: <strong>${assigned}</strong>
              &nbsp;·&nbsp; Expected: <strong>${expected}</strong> (${days} days − 1)
              &nbsp;·&nbsp; <strong style="color:var(--danger)">${overUnder} ${absD} night${absD !== 1 ? 's' : ''}</strong>
            </div>
            <div style="color:var(--text-muted);margin-bottom:${rows.length > 1 ? 6 : 0}px">${detail}</div>
            ${rows.length > 1 ? `
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border)"
              onclick="window.TRVE._autoDistributeNights()">Auto-Distribute Nights</button>` : ''}
          </div>
        </div>`;
    }
    return match;
  }
  window.TRVE._validateAndShowNightsSummary = _validateAndShowNightsSummary;
  // ─────────────────────────────────────────────────────────────────────────────

  // ---------------------------------------------------------------------------
  // ACCOMMODATION DATE AUTO-POPULATION
  // ---------------------------------------------------------------------------
  function _updateAccommodationDates() {
    const startVal = document.getElementById('pricingTravelStartDate')?.value;
    const endVal = document.getElementById('pricingTravelEndDate')?.value;
    const days = parseInt(document.getElementById('pricingDays')?.value) || 0;

    // Sync duration when both dates provided.
    // INCLUSIVE logic: 3 Apr → 6 Apr = 4 days (not 3).
    // Formula: duration_days = (endDate - startDate in days) + 1
    // Formula: nights        = duration_days - 1
    if (startVal && endVal) {
      const diffMs  = new Date(endVal) - new Date(startVal);
      const diffDays = Math.round(diffMs / 86400000) + 1; // inclusive
      if (diffDays >= 1) {
        const daysEl = document.getElementById('pricingDays');
        if (daysEl) {
          if (parseInt(daysEl.value) !== diffDays) {
            daysEl.value = diffDays;
            _syncLodgeNightsFromDays(diffDays);
          }
          daysEl.readOnly = true; // lock when dates are provided
          daysEl.title = 'Auto-calculated from travel dates (inclusive). Edit dates above to change.';
          daysEl.style.background = 'var(--bg-subtle)';
        }
        // Show nights hint below the duration field and in the date range hint
        const nights = diffDays - 1;
        const hintText = `${diffDays} day${diffDays !== 1 ? 's' : ''} · ${nights} night${nights !== 1 ? 's' : ''} (inclusive)`;
        const hint = document.getElementById('pricingDateRangeHint');
        if (hint) { hint.textContent = hintText; hint.style.display = ''; }
        const daysHint = document.getElementById('pricingDaysNightsHint');
        if (daysHint) { daysHint.textContent = `${nights} night${nights !== 1 ? 's' : ''} · auto-calculated from dates`; daysHint.style.display = ''; }
      }
    } else {
      // Unlock pricingDays when dates are cleared
      const daysEl = document.getElementById('pricingDays');
      if (daysEl) { daysEl.readOnly = false; daysEl.style.background = ''; daysEl.title = ''; }
      const hint = document.getElementById('pricingDateRangeHint');
      if (hint) hint.style.display = 'none';
      const daysHint = document.getElementById('pricingDaysNightsHint');
      if (daysHint) daysHint.style.display = 'none';
      if (startVal && days > 0) {
        // Compute end date from start + days - 1 (inclusive)
        const end = new Date(startVal);
        end.setDate(end.getDate() + days - 1);
        const endInput = document.getElementById('pricingTravelEndDate');
        if (endInput && !endInput.value) {
          endInput.value = end.toISOString().slice(0, 10);
        }
      }
    }

    // Update accommodation header date bar
    const bar = document.getElementById('accomDateBar');
    if (bar) {
      if (startVal) {
        const s = new Date(startVal);
        const effectiveDays = days || (endVal ? Math.round((new Date(endVal) - s) / 86400000) : 0);
        const checkOut = endVal ? new Date(endVal) : (effectiveDays > 0 ? (() => { const d = new Date(s); d.setDate(d.getDate() + effectiveDays); return d; })() : null);
        const fmt = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        bar.textContent = checkOut ? `Check-in: ${fmt(s)} → Check-out: ${fmt(checkOut)}` : `Check-in: ${fmt(s)}`;
      } else {
        bar.textContent = '';
      }
    }

    // Update check-in / check-out display on ALL lodge rows (cascading)
    _updateLodgeRowDates();

    // Re-validate nights totals whenever dates/duration change
    _validateAndShowNightsSummary();
  }

  // Update check-in/check-out display for ALL lodge rows in sequence (cascade).
  // Row 1: check-in = trip start; Row N: check-in = Row (N-1) check-out.
  // Rows with "Custom stay dates" checked keep their own date inputs and are treated
  // as anchors — subsequent non-custom rows resume cascading from that anchor's checkout.
  // Also accepts a single row argument for backward-compat but always re-cascades all rows.
  function _updateLodgeRowDates(_row) {
    const startVal = document.getElementById('pricingTravelStartDate')?.value;
    const fmt = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const rows = Array.from(document.querySelectorAll('#lodgeItems .lodge-item'));
    if (rows.length === 0) return;

    // Running cursor: starts at trip start date
    let cursor = startVal ? new Date(startVal) : null;

    rows.forEach((row, i) => {
      const checkInEl  = row.querySelector('.lodge-checkin-display');
      const checkOutEl = row.querySelector('.lodge-checkout-display');
      const badgeEl    = row.querySelector('.lodge-nights-badge');
      const customToggle = row.querySelector('.lodge-custom-dates-toggle');
      const isCustom   = customToggle?.checked;
      const nights     = parseInt(row.querySelector('.lodge-nights-input')?.value) || 1;

      if (isCustom) {
        // Custom row: read from explicit date inputs; update cursor to this checkout
        const ciInput = row.querySelector('.lodge-custom-checkin');
        const coInput = row.querySelector('.lodge-custom-checkout');
        const ciVal   = ciInput?.value;
        const coVal   = coInput?.value;
        // Auto-fill checkout from custom check-in + nights if checkout not set
        if (ciVal && !coVal && coInput) {
          const co = new Date(ciVal);
          co.setDate(co.getDate() + nights);
          coInput.value = co.toISOString().slice(0, 10);
        }
        if (ciVal) cursor = coVal ? new Date(coVal) : null;
        if (badgeEl) badgeEl.textContent = `(${nights} nights)`;
      } else {
        // Auto row: derive from cursor
        if (!cursor) {
          if (checkInEl)  checkInEl.textContent  = '—';
          if (checkOutEl) checkOutEl.textContent = '—';
          if (badgeEl)    badgeEl.textContent    = `(${nights} nights)`;
          // Advance cursor even without a start date (accumulate nights)
          return;
        }
        const checkIn  = new Date(cursor);
        const checkOut = new Date(cursor);
        checkOut.setDate(checkOut.getDate() + nights);
        if (checkInEl)  checkInEl.textContent  = fmt(checkIn);
        if (checkOutEl) checkOutEl.textContent = fmt(checkOut);
        if (badgeEl)    badgeEl.textContent    = `(${nights} nights)`;
        cursor = checkOut; // advance cascade cursor
      }
    });

    // Rebuild trip timeline bar after any date update
    _buildTripTimeline();
  }

  // ---------------------------------------------------------------------------
  // TRIP TIMELINE — visual strip showing lodge segments across trip nights
  // ---------------------------------------------------------------------------

  // Palette for up to 8 lodges (cycles if more)
  const _TIMELINE_COLORS = [
    '#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'
  ];

  // Build (or update) the trip timeline bar above the lodge items.
  // Shows a horizontal strip with one segment per lodge, proportional to nights.
  function _buildTripTimeline() {
    const rows = Array.from(document.querySelectorAll('#lodgeItems .lodge-item'));
    let tlEl = document.getElementById('tripTimelineBar');

    // Hide timeline if only 1 lodge or no trip dates
    const startVal = document.getElementById('pricingTravelStartDate')?.value;
    if (rows.length <= 1) { if (tlEl) tlEl.style.display = 'none'; return; }

    if (!tlEl) {
      const lodgeItems = document.getElementById('lodgeItems');
      if (!lodgeItems) return;
      tlEl = document.createElement('div');
      tlEl.id = 'tripTimelineBar';
      lodgeItems.parentNode.insertBefore(tlEl, lodgeItems);
    }
    tlEl.style.display = '';

    const days   = parseInt(document.getElementById('pricingDays')?.value) || 0;
    const expected = days > 0 ? Math.max(1, days - 1) : null;

    // Collect segment data from rows
    const segments = rows.map((row, i) => {
      const name    = row.querySelector('[name^="lodge_name_"]')?.value || `Lodge ${i + 1}`;
      const nights  = parseInt(row.querySelector('.lodge-nights-input')?.value) || 0;
      const ciText  = row.querySelector('.lodge-checkin-display')?.textContent  || '';
      const coText  = row.querySelector('.lodge-checkout-display')?.textContent || '';
      return { name, nights, ciText, coText, color: _TIMELINE_COLORS[i % _TIMELINE_COLORS.length] };
    });

    const totalNightsAssigned = segments.reduce((s, seg) => s + seg.nights, 0);
    const baseTotal = expected || totalNightsAssigned || 1;

    const segmentsHTML = segments.map((seg, i) => {
      const pct = totalNightsAssigned > 0 ? (seg.nights / baseTotal * 100).toFixed(1) : (100 / segments.length).toFixed(1);
      const shortName = seg.name.split(' ').slice(0, 2).join(' ');
      const tooltip   = `${seg.name}: ${seg.ciText} → ${seg.coText} (${seg.nights} night${seg.nights !== 1 ? 's' : ''})`;
      return `<div title="${escapeHtml(tooltip)}"
        style="flex:${pct};min-width:0;background:${seg.color};border-radius:${i===0?'var(--radius-md) 0 0 var(--radius-md)':''}${i===segments.length-1?' var(--radius-md) var(--radius-md) 0 0':''};
               display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:default;position:relative">
        <span style="font-size:9px;color:#fff;font-weight:700;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding:0 4px;text-shadow:0 1px 2px rgba(0,0,0,.4)">${escapeHtml(shortName)} · ${seg.nights}n</span>
      </div>`;
    }).join('');

    const dayLabels = (() => {
      if (!startVal || !expected) return '';
      let html = '<div style="display:flex;gap:0;margin-bottom:2px">';
      let cursor = new Date(startVal);
      const fmt  = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      let nightIdx = 0;
      segments.forEach(seg => {
        const pct = (seg.nights / baseTotal * 100).toFixed(1);
        html += `<div style="flex:${pct};min-width:0;font-size:9px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${fmt(cursor)}">
          ${fmt(cursor)}
        </div>`;
        cursor.setDate(cursor.getDate() + seg.nights);
      });
      html += `<div style="font-size:9px;color:var(--text-muted);white-space:nowrap;padding-left:2px">${fmt(cursor)}</div>`;
      html += '</div>';
      return html;
    })();

    const mismatch = expected !== null && totalNightsAssigned !== expected;
    const borderCol = mismatch ? 'var(--danger)' : 'var(--border)';

    tlEl.innerHTML = `
      <div style="margin-bottom:10px;padding:10px 12px;background:var(--bg-subtle);border:1px solid ${borderCol};border-radius:var(--radius-md)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">
            Trip Timeline — ${rows.length} lodge${rows.length !== 1 ? 's' : ''}
            ${expected ? ` · ${totalNightsAssigned}/${expected} nights allocated` : ''}
          </span>
          <div style="display:flex;gap:6px">
            <button type="button" class="btn btn-xs" title="Distribute remaining nights evenly across all lodges"
              style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border)"
              onclick="window.TRVE._autoDistributeNights()">
              Auto-Distribute
            </button>
          </div>
        </div>
        ${dayLabels}
        <div style="display:flex;height:28px;border-radius:var(--radius-md);overflow:hidden;border:1px solid rgba(0,0,0,.08)">
          ${segmentsHTML}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${segments.map((seg, i) => `
            <span style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--text-secondary)">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${seg.color}"></span>
              ${escapeHtml(seg.name.split(' ').slice(0,3).join(' '))} (${seg.nights}n)
            </span>`).join('')}
        </div>
      </div>`;
  }
  window.TRVE._buildTripTimeline = _buildTripTimeline;

  // Distribute total trip nights evenly across all lodge rows.
  // Remainders are front-loaded (first lodge gets +1 if not divisible evenly).
  function _autoDistributeNights() {
    const rows = Array.from(document.querySelectorAll('#lodgeItems .lodge-item'));
    if (rows.length === 0) return;
    const days    = parseInt(document.getElementById('pricingDays')?.value) || 0;
    const total   = days > 0 ? Math.max(1, days - 1) : null;
    if (!total) { toast('warn', 'Set trip duration', 'Enter the number of trip days before auto-distributing nights.'); return; }
    _accomPushHistory();
    const base  = Math.floor(total / rows.length);
    const extra = total % rows.length;
    rows.forEach((row, i) => {
      const inp = row.querySelector('.lodge-nights-input');
      if (inp) inp.value = base + (i < extra ? 1 : 0);
    });
    _updateLodgeRowDates();
    _validateAndShowNightsSummary();
    _renderAccommPricingSummary();
  }
  window.TRVE._autoDistributeNights = _autoDistributeNights;

  // ---------------------------------------------------------------------------
  // GUEST ID SYSTEM
  // ---------------------------------------------------------------------------
  function _generateGuestId() {
    state._guestIdSeq++;
    return `G-${new Date().getFullYear()}-${String(state._guestIdSeq).padStart(3, '0')}`;
  }

  function syncGuestRecords(total) {
    total = Math.max(0, total);
    while (state.guestRecords.length < total) {
      state.guestRecords.push({ id: _generateGuestId(), name: '', room_idx: null });
    }
    if (state.guestRecords.length > total) {
      state.guestRecords = state.guestRecords.slice(0, total);
    }
    renderGuestRoster();
    _syncLodgeGuestAssignments();
  }

  function renderGuestRoster() {
    const panel = document.getElementById('pricingGuestRoster');
    if (!panel) return;
    const { adults, children } = _getBasicPax();
    const total = adults + children;
    if (total === 0) { panel.style.display = 'none'; return; }
    panel.style.display = '';

    // Enforce single source of truth: guestRecords count = adults + children, never more
    while (state.guestRecords.length < total) {
      state.guestRecords.push({ id: _generateGuestId(), name: '' });
    }
    if (state.guestRecords.length > total) {
      state.guestRecords = state.guestRecords.slice(0, total);
    }

    panel.innerHTML = `
      <div class="form-section-title" style="margin-bottom:var(--space-3)">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="10.5" cy="4" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M11 8.3c1.1.3 2 1.4 2 2.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Guest Summary
      </div>
      <div style="display:flex;gap:16px;align-items:center;padding:8px 12px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;flex-wrap:wrap">
        <span style="font-size:var(--text-xs);color:var(--brand-green);font-weight:600">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style="vertical-align:-1px"><circle cx="5.5" cy="3.5" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M1 10c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          Adults: <strong>${adults}</strong>
        </span>
        <span style="font-size:var(--text-xs);color:var(--brand-gold-dark,#b45309);font-weight:600">Children: <strong>${children}</strong></span>
        <span style="font-size:var(--text-sm);font-weight:700;color:var(--text-secondary)">Total: <strong>${total}</strong></span>
        <span style="font-size:var(--text-xs);color:var(--text-muted);margin-left:auto;font-style:italic">Names are optional — enter if required</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${state.guestRecords.map((g, i) => {
          const isChild    = i >= adults;
          const typeLabel  = isChild ? 'Child' : 'Adult';
          const typeNum    = isChild ? i - adults + 1 : i + 1;
          const typeColor  = isChild ? 'var(--brand-gold-dark,#b45309)' : 'var(--brand-green)';
          return `
          <div class="guest-record-row" style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md)">
            <span style="font-size:var(--text-xs);font-weight:600;color:${typeColor};white-space:nowrap;min-width:52px">${typeLabel} ${typeNum}</span>
            <input type="text" class="form-control" placeholder="Name (optional)"
              value="${escapeHtml(g.name)}"
              style="flex:1;height:26px;font-size:var(--text-xs);padding:2px 8px"
              oninput="window.TRVE._updateGuestName(${i}, this.value)">
          </div>`;
        }).join('')}
      </div>
    `;
  }

  function _updateGuestName(idx, name) {
    if (state.guestRecords[idx]) state.guestRecords[idx].name = name;
  }

  // ---------------------------------------------------------------------------
  // CHILD AGE MANAGEMENT
  // ---------------------------------------------------------------------------
  function renderChildAgeInputs() {
    const section = document.getElementById('childAgesSection');
    if (!section) return;
    const children = _getBasicPax().children;
    if (children === 0) { section.style.display = 'none'; section.innerHTML = ''; return; }

    // Keep childAges array aligned with current child count
    if (!state.childAges) state.childAges = [];
    while (state.childAges.length < children) state.childAges.push(null);
    if (state.childAges.length > children) state.childAges = state.childAges.slice(0, children);

    section.style.display = '';
    section.innerHTML = `
      <div style="padding:8px 10px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md)">
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Child Ages</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${state.childAges.map((age, i) => {
            const isYoung = age !== null && age < 5;
            return `
            <div style="display:flex;align-items:center;gap:4px">
              <label style="font-size:var(--text-xs);color:var(--text-secondary);white-space:nowrap">Child ${i + 1}</label>
              <input type="number" class="form-control child-age-input" data-child-idx="${i}"
                min="0" max="17" value="${age !== null ? age : ''}" placeholder="age"
                style="width:52px;height:26px;font-size:var(--text-xs);text-align:center"
                oninput="window.TRVE._updateChildAge(${i}, this.value)">
              ${isYoung ? `<span class="child-young-badge" style="font-size:9px;padding:1px 4px;border-radius:4px;background:var(--brand-gold,#f59e0b);color:#fff;font-weight:600">Young</span>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;font-style:italic">
          Ages under 5 enable child-sharing occupancy flexibility where lodge policy permits.
        </div>
      </div>`;
  }
  window.TRVE.renderChildAgeInputs = renderChildAgeInputs;

  function _updateChildAge(idx, value) {
    if (!state.childAges) state.childAges = [];
    state.childAges[idx] = value !== '' ? parseInt(value) : null;
    // Only update the "Young" badge for this child — do NOT rebuild the whole section
    // (full innerHTML replace would destroy focus on the currently-typed input).
    const input = document.querySelector(`.child-age-input[data-child-idx="${idx}"]`);
    if (input) {
      const badge = input.nextElementSibling;
      const isYoung = state.childAges[idx] !== null && state.childAges[idx] < 5;
      if (isYoung && (!badge || !badge.classList.contains('child-young-badge'))) {
        const span = document.createElement('span');
        span.className = 'child-young-badge';
        span.style.cssText = 'font-size:9px;padding:1px 4px;border-radius:4px;background:var(--brand-gold,#f59e0b);color:#fff;font-weight:600';
        span.textContent = 'Young';
        input.insertAdjacentElement('afterend', span);
      } else if (!isYoung && badge && badge.classList.contains('child-young-badge')) {
        badge.remove();
      }
    }
    _distCache.clear(); // young-child count affects sharing logic
    _syncLodgeGuestAssignments();
    _checkCapacityMismatch();
  }
  window.TRVE._updateChildAge = _updateChildAge;

  // Count children globally with age < 5
  function _getYoungChildCount() {
    return (state.childAges || []).filter(a => a !== null && a < 5).length;
  }

  // Returns true when a room's excess occupancy is entirely attributable to young children
  // (i.e. adults do not exceed maxOcc on their own, and there are enough under-5 children
  //  globally to account for the overflow).
  function _childSharingApplies(adultsPerRoom, childrenPerRoom, maxOcc) {
    const total = adultsPerRoom + childrenPerRoom;
    if (total <= maxOcc) return false;          // no overflow — rule not needed
    if (adultsPerRoom > maxOcc) return false;   // adults alone bust the limit — can't waive
    const excess = total - maxOcc;
    const youngChildren = _getYoungChildCount();
    // The excess must be <= number of children in room (overflow is from children)
    // AND enough globally-registered young children exist to cover the excess.
    return excess <= childrenPerRoom && youngChildren >= excess;
  }

  // ---------------------------------------------------------------------------
  // COMPUTED OCCUPANCY MODEL
  // Derive all occupancy values from Basic Details.  No manual per-room entry.
  // ---------------------------------------------------------------------------

  // Single read of Basic Details guest counts — avoids duplicate DOM reads.
  function _getBasicPax() {
    return {
      adults:   parseInt(document.getElementById('pricingAdults')?.value)   || 0,
      children: parseInt(document.getElementById('pricingChildren')?.value) || 0,
    };
  }

  // Memoised distribution cache — cleared whenever Basic Details change.
  const _distCache = new Map();
  function _computeDistributionCached(totalGuests, rooms) {
    const key = `${totalGuests}-${rooms}`;
    if (!_distCache.has(key)) _distCache.set(key, _computeDistribution(totalGuests, rooms));
    return _distCache.get(key);
  }

  // Spread N guests across M rooms as evenly as possible.
  // Front-loads remainders so first rooms are fuller: [2,2,1] for 5/3.
  function _computeDistribution(totalGuests, rooms) {
    if (rooms <= 0) return [];
    if (totalGuests <= 0) return Array(rooms).fill(0);
    const base  = Math.floor(totalGuests / rooms);
    const extra = totalGuests % rooms;
    return Array.from({length: rooms}, (_, i) => base + (i < extra ? 1 : 0));
  }

  // Split each room's occupant count into {adults, children}.
  // Hotel rule: children must share a room with at least 1 adult — never alone.
  // Adults are placed first (max 2 per room); children fill only rooms that have adults.
  function _computeAdultChildSplit(distribution, totalAdults, totalChildren) {
    const rooms = distribution.length;
    const result = Array.from({length: rooms}, () => ({ adults: 0, children: 0 }));

    // Pass 1 — distribute adults (standard hotel max: 2 adults per room)
    let remA = totalAdults;
    for (let i = 0; i < rooms && remA > 0; i++) {
      const a = Math.min(distribution[i], 2, remA);
      result[i].adults = a;
      remA -= a;
    }

    if (totalChildren === 0) return result;

    // Pass 2 — place children only into rooms that already have ≥1 adult
    let remC = totalChildren;
    for (let i = 0; i < rooms && remC > 0; i++) {
      if (result[i].adults > 0) {
        const free = Math.max(0, distribution[i] - result[i].adults);
        const assign = Math.min(free, remC);
        result[i].children = assign;
        remC -= assign;
      }
    }

    // Pass 3 — overflow: if children remain (all adult rooms at distribution cap),
    // pile them into the first adult room — over-capacity warning will fire for the user.
    if (remC > 0) {
      for (let i = 0; i < rooms && remC > 0; i++) {
        if (result[i].adults > 0) {
          result[i].children += remC;
          remC = 0;
        }
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // CHILD MEAL & OCCUPANCY TIER HELPERS
  // ---------------------------------------------------------------------------

  // Age-banded meal pricing — aligns with lodge child policy tiers.
  // Thresholds: under 5 = free, 5–9 = child rate (50%), 10+ = half/adult rate.
  // Returns {multiplier, label, free, cotNeeded, highChairNeeded, confirmNeeded, ageGroup}
  function _getChildMealTier(age, lodgePolicy) {
    const p = lodgePolicy || {};
    const freeUnder  = p.free_under_age  ?? 5;
    const childUnder = p.child_under_age ?? 10;
    if (age === null || age === undefined) {
      return { multiplier: 0.5, label: 'Child rate (age unknown — assumed 5–9)', free: false, ageGroup: 'mid' };
    }
    if (age < 2)         return { multiplier: 0,   label: 'FREE — under 2', free: true, cotNeeded: true, highChairNeeded: true, ageGroup: 'infant' };
    if (age < freeUnder) return { multiplier: 0,   label: `FREE / token — age 2–${freeUnder - 1} (confirm with property)`, free: true, cotNeeded: true, confirmNeeded: true, ageGroup: 'young' };
    if (age < childUnder) return { multiplier: 0.5, label: `Child rate — 50% of adult (age ${freeUnder}–${childUnder - 1})`, free: false, ageGroup: 'mid' };
    return                      { multiplier: p.older_child_multiplier ?? 0.5, label: `Half/configured rate (age ${childUnder}+)`, free: false, ageGroup: 'older' };
  }

  // Return lodge-specific child policy from supplier data.
  // Reads the new child_policy JSON (free_under, child_rate_pct, adult_from) from the
  // lodge object returned by /api/lodge-rates/lodges, and maps it to the internal
  // policy object used by _getChildMealTier and _childSharingApplies.
  function _getLodgeChildPolicy(lodgeName) {
    const lodge = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
    // child_policy is returned at lodge level (from first room type row)
    const cp = lodge?.child_policy || {};
    // Support both old field names (free_under_age) and new compact names (free_under)
    const freeUnder   = cp.free_under    ?? cp.free_under_age    ?? 5;
    const adultFrom   = cp.adult_from    ?? cp.child_under_age   ?? 12;
    const childRatePct = cp.child_rate_pct ?? 50;
    return {
      free_under_age:          freeUnder,
      child_under_age:         adultFrom,          // age at which child becomes full adult
      older_child_multiplier:  childRatePct / 100, // e.g. 50 → 0.5
      max_adults_per_room:     cp.max_adults_per_room   ?? 2,
      child_sharing_allowed:   cp.child_sharing_allowed ?? true,
      max_children_sharing:    cp.max_children_sharing  ?? 3,
    };
  }

  // Log a soft-warning override to the audit trail.
  function _logOverride(roomKey, reason, guestIds) {
    if (!state.overrideLog) state.overrideLog = [];
    const entry = { roomKey, reason: reason || '(no reason given)', timestamp: new Date().toISOString(), guestIds: guestIds || [] };
    state.overrideLog.push(entry);
    if (!state.roomOverrides) state.roomOverrides = {};
    state.roomOverrides[roomKey] = { overridden: true, reason: entry.reason, timestamp: entry.timestamp };
    console.info('[RoomOverride]', entry);
  }

  // Show a modal confirmation dialog for soft-warning overrides.
  // Calls onConfirm(reason) when user confirms, or nothing when they cancel.
  function _showOverrideConfirmDialog(message, roomKey, onConfirm) {
    // Remove any existing dialog first
    document.getElementById('roomOverrideDialog')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'roomOverrideDialog';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center';
    backdrop.innerHTML = `
      <div style="background:var(--bg-card,#fff);border-radius:var(--radius-lg,10px);box-shadow:0 8px 32px rgba(0,0,0,.22);padding:24px 28px;max-width:420px;width:90%;font-family:inherit">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="var(--brand-gold,#f59e0b)" stroke-width="1.6"/><path d="M9 5.5v4" stroke="var(--brand-gold,#f59e0b)" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="12.5" r=".9" fill="var(--brand-gold,#f59e0b)"/></svg>
          <span style="font-size:var(--text-sm,13px);font-weight:700;color:var(--brand-gold-dark,#b45309)">Override Room Warning</span>
        </div>
        <p style="font-size:var(--text-xs,11px);color:var(--text-secondary);margin:0 0 6px">${message}</p>
        <p style="font-size:var(--text-xs,11px);color:var(--text-muted);margin:0 0 14px;font-style:italic">This configuration is allowed based on lodge policy. Ensure pricing and rooming are correct.</p>
        <label style="font-size:var(--text-xs,11px);font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Reason for override <span style="color:var(--danger)">*</span></label>
        <input id="overrideReasonInput" type="text" class="form-control"
          placeholder="e.g. Family group — 1 adult with 2 young children, lodge confirmed"
          style="font-size:var(--text-xs,11px);margin-bottom:14px;width:100%;box-sizing:border-box">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="overrideCancelBtn" type="button" class="btn btn-xs" style="font-size:var(--text-xs,11px);padding:5px 14px;background:var(--bg-surface);border:1px solid var(--border)">Cancel</button>
          <button id="overrideConfirmBtn" type="button" class="btn btn-xs" style="font-size:var(--text-xs,11px);padding:5px 14px;background:var(--brand-gold,#f59e0b);color:#fff;border:none;font-weight:700">Override and Proceed</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const input    = backdrop.querySelector('#overrideReasonInput');
    const confirmB = backdrop.querySelector('#overrideConfirmBtn');
    const cancelB  = backdrop.querySelector('#overrideCancelBtn');
    input.focus();
    const close = () => backdrop.remove();
    cancelB.addEventListener('click', close);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    confirmB.addEventListener('click', () => {
      const reason = input.value.trim();
      if (!reason) { input.style.borderColor = 'var(--danger)'; input.focus(); return; }
      close();
      onConfirm(reason);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmB.click();
      if (e.key === 'Escape') close();
    });
  }

  // True when a guest object represents an under-5 child (free occupant).
  function _isU5(guest) {
    return guest.type === 'child' && guest.age !== null && guest.age !== undefined && guest.age < 5;
  }

  // Meal plan human-readable label.
  const MEAL_PLAN_LABELS = {
    RO: 'Room Only (no meals)',
    BB: 'Bed & Breakfast (breakfast only)',
    HB: 'Half Board (breakfast + dinner)',
    FB: 'Full Board (all meals)',
    AI: 'All Inclusive (all meals + drinks)',
  };

  // ---------------------------------------------------------------------------
  // UNDO / REDO FOR ACCOMMODATION CONFIGURATION
  // Snapshots the full lodge-row config before each structural change.
  // ---------------------------------------------------------------------------

  function _accomSnapshot() {
    return {
      rows: Array.from(document.querySelectorAll('#lodgeItems .lodge-item')).map(row => ({
        lodgeName:    row.querySelector('[name^="lodge_name_"]')?.value || '',
        roomType:     row.querySelector('[name^="room_type_"]')?.value  || '',
        rooms:        parseInt(row.querySelector('[name^="rooms_"]')?.value)  || 1,
        nights:       parseInt(row.querySelector('[name^="nights_"]')?.value) || 1,
        mealPlan:     row.querySelector('[name^="meal_plan_"]')?.value  || 'BB',
        customDates:  row.querySelector('.lodge-custom-dates-toggle')?.checked || false,
        customCheckin:  row.querySelector('.lodge-custom-checkin')?.value  || '',
        customCheckout: row.querySelector('.lodge-custom-checkout')?.value || '',
      })),
      assignments: { ...state.roomAssignments },
      roomExtras:  JSON.parse(JSON.stringify(state.roomExtras || {})),
    };
  }

  // Call BEFORE making a structural change.  Pushes current state onto undo stack.
  function _accomPushHistory() {
    state.accomHistory.push(_accomSnapshot());
    if (state.accomHistory.length > 20) state.accomHistory.shift();
    state.accomFuture = []; // new action clears redo
    _updateUndoRedoButtons();
  }

  function _accomUndo() {
    if (state.accomHistory.length === 0) return;
    state.accomFuture.push(_accomSnapshot());
    const snap = state.accomHistory.pop();
    _restoreAccomSnapshot(snap);
    _updateUndoRedoButtons();
  }

  function _accomRedo() {
    if (state.accomFuture.length === 0) return;
    state.accomHistory.push(_accomSnapshot());
    const snap = state.accomFuture.pop();
    _restoreAccomSnapshot(snap);
    _updateUndoRedoButtons();
  }

  function _restoreAccomSnapshot(snap) {
    const container = document.getElementById('lodgeItems');
    if (!container) return;
    // Support both old array format and new {rows, assignments} format
    const rows        = Array.isArray(snap) ? snap : (snap.rows || []);
    const assignments = Array.isArray(snap) ? {}   : (snap.assignments || {});
    container.innerHTML = '';
    rows.forEach(cfg => addLodgeItem({ ...cfg, skipHistory: true, skipRender: true }));
    // Migrate legacy 2-part keys ("rowIdx:roomIdx") to 3-part ("rowIdx:0:roomIdx")
    const migratedAssignments = {};
    Object.entries(assignments).forEach(([guestId, key]) => {
      if ((key || '').split(':').length === 2) {
        const [ri, rmi] = key.split(':');
        migratedAssignments[guestId] = `${ri}:0:${rmi}`;
      } else {
        migratedAssignments[guestId] = key;
      }
    });
    state.roomAssignments = migratedAssignments;
    state.roomExtras      = JSON.parse(JSON.stringify(snap.roomExtras || {}));
    // Restore custom date fields for each row if snapshot captured them
    Array.from(container.querySelectorAll('.lodge-item')).forEach((row, i) => {
      const cfg = rows[i];
      if (!cfg) return;
      if (cfg.customDates) {
        const toggle = row.querySelector('.lodge-custom-dates-toggle');
        if (toggle) { toggle.checked = true; toggle.dispatchEvent(new Event('change')); }
        const ci = row.querySelector('.lodge-custom-checkin');
        const co = row.querySelector('.lodge-custom-checkout');
        if (ci && cfg.customCheckin)  ci.value  = cfg.customCheckin;
        if (co && cfg.customCheckout) co.value  = cfg.customCheckout;
      }
    });
    _updateLodgeRowDates();       // re-cascade dates
    _renderGuestAssignmentUI();   // renders pool panel + all room cards
    _renderAccommPricingSummary();
    _checkCapacityMismatch();
    _validateAndShowNightsSummary();
  }

  function _updateUndoRedoButtons() {
    const undoBtn  = document.getElementById('accomUndoBtn');
    const redoBtn  = document.getElementById('accomRedoBtn');
    const hintEl   = document.getElementById('accomHistoryHint');
    if (undoBtn) undoBtn.disabled = state.accomHistory.length === 0;
    if (redoBtn) redoBtn.disabled = state.accomFuture.length  === 0;
    if (hintEl)  hintEl.textContent = state.accomHistory.length > 0
      ? `${state.accomHistory.length} action${state.accomHistory.length !== 1 ? 's' : ''} in history`
      : '';
  }
  window.TRVE._accomUndo = _accomUndo;
  window.TRVE._accomRedo = _accomRedo;

  // Re-render all lodge row room cards.  Delegates to _renderGuestAssignmentUI.
  function _syncLodgeGuestAssignments() {
    _renderGuestAssignmentUI();
  }

  // ---------------------------------------------------------------------------
  // GUEST POOL & DRAG-DROP ROOM ASSIGNMENT
  // ---------------------------------------------------------------------------

  // Build / reconcile guest pool from pax counts + child ages.
  // Preserves existing room assignments for guests that still exist.
  function _syncGuestPool() {
    const { adults, children } = _getBasicPax();
    if (!state.guestPool)       state.guestPool = [];
    if (!state.roomAssignments) state.roomAssignments = {};
    const newPool = [];
    for (let i = 0; i < adults; i++) {
      newPool.push({ id: `a${i}`, type: 'adult', label: `Adult ${i + 1}` });
    }
    for (let i = 0; i < children; i++) {
      const age = (state.childAges || [])[i] ?? null;
      const ageLabel = age !== null ? ` (age ${age})` : '';
      newPool.push({ id: `c${i}`, type: 'child', age, label: `Child ${i + 1}${ageLabel}` });
    }
    // Drop assignments for guests no longer in the pool
    const valid = new Set(newPool.map(g => g.id));
    for (const gid of Object.keys(state.roomAssignments)) {
      if (!valid.has(gid)) delete state.roomAssignments[gid];
    }
    state.guestPool = newPool;
    _distCache.clear();
  }

  // ── Task 3: Room key helpers ──────────────────────────────────────────────
  // Room assignment keys include a room-type-entry index (rtIdx) so that
  // multiple room types within one lodge can each have independent rooms.
  // Format: "lodgeIdx:rtIdx:roomIdx"   (3 parts — new format)
  // Legacy: "lodgeIdx:roomIdx"         (2 parts — treated as rtIdx=0)
  function _makeRoomKey(rowIdx, rtIdx, roomIdx) {
    return `${rowIdx}:${rtIdx}:${roomIdx}`;
  }
  function _parseRoomKey(key) {
    const p = (key || '').split(':');
    if (p.length === 3) return { rowIdx: +p[0], rtIdx: +p[1], roomIdx: +p[2] };
    if (p.length === 2) return { rowIdx: +p[0], rtIdx: 0, roomIdx: +p[1] }; // legacy
    return null;
  }
  // Returns the .room-type-entry element at rtIdx within a lodge row, or null.
  function _getRoomTypeEntry(row, rtIdx) {
    return row.querySelector(`.room-type-entry[data-rt-idx="${rtIdx}"]`) || null;
  }
  // Returns all .room-type-entry elements for a lodge row, in order.
  function _getRoomTypeEntries(row) {
    return Array.from(row.querySelectorAll('.room-type-entry'));
  }
  // Read room type string for a specific entry (falls back to legacy selector).
  function _getRoomTypeForEntry(row, rtIdx) {
    const entry = _getRoomTypeEntry(row, rtIdx);
    if (entry) return entry.querySelector('[class~="room-type-select"]')?.value || entry.querySelector('[name^="room_type_"]')?.value || '';
    return row.querySelector('[name^="room_type_"]')?.value || ''; // legacy
  }
  // Read rooms count for a specific entry.
  function _getRoomsCountForEntry(row, rtIdx) {
    const entry = _getRoomTypeEntry(row, rtIdx);
    if (entry) return parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
    return parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1; // legacy
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Returns guests assigned to a specific room (supports rtIdx).
  function _getGuestsInRoom(rowIdx, rtIdx, roomIdx) {
    const newKey = _makeRoomKey(rowIdx, rtIdx, roomIdx);
    // Also match legacy 2-part keys when rtIdx=0
    const legacyKey = rtIdx === 0 ? `${rowIdx}:${roomIdx}` : null;
    return (state.guestPool || []).filter(g => {
      const k = state.roomAssignments[g.id];
      return k === newKey || (legacyKey && k === legacyKey);
    });
  }

  function _getUnassignedGuests() {
    return (state.guestPool || []).filter(g => !state.roomAssignments[g.id]);
  }

  // Returns {ok, warnings?[], error?, softWarning?, message?, suggestions?[]}
  // WARNING CLASSIFICATION:
  //   Hard errors  (error field set)       — block progression:
  //     • No adult present when children are being assigned
  //     • Adults alone exceed maxOcc
  //     • Room index out of range / guest not found
  //   Soft warnings (softWarning:true)     — alert but allow override:
  //     • Non-standard occupancy: adult + multiple children exceeding standard capacity
  //     • Capacity edge cases permitted by lodge child-sharing policy
  // rtIdx is the room-type-entry index within the lodge row (default 0).
  function _validateDrop(guestId, rowIdx, rtIdx, roomIdx) {
    // Handle 3-arg legacy calls (no rtIdx): _validateDrop(guestId, rowIdx, roomIdx)
    if (arguments.length === 3) { roomIdx = rtIdx; rtIdx = 0; }
    const row = document.querySelector(`#lodgeItems .lodge-item[data-idx="${rowIdx}"]`);
    if (!row) return { error: 'Room not found' };
    const roomType  = _getRoomTypeForEntry(row, rtIdx);
    const lodgeName = row.querySelector('[name^="lodge_name_"]')?.value || '';
    const maxOcc    = _getMaxOccupancy(roomType, lodgeName) || 2;
    const lodgePolicy = _getLodgeChildPolicy(lodgeName);
    const roomCount = _getRoomsCountForEntry(row, rtIdx);
    if (roomIdx >= roomCount) return { error: 'Room index out of range' };
    const guest = (state.guestPool || []).find(g => g.id === guestId);
    if (!guest) return { error: 'Guest not found' };

    // Current room occupants, excluding the guest being moved
    const current        = _getGuestsInRoom(rowIdx, rtIdx, roomIdx).filter(g => g.id !== guestId);
    const curAdults      = current.filter(g => g.type === 'adult').length;
    const curU5          = current.filter(g => _isU5(g)).length;
    const curOlderChild  = current.filter(g => g.type === 'child' && !_isU5(g)).length;

    const addingAdult       = guest.type === 'adult';
    const addingU5          = _isU5(guest);
    const addingOlderChild  = guest.type === 'child' && !addingU5;

    const newAdults      = curAdults     + (addingAdult      ? 1 : 0);
    const newU5          = curU5         + (addingU5         ? 1 : 0);
    const newOlderChild  = curOlderChild + (addingOlderChild ? 1 : 0);
    const newTotalChild  = newU5 + newOlderChild;

    // HARD ERROR: every room with children must have at least 1 adult (data integrity)
    if (newAdults === 0 && newTotalChild > 0) {
      return { error: 'Every room must have at least 1 adult. Assign an adult to this room first.', suggestions: [] };
    }

    // HARD ERROR: adults alone exceed room capacity — cannot be overridden by child policy
    if (newAdults > maxOcc) {
      return { error: `Adults alone exceed room capacity (${maxOcc}). Add another room or upgrade room type.`, suggestions: ['add-room', 'upgrade'] };
    }

    // Standard max-adults check (hard error if no children present, soft if family group)
    const maxAdultsPolicy = lodgePolicy.max_adults_per_room ?? 2;
    if (newAdults > maxAdultsPolicy && newTotalChild === 0) {
      return { error: `Maximum ${maxAdultsPolicy} adults per room (standard rule).`, suggestions: ['add-room', 'upgrade'] };
    }

    // Occupancy check: U5 children do NOT count against maxOcc.
    // Only adults + children aged 5+ count.
    const occupancyCount = newAdults + newOlderChild;
    if (occupancyCount > maxOcc) {
      // SOFT WARNING: capacity exceeded but may be allowed under lodge child-sharing policy
      if (lodgePolicy.child_sharing_allowed && newTotalChild > 0) {
        const roomKey = _makeRoomKey(rowIdx, rtIdx, roomIdx);
        const alreadyOverridden = !!(state.roomOverrides || {})[roomKey]?.overridden;
        return {
          softWarning: true,
          alreadyOverridden,
          message: `Room exceeds standard adult capacity (${maxOcc}) but may be allowed under child sharing policy. ` +
            `Current: ${newAdults} adult${newAdults !== 1 ? 's' : ''} + ${newTotalChild} child${newTotalChild !== 1 ? 'ren' : ''}.`,
          suggestions: ['adjust', 'override'],
          roomKey,
        };
      }
      // HARD ERROR: no child sharing policy applicable
      return { error: `Exceeds room capacity (${maxOcc}). Children under 5 don't count, but adults + older children do.`, suggestions: ['add-room', 'upgrade', 'reassign'] };
    }

    // Collect cot/high chair warnings (informational, not blocking)
    const warnings = [];
    if (newU5 > 0) {
      warnings.push(`${newU5} cot${newU5 > 1 ? 's' : ''} needed for child${newU5 > 1 ? 'ren' : ''} under 5 — confirm availability with property.`);
    }
    const under2Count = current.filter(g => g.type === 'child' && g.age !== null && g.age < 2).length
                      + (addingU5 && guest.age !== null && guest.age < 2 ? 1 : 0);
    if (under2Count > 0) {
      warnings.push(`High chair needed for child${under2Count > 1 ? 'ren' : ''} under 2 — request at booking.`);
    }

    return { ok: true, warnings };
  }

  // Assign guest to room; validates, records history, re-renders.
  // rtIdx (room-type-entry index) defaults to 0 for backward compatibility.
  // Returns true on success, false on hard error, and 'pending' when a soft-warning dialog is shown.
  function _assignGuest(guestId, rowIdx, rtIdx, roomIdx, _skipOverrideCheck) {
    if (arguments.length === 3) { roomIdx = rtIdx; rtIdx = 0; } // legacy 3-arg call
    if (!state.roomAssignments) state.roomAssignments = {};
    const v = _validateDrop(guestId, rowIdx, rtIdx, roomIdx);

    // HARD ERROR — block assignment
    if (v.error) {
      _showAssignmentError(v.error, v.suggestions || [], rowIdx, rtIdx, roomIdx);
      return false;
    }

    // SOFT WARNING — show override dialog unless already overridden for this room
    if (v.softWarning && !_skipOverrideCheck) {
      const { roomKey, message, alreadyOverridden } = v;
      if (alreadyOverridden) {
        // Room was already overridden by user — proceed silently
        _doAssign(guestId, rowIdx, rtIdx, roomIdx, roomKey);
        return true;
      }
      _showOverrideConfirmDialog(message, roomKey, (reason) => {
        const guestIds = _getGuestsInRoom(rowIdx, rtIdx, roomIdx).map(g => g.id).concat(guestId);
        _logOverride(roomKey, reason, guestIds);
        _doAssign(guestId, rowIdx, rtIdx, roomIdx, roomKey);
        toast('info', 'Override applied', 'Room configuration overridden based on lodge policy. Verify pricing.');
      });
      return 'pending';
    }

    // All clear (or override already applied)
    if (v.warnings && v.warnings.length > 0) {
      setTimeout(() => v.warnings.forEach(w => toast('info', 'Room note', w)), 100);
    }
    _doAssign(guestId, rowIdx, rtIdx, roomIdx, _makeRoomKey(rowIdx, rtIdx, roomIdx));
    return true;
  }
  window.TRVE._assignGuest = _assignGuest;

  // Internal: commit the assignment after all checks pass.
  function _doAssign(guestId, rowIdx, rtIdx, roomIdx, roomKey) {
    _accomPushHistory();
    state.roomAssignments[guestId] = roomKey || _makeRoomKey(rowIdx, rtIdx, roomIdx);
    _renderGuestAssignmentUI();
    _renderAccommPricingSummary();
    _checkCapacityMismatch();
  }

  // Return guest to the unassigned pool.
  function _unassignGuest(guestId) {
    if (!state.roomAssignments || !state.roomAssignments[guestId]) return;
    _accomPushHistory();
    delete state.roomAssignments[guestId];
    _renderGuestAssignmentUI();
    _renderAccommPricingSummary();
    _checkCapacityMismatch();
  }
  window.TRVE._unassignGuest = _unassignGuest;

  // Store per-room extras (dietary requirements, packed lunches, etc.)
  function _setRoomExtra(roomKey, field, value) {
    if (!state.roomExtras) state.roomExtras = {};
    if (!state.roomExtras[roomKey]) state.roomExtras[roomKey] = {};
    state.roomExtras[roomKey][field] = value;
  }
  window.TRVE._setRoomExtra = _setRoomExtra;

  // Auto-distribute all guests across all rooms using hotel booking logic.
  // Hotel rules enforced:
  //   • Children must always share a room with at least 1 adult (never alone).
  //   • Under-5 children do not count toward room capacity (cot only).
  //   • Maximum 2 adults per room.
  function _autoAssignGuests() {
    _syncGuestPool();
    const { adults, children } = _getBasicPax();
    const totalGuests = adults + children;
    if (totalGuests === 0) return;
    const rooms = [];
    document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, rowIdx) => {
      const lodgeName = row.querySelector('[name^="lodge_name_"]')?.value || '';
      // Iterate all room type entries within this lodge row
      const entries = _getRoomTypeEntries(row);
      if (entries.length === 0) {
        // Legacy: single room type from row-level fields
        const roomCount = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
        const roomType  = row.querySelector('[name^="room_type_"]')?.value  || '';
        const maxOcc    = _getMaxOccupancy(roomType, lodgeName) || 2;
        for (let r = 0; r < roomCount; r++) {
          rooms.push({ rowIdx, rtIdx: 0, roomIdx: r, maxOcc, key: _makeRoomKey(rowIdx, 0, r) });
        }
        return;
      }
      entries.forEach((entry, rtIdx) => {
        const roomCount = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
        const roomType  = entry.querySelector('.room-type-select')?.value || entry.querySelector('[name^="room_type_"]')?.value || '';
        const maxOcc    = _getMaxOccupancy(roomType, lodgeName) || 2;
        for (let r = 0; r < roomCount; r++) {
          rooms.push({ rowIdx, rtIdx, roomIdx: r, maxOcc, key: _makeRoomKey(rowIdx, rtIdx, r) });
        }
      });
    });
    if (rooms.length === 0) return;
    _accomPushHistory();
    state.roomAssignments = {};

    const adultGs = (state.guestPool || []).filter(g => g.type === 'adult');
    const childGs = (state.guestPool || []).filter(g => g.type === 'child');

    // --- Adults-only path: simple even distribution ---
    if (childGs.length === 0) {
      const dist = _computeDistributionCached(totalGuests, rooms.length);
      let ai = 0;
      rooms.forEach((room, r) => {
        for (let i = 0; i < dist[r] && ai < adultGs.length; i++, ai++) {
          state.roomAssignments[adultGs[ai].id] = room.key;
        }
      });
      _renderGuestAssignmentUI();
      _renderAccommPricingSummary();
      _checkCapacityMismatch();
      return;
    }

    // --- Mixed path: hotel-aware two-phase distribution ---

    // Phase 1: distribute adults evenly across rooms.
    // No per-room cap — if rooms are overcrowded the UI warning handles it.
    // Never silently drop a guest.
    const adultDist = _computeDistributionCached(adults, rooms.length);
    let ai = 0;
    rooms.forEach((room, r) => {
      for (let i = 0; i < adultDist[r] && ai < adultGs.length; i++, ai++) {
        state.roomAssignments[adultGs[ai].id] = room.key;
      }
    });

    // Phase 2: place children only into rooms that have ≥1 adult.
    // U5 children (age < 5) do NOT count toward maxOcc — they need a cot, not a bed.
    // Regular children count as 1 occupant each.
    let ci = 0;
    for (const room of rooms) {
      if (ci >= childGs.length) break;
      const roomAdults = adultGs.filter(a => state.roomAssignments[a.id] === room.key);
      if (roomAdults.length === 0) continue; // no adult in this room — skip

      while (ci < childGs.length) {
        const child = childGs[ci];
        const isUnderFive = _isU5(child);
        // Count currently occupied beds (adults + non-U5 children already placed here)
        const bedsUsed = roomAdults.length +
          childGs.filter(c => state.roomAssignments[c.id] === room.key && !_isU5(c)).length;
        const bedCost = isUnderFive ? 0 : 1; // U5 needs cot, not a bed
        if (bedsUsed + bedCost > room.maxOcc) break; // room is full for bed-occupying guests
        state.roomAssignments[child.id] = room.key;
        ci++;
      }
    }

    // Phase 3: overflow — if children still unassigned (all adult rooms at bed capacity),
    // pile them into the first adult room so no child is ever left alone.
    // An over-capacity warning will appear, prompting the user to add a room.
    if (ci < childGs.length) {
      const fallbackRoom = rooms.find(r =>
        adultGs.some(a => state.roomAssignments[a.id] === r.key)
      );
      if (fallbackRoom) {
        while (ci < childGs.length) {
          state.roomAssignments[childGs[ci].id] = fallbackRoom.key;
          ci++;
        }
      }
    }

    // Conservation assertion — every guest must be assigned; log loudly if not.
    const assignedCount = (state.guestPool || []).filter(g => state.roomAssignments[g.id]).length;
    if (assignedCount !== totalGuests) {
      console.error(`[AutoAssign] Guest count mismatch: ${assignedCount} assigned of ${totalGuests}. Missing IDs:`,
        (state.guestPool || []).filter(g => !state.roomAssignments[g.id]).map(g => g.id));
    }

    _renderGuestAssignmentUI();
    _renderAccommPricingSummary();
    _checkCapacityMismatch();
  }
  window.TRVE._autoAssignGuests = _autoAssignGuests;

  // Drag-and-drop event handlers
  function _onGuestDragStart(event, guestId) {
    event.dataTransfer.setData('guestId', guestId);
    event.dataTransfer.effectAllowed = 'move';
  }
  window.TRVE._onGuestDragStart = _onGuestDragStart;

  // rtIdx defaults to 0 for legacy calls: _onRoomDrop(event, rowIdx, roomIdx)
  function _onRoomDrop(event, rowIdx, rtIdx, roomIdx) {
    if (arguments.length === 3) { roomIdx = rtIdx; rtIdx = 0; }
    event.preventDefault();
    event.currentTarget.style.background = '';
    const guestId = event.dataTransfer.getData('guestId');
    if (guestId) _assignGuest(guestId, rowIdx, rtIdx, roomIdx);
  }
  window.TRVE._onRoomDrop = _onRoomDrop;

  function _onDropToPool(event) {
    event.preventDefault();
    const guestId = event.dataTransfer.getData('guestId');
    if (guestId) _unassignGuest(guestId);
  }
  window.TRVE._onDropToPool = _onDropToPool;

  function _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.style.background = 'rgba(34,197,94,.06)';
  }
  window.TRVE._onDragOver = _onDragOver;

  function _onDragLeave(event) {
    event.currentTarget.style.background = '';
  }
  window.TRVE._onDragLeave = _onDragLeave;

  // Show a short-lived error balloon on the room card.
  // rtIdx identifies which room-type-entry's card to annotate (defaults to 0).
  function _showAssignmentError(message, suggestions, rowIdx, rtIdx, roomIdx) {
    if (arguments.length === 4) { roomIdx = rtIdx; rtIdx = 0; } // legacy 4-arg call
    const row = document.querySelector(`#lodgeItems .lodge-item[data-idx="${rowIdx}"]`);
    if (!row) return;
    // Find the correct .room-assignment-card within the right room-type-entry
    const entry = _getRoomTypeEntry(row, rtIdx) || row;
    const card = entry.querySelectorAll('.room-assignment-card')[roomIdx];
    if (!card) return;
    let errEl = card.querySelector('.assignment-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'assignment-error';
      errEl.style.cssText = 'font-size:10px;color:var(--danger);padding:5px 10px;background:rgba(220,38,38,.07);border-top:1px solid rgba(220,38,38,.2);margin-top:4px';
      card.appendChild(errEl);
    }
    const actions = (suggestions || []).map(s => {
      if (s === 'add-room')  return `<button type="button" onclick="window.TRVE._changeRoomTypeEntryCount(this.closest('.room-type-entry'),+1)" style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;cursor:pointer;margin-top:4px">+ Add Room</button>`;
      if (s === 'upgrade')   return `<button type="button" onclick="window.TRVE._suggestRoomUpgrade(${rowIdx},${rtIdx},'',0,0)" style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;cursor:pointer;margin-top:4px">Upgrade Room Type</button>`;
      if (s === 'reassign')  return `<button type="button" onclick="window.TRVE._autoAssignGuests()" style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;cursor:pointer;margin-top:4px">Auto Reassign</button>`;
      return '';
    }).join(' ');
    errEl.innerHTML = `⚠ ${escapeHtml(message)}${actions ? `<div style="margin-top:4px">${actions}</div>` : ''}`;
    setTimeout(() => errEl?.remove(), 4000);
  }

  // Build HTML for a draggable guest chip.
  function _guestChipHTML(guest, opts = {}) {
    const { inRoom = false } = opts;
    const isAdult = guest.type === 'adult';
    const isYoung = guest.type === 'child' && guest.age !== null && guest.age < 5;
    const color   = isAdult ? 'var(--brand-green)' : 'var(--brand-gold-dark,#b45309)';
    const aIco = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="flex-shrink:0"><circle cx="5" cy="3" r="1.8" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 9.5c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    const cIco = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="flex-shrink:0"><circle cx="5" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 9.5c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    const icon   = isAdult ? aIco : cIco;
    const badge  = isYoung ? `<span style="font-size:8px;padding:1px 3px;border-radius:3px;background:var(--brand-gold,#f59e0b);color:#fff;font-weight:600;flex-shrink:0">U5</span>` : '';
    const remove = inRoom  ? `<button type="button" title="Remove from room" onclick="window.TRVE._unassignGuest('${guest.id}')" style="margin-left:2px;border:none;background:none;cursor:pointer;font-size:12px;line-height:1;color:var(--text-muted);padding:0 2px;opacity:.7">×</button>` : '';
    return `<div class="guest-chip" data-guest-id="${guest.id}" draggable="true"
      ondragstart="window.TRVE._onGuestDragStart(event,'${guest.id}')"
      style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-surface);border:1px solid var(--border);border-radius:5px;padding:3px 7px;font-size:var(--text-xs);color:${color};cursor:grab;user-select:none;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.06)">${icon}<span>${escapeHtml(guest.label)}</span>${badge}${remove}</div>`;
  }

  // Full UI render: guest pool panel above #lodgeItems + room cards in each lodge row.
  function _renderGuestAssignmentUI() {
    // Ensure guest pool panel exists immediately above #lodgeItems
    let poolPanel = document.getElementById('guestPoolPanel');
    if (!poolPanel) {
      poolPanel = document.createElement('div');
      poolPanel.id = 'guestPoolPanel';
      const lodgeItems = document.getElementById('lodgeItems');
      if (lodgeItems) lodgeItems.parentNode.insertBefore(poolPanel, lodgeItems);
    }
    const { adults, children } = _getBasicPax();
    const totalGuests = adults + children;
    if (totalGuests === 0) {
      poolPanel.innerHTML = '';
      document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, idx) => {
        const c = row.querySelector('.lodge-guest-assign-list');
        if (c) c.innerHTML = `<span style="font-size:var(--text-xs);color:var(--text-muted);font-style:italic">Set guest count in Basic Details above to assign guests to rooms.</span>`;
      });
      return;
    }
    _syncGuestPool();
    const unassigned = _getUnassignedGuests();
    const allAssigned = unassigned.length === 0;
    poolPanel.innerHTML = `
      <div style="margin-bottom:12px;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--bg-subtle);border-bottom:1px solid var(--border)">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="4" cy="3.5" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="9" cy="3.5" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M.5 12c0-2.2 1.6-4 3.5-4h5c1.9 0 3.5 1.8 3.5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Guest List</span>
          <span style="font-size:10px;color:${allAssigned ? 'var(--success)' : 'var(--danger)'}">
            ${totalGuests} guests · ${allAssigned ? 'all assigned ✓' : `${unassigned.length} unassigned`}
          </span>
          <div style="margin-left:auto">
            <button type="button" class="btn btn-xs"
              style="font-size:10px;padding:3px 12px;background:var(--brand-green);color:#fff;border:none;font-weight:600;border-radius:4px"
              onclick="window.TRVE._autoAssignGuests()">Auto Assign Rooms</button>
          </div>
        </div>
        <div id="guestPoolDropZone"
          style="padding:10px 12px;min-height:48px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;
                 background:${allAssigned ? 'var(--bg-subtle)' : 'var(--bg-main,#fff)'};
                 border-bottom:2px dashed ${allAssigned ? 'transparent' : 'var(--border)'};
                 border-radius:0 0 var(--radius-md) var(--radius-md);transition:background .15s"
          ondragover="window.TRVE._onDragOver(event)"
          ondragleave="window.TRVE._onDragLeave(event)"
          ondrop="window.TRVE._onDropToPool(event)">
          ${allAssigned
            ? `<span style="font-size:var(--text-xs);color:var(--text-muted);font-style:italic">All guests assigned ✓ — drag back here to unassign</span>`
            : unassigned.map(g => _guestChipHTML(g)).join('')}
        </div>
      </div>`;
    // Render room cards for every lodge row
    document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, rowIdx) => {
      _renderLodgeRoomCards(row, rowIdx);
      _updateRoomOccupancyBadge(row, rowIdx);
    });
  }

  // Helper: render room assignment cards for one room-type-entry.
  // container = the .lodge-guest-assign-list element inside the entry.
  function _renderRoomCardsForEntry(container, rowIdx, rtIdx, roomType, lodgeName, rooms) {
    const maxOcc      = _getMaxOccupancy(roomType, lodgeName) || 2;
    const lodgePolicy = _getLodgeChildPolicy(lodgeName);
    const { adults: totalAdults, children: totalChildren } = _getBasicPax();
    const totalGuests = totalAdults + totalChildren;
    if (totalGuests === 0 || !roomType) {
      container.innerHTML = `<span style="font-size:var(--text-xs);color:var(--text-muted);font-style:italic">${!roomType ? 'Select room type to enable guest assignment.' : 'Set guest count in Basic Details.'}</span>`;
      return 0;
    }
    let html = '';
    let assignedCount = 0;
    for (let r = 0; r < rooms; r++) {
      const roomKey   = _makeRoomKey(rowIdx, rtIdx, r);
      const guests    = _getGuestsInRoom(rowIdx, rtIdx, r);
      const nAdults   = guests.filter(g => g.type === 'adult').length;
      const nChildren = guests.filter(g => g.type === 'child').length;
      const nU5       = guests.filter(g => _isU5(g)).length;
      const n         = guests.length;
      assignedCount  += n;
      const occupancyCount = nAdults + (nChildren - nU5); // U5 don't count against capacity
      const isOverridden   = !!(state.roomOverrides || {})[roomKey]?.overridden;
      const adultOver      = nAdults > (lodgePolicy.max_adults_per_room ?? 2) && nChildren === 0;
      const adultExceedsCap = nAdults > maxOcc;
      // Hard error: adults alone bust capacity or no-child adult overflow
      const hasError       = adultExceedsCap || adultOver;
      // Soft warning: occupancy exceeded due to children (overridable)
      const softOver       = !hasError && occupancyCount > maxOcc;
      const softAllowed    = softOver && lodgePolicy.child_sharing_allowed && !isOverridden;
      const softConfirmed  = softOver && isOverridden;
      // Classic child-sharing: fits within maxOcc with child-bed-sharing math
      const childBeds      = Math.ceil(nChildren / 2);
      const sharingOk      = !softOver && nAdults >= 1 && nChildren > 0 && (nAdults + childBeds) <= maxOcc && n > maxOcc;
      const borderCol = hasError
        ? 'var(--danger)'
        : (softAllowed ? 'var(--brand-gold,#f59e0b)' : softConfirmed ? 'var(--success)' : sharingOk ? 'var(--brand-gold,#f59e0b)' : 'var(--border)');
      const badgeBg   = hasError
        ? 'var(--danger)'
        : (softAllowed ? 'var(--brand-gold,#f59e0b)' : softConfirmed ? 'var(--success)' : n > 0 ? 'var(--success)' : 'var(--bg-surface)');
      const badgeColor = n > 0 ? '#fff' : 'var(--text-muted)';
      const chipsHTML   = guests.length > 0
        ? guests.map(g => _guestChipHTML(g, { inRoom: true })).join('')
        : `<span style="font-size:var(--text-xs);color:var(--text-muted);font-style:italic">Drop guests here</span>`;
      // Hard error block
      const warningHTML = hasError ? `
        <div style="padding:7px 10px;background:rgba(220,38,38,.06);border-top:1px solid rgba(220,38,38,.2)">
          <div style="font-size:10px;color:var(--danger);font-weight:600;margin-bottom:5px">
            ${adultExceedsCap ? `Adults exceed room capacity (${maxOcc}).` : `Maximum ${lodgePolicy.max_adults_per_room ?? 2} adults per room.`} Resolve:
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px;background:var(--brand-green);color:#fff;border:none"
              onclick="window.TRVE._changeRoomTypeEntryCount(this.closest('.room-type-entry'), +1)">+ Add Room</button>
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border)"
              onclick="window.TRVE._suggestRoomUpgrade(${rowIdx},${rtIdx},'${escapeHtml(roomType)}',${n},${maxOcc})">Upgrade Room Type</button>
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border)"
              onclick="window.TRVE._autoAssignGuests()">Auto Reassign</button>
          </div>
        </div>` : '';
      // Soft warning block — overridable by user
      const softWarningHTML = softAllowed ? `
        <div style="padding:7px 10px;background:rgba(245,158,11,.06);border-top:1px solid rgba(245,158,11,.3)">
          <div style="font-size:10px;color:var(--brand-gold-dark,#b45309);font-weight:600;margin-bottom:4px">
            ⚠ Warning: This room exceeds standard occupancy but may be allowed for families.
          </div>
          <div style="font-size:10px;color:var(--text-secondary);margin-bottom:5px">
            ${nAdults} adult${nAdults !== 1 ? 's' : ''} + ${nChildren} child${nChildren !== 1 ? 'ren' : ''} in ${escapeHtml(roomType)} (max ${maxOcc}). Child-sharing policy may apply.
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border)"
              onclick="window.TRVE._changeRoomTypeEntryCount(this.closest('.room-type-entry'), +1)">Adjust Room Allocation</button>
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px;background:var(--brand-gold,#f59e0b);color:#fff;border:none;font-weight:600"
              onclick="window.TRVE._triggerRoomOverride('${escapeHtml(roomKey)}',${rowIdx},${rtIdx},${r})">Override and Proceed</button>
          </div>
        </div>` : '';
      // Soft override confirmed block
      const softConfirmedHTML = softConfirmed ? `
        <div style="padding:7px 10px;background:rgba(34,197,94,.06);border-top:1px solid rgba(34,197,94,.25)">
          <span style="font-size:10px;color:var(--success,#16a34a);font-weight:600">✓ Override applied — lodge policy confirmed.</span>
          <span style="font-size:10px;color:var(--text-muted);margin-left:4px">Verify pricing reflects child rates.</span>
        </div>` : '';
      // Classic child-sharing note (within capacity)
      const sharingHTML = sharingOk ? `
        <div style="padding:7px 10px;background:rgba(245,158,11,.06);border-top:1px solid rgba(245,158,11,.3)">
          <span style="font-size:10px;color:var(--brand-gold-dark,#b45309);font-weight:600">Child-sharing:</span>
          <span style="font-size:10px;color:var(--text-secondary)"> ${nAdults} adult + ${nChildren} children — 2 children share 1 bed ✓</span>
        </div>` : '';
      const u5InRoom     = guests.filter(g => _isU5(g));
      const under2InRoom = guests.filter(g => g.type === 'child' && g.age !== null && g.age < 2);
      const extrasHTML   = u5InRoom.length > 0 ? `
        <div style="padding:6px 10px;background:rgba(99,102,241,.05);border-top:1px solid rgba(99,102,241,.15);display:flex;flex-wrap:wrap;gap:8px">
          ${u5InRoom.length > 0 ? `<span style="font-size:10px;color:#6366f1;display:flex;align-items:center;gap:3px">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="3" width="8" height="6" rx=".8" stroke="currentColor" stroke-width="1.1"/><path d="M3 3V2a1 1 0 012 0v1" stroke="currentColor" stroke-width="1.1"/></svg>
            ${u5InRoom.length} cot${u5InRoom.length > 1 ? 's' : ''} needed
          </span>` : ''}
          ${under2InRoom.length > 0 ? `<span style="font-size:10px;color:#6366f1;display:flex;align-items:center;gap:3px">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.1"/><path d="M2 9c0-1.66 1.34-3 3-3s3 1.34 3 3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
            High chair needed
          </span>` : ''}
          <span style="font-size:9px;color:var(--text-muted);align-self:center">Confirm availability at booking</span>
        </div>` : '';
      html += `
        <div class="room-assignment-card" data-room-idx="${r}"
          style="margin-bottom:8px;border:1px solid ${borderCol};border-radius:var(--radius-md);overflow:hidden">
          <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--bg-subtle);border-bottom:1px solid ${borderCol}">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="flex-shrink:0"><rect x="1" y="2.5" width="8" height="6.5" rx=".8" stroke="currentColor" stroke-width="1.2"/><path d="M1 5h8" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 5v4" stroke="currentColor" stroke-width="1.2"/></svg>
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-secondary)">Room ${r + 1}</span>
            <span style="font-size:10px;color:var(--text-muted)">${escapeHtml(roomType)} · Max ${maxOcc}</span>
            <span style="margin-left:auto;font-size:9px;padding:1px 8px;border-radius:8px;background:${badgeBg};color:${badgeColor};font-weight:600;min-width:28px;text-align:center">${n}/${maxOcc}</span>
          </div>
          <div class="room-drop-zone"
            style="padding:8px 10px;min-height:44px;display:flex;flex-wrap:wrap;gap:5px;align-items:center;transition:background .12s"
            ondragover="window.TRVE._onDragOver(event)"
            ondragleave="window.TRVE._onDragLeave(event)"
            ondrop="window.TRVE._onRoomDrop(event, ${rowIdx}, ${rtIdx}, ${r})">
            ${chipsHTML}
          </div>
          ${warningHTML}${softWarningHTML}${softConfirmedHTML}${sharingHTML}${extrasHTML}
        </div>`;
    }
    container.innerHTML = html;
    return assignedCount;
  }

  // Trigger soft-warning override dialog from a room card button.
  function _triggerRoomOverride(roomKey, rowIdx, rtIdx, roomIdx) {
    const row = document.querySelector(`#lodgeItems .lodge-item[data-idx="${rowIdx}"]`);
    const lodgeName = row?.querySelector('[name^="lodge_name_"]')?.value || '';
    const roomType  = _getRoomTypeForEntry(row, rtIdx);
    const maxOcc    = _getMaxOccupancy(roomType, lodgeName) || 2;
    const guests    = _getGuestsInRoom(rowIdx, rtIdx, roomIdx);
    const nAdults   = guests.filter(g => g.type === 'adult').length;
    const nChildren = guests.filter(g => g.type === 'child').length;
    const message   = `Room exceeds standard adult capacity (${maxOcc}) but allowed under child sharing policy. ` +
      `Current: ${nAdults} adult${nAdults !== 1 ? 's' : ''} + ${nChildren} child${nChildren !== 1 ? 'ren' : ''} in ${roomType}.`;
    _showOverrideConfirmDialog(message, roomKey, (reason) => {
      _logOverride(roomKey, reason, guests.map(g => g.id));
      _renderGuestAssignmentUI();
      _renderAccommPricingSummary();
      _checkCapacityMismatch();
      toast('info', 'Override applied', 'Room configuration overridden based on lodge policy. Verify pricing.');
    });
  }
  window.TRVE._triggerRoomOverride = _triggerRoomOverride;

  // Render drag-drop room cards inside one lodge row.
  // Iterates all .room-type-entry elements within the row.
  function _renderLodgeRoomCards(row, rowIdx) {
    const { adults: totalAdults, children: totalChildren } = _getBasicPax();
    const totalGuests = totalAdults + totalChildren;
    const lodgeName   = row.querySelector('[name^="lodge_name_"]')?.value || '';
    const entries     = _getRoomTypeEntries(row);
    let totalAssignedInRow = 0;

    if (entries.length === 0) {
      // Legacy path: single room type from row-level fields
      const container = row.querySelector('.lodge-guest-assign-list');
      if (!container) return;
      const rooms    = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
      const roomType = row.querySelector('[name^="room_type_"]')?.value || '';
      totalAssignedInRow = _renderRoomCardsForEntry(container, rowIdx, 0, roomType, lodgeName, rooms);
    } else {
      // Multi room type path: render each entry's cards into its own container
      entries.forEach((entry, rtIdx) => {
        const container = entry.querySelector('.lodge-guest-assign-list');
        if (!container) return;
        const rooms    = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
        const roomType = entry.querySelector('.room-type-select')?.value
                      || entry.querySelector('[name^="room_type_"]')?.value || '';
        totalAssignedInRow += _renderRoomCardsForEntry(container, rowIdx, rtIdx, roomType, lodgeName, rooms);
      });
    }

    // Update the overall "assigned to lodge" footer
    const mealPlan  = row.querySelector('[name^="meal_plan_"]')?.value || 'BB';
    const rowKey    = `row-${rowIdx}`;
    const extras    = (state.roomExtras || {})[rowKey] || {};
    const showPacked = mealPlan === 'HB' || mealPlan === 'FB';
    const footerColor = totalAssignedInRow === totalGuests ? 'var(--text-muted)' : 'var(--text-secondary)';
    const footerEl = row.querySelector('.lodge-assignment-footer');
    if (footerEl) {
      footerEl.style.color = footerColor;
      footerEl.querySelector('.assigned-count')
        && (footerEl.querySelector('.assigned-count').textContent = totalAssignedInRow);
    }

    // Render dietary / special requirements block (in overall container below entries)
    const reqContainer = row.querySelector('.lodge-special-requirements');
    if (reqContainer) {
      reqContainer.innerHTML = `
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Special Requirements</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div>
            <label style="font-size:10px;color:var(--text-secondary);display:block;margin-bottom:3px">Dietary requirements / allergies</label>
            <input type="text" class="form-control" placeholder="e.g. vegetarian, halal, nut allergy"
              style="font-size:var(--text-xs);height:28px"
              value="${escapeHtml(extras.dietary || '')}"
              oninput="window.TRVE._setRoomExtra('${rowKey}', 'dietary', this.value)">
          </div>
          ${showPacked ? `
          <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-secondary);cursor:pointer">
            <input type="checkbox" ${extras.packedLunch ? 'checked' : ''}
              onchange="window.TRVE._setRoomExtra('${rowKey}', 'packedLunch', this.checked)"
              style="width:13px;height:13px">
            Request packed lunch on excursion days (${MEAL_PLAN_LABELS[mealPlan] || mealPlan})
          </label>` : ''}
        </div>`;
    }
  }

  function _confirmChildSharing(roomKey, confirmed) {
    if (!state.childSharingConfirmed) state.childSharingConfirmed = {};
    state.childSharingConfirmed[roomKey] = confirmed;
    _syncLodgeGuestAssignments();
    _checkCapacityMismatch();
  }
  window.TRVE._confirmChildSharing = _confirmChildSharing;

  function _toggleGuestSubRoom(guestIdx, roomIdx, subRoom, checked) {
    if (state.guestRecords[guestIdx]) {
      if (checked) {
        state.guestRecords[guestIdx].room_idx  = roomIdx;
        state.guestRecords[guestIdx].sub_room  = subRoom;
      } else {
        state.guestRecords[guestIdx].room_idx  = null;
        state.guestRecords[guestIdx].sub_room  = null;
      }
    }
    renderGuestRoster();
    _syncLodgeGuestAssignments();
  }
  window.TRVE._toggleGuestSubRoom = _toggleGuestSubRoom;

  // ---------------------------------------------------------------------------
  // STAFF ROOM SYSTEM
  // ---------------------------------------------------------------------------
  const STAFF_ROLES = [
    { value: 'driver',  label: 'Driver'  },
    { value: 'guide',   label: 'Guide'   },
    { value: 'tracker', label: 'Tracker' },
    { value: 'porter',  label: 'Porter'  },
    { value: 'other',   label: 'Other'   },
  ];

  const STAFF_PRICING_OPTIONS = [
    { value: 'operating', label: 'Included in tour operating costs' },
    { value: 'company',   label: 'Paid by company separately'       },
    { value: 'guest',     label: 'Charged to guest itinerary'       },
  ];

  function addStaffRoomItem() {
    const container = document.getElementById('staffRoomItems');
    const section   = document.getElementById('staffAccomSection');
    if (!container || !section) return;
    section.style.display = '';  // show the staff section

    state._staffRoomSeq++;
    const sidx = state._staffRoomSeq;

    const lodgeOptions = state.lodges.length > 0
      ? '<option value="">— Same lodge / no preference —</option>' +
        state.lodges.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')
      : '<option value="">— No lodges in database —</option>';

    const tripDays  = parseInt(document.getElementById('pricingDays')?.value) || 0;
    const startDateVal = document.getElementById('pricingTravelStartDate')?.value || '';
    const endDateVal   = document.getElementById('pricingTravelEndDate')?.value   || '';
    let autoNights;
    if (startDateVal && endDateVal) {
      const diff = Math.round((new Date(endDateVal) - new Date(startDateVal)) / 86400000);
      autoNights = Math.max(1, diff);
    } else if (tripDays > 0) {
      autoNights = Math.max(1, tripDays - 1);
    } else {
      autoNights = 1;
    }

    const el = document.createElement('div');
    el.className  = 'lodge-item staff-room-item';
    el.dataset.staffIdx = sidx;
    el.innerHTML = `
      <div class="lodge-item-body" style="border-left:3px solid var(--brand-gold-dark,#b45309)">

        <!-- Header row -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M1 12c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <span style="font-size:var(--text-xs);font-weight:700;color:var(--brand-gold-dark,#b45309);text-transform:uppercase;letter-spacing:.05em">Staff Room</span>
        </div>

        <!-- Role + Occupant name -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Staff Role <span style="color:var(--danger)">*</span></label>
            <select class="form-control" name="sr_role_${sidx}" style="font-size:var(--text-xs)">
              ${STAFF_ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Occupant Name</label>
            <input type="text" class="form-control" name="sr_occupant_${sidx}" placeholder="e.g. John (optional)" style="font-size:var(--text-xs)">
          </div>
        </div>

        <!-- Lodge + Room type -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Lodge (optional)</label>
            <select class="form-control" name="sr_lodge_${sidx}" style="font-size:var(--text-xs)">
              ${lodgeOptions}
            </select>
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Room Type</label>
            <input type="text" class="form-control" name="sr_room_type_${sidx}"
              placeholder="e.g. Staff Single, Budget Room" value="Staff Single" style="font-size:var(--text-xs)">
          </div>
        </div>

        <!-- Nights + Meal plan + Rate -->
        <div style="display:grid;grid-template-columns:80px 1fr 120px;gap:10px;margin-bottom:10px;align-items:end">
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Nights</label>
            <input type="number" class="form-control" name="sr_nights_${sidx}" min="1" value="${autoNights}"
              style="font-size:var(--text-sm);font-weight:600;text-align:center">
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Meal Plan</label>
            <select class="form-control" name="sr_meal_${sidx}" style="font-size:var(--text-xs)">
              <option value="none">None</option>
              <option value="staff">Staff meal plan</option>
              <option value="BB">BB — Bed &amp; Breakfast</option>
              <option value="FB">FB — Full Board</option>
            </select>
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Rate (USD/night)</label>
            <input type="number" class="form-control" name="sr_rate_${sidx}" min="0" value="50"
              style="font-size:var(--text-sm);font-weight:600;text-align:right"
              placeholder="e.g. 50">
          </div>
        </div>

        <!-- Nightly total preview -->
        <div class="sr-total-preview" style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:10px">
          Total: <strong class="sr-calc-total">$${autoNights * 50}</strong>
          <span style="font-size:9px">(${autoNights} nights × $50/night)</span>
        </div>

        <!-- Pricing option -->
        <div style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Cost Allocation</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${STAFF_PRICING_OPTIONS.map((opt, i) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-xs);cursor:pointer">
                <input type="radio" name="sr_pricing_${sidx}" value="${opt.value}" ${i === 0 ? 'checked' : ''}
                  style="width:13px;height:13px;cursor:pointer">
                ${opt.label}
              </label>`).join('')}
          </div>
        </div>

        <!-- Rate source (populated when lodge selected) -->
        <div class="sr-rate-source" style="display:none;font-size:10px;color:var(--text-muted);margin-top:6px"></div>

      </div>
      <button type="button" class="btn btn-ghost btn-icon"
        onclick="window.TRVE._removeStaffRoom(this.closest('.staff-room-item'))" title="Remove staff room">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);

    // Wire nights + rate → update total preview
    const nightsInp = el.querySelector(`[name^="sr_nights_"]`);
    const rateInp   = el.querySelector(`[name^="sr_rate_"]`);
    const totalEl   = el.querySelector('.sr-calc-total');
    const previewEl = el.querySelector('.sr-total-preview span');
    function updateStaffTotal() {
      const n = parseInt(nightsInp?.value) || 0;
      const r = parseFloat(rateInp?.value) || 0;
      if (totalEl)   totalEl.textContent  = `$${(n * r).toFixed(0)}`;
      if (previewEl) previewEl.textContent = `(${n} nights × $${r}/night)`;
      _renderAccommPricingSummary();
    }
    nightsInp?.addEventListener('input', updateStaffTotal);
    rateInp?.addEventListener('input', updateStaffTotal);

    // Wire lodge → try to auto-fill rate from lodge data
    const lodgeSel = el.querySelector(`[name^="sr_lodge_"]`);
    const rateSourceEl = el.querySelector('.sr-rate-source');
    lodgeSel?.addEventListener('change', function() {
      const lodgeName = this.value;
      if (!lodgeName) { if (rateSourceEl) rateSourceEl.style.display = 'none'; return; }
      const lodgeData = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
      if (lodgeData && lodgeData.room_types) {
        // Try to find a staff/single/budget rate
        const staffRt = lodgeData.room_types.find(rt =>
          /staff|single|budget/i.test(rt.room_type)
        ) || lodgeData.room_types[0];
        if (staffRt && staffRt.net_rate_usd && rateInp) {
          rateInp.value = staffRt.net_rate_usd;
          updateStaffTotal();
          if (rateSourceEl) {
            rateSourceEl.style.display = '';
            const src = staffRt.source_email_date || 'Lodge database';
            rateSourceEl.textContent = `Rate auto-filled from ${escapeHtml(staffRt.room_type)} · Source: ${escapeHtml(src)}`;
          }
        }
      }
    });

    _renderAccommPricingSummary();
  }

  function _removeStaffRoom(el) {
    el.remove();
    const container = document.getElementById('staffRoomItems');
    const section   = document.getElementById('staffAccomSection');
    if (container && section && container.children.length === 0) {
      section.style.display = 'none';
    }
    _renderAccommPricingSummary();
  }
  window.TRVE._removeStaffRoom  = _removeStaffRoom;
  window.TRVE.addStaffRoomItem  = addStaffRoomItem;

  // Return the best rate record for a room type, preferring one that matches the selected meal plan.
  function _findBestRate(roomTypes, roomType, mealPlan) {
    const allForRoom = roomTypes.filter(r => r.room_type === roomType);
    if (allForRoom.length === 0) return null;
    if (mealPlan) {
      const normalizeMP = mp => {
        const s = (mp || '').toLowerCase();
        if (s.includes('all incl'))              return 'AI';
        if (s === 'fb' || s.includes('full'))    return 'FB';
        if (s === 'hb' || s.includes('half'))    return 'HB';
        if (s === 'bb' || s.includes('bed'))     return 'BB';
        if (s === 'ro' || s.includes('room only')) return 'RO';
        return null;
      };
      const match = allForRoom.find(r => normalizeMP(r.meal_plan) === mealPlan);
      if (match) return match;
    }
    return allForRoom[0];
  }

  // Accommodation pricing summary — age-banded per-guest pricing (Sections 3-6 of booking logic spec).
  function _renderAccommPricingSummary() {
    const panel = document.getElementById('accomPricingSummary');
    if (!panel) return;

    const { adults: globalAdults, children: globalChildren } = _getBasicPax();

    // Build per-lodge-row breakdown using age-banded child pricing
    let guestTotal  = 0;
    let rowsHTML    = '';

    document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, rowIdx) => {
      const lodge    = row.querySelector('[name^="lodge_name_"]')?.value;
      if (!lodge) return;
      const nights   = parseInt(row.querySelector('[name^="nights_"]')?.value) || 1;
      const mealPlan = row.querySelector('[name^="meal_plan_"]')?.value        || 'BB';
      const lodgeData = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodge);
      const entries   = _getRoomTypeEntries(row);

      // Build a list of {roomType, rooms, rate} items to price — one per room-type-entry
      const priceItems = [];
      if (entries.length === 0) {
        // Legacy: single room type from row-level fields
        const rooms    = parseInt(row.querySelector('[name^="rooms_"]')?.value)  || 1;
        const roomType = row.querySelector('[name^="room_type_"]')?.value        || '';
        const rt = _findBestRate(lodgeData?.room_types || [], roomType, mealPlan)
                || (lodgeData?.room_types || [])[0];
        const rate = rt?.net_rate_usd || 0;
        if (rate > 0) priceItems.push({ roomType, rooms, rate, rateMealPlan: rt?.meal_plan || '' });
      } else {
        entries.forEach(entry => {
          const rooms    = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
          const roomType = entry.querySelector('.room-type-select')?.value || entry.querySelector('[name^="room_type_"]')?.value || '';
          const rt = _findBestRate(lodgeData?.room_types || [], roomType, mealPlan)
                  || (lodgeData?.room_types || [])[0];
          const rate = rt?.net_rate_usd || 0;
          if (rate > 0) priceItems.push({ roomType, rooms, rate, rateMealPlan: rt?.meal_plan || '' });
        });
      }
      if (priceItems.length === 0) return;

      const mealLabel = MEAL_PLAN_LABELS[mealPlan] || mealPlan;
      const isRO = mealPlan === 'RO';

      // Meal plan hierarchy: only charge a surcharge when the booking requests a more
      // inclusive plan than what the lodge rate already includes. Safari lodge rates
      // are typically quoted inclusive of their stated meal plan (HB, FB, etc.),
      // so selecting the matching plan should never add an extra per-person charge.
      const MEAL_RANK           = { RO: 0, BB: 1, HB: 2, FB: 3, AI: 4 };
      const MEAL_SURCHARGE_RATES = { BB: 0, HB: 35, FB: 65, AI: 85 };
      const dominantRatePlan = (() => {
        const s = (priceItems[0]?.rateMealPlan || '').toLowerCase();
        if (s.includes('all incl'))              return 'AI';
        if (s === 'fb' || s.includes('full'))    return 'FB';
        if (s === 'hb' || s.includes('half'))    return 'HB';
        if (s === 'bb' || s.includes('bed'))     return 'BB';
        if (s === 'ro' || s.includes('room only')) return 'RO';
        return 'BB';
      })();
      const rateRank    = MEAL_RANK[dominantRatePlan] ?? 1;
      const bookingRank = MEAL_RANK[mealPlan]         ?? 1;
      // Surcharge = difference between plans; zero when rate already covers the plan
      const adultMealCost = bookingRank > rateRank
        ? (MEAL_SURCHARGE_RATES[mealPlan] || 0) - (MEAL_SURCHARGE_RATES[dominantRatePlan] || 0)
        : 0;

      // Age-banded child costs — room rate + meal supplement split by age tier
      const lodgePolicy = _getLodgeChildPolicy(lodge);
      let childLinesHTML = '';
      let childMealTotal = 0;
      const childGuests = (state.guestPool || []).filter(g => g.type === 'child');
      if (childGuests.length > 0) {
        const tierGroups = {};
        childGuests.forEach(g => {
          const tier = _getChildMealTier(g.age, lodgePolicy);
          const key  = tier.label;
          if (!tierGroups[key]) tierGroups[key] = { tier, count: 0 };
          tierGroups[key].count++;
        });
        Object.values(tierGroups).forEach(({ tier, count }) => {
          // Room is already covered by the adult room rate lines above — children
          // sharing a room do not pay room cost again. They pay only a meal
          // supplement at their tier rate, and only when the rate does not already
          // include the selected meal plan (adultMealCost > 0 after Fix 1).
          const mealPerNight = tier.free ? 0 : adultMealCost * tier.multiplier;
          const mealSub      = nights * count * mealPerNight;
          childMealTotal    += mealSub;
          const total        = mealSub;
          const confirmMark  = tier.confirmNeeded ? ' <span style="color:var(--brand-gold,#f59e0b)">⚑ confirm</span>' : '';
          const pricingDetail = tier.free
            ? 'FREE (cot only)'
            : mealPerNight > 0
              ? `$${mealPerNight.toFixed(2)}/night meal supplement`
              : 'Included — sharing with adult';
          childLinesHTML += `
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);padding-left:12px">
              <span>Children ×${count} — ${tier.label}${confirmMark} (${pricingDetail})</span>
              <span style="font-family:var(--font-mono)">${tier.free ? 'FREE' : total > 0 ? fmtMoney(total) : 'Included'}</span>
            </div>`;
        });
      }

      // Room accommodation cost: sum across all room-type-entries
      let roomCostLines = '';
      let roomCost = 0;
      priceItems.forEach(item => {
        const itemCost = item.rooms * nights * item.rate;
        roomCost += itemCost;
        roomCostLines += `
          <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:2px">
            <span>${escapeHtml(item.roomType || 'Standard')} × ${item.rooms} room${item.rooms !== 1 ? 's' : ''} (${item.rooms} × ${nights}n × ${fmtMoney(item.rate)})</span>
            <span style="font-family:var(--font-mono)">${fmtMoney(itemCost)}</span>
          </div>`;
      });

      // Adult meal supplement (if not RO)
      const adultMealTotal = isRO ? 0 : nights * globalAdults * adultMealCost;
      const rowTotal  = roomCost + adultMealTotal + childMealTotal;
      guestTotal     += rowTotal;

      // Cot requirements across all rooms
      const u5Total    = (state.guestPool || []).filter(g => _isU5(g)).length;
      const under2Total = (state.guestPool || []).filter(g => g.type === 'child' && g.age !== null && g.age < 2).length;

      // Check for any active overrides in this lodge row
      const hasOverride = Object.values(state.roomOverrides || {}).some(o => o.overridden);

      // Summary label for the lodge header
      const totalRooms = priceItems.reduce((s, i) => s + i.rooms, 0);
      const rtSummary  = priceItems.map(i => `${escapeHtml(i.roomType || 'Standard')}×${i.rooms}`).join(' + ');

      rowsHTML += `
        <div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-secondary);margin-bottom:4px">
            ${escapeHtml(lodge)} — ${rtSummary} (${totalRooms} room${totalRooms !== 1 ? 's' : ''} total)
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">
            ${mealLabel} · ${nights} night${nights !== 1 ? 's' : ''}
          </div>
          ${roomCostLines}
          ${!isRO && adultMealTotal > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:2px;padding-left:12px">
            <span>Adults ×${globalAdults} meal plan — $${adultMealCost}/pax/night</span>
            <span style="font-family:var(--font-mono)">${fmtMoney(adultMealTotal)}</span>
          </div>` : ''}
          ${childLinesHTML}
          ${u5Total > 0 ? `<div style="font-size:10px;color:#6366f1;margin-top:3px">⊕ ${u5Total} cot${u5Total > 1 ? 's' : ''} required${under2Total > 0 ? ` · ${under2Total} high chair${under2Total > 1 ? 's' : ''}` : ''} — confirm with property</div>` : ''}
          ${hasOverride ? `<div style="font-size:10px;color:var(--brand-gold-dark,#b45309);margin-top:3px">⚑ Override active — lodge child-sharing policy applied. Verify pricing impact.</div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);font-weight:700;margin-top:4px">
            <span>Row subtotal</span>
            <span style="font-family:var(--font-mono)">${fmtMoney(rowTotal)}</span>
          </div>
        </div>`;
    });

    // Staff rooms
    let staffGuestTotal = 0, staffOpTotal = 0, staffCoTotal = 0;
    document.querySelectorAll('#staffRoomItems .staff-room-item').forEach(el => {
      const nights  = parseInt(el.querySelector('[name^="sr_nights_"]')?.value)  || 0;
      const rate    = parseFloat(el.querySelector('[name^="sr_rate_"]')?.value)  || 0;
      const pricing = el.querySelector('[name^="sr_pricing_"]:checked')?.value   || 'operating';
      const sub     = nights * rate;
      if (pricing === 'guest')        staffGuestTotal += sub;
      else if (pricing === 'company') staffCoTotal    += sub;
      else                            staffOpTotal    += sub;
    });

    const grandTotal = guestTotal + staffGuestTotal;
    if (guestTotal === 0 && staffGuestTotal === 0 && staffOpTotal === 0 && staffCoTotal === 0) {
      panel.style.display = 'none'; return;
    }
    panel.style.display = '';

    // ── Store base cost and compute final (adjusted) cost ─────────────────────
    state.accommodation.base_cost  = grandTotal;
    state.accommodation.final_cost = computeAdjustedAccommodationCost(grandTotal, state.accommodation.adjustment);
    const adj       = state.accommodation.adjustment;
    const finalCost = state.accommodation.final_cost;
    const hasAdj    = !!adj.type;
    const diff      = finalCost - grandTotal;  // negative = discount, positive = addition

    // ── Adjustment type labels ─────────────────────────────────────────────────
    const adjTypeLabel = { override: 'Override', discount: 'Discount', manual_add: 'Manual Add' };

    // ── Diff display: show signed delta ───────────────────────────────────────
    const diffDisplay = diff === 0 ? '' : (diff > 0
      ? `<span style="color:var(--danger,#ef4444);font-family:var(--font-mono)">+${fmtMoney(diff)}</span>`
      : `<span style="color:var(--brand-green,#22c55e);font-family:var(--font-mono)">${fmtMoney(diff)}</span>`);

    // ── Audit log HTML (last 5 entries) ───────────────────────────────────────
    const logEntries = (state.accommodation.adjustmentLog || []).slice(-5).reverse();
    const logHTML = logEntries.length === 0 ? '' : `
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px">Adjustment History (last 5)</div>
        ${logEntries.map(e => `
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;display:flex;justify-content:space-between;gap:8px">
            <span>${e.type === 'reset' ? '↩ Reset' : `${adjTypeLabel[e.type] || e.type}: ${fmtMoney(e.value)}`} — <em>${escapeHtml(e.reason)}</em></span>
            <span style="white-space:nowrap;font-family:var(--font-mono)">${new Date(e.timestamp).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
          </div>`).join('')}
      </div>`;

    // ── Inline error placeholder ───────────────────────────────────────────────
    const adjUndoDisabled = state.accommodation.adjustmentHistory.length === 0 ? 'disabled' : '';
    const adjRedoDisabled = state.accommodation.adjustmentFuture.length  === 0 ? 'disabled' : '';

    panel.innerHTML = `
      <div style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;margin-top:var(--space-3)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Accommodation Cost Preview</div>
          <button type="button" onclick="window.TRVE._toggleAccomEditPanel()" style="font-size:10px;padding:2px 8px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;color:var(--text-secondary)">
            ✏ Edit Cost
          </button>
        </div>
        ${rowsHTML}
        ${staffGuestTotal > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px;color:var(--brand-gold-dark,#b45309)">
          <span>Staff rooms (on guest invoice)</span>
          <strong style="font-family:var(--font-mono)">${fmtMoney(staffGuestTotal)}</strong>
        </div>` : ''}
        ${staffOpTotal > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px;color:var(--text-muted)">
          <span>Staff rooms (operating cost)</span>
          <span style="font-family:var(--font-mono)">${fmtMoney(staffOpTotal)}</span>
        </div>` : ''}
        ${staffCoTotal > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px;color:var(--text-muted)">
          <span>Staff rooms (company paid)</span>
          <span style="font-family:var(--font-mono)">${fmtMoney(staffCoTotal)}</span>
        </div>` : ''}

        <!-- Calculated cost row -->
        <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);font-weight:700;border-top:1px solid var(--border);padding-top:6px;margin-top:4px">
          <span>Calculated cost (guest invoice)</span>
          <span style="font-family:var(--font-mono);color:${hasAdj ? 'var(--text-muted)' : 'var(--brand-green)'};${hasAdj ? 'text-decoration:line-through' : ''}">${fmtMoney(grandTotal)}</span>
        </div>

        <!-- Adjusted cost row (visible only when adjustment active) -->
        ${hasAdj ? `
        <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);font-weight:700;padding-top:3px;color:var(--brand-gold-dark,#b45309)">
          <span style="display:flex;align-items:center;gap:6px">
            <span style="background:var(--brand-gold,#f59e0b);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase;letter-spacing:.04em">${adjTypeLabel[adj.type] || adj.type}</span>
            Adjusted cost
          </span>
          <span style="font-family:var(--font-mono);color:var(--brand-green)">${fmtMoney(finalCost)}</span>
        </div>
        <!-- Difference row -->
        <div style="display:flex;justify-content:space-between;font-size:10px;padding-top:2px;color:var(--text-muted)">
          <span>Difference from calculated</span>
          <span>${diffDisplay}</span>
        </div>
        <!-- Reason row -->
        <div style="font-size:9px;color:var(--text-muted);font-style:italic;margin-top:2px">Reason: ${escapeHtml(adj.reason)}</div>
        ` : ''}

        ${staffOpTotal + staffCoTotal > 0 ? `
        <div style="font-size:9px;color:var(--text-muted);margin-top:4px">+${fmtMoney(staffOpTotal + staffCoTotal)} in operational staff costs (not invoiced to guest)</div>` : ''}

        <!-- ── Edit Adjustment Panel ─────────────────────────────────────────── -->
        <div id="accomAdjustPanel" style="display:none;margin-top:12px;padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
            <span>Edit Accommodation Cost</span>
            <span style="display:flex;gap:4px">
              <button type="button" onclick="window.TRVE._undoAccomAdjustment()" ${adjUndoDisabled} title="Undo" style="font-size:10px;padding:1px 6px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text-secondary)" ${adjUndoDisabled ? 'style="opacity:.45;cursor:not-allowed"' : ''}>↩ Undo</button>
              <button type="button" onclick="window.TRVE._redoAccomAdjustment()" ${adjRedoDisabled} title="Redo" style="font-size:10px;padding:1px 6px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text-secondary)" ${adjRedoDisabled ? 'style="opacity:.45;cursor:not-allowed"' : ''}>↪ Redo</button>
            </span>
          </div>

          <!-- Adjustment type -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px">Adjustment Type</label>
              <select id="accomAdjType" style="width:100%;font-size:var(--text-xs);padding:4px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card)">
                <option value="">— Select type —</option>
                <option value="override"   ${adj.type === 'override'   ? 'selected' : ''}>Override (set final amount)</option>
                <option value="discount"   ${adj.type === 'discount'   ? 'selected' : ''}>Discount (reduce by amount)</option>
                <option value="manual_add" ${adj.type === 'manual_add' ? 'selected' : ''}>Manual Add (increase by amount)</option>
              </select>
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px">Value (USD)</label>
              <input id="accomAdjValue" type="number" min="0" step="0.01"
                value="${adj.value || ''}"
                placeholder="0.00"
                style="width:100%;font-size:var(--text-xs);padding:4px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card);font-family:var(--font-mono)">
            </div>
          </div>

          <!-- Reason -->
          <div style="margin-bottom:8px">
            <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px">Reason <span style="color:var(--danger,#ef4444)">*</span></label>
            <input id="accomAdjReason" type="text" maxlength="200"
              value="${escapeHtml(adj.reason || '')}"
              placeholder="e.g. Negotiated group discount, early-bird rate, correction…"
              style="width:100%;font-size:var(--text-xs);padding:4px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-card)">
          </div>

          <!-- Inline validation message -->
          <div id="accomAdjError" style="font-size:10px;color:var(--danger,#ef4444);margin-bottom:6px;display:none"></div>

          <!-- Live preview of what the result will be -->
          <div id="accomAdjPreview" style="font-size:10px;color:var(--text-muted);margin-bottom:8px;padding:4px 6px;background:var(--bg-subtle);border-radius:3px;font-family:var(--font-mono)">
            Calculated: ${fmtMoney(grandTotal)} → Final: ${fmtMoney(finalCost)}
          </div>

          <!-- Actions -->
          <div style="display:flex;gap:6px">
            <button type="button" onclick="(function(){
              const t=document.getElementById('accomAdjType')?.value;
              const v=document.getElementById('accomAdjValue')?.value;
              const r=document.getElementById('accomAdjReason')?.value;
              const err=document.getElementById('accomAdjError');
              const errMsg=window.TRVE._validateAccomAdj(t,v,r);
              if(errMsg){if(err){err.textContent=errMsg;err.style.display='block';}return;}
              if(err)err.style.display='none';
              window.TRVE._applyAccomAdjustment(t,v,r);
            })()"
              style="flex:1;font-size:var(--text-xs);padding:5px 10px;background:var(--brand-green,#22c55e);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer;font-weight:600">
              ✓ Apply Adjustment
            </button>
            ${hasAdj ? `
            <button type="button" onclick="window.TRVE._resetAccomAdjustment()"
              style="font-size:var(--text-xs);padding:5px 10px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;color:var(--danger,#ef4444)">
              ✕ Reset to Calculated
            </button>` : ''}
          </div>

          ${logHTML}
        </div>
        <!-- ── End Edit Panel ──────────────────────────────────────────────────── -->
      </div>`;
  }

  // ── ACCOMMODATION COST ADJUSTMENT ENGINE ───────────────────────────────────

  /**
   * Pure computation: applies an adjustment to a base accommodation cost.
   * Types: 'override' (set final = value), 'discount' (base − value), 'manual_add' (base + value)
   * Guardrail: final cost is clamped to 0 minimum.
   */
  function computeAdjustedAccommodationCost(base, adjustment) {
    if (!adjustment || !adjustment.type) return base;
    const val = parseFloat(adjustment.value) || 0;
    let final;
    if (adjustment.type === 'override')    final = val;
    else if (adjustment.type === 'discount')    final = base - val;
    else if (adjustment.type === 'manual_add')  final = base + val;
    else return base;
    return final < 0 ? 0 : final;
  }

  /** Validate an adjustment form submission. Returns error string or null. */
  function _validateAccomAdjustment(type, value, reason) {
    if (!type) return 'Select an adjustment type.';
    const val = parseFloat(value);
    if (isNaN(val) || value === '') return 'Enter a numeric value.';
    if (val < 0) return 'Value must be 0 or greater.';
    if (!reason || !reason.trim()) return 'A reason is required.';
    if (type === 'override' && val === 0) return 'Override to $0 — confirm this is intentional by entering a reason.';
    return null;
  }

  /** Apply a new adjustment, write audit log entry, update state, re-render. */
  function _applyAccomAdjustment(type, value, reason) {
    const errMsg = _validateAccomAdjustment(type, value, reason);
    if (errMsg) { toast('error', 'Invalid adjustment', errMsg); return; }

    const accom = state.accommodation;
    const prevAdj   = { ...accom.adjustment };
    const prevFinal = accom.final_cost;

    // Push to undo stack before mutating
    accom.adjustmentHistory.push({ adjustment: prevAdj, final_cost: prevFinal });
    if (accom.adjustmentHistory.length > 30) accom.adjustmentHistory.shift();
    accom.adjustmentFuture = [];

    accom.adjustment = { type, value: parseFloat(value), reason: reason.trim() };
    accom.final_cost = computeAdjustedAccommodationCost(accom.base_cost, accom.adjustment);

    // Audit log entry
    accom.adjustmentLog.push({
      type, value: parseFloat(value), reason: reason.trim(),
      user: state.coordinator || 'Unknown',
      timestamp: new Date().toISOString(),
      prevFinal,
      newFinal: accom.final_cost,
    });

    _persistAccomAdjustment();
    _renderAccommPricingSummary();
    toast('success', 'Adjustment applied', `Final cost: ${fmtMoney(accom.final_cost)}`);
  }

  /** Clear the current adjustment, restore base cost. */
  function _resetAccomAdjustment() {
    const accom = state.accommodation;
    if (!accom.adjustment.type) return;

    const prevAdj   = { ...accom.adjustment };
    const prevFinal = accom.final_cost;

    accom.adjustmentHistory.push({ adjustment: prevAdj, final_cost: prevFinal });
    if (accom.adjustmentHistory.length > 30) accom.adjustmentHistory.shift();
    accom.adjustmentFuture = [];

    accom.adjustment = { type: null, value: 0, reason: '' };
    accom.final_cost = accom.base_cost;

    accom.adjustmentLog.push({
      type: 'reset', value: 0, reason: 'Adjustment cleared',
      user: state.coordinator || 'Unknown',
      timestamp: new Date().toISOString(),
      prevFinal,
      newFinal: accom.final_cost,
    });

    _persistAccomAdjustment();
    _renderAccommPricingSummary();
    toast('info', 'Adjustment removed', 'Cost reset to calculated value.');
  }

  /** Undo last adjustment change. */
  function _undoAccomAdjustment() {
    const accom = state.accommodation;
    if (accom.adjustmentHistory.length === 0) return;
    accom.adjustmentFuture.push({ adjustment: { ...accom.adjustment }, final_cost: accom.final_cost });
    const prev = accom.adjustmentHistory.pop();
    accom.adjustment = { ...prev.adjustment };
    accom.final_cost = computeAdjustedAccommodationCost(accom.base_cost, accom.adjustment);
    _persistAccomAdjustment();
    _renderAccommPricingSummary();
  }

  /** Redo last undone adjustment. */
  function _redoAccomAdjustment() {
    const accom = state.accommodation;
    if (accom.adjustmentFuture.length === 0) return;
    accom.adjustmentHistory.push({ adjustment: { ...accom.adjustment }, final_cost: accom.final_cost });
    const next = accom.adjustmentFuture.pop();
    accom.adjustment = { ...next.adjustment };
    accom.final_cost = computeAdjustedAccommodationCost(accom.base_cost, accom.adjustment);
    _persistAccomAdjustment();
    _renderAccommPricingSummary();
  }

  /** Persist adjustment to localStorage. */
  function _persistAccomAdjustment() {
    try {
      const data = {
        adjustment: state.accommodation.adjustment,
        adjustmentLog: state.accommodation.adjustmentLog,
      };
      localStorage.setItem('trve_accom_adjustment', JSON.stringify(data));
    } catch (_) { /* storage unavailable — silent */ }
  }

  /** Restore adjustment from localStorage on page load. */
  function _restoreAccomAdjustment() {
    try {
      const raw = localStorage.getItem('trve_accom_adjustment');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.adjustment) {
        state.accommodation.adjustment = data.adjustment;
        state.accommodation.adjustmentLog = data.adjustmentLog || [];
      }
    } catch (_) { /* corrupt storage — ignore */ }
  }

  window.TRVE._applyAccomAdjustment  = _applyAccomAdjustment;
  window.TRVE._resetAccomAdjustment  = _resetAccomAdjustment;
  window.TRVE._undoAccomAdjustment   = _undoAccomAdjustment;
  window.TRVE._redoAccomAdjustment   = _redoAccomAdjustment;
  window.TRVE._validateAccomAdj      = _validateAccomAdjustment;
  window.TRVE._toggleAccomEditPanel  = function() {
    const panel = document.getElementById('accomAdjustPanel');
    if (!panel) return;
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = isHidden ? 'block' : 'none';
    if (!isHidden) return;
    // Wire live preview on inputs when opening
    const typeEl  = document.getElementById('accomAdjType');
    const valueEl = document.getElementById('accomAdjValue');
    const prevEl  = document.getElementById('accomAdjPreview');
    function _updateLivePreview() {
      if (!prevEl) return;
      const t = typeEl?.value;
      const v = parseFloat(valueEl?.value);
      const base = state.accommodation.base_cost;
      if (!t || isNaN(v)) {
        prevEl.textContent = `Calculated: ${fmtMoney(base)} → Final: (select type & value)`;
        return;
      }
      const simFinal = computeAdjustedAccommodationCost(base, { type: t, value: v });
      const simDiff  = simFinal - base;
      const diffStr  = simDiff === 0 ? '' : ` (${simDiff > 0 ? '+' : ''}${fmtMoney(simDiff)})`;
      prevEl.textContent = `Calculated: ${fmtMoney(base)} → Final: ${fmtMoney(simFinal)}${diffStr}`;
    }
    if (typeEl)  typeEl.addEventListener('change', _updateLivePreview);
    if (valueEl) valueEl.addEventListener('input',  _updateLivePreview);
    _updateLivePreview();
  };

  // ── END ADJUSTMENT ENGINE ───────────────────────────────────────────────────

  function _toggleGuestRoom(guestIdx, roomIdx, checked) {
    if (state.guestRecords[guestIdx]) {
      state.guestRecords[guestIdx].room_idx = checked ? roomIdx : null;
    }
    renderGuestRoster();
    _syncLodgeGuestAssignments();
  }

  // Badge derived entirely from Basic Details ÷ rooms vs maxOcc — no manual inputs.
  // Update the lodge-level occupancy badge — sums across all room-type-entries.
  // Badge format: "X / Y beds" where X = guests assigned to this lodge, Y = total bed capacity.
  // Separate colour states: green (within capacity), amber (over capacity but override applied), red (over with no override).
  function _updateRoomOccupancyBadge(row, rowIdx) {
    const badge = row.querySelector('.lodge-occupancy-badge');
    if (!badge) return;
    const lodgeName = row.querySelector('[name^="lodge_name_"]')?.value || '';
    const entries   = _getRoomTypeEntries(row);
    const { adults: totalAdults, children: totalChildren } = _getBasicPax();
    const totalGuests = totalAdults + totalChildren;

    // Sum capacity and assigned guests across all entries.
    // FIX: track per-entry assigned count separately so anyOver is correct.
    let totalCapacity = 0;
    let assignedInRow = 0;
    let anyOver       = false;
    let anyOverridden = false;

    if (entries.length === 0) {
      // Legacy path (no room-type-entry elements)
      const rooms  = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
      const maxOcc = _getMaxOccupancy(row.querySelector('[name^="room_type_"]')?.value, lodgeName) || 2;
      const cap    = rooms * maxOcc;
      totalCapacity = cap;
      let entryAssigned = 0;
      for (let r = 0; r < rooms; r++) entryAssigned += _getGuestsInRoom(rowIdx, 0, r).length;
      assignedInRow = entryAssigned;
      if (entryAssigned > cap) anyOver = true;
    } else {
      entries.forEach((entry, rtIdx) => {
        const rooms  = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
        const rt     = entry.querySelector('.room-type-select')?.value || entry.querySelector('[name^="room_type_"]')?.value || '';
        const maxOcc = _getMaxOccupancy(rt, lodgeName) || 2;
        const cap    = rooms * maxOcc;
        totalCapacity += cap;
        // Count assigned guests for THIS entry only (not cumulative)
        let entryAssigned = 0;
        for (let r = 0; r < rooms; r++) entryAssigned += _getGuestsInRoom(rowIdx, rtIdx, r).length;
        assignedInRow += entryAssigned;
        if (entryAssigned > cap) {
          anyOver = true;
          // Check if any room in this entry has an override applied
          for (let r = 0; r < rooms; r++) {
            const rk = _makeRoomKey(rowIdx, rtIdx, r);
            if ((state.roomOverrides || {})[rk]?.overridden) { anyOverridden = true; break; }
          }
        }
      });
    }

    const isOver = anyOver;
    const allAssigned = totalGuests > 0 && assignedInRow >= totalGuests;

    // Badge text: "X guests · Y beds" — unambiguous separation of assigned vs capacity
    if (totalGuests === 0) {
      badge.textContent = '—';
      badge.style.cssText += ';background:var(--bg-surface);color:var(--text-muted);border-color:var(--border)';
    } else if (isOver) {
      badge.textContent = `${assignedInRow} guests · ${totalCapacity} beds ⚠`;
      badge.style.background  = anyOverridden ? 'var(--warning)' : 'var(--danger)';
      badge.style.color       = '#fff';
      badge.style.borderColor = anyOverridden ? 'var(--warning)' : 'var(--danger)';
      badge.title = `${assignedInRow} guests assigned into ${totalCapacity} bed capacity. ${anyOverridden ? 'Override applied.' : 'Add rooms or reassign.'}`;
    } else if (allAssigned) {
      badge.textContent = `${assignedInRow} / ${totalCapacity} ✓`;
      badge.style.background  = 'var(--success)';
      badge.style.color       = '#fff';
      badge.style.borderColor = 'var(--success)';
      badge.title = `All ${totalGuests} guests assigned within ${totalCapacity} bed capacity.`;
    } else {
      badge.textContent = `${assignedInRow} / ${totalGuests} assigned`;
      badge.style.background  = 'var(--bg-surface)';
      badge.style.color       = 'var(--text-secondary)';
      badge.style.borderColor = 'var(--border)';
      badge.title = `${assignedInRow} of ${totalGuests} guests assigned to this lodge.`;
    }
  }

  function _getMaxOccupancy(roomType, lodgeName) {
    if (!roomType || !lodgeName) return 2;
    const lodge = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
    if (!lodge) return 2;
    const rt = (lodge.room_types || []).find(r => r.room_type === roomType);
    return (rt && rt.max_occupancy) ? rt.max_occupancy : 2;
  }

  // Checks that room configuration (rooms × maxOcc across all lodge rows) can fit
  // totalGuests from Basic Details. Uses computed model — no manual per-room inputs.
  // Distinguishes hard capacity errors from soft warnings (child-sharing scenarios).
  function _checkCapacityMismatch() {
    const { adults: totalAdults, children: totalChildren } = _getBasicPax();
    const totalGuests = totalAdults + totalChildren;

    let alertEl = document.getElementById('accommodationMismatchAlert');
    if (!alertEl) {
      const lodgeItems = document.getElementById('lodgeItems');
      if (!lodgeItems) return;
      alertEl = document.createElement('div');
      alertEl.id = 'accommodationMismatchAlert';
      lodgeItems.parentNode.insertBefore(alertEl, lodgeItems.nextSibling);
    }

    if (totalGuests === 0) { alertEl.style.display = 'none'; return; }

    // Capacity = sum of (rooms × maxOcc) across ALL room-type-entries in all rows
    let totalCapacity = 0;
    let hasAnyRow = false;
    document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
      const lodgeName = row.querySelector('[name^="lodge_name_"]')?.value || '';
      const entries = _getRoomTypeEntries(row);
      if (entries.length === 0) {
        // Legacy: single room type from row-level fields
        const rooms  = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
        const maxOcc = _getMaxOccupancy(row.querySelector('[name^="room_type_"]')?.value, lodgeName) || 2;
        totalCapacity += rooms * maxOcc;
        hasAnyRow = true;
        return;
      }
      entries.forEach(entry => {
        const rooms  = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
        const rt     = entry.querySelector('.room-type-select')?.value || entry.querySelector('[name^="room_type_"]')?.value || '';
        const maxOcc = _getMaxOccupancy(rt, lodgeName) || 2;
        totalCapacity += rooms * maxOcc;
      });
      hasAnyRow = true;
    });

    // Use actual assigned guest count rather than configured maxOccupancy-based capacity.
    // This ensures override rooms (more guests than maxOcc) are counted correctly.
    const unassignedCount = _getUnassignedGuests().length;
    const totalAssigned = totalGuests - unassignedCount;
    if (!hasAnyRow || unassignedCount === 0) {
      alertEl.style.display = 'none';
      return;
    }

    const gap = unassignedCount;

    // Determine if this is a soft-warning scenario (gap is entirely due to young children)
    // Young children (<5) need cots but do not take up beds — so effective occupancy is lower.
    const youngChildCount = _getYoungChildCount();
    const effectiveGuests = totalGuests - youngChildCount; // occupancy-relevant guests
    const isSoftCapacity  = totalChildren > 0 && effectiveGuests <= totalCapacity && unassignedCount === 0;

    // One-click resolution buttons
    const addRoomBtn = `
      <button type="button" class="btn btn-xs" style="font-size:10px;padding:4px 10px;background:var(--brand-green);color:#fff;border:none;font-weight:600"
        onclick="window.TRVE._changeRoomsCount(document.querySelector('#lodgeItems .lodge-item'), +1)">
        + Add Room
      </button>`;

    const allRoomTypes = (state.lodgeData || []).flatMap(l => (l.room_types || []).map(rt => rt.room_type));
    const singleType = allRoomTypes.find(rt => /single/i.test(rt));
    const familyType = allRoomTypes.find(rt => /family/i.test(rt));
    const tripleType = allRoomTypes.find(rt => /triple/i.test(rt));

    const addSingleBtn = singleType ? `
      <button type="button" class="btn btn-xs" style="font-size:10px;padding:4px 10px;background:var(--bg-surface);border:1px solid var(--border)"
        onclick="window.TRVE._addRoomOfType('${escapeHtml(singleType)}')">
        + Add Single Room
      </button>` : '';
    const addFamilyBtn = familyType ? `
      <button type="button" class="btn btn-xs" style="font-size:10px;padding:4px 10px;background:var(--bg-surface);border:1px solid var(--border)"
        onclick="window.TRVE._addRoomOfType('${escapeHtml(familyType)}')">
        + Add Family Room
      </button>` : '';
    const addTripleBtn = tripleType ? `
      <button type="button" class="btn btn-xs" style="font-size:10px;padding:4px 10px;background:var(--bg-surface);border:1px solid var(--border)"
        onclick="window.TRVE._addRoomOfType('${escapeHtml(tripleType)}')">
        + Add Triple Room
      </button>` : '';

    alertEl.style.display = '';

    if (isSoftCapacity) {
      // SOFT WARNING — capacity only appears short because young children count toward total
      // but don't consume beds. Offer override option.
      alertEl.innerHTML = `
        <div style="border:1px solid var(--brand-gold,#f59e0b);border-radius:var(--radius-md);padding:12px 14px;margin-top:8px;background:rgba(245,158,11,.05)">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="var(--brand-gold,#f59e0b)" stroke-width="1.4"/><path d="M7 4v3.5" stroke="var(--brand-gold,#f59e0b)" stroke-width="1.6" stroke-linecap="round"/><circle cx="7" cy="10" r=".7" fill="var(--brand-gold,#f59e0b)"/></svg>
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--brand-gold-dark,#b45309)">Accommodation Warning — Child Sharing Scenario</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:4px">
            Total guests (Basic Details): <strong>${totalGuests}</strong>
            (${totalAdults} adult${totalAdults !== 1 ? 's' : ''} + ${totalChildren} child${totalChildren !== 1 ? 'ren' : ''})
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:4px">
            Assigned guests: <strong>${totalAssigned}</strong>
            &nbsp;·&nbsp; Young children (&lt;5): <strong>${youngChildCount}</strong> (cot only — no bed needed)
          </div>
          <div style="font-size:var(--text-xs);color:var(--brand-gold-dark,#b45309);margin-bottom:8px;font-weight:600">
            Warning: This room exceeds standard occupancy but may be allowed for families.
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;font-style:italic">
            This configuration is allowed based on lodge policy. Ensure pricing and rooming are correct.
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${addRoomBtn}
            ${addFamilyBtn}
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:4px 10px;background:var(--brand-gold,#f59e0b);color:#fff;border:none;font-weight:600"
              onclick="window.TRVE._triggerCapacityOverride()">
              Override and Proceed
            </button>
          </div>
        </div>`;
    } else {
      // HARD ERROR — genuine capacity shortfall requiring an extra room
      alertEl.innerHTML = `
        <div style="border:1px solid var(--danger);border-radius:var(--radius-md);padding:12px 14px;margin-top:8px;background:rgba(220,38,38,.05)">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="var(--danger)" stroke-width="1.4"/><path d="M7 4v3.5" stroke="var(--danger)" stroke-width="1.6" stroke-linecap="round"/><circle cx="7" cy="10" r=".7" fill="var(--danger)"/></svg>
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--danger)">Accommodation Incomplete</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:4px">
            Total guests (Basic Details): <strong>${totalGuests}</strong>
            (${totalAdults} adult${totalAdults !== 1 ? 's' : ''} + ${totalChildren} child${totalChildren !== 1 ? 'ren' : ''})
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:8px">
            Assigned guests: <strong>${totalAssigned}</strong> of <strong>${totalGuests}</strong>
            &nbsp;·&nbsp; <span style="color:var(--danger);font-weight:700">
              ${gap} guest${gap !== 1 ? 's' : ''} remain${gap === 1 ? 's' : ''} unaccommodated
            </span>
          </div>
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">
            Recommended: add another room
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${addRoomBtn}
            ${addSingleBtn}
            ${addFamilyBtn}
            ${addTripleBtn}
            <button type="button" class="btn btn-xs" style="font-size:10px;padding:4px 10px;background:var(--bg-surface);border:1px solid var(--border)"
              onclick="window.TRVE.addLodgeItem()">
              + Add Lodge Row
            </button>
          </div>
        </div>`;
    }
  }

  // Trigger capacity-level soft-warning override dialog (from mismatch alert button).
  function _triggerCapacityOverride() {
    const { adults: totalAdults, children: totalChildren } = _getBasicPax();
    const youngChildCount = _getYoungChildCount();
    const message = `Total guests (${totalAdults} adult${totalAdults !== 1 ? 's' : ''} + ${totalChildren} child${totalChildren !== 1 ? 'ren' : ''}) ` +
      `appear to exceed configured room capacity. However, ${youngChildCount} young child${youngChildCount !== 1 ? 'ren' : ''} (under 5) ` +
      `require cots only and may share a bed — this configuration may be allowed under lodge child-sharing policy.`;
    const overrideKey = 'capacity-level';
    _showOverrideConfirmDialog(message, overrideKey, (reason) => {
      _logOverride(overrideKey, reason, []);
      // Mark all rooms with children as overridden so subsequent drag-drops don't re-prompt
      document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, rowIdx) => {
        const entries = _getRoomTypeEntries(row);
        const processEntry = (rtIdx, roomCount) => {
          for (let r = 0; r < roomCount; r++) {
            const roomKey = _makeRoomKey(rowIdx, rtIdx, r);
            const guests  = _getGuestsInRoom(rowIdx, rtIdx, r);
            if (guests.some(g => g.type === 'child')) {
              if (!state.roomOverrides) state.roomOverrides = {};
              state.roomOverrides[roomKey] = { overridden: true, reason, timestamp: new Date().toISOString() };
            }
          }
        };
        if (entries.length === 0) {
          processEntry(0, parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1);
        } else {
          entries.forEach((entry, rtIdx) => processEntry(rtIdx, parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1));
        }
      });
      _renderGuestAssignmentUI();
      _checkCapacityMismatch();
      toast('info', 'Override applied', 'Child-sharing configuration accepted. Verify pricing and room assignments.');
    });
  }
  window.TRVE._triggerCapacityOverride = _triggerCapacityOverride;

  // Add a room by incrementing rooms count on the first lodge row, then setting its type
  function _addRoomOfType(roomType) {
    const firstRow = document.querySelector('#lodgeItems .lodge-item');
    if (!firstRow) { addLodgeItem(); return; }
    const roomsInput = firstRow.querySelector('[name^="rooms_"]');
    if (roomsInput) {
      roomsInput.stepUp();
      roomsInput.dispatchEvent(new Event('input'));
    }
    // Try to match room type in dropdown
    const roomTypeSelect = firstRow.querySelector('[name^="room_type_"]');
    if (roomTypeSelect) {
      const opt = Array.from(roomTypeSelect.options).find(o =>
        o.value.toLowerCase() === roomType.toLowerCase()
      );
      if (opt) {
        roomTypeSelect.value = opt.value;
        roomTypeSelect.dispatchEvent(new Event('change'));
      }
    }
  }
  window.TRVE._addRoomOfType = _addRoomOfType;

  // Toast suggestions when a specific room is overcrowded
  function _suggestRoomUpgrade(roomIdx, currentType, perRoom, maxOcc) {
    const row = document.querySelector(`#lodgeItems .lodge-item[data-idx="${roomIdx}"]`);
    if (!row) return;
    const lodgeName = row.querySelector('[name^="lodge_name_"]')?.value || '';
    const lodge = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
    if (lodge && lodge.room_types) {
      const larger = lodge.room_types.filter(rt =>
        (rt.max_occupancy || 2) >= perRoom && rt.room_type !== currentType
      );
      if (larger.length > 0) {
        toast('info', 'Upgrade options available',
          `Room types with sufficient capacity (≥${perRoom}): ${larger.map(rt => rt.room_type).join(', ')}. Select from the Room Type dropdown above.`
        );
      } else {
        toast('warning', 'No larger room type found',
          `No room types in this lodge support ${perRoom} occupants. Consider splitting guests across rooms or adding a staff room.`
        );
      }
    } else {
      toast('info', 'Upgrade room type',
        'Select a room type with higher max occupancy from the Room Type dropdown, or reduce the occupancy count and add another room.'
      );
    }
  }
  window.TRVE._suggestRoomUpgrade = _suggestRoomUpgrade;

  // Vehicle types and default rates
  const VEHICLE_TYPES = [
    { value: '4x4 Safari Vehicle', label: '4x4 Safari Vehicle (Land Cruiser)', rate: 120, seats: 7 },
    { value: 'Safari Minivan', label: 'Safari Minivan / Hiace', rate: 100, seats: 8 },
    { value: 'Coaster Bus', label: 'Coaster Bus (large groups)', rate: 150, seats: 26 },
    { value: 'Self-Drive 4x4', label: 'Self-Drive 4x4 (fuel excl.)', rate: 90, seats: 5 },
    { value: 'Airport Shuttle', label: 'Airport Shuttle (Entebbe)', rate: 60, seats: 4 },
    { value: 'Boat Transfer', label: 'Boat Transfer / Water Taxi', rate: 80, seats: 10 },
  ];

  function _initVehicleDropdown() {
    const sel = document.getElementById('vehicleDropdown');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select vehicle type —</option>';
    VEHICLE_TYPES.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.value;
      opt.textContent = `${v.label} — $${v.rate}/day`;
      opt.dataset.rate = v.rate;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', _updateVehicleHint);
  }

  function _updateVehicleHint() {
    const sel = document.getElementById('vehicleDropdown');
    const hint = document.getElementById('vehicleDropdownHint');
    if (!sel || !hint) return;
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) {
      hint.textContent = 'Select a vehicle type then click Add';
      return;
    }
    const v = VEHICLE_TYPES.find(x => x.value === opt.value);
    const days = parseInt(document.getElementById('vehicleDaysInput')?.value) || 1;
    const fuelBuf = parseFloat(document.getElementById('fuelBufferInput')?.value || '10');
    const total = days * v.rate * (1 + fuelBuf / 100);
    hint.textContent = `$${v.rate}/day · ${v.seats} seats · ${days} day(s) ≈ $${total.toFixed(0)} incl. ${fuelBuf}% fuel buffer`;
  }

  function addVehicleItem(presetType, presetRate) {
    const container = document.getElementById('vehicleItems');
    if (!container) return;

    // Resolve type and rate — from dropdown selection or preset args
    const dropdownSel = document.getElementById('vehicleDropdown');
    const dropdownDays = document.getElementById('vehicleDaysInput');
    const selectedType = presetType || (dropdownSel ? dropdownSel.value : '') || VEHICLE_TYPES[0].value;
    const vDef = VEHICLE_TYPES.find(v => v.value === selectedType) || VEHICLE_TYPES[0];
    const defaultRate = presetRate || vDef.rate;
    const _pDays = parseInt(document.getElementById('pricingDays')?.value) || 0;
    const defaultDays = parseInt(dropdownDays?.value) || (_pDays > 0 ? Math.max(1, _pDays - 1) : 1);

    if (!selectedType) {
      toast('warning', 'No vehicle selected', 'Please select a vehicle type from the dropdown');
      return;
    }

    const idx = container.children.length;
    const el = document.createElement('div');
    el.className = 'vehicle-item';
    el.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;margin-bottom:6px;flex-wrap:wrap';
    el.innerHTML = `
      <span style="font-size:var(--text-xs);font-weight:600;flex:1;min-width:140px">${escapeHtml(selectedType)}</span>
      <input type="hidden" name="veh_type_${idx}" value="${escapeHtml(selectedType)}">
      <label style="font-size:var(--text-xs);color:var(--text-muted);display:flex;align-items:center;gap:4px">
        Days:
        <input type="number" class="form-control" name="veh_days_${idx}" min="1" value="${defaultDays}"
          style="width:52px;height:28px;font-size:var(--text-xs);padding:2px 6px">
      </label>
      <label style="font-size:var(--text-xs);color:var(--text-muted);display:flex;align-items:center;gap:4px">
        $/day:
        <input type="number" class="form-control" name="veh_rate_${idx}" min="0" value="${defaultRate}"
          style="width:60px;height:28px;font-size:var(--text-xs);padding:2px 6px">
      </label>
      <span class="veh-cost-preview" style="font-size:var(--text-xs);color:var(--brand-green);font-weight:600;min-width:80px"></span>
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.vehicle-item').remove()" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);

    const daysInput = el.querySelector(`[name^="veh_days_"]`);
    const rateInput = el.querySelector(`[name^="veh_rate_"]`);
    const preview = el.querySelector('.veh-cost-preview');

    function updateVehPreview() {
      const d = parseInt(daysInput.value) || 0;
      const r = parseFloat(rateInput.value) || 0;
      const fuelBuf = parseFloat(document.getElementById('fuelBufferInput')?.value || '10') / 100;
      const total = d * r * (1 + fuelBuf);
      preview.textContent = total > 0 ? `≈ $${total.toFixed(0)}` : '';
    }

    daysInput.addEventListener('input', updateVehPreview);
    rateInput.addEventListener('input', updateVehPreview);
    updateVehPreview();

    // Reset dropdown to placeholder after adding
    if (dropdownSel && !presetType) {
      dropdownSel.value = '';
      _updateVehicleHint();
    }
  }

  // FIX: Populate room_type dropdown from actual lodge DB data
  // Prevents sending 'single' when only double rooms exist for that lodge
  function populateRoomTypes(lodgeName, selectEl) {
    selectEl.innerHTML = '';
    if (!lodgeName) {
      selectEl.innerHTML = '<option value="">— select lodge first —</option>';
      return;
    }
    // Find the lodge in state.lodgeData
    const lodge = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
    if (!lodge || !lodge.room_types || lodge.room_types.length === 0) {
      // No rate data: show generic options
      const fallback = [
        {val:'double', label:'Double'},
        {val:'single', label:'Single'},
        {val:'triple', label:'Triple'},
      ];
      fallback.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.val; opt.textContent = o.label;
        selectEl.appendChild(opt);
      });
      return;
    }
    // Use actual room_type strings from DB — prevents single/double mismatch.
    // Deduplicate by room_type name: for each distinct room_type, prefer the entry
    // whose validity window covers today; fall back to the most recent entry.
    // The API returns rows ordered: currently-valid first (valid_from DESC within that),
    // so the first occurrence of each room_type is already the best rate to display.
    const today = new Date().toISOString().slice(0, 10);
    const bestRateMap = new Map(); // room_type → best rt entry
    lodge.room_types.forEach(rt => {
      if (!rt.room_type) return;
      if (!bestRateMap.has(rt.room_type)) {
        bestRateMap.set(rt.room_type, rt); // first = best (API orders valid rates first)
      } else {
        // Prefer currently-valid entry over any existing
        const existing = bestRateMap.get(rt.room_type);
        const existingCurrent = existing.valid_from <= today && existing.valid_to >= today;
        const thisCurrent = rt.valid_from <= today && rt.valid_to >= today;
        if (thisCurrent && !existingCurrent) bestRateMap.set(rt.room_type, rt);
      }
    });
    bestRateMap.forEach((rt, roomTypeName) => {
      const opt = document.createElement('option');
      opt.value = roomTypeName;  // EXACT DB value — no more LIKE mismatch
      opt.textContent = `${roomTypeName} — $${rt.net_rate_usd}/night`;
      selectEl.appendChild(opt);
    });
    selectEl.selectedIndex = 0;

    // Show rate freshness warning in the lodge row's freshness div
    const lodgeRow = selectEl.closest('.lodge-item');
    if (lodgeRow) {
      const rowIdx = lodgeRow.dataset.idx;
      const freshnessDiv = document.getElementById(`lodge_rate_freshness_${rowIdx}`);
      if (freshnessDiv) {
        const src = lodge.source_email_date || (lodge.room_types[0] && lodge.room_types[0].source_email_date) || '';
        const extractedAt = lodge.extraction_timestamp || (lodge.room_types[0] && lodge.room_types[0].extraction_timestamp) || '';
        if (src) {
          const emailDate = new Date(src);
          const ageMs = Date.now() - emailDate.getTime();
          const ageDays = Math.floor(ageMs / 86400000);
          const isStale = ageDays > 90;
          freshnessDiv.style.display = '';
          freshnessDiv.style.color = isStale ? 'var(--danger)' : 'var(--text-muted)';
          freshnessDiv.innerHTML = isStale
            ? `⚠ Rate sourced from email dated ${src.slice(0,10)} (${ageDays} days ago — may be outdated)`
            : `✓ Rate from email: ${src.slice(0,10)}${extractedAt ? ' · imported ' + extractedAt.slice(0,10) : ''}`;
        } else {
          freshnessDiv.style.display = 'none';
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // RATE CONTROL — editable per-room-type-entry override with STO / Rack chips
  // ---------------------------------------------------------------------------

  // Returns the HTML string for the rate control row embedded in a room-type-entry.
  // rateInputName: the unique name attr for the hidden rate input (e.g. "rate_override_0")
  function _buildRateControlHTML(rateInputName) {
    return `
      <div class="rate-control-row" style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">Rate/night</label>
        <span style="font-size:var(--text-xs);color:var(--text-muted)">$</span>
        <input type="number" name="${rateInputName}" class="rate-override-input form-control"
          min="0" step="0.01" placeholder="auto from DB"
          style="width:88px;height:28px;font-size:var(--text-sm);font-weight:600;text-align:right"
          title="Leave blank to use the STO rate from the database. Enter a value to override.">
        <button type="button" class="rate-chip sto-chip"
          style="font-size:10px;padding:2px 7px;height:24px;border-radius:9px;border:1px solid var(--teal-600);background:var(--bg-subtle);color:var(--teal-700);cursor:pointer;white-space:nowrap;font-weight:600"
          title="Use STO (net) rate from database">STO —</button>
        <button type="button" class="rate-chip rack-chip"
          style="font-size:10px;padding:2px 7px;height:24px;border-radius:9px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text-secondary);cursor:pointer;white-space:nowrap;font-weight:600"
          title="Use published rack rate">Rack —</button>
        <button type="button" class="rate-chip clear-chip"
          style="font-size:10px;padding:2px 7px;height:24px;border-radius:9px;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer"
          title="Clear override — revert to STO from DB">×</button>
      </div>`;
  }

  // Update STO/Rack chip labels for a room-type-entry after a room type is selected.
  function _updateRateChips(entry, lodgeName, roomType) {
    const lodge      = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodgeName);
    const lodgeRow   = entry.closest('.lodge-item');
    const mealPlan   = lodgeRow?.querySelector('[name^="meal_plan_"]')?.value || '';
    const rt         = lodge && roomType
      ? (_findBestRate(lodge.room_types || [], roomType, mealPlan) || null)
      : null;
    const sto  = rt ? rt.net_rate_usd  : null;
    const rack = rt ? rt.rack_rate_usd : null;
    const stoChip  = entry.querySelector('.sto-chip');
    const rackChip = entry.querySelector('.rack-chip');
    const inp      = entry.querySelector('.rate-override-input');
    const clearChip = entry.querySelector('.clear-chip');
    if (stoChip)  stoChip.textContent  = sto  != null ? `STO $${sto}`  : 'STO —';
    if (rackChip) rackChip.textContent = rack != null ? `Rack $${rack}` : 'Rack —';
    if (stoChip) {
      stoChip.onclick = () => {
        if (inp && sto != null) { inp.value = sto; _highlightActiveChip(entry, 'sto'); }
      };
    }
    if (rackChip) {
      rackChip.onclick = () => {
        if (inp && rack != null) { inp.value = rack; _highlightActiveChip(entry, 'rack'); }
      };
    }
    if (clearChip) {
      clearChip.onclick = () => {
        if (inp) { inp.value = ''; _highlightActiveChip(entry, null); }
      };
    }
    // Highlight whichever chip matches current input value
    if (inp) {
      const cur = parseFloat(inp.value);
      if (!isNaN(cur) && cur > 0) {
        if (sto != null && Math.abs(cur - sto) < 0.01)        _highlightActiveChip(entry, 'sto');
        else if (rack != null && Math.abs(cur - rack) < 0.01) _highlightActiveChip(entry, 'rack');
        else                                                   _highlightActiveChip(entry, 'custom');
      } else {
        _highlightActiveChip(entry, null); // empty = using DB automatically
      }
    }
  }

  function _highlightActiveChip(entry, which) {
    const chips = { sto: entry.querySelector('.sto-chip'), rack: entry.querySelector('.rack-chip') };
    if (chips.sto)  chips.sto.style.background  = which === 'sto'  ? 'var(--teal-600)' : 'var(--bg-subtle)';
    if (chips.sto)  chips.sto.style.color        = which === 'sto'  ? '#fff'            : 'var(--teal-700)';
    if (chips.rack) chips.rack.style.background  = which === 'rack' ? 'var(--warning)'  : 'var(--bg-subtle)';
    if (chips.rack) chips.rack.style.color        = which === 'rack' ? '#fff'            : 'var(--text-secondary)';
  }

  // Build an extra cost row element with type selector and per-day toggle.
  // type: 'per_trip' | 'per_day' | 'per_vehicle'
  function _buildExtraCostRow(description, amount, type) {
    const container = document.getElementById('extraCostsSection');
    const idx = container.children.length;
    const el = document.createElement('div');
    el.className = 'extra-cost-row';
    el.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap';
    const typeOpts = [
      { v: 'per_trip',    label: 'Per trip'    },
      { v: 'per_day',     label: 'Per day'     },
      { v: 'per_vehicle', label: 'Per vehicle' },
    ].map(o => `<option value="${o.v}"${(type||'per_trip')===o.v?' selected':''}>${o.label}</option>`).join('');
    el.innerHTML = `
      <input type="text" class="form-control" name="extra_desc_${idx}" value="${escapeHtml(description||'')}"
        placeholder="Description" style="flex:1;min-width:120px">
      <input type="number" class="form-control" name="extra_amount_${idx}" min="0"
        value="${amount != null ? amount : ''}" placeholder="Amount (USD)"
        style="width:120px">
      <select class="form-control" name="extra_type_${idx}"
        style="width:110px;font-size:var(--text-xs);height:var(--input-h,34px)">
        ${typeOpts}
      </select>
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.extra-cost-row').remove()" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);
    return el;
  }

  // MINOR-32: Pre-filled extra cost row
  function addPresetExtraCost(description, amount, type) {
    _buildExtraCostRow(description, amount, type || 'per_trip');
    toast('info', 'Extra cost added', `${description} — $${amount}${type === 'per_day' ? '/day' : ''}`);
  }

  // Add car park entry fee row
  function addCarParkFee() {
    const days = parseInt(document.getElementById('pricingDays')?.value) || 1;
    _buildExtraCostRow('Car Park Entry Fee', '', 'per_day');
    toast('info', 'Car Park Fee added', `Enter daily rate — will be multiplied by trip days (${days}).`);
  }
  window.TRVE.addCarParkFee = addCarParkFee;

  function addExtraCost() {
    _buildExtraCostRow('', null, 'per_trip');
    toast('info', 'Extra cost row added', 'Fill in the description and amount');
  }

  // ---------------------------------------------------------------------------
  // Structured Itinerary Editor
  // ---------------------------------------------------------------------------

  function _itnDayBlockHTML(d, editMode) {
    const acts = d.activities || [];
    const actsHTML = acts.map((a) => `
      <div class="itn-activity-item">
        <input class="form-control itn-activity-input" value="${escapeHtml(a)}"
          placeholder="Activity description" ${editMode ? '' : 'readonly'}>
        ${editMode ? `<button type="button" class="btn btn-ghost btn-icon itn-remove-act"
          style="padding:2px 4px;color:var(--text-muted)" title="Remove activity">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg></button>` : ''}
      </div>`).join('');

    return `
      <div class="itn-day-block" data-day="${d.day}">
        <div class="itn-day-header">
          <span class="itn-day-num">Day ${d.day}</span>
          <input class="form-control itn-day-dest" value="${escapeHtml(d.destination || '')}"
            placeholder="Destination" ${editMode ? '' : 'readonly'} style="font-weight:600;flex:1;min-width:0;max-width:240px">
          ${editMode ? `<button type="button" class="btn btn-ghost btn-icon itn-remove-day"
            data-day="${d.day}" title="Remove day" style="color:var(--danger);padding:2px 6px">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg></button>` : ''}
        </div>
        <div class="itn-day-body">
          <div class="itn-day-row">
            <label class="itn-field-label">Accommodation</label>
            <input class="form-control itn-day-accom" value="${escapeHtml(d.accommodation || '')}"
              placeholder="Lodge / hotel name" ${editMode ? '' : 'readonly'}>
          </div>
          <div class="itn-day-row">
            <label class="itn-field-label">Transport</label>
            <input class="form-control itn-day-transport" value="${escapeHtml(d.transport || '')}"
              placeholder="Transfer details" ${editMode ? '' : 'readonly'}>
          </div>
          <div class="itn-day-row">
            <label class="itn-field-label">Activities</label>
            <div class="itn-activities-list" data-day="${d.day}">${actsHTML}</div>
            ${editMode ? `<button type="button" class="btn btn-ghost btn-sm itn-add-act"
              data-day="${d.day}" style="margin-top:4px;font-size:11px">+ Add Activity</button>` : ''}
          </div>
          <div class="itn-day-row" style="display:flex;gap:8px;flex-wrap:wrap">
            <div style="min-width:160px">
              <label class="itn-field-label">Meals</label>
              <input class="form-control itn-day-meals" value="${escapeHtml(d.meals || '')}"
                placeholder="Full Board / B&B" ${editMode ? '' : 'readonly'} style="max-width:180px">
            </div>
            <div style="flex:1;min-width:180px">
              <label class="itn-field-label">Notes</label>
              <input class="form-control itn-day-notes" value="${escapeHtml(d.notes || '')}"
                placeholder="Special instructions" ${editMode ? '' : 'readonly'}>
            </div>
          </div>
        </div>
      </div>`;
  }

  function _itnStructuredToText(dayData) {
    return dayData.map(d => {
      const acts = (d.activities || []).filter(Boolean).join('; ');
      let line = `Day ${d.day}: ${d.destination || 'TBC'}`;
      if (acts) line += `. ${acts}`;
      if (d.accommodation) line += `\n  Accommodation: ${d.accommodation}`;
      if (d.transport) line += `\n  Transport: ${d.transport}`;
      if (d.meals) line += `\n  Meals: ${d.meals}`;
      if (d.notes) line += `\n  Notes: ${d.notes}`;
      return line;
    }).join('\n\n');
  }

  function _itnGetCurrentData(panel) {
    return Array.from(panel.querySelectorAll('.itn-day-block')).map(block => ({
      day: parseInt(block.dataset.day),
      destination: block.querySelector('.itn-day-dest')?.value || '',
      accommodation: block.querySelector('.itn-day-accom')?.value || '',
      transport: block.querySelector('.itn-day-transport')?.value || '',
      meals: block.querySelector('.itn-day-meals')?.value || '',
      notes: block.querySelector('.itn-day-notes')?.value || '',
      activities: Array.from(block.querySelectorAll('.itn-activity-input'))
        .map(i => i.value.trim()).filter(Boolean),
    }));
  }

  async function showItineraryVersionHistory(enquiryId) {
    if (!enquiryId) return;
    let versions = [];
    try {
      const data = await apiFetch(`/api/enquiries/${enquiryId}/itinerary/versions`);
      versions = data.versions || [];
    } catch (e) {
      toast('error', 'Could not load history', e.message);
      return;
    }
    if (!versions.length) {
      toast('info', 'No version history', 'Save the itinerary to start tracking versions.');
      return;
    }
    const rows = versions.map(v => `
      <tr>
        <td style="padding:8px 10px;font-weight:600">${escapeHtml(v.label || `Version ${v.version_number}`)}</td>
        <td style="padding:8px 10px;color:var(--text-muted);font-size:11px">${(v.saved_at || '').slice(0,16).replace('T',' ')}</td>
        <td style="padding:8px 10px;font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${escapeHtml(v.preview || '')}">${escapeHtml((v.preview || '').slice(0,80))}${(v.preview||'').length > 80 ? '…' : ''}</td>
        <td style="padding:8px 10px">
          <button class="btn btn-secondary btn-sm itn-restore-ver" data-vid="${escapeHtml(v.id)}">Restore</button>
        </td>
      </tr>`).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal" style="max-width:680px;width:95vw">
        <div class="modal-header">
          <h3 class="modal-title">Itinerary Version History</h3>
          <button class="modal-close" id="closeItnHistoryModal">&times;</button>
        </div>
        <div class="modal-body" style="padding:0">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--surface-2);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">
                <th style="padding:8px 10px;text-align:left">Version</th>
                <th style="padding:8px 10px;text-align:left">Saved At</th>
                <th style="padding:8px 10px;text-align:left">Preview</th>
                <th style="padding:8px 10px"></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="closeItnHistoryModalBtn">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => { modal.remove(); };
    modal.querySelector('#closeItnHistoryModal').addEventListener('click', close);
    modal.querySelector('#closeItnHistoryModalBtn').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelectorAll('.itn-restore-ver').forEach(btn => {
      btn.addEventListener('click', async () => {
        const vid = btn.dataset.vid;
        try {
          btn.disabled = true;
          btn.textContent = 'Restoring…';
          const res = await apiFetch(`/api/enquiries/${enquiryId}/itinerary/versions/${vid}/restore`, { method: 'POST', body: {} });
          toast('success', 'Version restored', 'The itinerary has been restored. Refresh the enquiry panel to see changes.');
          close();
          // Update state if the AI panel is open
          if (state.workingItinerary) {
            state.workingItinerary.text = res.content;
          }
        } catch (e) {
          toast('error', 'Restore failed', e.message);
          btn.disabled = false;
          btn.textContent = 'Restore';
        }
      });
    });
  }

  function generateItineraryText(itn) {
    const panel = document.getElementById('aiItineraryPanel');
    if (!panel) return;
    panel.style.display = 'block';

    const days = itn.duration_days || 7;
    const destinations = itn.destinations || [];
    const highlights = (itn.highlights || '').split(',').map(h => h.trim()).filter(Boolean);
    const itnId = itn.id || 'current';
    const enquiryId = state.curation ? state.curation.enquiryId : null;

    // Build default structured day data from itinerary metadata
    function buildDefaultDays() {
      const result = [];
      result.push({
        day: 1, destination: destinations[0] || 'Entebbe',
        accommodation: '', transport: 'Airport transfer',
        activities: ['Airport pickup', 'Welcome briefing & evening orientation'],
        meals: 'Dinner', notes: '',
      });
      const destCycle = destinations.slice(1);
      for (let d = 2; d <= days - 1; d++) {
        const dest = destCycle[(d - 2) % Math.max(1, destCycle.length)] || destinations[0];
        const hl = highlights[(d - 2) % Math.max(1, highlights.length)] || 'Game drive and wildlife viewing';
        result.push({ day: d, destination: dest, accommodation: '', transport: 'Road transfer', activities: [hl], meals: 'Full Board', notes: '' });
      }
      if (days > 1) {
        result.push({ day: days, destination: 'Entebbe / Kigali', accommodation: '', transport: 'Transfer to airport', activities: ['Check out', 'Departure transfer'], meals: 'Breakfast', notes: '' });
      }
      return result;
    }

    // Restore from session state if same itinerary
    let dayData = (state.workingItinerary && state.workingItinerary.itnId === itnId && state.workingItinerary.structured)
      ? state.workingItinerary.structured
      : buildDefaultDays();

    // Undo / Redo stacks (per editor session)
    let undoStack = [];
    let redoStack = [];
    let editMode = false;
    let autoSaveTimer = null;

    function pushUndo(data) {
      undoStack.push(JSON.stringify(data));
      if (undoStack.length > 30) undoStack.shift();
      redoStack = [];
      updateUndoBtn();
    }

    function updateUndoBtn() {
      const btn = document.getElementById('btnItnUndo');
      if (btn) btn.disabled = undoStack.length === 0;
    }

    async function triggerAutoSave(data) {
      if (!enquiryId) return;
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        const text = _itnStructuredToText(data);
        try {
          await apiFetch(`/api/enquiries/${enquiryId}`, { method: 'PATCH', body: { working_itinerary: text } });
          const badge = document.getElementById('aiItnSavedBadge');
          if (badge) { badge.style.display = 'inline-flex'; badge.title = 'Auto-saved at ' + new Date().toLocaleTimeString(); }
          const statusEl = document.getElementById('aiItnAutoSaveStatus');
          if (statusEl) statusEl.textContent = 'Auto-saved ' + new Date().toLocaleTimeString();
        } catch (_) {}
      }, 1500);
    }

    function buildPanelHTML(data, isEdit) {
      const actionBtns = isEdit ? `
        <button type="button" class="btn btn-ghost btn-sm" id="btnItnUndo" title="Undo last change" disabled>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 5H7a3 3 0 0 1 0 6H4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <path d="M1.5 5l2-2.5M1.5 5l2 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg> Undo
        </button>
        <button type="button" class="btn btn-primary btn-sm" id="btnItnSave">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 9h10M1 1h6l3 3v5H1V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <rect x="4" y="5.5" width="4" height="3.5" rx=".5" stroke="currentColor" stroke-width="1.3"/>
          </svg> Save
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnItnCancel">Cancel</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btnItnAddDayBottom">+ Add Day</button>
      ` : `
        <button type="button" class="btn btn-secondary btn-sm" id="btnItnEdit">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 9V10.5H3l5-5-1.5-1.5-5 5zM9.5 3l-1-1a.6.6 0 0 0-.85 0L6.5 3.15 8 4.65 9.5 3.15a.6.6 0 0 0 0-.15z" fill="currentColor"/>
          </svg> Edit
        </button>
      `;

      return `
        <div class="ai-itn-panel">
          <div class="ai-itn-header">
            <div class="ai-itn-title">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 7l2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              AI Itinerary — ${escapeHtml(itn.name || 'Safari Itinerary')}
              <span id="aiItnSavedBadge" style="display:none" class="ai-itn-saved-badge">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg> Saved
              </span>
            </div>
            <div class="ai-itn-actions" style="flex-wrap:wrap;gap:4px">
              ${actionBtns}
              <button type="button" class="btn btn-gold btn-sm" id="btnFastCreateInvoice" title="Create invoice from this booking's itinerary">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 9.5h9M1.5 1h9v9h-9V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  <path d="M4 4.5h4M4 7h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg> Create Invoice
              </button>
              ${enquiryId ? `
              <button type="button" class="btn btn-ghost btn-sm" id="btnItnHistory" title="View version history">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M6 3.5v2.7l1.5 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg> History
              </button>` : ''}
            </div>
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-3);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <span>${days}-day outline · ${enquiryId ? 'Auto-saves to booking record' : 'Approve for a booking to persist'}</span>
            <span id="aiItnAutoSaveStatus" style="color:var(--success);font-size:10px"></span>
            ${isEdit ? '<span style="background:var(--gold-100,#fef9ec);color:var(--gold-700,#b47d00);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600">✎ Edit mode</span>' : ''}
          </div>
          <div id="aiItnDayBlocks" class="itn-day-blocks">
            ${data.map(d => _itnDayBlockHTML(d, isEdit)).join('')}
          </div>
          <div style="margin-top:var(--space-3);display:flex;flex-wrap:wrap;gap:4px;align-items:center">
            <span style="font-size:var(--text-xs);color:var(--text-muted)">Highlights: </span>
            ${highlights.map(h => `<span class="ai-suggestion-chip">${escapeHtml(h)}</span>`).join('')}
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--space-2)">
            <em>Structured day-by-day plan. Changes auto-save to the booking and feed pricing, quotation &amp; invoice modules.</em>
          </div>
        </div>`;
    }

    function bindPanelEvents() {
      const btnEdit   = document.getElementById('btnItnEdit');
      const btnSave   = document.getElementById('btnItnSave');
      const btnCancel = document.getElementById('btnItnCancel');
      const btnUndo   = document.getElementById('btnItnUndo');
      const btnAddDay = document.getElementById('btnItnAddDayBottom');
      const btnHist   = document.getElementById('btnItnHistory');
      const btnInv    = document.getElementById('btnFastCreateInvoice');

      if (btnEdit) {
        btnEdit.addEventListener('click', () => {
          editMode = true;
          dayData = _itnGetCurrentData(panel);
          panel.innerHTML = buildPanelHTML(dayData, true);
          bindPanelEvents();
        });
      }

      if (btnSave) {
        btnSave.addEventListener('click', async () => {
          dayData = _itnGetCurrentData(panel);
          const text = _itnStructuredToText(dayData);
          state.workingItinerary = { itnId, enquiryId, itnName: itn.name, structured: dayData, text, savedAt: new Date().toISOString() };
          editMode = false;
          if (enquiryId) {
            try {
              await apiFetch(`/api/enquiries/${enquiryId}`, { method: 'PATCH', body: { working_itinerary: text } });
              toast('success', 'Itinerary saved', 'Persisted to booking record.');
            } catch (e) { toast('error', 'Save failed', e.message); return; }
          } else {
            toast('success', 'Itinerary saved (session)', 'Approve for a booking to persist permanently.');
          }
          panel.innerHTML = buildPanelHTML(dayData, false);
          const badge = document.getElementById('aiItnSavedBadge');
          if (badge) badge.style.display = 'inline-flex';
          bindPanelEvents();
        });
      }

      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          editMode = false;
          panel.innerHTML = buildPanelHTML(dayData, false);
          bindPanelEvents();
        });
      }

      if (btnUndo) {
        btnUndo.addEventListener('click', () => {
          if (!undoStack.length) return;
          redoStack.push(JSON.stringify(_itnGetCurrentData(panel)));
          dayData = JSON.parse(undoStack.pop());
          panel.innerHTML = buildPanelHTML(dayData, true);
          bindPanelEvents();
          updateUndoBtn();
        });
      }

      if (btnAddDay) {
        btnAddDay.addEventListener('click', () => {
          const current = _itnGetCurrentData(panel);
          pushUndo(current);
          const nextDay = current.length > 0 ? current[current.length - 1].day + 1 : 1;
          current.push({ day: nextDay, destination: '', accommodation: '', transport: '', activities: [''], meals: 'Full Board', notes: '' });
          dayData = current;
          panel.innerHTML = buildPanelHTML(dayData, true);
          bindPanelEvents();
          triggerAutoSave(dayData);
        });
      }

      // Remove day
      panel.querySelectorAll('.itn-remove-day').forEach(btn => {
        btn.addEventListener('click', () => {
          const current = _itnGetCurrentData(panel);
          pushUndo(current);
          const dayNum = parseInt(btn.dataset.day);
          let filtered = current.filter(d => d.day !== dayNum).map((d, i) => ({ ...d, day: i + 1 }));
          dayData = filtered;
          panel.innerHTML = buildPanelHTML(dayData, true);
          bindPanelEvents();
          triggerAutoSave(dayData);
        });
      });

      // Add activity within a day
      panel.querySelectorAll('.itn-add-act').forEach(btn => {
        btn.addEventListener('click', () => {
          const current = _itnGetCurrentData(panel);
          pushUndo(current);
          const dayNum = parseInt(btn.dataset.day);
          dayData = current.map(d => d.day === dayNum ? { ...d, activities: [...d.activities, ''] } : d);
          panel.innerHTML = buildPanelHTML(dayData, true);
          bindPanelEvents();
        });
      });

      // Remove activity
      panel.querySelectorAll('.itn-remove-act').forEach(btn => {
        btn.addEventListener('click', () => {
          const current = _itnGetCurrentData(panel);
          pushUndo(current);
          const actItem = btn.closest('.itn-activity-item');
          const actList = actItem?.closest('.itn-activities-list');
          const dayNum = actList ? parseInt(actList.dataset.day) : null;
          const actIdx = actItem ? Array.from(actList.children).indexOf(actItem) : -1;
          if (dayNum !== null && actIdx >= 0) {
            dayData = current.map(d => {
              if (d.day !== dayNum) return d;
              const acts = [...d.activities];
              acts.splice(actIdx, 1);
              return { ...d, activities: acts };
            });
            panel.innerHTML = buildPanelHTML(dayData, true);
            bindPanelEvents();
          }
        });
      });

      // Auto-save on input change in edit mode
      if (editMode) {
        panel.querySelectorAll('.itn-day-block input').forEach(inp => {
          inp.addEventListener('change', () => triggerAutoSave(_itnGetCurrentData(panel)));
        });
      }

      // Version history
      if (btnHist) {
        btnHist.addEventListener('click', () => showItineraryVersionHistory(enquiryId));
      }

      // Create Invoice button
      if (btnInv) {
        btnInv.addEventListener('click', async () => {
          if (!enquiryId) {
            toast('warning', 'No booking linked', 'Approve an itinerary for a booking first to create an invoice.');
            return;
          }
          const current = _itnGetCurrentData(panel);
          const text = _itnStructuredToText(current);
          state.workingItinerary = { itnId, enquiryId, itnName: itn.name, structured: current, text, savedAt: new Date().toISOString() };
          try {
            btnInv.disabled = true;
            btnInv.textContent = 'Creating…';
            // Save working itinerary first
            await apiFetch(`/api/enquiries/${enquiryId}`, { method: 'PATCH', body: { working_itinerary: text } });
            // Create invoice directly from booking
            const result = await apiFetch(`/api/enquiries/${enquiryId}/create-invoice`, { method: 'POST', body: {} });
            toast('success', 'Invoice created', `${result.invoice_number} · $${(result.total_usd || 0).toLocaleString()} — navigate to Finance to view.`);
            navigate('invoices');
          } catch (e) {
            toast('error', 'Invoice creation failed', e.message);
          } finally {
            if (document.getElementById('btnFastCreateInvoice')) {
              document.getElementById('btnFastCreateInvoice').disabled = false;
              document.getElementById('btnFastCreateInvoice').innerHTML =
                `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 9.5h9M1.5 1h9v9h-9V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M4 4.5h4M4 7h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Create Invoice`;
            }
          }
        });
      }
    }

    // Initial render
    panel.innerHTML = buildPanelHTML(dayData, editMode);
    bindPanelEvents();

    // Show saved badge if this itinerary was already saved this session
    if (state.workingItinerary && state.workingItinerary.itnId === itnId) {
      const badge = document.getElementById('aiItnSavedBadge');
      if (badge) badge.style.display = 'inline-flex';
    }
  }

  async function loadActivities() {
    try {
      const data = await apiFetch('/api/activities');
      state.activities = data.items || [];
      renderActivityPresets();
    } catch (_) { /* silent */ }
  }

  // Max times the same activity can be added per itinerary
  const ACTIVITY_MAX_USES = 1;

  // Get the price for an activity adjusted to the current nationality tier
  function getActivityPriceForTier(act, tier) {
    if (act.tier_rates && act.tier_rates[tier] != null) {
      return act.tier_rates[tier];
    }
    return act.default_usd || 0;
  }

  function renderActivityPresets() {
    const sel = document.getElementById('activityDropdown');
    if (!sel || !state.activities) return;
    const tier = document.getElementById('pricingNationality')?.value || 'FNR';
    const catOrder = ['activity', 'transport', 'flight', 'transfer', 'visa', 'conservation', 'gratuity', 'health', 'insurance'];
    const categories = [...new Set(state.activities.map(a => a.category))].sort((a, b) => {
      const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Remember previously selected value so we can restore it after re-render
    const prevVal = sel.value;

    // Rebuild options
    sel.innerHTML = '<option value="">— Select an activity —</option>';
    for (const cat of categories) {
      const items = state.activities.filter(a => a.category === cat);
      const grp = document.createElement('optgroup');
      grp.label = cat.charAt(0).toUpperCase() + cat.slice(1);
      for (const a of items) {
        const price = getActivityPriceForTier(a, tier);
        const hasTiers = !!(a.tier_rates);
        const priceLabel = price > 0 ? ` — $${price}${hasTiers ? ` (${tier})` : ''}` : '';
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.name}${priceLabel}`;
        opt.dataset.activityId = a.id;
        opt.dataset.tierPrice = price;
        opt.dataset.perPerson = a.per_person ? '1' : '0';
        opt.title = a.notes || '';
        grp.appendChild(opt);
      }
      sel.appendChild(grp);
    }

    // Restore selection if still present
    if (prevVal) sel.value = prevVal;

    // Update hint with selected price info
    _updateActivityHint(sel, tier);
  }

  function _updateActivityHint(sel, tier) {
    const hint = document.getElementById('activityDropdownHint');
    if (!hint) return;
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) {
      hint.textContent = 'Select an activity then click Add to append it to the quotation';
      return;
    }
    const price = parseFloat(opt.dataset.tierPrice) || 0;
    const pp = opt.dataset.perPerson === '1';
    hint.textContent = price > 0
      ? `Price: $${price}${pp ? ' per person' : ' flat'} · nationality tier: ${tier || 'FNR'}`
      : 'No standard price — edit manually after adding';
  }

  function _syncActivityButtonStates() {
    // No-op: chip buttons replaced by dropdown; kept for call-site compatibility
  }

  function addActivityCost(actId, name, amount, perPerson) {
    if (!state.addedActivities) state.addedActivities = {};
    const count = state.addedActivities[actId] || 0;
    if (count >= ACTIVITY_MAX_USES) {
      toast('warning', 'Already added', `${name} has already been added to this itinerary`);
      return;
    }
    // Read nationality-adjusted price from dropdown option if available
    const sel = document.getElementById('activityDropdown');
    const opt = sel ? Array.from(sel.options).find(o => o.value === actId) : null;
    const tierPrice = opt ? parseFloat(opt.dataset.tierPrice) : NaN;
    const finalAmount = !isNaN(tierPrice) ? tierPrice : amount;

    // Lookup per_person flag from catalogue to auto-set label
    const act = (state.activities || []).find(a => a.id === actId);
    const hasTiers = !!(act && act.tier_rates);
    const tier = document.getElementById('pricingNationality')?.value || 'FNR';
    const labelSuffix = hasTiers ? ` [${tier}]` : '';

    addPresetExtraCost(`${name}${labelSuffix}`, finalAmount);
    // Track and disable button
    state.addedActivities[actId] = count + 1;
    _syncActivityButtonStates();
  }

  function initPricingForm() {
    // Per-invoice tracking state
    state.addedActivities = {};
    state.bufferApplied = false;

    // Restore any persisted accommodation cost adjustment
    _restoreAccomAdjustment();

    document.getElementById('btnAddLodge').addEventListener('click', () => addLodgeItem());

    // Keyboard shortcuts for accommodation undo/redo
    document.addEventListener('keydown', e => {
      const tag = (e.target || document.activeElement)?.tagName || '';
      if (['INPUT','SELECT','TEXTAREA'].includes(tag)) return; // don't hijack form fields
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); _accomUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); _accomRedo(); }
    });
    document.getElementById('btnAddStaffRoom').addEventListener('click', addStaffRoomItem);
    document.getElementById('btnAddExtra').addEventListener('click', addExtraCost);

    // Auto-sync nights = days - 1 when duration changes
    const daysInput = document.getElementById('pricingDays');
    if (daysInput) {
      daysInput.addEventListener('input', () => {
        if (daysInput.readOnly) return; // locked when both dates present
        const d = parseInt(daysInput.value) || 0;
        if (d > 0) _syncLodgeNightsFromDays(d);
        _updateAccommodationDates();
        _updateVehicleHint();
        // Show nights hint
        const nightsHint = document.getElementById('pricingDaysNightsHint');
        if (nightsHint && d >= 1) {
          const n = d - 1;
          nightsHint.textContent = `${n} night${n !== 1 ? 's' : ''} of accommodation`;
          nightsHint.style.display = '';
        }
      });
    }

    // Transport section — dropdown + Add button
    _initVehicleDropdown();
    const btnAddVehicle = document.getElementById('btnAddVehicle');
    if (btnAddVehicle) btnAddVehicle.addEventListener('click', () => addVehicleItem());
    const vDaysInput = document.getElementById('vehicleDaysInput');
    if (vDaysInput) vDaysInput.addEventListener('input', _updateVehicleHint);

    // MINOR-32: Preset extra cost buttons
    document.getElementById('btnAddVisaFee').addEventListener('click', () => {
      addPresetExtraCost('Uganda Single-Entry Visa (per person)', 50);
    });
    document.getElementById('btnAddAirportTransfer').addEventListener('click', () => {
      addPresetExtraCost('Entebbe Airport Return Transfer', 150);
    });

    // Activity dropdown: change → update hint; Add button → addActivityCost
    const actDropdown = document.getElementById('activityDropdown');
    const btnAddActivity = document.getElementById('btnAddActivity');
    if (actDropdown) {
      actDropdown.addEventListener('change', () => {
        const tier = document.getElementById('pricingNationality')?.value || 'FNR';
        _updateActivityHint(actDropdown, tier);
      });
    }
    if (btnAddActivity) {
      btnAddActivity.addEventListener('click', () => {
        const sel = document.getElementById('activityDropdown');
        const opt = sel ? sel.options[sel.selectedIndex] : null;
        if (!opt || !opt.value) {
          toast('warning', 'No activity selected', 'Please select an activity from the dropdown first');
          return;
        }
        const act = (state.activities || []).find(a => a.id === opt.value);
        if (!act) return;
        const price = parseFloat(opt.dataset.tierPrice) || 0;
        addActivityCost(act.id, act.name, price, act.per_person);
        // Reset dropdown to placeholder after adding
        sel.value = '';
        const tier = document.getElementById('pricingNationality')?.value || 'FNR';
        _updateActivityHint(sel, tier);
      });
    }

    // Wire up dynamic permit label updates AND activity price updates on nationality / date change
    const natSel = document.getElementById('pricingNationality');
    const dateSel = document.getElementById('pricingTravelStartDate');
    if (natSel) natSel.addEventListener('change', () => {
      updatePermitLabels();
      renderActivityPresets(); // re-render dropdown with nationality-adjusted prices
    });
    if (dateSel) {
      dateSel.addEventListener('change', updatePermitLabels);
      dateSel.addEventListener('change', _updateAccommodationDates);
    }
    const endDateSel = document.getElementById('pricingTravelEndDate');
    if (endDateSel) endDateSel.addEventListener('change', _updateAccommodationDates);

    // Guest roster: sync on adults/children change (Basic Details is single source of truth)
    const adultsInput = document.getElementById('pricingAdults');
    const childrenInput = document.getElementById('pricingChildren');
    function _syncGuestsFromForm() {
      _distCache.clear(); // invalidate memoised distribution for new guest totals
      const total = (parseInt(adultsInput?.value) || 0) + (parseInt(childrenInput?.value) || 0);
      syncGuestRecords(total);
      renderChildAgeInputs();
      _syncGuestPool();        // reconcile guest pool objects with new pax count
      _renderGuestAssignmentUI(); // refresh pool panel + room cards
      _checkCapacityMismatch();
    }
    if (adultsInput) adultsInput.addEventListener('change', _syncGuestsFromForm);
    if (adultsInput) adultsInput.addEventListener('input', _syncGuestsFromForm);
    if (childrenInput) childrenInput.addEventListener('change', _syncGuestsFromForm);
    if (childrenInput) childrenInput.addEventListener('input', _syncGuestsFromForm);

    // Initial label render
    updatePermitLabels();

    // MAJOR-13: Warn when permit qty exceeds typical UWA group size
    document.querySelectorAll('#permitsSection .permit-qty').forEach(function(input) {
      input.addEventListener('change', function() {
        var max = parseInt(input.getAttribute('data-uwa-max'), 10);
        if (!max || isNaN(max)) return;
        var val = parseInt(input.value, 10) || 0;
        if (val > max) {
          input.value = max;
          toast('warning', 'Quantity capped to ' + max, 'UWA/RDB maximum for this permit type per session.');
        }
      });
    });

    // Dynamically update commission labels from apiConfig if available
    function updateCommissionLabels() {
      if (!state.apiConfig || !state.apiConfig.commission_rates) return;
      const rates = state.apiConfig.commission_rates;
      const sel = document.getElementById('pricingCommissionType');
      Array.from(sel.options).forEach(opt => {
        if (opt.value && rates[opt.value] != null) {
          const base = opt.value.charAt(0).toUpperCase() + opt.value.slice(1);
          opt.textContent = `${base} (${rates[opt.value]}%)`;
        }
      });
    }
    // Attempt on load; also re-run after config is fetched
    setTimeout(updateCommissionLabels, 2000);

    // T2: Show/hide fuel km and price inputs based on vehicle type selection
    const fuelTypeEl = document.getElementById('pricingFuelVehicleType');
    if (fuelTypeEl) {
      function toggleFuelInputs() {
        const hasFuel = fuelTypeEl.value !== '';
        document.getElementById('fuelKmGroup').style.display = hasFuel ? '' : 'none';
        document.getElementById('fuelPriceGroup').style.display = hasFuel ? '' : 'none';
      }
      fuelTypeEl.addEventListener('change', toggleFuelInputs);
      toggleFuelInputs();
    }

    const applyBuffersBtn = document.getElementById('applyBuffersBtn');
    if (applyBuffersBtn) {
      applyBuffersBtn.addEventListener('click', async () => {
        if (state.bufferApplied) {
          toast('warning', 'Buffer already set', 'Price buffer has already been recorded for this invoice. Recalculate to reset.');
          return;
        }
        const fuelBuf = parseFloat(document.getElementById('fuelBufferInput')?.value || '5');
        const fxBuf = parseFloat(document.getElementById('fxBufferInput')?.value || '3');
        try {
          await apiFetch('/api/config/update', {
            method: 'POST',
            body: { fuel_buffer_pct: fuelBuf, fx_buffer_pct: fxBuf }
          });
          state.bufferApplied = true;
          applyBuffersBtn.disabled = true;
          applyBuffersBtn.textContent = '✓ Applied';
          applyBuffersBtn.style.opacity = '0.6';
          toast('success', 'Price buffer recorded', `Fuel buffer: ${fuelBuf}% · FX buffer: ${fxBuf}% — locked for this invoice`);
        } catch (e) {
          toast('error', 'Could not update buffers', e.message);
        }
      });
    }

    // Load activities for preset cost buttons
    loadActivities();

    document.getElementById('pricingForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      // Reset per-invoice state on each new calculation
      state.addedActivities = {};
      state.bufferApplied = false;
      const applyBtn = document.getElementById('applyBuffersBtn');
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply';
        applyBtn.style.opacity = '';
      }
      _syncActivityButtonStates();
      await calculatePrice();
    });
  }

  async function calculatePrice() {
    const btn = document.querySelector('#pricingForm button[type="submit"]');
    const originalBtnText = btn.innerHTML;
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="spin-icon"><path d="M7 1a6 6 0 100 12A6 6 0 007 1z" stroke="currentColor" stroke-width="1.5" stroke-dasharray="30" stroke-dashoffset="10"/></svg>
      Calculating...
    `;

    // Show skeleton in results panel while calculating
    const resultsPanel = document.getElementById('pricingResultsPanel');
    if (resultsPanel && !resultsPanel.querySelector('.price-summary-card')) {
      resultsPanel.innerHTML = `
        <div class="card mb-5" style="padding:var(--space-6)">
          <div class="skeleton skeleton-title" style="width:50%;margin-bottom:var(--space-4)"></div>
          <div class="skeleton skeleton-text" style="width:70%;margin-bottom:var(--space-2)"></div>
          <div class="skeleton skeleton-text" style="width:40%"></div>
        </div>
        <div class="card" style="padding:var(--space-6)">
          <div class="skeleton skeleton-title" style="width:40%;margin-bottom:var(--space-4)"></div>
          ${[1,2,3,4].map(() => `<div class="skeleton skeleton-text" style="width:${60+Math.floor(Math.random()*30)}%;margin-bottom:var(--space-2)"></div>`).join('')}
        </div>
      `;
    }

    // Validate nationality tier before calculating
    const tierCheck = document.getElementById('pricingNationality').value;
    if (!tierCheck) {
      toast('warning', 'Nationality tier required',
        'Select the guest nationality tier (FNR / FR / EAC). UWA permit rates differ by up to 9× between categories.');
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = originalBtnText;
      return;
    }

    // Validate nights totals match trip duration before proceeding (Task 2).
    if (!_validateAndShowNightsSummary()) {
      const days = parseInt(document.getElementById('pricingDays')?.value) || 0;
      const expected = days > 0 ? Math.max(1, days - 1) : 0;
      let assigned = 0;
      document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
        assigned += parseInt(row.querySelector('.lodge-nights-input')?.value) || 0;
      });
      toast('error', 'Nights mismatch — calculation blocked',
        `Lodge nights total (${assigned}) must equal trip nights (${expected} = ${days} days − 1). Adjust nights before calculating.`);
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = originalBtnText;
      return;
    }

    // Validate accommodation covers all guests before proceeding.
    // Uses computed model: capacity = rooms × maxOcc per row.
    {
      const { adults: valAdults, children: valChildren } = _getBasicPax();
      const valTotal = valAdults + valChildren;
      let   valCapacity = 0;
      let   hasRooms    = false;
      let   hasOvercrowded = false;
      document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
        const lodgeName = row.querySelector('[name^="lodge_name_"]')?.value || '';
        const entries = _getRoomTypeEntries(row);
        if (entries.length === 0) {
          // Legacy single-entry path
          const rooms  = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
          const maxOcc = _getMaxOccupancy(row.querySelector('[name^="room_type_"]')?.value, lodgeName) || 2;
          valCapacity += rooms * maxOcc;
          hasRooms = true;
          const perRoomAdults   = Math.ceil(valAdults   / rooms);
          const perRoomChildren = Math.ceil(valChildren / rooms);
          if (Math.ceil(valTotal / rooms) > maxOcc && !_childSharingApplies(perRoomAdults, perRoomChildren, maxOcc)) {
            hasOvercrowded = true;
          }
        } else {
          entries.forEach(entry => {
            const rooms  = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
            const rtVal  = entry.querySelector('.room-type-select')?.value || entry.querySelector('[name^="room_type_"]')?.value || '';
            const maxOcc = _getMaxOccupancy(rtVal, lodgeName) || 2;
            valCapacity += rooms * maxOcc;
            hasRooms = true;
            const perRoomAdults   = Math.ceil(valAdults   / rooms);
            const perRoomChildren = Math.ceil(valChildren / rooms);
            if (Math.ceil(valTotal / rooms) > maxOcc && !_childSharingApplies(perRoomAdults, perRoomChildren, maxOcc)) {
              hasOvercrowded = true;
            }
          });
        }
      });
      if (valTotal > 0 && hasRooms && valCapacity < valTotal) {
        // Allow proceeding if a capacity-level override was already confirmed by the user
        const hasCapacityOverride = (state.overrideLog || []).some(e => e.roomKey === 'capacity-level');
        if (!hasCapacityOverride) {
          const shortfall = valTotal - valCapacity;
          toast('warning', 'Accommodation incomplete',
            `${shortfall} guest${shortfall !== 1 ? 's are' : ' is'} unaccommodated. Add more rooms before calculating.`);
          _checkCapacityMismatch();
        }
      }
      if (hasOvercrowded) {
        // Skip if the user has already confirmed a room override — override clears all room allocation rules
        const hasRoomOverride = Object.values(state.roomOverrides || {}).some(o => o.overridden);
        if (!hasRoomOverride) {
          toast('warning', 'Room overcrowded',
            'One or more rooms exceed max occupancy. Please upgrade room type or add rooms before calculating.');
          btn.classList.remove('loading');
          btn.disabled = false;
          btn.innerHTML = originalBtnText;
          return;
        }
      }
    }

    try {
      const { adults, children } = _getBasicPax();

      // Build accommodations array — one entry per room-type-entry per lodge row.
      // adults/children always come from Basic Details (single source of truth).
      const accommodations = [];
      const childGuests     = (state.guestPool || []).filter(g => g.type === 'child');
      const childrenFree    = childGuests.filter(g => { const t = _getChildMealTier(g.age); return t.free; }).length;
      const childrenHalf    = childGuests.filter(g => { const t = _getChildMealTier(g.age); return !t.free && t.multiplier === 0.5; }).length;
      const childrenFull    = childGuests.filter(g => { const t = _getChildMealTier(g.age); return !t.free && t.multiplier === 1.0; }).length;

      document.querySelectorAll('#lodgeItems .lodge-item').forEach((row) => {
        const lodge    = row.querySelector(`[name^="lodge_name_"]`)?.value;
        if (!lodge) return;
        const nights   = parseInt(row.querySelector(`[name^="nights_"]`)?.value) || 1;
        const mealPlan = row.querySelector(`[name^="meal_plan_"]`)?.value || 'BB';
        const guestLabel = row.querySelector(`[name^="guest_label_"]`)?.value?.trim() || '';
        const entries  = _getRoomTypeEntries(row);

        if (entries.length === 0) {
          // Legacy: single room type from row-level fields
          const roomType   = row.querySelector(`[name^="room_type_"]`)?.value || 'standard';
          const rooms      = parseInt(row.querySelector(`[name^="rooms_"]`)?.value)  || 1;
          const rateOverride = parseFloat(row.querySelector(`.rate-override-input`)?.value) || 0;
          const perRoomAdults   = rooms > 0 ? Math.ceil(adults   / rooms) : adults;
          const perRoomChildren = rooms > 0 ? Math.ceil(children / rooms) : children;
          const acc = {
            lodge, room_type: roomType, nights, rooms, meal_plan: mealPlan,
            adults: perRoomAdults, children: perRoomChildren,
            children_free: childrenFree, children_half: childrenHalf, children_full: childrenFull,
            guest_label: guestLabel,
          };
          if (rateOverride > 0) acc.rate_per_night = rateOverride;
          accommodations.push(acc);
          return;
        }

        // Multi room type: one accommodation record per room-type-entry
        const totalRoomsInLodge = entries.reduce((s, e) => s + (parseInt(e.querySelector('[name^="rooms_"]')?.value) || 1), 0);
        entries.forEach(entry => {
          const roomType     = entry.querySelector('.room-type-select')?.value || entry.querySelector('[name^="room_type_"]')?.value || 'standard';
          const rooms        = parseInt(entry.querySelector('[name^="rooms_"]')?.value) || 1;
          const rateOverride = parseFloat(entry.querySelector('.rate-override-input')?.value) || 0;
          // Apportion adults/children proportionally to room count in this entry
          const share = totalRoomsInLodge > 0 ? rooms / totalRoomsInLodge : 1;
          const perRoomAdults   = rooms > 0 ? Math.ceil(adults   * share / rooms) : adults;
          const perRoomChildren = rooms > 0 ? Math.ceil(children * share / rooms) : children;
          const acc = {
            lodge, room_type: roomType, nights, rooms, meal_plan: mealPlan,
            adults: perRoomAdults, children: perRoomChildren,
            children_free: Math.ceil(childrenFree  * share),
            children_half: Math.ceil(childrenHalf  * share),
            children_full: Math.ceil(childrenFull  * share),
            guest_label: guestLabel,
          };
          if (rateOverride > 0) acc.rate_per_night = rateOverride;
          accommodations.push(acc);
        });
      });

      // Build vehicles array (explicit optional transport — no auto-insertion)
      const vehicles = [];
      document.querySelectorAll('#vehicleItems .vehicle-item').forEach((row) => {
        const vtype = row.querySelector(`[name^="veh_type_"]`)?.value;
        const vdays = parseInt(row.querySelector(`[name^="veh_days_"]`)?.value) || 1;
        const vrate = parseFloat(row.querySelector(`[name^="veh_rate_"]`)?.value) || 120;
        if (vtype) vehicles.push({ type: vtype, days: vdays, rate: vrate });
      });

      // Build permits array
      const permits = [];
      document.querySelectorAll('#permitsSection input[type="checkbox"]:checked').forEach(cb => {
        const qtyInput = cb.closest('.permit-toggle').querySelector('.permit-qty');
        const qty = parseInt(qtyInput?.value) || 1;
        permits.push({ type: cb.value, quantity: qty });
      });

      // Build extra costs (supports per_trip / per_day / per_vehicle types)
      const _tripDaysForExtra = parseInt(document.getElementById('pricingDays')?.value) || 1;
      const _vehicleCountForExtra = (() => {
        let n = 0;
        document.querySelectorAll('#vehicleSection .vehicle-row').forEach(() => n++);
        return Math.max(1, n);
      })();
      const extra_costs = [];
      document.querySelectorAll('#extraCostsSection .extra-cost-row').forEach(row => {
        const desc   = row.querySelector('[name^="extra_desc_"]')?.value.trim();
        const amount = parseFloat(row.querySelector('[name^="extra_amount_"]')?.value);
        const type   = row.querySelector('[name^="extra_type_"]')?.value || 'per_trip';
        if (!desc || isNaN(amount)) return;
        extra_costs.push({
          description: desc,
          amount,
          per_day:     type === 'per_day',
          per_vehicle: type === 'per_vehicle',
        });
      });

      // Build staff rooms array
      const staff_rooms = [];
      document.querySelectorAll('#staffRoomItems .staff-room-item').forEach((card) => {
        const role = card.querySelector('[name^="sr_role_"]')?.value;
        const occupantName = card.querySelector('[name^="sr_occupant_"]')?.value.trim() || '';
        const lodge = card.querySelector('[name^="sr_lodge_"]')?.value || '';
        const roomType = card.querySelector('[name^="sr_room_type_"]')?.value.trim() || 'Staff Single';
        const nights = parseInt(card.querySelector('[name^="sr_nights_"]')?.value) || 1;
        const mealPlan = card.querySelector('[name^="sr_meal_"]')?.value || 'BB';
        const rateUsd = parseFloat(card.querySelector('[name^="sr_rate_"]')?.value) || 0;
        const pricingOption = card.querySelector('[name^="sr_pricing_"]:checked')?.value || 'operating';
        staff_rooms.push({ role, occupant_name: occupantName, lodge, room_type: roomType, nights, meal_plan: mealPlan, rate_usd: rateUsd, pricing_option: pricingOption });
      });

      // If an accommodation cost adjustment is active, inject it as an extra_cost entry
      // so the backend pricing engine reflects the manual override in totals.
      const _accomAdj = state.accommodation.adjustment;
      if (_accomAdj && _accomAdj.type) {
        const _base  = state.accommodation.base_cost;
        const _final = state.accommodation.final_cost;
        const _delta = _final - _base;
        if (_delta !== 0) {
          extra_costs.push({
            description: `Accommodation cost adjustment (${_accomAdj.type}): ${escapeHtml(_accomAdj.reason)}`,
            amount: _delta,
            per_day: false,
            per_vehicle: false,
          });
        } else if (_accomAdj.type === 'override') {
          // Override that equals base — no delta needed, already correct
        }
      }

      const payload = {
        itinerary_id: document.getElementById('pricingItinerary').value || null,
        nationality_tier: document.getElementById('pricingNationality').value,
        adults,
        children,
        pax: adults + children,
        duration_days: parseInt(document.getElementById('pricingDays').value) || null,
        travel_start_date: document.getElementById('pricingTravelStartDate').value || null,
        include_insurance: document.getElementById('pricingIncludeInsurance').checked,
        commission_type: document.getElementById('pricingCommissionType').value || null,
        accommodations,
        vehicles,
        permits,
        extra_costs,
        staff_rooms,
      };

      // Accommodation validation safeguards
      // Hard-block: lodge name must match supplier database records
      const unknownLodges = [];
      document.querySelectorAll('#lodgeItems .lodge-item').forEach((row) => {
        const lodge = row.querySelector(`[name^="lodge_name_"]`)?.value;
        if (!lodge) return;
        const lodgeData = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodge);
        if (!lodgeData) unknownLodges.push(lodge);
      });
      if (unknownLodges.length > 0) {
        const allNames = (state.lodgeData || []).map(l => l.name || l.lodge_name || '').filter(Boolean);
        // Suggest closest matches (naive substring search)
        const suggestions = unknownLodges.map(unknown => {
          const matches = allNames.filter(n => n.toLowerCase().includes(unknown.toLowerCase().slice(0, 4)));
          return matches.length > 0 ? `"${unknown}" — did you mean: ${matches.slice(0, 3).join(', ')}?` : `"${unknown}" — not found in supplier database`;
        });
        toast('error', 'Lodge not found in supplier database',
          suggestions.join(' | ') + ' Select a lodge from the dropdown.');
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
        return;
      }

      const accomWarnings = [];
      document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, ri) => {
        const lodge = row.querySelector(`[name^="lodge_name_"]`)?.value;
        const roomType = row.querySelector(`[name^="room_type_"]`)?.value;
        if (!lodge) return;
        // Check for missing rate
        const lodgeData = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodge);
        const hasRate = lodgeData && (lodgeData.room_types || []).some(rt => rt.room_type === roomType && (rt.net_rate_usd || 0) > 0);
        if (!hasRate) accomWarnings.push(`Room ${ri + 1} (${lodge}): no net rate found in database`);
        // Check staleness
        const src = (lodgeData && lodgeData.source_email_date) || '';
        if (src) {
          const ageDays = Math.floor((Date.now() - new Date(src).getTime()) / 86400000);
          if (ageDays > 90) accomWarnings.push(`Room ${ri + 1} (${lodge}): rate sourced from email ${ageDays} days ago — may be outdated`);
        }
        // Check max occupancy: perRoom occupants vs room type limit
        const maxOcc  = _getMaxOccupancy(roomType, lodge);
        const rowEl   = document.querySelectorAll('#lodgeItems .lodge-item')[ri];
        const rooms   = rowEl ? (parseInt(rowEl.querySelector('[name^="rooms_"]')?.value) || 1) : 1;
        // Use computed per-room need (derived from Basic Details)
        const perRoom = adults + children > 0 ? Math.ceil((adults + children) / rooms) : 0;
        if (perRoom > maxOcc) accomWarnings.push(
          `Lodge row ${ri + 1} (${lodge} — ${roomType || 'no type'}): ${perRoom} per room needed but max capacity is ${maxOcc}`
        );
      });
      // Check global capacity vs Basic Details guest count
      {
        const totalGuestCount = adults + children;
        let totalCapacity = 0;
        document.querySelectorAll('#lodgeItems .lodge-item').forEach(rowEl => {
          const r      = parseInt(rowEl.querySelector('[name^="rooms_"]')?.value) || 1;
          const maxOcc = _getMaxOccupancy(
            rowEl.querySelector('[name^="room_type_"]')?.value,
            rowEl.querySelector('[name^="lodge_name_"]')?.value
          ) || 2;
          totalCapacity += r * maxOcc;
        });
        if (totalCapacity < totalGuestCount) accomWarnings.push(
          `Room capacity (${totalCapacity}) is less than guest count (${totalGuestCount}). Add more rooms.`
        );
      }
      // Staff room validation
      staff_rooms.forEach((sr, si) => {
        if (!sr.role) accomWarnings.push(`Staff room ${si + 1}: role is required (Driver / Guide / Tracker / etc.)`);
        if (!sr.rate_usd || sr.rate_usd <= 0) accomWarnings.push(`Staff room ${si + 1} (${sr.role || 'unknown role'}): rate must be greater than 0`);
      });
      if (accomWarnings.length > 0) {
        const proceed = confirm(`Accommodation warnings:\n\n${accomWarnings.map((w, i) => `${i+1}. ${w}`).join('\n')}\n\nContinue with calculation anyway?`);
        if (!proceed) {
          btn.classList.remove('loading');
          btn.disabled = false;
          btn.innerHTML = originalBtnText;
          return;
        }
      }

      const result = await apiFetch('/api/calculate-price', { method: 'POST', body: payload });
      renderPricingResults(result, payload);
      toast('success', 'Price calculated!');
      // Auto-calculate bank charges in background — non-blocking
      _autoCalculateBankCharges(result);

    } catch (err) {
      toast('error', 'Calculation failed', err.message);
      document.getElementById('pricingResultsPanel').innerHTML = `
        <div class="empty-state card">
          <div class="empty-title">Calculation Failed</div>
          <div class="empty-text">${escapeHtml(err.message)}</div>
        </div>
      `;
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = originalBtnText;
    }
  }

  function renderPricingResults(result, payload) {
    const panel = document.getElementById('pricingResultsPanel');
    const lineItems = result.line_items || [];
    const fxRate = result.fx_rate || 3575; // 2026 avg per Exchange-Rates.org
    const fxTimestamp = result.fx_timestamp || null;
    const serviceFeeLabel = result.service_fee_label || 'TRVE Service Fee';
    const serviceFeePct = result.service_fee_pct != null ? result.service_fee_pct
      : (state.apiConfig && state.apiConfig.service_fee_pct ? state.apiConfig.service_fee_pct : null);
    const totalPax = (result.adults || payload.adults || result.pax || 1)
      + (result.children || payload.children || 0);

    // Format each editable line item row — USD amount is an <input> for manual override
    function renderLineItemRow(item, idx) {
      const usdAmount = item.total_usd != null ? item.total_usd : null;
      const ugxAmount = item.total_ugx != null ? item.total_ugx : null;
      const isFuelLine = item.total_usd == null && item.total_ugx != null;
      const ugxDisplay = ugxAmount != null
        ? fmtMoney(ugxAmount, 'UGX')
        : (usdAmount != null ? fmtMoney(usdAmount * fxRate, 'UGX') : '—');
      // UGX-only rows (fuel) keep a static display in USD column
      const usdCell = isFuelLine
        ? `<span class="price-item-ugx-only">—</span>`
        : `<input type="number" class="price-item-input" data-idx="${idx}"
             value="${usdAmount != null ? usdAmount : ''}"
             min="0" step="0.01"
             style="width:90px;text-align:right;font-family:var(--font-mono);font-size:var(--text-sm);
                    background:transparent;border:1px dashed var(--border);border-radius:3px;
                    padding:2px 4px;color:inherit"
             title="Click to edit this line item amount">`;
      return `
        <tr${isFuelLine ? ' style="background:rgba(234,179,8,0.06)"' : ''}>
          <td>${escapeHtml(item.item || '—')}${item.note ? ` <span style="font-size:var(--text-xs);color:var(--text-muted)">(${escapeHtml(item.note)})</span>` : ''}</td>
          <td class="amount-col">${usdCell}</td>
          <td class="amount-col price-item-ugx-cell" data-idx="${idx}" style="color:${isFuelLine ? 'var(--brand-gold)' : 'var(--text-muted)'};font-size:var(--text-xs)">${ugxDisplay}</td>
        </tr>
      `;
    }

    panel.innerHTML = `
      <!-- Trip Header Card -->
      <div class="price-summary-card mb-5">
        <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.55);margin-bottom:var(--space-2)">
          ${escapeHtml(result.nationality_tier || payload.nationality_tier || '—')} &middot; ${result.duration_days || '—'} Days &middot; ${result.adults || payload.adults || result.pax || '—'} Adults${(result.children || payload.children) ? ` + ${result.children || payload.children} Children` : ''}
        </div>
        <div style="font-size:var(--text-base);font-weight:600;color:#FFFFFF;margin-bottom:var(--space-4);line-height:1.4">
          ${escapeHtml(result.itinerary || 'Custom Trip')}
        </div>
        <div style="height:1px;background:rgba(255,255,255,0.15);margin-bottom:var(--space-4)"></div>
        <div class="price-summary-title">Grand Total (Group)</div>
        <div class="price-summary-value" id="priceSummaryTotal">${fmtMoney(result.total_usd)}</div>
        <div class="price-summary-sub" id="priceSummaryTotalUgx">${fmtMoney(result.total_ugx, 'UGX')} equivalent</div>
        <div style="height:1px;background:rgba(255,255,255,0.15);margin:var(--space-4) 0"></div>
        <div class="price-summary-title">Per Person</div>
        <div style="font-family:var(--font-mono);font-size:var(--text-xl);font-weight:700;color:#FFFFFF" id="priceSummaryPerPerson">${fmtMoney(result.per_person_usd)}</div>
        <div class="price-summary-sub">FX Rate: 1 USD = UGX ${fmtNum(fxRate)}${fxTimestamp ? ` <span style="opacity:0.6;font-size:var(--text-xs)">(${fxTimestamp})</span>` : ' <span style="opacity:0.6;font-size:var(--text-xs)">(fallback)</span>'}</div>
      </div>

      <!-- Line Items Table -->
      <div class="card mb-5">
        <div class="card-header" style="padding:var(--space-4) var(--space-5)">
          <span class="card-title" style="font-size:var(--text-base)">Price Breakdown</span>
          <span style="font-size:var(--text-xs);color:var(--text-muted);margin-left:8px">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style="vertical-align:middle;margin-right:3px"><path d="M1 10l2-2 6-6-2-2L1 6v4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            Click USD amounts to edit
          </span>
        </div>
        <div style="overflow-x:auto">
          <table class="price-results-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align:right">Total (USD)</th>
                <th style="text-align:right">UGX Equiv.</th>
              </tr>
            </thead>
            <tbody id="priceLineItemsBody">
              ${lineItems.map((item, idx) => renderLineItemRow(item, idx)).join('')}
              <tr class="price-subtotal-row">
                <td><strong>Subtotal</strong></td>
                <td class="amount-col"><strong id="priceSubtotalUsd">${fmtMoney(result.subtotal_usd)}</strong></td>
                <td class="amount-col" id="priceSubtotalUgx" style="color:var(--text-muted);font-size:var(--text-xs)">${fmtMoney((result.subtotal_usd || 0) * fxRate, 'UGX')}</td>
              </tr>
              <tr class="price-markup-row">
                <td>${escapeHtml(serviceFeeLabel)} (${serviceFeePct != null ? serviceFeePct + '%' : '—'})
                  <span style="display:inline-block;margin-left:4px;cursor:help" title="Management & coordination fee applied by The Rift Valley Explorer. Rate is configurable per commission type.">&#9432;</span>
                </td>
                <td class="amount-col" id="priceServiceFeeUsd">${fmtMoney(result.tmsf_usd || result.service_fee_usd)}</td>
                <td class="amount-col" id="priceServiceFeeUgx" style="font-size:var(--text-xs)">${fmtMoney(((result.tmsf_usd || result.service_fee_usd) || 0) * fxRate, 'UGX')}</td>
              </tr>
              <tr class="price-total-row">
                <td><strong>Grand Total</strong></td>
                <td class="amount-col"><strong id="priceTotalUsd">${fmtMoney(result.total_usd)}</strong></td>
                <td class="amount-col" id="priceTotalUgx">${fmtMoney(result.total_ugx, 'UGX')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per-Guest Breakdown (shown when guest_breakdown present in pricing_data) -->
      ${(() => {
        const pd = result.pricing_data || {};
        const nights = result.nights || (result.duration_days ? result.duration_days - 1 : '—');
        const guestBd = pd.guest_breakdown || [];
        const actBd = pd.activity_breakdown || [];
        let html = '';

        if (guestBd.length > 0) {
          html += `
          <div class="card mb-5">
            <div class="card-header" style="padding:var(--space-4) var(--space-5)">
              <span class="card-title" style="font-size:var(--text-base)">Per-Guest Cost Breakdown</span>
              <span style="font-size:var(--text-xs);color:var(--text-muted)">${nights} nights (= ${result.duration_days || '—'} days − 1)</span>
            </div>
            <div style="overflow-x:auto">
              <table class="price-results-table">
                <thead><tr>
                  <th>Guest</th><th>Lodge</th><th>Room</th><th>Meal</th>
                  <th style="text-align:right">Accommodation</th>
                  <th style="text-align:right">Activities</th>
                  <th style="text-align:right">Guest Total</th>
                </tr></thead>
                <tbody>
                  ${guestBd.map(g => `
                    <tr>
                      <td style="font-weight:600">${escapeHtml(g.guest_id || '—')}</td>
                      <td style="font-size:var(--text-xs)">${escapeHtml(g.lodge || '—')}</td>
                      <td style="font-size:var(--text-xs)">${escapeHtml(g.room_type || '—')}</td>
                      <td style="font-size:var(--text-xs)">${escapeHtml(g.meal_plan || 'BB')}</td>
                      <td class="amount-col">${fmtMoney(g.accommodation_total)}</td>
                      <td class="amount-col">${fmtMoney(g.activity_total)}</td>
                      <td class="amount-col" style="font-weight:600">${fmtMoney(g.guest_total)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
        }

        if (actBd.length > 0) {
          html += `
          <div class="card mb-5">
            <div class="card-header" style="padding:var(--space-4) var(--space-5)">
              <span class="card-title" style="font-size:var(--text-base)">Activity Breakdown</span>
            </div>
            <div style="overflow-x:auto">
              <table class="price-results-table">
                <thead><tr>
                  <th>Activity</th><th>Day</th>
                  <th style="text-align:right">Cost / Person</th>
                  <th style="text-align:right">Guests</th>
                  <th style="text-align:right">Total</th>
                </tr></thead>
                <tbody>
                  ${actBd.map(a => `
                    <tr>
                      <td>${escapeHtml(a.name || '—')}</td>
                      <td style="font-size:var(--text-xs)">${escapeHtml(String(a.day || '—'))}</td>
                      <td class="amount-col">${fmtMoney(a.cost_per_person)}</td>
                      <td class="amount-col">${a.num_guests || a.pax || '—'}</td>
                      <td class="amount-col" style="font-weight:600">${fmtMoney(a.total)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
        }
        return html;
      })()}

      <!-- Price Notice -->
      <div class="price-notice">
        ⚠️ <strong>Prices are subject to confirmation within 7 days</strong> due to fuel price and exchange rate fluctuations.
        <br>Trip nights: <strong>${result.nights !== undefined ? result.nights : ((result.duration_days || 7) - 1)}</strong> (= ${result.duration_days || '—'} days − 1).
        ${result.fuel_buffer_pct ? ` Fuel buffer: ${result.fuel_buffer_pct}% applied.` : ''}
        ${result.fx_buffer_pct ? ` FX buffer: ${result.fx_buffer_pct}% noted.` : ''}
      </div>

      <!-- Bank Charges Notice (populated asynchronously after price calc) -->
      <div id="pricingBankChargesNotice" style="margin-bottom:var(--space-4)">
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3);font-size:var(--text-xs);color:var(--text-muted);text-align:center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="vertical-align:middle;margin-right:4px" class="spin-icon"><path d="M6 1a5 5 0 100 10A5 5 0 006 1z" stroke="currentColor" stroke-width="1.5" stroke-dasharray="26" stroke-dashoffset="8"/></svg>
          Calculating transfer fees…
        </div>
      </div>

      <!-- Generate Quotation Button -->
      <div id="quotationGenerateWrap">
        <button class="btn btn-gold w-full" id="btnGenerateQuotation">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v9M3 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Generate Quotation PDF
        </button>
      </div>
    `;

    // Wire up live editing: when a line item USD amount changes, recalculate totals
    panel.querySelectorAll('.price-item-input').forEach(input => {
      input.addEventListener('input', () => {
        // Collect current USD values from all editable line item inputs
        let newSubtotal = 0;
        panel.querySelectorAll('.price-item-input').forEach((inp, i) => {
          const val = parseFloat(inp.value);
          if (!isNaN(val)) {
            newSubtotal += val;
            // Update the result line_items array so PDF uses edited values
            if (result.line_items[i]) result.line_items[i].total_usd = val;
            // Update UGX equivalent cell
            const ugxCell = panel.querySelector(`.price-item-ugx-cell[data-idx="${i}"]`);
            if (ugxCell) ugxCell.textContent = fmtMoney(val * fxRate, 'UGX');
          }
        });

        const newServiceFee = serviceFeePct != null ? newSubtotal * serviceFeePct / 100
          : (result.tmsf_usd || result.service_fee_usd || 0); // fallback: keep original if pct unknown
        const newTotal = newSubtotal + newServiceFee;
        const newTotalUgx = newTotal * fxRate;
        const newPerPerson = totalPax > 0 ? newTotal / totalPax : newTotal;

        // Update summary card
        const elSummaryTotal    = document.getElementById('priceSummaryTotal');
        const elSummaryTotalUgx = document.getElementById('priceSummaryTotalUgx');
        const elSummaryPerPerson = document.getElementById('priceSummaryPerPerson');
        if (elSummaryTotal)    elSummaryTotal.textContent    = fmtMoney(newTotal);
        if (elSummaryTotalUgx) elSummaryTotalUgx.textContent = fmtMoney(newTotalUgx, 'UGX') + ' equivalent';
        if (elSummaryPerPerson) elSummaryPerPerson.textContent = fmtMoney(newPerPerson);

        // Update breakdown table totals
        const elSubUsd  = document.getElementById('priceSubtotalUsd');
        const elSubUgx  = document.getElementById('priceSubtotalUgx');
        const elFeeUsd  = document.getElementById('priceServiceFeeUsd');
        const elFeeUgx  = document.getElementById('priceServiceFeeUgx');
        const elTotUsd  = document.getElementById('priceTotalUsd');
        const elTotUgx  = document.getElementById('priceTotalUgx');
        if (elSubUsd)  elSubUsd.innerHTML  = `<strong>${fmtMoney(newSubtotal)}</strong>`;
        if (elSubUgx)  elSubUgx.textContent = fmtMoney(newSubtotal * fxRate, 'UGX');
        if (elFeeUsd)  elFeeUsd.textContent  = fmtMoney(newServiceFee);
        if (elFeeUgx)  elFeeUgx.textContent  = fmtMoney(newServiceFee * fxRate, 'UGX');
        if (elTotUsd)  elTotUsd.innerHTML   = `<strong>${fmtMoney(newTotal)}</strong>`;
        if (elTotUgx)  elTotUgx.textContent  = fmtMoney(newTotalUgx, 'UGX');

        // Keep result object in sync for PDF generation
        result.subtotal_usd   = newSubtotal;
        result.tmsf_usd       = newServiceFee;
        result.service_fee_usd = newServiceFee;
        result.total_usd      = newTotal;
        result.total_ugx      = newTotalUgx;
        result.per_person_usd = newPerPerson;
      });
    });

    // Wire up the quotation button
    document.getElementById('btnGenerateQuotation').addEventListener('click', () => {
      generateQuotationPdf(result, payload);
    });
  }

  // Default fee assumptions matching the Finance Tools form defaults
  const BC_DEFAULTS = { receiving_flat: 15, receiving_pct: 0, intermediary: 25, sender_pct: 0, sender_flat: 0 };

  async function _autoCalculateBankCharges(result) {
    const invoiceTotal = result.total_usd;
    if (!invoiceTotal || invoiceTotal <= 0) return;
    try {
      const bcRes = await apiFetch('/api/calculate-transfer-fees', {
        method: 'POST',
        body: {
          invoice_total: invoiceTotal,
          receiving_bank_fee_flat: BC_DEFAULTS.receiving_flat,
          receiving_bank_fee_pct: BC_DEFAULTS.receiving_pct,
          intermediary_bank_fee: BC_DEFAULTS.intermediary,
          sender_bank_fee_pct: BC_DEFAULTS.sender_pct,
          sender_bank_fee_flat: BC_DEFAULTS.sender_flat,
          approved_by: 'auto',
        },
      });
      result.bank_charges = {
        invoice_total: invoiceTotal,
        estimated_bank_charges: bcRes.total_transfer_fees_usd,
        required_client_transfer_amount: bcRes.gross_amount_usd || bcRes.client_must_send_usd,
        exchange_rate: null,
        fee_assumptions: BC_DEFAULTS,
      };
      _updatePricingBankChargesNotice(result.bank_charges, null);
    } catch (e) {
      _updatePricingBankChargesNotice(null, e.message);
    }
  }

  function _updatePricingBankChargesNotice(bc, err) {
    const el = document.getElementById('pricingBankChargesNotice');
    if (!el) return;
    if (err || !bc) {
      el.innerHTML = `
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3);font-size:var(--text-xs);color:var(--text-muted)">
          Transfer fees could not be auto-calculated. Use <a href="#" onclick="window.TRVE.navigate('tools');return false" style="color:var(--brand-gold-dark)">Finance Tools → Transfer Calculator</a> manually.
        </div>`;
      return;
    }
    el.innerHTML = `
      <div style="background:#edfaf5;border:1px solid #6ee7c7;border-radius:var(--radius-md);padding:var(--space-4)">
        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#0d7a5f;margin-bottom:var(--space-3)">Transfer Fees (auto-calculated)</div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:4px var(--space-3);font-size:var(--text-sm);align-items:center">
          <span style="color:var(--text-secondary)">Invoice Total</span>
          <span style="font-family:var(--font-mono);text-align:right">${fmtMoney(bc.invoice_total)}</span>
          <span style="color:var(--text-secondary)">Estimated bank charges</span>
          <span style="font-family:var(--font-mono);text-align:right;color:var(--danger)">+ ${fmtMoney(bc.estimated_bank_charges)}</span>
          <span style="font-weight:600;border-top:1px solid #6ee7c7;padding-top:4px">Client must send</span>
          <span style="font-family:var(--font-mono);text-align:right;font-weight:700;border-top:1px solid #6ee7c7;padding-top:4px">${fmtMoney(bc.required_client_transfer_amount)}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--space-2)">
          Assumes: USD ${bc.fee_assumptions.receiving_flat} receiving flat + USD ${bc.fee_assumptions.intermediary} intermediary.
          <a href="#" onclick="window.TRVE.navigate('tools');return false" style="color:var(--brand-gold-dark)">Adjust in Finance Tools</a>
        </div>
      </div>`;
  }

  function generateQuotationPdf(result, payload) {
    // MAJOR-19: Replace window.prompt with styled modal
    const modal = document.getElementById('quotationModal');
    const nameInput = document.getElementById('qmClientName');
    const emailInput = document.getElementById('qmClientEmail');
    const refInput = document.getElementById('qmBookingRef');
    const validInput = document.getElementById('qmValidDays');
    const submitBtn = document.getElementById('qmSubmitBtn');
    const closeBtn = document.getElementById('quotationModalClose');

    // Pre-fill from linked enquiry if available
    let prefillName = '';
    let prefillEmail = '';
    let prefillRef = '';
    if (state.curation && state.curation.enquiryId) {
      const enq = state.enquiries.find(e => e.id === state.curation.enquiryId);
      if (enq) {
        prefillName = enq.client_name || '';
        prefillEmail = enq.email || '';
        prefillRef = enq.booking_ref || '';
      }
    }
    nameInput.value = prefillName;
    emailInput.value = prefillEmail;
    refInput.value = prefillRef;
    validInput.value = 14;

    // Show modal
    modal.classList.remove('hidden');
    nameInput.focus();

    // Close handlers
    function closeModal() { modal.classList.add('hidden'); }
    closeBtn.onclick = closeModal;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Pre-fill bank charges display from auto-calculated result
    const bc = result.bank_charges;
    const qmInvTotal = document.getElementById('qmInvoiceTotal');
    const qmEstBC = document.getElementById('qmEstBankCharges');
    const qmMustSend = document.getElementById('qmClientMustSend');
    const qmBCNote = document.getElementById('qmBankChargesNote');
    if (bc) {
      if (qmInvTotal) qmInvTotal.textContent = fmtMoney(bc.invoice_total);
      if (qmEstBC) qmEstBC.textContent = '+ ' + fmtMoney(bc.estimated_bank_charges);
      if (qmMustSend) qmMustSend.textContent = fmtMoney(bc.required_client_transfer_amount);
      if (qmBCNote) qmBCNote.textContent = `Assumes: USD ${bc.fee_assumptions.receiving_flat} receiving flat + USD ${bc.fee_assumptions.intermediary} intermediary.`;
    } else {
      if (qmInvTotal) qmInvTotal.textContent = fmtMoney(result.total_usd);
      if (qmEstBC) qmEstBC.textContent = 'calculating…';
      if (qmMustSend) qmMustSend.textContent = '—';
      if (qmBCNote) qmBCNote.textContent = 'Bank charges not yet available — use Finance Tools → Transfer Calculator if needed.';
      // Style block as pending
      const bcBlock = document.getElementById('qmBankChargesBlock');
      if (bcBlock) { bcBlock.style.background = '#FFF8E7'; bcBlock.style.borderColor = 'var(--brand-gold)'; }
      const noteEl = document.getElementById('qmBankChargesNote');
      if (noteEl) noteEl.style.color = 'var(--brand-gold-dark)';
    }

    // Submit handler (one-time)
    submitBtn.onclick = async () => {
      const clientName = nameInput.value.trim();
      if (!clientName) {
        nameInput.style.borderColor = 'var(--danger)';
        nameInput.focus();
        return;
      }
      nameInput.style.borderColor = '';

      closeModal();

      const wrap = document.getElementById('quotationGenerateWrap');
      const genBtn = document.getElementById('btnGenerateQuotation');
      genBtn.classList.add('loading');
      genBtn.disabled = true;

      const bcData = result.bank_charges || {};
      const includeBankCharges = (document.getElementById('qmIncludeBankCharges')?.value ?? 'yes') === 'yes';
      function round2(v) { return Math.round(v * 100) / 100; }
      const quotationPayload = {
        pricing_data: {
          ...(result.pricing_data || result),
          // Bank charge data — always stored internally regardless of invoice option
          invoice_total: result.total_usd,
          estimated_bank_charges: bcData.estimated_bank_charges || null,
          required_client_transfer_amount: bcData.required_client_transfer_amount || null,
          required_transfer_amount: bcData.required_client_transfer_amount || null,
          transfer_fees_estimated: bcData.estimated_bank_charges || null,
          exchange_rate_at_quote: bcData.exchange_rate || null,
          fee_assumptions: bcData.fee_assumptions || null,
          include_bank_charges_in_invoice: includeBankCharges,
        },
        client_name: clientName || 'Guest',
        client_email: emailInput.value.trim() || null,
        booking_ref: refInput.value.trim() || null,
        valid_days: parseInt(validInput.value) || 14,
        itinerary_id: payload.itinerary_id || null,
        pax: payload.pax,
        nationality_tier: payload.nationality_tier,
        extra_vehicle_days: payload.extra_vehicle_days || 0,
        commission_type: payload.commission_type || null,
        include_bank_charges_in_invoice: includeBankCharges,
      };

    try {
      const data = await apiFetch('/api/generate-quotation', { method: 'POST', body: quotationPayload });
      toast('success', 'Quotation generated!', `${data.quotation_id || 'QTN'} is ready for download.`);

      // Show delivery options
      const qtnId = escapeHtml(data.id || data.quotation_id);
      const clientEmail = escapeHtml(data.client_email || '');
      const validDays = data.valid_days || 14;
      wrap.innerHTML = `
        <div style="background:var(--success-bg);border:1.5px solid var(--success);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center">
          <div style="color:var(--success);font-weight:600;margin-bottom:var(--space-2)">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="vertical-align:middle;margin-right:6px"><circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 9l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Quotation Ready
          </div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-3)">
            ${qtnId} &middot; Valid for ${validDays} days
          </div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">
            How would you like to deliver this quotation?
          </div>
          <div style="display:flex;gap:var(--space-2);justify-content:center;flex-wrap:wrap">
            <a href="${API}/api/quotations/${qtnId}/pdf"
               target="_blank" rel="noopener" class="btn btn-gold">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v9M3 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Download PDF
            </a>
            <button class="btn btn-primary" id="btnSendQuotationEmail" data-qid="${qtnId}" data-email="${clientEmail}">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M1 4l6 4 6-4" stroke="currentColor" stroke-width="1.3"/></svg>
              Send to Client by Email
            </button>
            <button class="btn btn-secondary" onclick="window.TRVE.navigate('quotations')">
              View All Quotations
            </button>
          </div>
          <div id="emailDeliveryStatus" style="margin-top:var(--space-3);font-size:var(--text-sm)"></div>
        </div>
      `;

      // Wire up email send button
      const emailBtn = document.getElementById('btnSendQuotationEmail');
      if (emailBtn) {
        emailBtn.addEventListener('click', async () => {
          const qid = emailBtn.dataset.qid;
          const email = emailBtn.dataset.email;
          const statusEl = document.getElementById('emailDeliveryStatus');
          if (!email || !email.includes('@')) {
            statusEl.innerHTML = '<span style="color:var(--danger)">No valid email address on this quotation. Edit the quotation to add one.</span>';
            return;
          }
          emailBtn.disabled = true;
          emailBtn.textContent = 'Sending…';
          try {
            await apiFetch(`/api/quotations/${qid}/email`, { method: 'POST' });
            emailBtn.innerHTML = '✓ Email Sent';
            emailBtn.style.background = 'var(--success)';
            statusEl.innerHTML = `<span style="color:var(--success)">Quotation emailed to ${escapeHtml(email)}</span>`;
          } catch (err) {
            emailBtn.disabled = false;
            emailBtn.innerHTML = 'Send to Client by Email';
            statusEl.innerHTML = `<span style="color:var(--danger)">Email failed: ${escapeHtml(err.message)}</span>`;
          }
        });
      }
    } catch (err) {
      toast('error', 'Failed to generate quotation', err.message);
      genBtn.classList.remove('loading');
      genBtn.disabled = false;
    }
    }; // end submitBtn.onclick
  }

  /* ============================================================
     VIEW: QUOTATION VIEWER
     ============================================================ */
  const QUOTATION_STATUS_BADGE = {
    draft:    'badge-quot-draft',
    sent:     'badge-quot-sent',
    accepted: 'badge-quot-accepted',
    expired:  'badge-quot-expired'
  };

  function renderQuotationsSkeleton() {
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>Quotation #</th>
            <th>Booking Ref</th>
            <th>Client</th>
            <th>Itinerary</th>
            <th>Total USD</th>
            <th>Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${[1,2,3].map(() => `
            <tr>
              ${[1,2,3,4,5,6,7,8].map(() => `
                <td><div class="skeleton skeleton-text" style="width:${60 + Math.floor(Math.random()*30)}%"></div></td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function loadQuotations() {
    const wrap = document.getElementById('quotationsTableWrap');
    wrap.innerHTML = renderQuotationsSkeleton();

    try {
      const data = await apiFetch('/api/quotations');
      const quotations = Array.isArray(data) ? data : (data.items || []);
      state.quotations = quotations;
      renderQuotationsTable(quotations);
    } catch (err) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke="currentColor" stroke-width="1.5"/><path d="M10 10l8 8M18 10l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div class="empty-title">Failed to load quotations</div>
          <div class="empty-text">${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }

  function renderQuotationsTable(quotations) {
    const wrap = document.getElementById('quotationsTableWrap');

    if (quotations.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M18 3H7a2 2 0 00-2 2v18a2 2 0 002 2h14a2 2 0 002-2V9l-5-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M18 3v6h5M10 17h8M10 21h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div class="empty-title">No quotations yet</div>
          <div class="empty-text">Generate your first quotation from the Pricing Calculator.</div>
          <button class="btn btn-primary" onclick="window.TRVE.navigate('pricing')">Go to Pricing Calculator</button>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table class="data-table table-mobile-stack">
          <thead>
            <tr>
              <th>Quotation #</th>
              <th>Booking Ref</th>
              <th>Client</th>
              <th>Itinerary</th>
              <th style="text-align:right">Total USD</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${quotations.map(q => `
              <tr>
                <td data-label="Quote #" class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(q.id || '—')}</td>
                <td data-label="Booking" class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(q.booking_ref || '—')}</td>
                <td data-label="Client">
                  <div style="font-weight:500">${escapeHtml(q.client_name || '—')}</div>
                  ${q.client_email ? `<div style="font-size:var(--text-xs);color:var(--text-muted)">${escapeHtml(q.client_email)}</div>` : ''}
                </td>
                <td data-label="Itinerary" style="max-width:200px">
                  <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(q.itinerary_name || '')}">${
                    escapeHtml(q.itinerary_name || '—')
                  }</div>
                </td>
                <td data-label="Total USD" class="mono" style="text-align:right;white-space:nowrap">${fmtMoney(q.total_usd)}</td>
                <td data-label="Date" style="white-space:nowrap;font-size:var(--text-xs)">${fmtDate(q.created_at)}</td>
                <td data-label="Status">
                  <span class="badge ${QUOTATION_STATUS_BADGE[q.status] || 'badge-quot-draft'}">
                    ${escapeHtml(q.status || 'draft')}
                  </span>
                  ${(() => {
                    const createdMs = new Date(q.created_at).getTime();
                    const expiresMs = createdMs + (q.valid_days || 14) * 86400000;
                    const now = Date.now();
                    const daysLeft = Math.ceil((expiresMs - now) / 86400000);
                    const expiryClass = daysLeft <= 0 ? 'badge-expired' : daysLeft <= 2 ? 'badge-expiring' : 'badge-valid';
                    const expiryText = daysLeft <= 0 ? 'EXPIRED' : daysLeft <= 2 ? `Expires in ${daysLeft}d` : `Valid ${daysLeft}d`;
                    return `<span class="badge ${expiryClass}" style="margin-left:4px">${expiryText}</span>`;
                  })()}
                </td>
                <td data-label="Actions" style="white-space:nowrap">
                  <a href="${API}/api/quotations/${escapeHtml(q.id)}/pdf"
                     target="_blank" rel="noopener"
                     class="btn btn-secondary btn-sm">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    Download PDF
                  </a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function initQuotations() {
    // Quotations are loaded on navigate; nothing to init statically
  }

  /* ============================================================
     VIEW: INVOICES & VOUCHERS
     ============================================================ */

  const INV_STATUS_BADGE = {
    draft:    'badge-quot-draft',
    sent:     'badge-quot-sent',
    paid:     'badge-confirmed',
    overdue:  'badge-expired',
  };

  function loadInvoicesView() {
    // Wire up tab switching
    document.querySelectorAll('.inv-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const which = tab.dataset.invtab;
        document.getElementById('invPanelInvoices').style.display = which === 'invoices' ? '' : 'none';
        document.getElementById('invPanelVouchers').style.display = which === 'vouchers' ? '' : 'none';
        if (which === 'invoices') _fetchInvoices();
        else _fetchVouchers();
      };
    });
    _fetchInvoices();
  }

  async function _fetchInvoices(bookingRef) {
    const wrap = document.getElementById('invoicesTableWrap');
    wrap.innerHTML = `<div style="padding:var(--space-5);color:var(--text-muted);font-size:var(--text-sm)">Loading…</div>`;
    try {
      const url = bookingRef ? `/api/invoices?booking_ref=${encodeURIComponent(bookingRef)}` : '/api/invoices';
      const data = await apiFetch(url);
      const invoices = Array.isArray(data) ? data : [];
      if (!invoices.length) {
        wrap.innerHTML = `<div class="empty-state">
          <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M18 3H7a2 2 0 00-2 2v18a2 2 0 002 2h14a2 2 0 002-2V9l-5-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M18 3v6h5M10 17h8M10 21h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
          <div class="empty-title">No invoices yet</div>
          <div class="empty-text">Open a confirmed booking in the Pipeline and click "Generate Invoice".</div>
        </div>`;
        return;
      }
      wrap.innerHTML = `<div style="overflow-x:auto"><table class="data-table table-mobile-stack">
        <thead><tr>
          <th>Invoice #</th><th>Booking Ref</th><th>Client</th>
          <th style="text-align:right">Total USD</th><th>Due Date</th>
          <th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${invoices.map(inv => `<tr>
            <td data-label="Invoice #" class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(inv.invoice_number || '—')}</td>
            <td data-label="Booking" class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(inv.booking_ref || '—')}</td>
            <td data-label="Client">
              <div style="font-weight:500">${escapeHtml(inv.client_name || '—')}</div>
              ${inv.client_email ? `<div style="font-size:var(--text-xs);color:var(--text-muted)">${escapeHtml(inv.client_email)}</div>` : ''}
            </td>
            <td data-label="Total USD" class="mono" style="text-align:right;white-space:nowrap">${fmtMoney(inv.total_usd)}</td>
            <td data-label="Due Date" style="font-size:var(--text-xs);white-space:nowrap">${inv.due_date ? fmtDate(inv.due_date) : 'On receipt'}</td>
            <td data-label="Status"><span class="badge ${INV_STATUS_BADGE[inv.status] || 'badge-quot-draft'}">${escapeHtml(inv.status || 'draft')}</span></td>
            <td data-label="Actions" style="white-space:nowrap;display:flex;gap:4px;align-items:center">
              <a href="${API}/api/invoices/${escapeHtml(inv.id)}/pdf" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                PDF
              </a>
              ${inv.status !== 'paid' ? `
              <button class="btn btn-ghost btn-sm" onclick="window._markInvoicePaid('${escapeHtml(inv.id)}')">Mark Paid</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-text">${escapeHtml(err.message)}</div></div>`;
    }
  }

  window._markInvoicePaid = async function(invoiceId) {
    try {
      await apiFetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      toast('success', 'Invoice marked paid', '');
      _fetchInvoices();
    } catch (err) {
      toast('error', 'Update failed', err.message);
    }
  };

  async function _fetchVouchers(bookingRef) {
    const wrap = document.getElementById('vouchersTableWrap');
    wrap.innerHTML = `<div style="padding:var(--space-5);color:var(--text-muted);font-size:var(--text-sm)">Loading…</div>`;
    try {
      const url = bookingRef ? `/api/vouchers?booking_ref=${encodeURIComponent(bookingRef)}` : '/api/vouchers';
      const data = await apiFetch(url);
      const vouchers = Array.isArray(data) ? data : [];
      if (!vouchers.length) {
        wrap.innerHTML = `<div class="empty-state">
          <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="2" y="6" width="24" height="16" rx="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 12h24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
          <div class="empty-title">No vouchers yet</div>
          <div class="empty-text">Open a confirmed booking in the Pipeline and click "Generate Vouchers".</div>
        </div>`;
        return;
      }
      wrap.innerHTML = `<div style="overflow-x:auto"><table class="data-table table-mobile-stack">
        <thead><tr>
          <th>Voucher #</th><th>Booking Ref</th><th>Supplier</th>
          <th>Service</th><th>Dates</th><th>Guests</th>
          <th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${vouchers.map(v => `<tr>
            <td data-label="Voucher #" class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(v.voucher_number || '—')}</td>
            <td data-label="Booking" class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(v.booking_ref || '—')}</td>
            <td data-label="Supplier" style="font-weight:500">${escapeHtml(v.supplier_name || '—')}</td>
            <td data-label="Service" style="font-size:var(--text-xs)">${escapeHtml(v.service_type || '—')}</td>
            <td data-label="Dates" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(v.service_dates || '—')}</td>
            <td data-label="Guests" style="text-align:center">${v.pax || 1}</td>
            <td data-label="Status"><span class="badge ${v.status === 'sent' ? 'badge-confirmed' : 'badge-quot-draft'}">${escapeHtml(v.status || 'draft')}</span></td>
            <td data-label="Actions" style="white-space:nowrap;display:flex;gap:4px;align-items:center">
              <a href="${API}/api/vouchers/${escapeHtml(v.id)}/pdf" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                PDF
              </a>
              ${v.status !== 'sent' ? `
              <button class="btn btn-ghost btn-sm" onclick="window._markVoucherSent('${escapeHtml(v.id)}')">Mark Sent</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-text">${escapeHtml(err.message)}</div></div>`;
    }
  }

  window._markVoucherSent = async function(voucherId) {
    try {
      await apiFetch(`/api/vouchers/${voucherId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });
      toast('success', 'Voucher marked sent', '');
      _fetchVouchers();
    } catch (err) {
      toast('error', 'Update failed', err.message);
    }
  };

  /* ============================================================
     VIEW: SHEETS SYNC PANEL
     ============================================================ */

  async function renderSyncView() {
    // Clear any previous interval
    if (state.syncInterval) {
      clearInterval(state.syncInterval);
      state.syncInterval = null;
    }

    const container = document.getElementById('syncPanelContent');
    container.innerHTML = `
      <div class="sync-panel">
        <!-- Status Card -->
        <div id="syncStatusCard" class="sync-status-card card mb-5">
          <div class="card-body" style="padding: var(--space-5) var(--space-6);">
            <div class="skeleton skeleton-text" style="width:50%"></div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="card mb-5" id="syncActionsCard">
          <div class="card-header">
            <span class="card-title" style="font-size:var(--text-base);">Quick Actions</span>
          </div>
          <div class="card-body" style="padding: var(--space-4) var(--space-6);">
            <div class="skeleton skeleton-text" style="width:40%"></div>
          </div>
        </div>

        <!-- Queue Table -->
        <div class="card mb-5" id="syncQueueCard">
          <div class="card-header">
            <span class="card-title" style="font-size:var(--text-base);">Sync Queue</span>
          </div>
          <div class="card-body" style="padding: 0;" id="syncQueueBody">
            <div style="padding:var(--space-5)"><div class="skeleton skeleton-text" style="width:60%"></div></div>
          </div>
        </div>

        <!-- Sync Log -->
        <div class="card" id="syncLogCard">
          <div class="card-header">
            <span class="card-title" style="font-size:var(--text-base);">Sync Log</span>
            <span class="text-xs text-muted">Last 20 operations</span>
          </div>
          <div class="card-body" style="padding: 0;" id="syncLogBody">
            <div style="padding:var(--space-5)"><div class="skeleton skeleton-text" style="width:50%"></div></div>
          </div>
        </div>
      </div>
    `;

    // Fetch all data in parallel
    await _refreshSyncPanel();

    // Auto-refresh every 10 seconds
    state.syncInterval = setInterval(() => {
      if (state.currentView === 'sync') {
        _refreshSyncPanel();
      }
    }, 10000);
  }

  async function _refreshSyncPanel() {
    // Fire all fetches in parallel; tolerate individual failures
    const [unsyncedResult, queueResult, statusResult, quotationsResult, authResult] = await Promise.allSettled([
      apiFetch('/api/sync/unsynced'),
      apiFetch('/api/sync/queue'),
      apiFetch('/api/sync/status'),
      apiFetch('/api/quotations'),
      apiFetch('/api/auth/google/status'),
    ]);

    const unsynced   = unsyncedResult.status   === 'fulfilled' ? unsyncedResult.value   : null;
    const queue      = queueResult.status      === 'fulfilled' ? queueResult.value      : null;
    const syncStatus = statusResult.status     === 'fulfilled' ? statusResult.value     : null;
    const quotations = quotationsResult.status === 'fulfilled' ? quotationsResult.value : null;
    const authStatus = authResult.status       === 'fulfilled' ? authResult.value       : null;

    _renderSyncStatusCard(unsynced, syncStatus, authStatus);
    _renderSyncActions(quotations, authStatus);
    _renderSyncQueue(queue);
    _renderSyncLog(syncStatus);
  }

  function _renderSyncStatusCard(unsynced, syncStatus, authStatus) {
    const card = document.getElementById('syncStatusCard');
    if (!card) return;

    const unsyncedCount = unsynced ? (unsynced.count != null ? unsynced.count : (Array.isArray(unsynced) ? unsynced.length : 0)) : '—';
    const lastSync      = syncStatus && syncStatus.last_sync ? fmtDate(syncStatus.last_sync) : 'Never';
    const spreadsheet   = (syncStatus && syncStatus.spreadsheet_name) || 'TRVE_Operations_Hub_Branded';

    const oauthConnected = authStatus && authStatus.connected;
    const hasCredFile    = authStatus && authStatus.credentials_file_found;

    const pullStatusHtml = oauthConnected
      ? `<span style="color:var(--success);font-weight:600">&#10003; Google authenticated</span>`
      : hasCredFile
        ? `<span style="color:var(--gold-600)">Credentials file found &mdash; authorisation needed</span>`
        : `<span style="color:var(--text-muted)">Not connected &mdash; click Connect Google below</span>`;

    card.innerHTML = `
      <div class="card-body" style="padding: var(--space-5) var(--space-6);">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--space-4);">
          <div style="display:flex; align-items:center; gap:var(--space-4);">
            <div class="sync-connected-dot"></div>
            <div>
              <div style="font-weight:600; font-size:var(--text-base); color:var(--text-primary); margin-bottom:2px;">Connected to Operations Hub</div>
              <div style="font-size:var(--text-sm); color:var(--text-muted); font-family:var(--font-mono);">${escapeHtml(spreadsheet)}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px">
                Push (system &#8594; Sheets): fully operational &middot;
                Pull (Sheets &#8594; system): ${pullStatusHtml}
              </div>
            </div>
          </div>
          <div style="display:flex; gap:var(--space-6);">
            <div style="text-align:center;">
              <div style="font-size:var(--text-xs); font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); margin-bottom:4px;">Unsynced</div>
              <div style="font-family:var(--font-mono); font-size:var(--text-xl); font-weight:700; color:${unsyncedCount > 0 ? 'var(--gold-600)' : 'var(--success)'}">${unsyncedCount}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:var(--text-xs); font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-muted); margin-bottom:4px;">Last Sync</div>
              <div style="font-family:var(--font-mono); font-size:var(--text-sm); font-weight:600; color:var(--text-secondary);">${escapeHtml(lastSync)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function _renderSyncActions(quotationsData, authStatus) {
    const card = document.getElementById('syncActionsCard');
    if (!card) return;

    const quotations = Array.isArray(quotationsData)
      ? quotationsData
      : (quotationsData && quotationsData.items ? quotationsData.items : []);

    const quotationOptions = quotations.length > 0
      ? quotations.map(q =>
          `<option value="${escapeHtml(q.id)}">${escapeHtml(q.id)} — ${escapeHtml(q.client_name || '—')}</option>`
        ).join('')
      : '<option value="">No quotations available</option>';

    const oauthConnected = authStatus && authStatus.connected;

    const googleAuthBtnHtml = oauthConnected
      ? `<button class="btn btn-ghost btn-sm" id="btnDisconnectGoogle" style="font-size:11px;color:var(--text-muted)">
           &#10007; Disconnect Google
         </button>`
      : `<button class="btn btn-secondary" id="btnConnectGoogle">
           <svg width="14" height="14" viewBox="0 0 48 48" fill="none">
             <path d="M44.5 20H24v8h11.8C34.7 33.1 29.8 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9L37 9.7C33.4 6.5 28.9 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.7-.2-3.3-.5-5z" fill="currentColor"/>
           </svg>
           Connect Google Sheets
         </button>`;

    // Re-render card header + body
    card.innerHTML = `
      <div class="card-header">
        <span class="card-title" style="font-size:var(--text-base);">Quick Actions</span>
      </div>
      <div class="card-body" style="padding: var(--space-4) var(--space-6);">
        <div class="sync-actions">
          <button class="btn btn-primary" id="btnSyncPushAll">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M13 7.5A5.5 5.5 0 117.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M7.5 2L10 4.5M7.5 2L10 .5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Sync All Unsynced
          </button>
          <div style="display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap;">
            <select class="form-control" id="syncQuotationSelect" style="height:38px; width:auto; min-width:220px;">
              <option value="">— Select quotation —</option>
              ${quotationOptions}
            </select>
            <button class="btn btn-secondary" id="btnPushQuotation">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v9M3 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M1 11v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Push Quotation
            </button>
          </div>
          <button class="btn btn-secondary" id="btnRefreshFromSheets">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7a6 6 0 1010.77-3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M11.77 3.4L14 1l-2.23 2.4z" fill="currentColor"/>
            </svg>
            Refresh from Sheets
          </button>
          ${googleAuthBtnHtml}
        </div>
      </div>
    `;

    document.getElementById('btnSyncPushAll').addEventListener('click', syncPushAll);
    document.getElementById('btnPushQuotation').addEventListener('click', () => {
      const sel = document.getElementById('syncQuotationSelect');
      if (!sel.value) { toast('warning', 'Select a quotation first'); return; }
      syncPushQuotation(sel.value);
    });
    document.getElementById('btnRefreshFromSheets').addEventListener('click', async () => {
      const btn = document.getElementById('btnRefreshFromSheets');
      if (btn) { btn.classList.add('loading'); btn.disabled = true; }
      try {
        const result = await apiFetch('/api/sync/refresh-from-sheets', { method: 'POST' });
        toast('success', 'Sheets refreshed', result.message || `Pulled ${result.rows_fetched} rows`);
        _refreshSyncPanel();
      } catch (err) {
        // Parse structured error from backend
        let detail = err.message || 'Unknown error';
        let howToFix = null;
        try {
          const parsed = JSON.parse(err.message);
          detail = parsed.message || detail;
          howToFix = parsed.how_to_fix;
        } catch (_) { /* plain string */ }

        const fixHtml = howToFix
          ? `<div style="margin-top:8px;font-size:var(--text-xs);color:var(--text-muted)">${howToFix.join('<br>')}</div>`
          : '';

        // Show a clear, persistent error in the sync panel
        const actionsCard = document.getElementById('syncActionsCard');
        if (actionsCard) {
          let errDiv = document.getElementById('syncSheetsError');
          if (!errDiv) {
            errDiv = document.createElement('div');
            errDiv.id = 'syncSheetsError';
            errDiv.style.cssText = 'margin:var(--space-4) var(--space-6);padding:var(--space-4);background:var(--danger-subtle,#fef2f2);border:1px solid var(--danger);border-radius:var(--radius-md);font-size:var(--text-sm)';
            actionsCard.querySelector('.card-body')?.appendChild(errDiv);
          }
          errDiv.innerHTML = `<strong style="color:var(--danger)">Sheets Sync failed.</strong> ${escapeHtml(detail)}${fixHtml}
            <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;font-size:10px" onclick="document.getElementById('syncSheetsError').remove()">Dismiss</button>`;
        }
        toast('error', 'Sheets Sync failed', detail.slice(0, 120));
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
        _refreshSyncPanel();
      }
    });

    // Google OAuth buttons
    const btnConnect = document.getElementById('btnConnectGoogle');
    if (btnConnect) {
      btnConnect.addEventListener('click', async () => {
        btnConnect.disabled = true;
        try {
          const data = await apiFetch('/api/auth/google/start');
          // Open the auth URL in a new tab; callback will auto-complete
          window.open(data.auth_url, '_blank', 'width=600,height=700,noopener');
          toast('info', 'Google Auth', 'Complete the authorisation in the new tab, then refresh this panel.');
          // Poll for completion (up to 90 s)
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            try {
              const status = await apiFetch('/api/auth/google/status');
              if (status.connected) {
                clearInterval(poll);
                toast('success', 'Google Sheets Connected', 'You can now pull data from the spreadsheet.');
                _refreshSyncPanel();
              }
            } catch (_) {}
            if (attempts >= 18) clearInterval(poll); // stop after 90 s
          }, 5000);
        } catch (err) {
          toast('error', 'Connect failed', err.message || 'Could not start Google auth flow.');
        } finally {
          btnConnect.disabled = false;
        }
      });
    }

    const btnDisconnect = document.getElementById('btnDisconnectGoogle');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', async () => {
        if (!confirm('Disconnect Google Sheets? You can reconnect at any time.')) return;
        try {
          await apiFetch('/api/auth/google', { method: 'DELETE' });
          toast('success', 'Disconnected', 'Google Sheets access removed.');
          _refreshSyncPanel();
        } catch (err) {
          toast('error', 'Disconnect failed', err.message);
        }
      });
    }
  }

  function _renderSyncQueue(queue) {
    const body = document.getElementById('syncQueueBody');
    if (!body) return;

    const items = Array.isArray(queue) ? queue : (queue && queue.items ? queue.items : []);

    if (items.length === 0) {
      body.innerHTML = `
        <div class="empty-state" style="padding: var(--space-8) var(--space-6);">
          <div class="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M20 12A8 8 0 1112 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M12 4l3 3M12 4l3-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="empty-title" style="font-size:var(--text-base);">Queue is empty</div>
          <div class="empty-text">No pending sync operations.</div>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="sync-queue-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Booking Ref</th>
              <th>Target Sheet</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td style="font-weight:500;">${escapeHtml(capitalise((item.queue_type || item.type || '—').replace(/_/g, ' ')))}</td>
                <td class="mono" style="font-size:var(--text-xs);">${escapeHtml(item.booking_ref || '—')}</td>
                <td style="font-size:var(--text-xs); color:var(--text-muted);">${escapeHtml(item.target_sheet || '—')}</td>
                <td><span class="sync-status-badge ${item.status || 'pending'}">${escapeHtml(item.status || 'pending')}</span></td>
                <td style="font-size:var(--text-xs); white-space:nowrap;">${fmtDate(item.created_at)}</td>
                <td style="white-space:nowrap;">
                  ${item.status === 'pending' || !item.status ? `
                    <button class="btn btn-secondary btn-sm sync-complete-btn" data-queue-id="${escapeHtml(item.id)}">Complete</button>
                    <button class="btn btn-ghost btn-sm sync-fail-btn" data-queue-id="${escapeHtml(item.id)}" style="color:var(--danger);">Fail</button>
                  ` : '\u2014'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // MAJOR-26: Wire up sync queue buttons via addEventListener instead of inline onclick
    body.querySelectorAll('.sync-complete-btn').forEach(btn => {
      btn.addEventListener('click', () => markQueueComplete(btn.dataset.queueId));
    });
    body.querySelectorAll('.sync-fail-btn').forEach(btn => {
      btn.addEventListener('click', () => markQueueFailed(btn.dataset.queueId));
    });
  }

  function _renderSyncLog(syncStatus) {
    const body = document.getElementById('syncLogBody');
    if (!body) return;

    const ops = syncStatus && syncStatus.recent_operations ? syncStatus.recent_operations : [];

    if (ops.length === 0) {
      body.innerHTML = `
        <div style="padding:var(--space-5); text-align:center; font-size:var(--text-sm); color:var(--text-muted);">No recent operations.</div>
      `;
      return;
    }

    body.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="sync-log">
          <thead>
            <tr>
              <th>Direction</th>
              <th>Sheet</th>
              <th>Booking Ref</th>
              <th>Action</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${ops.slice(0, 20).map(op => `
              <tr>
                <td style="font-size:var(--text-xs); white-space:nowrap;">${escapeHtml(op.direction || '—')}</td>
                <td style="font-size:var(--text-xs); color:var(--text-muted); white-space:nowrap;">${escapeHtml(op.sheet_name || op.sheet || '—')}</td>
                <td class="mono" style="font-size:var(--text-xs); white-space:nowrap;">${escapeHtml(op.booking_ref || '—')}</td>
                <td style="font-size:var(--text-xs);">${escapeHtml(capitalise(op.action || '—'))}</td>
                <td><span class="sync-status-badge ${op.status || 'pending'}">${escapeHtml(op.status || '—')}</span></td>
                <td style="font-size:var(--text-xs); white-space:nowrap; font-family:var(--font-mono);">${fmtDate(op.created_at || op.timestamp)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function syncPushAll() {
    const btn = document.getElementById('btnSyncPushAll');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      const result = await apiFetch('/api/sync/push-all', { method: 'POST' });
      const pushed = result.pushed != null ? result.pushed : (result.count != null ? result.count : '');
      toast('success', 'Sync complete', pushed !== '' ? `${pushed} records pushed to Sheets` : 'All unsynced records pushed.');
      _refreshSyncPanel();
    } catch (err) {
      toast('error', 'Sync failed', err.message);
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  async function syncPushQuotation(quotationId) {
    const btn = document.getElementById('btnPushQuotation');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    try {
      await apiFetch('/api/sync/queue/push-quotation', {
        method: 'POST',
        body: { quotation_id: quotationId }
      });
      toast('success', 'Quotation queued', 'Quotation has been added to the sync queue.');
      _refreshSyncPanel();
    } catch (err) {
      toast('error', 'Push failed', err.message);
    } finally {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    }
  }

  async function markQueueComplete(id) {
    try {
      await apiFetch(`/api/sync/queue/${id}/complete`, { method: 'POST' });
      toast('success', 'Marked complete');
      _refreshSyncPanel();
    } catch (err) {
      toast('error', 'Action failed', err.message);
    }
  }

  async function markQueueFailed(id) {
    try {
      await apiFetch(`/api/sync/queue/${id}/fail`, { method: 'POST' });
      toast('warning', 'Marked as failed');
      _refreshSyncPanel();
    } catch (err) {
      toast('error', 'Action failed', err.message);
    }
  }

  // Queue action helpers now wired via addEventListener (MAJOR-26)


  // ── Save FX rate locked at quote time ────────────────────────────────────
  async function saveFxRateAtQuote(enquiryId, rawValue) {
    const rate = parseFloat(rawValue);
    if (rawValue === '' || rawValue === null) {
      // Allow clearing the field
    } else if (!rate || rate < 1000 || rate > 10000) {
      toast('warning', 'Invalid FX rate', 'Enter a valid UGX/USD rate (e.g. 3575)');
      return;
    }
    try {
      await apiFetch(`/api/enquiries/${enquiryId}`, {
        method: 'PATCH',
        body: { fx_rate_at_quote: rate || null }
      });
      // Update local state
      const enq = state.enquiries.find(e => e.id === enquiryId);
      if (enq) enq.fx_rate_at_quote = rate || null;
      toast('success', 'FX rate saved');
      // Re-render so the gain/loss delta updates immediately
      renderPipeline();
    } catch (err) {
      toast('error', 'Save failed', err.message);
    }
  }

  // ── Live FX fetch — USD/UGX from open.er-api.com (free, no key) ──────────
  async function fetchLiveFx() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) return;
      const data = await res.json();
      const rate = data?.rates?.UGX;
      if (rate && rate > 1000 && rate < 10000) {   // sanity check
        state.liveFx   = Math.round(rate);
        state.liveFxAt = new Date().toISOString();
      }
    } catch (_) { /* silent — fall back to state.liveFx default 3575 */ }
  }

  /* ============================================================
     VIEW: LODGE RATE MANAGEMENT
     ============================================================ */
  let _editingLodgeId = null;
  let _allLodges = [];

  async function loadLodgesView() {
    try {
      const data = await apiFetch('/api/lodges?limit=500');
      _allLodges = data.items || [];
      renderLodgeTable(_allLodges);
      document.getElementById('lodgeCount').textContent = `${_allLodges.length} lodge rates`;
    } catch (e) {
      const tb = document.getElementById('lodgeTableBody');
      if (tb) tb.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--danger)">Failed to load lodges: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function renderLodgeTable(lodges) {
    const tbody = document.getElementById('lodgeTableBody');
    if (!tbody) return;
    if (!lodges.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">No lodges found. Add one above.</td></tr>`;
      return;
    }
    tbody.innerHTML = lodges.map(l => `
      <tr>
        <td data-label="Lodge"><strong>${escapeHtml(l.lodge_name)}</strong></td>
        <td data-label="Room Type"><span style="font-size:var(--text-xs)">${escapeHtml(l.room_type || '')}</span></td>
        <td data-label="Country/Area"><span style="font-size:var(--text-xs)">${escapeHtml(l.country || '')} ${l.location ? '· ' + l.location : ''}</span></td>
        <td data-label="Rack Rate" style="text-align:right;font-family:var(--font-mono);font-size:var(--text-xs)">$${(l.rack_rate_usd || 0).toFixed(0)}</td>
        <td data-label="Net Rate" style="text-align:right;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--teal-700)"><strong>$${(l.net_rate_usd || 0).toFixed(0)}</strong></td>
        <td data-label="Meal Plan"><span style="font-size:var(--text-xs)">${escapeHtml(l.meal_plan || '')}</span></td>
        <td data-label="Valid"><span style="font-size:10px;color:var(--text-muted)">${l.valid_from ? l.valid_from.slice(0,7) : ''} – ${l.valid_to ? l.valid_to.slice(0,7) : ''}</span></td>
        <td data-label="Rate Source">${l.source_email_date
          ? (() => {
              const ageDays = Math.floor((Date.now() - new Date(l.source_email_date).getTime()) / 86400000);
              const stale = ageDays > 90;
              return `<span style="font-size:10px;color:${stale ? 'var(--danger)' : 'var(--text-muted)'}" title="Email date: ${l.source_email_date}">${stale ? '⚠ ' : ''}${l.source_email_date.slice(0,10)}</span>`;
            })()
          : '<span style="font-size:10px;color:var(--text-muted)">—</span>'}</td>
        <td data-label="Notes"><span style="font-size:10px;color:var(--text-muted)">${escapeHtml(l.notes || '')}</span></td>
        <td data-label="Actions" style="white-space:nowrap">
          <button class="btn btn-ghost btn-icon" title="Edit" onclick="window.TRVE.editLodge('${l.id}')">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon" title="Delete" style="color:var(--danger)" onclick="window.TRVE.deleteLodge('${l.id}', '${escapeHtml(l.lodge_name)} – ${escapeHtml(l.room_type || '')}')">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3h9M5 3V2h3v1M4 3v7h5V3H4z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function initLodgesView() {
    const saveBtn = document.getElementById('lodgeSaveBtn');
    const clearBtn = document.getElementById('lodgeClearBtn');
    const cancelBtn = document.getElementById('lodgeFormCancelBtn');
    const search = document.getElementById('lodgeSearch');
    const filterCountry = document.getElementById('lodgeFilterCountry');

    if (!saveBtn) return;

    function clearForm() {
      _editingLodgeId = null;
      document.getElementById('lodgeFormTitle').textContent = 'Add New Lodge Rate';
      cancelBtn.style.display = 'none';
      ['lf_name','lf_room_type','lf_location','lf_rack','lf_net','lf_notes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('lf_country').value = 'Uganda';
      const cfu = document.getElementById('lf_child_free_under'); if (cfu) cfu.value = 5;
      const crp = document.getElementById('lf_child_rate_pct');   if (crp) crp.value = 50;
      const caf = document.getElementById('lf_child_adult_from'); if (caf) caf.value = 12;
      document.getElementById('lf_meal').value = 'Full Board';
      document.getElementById('lf_valid_from').value = '2025-01-01';
      document.getElementById('lf_valid_to').value = '2026-12-31';
    }

    function filterLodges() {
      const q = (search.value || '').toLowerCase();
      const country = filterCountry.value;
      const filtered = _allLodges.filter(l => {
        const matchText = !q || (l.lodge_name || '').toLowerCase().includes(q) || (l.location || '').toLowerCase().includes(q) || (l.room_type || '').toLowerCase().includes(q);
        const matchCountry = !country || l.country === country;
        return matchText && matchCountry;
      });
      renderLodgeTable(filtered);
      document.getElementById('lodgeCount').textContent = `${filtered.length} of ${_allLodges.length} lodge rates`;
    }

    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('lf_name').value.trim();
      const room = document.getElementById('lf_room_type').value.trim();
      if (!name || !room) { toast('warning', 'Required fields', 'Lodge name and room type are required'); return; }
      const rack = parseFloat(document.getElementById('lf_rack').value) || 0;
      const net = parseFloat(document.getElementById('lf_net').value) || null;
      const childFreeUnder  = parseInt(document.getElementById('lf_child_free_under')?.value) ?? 5;
      const childRatePct    = parseInt(document.getElementById('lf_child_rate_pct')?.value)   ?? 50;
      const childAdultFrom  = parseInt(document.getElementById('lf_child_adult_from')?.value) ?? 12;
      const childPolicy     = JSON.stringify({ free_under: childFreeUnder, child_rate_pct: childRatePct, adult_from: childAdultFrom });
      const payload = {
        lodge_name: name,
        room_type: room,
        country: document.getElementById('lf_country').value,
        location: document.getElementById('lf_location').value.trim(),
        rack_rate_usd: rack,
        net_rate_usd: net,
        meal_plan: document.getElementById('lf_meal').value,
        valid_from: document.getElementById('lf_valid_from').value,
        valid_to: document.getElementById('lf_valid_to').value,
        notes: document.getElementById('lf_notes').value.trim(),
        child_policy: childPolicy,
      };
      try {
        if (_editingLodgeId) {
          await apiFetch(`/api/lodges/${_editingLodgeId}`, { method: 'PATCH', body: payload });
          toast('success', 'Lodge updated');
        } else {
          await apiFetch('/api/lodges', { method: 'POST', body: payload });
          toast('success', 'Lodge added');
        }
        clearForm();
        await loadLodgesView();
        // Refresh lodge list in pricing calculator too
        const lodgesData = await apiFetch('/api/lodge-rates/lodges');
        state.lodgeData = Array.isArray(lodgesData) ? lodgesData : [];
        state.lodges = state.lodgeData.map(l => l.name || l.lodge_name || '').filter(Boolean);
      } catch (e) {
        toast('error', 'Save failed', e.message);
      }
    });

    clearBtn.addEventListener('click', clearForm);
    cancelBtn.addEventListener('click', clearForm);
    search.addEventListener('input', filterLodges);
    filterCountry.addEventListener('change', filterLodges);

    // Gmail Rate Import Panel
    const btnRefreshFromGmail = document.getElementById('btnRefreshFromGmail');
    const gmailPanel = document.getElementById('gmailRateImportPanel');
    const btnClosePanel = document.getElementById('btnCloseGmailPanel');
    const btnClosePanel2 = document.getElementById('btnCloseGmailPanel2');
    const btnAddRate = document.getElementById('btnAddGmailRate');
    const btnSaveRates = document.getElementById('btnSaveGmailRates');
    const ratesList = document.getElementById('gi_rates_list');

    function _addGmailRateRow() {
      const idx = ratesList.children.length;
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;gap:8px;align-items:end';
      row.innerHTML = `
        <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Lodge Name</label>
          <input class="form-control" type="text" placeholder="e.g. Bwindi Lodge" data-gi="lodge_name" style="font-size:var(--text-xs)"></div>
        <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Room Type</label>
          <input class="form-control" type="text" placeholder="Double" data-gi="room_type" style="font-size:var(--text-xs)"></div>
        <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Rack USD</label>
          <input class="form-control" type="number" placeholder="0" data-gi="rack_rate_usd" min="0" style="font-size:var(--text-xs)"></div>
        <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Net USD</label>
          <input class="form-control" type="number" placeholder="auto 70%" data-gi="net_rate_usd" min="0" style="font-size:var(--text-xs)"></div>
        <div class="form-group" style="margin:0"><label class="form-label" style="font-size:11px">Max Occ.</label>
          <input class="form-control" type="number" placeholder="2" data-gi="max_occupancy" min="1" value="2" style="font-size:var(--text-xs)"></div>
        <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('div').remove()" title="Remove row" style="margin-bottom:0">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      `;
      ratesList.appendChild(row);
    }

    if (btnRefreshFromGmail) {
      btnRefreshFromGmail.addEventListener('click', () => {
        if (!gmailPanel) return;
        gmailPanel.style.display = '';
        if (!ratesList.children.length) _addGmailRateRow();
        document.getElementById('gi_email_date').value = new Date().toISOString().slice(0,10);
        gmailPanel.scrollIntoView({ behavior: 'smooth' });
      });
    }
    if (btnClosePanel) btnClosePanel.addEventListener('click', () => { gmailPanel.style.display = 'none'; });
    if (btnClosePanel2) btnClosePanel2.addEventListener('click', () => { gmailPanel.style.display = 'none'; });
    if (btnAddRate) btnAddRate.addEventListener('click', _addGmailRateRow);

    if (btnSaveRates) {
      btnSaveRates.addEventListener('click', async () => {
        const emailDate = document.getElementById('gi_email_date')?.value;
        if (!emailDate) { toast('warning', 'Email date required', 'Enter the date of the email containing these rates'); return; }
        const rates = [];
        ratesList.querySelectorAll('div[style*="grid"]').forEach(row => {
          const lodge = row.querySelector('[data-gi="lodge_name"]')?.value.trim();
          if (!lodge) return;
          rates.push({
            lodge_name: lodge,
            room_type: row.querySelector('[data-gi="room_type"]')?.value.trim() || 'Double',
            rack_rate_usd: parseFloat(row.querySelector('[data-gi="rack_rate_usd"]')?.value) || 0,
            net_rate_usd: parseFloat(row.querySelector('[data-gi="net_rate_usd"]')?.value) || null,
            max_occupancy: parseInt(row.querySelector('[data-gi="max_occupancy"]')?.value) || 2,
          });
        });
        if (!rates.length) { toast('warning', 'No rates to import', 'Add at least one lodge row'); return; }
        try {
          btnSaveRates.disabled = true;
          btnSaveRates.textContent = 'Importing…';
          const result = await apiFetch('/api/lodge-rates/from-email', {
            method: 'POST',
            body: {
              email_subject: document.getElementById('gi_subject')?.value.trim() || '',
              email_date: emailDate,
              email_sender: document.getElementById('gi_sender')?.value.trim() || '',
              rates,
            }
          });
          toast('success', `Imported ${result.imported} rate(s)`, 'Lodge rates saved with email source date');
          gmailPanel.style.display = 'none';
          ratesList.innerHTML = '';
          await loadLodgesView();
          // Refresh lodge data for pricing
          const lodgesData = await apiFetch('/api/lodge-rates/lodges');
          state.lodgeData = Array.isArray(lodgesData) ? lodgesData : [];
          state.lodges = state.lodgeData.map(l => l.name || l.lodge_name || '').filter(Boolean);
        } catch (e) {
          toast('error', 'Import failed', e.message);
        } finally {
          btnSaveRates.disabled = false;
          btnSaveRates.textContent = 'Import Rates';
        }
      });
    }
  }

  window.TRVE.editLodge = function(id) {
    const lodge = _allLodges.find(l => l.id === id);
    if (!lodge) return;
    _editingLodgeId = id;
    document.getElementById('lodgeFormTitle').textContent = 'Edit Lodge Rate';
    document.getElementById('lodgeFormCancelBtn').style.display = '';
    document.getElementById('lf_name').value = lodge.lodge_name || '';
    document.getElementById('lf_room_type').value = lodge.room_type || '';
    document.getElementById('lf_country').value = lodge.country || 'Uganda';
    document.getElementById('lf_location').value = lodge.location || '';
    document.getElementById('lf_rack').value = lodge.rack_rate_usd || '';
    document.getElementById('lf_net').value = lodge.net_rate_usd || '';
    document.getElementById('lf_meal').value = lodge.meal_plan || 'Full Board';
    document.getElementById('lf_valid_from').value = lodge.valid_from || '2025-01-01';
    document.getElementById('lf_valid_to').value = lodge.valid_to || '2026-12-31';
    document.getElementById('lf_notes').value = lodge.notes || '';
    // Populate child policy fields
    try {
      const cp = typeof lodge.child_policy === 'string'
        ? JSON.parse(lodge.child_policy)
        : (lodge.child_policy || {});
      const cfu = document.getElementById('lf_child_free_under'); if (cfu) cfu.value = cp.free_under ?? cp.free_under_age ?? 5;
      const crp = document.getElementById('lf_child_rate_pct');   if (crp) crp.value = cp.child_rate_pct ?? 50;
      const caf = document.getElementById('lf_child_adult_from'); if (caf) caf.value = cp.adult_from ?? cp.child_under_age ?? 12;
    } catch (_) {}
    document.getElementById('lodgeFormCard').scrollIntoView({ behavior: 'smooth' });
  };

  window.TRVE.deleteLodge = async function(id, label) {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/lodges/${id}`, { method: 'DELETE' });
      toast('success', 'Lodge deleted');
      await loadLodgesView();
    } catch (e) {
      toast('error', 'Delete failed', e.message);
    }
  };

  async function init() {
    initSidebar();
    initEnquiryForm();
    initPipelineControls();
    initCurationPanel();
    initPricingForm();
    initQuotations();
    initLodgesView();

    // Fetch live USD/UGX rate for FX exposure calculations
    await fetchLiveFx();

    // Load API config
    try {
      state.apiConfig = await apiFetch('/api/config');
      // Update buffer UI with server values
      const fb = document.getElementById('fuelBufferInput');
      const xb = document.getElementById('fxBufferInput');
      if (fb && state.apiConfig?.fuel_buffer_pct != null) fb.value = state.apiConfig.fuel_buffer_pct;
      if (xb && state.apiConfig?.fx_buffer_pct != null) xb.value = state.apiConfig.fx_buffer_pct;
    } catch (e) {
      toast('warning', 'Config not loaded', 'Some features may use default values');
    }

    // Health check + periodic re-check (MAJOR-25)
    await checkHealth();
    setInterval(checkHealth, 30000); // Re-check every 30 seconds

    // Start on pipeline
    navigate('pipeline');

    // Phase 3: load task badge + due today widget
    _refreshTasksBadge();
    _loadDueTodayWidget();
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // T3 — FINANCE TOOLS VIEW: Bank Charges Calculator
  // Stanbic Business 2025 + Absa Business 2025 tariffs (all + 15% excise duty)
  // Source: Official tariff guides published Jan 2025
  // ══════════════════════════════════════════════════════════════════════════

  const EXCISE = 0.15; // Uganda excise duty on bank charges

  // fee() → adds 15% excise duty to base fee
  function withExcise(base) { return Math.round(base * (1 + EXCISE)); }
  // pct fee: amount × rate, capped if cap given, floored at min
  function pctFee(amount, rate, min, max) {
    let fee = amount * rate;
    if (min != null) fee = Math.max(fee, min);
    if (max != null) fee = Math.min(fee, max);
    return Math.round(fee);
  }

  // Each entry: { key, label, needsAmount, needsEntries, calc }
  // calc(amount, entries) → { base, excise, total, breakdown }
  const BANK_TARIFFS = {
    stanbic: [
      {
        key: 'rtgs_branch', label: 'RTGS (branch counter)',
        needsAmount: false,
        calc: () => { const b = 20000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 20,000 + 15% excise' }; }
      },
      {
        key: 'rtgs_bol', label: 'RTGS (Business Online / BOL)',
        needsAmount: false,
        calc: () => { const b = 10000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 10,000 + 15% excise' }; }
      },
      {
        key: 'eft_branch', label: 'EFT Outward (branch)',
        needsAmount: false,
        calc: () => { const b = 4000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 4,000 + 15% excise' }; }
      },
      {
        key: 'eft_bol', label: 'EFT Outward (BOL)',
        needsAmount: false,
        calc: () => { const b = 2000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 2,000 + 15% excise' }; }
      },
      {
        key: 'tt_outward', label: 'International TT (outward)',
        needsAmount: false,
        calc: () => { const b = 30000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'UGX 30,000 + 15% excise + correspondent bank fees (variable)' }; }
      },
      {
        key: 'tt_inward', label: 'International TT (inward)',
        needsAmount: false,
        calc: () => { const b = 6000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 6,000 + 15% excise' }; }
      },
      {
        key: 'iat', label: 'Internal Account Transfer (IAT)',
        needsAmount: false,
        calc: () => { const b = 2500; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 2,500 + 15% excise' }; }
      },
      {
        key: 'cash_withdraw', label: 'Cash Withdrawal',
        needsAmount: true,
        calc: (amount) => {
          let base;
          if (amount <= 5000000) { base = 12000; }
          else { base = pctFee(amount, 0.0025, null, 35000); }
          const e = Math.round(base * EXCISE);
          return { base, excise: e, total: base+e, breakdown: amount <= 5000000 ? 'Flat UGX 12,000 (≤ UGX 5M) + 15% excise' : '0.25% of amount, max UGX 35,000 + 15% excise' };
        }
      },
      {
        key: 'mobile_wallet', label: 'SBU → MTN/Airtel Wallet',
        needsAmount: false,
        calc: () => { const b = 1200; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 1,200 + 15% excise' }; }
      },
      {
        key: 'salary', label: 'Salary Processing (per entry)',
        needsEntries: true,
        calc: (amount, entries) => { const b = 4000 * (entries || 1); const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: `UGX 4,000 × ${entries || 1} entries + 15% excise` }; }
      },
      {
        key: 'account_mgmt', label: 'Monthly Account Management',
        needsAmount: false,
        calc: () => { const b = 35000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 35,000/month + 15% excise' }; }
      },
      {
        key: 'bol_monthly', label: 'Business Online (BOL) Monthly',
        needsAmount: false,
        calc: () => { const b = 50000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 50,000/month + 15% excise' }; }
      },
      {
        key: 'bank_cheque', label: 'Bank Cheque (issued)',
        needsAmount: false,
        calc: () => { const b = 25000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 25,000 + 15% excise' }; }
      },
      {
        key: 'returned_cheque', label: 'Returned Cheque',
        needsAmount: false,
        calc: () => { const b = 250000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 250,000 + 15% excise' }; }
      },
    ],
    absa: [
      {
        key: 'rtgs_branch', label: 'RTGS (branch counter)',
        needsAmount: false,
        calc: () => { const b = 21000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 21,000 + 15% excise' }; }
      },
      {
        key: 'rtgs_digital', label: 'RTGS (digital / app)',
        needsAmount: false,
        calc: () => { const b = 10000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 10,000 + 15% excise' }; }
      },
      {
        key: 'eft_digital', label: 'EFT (digital, per entry)',
        needsEntries: true,
        calc: (amount, entries) => { const b = 4000 * (entries || 1); const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: `UGX 4,000 × ${entries || 1} entries + 15% excise` }; }
      },
      {
        key: 'swift', label: 'International SWIFT (outward)',
        needsAmount: false,
        calc: () => { const b = 40000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'UGX 40,000 + 15% excise + correspondent bank fees (variable)' }; }
      },
      {
        key: 'cash_withdraw', label: 'Cash Withdrawal',
        needsAmount: true,
        calc: (amount) => {
          const base = pctFee(amount, 0.0025, 10000, 35000);
          const e = Math.round(base * EXCISE);
          return { base, excise: e, total: base+e, breakdown: '0.25% of amount, min UGX 10,000, max UGX 35,000 + 15% excise' };
        }
      },
      {
        key: 'standing_order', label: 'Standing Order to Other Bank',
        needsAmount: false,
        calc: () => { const b = 15000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 15,000 + 15% excise' }; }
      },
      {
        key: 'unpaid_standing', label: 'Unpaid Standing Order',
        needsAmount: false,
        calc: () => { const b = 100000; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 100,000 + 15% excise' }; }
      },
      {
        key: 'bill_payment', label: 'Bill Payment (digital)',
        needsAmount: false,
        calc: () => { const b = 1500; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 1,500 + 15% excise' }; }
      },
      {
        key: 'unpaid_cheque', label: 'Unpaid / Returned Cheque',
        needsAmount: false,
        calc: () => { const b = 174100; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'Flat UGX 174,100 + 15% excise' }; }
      },
      {
        key: 'bankers_cheque', label: 'Bankers Cheque',
        needsAmount: true,
        calc: (amount) => {
          const base = pctFee(amount, 0.01, 10000, 30000);
          const e = Math.round(base * EXCISE);
          return { base, excise: e, total: base+e, breakdown: '1% of amount, min UGX 10,000, max UGX 30,000 + 15% excise' };
        }
      },
      {
        key: 'visa_classic', label: 'Visa Debit Card — Classic (monthly)',
        needsAmount: false,
        calc: () => { const b = 3478; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'UGX 3,478/month + 15% excise' }; }
      },
      {
        key: 'visa_platinum', label: 'Visa Debit Card — Platinum (monthly)',
        needsAmount: false,
        calc: () => { const b = 5362; const e = Math.round(b * EXCISE); return { base: b, excise: e, total: b+e, breakdown: 'UGX 5,362/month + 15% excise' }; }
      },
    ],
  };

  // Reference tables — same data formatted for display
  const BANK_REF = {
    stanbic: [
      ['RTGS (branch)', '20,000', 'Flat'],
      ['RTGS (BOL)', '10,000', 'Flat'],
      ['EFT (branch)', '4,000', 'Flat'],
      ['EFT (BOL)', '2,000', 'Flat'],
      ['TT Outward', '30,000 + corresp. fees', 'Flat'],
      ['TT Inward', '6,000', 'Flat'],
      ['IAT', '2,500', 'Flat'],
      ['Cash Withdrawal ≤ 5M', '12,000', 'Flat'],
      ['Cash Withdrawal > 5M', '0.25% (max 35,000)', '%'],
      ['SBU → Mobile Wallet', '1,200', 'Flat'],
      ['Salary (per entry)', '4,000', '/entry'],
      ['Account Mgmt (monthly)', '35,000', 'Flat'],
      ['BOL Monthly', '50,000', 'Flat'],
      ['Bank Cheque', '25,000', 'Flat'],
      ['Returned Cheque', '250,000', 'Flat'],
      ['Utility (BOL)', '1,000', 'Flat'],
      ['Cheque Book Leaf', '1,200', '/leaf'],
    ],
    absa: [
      ['RTGS (branch)', '21,000', 'Flat'],
      ['RTGS (digital)', '10,000', 'Flat'],
      ['EFT (digital, per entry)', '4,000', '/entry'],
      ['SWIFT Outward', '40,000 + corresp. fees', 'Flat'],
      ['Cash Withdrawal', '0.25% (min 10k, max 35k)', '%'],
      ['Standing Order (other bank)', '15,000', 'Flat'],
      ['Unpaid Standing Order', '100,000', 'Flat'],
      ['Bill Payment (digital)', '1,500', 'Flat'],
      ['Unpaid Cheque', '174,100', 'Flat'],
      ['Bankers Cheque', '1% (min 10k, max 30k)', '%'],
      ['Visa Debit Classic (monthly)', '3,478', 'Flat'],
      ['Visa Debit Platinum (monthly)', '5,362', 'Flat'],
      ['Cash Deposit', 'Free', '—'],
      ['Internet/Mobile Banking', 'Free', '—'],
      ['E-statements', 'Free', '—'],
    ],
  };

  let activeBankTab = 'stanbic';

  // ── State for market data (loaded once per tools-view visit) ─────────────
  const _mktState = {
    fx:    null,   // last fetched FX response
    fees:  null,   // last fetched bank-fee benchmarks
    fuel:  null,   // last fetched fuel benchmarks
  };

  async function initToolsView() {
    renderBankTxTypes();
    renderBankRefTable();

    document.getElementById('bankTabStanbic').addEventListener('click', () => switchBankTab('stanbic'));
    document.getElementById('bankTabAbsa').addEventListener('click', () => switchBankTab('absa'));
    document.getElementById('bankTxType').addEventListener('change', calcBankCharge);
    document.getElementById('bankTxAmount').addEventListener('input', calcBankCharge);
    document.getElementById('bankTxEntries').addEventListener('input', calcBankCharge);

    // Transfer gross-up calculator
    document.getElementById('btnCalculateTransfer').addEventListener('click', runTransferGrossUp);
    document.getElementById('btnClearTransferLog').addEventListener('click', () => {
      document.getElementById('gtAuditLog').innerHTML = '<div style="color:var(--text-muted);font-style:italic">No calculations yet.</div>';
    });

    // Load market data and benchmark defaults
    document.getElementById('btnRefreshMarketData')?.addEventListener('click', () => _loadMarketData(true));
    document.getElementById('btnLoadBenchmark')?.addEventListener('click', _applyBenchmarkDefaults);

    await _loadMarketData(false);
    _watchTransferOverrides();

    // Load existing audit log from backend
    _loadTransferAuditLog();
  }

  // ── Market data loader ────────────────────────────────────────────────────
  async function _loadMarketData(force) {
    const qs = force ? '?force_refresh=true' : '';
    const [fxRes, feesRes, fuelRes] = await Promise.allSettled([
      apiFetch(`/api/market-data/fx${qs}`),
      apiFetch('/api/market-data/bank-fees'),
      apiFetch(`/api/market-data/fuel${qs}`),
    ]);
    _mktState.fx   = fxRes.status   === 'fulfilled' ? fxRes.value   : null;
    _mktState.fees = feesRes.status === 'fulfilled' ? feesRes.value : null;
    _mktState.fuel = fuelRes.status === 'fulfilled' ? fuelRes.value : null;

    _renderMarketDataPanel();
    _autoFillTransferFields();
  }

  function _renderMarketDataPanel() {
    const container = document.getElementById('marketDataRows');
    if (!container) return;

    const rows = [];

    // Exchange rate row
    if (_mktState.fx) {
      const fx = _mktState.fx;
      const staleClass  = fx.is_stale  ? 'color:var(--danger)'  : 'color:var(--success)';
      const staleBadge  = fx.is_stale  ? '<span style="font-size:9px;background:var(--danger);color:#fff;padding:1px 5px;border-radius:3px;margin-left:6px">STALE</span>' : '<span style="font-size:9px;background:var(--success);color:#fff;padding:1px 5px;border-radius:3px;margin-left:6px">LIVE</span>';
      const overrideBadge = fx.is_overridden ? `<span style="font-size:9px;background:var(--gold-600,#b45309);color:#fff;padding:1px 5px;border-radius:3px;margin-left:6px">OVERRIDE</span>` : '';
      rows.push(`
        <div style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md)">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;padding-top:2px">USD/UGX</div>
          <div>
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-family:var(--font-mono);font-size:var(--text-lg);font-weight:700;${staleClass}">${fmtNum(fx.rate)}</span>
              ${staleBadge}${overrideBadge}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
              Source: ${escapeHtml(fx.source || '—')} &middot; Updated: ${fx.fetched_at ? new Date(fx.fetched_at).toLocaleString() : '—'}
              ${fx.age_hours > 0 ? ` &middot; ${fx.age_hours}h ago` : ''}
            </div>
            ${fx.is_stale ? `<div style="font-size:10px;color:var(--danger);margin-top:2px">⚠ Rate is more than 24 hours old — click Refresh to update</div>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px;height:24px" onclick="window.TRVE._mktOverride('fx_usd_ugx','USD/UGX exchange rate')">Override</button>
            ${fx.is_overridden ? `<button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px;height:24px;color:var(--danger)" onclick="window.TRVE._mktClearOverride('fx_usd_ugx')">Revert</button>` : ''}
          </div>
        </div>`);
    } else {
      rows.push(`<div style="padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);font-size:var(--text-xs);color:var(--danger)">
        ⚠ Exchange rate unavailable — using fallback value. Check network connection.
      </div>`);
    }

    // Bank fee benchmarks row
    if (_mktState.fees && _mktState.fees.recommended_defaults) {
      const f = _mktState.fees;
      const d = f.recommended_defaults;
      rows.push(`
        <div style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md)">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;padding-top:2px">Bank Fees</div>
          <div>
            <div style="font-family:var(--font-mono);font-size:var(--text-sm);font-weight:600;color:var(--text-primary)">
              Recv $${d.receiving_flat_usd} flat · Corr $${d.intermediary_usd} · Sender $${d.sender_flat_usd}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
              Source: ${escapeHtml(f.source || '—')} &middot; Updated: ${f.fetched_at ? new Date(f.fetched_at).toLocaleString() : '—'}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${escapeHtml(d.rationale || '')}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px;height:24px" id="btnLoadBenchmarkInRow">Apply</button>
        </div>`);
    }

    // Fuel benchmark row
    if (_mktState.fuel) {
      const fuel = _mktState.fuel;
      const staleClass = fuel.is_stale ? 'color:var(--danger)' : 'color:var(--text-primary)';
      rows.push(`
        <div style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md)">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;padding-top:2px">Fuel</div>
          <div>
            <div style="font-family:var(--font-mono);font-size:var(--text-sm);font-weight:600;${staleClass}">
              Petrol $${fuel.petrol_usd_per_litre}/L · Diesel $${fuel.diesel_usd_per_litre}/L
              <span style="font-size:10px;font-weight:400;color:var(--text-muted)">(UGX ${fmtNum(fuel.petrol_ugx_per_litre)} / ${fmtNum(fuel.diesel_ugx_per_litre)})</span>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
              Source: ${escapeHtml(fuel.source || '—')} &middot; Updated: ${fuel.fetched_at ? new Date(fuel.fetched_at).toLocaleString() : '—'}
              ${fuel.age_days ? ` &middot; ${fuel.age_days}d ago` : ''}
            </div>
            ${fuel.is_stale ? `<div style="font-size:10px;color:var(--danger);margin-top:2px">⚠ Fuel price is more than 7 days old — click Refresh to update</div>` : ''}
          </div>
        </div>`);
    }

    container.innerHTML = rows.join('');

    // Wire Apply button inside row
    document.getElementById('btnLoadBenchmarkInRow')?.addEventListener('click', _applyBenchmarkDefaults);
  }

  function _autoFillTransferFields() {
    // Auto-populate exchange rate from live FX if field is empty
    const xRateEl   = document.getElementById('gtExchangeRate');
    const xBadgeEl  = document.getElementById('gtExRateBadge');
    const xSourceEl = document.getElementById('gtExRateSource');
    if (_mktState.fx && xRateEl && !xRateEl.value) {
      // Only auto-fill when the client currency field is empty (i.e. not using conversion)
      // Leave blank — user may want UGX or another currency; just show live rate context
    }
    if (_mktState.fx && xSourceEl) {
      xSourceEl.textContent = `Live USD/UGX: ${fmtNum(_mktState.fx.rate)} · ${_mktState.fx.source || ''}`;
    }

    // Auto-populate benchmark fee source label
    const srcEl = document.getElementById('gtBenchmarkSource');
    if (srcEl && _mktState.fees) {
      srcEl.textContent = `${_mktState.fees.source || 'Benchmark data'} · ${_mktState.fees.fetched_at ? new Date(_mktState.fees.fetched_at).toLocaleDateString() : ''}`;
    } else if (srcEl) {
      srcEl.textContent = 'Loading…';
    }
  }

  function _applyBenchmarkDefaults() {
    if (!_mktState.fees || !_mktState.fees.recommended_defaults) {
      toast('warning', 'No benchmark data', 'Market data is still loading. Try again in a moment.');
      return;
    }
    const d = _mktState.fees.recommended_defaults;
    const fields = {
      gtReceivingFlat: d.receiving_flat_usd,
      gtReceivingPct:  d.receiving_pct,
      gtIntermediary:  d.intermediary_usd,
      gtSenderPct:     d.sender_pct,
      gtSenderFlat:    d.sender_flat_usd,
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
      const badge = document.querySelector(`.gt-auto-badge[data-field="${id}"]`);
      if (badge) badge.style.display = '';
    });
    toast('success', 'Fee defaults loaded', `${_mktState.fees.source || 'Benchmarks'} applied`);
  }

  // Mark any auto-filled field as manually overridden when user edits it
  function _watchTransferOverrides() {
    ['gtReceivingFlat','gtReceivingPct','gtIntermediary','gtSenderPct','gtSenderFlat'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', function() {
        const badge = document.querySelector(`.gt-auto-badge[data-field="${id}"]`);
        if (badge && badge.style.display !== 'none') {
          badge.style.background = 'var(--gold-600,#b45309)';
          badge.textContent = 'override';
        }
      });
    });
  }

  // ── Override helpers (exposed for onclick in rendered HTML) ───────────────
  async function _mktOverride(key, label) {
    const current = key === 'fx_usd_ugx' && _mktState.fx ? _mktState.fx.rate : '';
    const val = prompt(`Override ${label}\n\nEnter new value (current auto-fetched: ${current}):`, current);
    if (val === null || val === '') return;
    const num = parseFloat(val);
    if (isNaN(num)) { toast('warning', 'Invalid value', 'Please enter a number'); return; }
    const by = prompt('Your name (for audit trail):') || 'unknown';
    try {
      await apiFetch('/api/market-data/override', { method: 'POST', body: { key, override_value: num, override_by: by } });
      toast('success', 'Override saved', `${label} set to ${num} by ${by}`);
      await _loadMarketData(false);
    } catch (e) {
      toast('error', 'Override failed', e.message);
    }
  }
  window.TRVE._mktOverride = _mktOverride;

  async function _mktClearOverride(key) {
    try {
      await apiFetch(`/api/market-data/override/${key}`, { method: 'DELETE' });
      toast('info', 'Override removed', 'Reverting to auto-fetched value');
      await _loadMarketData(false);
    } catch (e) {
      toast('error', 'Revert failed', e.message);
    }
  }
  window.TRVE._mktClearOverride = _mktClearOverride;

  async function runTransferGrossUp() {
    const invTotal = parseFloat(document.getElementById('gtInvoiceTotal').value);
    if (!invTotal || invTotal <= 0) {
      toast('warning', 'Invoice total required', 'Enter a positive invoice total amount');
      document.getElementById('gtInvoiceTotal').focus();
      return;
    }

    const approvedBy = document.getElementById('gtApprovedBy').value.trim();
    if (!approvedBy) {
      toast('warning', 'Confirmation required', 'Enter your name to confirm the fee assumptions');
      document.getElementById('gtApprovedBy').focus();
      return;
    }

    // Freshness check: warn if market data is stale
    if (_mktState.fx && _mktState.fx.is_stale) {
      const go = confirm('Exchange rate data is more than 24 hours old.\n\nClick OK to force a refresh before calculating, or Cancel to proceed with stale data.');
      if (go) {
        await _loadMarketData(true);
        if (_mktState.fx && _mktState.fx.is_stale) {
          toast('warning', 'Still stale', 'Could not refresh rate. Proceeding with cached value.');
        }
      }
    }
    if (_mktState.fuel && _mktState.fuel.is_stale) {
      toast('warning', 'Fuel prices outdated', 'Fuel benchmark data is more than 7 days old. Refresh market data for updated prices.');
    }

    const payload = {
      invoice_total: invTotal,
      receiving_bank_fee_flat: parseFloat(document.getElementById('gtReceivingFlat').value) || 0,
      receiving_bank_fee_pct: parseFloat(document.getElementById('gtReceivingPct').value) || 0,
      intermediary_bank_fee: parseFloat(document.getElementById('gtIntermediary').value) || 0,
      sender_bank_fee_pct: parseFloat(document.getElementById('gtSenderPct').value) || 0,
      sender_bank_fee_flat: parseFloat(document.getElementById('gtSenderFlat').value) || 0,
      approved_by: approvedBy,
    };

    const xRate = parseFloat(document.getElementById('gtExchangeRate').value);
    const clientCcy = document.getElementById('gtClientCurrency').value.trim().toUpperCase();
    const convPct = parseFloat(document.getElementById('gtConversionFeePct').value) || 0;
    if (xRate > 0 && clientCcy) {
      payload.exchange_rate = xRate;
      payload.client_currency = clientCcy;
      payload.currency_conversion_fee_pct = convPct;
    }

    try {
      const res = await apiFetch('/api/calculate-transfer-fees', { method: 'POST', body: payload });
      _renderTransferResult(res);
      _appendTransferAuditEntry(res.audit || res);
      toast('success', 'Transfer amount calculated', `Client must send ${fmtMoney(res.gross_amount_usd)}`);
    } catch (err) {
      toast('error', 'Calculation error', err.message);
    }
  }

  function _renderTransferResult(res) {
    const el = document.getElementById('gtResult');
    const hasForeign = res.client_currency && res.client_currency !== (res.currency || 'USD') && res.gross_amount_foreign;
    const feeBreakdown = res.fee_breakdown || {};
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        <!-- Summary lines -->
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-4)">
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-2)">
            <span style="font-size:var(--text-sm);color:var(--text-muted)">Invoice Total</span>
            <span style="font-family:var(--font-mono);font-weight:600">${fmtMoney(res.invoice_total_usd)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-2)">
            <span style="font-size:var(--text-sm);color:var(--text-muted)">Estimated Transfer Fees</span>
            <span style="font-family:var(--font-mono);color:var(--danger);font-weight:600">+ ${fmtMoney(res.total_transfer_fees_usd)}</span>
          </div>
          ${feeBreakdown.receiving_flat || feeBreakdown.receiving_pct_amount ? `
          <div style="display:flex;justify-content:space-between;padding-left:12px;font-size:var(--text-xs);color:var(--text-muted)">
            <span>↳ Receiving bank</span><span>${fmtMoney((feeBreakdown.receiving_flat || 0) + (feeBreakdown.receiving_pct_amount || 0))}</span>
          </div>` : ''}
          ${feeBreakdown.intermediary ? `
          <div style="display:flex;justify-content:space-between;padding-left:12px;font-size:var(--text-xs);color:var(--text-muted)">
            <span>↳ Intermediary bank</span><span>${fmtMoney(feeBreakdown.intermediary)}</span>
          </div>` : ''}
          ${(feeBreakdown.sender_flat || 0) + (feeBreakdown.sender_pct_amount || 0) > 0 ? `
          <div style="display:flex;justify-content:space-between;padding-left:12px;font-size:var(--text-xs);color:var(--text-muted)">
            <span>↳ Sender bank</span><span>${fmtMoney((feeBreakdown.sender_flat || 0) + (feeBreakdown.sender_pct_amount || 0))}</span>
          </div>` : ''}
          <div style="height:1px;background:var(--brand-gold);margin:var(--space-2) 0"></div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:var(--text-sm);font-weight:700;color:var(--brand-green)">Client Must Send (USD)</span>
            <span style="font-family:var(--font-mono);font-size:var(--text-lg);font-weight:700;color:var(--brand-green)">${fmtMoney(res.client_must_send_usd)}</span>
          </div>
          ${hasForeign ? `
          <div style="display:flex;justify-content:space-between;margin-top:var(--space-2)">
            <span style="font-size:var(--text-sm);font-weight:700;color:var(--brand-gold)">${escapeHtml(res.client_currency)} Equivalent</span>
            <span style="font-family:var(--font-mono);font-size:var(--text-base);font-weight:700;color:var(--brand-gold)">${escapeHtml(res.client_currency)} ${fmtNum(res.gross_amount_foreign)}</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-muted)">Rate: 1 USD = ${fmtNum(res.exchange_rate)} ${escapeHtml(res.client_currency)}${res.conversion_fee_pct ? ` · ${res.conversion_fee_pct}% conversion fee applied` : ''}</div>
          ` : ''}
        </div>

        <!-- Payment instruction box -->
        <div style="background:#FFF8E7;border:1px solid var(--brand-gold);border-radius:var(--radius-md);padding:var(--space-3)">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--brand-gold-dark);margin-bottom:var(--space-1)">Payment Instruction for Invoice Footer</div>
          <div style="font-size:var(--text-xs);color:#7a5200;line-height:1.6">
            Invoice Total: <strong>${fmtMoney(res.invoice_total_usd)}</strong><br>
            Estimated transfer costs: <strong>${fmtMoney(res.total_transfer_fees_usd)}</strong><br>
            <strong>Client must send: ${fmtMoney(res.client_must_send_usd)}</strong>${hasForeign ? ` / ${escapeHtml(res.client_currency)} ${fmtNum(res.gross_amount_foreign)}` : ''}<br><br>
            <em>All bank charges must be covered by the sender. The transfer amount shown ensures the company receives the full invoice value after bank deductions.</em>
          </div>
        </div>

        <!-- Confirmed by -->
        <div style="font-size:var(--text-xs);color:var(--text-muted)">
          Confirmed by: <strong>${escapeHtml(res.audit?.approved_by || '—')}</strong> · ${new Date().toLocaleString()}
        </div>
      </div>
    `;
  }

  function _appendTransferAuditEntry(entry) {
    const log = document.getElementById('gtAuditLog');
    if (!log) return;
    // Clear placeholder
    if (log.querySelector('div[style*="italic"]')) log.innerHTML = '';
    const row = document.createElement('div');
    row.style.cssText = 'border-bottom:1px solid var(--border);padding:6px 0;display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:4px;font-size:11px';
    row.innerHTML = `
      <span style="color:var(--text-muted)">${escapeHtml((entry.timestamp || '').slice(0, 16).replace('T', ' '))}</span>
      <span>Invoice: <strong>${fmtMoney(entry.invoice_total || entry.invoice_total_usd)}</strong></span>
      <span>Fees: <strong style="color:var(--danger)">${fmtMoney(entry.assumed_bank_fees || entry.total_transfer_fees_usd)}</strong></span>
      <span>Send: <strong style="color:var(--brand-green)">${fmtMoney(entry.calculated_transfer_amount || entry.client_must_send_usd)}</strong></span>
      <span>By: <strong>${escapeHtml(entry.approved_by || '—')}</strong></span>
    `;
    log.prepend(row);
  }

  async function _loadTransferAuditLog() {
    try {
      const data = await apiFetch('/api/transfer-fee-audit?limit=20');
      const items = data.items || [];
      if (items.length === 0) return;
      items.forEach(entry => _appendTransferAuditEntry(entry));
    } catch (_) { /* non-critical */ }
  }

  function switchBankTab(bank) {
    activeBankTab = bank;
    document.getElementById('bankTabStanbic').className = bank === 'stanbic' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    document.getElementById('bankTabAbsa').className = bank === 'absa' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    document.getElementById('bankRefTitle').textContent = bank === 'stanbic' ? 'Stanbic Business — Fee Reference' : 'Absa Business — Fee Reference';
    renderBankTxTypes();
    renderBankRefTable();
    // Reset result panel
    document.getElementById('bankChargeResult').innerHTML = '<div style="font-size:var(--text-xs);color:var(--text-muted)">Select a transaction type to calculate</div>';
  }

  function renderBankTxTypes() {
    const sel = document.getElementById('bankTxType');
    const tariffs = BANK_TARIFFS[activeBankTab] || [];
    sel.innerHTML = '<option value="">— Select transaction type —</option>' +
      tariffs.map(t => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('');
    document.getElementById('bankAmountGroup').style.display = 'none';
    document.getElementById('bankEntriesGroup').style.display = 'none';
  }

  function calcBankCharge() {
    const sel = document.getElementById('bankTxType');
    const key = sel.value;
    if (!key) {
      document.getElementById('bankChargeResult').innerHTML = '<div style="font-size:var(--text-xs);color:var(--text-muted)">Select a transaction type to calculate</div>';
      return;
    }
    const tariff = (BANK_TARIFFS[activeBankTab] || []).find(t => t.key === key);
    if (!tariff) return;

    // Show/hide conditional inputs
    document.getElementById('bankAmountGroup').style.display = tariff.needsAmount ? '' : 'none';
    document.getElementById('bankEntriesGroup').style.display = tariff.needsEntries ? '' : 'none';

    const amount = parseFloat(document.getElementById('bankTxAmount').value) || 0;
    const entries = parseInt(document.getElementById('bankTxEntries').value) || 1;

    const r = tariff.calc(amount, entries);
    const bankName = activeBankTab === 'stanbic' ? 'Stanbic' : 'Absa';

    document.getElementById('bankChargeResult').innerHTML = `
      <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(bankName)} · ${escapeHtml(tariff.label)}</div>
      <div style="font-family:var(--font-mono);font-size:var(--text-2xl);color:var(--brand-gold);font-weight:700;margin-bottom:4px">UGX ${fmtNum(r.total)}</div>
      <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:8px">incl. 15% excise duty (UGX ${fmtNum(r.excise)})</div>
      <div style="font-size:var(--text-xs);color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px">${escapeHtml(r.breakdown)}</div>
    `;
  }

  function renderBankRefTable() {
    const rows = BANK_REF[activeBankTab] || [];
    const el = document.getElementById('bankRefTable');
    if (!el) return;
    el.innerHTML = `
      <table class="pipeline-table" style="width:100%">
        <thead>
          <tr>
            <th style="text-align:left;padding:var(--space-3) var(--space-4)">Transaction</th>
            <th style="text-align:right;padding:var(--space-3) var(--space-4)">Base Fee (UGX)</th>
            <th style="text-align:right;padding:var(--space-3) var(--space-4)">+ 15% Excise</th>
            <th style="text-align:left;padding:var(--space-3) var(--space-4)">Type</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([label, fee, type], i) => {
            const base = fee.replace(/[^0-9]/g, '');
            const isFlat = /^\d+$/.test(base) && !fee.includes('%');
            const exciseDisplay = isFlat ? fmtNum(Math.round(parseInt(base) * EXCISE)) : '—';
            return `
              <tr style="background:${i % 2 === 0 ? 'transparent' : 'var(--bg-surface)'}">
                <td style="padding:var(--space-2) var(--space-4);font-size:var(--text-sm)">${escapeHtml(label)}</td>
                <td style="padding:var(--space-2) var(--space-4);font-family:var(--font-mono);font-size:var(--text-xs);text-align:right;color:var(--text-secondary)">${escapeHtml(fee)}</td>
                <td style="padding:var(--space-2) var(--space-4);font-family:var(--font-mono);font-size:var(--text-xs);text-align:right;color:var(--brand-gold)">${exciseDisplay}</td>
                <td style="padding:var(--space-2) var(--space-4);font-size:var(--text-xs);color:var(--text-muted)">${escapeHtml(type)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }


  /* ============================================================
     REPORTS & ANALYTICS VIEW
     ============================================================ */
  async function loadReportsView() {
    const container = document.getElementById('reportsContent');
    if (!container) return;
    container.innerHTML = '<div class="card" style="padding:var(--space-6);text-align:center;color:var(--text-muted)">Loading reports…</div>';

    let data;
    try {
      data = await apiFetch('/api/reports/summary');
    } catch (err) {
      container.innerHTML = `<div class="card" style="padding:var(--space-6);text-align:center;color:var(--danger)">Failed to load reports: ${escapeHtml(err.message)}</div>`;
      return;
    }

    const s = data.summary || {};
    const fmtUsd = (v) => v != null ? `$${Number(v).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}` : '—';
    const fmtPct = (v) => v != null ? `${v}%` : '—';

    // KPI cards
    const kpiCards = [
      { label: 'Total Bookings', value: s.total_bookings ?? '—', sub: `${s.bookings_this_month ?? 0} this month`, color: 'var(--teal-600)' },
      { label: 'Confirmed', value: s.confirmed_bookings ?? '—', sub: `${fmtPct(s.conversion_rate_pct)} conversion`, color: 'var(--success)' },
      { label: 'Total Revenue', value: fmtUsd(s.total_revenue_usd), sub: `${fmtUsd(s.total_paid_usd)} received`, color: 'var(--brand-gold)' },
      { label: 'Outstanding Balance', value: fmtUsd(s.outstanding_balance_usd), sub: 'across all bookings', color: s.outstanding_balance_usd > 0 ? 'var(--danger)' : 'var(--success)' },
      { label: 'Pipeline Value', value: fmtUsd(s.pipeline_value_usd), sub: 'Active + Unconfirmed quotes', color: 'var(--info)' },
      { label: 'Avg Deal Size', value: fmtUsd(s.avg_deal_usd), sub: 'confirmed bookings only', color: 'var(--teal-600)' },
    ];

    const kpiHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--space-4);margin-bottom:var(--space-5)">
        ${kpiCards.map(k => `
          <div class="card" style="padding:var(--space-4)">
            <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:var(--space-2)">${escapeHtml(k.label)}</div>
            <div style="font-size:var(--text-2xl);font-weight:700;color:${k.color};font-family:var(--font-mono);line-height:1.1;margin-bottom:var(--space-1)">${escapeHtml(String(k.value))}</div>
            <div style="font-size:var(--text-xs);color:var(--text-muted)">${escapeHtml(k.sub)}</div>
          </div>
        `).join('')}
      </div>
    `;

    // By status table
    const statusOrder = ['New_Inquiry','Active_Quote','Unconfirmed','Confirmed','In_Progress','Completed','Cancelled'];
    const statusLabelMap = {
      New_Inquiry: 'New Inquiry', Active_Quote: 'Active Quote', Confirmed: 'Confirmed',
      In_Progress: 'In Progress', Completed: 'Completed', Cancelled: 'Cancelled', Unconfirmed: 'Unconfirmed'
    };
    const byStatus = data.by_status || {};
    const totalForBar = Math.max(1, Object.values(byStatus).reduce((a, b) => a + b, 0));
    const statusRows = statusOrder
      .filter(s => byStatus[s])
      .concat(Object.keys(byStatus).filter(s => !statusOrder.includes(s)))
      .map(k => {
        const cnt = byStatus[k] || 0;
        const pct = Math.round((cnt / totalForBar) * 100);
        return `<tr>
          <td style="padding:var(--space-2) var(--space-3)">${escapeHtml(statusLabelMap[k] || k)}</td>
          <td style="padding:var(--space-2) var(--space-3);font-family:var(--font-mono);text-align:right">${cnt}</td>
          <td style="padding:var(--space-2) var(--space-3);min-width:120px">
            <div style="background:var(--bg-surface);border-radius:4px;overflow:hidden;height:10px">
              <div style="height:10px;border-radius:4px;background:var(--teal-600);width:${pct}%"></div>
            </div>
          </td>
          <td style="padding:var(--space-2) var(--space-3);font-size:var(--text-xs);color:var(--text-muted);text-align:right">${pct}%</td>
        </tr>`;
      }).join('');

    // By coordinator
    const byCoord = data.by_coordinator || {};
    const coordRows = Object.entries(byCoord).map(([k, v]) => `
      <tr>
        <td style="padding:var(--space-2) var(--space-3)">${escapeHtml(k)}</td>
        <td style="padding:var(--space-2) var(--space-3);font-family:var(--font-mono);text-align:right">${v}</td>
      </tr>`).join('') || '<tr><td colspan="2" style="padding:var(--space-3);text-align:center;color:var(--text-muted)">No data</td></tr>';

    // By channel
    const byChan = data.by_channel || {};
    const chanRows = Object.entries(byChan).map(([k, v]) => `
      <tr>
        <td style="padding:var(--space-2) var(--space-3)">${escapeHtml(k)}</td>
        <td style="padding:var(--space-2) var(--space-3);font-family:var(--font-mono);text-align:right">${v}</td>
      </tr>`).join('') || '<tr><td colspan="2" style="padding:var(--space-3);text-align:center;color:var(--text-muted)">No data</td></tr>';

    // Monthly revenue chart
    const monthly = data.monthly_revenue || [];
    const maxRev = Math.max(1, ...monthly.map(m => m.revenue || 0));
    const monthlyChart = monthly.length ? `
      <div style="display:flex;align-items:flex-end;gap:8px;height:80px;padding:0 var(--space-2)">
        ${monthly.map(m => {
          const h = Math.max(4, Math.round((m.revenue / maxRev) * 72));
          const label = m.month ? m.month.slice(5) : '—';
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
            <div style="font-size:9px;color:var(--brand-gold);font-family:var(--font-mono)">$${Math.round((m.revenue||0)/1000)}k</div>
            <div title="${escapeHtml(m.month)}: $${(m.revenue||0).toLocaleString()}" style="width:100%;background:var(--teal-600);border-radius:3px 3px 0 0;height:${h}px;opacity:0.85"></div>
            <div style="font-size:9px;color:var(--text-muted)">${escapeHtml(label)}</div>
          </div>`;
        }).join('')}
      </div>
    ` : '<div style="text-align:center;color:var(--text-muted);font-size:var(--text-sm);padding:var(--space-4)">No payment data in the last 6 months</div>';

    // Recent payments
    const recentPay = data.recent_payments || [];
    const payRows = recentPay.length ? recentPay.map(p => `
      <tr>
        <td style="padding:var(--space-2) var(--space-3);font-family:var(--font-mono);font-size:var(--text-xs)">${escapeHtml(p.booking_ref || '—')}</td>
        <td style="padding:var(--space-2) var(--space-3)">${escapeHtml(p.client_name || '—')}</td>
        <td style="padding:var(--space-2) var(--space-3);font-family:var(--font-mono);text-align:right;color:var(--success)">${fmtUsd(p.amount_usd)}</td>
        <td style="padding:var(--space-2) var(--space-3);font-size:var(--text-xs);color:var(--text-muted)">${escapeHtml(p.payment_date || '—')}</td>
        <td style="padding:var(--space-2) var(--space-3);font-size:var(--text-xs);color:var(--text-muted)">${escapeHtml(p.method || '—')}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="padding:var(--space-4);text-align:center;color:var(--text-muted)">No payments recorded yet</td></tr>';

    container.innerHTML = `
      ${kpiHtml}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-4)">

        <!-- By Status -->
        <div class="card">
          <div class="card-header"><span class="card-title">Bookings by Status</span></div>
          <div class="card-body" style="padding:0">
            <table style="width:100%;border-collapse:collapse">
              <tbody>${statusRows || '<tr><td colspan="4" style="padding:var(--space-3);text-align:center;color:var(--text-muted)">No data</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <!-- By Coordinator + By Channel -->
        <div style="display:flex;flex-direction:column;gap:var(--space-4)">
          <div class="card">
            <div class="card-header"><span class="card-title">By Coordinator</span></div>
            <div class="card-body" style="padding:0">
              <table style="width:100%;border-collapse:collapse"><tbody>${coordRows}</tbody></table>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">By Channel</span></div>
            <div class="card-body" style="padding:0">
              <table style="width:100%;border-collapse:collapse"><tbody>${chanRows}</tbody></table>
            </div>
          </div>
        </div>
      </div>

      <!-- Monthly Revenue -->
      <div class="card mb-4">
        <div class="card-header">
          <span class="card-title">Monthly Revenue (last 6 months)</span>
          <span class="text-xs text-muted" style="margin-left:auto">Based on recorded payments</span>
        </div>
        <div class="card-body">${monthlyChart}</div>
      </div>

      <!-- Recent Payments -->
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Payments</span></div>
        <div class="card-body" style="padding:0">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="padding:var(--space-2) var(--space-3);text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:600">Ref</th>
                <th style="padding:var(--space-2) var(--space-3);text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:600">Client</th>
                <th style="padding:var(--space-2) var(--space-3);text-align:right;font-size:var(--text-xs);color:var(--text-muted);font-weight:600">Amount</th>
                <th style="padding:var(--space-2) var(--space-3);text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:600">Date</th>
                <th style="padding:var(--space-2) var(--space-3);text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:600">Method</th>
              </tr>
            </thead>
            <tbody>${payRows}</tbody>
          </table>
        </div>
      </div>

      <div style="font-size:var(--text-xs);color:var(--text-muted);text-align:right;margin-top:var(--space-3)">
        Generated ${new Date(data.generated_at).toLocaleString()}
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — SHARE LINKS PANEL (inside enquiry detail slideover)
  // ══════════════════════════════════════════════════════════════════════════
  async function _loadShareLinksPanel(bookingRef) {
    const panel = document.getElementById('shareLinksPanel');
    if (!panel) return;
    try {
      const links = await apiFetch(`/api/share-links/${bookingRef}`);
      if (!links.length) {
        panel.innerHTML = `<span style="color:var(--text-muted)">No share links yet.</span>`;
        return;
      }
      panel.innerHTML = links.map(l => {
        const url = `${location.origin}/share/${l.token}`;
        const expired = l.expires_at && new Date(l.expires_at) < new Date();
        const revoked = l.is_revoked;
        const statusBadge = revoked
          ? `<span style="color:var(--danger);font-weight:700">Revoked</span>`
          : expired
            ? `<span style="color:var(--text-muted)">Expired</span>`
            : `<span style="color:var(--success);font-weight:700">Active</span>`;
        const lastView = l.last_viewed_at
          ? `Client viewed ${l.view_count} time${l.view_count !== 1 ? 's' : ''} · last: ${fmtDate(l.last_viewed_at)}`
          : `${l.view_count} view${l.view_count !== 1 ? 's' : ''} · not yet opened`;
        return `
          <div style="background:var(--bg-surface,#f5f7f6);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:8px 10px;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
              <div style="display:flex;gap:6px;align-items:center">
                ${statusBadge}
                <span style="color:var(--text-muted)">${lastView}</span>
              </div>
              <div style="display:flex;gap:4px">
                ${!revoked && !expired ? `
                  <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px"
                    onclick="navigator.clipboard.writeText('${escapeHtml(url)}');window.TRVE._toast('success','Copied!','Link copied to clipboard')">
                    Copy
                  </button>
                  <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 8px;color:var(--danger)"
                    onclick="window.TRVE._revokeShare('${escapeHtml(l.token)}','${escapeHtml(bookingRef)}')">
                    Revoke
                  </button>` : ''}
              </div>
            </div>
            ${l.expires_at ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Expires: ${fmtDate(l.expires_at)}</div>` : ''}
          </div>`;
      }).join('');
    } catch (e) {
      panel.innerHTML = `<span style="color:var(--text-muted)">Could not load links.</span>`;
    }
  }

  window.TRVE._revokeShare = async function(token, bookingRef) {
    if (!confirm('Revoke this share link? It will no longer be accessible.')) return;
    try {
      await apiFetch(`/api/share/${token}/revoke`, { method: 'PATCH' });
      toast('info', 'Link revoked', '');
      _loadShareLinksPanel(bookingRef);
    } catch (e) {
      toast('error', 'Revoke failed', e.message || '');
    }
  };
  window.TRVE._toast = (type, title, msg) => toast(type, title, msg);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — GUEST INFO PANEL (inside enquiry detail slideover)
  // ══════════════════════════════════════════════════════════════════════════
  async function _loadGuestInfoPanel(enquiryId) {
    const panel = document.getElementById('guestInfoPanel');
    if (!panel) return;
    try {
      const data = await apiFetch(`/api/enquiries/${enquiryId}/guest-info`);
      const guests = data.guests || [];
      const complete = data.guest_info_complete;
      if (!guests.length) {
        panel.innerHTML = `<span style="color:var(--text-muted)">No guest info submitted yet.</span>`;
        return;
      }
      panel.innerHTML = `
        <div style="margin-bottom:6px">
          <span style="font-weight:700;color:${complete ? 'var(--success)' : 'var(--warning)'}">
            ${complete ? '✓ Complete' : '⚠ Partial'}
          </span>
          <span style="color:var(--text-muted);margin-left:4px">${guests.length} guest${guests.length !== 1 ? 's' : ''} submitted</span>
        </div>
        ${guests.map(g => `
          <div style="background:var(--bg-surface,#f5f7f6);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:8px 10px;margin-bottom:6px">
            <div style="font-weight:700;font-size:var(--text-sm)">${escapeHtml(g.guest_name)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">
              ${g.nationality ? escapeHtml(g.nationality) + ' · ' : ''}
              ${g.passport_expiry ? 'Passport exp: ' + escapeHtml(g.passport_expiry) + ' · ' : ''}
              ${g.dietary ? '🍽 ' + escapeHtml(g.dietary) : ''}
            </div>
            ${g.flight_in || g.flight_out ? `
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">
                ✈ In: ${escapeHtml(g.flight_in || '—')} · Out: ${escapeHtml(g.flight_out || '—')}
              </div>` : ''}
          </div>`).join('')}`;
    } catch (e) {
      panel.innerHTML = `<span style="color:var(--text-muted)">Could not load guest info.</span>`;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — CLIENTS VIEW
  // ══════════════════════════════════════════════════════════════════════════
  async function loadClientsView() {
    const searchInput = document.getElementById('clientSearchInput');
    const listView    = document.getElementById('clientsListView');
    const detailView  = document.getElementById('clientDetailView');
    if (!listView) return;

    async function fetchAndRender(q = '') {
      listView.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">Loading…</div>`;
      detailView.style.display = 'none';
      listView.style.display = '';
      try {
        const clients = await apiFetch(`/api/clients?search=${encodeURIComponent(q)}`);
        if (!clients.length) {
          listView.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--text-muted)">No clients found${q ? ' for "' + escapeHtml(q) + '"' : ''}.</div>`;
          return;
        }
        listView.innerHTML = `
          <div class="card" style="overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:var(--bg-surface)">
                  <th style="padding:10px 14px;text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border)">Name</th>
                  <th style="padding:10px 14px;text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border)">Email</th>
                  <th style="padding:10px 14px;text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border)">Country</th>
                  <th style="padding:10px 14px;text-align:center;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border)">Bookings</th>
                  <th style="padding:10px 14px;text-align:right;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border)">Total Spend</th>
                  <th style="padding:10px 14px;text-align:left;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border)">Last Trip</th>
                </tr>
              </thead>
              <tbody>
                ${clients.map(c => `
                  <tr class="client-row" data-client-id="${escapeHtml(c.id)}"
                      style="cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s"
                      onmouseenter="this.style.background='var(--bg-surface)'" onmouseleave="this.style.background=''">
                    <td style="padding:10px 14px">
                      <div style="font-weight:700;font-size:var(--text-sm)">${escapeHtml(c.name)}</div>
                      ${c.booking_count > 1 ? `<span class="badge badge-returning" style="font-size:9px;margin-top:2px">&#9733; Returning</span>` : ''}
                    </td>
                    <td style="padding:10px 14px;font-size:var(--text-sm);color:var(--text-muted)">${escapeHtml(c.email)}</td>
                    <td style="padding:10px 14px;font-size:var(--text-sm)">${escapeHtml(c.country || '—')}</td>
                    <td style="padding:10px 14px;text-align:center">
                      <span class="badge ${c.booking_count > 1 ? 'badge-confirmed' : ''}">${c.booking_count || 0}</span>
                    </td>
                    <td style="padding:10px 14px;text-align:right;font-family:var(--font-mono,monospace);font-size:var(--text-sm)">${c.total_spend_usd > 0 ? fmtMoney(c.total_spend_usd) : '—'}</td>
                    <td style="padding:10px 14px;font-size:var(--text-sm);color:var(--text-muted)">${c.last_booking_at ? fmtDate(c.last_booking_at) : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
        // Wire click handlers
        listView.querySelectorAll('.client-row').forEach(row => {
          row.addEventListener('click', () => openClientDetail(row.dataset.clientId));
        });
      } catch (e) {
        listView.innerHTML = `<div class="card" style="padding:24px;color:var(--danger)">Failed to load clients: ${escapeHtml(e.message || '')}</div>`;
      }
    }

    async function openClientDetail(clientId) {
      listView.style.display = 'none';
      detailView.style.display = '';
      detailView.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">Loading…</div>`;
      try {
        const c = await apiFetch(`/api/clients/${clientId}`);
        const prefs = c.preferences || {};
        const bookings = c.bookings || [];
        detailView.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-4)">
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('clientsListView').style.display='';document.getElementById('clientDetailView').style.display='none'">
              &#8592; All Clients
            </button>
          </div>
          <div class="card mb-4">
            <div class="card-body" style="padding:var(--space-5)">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
                <div>
                  <h2 style="font-size:var(--text-xl);font-weight:700;margin-bottom:4px">${escapeHtml(c.name)}</h2>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <span style="color:var(--text-muted);font-size:var(--text-sm)">${escapeHtml(c.email)}</span>
                    ${c.phone ? `<span style="color:var(--text-muted);font-size:var(--text-sm)">· ${escapeHtml(c.phone)}</span>` : ''}
                    ${c.country ? `<span class="badge badge-gold">${escapeHtml(c.country)}</span>` : ''}
                    <span class="badge badge-teal">${escapeHtml(c.nationality_tier || 'FNR')}</span>
                    ${c.booking_count > 1 ? `<span class="badge badge-returning">&#9733; Returning Client</span>` : ''}
                  </div>
                </div>
              </div>
              <!-- Summary stats -->
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);margin-top:var(--space-4)">
                <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:12px;text-align:center;border:1px solid var(--border)">
                  <div style="font-size:var(--text-xl);font-weight:700;color:var(--brand-green)">${c.booking_count || 0}</div>
                  <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Bookings</div>
                </div>
                <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:12px;text-align:center;border:1px solid var(--border)">
                  <div style="font-size:var(--text-xl);font-weight:700;color:var(--brand-green)">${c.total_spend_usd > 0 ? fmtMoney(c.total_spend_usd) : '—'}</div>
                  <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Total Spend</div>
                </div>
                <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:12px;text-align:center;border:1px solid var(--border)">
                  <div style="font-size:var(--text-xl);font-weight:700;color:var(--brand-green)">${c.last_booking_at ? fmtDate(c.last_booking_at) : '—'}</div>
                  <div style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Last Trip</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Preferences panel -->
          ${(prefs.dietary || prefs.room_type || prefs.interests || prefs.mobility_notes) ? `
          <div class="card mb-4">
            <div class="card-header"><span class="card-title">Preferences</span></div>
            <div class="card-body" style="padding:var(--space-4)">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
                ${prefs.dietary ? `<div><div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Dietary</div><div style="font-size:var(--text-sm)">${escapeHtml(prefs.dietary)}</div></div>` : ''}
                ${prefs.room_type ? `<div><div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Room Type</div><div style="font-size:var(--text-sm)">${escapeHtml(prefs.room_type)}</div></div>` : ''}
                ${prefs.interests ? `<div><div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Interests</div><div style="font-size:var(--text-sm)">${escapeHtml(prefs.interests)}</div></div>` : ''}
                ${prefs.mobility_notes ? `<div><div style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Mobility Notes</div><div style="font-size:var(--text-sm)">${escapeHtml(prefs.mobility_notes)}</div></div>` : ''}
              </div>
            </div>
          </div>` : ''}

          <!-- Bookings list -->
          <div class="card">
            <div class="card-header"><span class="card-title">Booking History (${bookings.length})</span></div>
            <div class="card-body" style="padding:0">
              ${bookings.length === 0 ? `<div style="padding:20px;text-align:center;color:var(--text-muted)">No bookings yet.</div>` :
                `<table style="width:100%;border-collapse:collapse">
                  <thead><tr style="background:var(--bg-surface)">
                    <th style="padding:8px 14px;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);text-align:left">Ref</th>
                    <th style="padding:8px 14px;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);text-align:left">Status</th>
                    <th style="padding:8px 14px;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);text-align:left">Travel Date</th>
                    <th style="padding:8px 14px;font-size:var(--text-xs);color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border);text-align:right">Value</th>
                  </tr></thead>
                  <tbody>
                    ${bookings.map(b => `
                      <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:8px 14px;font-family:var(--font-mono,monospace);font-size:var(--text-sm)">${escapeHtml(b.booking_ref)}</td>
                        <td style="padding:8px 14px"><span class="badge">${escapeHtml(b.status || '—')}</span></td>
                        <td style="padding:8px 14px;font-size:var(--text-sm);color:var(--text-muted)">${b.travel_start_date ? fmtDate(b.travel_start_date) : '—'}</td>
                        <td style="padding:8px 14px;text-align:right;font-family:var(--font-mono,monospace);font-size:var(--text-sm)">${b.quoted_usd ? fmtMoney(parseFloat(b.quoted_usd) || 0) : '—'}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>`}
            </div>
          </div>`;
      } catch (e) {
        detailView.innerHTML = `<div class="card" style="padding:24px;color:var(--danger)">Failed to load client: ${escapeHtml(e.message || '')}</div>`;
      }
    }

    // Wire search
    document.getElementById('clientSearchBtn')?.addEventListener('click', () => {
      fetchAndRender(searchInput?.value || '');
    });
    searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') fetchAndRender(searchInput.value); });

    // Initial load
    fetchAndRender();
  }

  // Hook into navigate() to trigger clients view load
  const _origNavigate = typeof navigate === 'function' ? navigate : null;
  // Patch: clients view init when navigated to
  document.addEventListener('click', e => {
    const item = e.target.closest('.nav-item[data-view="clients"]');
    if (item) setTimeout(loadClientsView, 100);
  });

  // ============================================================
  // PHASE 3.1 — TASKS: sidebar badge, due today, task panel
  // ============================================================

  async function _refreshTasksBadge() {
    try {
      const tasks = await apiFetch('/api/tasks?status=open');
      const badge = document.getElementById('tasksBadge');
      if (!badge) return;
      const count = tasks.length;
      if (count === 0) {
        badge.style.display = 'none';
      } else {
        badge.textContent = count;
        badge.style.display = '';
      }
    } catch (e) { /* non-critical */ }
  }

  async function _loadDueTodayWidget() {
    try {
      const tasks = await apiFetch('/api/tasks?status=open&due_date=today');
      const widget = document.getElementById('dueTodayWidget');
      const chips = document.getElementById('dueTodayChips');
      if (!widget || !chips) return;
      if (!tasks || tasks.length === 0) { widget.style.display = 'none'; return; }
      widget.style.display = '';
      chips.innerHTML = tasks.map(t => `
        <span class="badge" style="cursor:pointer;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);padding:4px 10px;font-size:11px;border-radius:20px;white-space:nowrap"
          data-booking-ref="${escapeHtml(t.booking_ref)}"
          onclick="window.TRVE._openByRef('${escapeHtml(t.booking_ref)}')">
          ${escapeHtml(t.title)} &middot; ${escapeHtml(t.booking_ref)}
        </span>`).join('');
    } catch (e) { /* non-critical */ }
  }

  async function _loadTaskListPanel(bookingRef) {
    const panel = document.getElementById('taskListPanel');
    if (!panel) return;
    panel.innerHTML = '<span style="color:var(--text-muted)">Loading…</span>';
    try {
      const tasks = await apiFetch(`/api/tasks?booking_ref=${encodeURIComponent(bookingRef)}`);
      _renderTaskList(panel, bookingRef, tasks);
    } catch (e) {
      panel.innerHTML = '<span style="color:var(--danger)">Failed to load tasks.</span>';
    }
  }

  function _renderTaskList(panel, bookingRef, tasks) {
    const fmtTaskDate = d => {
      if (!d) return '';
      try {
        const [y, m, day] = d.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
      } catch { return d; }
    };

    const listHtml = tasks.length === 0
      ? '<div style="color:var(--text-muted);font-style:italic;margin-bottom:8px">No tasks yet for this booking.</div>'
      : tasks.map(t => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
          <input type="checkbox" ${t.status === 'done' ? 'checked' : ''}
            style="margin-top:2px;cursor:pointer"
            data-task-id="${escapeHtml(t.id)}"
            onchange="window.TRVE._toggleTask(this)">
          <div style="flex:1;min-width:0">
            <div style="${t.status === 'done' ? 'text-decoration:line-through;color:var(--text-muted)' : ''};font-size:12px">
              ${escapeHtml(t.title)}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px">
              ${fmtTaskDate(t.due_date)}${t.assigned_to ? ' · ' + escapeHtml(t.assigned_to) : ' · Unassigned'}
            </div>
          </div>
        </div>`).join('');

    panel.innerHTML = `
      ${listHtml}
      <form id="addTaskForm" style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:6px">
          <input class="form-control" type="text" id="newTaskTitle" placeholder="Task title" style="flex:1;font-size:12px;height:30px">
          <input class="form-control" type="date" id="newTaskDue" style="width:130px;font-size:12px;height:30px">
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="align-self:flex-start">Add task</button>
      </form>`;

    document.getElementById('addTaskForm').addEventListener('submit', async e => {
      e.preventDefault();
      const title = document.getElementById('newTaskTitle').value.trim();
      const due = document.getElementById('newTaskDue').value;
      if (!title || !due) { toast('warning', 'Title and due date required'); return; }
      try {
        const created = await apiFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ booking_ref: bookingRef, title, due_date: due }),
        });
        // Refresh panel
        const allTasks = await apiFetch(`/api/tasks?booking_ref=${encodeURIComponent(bookingRef)}`);
        _renderTaskList(panel, bookingRef, allTasks);
        _refreshTasksBadge();
      } catch (e) {
        toast('error', 'Failed to add task', e.message || '');
      }
    });
  }

  window.TRVE._toggleTask = async function(checkbox) {
    const taskId = checkbox.dataset.taskId;
    const newStatus = checkbox.checked ? 'done' : 'open';
    try {
      await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      // Re-render the task list
      const panel = document.getElementById('taskListPanel');
      if (panel) {
        const bookingRef = panel.dataset.bookingRef;
        const tasks = await apiFetch(`/api/tasks?booking_ref=${encodeURIComponent(bookingRef)}`);
        _renderTaskList(panel, bookingRef, tasks);
      }
      _refreshTasksBadge();
    } catch (e) {
      checkbox.checked = !checkbox.checked; // revert
      toast('error', 'Failed to update task');
    }
  };

  window.TRVE._openByRef = function(bookingRef) {
    const enquiry = (state.enquiries || []).find(e => e.booking_ref === bookingRef || e.id === bookingRef);
    if (enquiry) openEnquiryDetail(enquiry.id);
  };

  async function loadTasksView() {
    const body = document.getElementById('tasksViewBody');
    if (!body) return;
    body.innerHTML = '<div style="color:var(--text-muted)">Loading…</div>';
    try {
      const tasks = await apiFetch('/api/tasks');
      if (tasks.length === 0) {
        body.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:16px 0">No tasks found.</div>';
        return;
      }
      const fmtD = d => { try { const [y,m,day]=d.split('-'); return `${parseInt(day)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]} ${y}`; } catch{return d;} };
      body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--bg-surface);text-align:left">
          <th style="padding:8px;border-bottom:2px solid var(--border)">Status</th>
          <th style="padding:8px;border-bottom:2px solid var(--border)">Title</th>
          <th style="padding:8px;border-bottom:2px solid var(--border)">Booking</th>
          <th style="padding:8px;border-bottom:2px solid var(--border)">Due</th>
          <th style="padding:8px;border-bottom:2px solid var(--border)">Assigned</th>
        </tr></thead>
        <tbody>${tasks.map(t => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px 8px">
              <input type="checkbox" ${t.status==='done'?'checked':''} data-task-id="${escapeHtml(t.id)}" onchange="window.TRVE._toggleTaskGlobal(this)">
            </td>
            <td style="padding:6px 8px;${t.status==='done'?'text-decoration:line-through;color:var(--text-muted)':''}">${escapeHtml(t.title)}</td>
            <td style="padding:6px 8px"><a href="#" onclick="window.TRVE._openByRef('${escapeHtml(t.booking_ref)}');return false" style="color:var(--brand-green)">${escapeHtml(t.booking_ref)}</a></td>
            <td style="padding:6px 8px;white-space:nowrap">${fmtD(t.due_date)}</td>
            <td style="padding:6px 8px">${escapeHtml(t.assigned_to || 'Unassigned')}</td>
          </tr>`).join('')}
        </tbody></table>`;
    } catch (e) {
      body.innerHTML = '<div style="color:var(--danger)">Failed to load tasks.</div>';
    }
  }

  window.TRVE._toggleTaskGlobal = async function(checkbox) {
    const taskId = checkbox.dataset.taskId;
    const newStatus = checkbox.checked ? 'done' : 'open';
    try {
      await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      _refreshTasksBadge();
      loadTasksView();
    } catch (e) {
      checkbox.checked = !checkbox.checked;
      toast('error', 'Failed to update task');
    }
  };

  // ============================================================
  // PHASE 3.3 — DRIVER & VEHICLE ASSIGNMENT UI
  // ============================================================

  async function _loadDriverVehicleDropdowns(enquiry) {
    const driverSel = document.getElementById('detailDriverSelect');
    const vehicleSel = document.getElementById('detailVehicleSelect');
    if (!driverSel || !vehicleSel) return;

    try {
      const [drivers, vehicles] = await Promise.all([
        apiFetch('/api/drivers'),
        apiFetch('/api/vehicles'),
      ]);

      const currentDriver = enquiry.driver_id || '';
      driverSel.innerHTML = '<option value="">— Unassigned —</option>' +
        drivers.map(d => `<option value="${escapeHtml(d.id)}" ${d.id === currentDriver ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('');

      const currentVehicle = enquiry.vehicle_id || '';
      vehicleSel.innerHTML = '<option value="">— Unassigned —</option>' +
        vehicles.map(v => {
          const label = `${v.name}${v.plate ? ' (' + v.plate + ')' : ''}${v.status !== 'available' ? ' [' + v.status + ']' : ''}`;
          return `<option value="${escapeHtml(v.id)}" ${v.id === currentVehicle ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');

      const saveMsg = document.getElementById('driverVehicleSavedMsg');
      const showSaved = () => {
        if (!saveMsg) return;
        saveMsg.style.display = '';
        setTimeout(() => { saveMsg.style.display = 'none'; }, 2000);
      };

      driverSel.addEventListener('change', async () => {
        try {
          await apiFetch(`/api/enquiries/${encodeURIComponent(enquiry.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ driver_id: driverSel.value || null }),
          });
          showSaved();
        } catch (e) { toast('error', 'Failed to save driver'); }
      });

      vehicleSel.addEventListener('change', async () => {
        try {
          await apiFetch(`/api/enquiries/${encodeURIComponent(enquiry.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ vehicle_id: vehicleSel.value || null }),
          });
          showSaved();
        } catch (e) { toast('error', 'Failed to save vehicle'); }
      });
    } catch (e) {
      if (driverSel) driverSel.innerHTML = '<option>Error loading</option>';
      if (vehicleSel) vehicleSel.innerHTML = '<option>Error loading</option>';
    }
  }

  // ============================================================
  // PHASE 3.2 — MANIFESTS VIEW
  // ============================================================

  function initManifestsView() {
    const wrap = document.getElementById('manifestsTableWrap');
    const fromEl = document.getElementById('manifestDateFrom');
    const toEl = document.getElementById('manifestDateTo');
    const searchBtn = document.getElementById('manifestSearchBtn');
    if (!wrap || !fromEl || !toEl || !searchBtn) return;

    // Default range: today → today + 14 days
    const today = new Date();
    const fmtInput = d => d.toISOString().slice(0, 10);
    fromEl.value = fmtInput(today);
    const future = new Date(today); future.setDate(future.getDate() + 14);
    toEl.value = fmtInput(future);

    const doSearch = async () => {
      wrap.innerHTML = '<div style="color:var(--text-muted)">Loading…</div>';
      try {
        const rows = await apiFetch(`/api/manifests?date_from=${encodeURIComponent(fromEl.value)}&date_to=${encodeURIComponent(toEl.value)}`);
        if (!rows || rows.length === 0) {
          wrap.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:16px 0">No bookings found in this date range.</div>';
          return;
        }
        wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--bg-surface)">
            ${['Booking Ref','Client Name','PAX','Arrival','Departure','Lodges','Driver','Download'].map(h=>`<th style="padding:8px;border-bottom:2px solid var(--border);text-align:left">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${rows.map(r => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:6px 8px"><a href="#" onclick="window.TRVE._openByRef('${escapeHtml(r.booking_ref)}');return false" style="color:var(--brand-green);font-family:monospace">${escapeHtml(r.booking_ref)}</a></td>
              <td style="padding:6px 8px">${escapeHtml(r.client_name)}</td>
              <td style="padding:6px 8px">${r.pax || '—'}</td>
              <td style="padding:6px 8px;white-space:nowrap">${r.arrival_date || '—'}</td>
              <td style="padding:6px 8px;white-space:nowrap">${r.departure_date || '—'}</td>
              <td style="padding:6px 8px">${(r.lodge_names || []).join(' → ') || '—'}</td>
              <td style="padding:6px 8px">${escapeHtml(r.driver_name || '—')}</td>
              <td style="padding:6px 8px">
                <a href="/api/enquiries/${encodeURIComponent(r.id)}/manifest/pdf" target="_blank"
                   class="btn btn-secondary btn-sm" style="font-size:10px;padding:2px 8px">PDF</a>
              </td>
            </tr>`).join('')}
          </tbody></table>`;
      } catch (e) {
        wrap.innerHTML = `<div style="color:var(--danger)">Error: ${escapeHtml(e.message || 'Failed to load manifests')}</div>`;
      }
    };

    searchBtn.addEventListener('click', doSearch);
    doSearch(); // load on page open
  }

  // ============================================================
  // PHASE 3.3 — FLEET CALENDAR VIEW
  // ============================================================

  let _fleetWeekStart = null;

  function _getThisMonday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function _fmtIso(d) {
    return d.toISOString().slice(0, 10);
  }

  function _addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  async function initFleetView() {
    if (!_fleetWeekStart) _fleetWeekStart = _getThisMonday();

    const prevBtn = document.getElementById('fleetPrevWeek');
    const nextBtn = document.getElementById('fleetNextWeek');
    if (prevBtn && !prevBtn._bound) {
      prevBtn._bound = true;
      prevBtn.addEventListener('click', () => { _fleetWeekStart = _addDays(_fleetWeekStart, -7); renderFleetCalendar(); });
    }
    if (nextBtn && !nextBtn._bound) {
      nextBtn._bound = true;
      nextBtn.addEventListener('click', () => { _fleetWeekStart = _addDays(_fleetWeekStart, 7); renderFleetCalendar(); });
    }

    await renderFleetCalendar();
  }

  async function renderFleetCalendar() {
    const wrap = document.getElementById('fleetCalendarWrap');
    const label = document.getElementById('fleetWeekLabel');
    if (!wrap) return;

    const ws = _fleetWeekStart || _getThisMonday();
    const we = _addDays(ws, 6);
    if (label) label.textContent = `${ws.toLocaleDateString('en-GB', {day:'numeric',month:'short'})} – ${we.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})}`;

    wrap.innerHTML = '<div style="color:var(--text-muted)">Loading…</div>';
    try {
      const data = await apiFetch(`/api/fleet/availability?week_start=${_fmtIso(ws)}`);
      const days = data.days || [];
      const vehicles = data.vehicles || [];

      const dayHeaders = days.map(d => {
        const dt = new Date(d);
        return `<th style="padding:6px 4px;min-width:90px;border:1px solid var(--border);text-align:center;font-size:11px">${dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</th>`;
      }).join('');

      const rows = vehicles.map(vh => {
        const isMaint = vh.vehicle_status === 'maintenance';
        const cells = vh.days.map(day => {
          let bg = '#e8f5e9', lbl = '', tip = '', color = '';
          if (isMaint || day.status === 'maintenance') { bg = '#e0e0e0'; lbl = 'Maintenance'; color = '#757575'; }
          else if (day.status === 'conflict') { bg = '#ffebee'; lbl = 'CONFLICT'; color = '#c62828'; }
          else if (day.status === 'on_trip') {
            bg = '#fff8e1'; lbl = day.bookings[0]?.booking_ref || 'On trip'; color = '#f57f17';
            tip = `title="${escapeHtml(day.bookings[0]?.client_name || '')} · ${escapeHtml(day.bookings[0]?.booking_ref || '')}"`;
          }
          return `<td ${tip} style="padding:4px;border:1px solid var(--border);background:${bg};text-align:center;font-size:10px;color:${color};font-weight:${day.status!=='available'?'600':'400'}">${escapeHtml(lbl)}&nbsp;</td>`;
        }).join('');

        return `<tr>
          <td style="padding:6px 8px;border:1px solid var(--border);white-space:nowrap;font-size:12px;font-weight:600">${escapeHtml(vh.name)}<br><span style="font-size:10px;color:var(--text-muted);font-weight:400">${escapeHtml(vh.plate||'')}</span></td>
          ${cells}
        </tr>`;
      }).join('');

      wrap.innerHTML = `<table style="border-collapse:collapse;width:100%;min-width:700px">
        <thead><tr>
          <th style="padding:6px 8px;border:1px solid var(--border);text-align:left;font-size:12px">Vehicle</th>
          ${dayHeaders}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:10px;display:flex;gap:16px;font-size:11px;color:var(--text-muted)">
        <span><span style="display:inline-block;width:12px;height:12px;background:#e8f5e9;border:1px solid #ccc;vertical-align:-2px"></span> Available</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#fff8e1;border:1px solid #ccc;vertical-align:-2px"></span> On trip</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#ffebee;border:1px solid #ccc;vertical-align:-2px"></span> Conflict</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#e0e0e0;border:1px solid #ccc;vertical-align:-2px"></span> Maintenance</span>
      </div>`;
    } catch (e) {
      wrap.innerHTML = `<div style="color:var(--danger)">Error loading fleet data: ${escapeHtml(e.message || '')}</div>`;
    }
  }

})();

// deploy-test 2026-03-11 14:33
// deploy-test 2026-03-11 14:35
