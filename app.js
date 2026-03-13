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
    activities: []
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
  window.TRVE = { navigate, loadPipeline, saveFxRateAtQuote, addActivityCost };

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

      const btn = document.getElementById('detailSaveBtn');
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        await apiFetch(`/api/enquiries/${enquiry.id}`, {
          method: 'PATCH',
          body: { status: newStatus, notes: notesEl.value }
        });
        // Update local state
        const idx = state.enquiries.findIndex(e => e.id === enquiry.id);
        if (idx !== -1) {
          state.enquiries[idx].status = newStatus;
          state.enquiries[idx].notes = notesEl.value;
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
        const paxEl = document.getElementById('pricingPax');
        if (paxEl && approvedEnq.pax) paxEl.value = approvedEnq.pax;
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
              if (enq.pax) document.getElementById('pricingPax').value = enq.pax;
              if (enq.travel_start_date) document.getElementById('pricingTravelStartDate').value = enq.travel_start_date;
            }
          }

          // Update permit labels for the new date/tier context
          updatePermitLabels();

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

  function addLodgeItem() {
    const container = document.getElementById('lodgeItems');
    const idx = container.children.length;
    const el = document.createElement('div');
    el.className = 'lodge-item';
    el.dataset.idx = idx;

    const lodgeOptions = state.lodges.length > 0
      ? state.lodges.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')
      : '<option value="" disabled>⚠ No lodges — check backend connection</option>';

    el.innerHTML = `
      <div class="lodge-item-body">
        <select class="form-control" name="lodge_name_${idx}" style="margin-bottom:6px">
          <option value="">— Select lodge —</option>
          ${lodgeOptions}
        </select>
        <select class="form-control" name="room_type_${idx}" style="font-size:var(--text-xs);margin-bottom:8px">
          <option value="">— select lodge first —</option>
        </select>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="lodge-nights-pill" title="Number of nights at this lodge">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v1.5M5.5 8.5V10M1 5.5h1.5M8.5 5.5H10M2.6 2.6l1 1M7.4 7.4l1 1M2.6 8.4l1-1M7.4 3.6l1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="5.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2"/></svg>
            <input type="number" name="nights_${idx}" min="1" value="1" title="Nights at this lodge">
            nights
          </span>
          <span class="lodge-rooms-badge" title="Number of rooms of this type">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="3" width="9" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M1 6h9" stroke="currentColor" stroke-width="1.2"/><path d="M4 6V9" stroke="currentColor" stroke-width="1.2"/></svg>
            <input type="number" name="rooms_${idx}" min="1" value="1" title="Rooms of this type">
            room(s)
          </span>
        </div>
      </div>
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.lodge-item').remove()" title="Remove lodge">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    `;
    container.appendChild(el);

    // FIX: Wire lodge selection to dynamically populate room_type options
    const lodgeSelect = el.querySelector(`[name^="lodge_name_"]`);
    const roomTypeSelect = el.querySelector(`[name^="room_type_"]`);
    if (lodgeSelect && roomTypeSelect) {
      lodgeSelect.addEventListener('change', function() {
        populateRoomTypes(this.value, roomTypeSelect);
      });
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

  function renderActivityPresets() {
    const container = document.getElementById('activityPresets');
    if (!container || !state.activities) return;
    const categories = [...new Set(state.activities.map(a => a.category))];
    let html = '';
    for (const cat of categories) {
      const items = state.activities.filter(a => a.category === cat);
      html += `<div style="margin-bottom:var(--space-2)">
        <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:4px">${cat}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${items.map(a => `
            <button type="button" class="ai-suggestion-chip activity-chip"
              data-activity-id="${escapeHtml(a.id)}"
              onclick="window.TRVE.addActivityCost('${escapeHtml(a.id)}', '${escapeHtml(a.name)}', ${a.default_usd}, ${a.per_person})"
              title="${escapeHtml(a.notes || '')}">
              ${escapeHtml(a.name)}${a.default_usd > 0 ? ` ($${a.default_usd})` : ''}
            </button>
          `).join('')}
        </div>
      </div>`;
    }
    container.innerHTML = html;
    // Re-apply disabled state if activities were previously added
    _syncActivityButtonStates();
  }

  function _syncActivityButtonStates() {
    const added = state.addedActivities || {};
    document.querySelectorAll('.activity-chip[data-activity-id]').forEach(btn => {
      const id = btn.dataset.activityId;
      const count = added[id] || 0;
      const atLimit = count >= ACTIVITY_MAX_USES;
      btn.disabled = atLimit;
      btn.style.opacity = atLimit ? '0.4' : '';
      btn.title = atLimit ? '✓ Already added to this itinerary' : (btn.getAttribute('title') || '');
    });
  }

  function addActivityCost(actId, name, amount, perPerson) {
    if (!state.addedActivities) state.addedActivities = {};
    const count = state.addedActivities[actId] || 0;
    if (count >= ACTIVITY_MAX_USES) {
      toast('warning', 'Already added', `${name} has already been added to this itinerary`);
      return;
    }
    // Pre-fill the extra cost row with activity name and price from database
    addPresetExtraCost(name, amount);
    // Track and disable button
    state.addedActivities[actId] = count + 1;
    _syncActivityButtonStates();
  }

  function initPricingForm() {
    // Per-invoice tracking state
    state.addedActivities = {};
    state.bufferApplied = false;

    document.getElementById('btnAddLodge').addEventListener('click', addLodgeItem);
    document.getElementById('btnAddExtra').addEventListener('click', addExtraCost);

    // MINOR-32: Preset extra cost buttons
    document.getElementById('btnAddVisaFee').addEventListener('click', () => {
      addPresetExtraCost('Uganda Single-Entry Visa (per person)', 50);
    });
    document.getElementById('btnAddAirportTransfer').addEventListener('click', () => {
      addPresetExtraCost('Entebbe Airport Return Transfer', 150);
    });

    // Wire up dynamic permit label updates on nationality tier or travel date change
    const natSel = document.getElementById('pricingNationality');
    const dateSel = document.getElementById('pricingTravelStartDate');
    if (natSel) natSel.addEventListener('change', updatePermitLabels);
    if (dateSel) dateSel.addEventListener('change', updatePermitLabels);
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

    try {
      // Build accommodations array
      const accommodations = [];
      document.querySelectorAll('#lodgeItems .lodge-item').forEach((row, i) => {
        const lodge = row.querySelector(`[name^="lodge_name_"]`)?.value;
        const roomType = row.querySelector(`[name^="room_type_"]`)?.value || 'standard';
        const nights = parseInt(row.querySelector(`[name^="nights_"]`)?.value) || 1;
        const rooms = parseInt(row.querySelector(`[name^="rooms_"]`)?.value) || 1;
        if (lodge) accommodations.push({ lodge, room_type: roomType, nights, rooms });
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

      const payload = {
        itinerary_id: document.getElementById('pricingItinerary').value || null,
        nationality_tier: document.getElementById('pricingNationality').value,
        pax: parseInt(document.getElementById('pricingPax').value) || 2,
        duration_days: parseInt(document.getElementById('pricingDays').value) || 7,
        extra_vehicle_days: parseInt(document.getElementById('pricingVehicleDays').value) || 0,
        travel_start_date: document.getElementById('pricingTravelStartDate').value || null,
        include_insurance: document.getElementById('pricingIncludeInsurance').checked,
        commission_type: document.getElementById('pricingCommissionType').value || null,
        accommodations: accommodations,
        permits: permits,
        extra_costs: extra_costs,
        fuel_vehicle_type: document.getElementById('pricingFuelVehicleType')?.value || null,
        fuel_route_km: parseFloat(document.getElementById('pricingFuelRouteKm')?.value) || null,
        fuel_price_ugx: parseFloat(document.getElementById('pricingFuelPriceUgx')?.value) || 4690,
      };

      const result = await apiFetch('/api/calculate-price', { method: 'POST', body: payload });
      renderPricingResults(result, payload);
      toast('success', 'Price calculated!');

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
          ${escapeHtml(result.nationality_tier || payload.nationality_tier || '—')} &middot; ${result.duration_days || '—'} Days &middot; ${result.pax || payload.pax || '—'} Pax
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

      <!-- Price Notice -->
      <div class="price-notice">
        ⚠️ <strong>Prices are subject to confirmation within 7 days</strong> due to fuel price and exchange rate fluctuations.
        ${result.fuel_buffer_pct ? `Fuel buffer: ${result.fuel_buffer_pct}% applied to vehicle costs.` : ''}
        ${result.fx_buffer_pct ? `FX buffer: ${result.fx_buffer_pct}% noted.` : ''}
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

      const quotationPayload = {
        pricing_data: result.pricing_data || result,
        client_name: clientName || 'Guest',
        client_email: emailInput.value.trim() || null,
        booking_ref: refInput.value.trim() || null,
        valid_days: parseInt(validInput.value) || 14,
        itinerary_id: payload.itinerary_id || null,
        pax: payload.pax,
        nationality_tier: payload.nationality_tier,
        extra_vehicle_days: payload.extra_vehicle_days || 0,
        commission_type: payload.commission_type || null,
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
    document.getElementById('btnRefreshFromSheets').addEventListener('click', () => {
      toast('info', 'Refresh from Sheets', 'Hydrate operation is not yet configured.');
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
      if (tb) tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--danger)">Failed to load lodges: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function renderLodgeTable(lodges) {
    const tbody = document.getElementById('lodgeTableBody');
    if (!tbody) return;
    if (!lodges.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted)">No lodges found. Add one above.</td></tr>`;
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

  function initToolsView() {
    renderBankTxTypes();
    renderBankRefTable();

    document.getElementById('bankTabStanbic').addEventListener('click', () => switchBankTab('stanbic'));
    document.getElementById('bankTabAbsa').addEventListener('click', () => switchBankTab('absa'));
    document.getElementById('bankTxType').addEventListener('change', calcBankCharge);
    document.getElementById('bankTxAmount').addEventListener('input', calcBankCharge);
    document.getElementById('bankTxEntries').addEventListener('input', calcBankCharge);
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
