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
    accomHistory: [],      // undo stack — each entry is a snapshot of lodge-row config
    accomFuture:  [],      // redo stack
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
    // Use setTimeout as reliable fallback — transitionend can fail if element is hidden
    setTimeout(() => { if (el.parentNode) el.remove(); }, 250);
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
    sync:       'Sheets Sync'
  };

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

    state.currentView = viewId;

    // Lazy load data
    if (viewId === 'pipeline') loadPipeline();
    if (viewId === 'curation') loadCurationEnquiries();
    if (viewId === 'pricing') loadPricingItineraries(); // handles curation pre-select internally after data loads
    if (viewId === 'tools') initToolsView();
    if (viewId === 'quotations') loadQuotations();
    if (viewId === 'sync') renderSyncView();
    if (viewId === 'lodges') { loadLodgesView(); }
  }

  // Expose for inline onclick use
  window.TRVE = {
    navigate, loadPipeline, saveFxRateAtQuote, addActivityCost, addVehicleItem,
    _updateGuestName, _updateLodgeRowDates, _toggleGuestRoom, _syncLodgeGuestAssignments,
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
      overlay.classList.toggle('open');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('open');
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
        overlay.classList.remove('open');
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
      'sync': '6'
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

    // Keyboard navigation (1-6 keys when not in input)
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      const keyMap = { '1': 'enquiry', '2': 'pipeline', '3': 'curation', '4': 'pricing', '5': 'quotations', '6': 'sync' };
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

    return `
      <div class="kanban-card" data-enquiry-id="${escapeHtml(e.id)}" role="button" tabindex="0">
        <div class="kanban-card-ref">${escapeHtml(e.booking_ref || '—')}</div>
        <div class="kanban-card-name">${escapeHtml(e.client_name || 'Unknown')}</div>
        <div class="kanban-card-meta">
          <span class="badge ${channelClass}">${escapeHtml(e.channel || 'direct')}</span>
          ${e.coordinator ? `<span class="badge badge-teal">${escapeHtml(e.coordinator)}</span>` : ''}
        </div>
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

      <!-- Payment Recording -->
      ${(() => {
        const invoiceAmt = enquiry.quoted_usd;
        const reqTransfer = enquiry.required_transfer_amount;
        const bankChargesOnInvoice = !!enquiry.include_bank_charges_in_invoice;
        const threshold = bankChargesOnInvoice && reqTransfer ? reqTransfer : invoiceAmt;
        const received  = enquiry.revenue_usd;
        const shortfall = threshold && received != null ? round2(threshold - received) : null;
        const isUnderpaid = shortfall != null && shortfall > 0.01;
        function round2(v) { return Math.round(v * 100) / 100; }
        return `
        <div class="detail-financial-summary mb-4" id="paymentRecordingSection">
          <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--teal-700);margin-bottom:var(--space-3)">
            Record Payment
          </div>
          ${threshold ? `
          <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-2)">
            Required: <strong class="mono">${fmtMoney(threshold)}</strong>
            ${bankChargesOnInvoice && reqTransfer ? ' (includes bank charges)' : ''}
          </div>` : ''}
          <div class="form-group mb-2">
            <label class="form-label" for="detailPaymentReceived" style="font-size:var(--text-xs)">Amount Received (USD)</label>
            <input class="form-control" type="number" id="detailPaymentReceived" min="0" step="0.01"
              value="${received != null ? received : ''}"
              placeholder="${threshold ? threshold.toFixed(2) : 'e.g. 5000'}"
              style="font-family:var(--font-mono)">
          </div>
          <div id="detailPaymentWarning" style="display:${isUnderpaid ? 'block' : 'none'};background:#FEF2F2;border:1px solid var(--danger);border-radius:var(--radius-md);padding:var(--space-3);font-size:var(--text-xs);color:var(--danger);margin-bottom:var(--space-2)">
            ⚠ Underpaid — shortfall of <strong class="mono">${isUnderpaid ? fmtMoney(shortfall) : ''}</strong>.
            Invoice settlement blocked until full amount is received.
          </div>
          <div id="detailPaymentOk" style="display:${received != null && !isUnderpaid && threshold ? 'block' : 'none'};background:#F0FAF6;border:1px solid #6ee7c7;border-radius:var(--radius-md);padding:var(--space-3);font-size:var(--text-xs);color:#0d7a5f;margin-bottom:var(--space-2)">
            ✓ Payment sufficient — invoice can be settled.
          </div>
        </div>
        <div class="divider"></div>`;
      })()}

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

    const footerHtml = `
      <button class="btn btn-primary" id="detailSaveBtn" data-enquiry-id="${escapeHtml(enquiry.id)}">Save Changes</button>
      <button class="btn btn-gold" id="detailCurationBtn" data-enquiry-id="${escapeHtml(enquiry.id)}">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l1.4 4.2H13l-3.8 2.8 1.4 4.2L7 9.9l-3.6 2.8 1.4-4.2L1 5.7h4.6L7 1.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        Find Best Itineraries
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

    document.getElementById('detailCurationBtn').addEventListener('click', async () => {
      closeSlideover();
      navigate('curation');
      await loadCurationEnquiries();
      const sel = document.getElementById('curationEnquirySelect');
      sel.value = enquiry.id;
      sel.dispatchEvent(new Event('change'));
      await runCurationFromEnquiry(enquiry.id);
    });
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

      // Pre-load enquiry data into pricing form fields NOW, before user navigates
      const approvedEnq = state.enquiries.find(e => e.id === state.curation.enquiryId);
      if (approvedEnq) {
        const natSel = document.getElementById('pricingNationality');
        if (natSel && approvedEnq.nationality_tier) natSel.value = approvedEnq.nationality_tier;
        const adultsEl = document.getElementById('pricingAdults');
        const childrenEl = document.getElementById('pricingChildren');
        if (approvedEnq.pax && adultsEl) {
          adultsEl.value = approvedEnq.pax;
          if (childrenEl) childrenEl.value = 0;
        }
        const dateEl = document.getElementById('pricingTravelStartDate');
        if (dateEl && approvedEnq.travel_start_date) dateEl.value = approvedEnq.travel_start_date;
      }

      const tierLabel = approvedEnq && approvedEnq.nationality_tier ? ` · Nationality: ${approvedEnq.nationality_tier}` : '';
      toast('success', 'Itinerary approved!', `${state.curation.selectedItineraryName} linked to enquiry${tierLabel}.`);

      // Update approval panel to show confirmed state
      const panel = document.getElementById('approvalPanel');
      panel.innerHTML = `
        <div style="text-align:center;padding:var(--space-6)">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="color:var(--success);margin:0 auto var(--space-4)">
            <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="1.5"/>
            <path d="M15 24l6 6 12-12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div style="font-size:var(--text-xl);font-weight:600;color:var(--success);margin-bottom:var(--space-2)">Approved!</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary)">${escapeHtml(state.curation.selectedItineraryName)} has been approved by ${escapeHtml(approvedBy)}.</div>
          <button class="btn btn-gold" style="margin-top:var(--space-4)" onclick="window.TRVE.navigate('pricing')">
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
            document.getElementById('pricingDays').value = itn.duration_days;
            // Vehicle days default to duration - 1 (arrival day has no game drive)
            document.getElementById('pricingVehicleDays').value = itn.vehicle_days || Math.max(1, (itn.duration_days || 7) - 1);
          }
          // Auto-check permits based on itinerary destinations/activities
          const activities = (itn.activities || itn.highlights || []).join(' ').toLowerCase();
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
              if (enq.travel_start_date) document.getElementById('pricingTravelStartDate').value = enq.travel_start_date;
            }
          }

          // Update permit labels and activity prices for the new date/tier context
          updatePermitLabels();
          renderActivityPresets();

          // Validate nationality is set — warn if missing
          const tierVal = document.getElementById('pricingNationality').value;
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
    const startDateVal = document.getElementById('pricingTravelStartDate')?.value || '';
    const endDateVal   = document.getElementById('pricingTravelEndDate')?.value   || '';
    const tripDays = parseInt(document.getElementById('pricingDays')?.value) || 7;
    let autoNights = Math.max(1, tripDays - 1);
    if (startDateVal && endDateVal) {
      const diff = Math.round((new Date(endDateVal) - new Date(startDateVal)) / 86400000);
      if (diff > 0) autoNights = diff;
    }
    const initRooms   = cfg.rooms   || 1;
    const initNights  = cfg.nights  || autoNights;
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

        <!-- ① Date bar — auto-synced from Basic Data -->
        <div class="lodge-date-bar" style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:7px 10px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);font-size:var(--text-xs);color:var(--text-secondary)">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1.5" width="9" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1 4h9" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 1v1.5M7.5 1v1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          Check-in:&nbsp;<strong class="lodge-checkin-display">${checkInDisplay}</strong>
          &nbsp;&rarr;&nbsp;
          Check-out:&nbsp;<strong class="lodge-checkout-display">${checkOutDisplay}</strong>
          <span style="color:var(--text-muted);margin-left:4px">(${initNights} nights)</span>
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

        <!-- ③ Room type -->
        <div style="margin-bottom:8px">
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Room Type</label>
          <select class="form-control" name="room_type_${idx}" style="font-size:var(--text-xs)">
            <option value="">— select lodge first —</option>
          </select>
          <div id="lodge_rate_freshness_${idx}" style="display:none;font-size:var(--text-xs);margin-top:4px"></div>
        </div>

        <!-- ④ Room configuration: Rooms · Nights · Meal Plan -->
        <div style="display:grid;grid-template-columns:auto auto 1fr;gap:10px;align-items:end;margin-bottom:10px">
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Rooms</label>
            <div style="display:flex;align-items:center;gap:4px">
              <button type="button" class="btn btn-xs lodge-dec-room"
                style="width:24px;height:30px;padding:0;font-size:14px;line-height:1;background:var(--bg-surface);border:1px solid var(--border)"
                onclick="window.TRVE._changeRoomsCount(this.closest('.lodge-item'), -1)"
                title="Remove one room">−</button>
              <input type="number" name="rooms_${idx}" class="form-control" min="1" value="${initRooms}"
                style="width:44px;height:30px;font-size:var(--text-sm);font-weight:600;text-align:center"
                title="Number of identical rooms">
              <button type="button" class="btn btn-xs lodge-inc-room"
                style="width:24px;height:30px;padding:0;font-size:14px;line-height:1;background:var(--bg-surface);border:1px solid var(--border)"
                onclick="window.TRVE._changeRoomsCount(this.closest('.lodge-item'), +1)"
                title="Add one room">+</button>
            </div>
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Nights</label>
            <div class="lodge-nights-pill" style="display:flex;align-items:center;gap:4px">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v1.5M5.5 8.5V10M1 5.5h1.5M8.5 5.5H10M2.6 2.6l1 1M7.4 7.4l1 1M2.6 8.4l1-1M7.4 3.6l1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="5.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2"/></svg>
              <input type="number" name="nights_${idx}" class="lodge-nights-input form-control" min="1" value="${initNights}"
                style="width:52px;height:30px;font-size:var(--text-sm);font-weight:600;text-align:center"
                title="Nights = check-out − check-in. Adjust for multi-lodge splits."
                oninput="window.TRVE._updateLodgeRowDates(this.closest('.lodge-item'))">
              <span class="lodge-nights-hint" style="font-size:var(--text-xs);color:var(--text-muted)">nights</span>
            </div>
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Meal Plan</label>
            <select class="form-control" name="meal_plan_${idx}" style="font-size:var(--text-xs);height:30px">
              <option value="BB"${initMeal==='BB'?' selected':''}>BB — Bed &amp; Breakfast</option>
              <option value="HB"${initMeal==='HB'?' selected':''}>HB — Half Board (+$35/pax/night)</option>
              <option value="FB"${initMeal==='FB'?' selected':''}>FB — Full Board (+$65/pax/night)</option>
            </select>
          </div>
        </div>

        <!-- ⑤ Computed occupancy summary (read-only, derived from Basic Details) -->
        <div class="lodge-computed-occ" style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 10px;margin-bottom:10px;font-size:var(--text-xs);color:var(--text-secondary)">
          Occupancy computed from Basic Details guest count.
        </div>

        <!-- ⑥ Room distribution cards -->
        <div class="lodge-guest-assign" style="margin-top:4px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">
            Room Occupancy
            <span class="lodge-occupancy-badge" style="font-size:10px;padding:1px 6px;border:1px solid var(--border);border-radius:9px;background:var(--bg-surface);color:var(--text-muted);text-transform:none;font-weight:600">—</span>
          </div>
          <div class="lodge-guest-assign-list"></div>
        </div>

      </div>
      <button type="button" class="btn btn-ghost btn-icon"
        onclick="window.TRVE._removeLodgeItem(this.closest('.lodge-item'))" title="Remove lodge">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);

    // ② Lodge → populate room types
    const lodgeSelect    = el.querySelector(`[name^="lodge_name_"]`);
    const roomTypeSelect = el.querySelector(`[name^="room_type_"]`);
    if (lodgeSelect && roomTypeSelect) {
      lodgeSelect.addEventListener('change', function() {
        _accomPushHistory();
        populateRoomTypes(this.value, roomTypeSelect);
        _autoSyncRoomGuests(el);
      });
      roomTypeSelect.addEventListener('change', function() {
        _accomPushHistory();
        _autoSyncRoomGuests(el);
      });
    }

    // ④ Rooms input → push history on change + re-render
    const roomsInput = el.querySelector(`[name^="rooms_"]`);
    if (roomsInput) {
      roomsInput.addEventListener('change', () => {
        _accomPushHistory();
        _autoSyncRoomGuests(el);
      });
      roomsInput.addEventListener('input', () => _autoSyncRoomGuests(el));
    }

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
      populateRoomTypes(cfg.lodgeName, roomTypeSelect);
      if (cfg.roomType && roomTypeSelect) roomTypeSelect.value = cfg.roomType;
    }

    // Initial render
    _autoSyncRoomGuests(el);
    _renderAccommPricingSummary();
  }

  // Update the computed-occupancy summary bar on a lodge row.
  // Derives per-room occupant count from Basic Details total ÷ rooms.
  function _updateLodgeTotalGuestsHint(row) {
    const occEl = row.querySelector('.lodge-computed-occ');
    if (!occEl) return;
    const totalAdults   = parseInt(document.getElementById('pricingAdults')?.value)   || 0;
    const totalChildren = parseInt(document.getElementById('pricingChildren')?.value) || 0;
    const totalGuests   = totalAdults + totalChildren;
    const rooms         = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
    const perRoom       = totalGuests > 0 ? Math.ceil(totalGuests / rooms) : 0;
    const maxOcc        = _getMaxOccupancy(
      row.querySelector('[name^="room_type_"]')?.value,
      row.querySelector('[name^="lodge_name_"]')?.value
    ) || 2;
    const overcrowded   = perRoom > maxOcc && !_childSharingApplies(
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

  // Refresh all derived display for a lodge row.
  function _autoSyncRoomGuests(row) {
    const rowIdx = parseInt(row.dataset.idx);
    _updateLodgeTotalGuestsHint(row);
    _renderRoomGuestAssignment(row, rowIdx);
    _updateRoomOccupancyBadge(row, rowIdx);
    _checkCapacityMismatch();
  }

  // Increment or decrement the rooms count on a lodge row with undo support.
  function _changeRoomsCount(row, delta) {
    _accomPushHistory();
    const inp = row.querySelector('[name^="rooms_"]');
    if (!inp) return;
    const newVal = Math.max(1, (parseInt(inp.value) || 1) + delta);
    inp.value = newVal;
    _autoSyncRoomGuests(row);
  }
  window.TRVE._changeRoomsCount = _changeRoomsCount;

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
  }
  window.TRVE._removeLodgeItem = _removeLodgeItem;
  window.TRVE.addLodgeItem     = addLodgeItem;

  // When trip days change, auto-update nights in all lodge rows (single-lodge path)
  function _syncLodgeNightsFromDays(days) {
    const nights = Math.max(1, days - 1);
    const rows = document.querySelectorAll('#lodgeItems .lodge-item');
    rows.forEach(row => {
      const nightsInput = row.querySelector('.lodge-nights-input');
      const nightsHint = row.querySelector('.lodge-nights-hint');
      if (nightsInput) nightsInput.value = nights;
      if (nightsHint) nightsHint.textContent = `(= ${days} days − 1)`;
    });
    _updateAccommodationDates();
  }

  // ---------------------------------------------------------------------------
  // ACCOMMODATION DATE AUTO-POPULATION
  // ---------------------------------------------------------------------------
  function _updateAccommodationDates() {
    const startVal = document.getElementById('pricingTravelStartDate')?.value;
    const endVal = document.getElementById('pricingTravelEndDate')?.value;
    const days = parseInt(document.getElementById('pricingDays')?.value) || 0;

    // Sync duration when both dates provided
    if (startVal && endVal) {
      const diffMs = new Date(endVal) - new Date(startVal);
      const diffDays = Math.round(diffMs / 86400000);
      if (diffDays > 0) {
        const daysEl = document.getElementById('pricingDays');
        if (daysEl && parseInt(daysEl.value) !== diffDays) {
          daysEl.value = diffDays;
          _syncLodgeNightsFromDays(diffDays);
        }
      }
    } else if (startVal && days > 0) {
      // Compute end date from start + days
      const end = new Date(startVal);
      end.setDate(end.getDate() + days);
      const endInput = document.getElementById('pricingTravelEndDate');
      if (endInput && !endInput.value) {
        endInput.value = end.toISOString().slice(0, 10);
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

    // Update check-in / check-out display on each lodge row
    document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
      _updateLodgeRowDates(row);
    });
  }

  function _updateLodgeRowDates(row) {
    const startVal = document.getElementById('pricingTravelStartDate')?.value;
    const checkInEl = row.querySelector('.lodge-checkin-display');
    const checkOutEl = row.querySelector('.lodge-checkout-display');
    if (!checkInEl || !checkOutEl) return;
    if (!startVal) { checkInEl.textContent = '—'; checkOutEl.textContent = '—'; return; }
    const customToggle = row.querySelector('.lodge-custom-dates-toggle');
    const isCustom = customToggle && customToggle.checked;
    if (!isCustom) {
      const nights = parseInt(row.querySelector('.lodge-nights-input')?.value) || 1;
      const checkIn = new Date(startVal);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkOut.getDate() + nights);
      const fmt = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      checkInEl.textContent = fmt(checkIn);
      checkOutEl.textContent = fmt(checkOut);
    }
  }

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
    const adults   = parseInt(document.getElementById('pricingAdults')?.value)   || 0;
    const children = parseInt(document.getElementById('pricingChildren')?.value) || 0;
    const total    = adults + children;
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
    const children = parseInt(document.getElementById('pricingChildren')?.value) || 0;
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
              ${isYoung ? `<span style="font-size:9px;padding:1px 4px;border-radius:4px;background:var(--brand-gold,#f59e0b);color:#fff;font-weight:600">Young</span>` : ''}
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
    renderChildAgeInputs(); // re-render to refresh "Young" badges
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

  // Spread N guests across M rooms as evenly as possible.
  // Front-loads remainders so first rooms are fuller: [2,2,1] for 5/3.
  function _computeDistribution(totalGuests, rooms) {
    if (rooms <= 0) return [];
    if (totalGuests <= 0) return Array(rooms).fill(0);
    const base  = Math.floor(totalGuests / rooms);
    const extra = totalGuests % rooms;
    return Array.from({length: rooms}, (_, i) => base + (i < extra ? 1 : 0));
  }

  // Split each room's occupant count into {adults, children} proportionally.
  // Adults are assigned first; children fill remaining slots.
  function _computeAdultChildSplit(distribution, totalAdults, totalChildren) {
    let remA = totalAdults, remC = totalChildren;
    return distribution.map(n => {
      const a = Math.min(n, remA);
      const c = n - a;
      remA -= a;
      remC -= c;
      return { adults: a, children: c };
    });
  }

  // ---------------------------------------------------------------------------
  // UNDO / REDO FOR ACCOMMODATION CONFIGURATION
  // Snapshots the full lodge-row config before each structural change.
  // ---------------------------------------------------------------------------

  function _accomSnapshot() {
    return Array.from(document.querySelectorAll('#lodgeItems .lodge-item')).map(row => ({
      lodgeName: row.querySelector('[name^="lodge_name_"]')?.value || '',
      roomType:  row.querySelector('[name^="room_type_"]')?.value  || '',
      rooms:     parseInt(row.querySelector('[name^="rooms_"]')?.value)  || 1,
      nights:    parseInt(row.querySelector('[name^="nights_"]')?.value) || 1,
      mealPlan:  row.querySelector('[name^="meal_plan_"]')?.value  || 'BB',
    }));
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
    container.innerHTML = '';
    (snap || []).forEach(cfg => addLodgeItem({ ...cfg, skipHistory: true }));
    _checkCapacityMismatch();
    _renderAccommPricingSummary();
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

  // Update guest assignment checkboxes in all lodge rows
  function _syncLodgeGuestAssignments() {
    document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, roomIdx) => {
      _renderRoomGuestAssignment(row, roomIdx);
    });
  }

  // Compute and display room-by-room occupancy.
  // Derives all values from Basic Details (never from manual per-room inputs).
  // Distribution: ceil(totalGuests/rooms) front-loaded, e.g. 5/3 → [2,2,1].
  // Validation: sum(distribution) === totalGuests, perRoom ≤ maxOcc (unless child sharing).
  function _renderRoomGuestAssignment(row, roomIdx) {
    const container = row.querySelector('.lodge-guest-assign-list');
    if (!container) return;

    const rooms       = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
    const roomTypeVal = row.querySelector('[name^="room_type_"]')?.value || '';
    const lodgeName   = row.querySelector('[name^="lodge_name_"]')?.value || '';
    const maxOcc      = _getMaxOccupancy(roomTypeVal, lodgeName) || 2;

    // Single source of truth: Basic Details
    const totalAdults   = parseInt(document.getElementById('pricingAdults')?.value)   || 0;
    const totalChildren = parseInt(document.getElementById('pricingChildren')?.value) || 0;
    const totalGuests   = totalAdults + totalChildren;

    if (totalGuests === 0) {
      container.innerHTML = '<span style="font-size:var(--text-xs);color:var(--text-muted);font-style:italic">Set guest count in Basic Details above to see room distribution.</span>';
      _updateRoomOccupancyBadge(row, roomIdx);
      return;
    }

    // Compute how many guests go in each physical room
    const distribution = _computeDistribution(totalGuests, rooms);
    const split        = _computeAdultChildSplit(distribution, totalAdults, totalChildren);

    const adultIcon = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="3" r="1.8" stroke="currentColor" stroke-width="1.2"/><path d="M1.5 9.5c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    const childIcon = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 9.5c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    const youngChildCount = _getYoungChildCount();

    let html = '';
    let assignedTotal = 0;

    distribution.forEach((n, r) => {
      assignedTotal += n;
      const { adults: ra, children: rc } = split[r];
      const roomKey   = `${roomIdx}-${r}`;
      const confirmed = !!state.childSharingConfirmed[roomKey];
      const sharing   = _childSharingApplies(ra, rc, maxOcc);
      const exceeded  = n > maxOcc && !sharing;

      const borderCol = exceeded ? 'var(--danger)' : sharing ? 'var(--brand-gold,#f59e0b)' : 'var(--border)';
      const badgeBg   = exceeded ? 'var(--danger)' : sharing ? 'var(--brand-gold,#f59e0b)' : n > 0 ? 'var(--success)' : 'var(--bg-surface)';

      const adultTags = Array.from({length: ra}, () =>
        `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:var(--text-xs);color:var(--brand-green)">${adultIcon} Adult</span>`
      ).join('');
      const childTags = Array.from({length: rc}, (_, ci) => {
        const isYoung = ci < youngChildCount;
        return `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:var(--text-xs);color:var(--brand-gold-dark,#b45309)">${childIcon} Child${isYoung ? ' <span style="font-size:8px">(under 5)</span>' : ''}</span>`;
      }).join('');

      html += `
        <div style="margin-bottom:8px;border:1px solid ${borderCol};border-radius:var(--radius-md);overflow:hidden">
          <div style="display:flex;align-items:center;gap:6px;padding:5px 10px;background:var(--bg-subtle);border-bottom:1px solid ${borderCol}">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="2.5" width="8" height="6.5" rx=".8" stroke="currentColor" stroke-width="1.2"/><path d="M1 5h8" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 5v4" stroke="currentColor" stroke-width="1.2"/></svg>
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--text-secondary)">Room ${r + 1}</span>
            ${roomTypeVal ? `<span style="font-size:10px;color:var(--text-muted)">${escapeHtml(roomTypeVal)}</span>` : ''}
            <span style="font-size:9px;color:var(--text-muted)">Capacity: ${maxOcc}</span>
            <span style="margin-left:auto;font-size:9px;padding:1px 8px;border-radius:8px;background:${badgeBg};color:#fff;font-weight:600">
              ${n}/${maxOcc}
            </span>
            ${exceeded ? `<span style="font-size:9px;color:var(--danger);font-weight:700">Overcrowded!</span>` : ''}
            ${sharing && confirmed ? `<span style="font-size:9px;color:var(--brand-gold-dark,#b45309);font-weight:700">Child sharing ✓</span>` : ''}
            ${sharing && !confirmed ? `<span style="font-size:9px;color:var(--brand-gold,#f59e0b);font-weight:700">Confirm sharing</span>` : ''}
          </div>
          <div style="padding:7px 10px">
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:${exceeded || sharing ? '8px' : '0'}">
              ${adultTags}${childTags}
            </div>
            ${sharing ? `
            <div style="font-size:var(--text-xs);padding:7px 10px;border-radius:var(--radius-md);background:rgba(245,158,11,.08);border:1px solid var(--brand-gold,#f59e0b);margin-bottom:6px">
              <div style="font-weight:700;color:var(--brand-gold-dark,#b45309);margin-bottom:4px">
                This room exceeds standard adult occupancy. However, young children sharing is permitted.
              </div>
              <div style="color:var(--text-secondary);font-size:10px;margin-bottom:6px">
                ${ra} adult${ra !== 1 ? 's' : ''} + ${rc} child${rc !== 1 ? 'ren' : ''} (${youngChildCount} under 5) — sharing arrangement
              </div>
              ${!confirmed ? `
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                <button type="button" class="btn btn-xs" style="font-size:10px;padding:3px 10px;background:var(--brand-gold,#f59e0b);color:#fff;border:none;font-weight:600"
                  onclick="window.TRVE._confirmChildSharing('${roomKey}', true)">
                  Accept arrangement
                </button>
                <button type="button" class="btn btn-xs" style="font-size:10px;padding:3px 10px;background:var(--bg-surface);border:1px solid var(--border)"
                  onclick="window.TRVE._changeRoomsCount(this.closest('.lodge-item'), +1)">
                  Add another room instead
                </button>
              </div>` : `
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px;color:var(--brand-gold-dark,#b45309);font-weight:600">Arrangement confirmed</span>
                <button type="button" class="btn btn-xs" style="font-size:10px;padding:2px 7px;background:var(--bg-surface);border:1px solid var(--border)"
                  onclick="window.TRVE._confirmChildSharing('${roomKey}', false)">Undo</button>
              </div>`}
            </div>` : ''}
            ${exceeded ? `
            <div style="font-size:var(--text-xs);color:var(--danger);font-weight:600;margin-bottom:6px">
              Max capacity for ${escapeHtml(roomTypeVal || 'this room type')} is ${maxOcc}. Please resolve:
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              <button type="button" class="btn btn-xs" style="font-size:10px;padding:3px 8px;background:var(--brand-green);color:#fff;border:none"
                onclick="window.TRVE._changeRoomsCount(this.closest('.lodge-item'), +1)">
                + Add Room
              </button>
              <button type="button" class="btn btn-xs" style="font-size:10px;padding:3px 8px;background:var(--bg-surface);border:1px solid var(--border)"
                onclick="window.TRVE._suggestRoomUpgrade(${roomIdx}, '${escapeHtml(roomTypeVal)}', ${n}, ${maxOcc})">
                Upgrade Room Type
              </button>
            </div>` : ''}
          </div>
        </div>`;
    });

    // Footer: total assigned verification
    html += `
      <div style="font-size:10px;color:${assignedTotal === totalGuests ? 'var(--text-muted)' : 'var(--danger)'};margin-top:4px;text-align:right">
        Total guests accommodated: <strong>${assignedTotal}</strong> / ${totalGuests}
        ${assignedTotal !== totalGuests ? ' ⚠ mismatch' : ''}
      </div>`;

    container.innerHTML = html;
    _updateRoomOccupancyBadge(row, roomIdx);
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

    const tripDays  = parseInt(document.getElementById('pricingDays')?.value) || 7;
    const startDateVal = document.getElementById('pricingTravelStartDate')?.value || '';
    const endDateVal   = document.getElementById('pricingTravelEndDate')?.value   || '';
    let autoNights = Math.max(1, tripDays - 1);
    if (startDateVal && endDateVal) {
      const diff = Math.round((new Date(endDateVal) - new Date(startDateVal)) / 86400000);
      if (diff > 0) autoNights = diff;
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

  // Accommodation pricing summary (guest total + staff total)
  function _renderAccommPricingSummary() {
    const panel = document.getElementById('accomPricingSummary');
    if (!panel) return;

    // Compute guest room costs — adults/children from Basic Details (single source of truth)
    const globalAdults   = parseInt(document.getElementById('pricingAdults')?.value)   || 0;
    const globalChildren = parseInt(document.getElementById('pricingChildren')?.value) || 0;
    let guestTotal = 0;
    document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
      const lodge    = row.querySelector('[name^="lodge_name_"]')?.value;
      if (!lodge) return;
      const rooms    = parseInt(row.querySelector('[name^="rooms_"]')?.value)  || 1;
      const nights   = parseInt(row.querySelector('[name^="nights_"]')?.value) || 1;
      const roomType = row.querySelector('[name^="room_type_"]')?.value        || '';
      const lodgeData = (state.lodgeData || []).find(l => (l.name || l.lodge_name) === lodge);
      const rt = (lodgeData?.room_types || []).find(r => r.room_type === roomType) || (lodgeData?.room_types || [])[0];
      const rate = rt?.net_rate_usd || 0;
      if (!rate) return;
      // Cost = rooms × nights × (adults × rate + children × 50% rate)
      // adults/children are the global totals — the backend distributes across rooms
      guestTotal += nights * (globalAdults * rate + globalChildren * rate * 0.5);
    });

    // Compute staff room costs (ones allocated to 'guest' itinerary count here, others separate)
    let staffGuestTotal = 0, staffOpTotal = 0, staffCoTotal = 0;
    document.querySelectorAll('#staffRoomItems .staff-room-item').forEach(el => {
      const nights   = parseInt(el.querySelector('[name^="sr_nights_"]')?.value)  || 0;
      const rate     = parseFloat(el.querySelector('[name^="sr_rate_"]')?.value)  || 0;
      const pricing  = el.querySelector('[name^="sr_pricing_"]:checked')?.value   || 'operating';
      const subtotal = nights * rate;
      if (pricing === 'guest')     staffGuestTotal += subtotal;
      else if (pricing === 'company') staffCoTotal += subtotal;
      else                         staffOpTotal   += subtotal;
    });

    const staffTotal  = staffGuestTotal + staffOpTotal + staffCoTotal;
    const grandTotal  = guestTotal + staffGuestTotal; // only guest-charged staff rooms add to invoice

    if (guestTotal === 0 && staffTotal === 0) { panel.style.display = 'none'; return; }
    panel.style.display = '';

    panel.innerHTML = `
      <div style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;margin-top:var(--space-3)">
        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Accommodation Cost Preview</div>
        ${guestTotal > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px">
          <span>Guest accommodation</span>
          <strong style="font-family:var(--font-mono)">${fmtMoney(guestTotal)}</strong>
        </div>` : ''}
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
        <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);font-weight:700;border-top:1px solid var(--border);padding-top:6px;margin-top:4px">
          <span>Total accommodation (guest invoice)</span>
          <span style="font-family:var(--font-mono);color:var(--brand-green)">${fmtMoney(grandTotal)}</span>
        </div>
        ${staffOpTotal + staffCoTotal > 0 ? `
        <div style="font-size:9px;color:var(--text-muted);margin-top:4px">+${fmtMoney(staffOpTotal + staffCoTotal)} in operational staff costs (not invoiced to guest)</div>` : ''}
      </div>`;
  }

  function _toggleGuestRoom(guestIdx, roomIdx, checked) {
    if (state.guestRecords[guestIdx]) {
      state.guestRecords[guestIdx].room_idx = checked ? roomIdx : null;
    }
    renderGuestRoster();
    _syncLodgeGuestAssignments();
  }

  // Badge derived entirely from Basic Details ÷ rooms vs maxOcc — no manual inputs.
  function _updateRoomOccupancyBadge(row, roomIdx) {
    const badge = row.querySelector('.lodge-occupancy-badge');
    if (!badge) return;
    const rooms  = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
    const maxOcc = _getMaxOccupancy(
      row.querySelector('[name^="room_type_"]')?.value,
      row.querySelector('[name^="lodge_name_"]')?.value
    ) || 2;
    const totalAdults   = parseInt(document.getElementById('pricingAdults')?.value)   || 0;
    const totalChildren = parseInt(document.getElementById('pricingChildren')?.value) || 0;
    const totalGuests   = totalAdults + totalChildren;
    const perRoom       = totalGuests > 0 ? Math.ceil(totalGuests / rooms) : 0;

    const sharing  = perRoom > maxOcc && _childSharingApplies(
      Math.ceil(totalAdults / rooms), Math.ceil(totalChildren / rooms), maxOcc
    );
    const exceeded = maxOcc > 0 && perRoom > maxOcc && !sharing;

    badge.textContent = totalGuests > 0
      ? `${totalGuests} guests · ${perRoom}/${maxOcc} per room`
      : '—';
    badge.style.background = exceeded
      ? 'var(--danger)'
      : sharing ? 'var(--brand-gold,#f59e0b)'
      : totalGuests > 0 ? 'var(--success)' : 'var(--bg-surface)';
    badge.style.color      = totalGuests > 0 ? '#fff' : 'var(--text-muted)';
    badge.style.borderColor = exceeded
      ? 'var(--danger)'
      : sharing ? 'var(--brand-gold,#f59e0b)'
      : totalGuests > 0 ? 'var(--success)' : 'var(--border)';
    badge.title = exceeded
      ? `Overcrowded! ${perRoom} per room needed but max is ${maxOcc}.`
      : sharing
        ? `Child-sharing: ${perRoom} per room (max ${maxOcc}) — young children permitted.`
        : `${totalGuests} guests across ${rooms} room${rooms !== 1 ? 's' : ''}.`;
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
  function _checkCapacityMismatch() {
    const totalAdults   = parseInt(document.getElementById('pricingAdults')?.value)   || 0;
    const totalChildren = parseInt(document.getElementById('pricingChildren')?.value) || 0;
    const totalGuests   = totalAdults + totalChildren;

    let alertEl = document.getElementById('accommodationMismatchAlert');
    if (!alertEl) {
      const lodgeItems = document.getElementById('lodgeItems');
      if (!lodgeItems) return;
      alertEl = document.createElement('div');
      alertEl.id = 'accommodationMismatchAlert';
      lodgeItems.parentNode.insertBefore(alertEl, lodgeItems.nextSibling);
    }

    if (totalGuests === 0) { alertEl.style.display = 'none'; return; }

    // Capacity = sum of (rooms × maxOcc) across all rows
    let totalCapacity = 0;
    let hasAnyRow = false;
    document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
      const rooms  = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
      const maxOcc = _getMaxOccupancy(
        row.querySelector('[name^="room_type_"]')?.value,
        row.querySelector('[name^="lodge_name_"]')?.value
      ) || 2;
      totalCapacity += rooms * maxOcc;
      hasAnyRow = true;
    });

    if (!hasAnyRow || totalCapacity >= totalGuests) {
      alertEl.style.display = 'none';
      return;
    }

    const gap = totalGuests - totalCapacity;

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
          Configured room capacity: <strong>${totalCapacity}</strong>
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
    const defaultDays = parseInt(dropdownDays?.value) || Math.max(1, (parseInt(document.getElementById('pricingDays')?.value) || 7) - 1);

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
    // Use actual room_type strings from DB — prevents single/double mismatch
    // Deduplicate by room_type name (multiple seasonal entries per room_type)
    const seen = new Set();
    lodge.room_types.forEach(rt => {
      if (seen.has(rt.room_type)) return;
      seen.add(rt.room_type);
      const opt = document.createElement('option');
      opt.value = rt.room_type;  // EXACT DB value — no more LIKE mismatch
      opt.textContent = `${rt.room_type} — $${rt.net_rate_usd}/night`;
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

  // MINOR-32: Pre-filled extra cost row
  function addPresetExtraCost(description, amount) {
    const container = document.getElementById('extraCostsSection');
    const idx = container.children.length;
    const el = document.createElement('div');
    el.className = 'extra-cost-row';
    el.innerHTML = `
      <input type="text" class="form-control" name="extra_desc_${idx}" value="${escapeHtml(description)}" style="flex:1">
      <input type="number" class="form-control" name="extra_amount_${idx}" min="0" value="${amount}" style="width:140px">
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.extra-cost-row').remove()" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);
    toast('info', 'Extra cost added', `${description} — $${amount}`);
  }

  function addExtraCost() {
    const container = document.getElementById('extraCostsSection');
    const idx = container.children.length;
    const el = document.createElement('div');
    el.className = 'extra-cost-row';
    el.innerHTML = `
      <input type="text" class="form-control" name="extra_desc_${idx}" placeholder="Description" style="flex:1">
      <input type="number" class="form-control" name="extra_amount_${idx}" min="0" placeholder="Amount (USD)" style="width:140px">
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.extra-cost-row').remove()" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);
    toast('info', 'Extra cost row added', 'Fill in the description and amount');
  }

  function generateItineraryText(itn) {
    const panel = document.getElementById('aiItineraryPanel');
    if (!panel) return;
    panel.style.display = 'block';

    const days = itn.duration_days || 7;
    const destinations = itn.destinations || [];
    const highlights = (itn.highlights || '').split(',').map(h => h.trim()).filter(Boolean);

    // Generate day-by-day plain text (editable)
    const lines = [];
    lines.push(`Day 1: Arrive ${destinations[0] || 'Entebbe'}. Transfer to lodge, evening briefing.`);
    const destCycle = destinations.slice(1);
    for (let d = 2; d <= days - 1; d++) {
      const dest = destCycle[(d - 2) % Math.max(1, destCycle.length)] || destinations[0];
      const highlight = highlights[(d - 2) % Math.max(1, highlights.length)] || 'Game drive and wildlife viewing';
      lines.push(`Day ${d}: ${dest}. ${highlight}.`);
    }
    lines.push(`Day ${days}: Transfer to Entebbe / Kigali for departure flight.`);
    const defaultText = lines.join('\n');

    // Keep existing saved text if user already edited
    const existingTA = panel.querySelector('.ai-itn-body');
    const textContent = existingTA ? existingTA.value : defaultText;

    const itnId = itn.id || 'current';

    panel.innerHTML = `
      <div class="ai-itn-panel">
        <div class="ai-itn-header">
          <div class="ai-itn-title">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7l2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            AI Itinerary Outline — ${escapeHtml(itn.name || 'Safari Itinerary')}
            <span id="aiItnSavedBadge" style="display:none" class="ai-itn-saved-badge">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
              Saved as working itinerary
            </span>
          </div>
          <div class="ai-itn-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="btnSaveWorkingItn" title="Save this text as the working itinerary for this booking">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10h9M2 2h6l3 3v5H2V2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><rect x="4.5" y="6" width="4" height="4" rx=".5" stroke="currentColor" stroke-width="1.3"/></svg>
              Save Working Itinerary
            </button>
            <button type="button" class="btn btn-gold btn-sm" id="btnFastCreateInvoice" title="Convert this itinerary into a quotation">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10h9M2 1.5h9v9H2v-9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M4.5 5.5h4M4.5 7.5h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
              Fast Create Invoice
            </button>
          </div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-2)">
          ${days}-day outline · Click in the text below to edit · Changes are saved per session
        </div>
        <textarea class="ai-itn-body" id="aiItnTextarea" spellcheck="true">${escapeHtml(textContent)}</textarea>
        <div style="margin-top:var(--space-3);display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          <span style="font-size:var(--text-xs);color:var(--text-muted)">Key highlights: </span>
          ${highlights.map(h => `<span class="ai-suggestion-chip">${escapeHtml(h)}</span>`).join('')}
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--space-2)">
          <em>AI-generated outline from TRVE library. Edit freely — saved version becomes the working itinerary for this booking.</em>
        </div>
      </div>
    `;

    // Save Working Itinerary
    document.getElementById('btnSaveWorkingItn').addEventListener('click', () => {
      const text = document.getElementById('aiItnTextarea').value.trim();
      if (!text) { toast('warning', 'Nothing to save', 'Write the itinerary text first.'); return; }
      state.workingItinerary = {
        itnId,
        enquiryId: state.curation ? state.curation.enquiryId : null,
        itnName: itn.name || 'Safari Itinerary',
        text,
        savedAt: new Date().toISOString()
      };
      const badge = document.getElementById('aiItnSavedBadge');
      if (badge) badge.style.display = 'inline-flex';
      toast('success', 'Working itinerary saved', `"${itn.name || 'Itinerary'}" is now the working itinerary for this booking. It will be included when generating a quotation.`);
    });

    // Fast Create Invoice
    document.getElementById('btnFastCreateInvoice').addEventListener('click', () => {
      const text = document.getElementById('aiItnTextarea')?.value || defaultText;
      // Ensure working itinerary is saved
      state.workingItinerary = state.workingItinerary || {
        itnId, enquiryId: state.curation ? state.curation.enquiryId : null,
        itnName: itn.name || 'Safari Itinerary', text, savedAt: new Date().toISOString()
      };
      // Navigate to quotations
      navigate('quotations');
      toast('info', 'Ready to invoice',
        `Itinerary loaded: "${itn.name || 'Safari'}". Complete the quotation form and click Generate.`);
    });
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
        const d = parseInt(daysInput.value) || 7;
        _syncLodgeNightsFromDays(d);
        _updateAccommodationDates();
        _updateVehicleHint(); // also update vehicle days hint
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
      const total = (parseInt(adultsInput?.value) || 0) + (parseInt(childrenInput?.value) || 0);
      syncGuestRecords(total);
      renderChildAgeInputs();
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

    // Validate accommodation covers all guests before proceeding.
    // Uses computed model: capacity = rooms × maxOcc per row.
    {
      const valAdults   = parseInt(document.getElementById('pricingAdults')?.value)   || 0;
      const valChildren = parseInt(document.getElementById('pricingChildren')?.value) || 0;
      const valTotal    = valAdults + valChildren;
      let   valCapacity = 0;
      let   hasRooms    = false;
      let   hasOvercrowded = false;
      document.querySelectorAll('#lodgeItems .lodge-item').forEach(row => {
        const rooms  = parseInt(row.querySelector('[name^="rooms_"]')?.value) || 1;
        const maxOcc = _getMaxOccupancy(row.querySelector('[name^="room_type_"]')?.value,
                                        row.querySelector('[name^="lodge_name_"]')?.value) || 2;
        valCapacity += rooms * maxOcc;
        hasRooms = true;
        // Check if per-room distribution exceeds capacity
        const perRoom = valTotal > 0 ? Math.ceil(valTotal / rooms) : 0;
        const perRoomAdults   = Math.ceil(valAdults   / rooms);
        const perRoomChildren = Math.ceil(valChildren / rooms);
        if (perRoom > maxOcc && !_childSharingApplies(perRoomAdults, perRoomChildren, maxOcc)) {
          hasOvercrowded = true;
        }
      });
      if (valTotal > 0 && hasRooms && valCapacity < valTotal) {
        const shortfall = valTotal - valCapacity;
        toast('warning', 'Accommodation incomplete',
          `${shortfall} guest${shortfall !== 1 ? 's are' : ' is'} unaccommodated. Add more rooms before calculating.`);
        _checkCapacityMismatch();
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
        return;
      }
      if (hasOvercrowded) {
        toast('warning', 'Room overcrowded',
          'One or more rooms exceed max occupancy. Please upgrade room type or add rooms before calculating.');
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
        return;
      }
    }

    try {
      const adults = parseInt(document.getElementById('pricingAdults').value) || 2;
      const children = parseInt(document.getElementById('pricingChildren').value) || 0;

      // Build accommodations array.
      // adults/children always come from Basic Details (single source of truth).
      const accommodations = [];
      document.querySelectorAll('#lodgeItems .lodge-item').forEach((row) => {
        const lodge    = row.querySelector(`[name^="lodge_name_"]`)?.value;
        const roomType = row.querySelector(`[name^="room_type_"]`)?.value || 'standard';
        const nights   = parseInt(row.querySelector(`[name^="nights_"]`)?.value) || 1;
        const rooms    = parseInt(row.querySelector(`[name^="rooms_"]`)?.value)  || 1;
        const mealPlan = row.querySelector(`[name^="meal_plan_"]`)?.value || 'BB';
        const guestLabel = row.querySelector(`[name^="guest_label_"]`)?.value?.trim() || '';
        // Derive per-room adult/child counts from Basic Details for accurate per-guest pricing
        const perRoomAdults   = rooms > 0 ? Math.ceil(adults   / rooms) : adults;
        const perRoomChildren = rooms > 0 ? Math.ceil(children / rooms) : children;
        if (lodge) accommodations.push({
          lodge, room_type: roomType, nights, rooms,
          meal_plan: mealPlan,
          adults: perRoomAdults, children: perRoomChildren,
          guest_label: guestLabel,
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

      // Build extra costs
      const extra_costs = [];
      document.querySelectorAll('#extraCostsSection .extra-cost-row').forEach(row => {
        const desc = row.querySelector('[name^="extra_desc_"]')?.value.trim();
        const amount = parseFloat(row.querySelector('[name^="extra_amount_"]')?.value);
        if (desc && !isNaN(amount)) extra_costs.push({ description: desc, amount });
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

      const payload = {
        itinerary_id: document.getElementById('pricingItinerary').value || null,
        nationality_tier: document.getElementById('pricingNationality').value,
        adults,
        children,
        pax: adults + children,
        duration_days: parseInt(document.getElementById('pricingDays').value) || 7,
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

    // Format each line item row, handling both USD-only and UGX+USD items
    function renderLineItemRow(item) {
      const usdAmount = item.total_usd != null ? item.total_usd : null;
      const ugxAmount = item.total_ugx != null ? item.total_ugx : null;
      // UGX-only items (e.g. fuel) show '—' in USD column and actual UGX value
      const usdDisplay = usdAmount != null ? fmtMoney(usdAmount) : '—';
      const ugxDisplay = ugxAmount != null
        ? fmtMoney(ugxAmount, 'UGX')
        : (usdAmount != null ? fmtMoney(usdAmount * fxRate, 'UGX') : '—');
      const isFuelLine = item.total_usd == null && item.total_ugx != null;
      return `
        <tr${isFuelLine ? ' style="background:rgba(234,179,8,0.06)"' : ''}>
          <td>${escapeHtml(item.item || '—')}${item.note ? ` <span style="font-size:var(--text-xs);color:var(--text-muted)">(${escapeHtml(item.note)})</span>` : ''}</td>
          <td class="amount-col">${usdDisplay}</td>
          <td class="amount-col" style="color:${isFuelLine ? 'var(--brand-gold)' : 'var(--text-muted)'};font-size:var(--text-xs)">${ugxDisplay}</td>
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
        <div class="price-summary-value">${fmtMoney(result.total_usd)}</div>
        <div class="price-summary-sub">${fmtMoney(result.total_ugx, 'UGX')} equivalent</div>
        <div style="height:1px;background:rgba(255,255,255,0.15);margin:var(--space-4) 0"></div>
        <div class="price-summary-title">Per Person</div>
        <div style="font-family:var(--font-mono);font-size:var(--text-xl);font-weight:700;color:#FFFFFF">${fmtMoney(result.per_person_usd)}</div>
        <div class="price-summary-sub">FX Rate: 1 USD = UGX ${fmtNum(fxRate)}${fxTimestamp ? ` <span style="opacity:0.6;font-size:var(--text-xs)">(${fxTimestamp})</span>` : ' <span style="opacity:0.6;font-size:var(--text-xs)">(fallback)</span>'}</div>
      </div>

      <!-- Line Items Table -->
      <div class="card mb-5">
        <div class="card-header" style="padding:var(--space-4) var(--space-5)">
          <span class="card-title" style="font-size:var(--text-base)">Price Breakdown</span>
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
            <tbody>
              ${lineItems.map(item => renderLineItemRow(item)).join('')}
              <tr class="price-subtotal-row">
                <td><strong>Subtotal</strong></td>
                <td class="amount-col"><strong>${fmtMoney(result.subtotal_usd)}</strong></td>
                <td class="amount-col" style="color:var(--text-muted);font-size:var(--text-xs)">${fmtMoney((result.subtotal_usd || 0) * fxRate, 'UGX')}</td>
              </tr>
              <tr class="price-markup-row">
                <td>${escapeHtml(result.service_fee_label || 'TRVE Service Fee')} (${result.service_fee_pct != null ? result.service_fee_pct + '%' : (state.apiConfig && state.apiConfig.service_fee_pct ? state.apiConfig.service_fee_pct + '%' : '—')})
                  <span style="display:inline-block;margin-left:4px;cursor:help" title="Management & coordination fee applied by The Rift Valley Explorer. Rate is configurable per commission type.">&#9432;</span>
                </td>
                <td class="amount-col">${fmtMoney(result.tmsf_usd || result.service_fee_usd)}</td>
                <td class="amount-col" style="font-size:var(--text-xs)">${fmtMoney(((result.tmsf_usd || result.service_fee_usd) || 0) * fxRate, 'UGX')}</td>
              </tr>
              <tr class="price-total-row">
                <td><strong>Grand Total</strong></td>
                <td class="amount-col"><strong>${fmtMoney(result.total_usd)}</strong></td>
                <td class="amount-col">${fmtMoney(result.total_ugx, 'UGX')}</td>
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
        <table class="data-table">
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
                <td class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(q.id || '—')}</td>
                <td class="mono" style="font-size:var(--text-xs);white-space:nowrap">${escapeHtml(q.booking_ref || '—')}</td>
                <td>
                  <div style="font-weight:500">${escapeHtml(q.client_name || '—')}</div>
                  ${q.client_email ? `<div style="font-size:var(--text-xs);color:var(--text-muted)">${escapeHtml(q.client_email)}</div>` : ''}
                </td>
                <td style="max-width:200px">
                  <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(q.itinerary_name || '')}">${
                    escapeHtml(q.itinerary_name || '—')
                  }</div>
                </td>
                <td class="mono" style="text-align:right;white-space:nowrap">${fmtMoney(q.total_usd)}</td>
                <td style="white-space:nowrap;font-size:var(--text-xs)">${fmtDate(q.created_at)}</td>
                <td>
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
                <td style="white-space:nowrap">
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
    const [unsyncedResult, queueResult, statusResult, quotationsResult] = await Promise.allSettled([
      apiFetch('/api/sync/unsynced'),
      apiFetch('/api/sync/queue'),
      apiFetch('/api/sync/status'),
      apiFetch('/api/quotations')
    ]);

    const unsynced   = unsyncedResult.status   === 'fulfilled' ? unsyncedResult.value   : null;
    const queue      = queueResult.status      === 'fulfilled' ? queueResult.value      : null;
    const syncStatus = statusResult.status     === 'fulfilled' ? statusResult.value     : null;
    const quotations = quotationsResult.status === 'fulfilled' ? quotationsResult.value : null;

    _renderSyncStatusCard(unsynced, syncStatus);
    _renderSyncActions(quotations);
    _renderSyncQueue(queue);
    _renderSyncLog(syncStatus);
  }

  function _renderSyncStatusCard(unsynced, syncStatus) {
    const card = document.getElementById('syncStatusCard');
    if (!card) return;

    const unsyncedCount = unsynced ? (unsynced.count != null ? unsynced.count : (Array.isArray(unsynced) ? unsynced.length : 0)) : '—';
    const lastSync      = syncStatus && syncStatus.last_sync ? fmtDate(syncStatus.last_sync) : 'Never';
    const spreadsheet   = (syncStatus && syncStatus.spreadsheet_name) || 'TRVE_Operations_Hub_Branded';

    card.innerHTML = `
      <div class="card-body" style="padding: var(--space-5) var(--space-6);">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--space-4);">
          <div style="display:flex; align-items:center; gap:var(--space-4);">
            <div class="sync-connected-dot"></div>
            <div>
              <div style="font-weight:600; font-size:var(--text-base); color:var(--text-primary); margin-bottom:2px;">Connected to Operations Hub</div>
              <div style="font-size:var(--text-sm); color:var(--text-muted); font-family:var(--font-mono);">${escapeHtml(spreadsheet)}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px">
                Push (system → Sheets): fully operational &middot;
                Pull (Sheets → system): requires
                <code style="font-size:9px;background:var(--bg-subtle);padding:1px 4px;border-radius:3px">GOOGLE_SHEETS_TOKEN</code> env var
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

  function _renderSyncActions(quotationsData) {
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
        <td><strong>${escapeHtml(l.lodge_name)}</strong></td>
        <td><span style="font-size:var(--text-xs)">${escapeHtml(l.room_type || '')}</span></td>
        <td><span style="font-size:var(--text-xs)">${escapeHtml(l.country || '')} ${l.location ? '· ' + l.location : ''}</span></td>
        <td style="text-align:right;font-family:var(--font-mono);font-size:var(--text-xs)">$${(l.rack_rate_usd || 0).toFixed(0)}</td>
        <td style="text-align:right;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--teal-700)"><strong>$${(l.net_rate_usd || 0).toFixed(0)}</strong></td>
        <td><span style="font-size:var(--text-xs)">${escapeHtml(l.meal_plan || '')}</span></td>
        <td><span style="font-size:10px;color:var(--text-muted)">${l.valid_from ? l.valid_from.slice(0,7) : ''} – ${l.valid_to ? l.valid_to.slice(0,7) : ''}</span></td>
        <td>${l.source_email_date
          ? (() => {
              const ageDays = Math.floor((Date.now() - new Date(l.source_email_date).getTime()) / 86400000);
              const stale = ageDays > 90;
              return `<span style="font-size:10px;color:${stale ? 'var(--danger)' : 'var(--text-muted)'}" title="Email date: ${l.source_email_date}">${stale ? '⚠ ' : ''}${l.source_email_date.slice(0,10)}</span>`;
            })()
          : '<span style="font-size:10px;color:var(--text-muted)">—</span>'}</td>
        <td><span style="font-size:10px;color:var(--text-muted)">${escapeHtml(l.notes || '')}</span></td>
        <td style="white-space:nowrap">
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


})();

// deploy-test 2026-03-11 14:33
// deploy-test 2026-03-11 14:35