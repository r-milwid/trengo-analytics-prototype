/* ============================================================
   TRENGO ANALYTICS PROTOTYPE — Profile System
   ============================================================
   Determines the active experience profile based on hostname.
   Two profiles:
     - "internal"  → internal stakeholders (GitHub Pages, localhost)
     - "customer"  → customer-facing user research (Cloudflare Pages)

   Loaded FIRST, before all other app scripts.
   ============================================================ */

const PROFILE = (() => {
  const host = window.location.hostname;
  if (host.includes('pages.dev')) return 'customer';
  return 'internal'; // GitHub Pages, localhost, etc.
})();

// ── Profile configuration ──────────────────────────────────
const PROFILE_CONFIG = {
  internal: {
    label: 'Internal Preview',
    showAdminControls: true,     // debug panels, dev-only buttons
    showDebugInfo: true,         // console badges, state dumps
    guide: 'internal',           // stakeholder feedback guide
    guideScript: 'guide-internal.js',
  },
  customer: {
    label: 'Customer Preview',
    showAdminControls: false,    // hide internal-only controls
    showDebugInfo: false,        // no debug output
    guide: 'research',           // user researcher guide
    guideScript: 'guide-research.js',
  },
};

// Active profile config (convenience shortcut)
const ACTIVE_PROFILE = PROFILE_CONFIG[PROFILE];

// ── Guard flags (small experiments, NOT audience separation) ─
const GUARDS = {
  // Example: GUARDS.showBetaCharts = true;
};

console.log(`[Profile] ${PROFILE} (${ACTIVE_PROFILE.label})`);
