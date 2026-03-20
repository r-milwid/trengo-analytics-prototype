/* ============================================================
   TRENGO ANALYTICS PROTOTYPE — app.js
   ============================================================ */

// DEFAULT_TABS, WIDGETS, WIDGET_BY_ID, TEAMS_DATA, getSectionForWidget
// are defined in widget-catalog.js (loaded before this file)

// ── STATE ──────────────────────────────────────────────────────
const state = {
  currentView: 'landing', // 'landing' | 'analytics'
  lens: null,              // null | 'support' | 'sales' — null means no filter (both visible)
  role: 'supervisor',     // preview role: 'supervisor' | 'agent'
  personaRole: 'supervisor', // selected persona: 'admin' | 'supervisor' | 'agent'
  navMode: 'tabs',     // 'anchors' | 'tabs'
  activeSection: 'overview',
  loadedSections: new Set(),
  pendingLoads: {},
  instantLoadSections: new Set(),
  hiddenWidgets: new Set(),
  addedWidgets: new Set(),
  widgetSpans: {}, // id -> 1 | 2 | 4
  sectionOrder: {}, // sectionId -> [widgetId...]
  sectionLayout: {}, // sectionId -> { rows, placements }
  dateFilter: 'Last 30 days',
  channelFilter: new Set(),
  teamFilter: 'All teams',
  charts: {},
  mockData: { kpi: {}, lists: {}, tables: {}, charts: {} },
  opportunityStates: {}, // id -> 'dismissed' | 'confirmed'
  chartViewMode: {},     // widgetId -> 'chart' | 'numbers'
  barFilter: { widgetId: null, sectionId: null, selectedIndices: new Set() },
  tabs: JSON.parse(JSON.stringify(DEFAULT_TABS)),
  tabWidgets: {}, // tabId -> Set of widget IDs assigned to this tab
  teams: [],
  _onboardingDraftActive: false, // when true, DashboardConfig saves are suppressed
  _preOnboardingSnapshot: null,  // snapshot of config state before onboarding began
};

// Channel values that are considered "voice" — voice widgets hide when any other channel is active
const VOICE_CHANNELS = new Set(['Voice', 'Support EN', 'Support NL', 'Sales', 'Billing', 'Onboarding']);

const dragState = {
  active: false,
  sectionId: null,
  widgetId: null,
  span: 1,
  cardEl: null,
  gridEl: null,
  placeholder: null,
  ghost: null,
  targetRow: null,
  targetCol: null
};

const resizeState = {
  active: false,
  sectionId: null,
  widgetId: null,
  startX: 0,
  startSpan: 1,
  lastSpan: 1,
  raf: null,
  pendingX: null,
  rowWidth: 0,
  placeholder: null,
  cardEl: null,
  targetSpan: null,
  ghostCard: null,
  cardRect: null,
  gridRect: null
};

// ── FEATURE FLAGS ───────────────────────────────────────────────
const FEATURE_FLAGS_KEY   = 'trengo_feature_flags';
const HELION_UNLOCKED_KEY = 'trengo_helion_unlocked';
const USER_TEAMS_KEY      = 'trengo_user_teams';
const DEFAULT_TEAMS_KEY   = 'trengo_default_teams';
const CUSTOMER_PROFILES_KEY = 'trengo_customer_profiles';
const ANCHORS_NAV_USER_KEY = 'trengo_anchors_nav_user';
const CONFIDENCE_THRESHOLDS_KEY = 'trengo_confidence_thresholds';

// Onboarding confidence thresholds (0-10 scale, stored in localStorage, controllable from SideCar admin)
window._confidenceThresholds = (function () {
  var defaults = {
    confidenceSkipSourceGathering: 5,
    confidenceSkipTeamConfirmation: 5,
    confidenceSkipDecisionGoals: 6,
    confidenceSkipSignalFollowup: 7,
    confidenceAutoDraft: 7,
    confidenceSkipDensity: 8,
    correctionSensitivity: 5
  };
  try {
    var stored = JSON.parse(localStorage.getItem(CONFIDENCE_THRESHOLDS_KEY));
    if (stored && typeof stored === 'object') {
      // Merge stored values over defaults so new keys get their defaults
      // and old keys (e.g. confidenceSkipComponents) are ignored
      var merged = {};
      for (var k in defaults) merged[k] = stored[k] != null ? stored[k] : defaults[k];
      return merged;
    }
  } catch (_) { /* ignore */ }
  return defaults;
})();

const LEGACY_CUSTOMER_PROFILE_MIGRATIONS = {
  'northstar-health': {
    legacyWebsites: ['https://www.northstarhealth.io', 'https://connect.doctolib.com/'],
    next: {
      company: 'Northstar Wellness',
      industry: 'Health & Beauty Services',
      website: 'https://www.northstarwellness.eu/',
      helpCenterUrl: 'https://help.northstarwellness.eu/',
      productSummary: 'Premium wellness and beauty group operating spa locations, beauty salons, and wellness studios across the Benelux and France.',
      suggestedPreviewContext: 'Focus on booking responsiveness, cross-location service coordination, membership conversion, and client satisfaction trends.',
    },
  },
  'luma-commerce': {
    legacyWebsites: ['https://www.lumacommerce.eu', 'https://www.westwing.com/home/'],
    next: {
      website: 'https://prestashop.com/',
      helpCenterUrl: 'https://help-center.prestashop.com/',
      productSummary: 'Commerce enablement company supporting design-led and specialty retailers across Europe, with merchant operations, partner onboarding, and a growing B2B commerce service.',
      suggestedPreviewContext: 'Focus on channel-level performance, merchant support health, and separating partner-growth work from operational support metrics.',
    },
  },
  'orbit-mobility': {
    legacyWebsites: ['https://www.orbitmobility.com'],
    next: {
      website: 'https://www.voi.com/',
      helpCenterUrl: '',
    },
  },
};

const FEATURE_FLAGS = [
  { id: 'anchors-nav',      label: 'Anchors navigation',      desc: 'Navigate between sections by scrolling instead of tabs', triState: { off: 'Off', me: 'Me', everyone: 'Everyone' } },
];

function getFeatureFlagValue(id) {
  try {
    const flags = JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}');
    if (id in flags) return flags[id];
    const def = FEATURE_FLAGS.find(f => f.id === id);
    return def && def.defaultEnabled === true ? true : false;
  } catch { return false; }
}

function isFeatureEnabled(id) {
  const val = getFeatureFlagValue(id);
  // Support tri-state string values ('off'/'me'/'everyone')
  if (val === 'off') return false;
  if (val === 'me' || val === 'everyone') return true;
  // Legacy boolean support
  return val === true;
}

function setFeatureFlag(id, value) {
  try {
    const flags = JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}');
    flags[id] = value;
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags));
  } catch {}
}

function hasHelionAccess() {
  return Boolean(localStorage.getItem(HELION_UNLOCKED_KEY));
}

function canUseOnboardingTransition() {
  return hasHelionAccess() && isFeatureEnabled('onboarding-transition');
}

function showHelionAvatar() {
  const btn = document.getElementById('user-flag-btn');
  if (btn) {
    btn.style.display = 'flex';
    btn.dataset.enabled = 'true';
    btn.setAttribute('aria-disabled', 'false');
  }
  const superAdmin = document.getElementById('super-admin-nav');
  if (superAdmin) {
    superAdmin.style.display = '';
    superAdmin.dataset.enabled = 'true';
    superAdmin.setAttribute('aria-disabled', 'false');
  }
  syncAssistantFabIcon();
}

function hideHelionAvatar() {
  const btn = document.getElementById('user-flag-btn');
  if (btn) {
    btn.style.display = 'flex';
    btn.dataset.enabled = 'false';
    btn.setAttribute('aria-disabled', 'true');
  }
  const superAdmin = document.getElementById('super-admin-nav');
  if (superAdmin) {
    superAdmin.style.display = '';
    superAdmin.dataset.enabled = 'false';
    superAdmin.setAttribute('aria-disabled', 'true');
  }
  syncAssistantFabIcon();
}

function unlockHelionAccess() {
  if (localStorage.getItem(HELION_UNLOCKED_KEY)) return;
  localStorage.setItem(HELION_UNLOCKED_KEY, 'true');
  showHelionAvatar();
}

function resetHelionAccess() {
  localStorage.removeItem(HELION_UNLOCKED_KEY);
  hideHelionAvatar();
}

window.canUseOnboardingTransition = canUseOnboardingTransition;

// Restore unlock state on page load
if (localStorage.getItem(HELION_UNLOCKED_KEY)) showHelionAvatar();
else hideHelionAvatar();

// Bootstrap nav mode from feature flag (before sections render)
if (isFeatureEnabled('anchors-nav') || localStorage.getItem(ANCHORS_NAV_USER_KEY) === 'true') state.navMode = 'anchors';

// Apply nav mode change — shared by the feature flag toggle and page bootstrap
function applyNavMode(mode) {
  state.navMode = mode;
  teardownSectionObserver();
  updateSectionsVisibility();
  if (state.navMode === 'anchors') {
    resetLazySections();
    setupSectionObserver();
    setupSentinels();
  } else {
    mountSection(state.activeSection);
  }
}

function syncAssistantFabIcon() {
  const fab = document.getElementById('assistant-fab');
  if (!fab) return;
  fab.classList.toggle('robot-head-mode', canUseOnboardingTransition());
}

syncAssistantFabIcon();

// ── CHART PALETTE (aligned to provided screenshots) ────────────
const CHART_COLORS = {
  teal: '#6fcdbf',
  tealLight: '#9be1d7',
  blue: '#82c9ff',
  purple: '#cf8dff',
  yellow: '#f2c46b',
  navy: '#2a2f4a',
  periwinkle: '#b7c2e6',
  gray: '#dde2ee'
};

function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cloneTeamDefinitions(teams = []) {
  return teams.map(team => ({
    name: String(team?.name || '').trim(),
    usecase: normalizeTeamUsecase(team?.usecase),
    members: Array.isArray(team?.members) ? [...team.members] : [],
    supervisorScope: normalizeSupervisorScope(team?.supervisorScope),
  }));
}

function normalizeTeamUsecase(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'sales' || normalized === 'convert') return 'convert';
  if (normalized === 'support' || normalized === 'resolve') return 'resolve';
  if (normalized === 'both') return 'both';
  return 'resolve';
}

function normalizeSupervisorScope(value) {
  if (value === false) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === 'no' || normalized === 'off' || normalized === '0') return false;
  return true;
}

function buildBuiltInDefaultTeams() {
  return TEAMS_DATA.map(team => ({
    name: team.name,
    members: Array.isArray(team.members) ? [...team.members] : [],
    usecase: team.name === 'Sales team' ? 'convert' : 'resolve',
    supervisorScope: true,
  }));
}

function readStoredTeams(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const teams = cloneTeamDefinitions(parsed).filter(team => team.name);
    return teams.length ? teams : null;
  } catch {
    return null;
  }
}

function writeStoredTeams(key, teams) {
  try {
    localStorage.setItem(key, JSON.stringify(cloneTeamDefinitions(teams)));
  } catch {}
}

function getDefaultTeams() {
  return cloneTeamDefinitions(readStoredTeams(DEFAULT_TEAMS_KEY) || buildBuiltInDefaultTeams());
}

function getStoredUserTeams() {
  return cloneTeamDefinitions(readStoredTeams(USER_TEAMS_KEY) || []);
}

function hasStoredUserTeams() {
  return getStoredUserTeams().length > 0;
}

function getActiveTeams() {
  const userTeams = getStoredUserTeams();
  return userTeams.length ? userTeams : getDefaultTeams();
}

function getTeamUsecaseMap(teams = []) {
  const usecases = {};
  cloneTeamDefinitions(teams).forEach(team => {
    if (team.name) usecases[team.name] = normalizeTeamUsecase(team.usecase);
  });
  return usecases;
}

function getPrototypeTeams() {
  return cloneTeamDefinitions(state.teams || []);
}

function getRoleScopedTeams(role = state.personaRole || state.role || 'supervisor') {
  const teams = getPrototypeTeams();
  if (role === 'supervisor') {
    const scoped = teams.filter(team => normalizeSupervisorScope(team.supervisorScope));
    return scoped.length ? scoped : teams;
  }
  return teams;
}

function persistPrototypeTeams(scope = 'user') {
  writeStoredTeams(scope === 'default' ? DEFAULT_TEAMS_KEY : USER_TEAMS_KEY, getPrototypeTeams());
}

function getTeamNames() {
  return getPrototypeTeams().map(team => team.name);
}

function getPrototypeTeamByName(teamName) {
  return getPrototypeTeams().find(team => team.name === teamName) || null;
}

function syncTeamsState(teams, options = {}) {
  const normalizedTeams = cloneTeamDefinitions(teams).filter(team => team.name);
  state.teams = normalizedTeams;
  state.teamUsecases = getTeamUsecaseMap(normalizedTeams);

  if (options.persist === 'user') {
    writeStoredTeams(USER_TEAMS_KEY, normalizedTeams);
  } else if (options.persist === 'default') {
    writeStoredTeams(DEFAULT_TEAMS_KEY, normalizedTeams);
  } else if (options.persist === 'clear-user') {
    localStorage.removeItem(USER_TEAMS_KEY);
  }

  if (!options.skipUIRefresh && typeof updateTeamFilterOptions === 'function') {
    updateTeamFilterOptions();
  }
}

window.getPrototypeTeams = getPrototypeTeams;
window.getRoleScopedPrototypeTeams = getRoleScopedTeams;
window.syncTeamsState = syncTeamsState;

let _customerProfilesCache = null;

function guessCustomerTeamFocus(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return null;
  const salesSignals = ['sales', 'revenue', 'growth', 'partnership', 'partnerships', 'commercial', 'business development', 'bdr', 'sdr'];
  const supportSignals = ['support', 'care', 'success', 'service', 'operations', 'ops', 'onboarding', 'implementation', 'fleet', 'helpdesk', 'customer care'];
  const hasSales = salesSignals.some(signal => value.includes(signal));
  const hasSupport = supportSignals.some(signal => value.includes(signal));
  if (hasSales && hasSupport) return 'both';
  if (hasSales) return 'convert';
  if (hasSupport) return 'resolve';
  return null;
}

function parseCustomerTeamFocus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'support' || normalized === 'resolve') return 'resolve';
  if (normalized === 'sales' || normalized === 'convert') return 'convert';
  if (normalized === 'both') return 'both';
  return null;
}

function slugifyCustomerId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueNonEmptyLines(value) {
  const seen = new Set();
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeCustomerKnownTeams(teams = []) {
  if (!Array.isArray(teams)) return [];
  return teams
    .map((team) => {
      const source = typeof team === 'string' ? { name: team } : (team || {});
      const name = String(source.name || '').trim();
      if (!name) return null;
      const likelyFocus = parseCustomerTeamFocus(source.likelyFocus || source.usecase) || guessCustomerTeamFocus(name);
      const normalized = {
        ...source,
        name,
      };
      if (likelyFocus) normalized.likelyFocus = likelyFocus;
      else delete normalized.likelyFocus;
      return normalized;
    })
    .filter(Boolean);
}

function normalizeCustomerProfile(profile = {}, index = 0) {
  const company = String(profile.company || '').trim();
  const industry = String(profile.industry || '').trim();
  const website = String(profile.website || '').trim();
  const helpCenterUrl = String(profile.helpCenterUrl || '').trim();
  const productSummary = String(profile.productSummary || '').trim();
  const generalNotes = String(profile.generalNotes || profile.generalInfo || '').trim();
  const extraSourceUrls = Array.isArray(profile.extraSourceUrls)
    ? uniqueNonEmptyLines(profile.extraSourceUrls.join('\n'))
    : uniqueNonEmptyLines('');
  const normalized = {
    ...profile,
    id: String(profile.id || '').trim() || slugifyCustomerId(company) || `customer-${index + 1}`,
    company,
    industry,
    website,
    helpCenterUrl,
    productSummary,
    generalNotes,
    extraSourceUrls,
    knownTeams: normalizeCustomerKnownTeams(profile.knownTeams),
  };
  delete normalized.generalInfo;
  delete normalized.knownTeamsText;
  delete normalized.extraSourceUrlsText;
  return normalized;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function hasMeaningfulProfileValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function mergeCustomerProfileValue(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return hasMeaningfulProfileValue(overrideValue)
      ? cloneJson(overrideValue)
      : cloneJson(baseValue || []);
  }

  if (isPlainObject(baseValue) || isPlainObject(overrideValue)) {
    const result = cloneJson(baseValue || {});
    Object.entries(overrideValue || {}).forEach(([key, value]) => {
      const existing = result[key];
      if (!hasMeaningfulProfileValue(value) && hasMeaningfulProfileValue(existing)) return;
      result[key] = mergeCustomerProfileValue(existing, value);
    });
    return result;
  }

  return hasMeaningfulProfileValue(overrideValue) ? overrideValue : baseValue;
}

function mergeCustomerProfileRecords(baseProfile, overrideProfile) {
  return normalizeCustomerProfile(
    mergeCustomerProfileValue(baseProfile || {}, overrideProfile || {})
  );
}

function ensureUniqueCustomerIds(profiles = []) {
  const seen = new Set();
  return profiles.map((profile, index) => {
    const normalized = normalizeCustomerProfile(profile, index);
    let candidate = normalized.id || `customer-${index + 1}`;
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = `${normalized.id || `customer-${index + 1}`}-${suffix++}`;
    }
    seen.add(candidate);
    return { ...normalized, id: candidate };
  });
}

const BUILT_IN_CUSTOMER_PROFILES = ensureUniqueCustomerIds([
  {
    id: 'northstar-health',
    company: 'Northstar Wellness',
    industry: 'Health & Beauty Services',
    description: 'Existing — all features, all data',
    stage: 'mature',
    workspaceCreatedAt: '2024-09-15T00:00:00Z',
    goals: ['Reduce first response time during peak booking hours', 'Improve cross-location coordination for VIP clients', 'Increase AI resolution rate for routine booking and product inquiries', 'Maintain CSAT above 90%'],
    featureStatus: { voice: true, aiAgents: true, csat: true, journeys: true, knowledgeBase: true },
    productSummary: 'Premium wellness and beauty group operating spa locations, beauty salons, and wellness studios across the Benelux and France.',
    website: 'https://www.northstarwellness.eu/',
    helpCenterUrl: 'https://help.northstarwellness.eu/',
    knownTeams: [
      { name: 'Client Services', likelyFocus: 'resolve', size: 12, description: 'Handles booking inquiries, service questions, complaints, and general client communication' },
      { name: 'Membership Sales', likelyFocus: 'convert', size: 6, description: 'Membership sign-ups, package upsells, corporate wellness deals, and gift card sales' },
      { name: 'Location Onboarding', likelyFocus: 'resolve', size: 4, description: 'Supports new location launches, staff training, and system rollouts' },
      { name: 'VIP Client Care', likelyFocus: 'resolve', size: 3, description: 'Dedicated support for premium members and high-value repeat clients' }
    ],
    channels: ['email', 'whatsapp', 'live-chat', 'voice', 'sms'],
    plan: 'Scale',
    estimatedAgents: 25,
    terminologyHints: { customer: 'client', ticket: 'request', deal: 'membership deal', agent: 'wellness advisor', resolution: 'resolved' },
    currentSetup: {
      primaryUseCase: 'Client booking management and multi-location service coordination',
      busiestChannels: ['whatsapp', 'voice'],
      avgMonthlyConversations: 8500,
      topPainPoints: ['Long first-response times during peak booking hours', 'Difficulty tracking escalated service issues across locations']
    },
    suggestedPreviewContext: 'Focus on booking responsiveness, cross-location service coordination, membership conversion, and client satisfaction trends.'
  },
  {
    id: 'luma-commerce',
    company: 'Luma Commerce',
    industry: 'E-commerce',
    description: 'Onboarded — broad usage, no voice',
    stage: 'onboarded',
    workspaceCreatedAt: '2025-01-20T00:00:00Z',
    goals: ['Identify which channels drive merchant conversion', 'Separate partner-growth work from operational support metrics', 'Reduce merchant onboarding time', 'Improve campaign attribution accuracy'],
    featureStatus: { voice: false, aiAgents: true, csat: true, journeys: true, knowledgeBase: true },
    productSummary: 'Commerce enablement company supporting design-led and specialty retailers across Europe, with merchant operations, partner onboarding, and a growing B2B commerce service.',
    website: 'https://prestashop.com/',
    helpCenterUrl: 'https://help-center.prestashop.com/',
    knownTeams: [
      { name: 'Merchant Care', likelyFocus: 'resolve', size: 18, description: 'Handles merchant setup issues, storefront questions, and operational support' },
      { name: 'Sales & Partnerships', likelyFocus: 'convert', size: 8, description: 'Owns partner growth, agency relationships, and enterprise commerce deals' },
      { name: 'VIP Support', likelyFocus: 'resolve', size: 3, description: 'Dedicated support for strategic merchants and high-touch accounts' },
      { name: 'Growth Commerce', likelyFocus: 'convert', size: 5, description: 'Supports social, campaign, and conversion-led commerce initiatives' }
    ],
    channels: ['email', 'whatsapp', 'instagram', 'facebook-messenger', 'live-chat'],
    plan: 'Enterprise',
    estimatedAgents: 34,
    terminologyHints: { customer: 'customer', ticket: 'inquiry', deal: 'order', agent: 'advisor', resolution: 'resolution' },
    currentSetup: {
      primaryUseCase: 'Merchant support and partner-led commerce conversion',
      busiestChannels: ['email', 'whatsapp', 'instagram'],
      avgMonthlyConversations: 15200,
      topPainPoints: ['Low visibility into which channels drive merchant conversion', 'Partner and support conversations are mixed in the same queues']
    },
    suggestedPreviewContext: 'Focus on channel-level performance, merchant support health, and separating partner-growth work from operational support metrics.'
  },
  {
    id: 'clearline-finance',
    company: 'Clearline Finance',
    industry: 'Consumer Finance',
    description: 'Mature — compliance-heavy, voice, guarded AI',
    stage: 'mature',
    workspaceCreatedAt: '2024-06-01T00:00:00Z',
    goals: ['Maintain SLA compliance above 95% across all channels', 'Reduce call abandonment rate', 'Increase AI resolution rate while keeping guardrails tight', 'Improve first-call resolution for billing disputes'],
    featureStatus: { voice: true, aiAgents: true, csat: true, journeys: true, knowledgeBase: true },
    productSummary: 'Consumer finance company offering personal loans, buy-now-pay-later, and credit products across the Benelux and DACH markets.',
    website: 'https://www.clearline.eu/',
    helpCenterUrl: 'https://support.clearline.eu/',
    knownTeams: [
      { name: 'Customer Support', likelyFocus: 'resolve', size: 20, description: 'General account inquiries, payment questions, and product information' },
      { name: 'Collections', likelyFocus: 'resolve', size: 8, description: 'Overdue payment follow-up, payment arrangements, and hardship cases' },
      { name: 'Lending Sales', likelyFocus: 'convert', size: 10, description: 'Loan applications, credit assessments, and product cross-sell' },
      { name: 'Compliance Ops', likelyFocus: 'resolve', size: 4, description: 'Regulatory inquiries, dispute resolution, and complaint escalations' }
    ],
    channels: ['email', 'whatsapp', 'live-chat', 'voice'],
    plan: 'Enterprise',
    estimatedAgents: 42,
    terminologyHints: { customer: 'applicant', ticket: 'case', deal: 'application', agent: 'advisor', resolution: 'case closed' },
    currentSetup: {
      primaryUseCase: 'Regulated customer support with strict SLA and compliance requirements',
      busiestChannels: ['voice', 'email'],
      avgMonthlyConversations: 22000,
      topPainPoints: ['Call abandonment spikes during billing cycle peaks', 'AI guardrails trigger too often on legitimate loan inquiries', 'No unified view of compliance case outcomes']
    },
    suggestedPreviewContext: 'Focus on SLA compliance, call abandonment, AI guardrail performance, collections efficiency, and compliance case tracking.'
  },
  {
    id: 'harborstay-hospitality',
    company: 'HarborStay Hospitality',
    industry: 'Hotels & Vacation Rentals',
    description: 'In onboarding — guest channels live, AI rolling out',
    stage: 'onboarding',
    workspaceCreatedAt: '2026-01-08T00:00:00Z',
    goals: ['Reduce guest response time during check-in hours', 'Automate booking confirmation and pre-arrival messaging', 'Track guest satisfaction across properties'],
    featureStatus: { voice: false, aiAgents: 'rolling_out', csat: 'planned', journeys: true, knowledgeBase: true },
    productSummary: 'Boutique hotel group and vacation rental operator with 14 properties across Southern Europe.',
    website: 'https://www.harborstay.eu/',
    helpCenterUrl: 'https://help.harborstay.eu/',
    knownTeams: [
      { name: 'Guest Services', likelyFocus: 'resolve', size: 15, description: 'Check-in/out issues, room requests, complaints, and general guest inquiries' },
      { name: 'Reservations', likelyFocus: 'convert', size: 6, description: 'Booking inquiries, availability, modifications, and cancellations' },
      { name: 'Property Ops', likelyFocus: 'resolve', size: 4, description: 'Maintenance requests, housekeeping coordination, and property-level issues' },
      { name: 'Partnerships', likelyFocus: 'convert', size: 3, description: 'Travel agency relationships, OTA management, and corporate travel deals' }
    ],
    channels: ['email', 'whatsapp', 'live-chat', 'instagram'],
    plan: 'Scale',
    estimatedAgents: 28,
    terminologyHints: { customer: 'guest', ticket: 'request', deal: 'booking', agent: 'host', resolution: 'resolved' },
    currentSetup: {
      primaryUseCase: 'Guest communication and booking support across properties',
      busiestChannels: ['whatsapp', 'email'],
      avgMonthlyConversations: 9500,
      topPainPoints: ['Slow response times during weekend check-in peaks', 'No visibility into which properties generate the most repeat booking inquiries']
    },
    suggestedPreviewContext: 'Focus on guest response times, booking conversion, property-level performance, and pre-arrival automation effectiveness.'
  },
  {
    id: 'drivelane-automotive',
    company: 'DriveLane Automotive',
    industry: 'Automotive & Dealers',
    description: 'Onboarded — lead capture and booking only',
    stage: 'onboarded',
    workspaceCreatedAt: '2025-11-05T00:00:00Z',
    goals: ['Capture and qualify inbound leads faster', 'Reduce no-show rate for service appointments', 'Track sales pipeline by dealership'],
    featureStatus: { voice: false, aiAgents: false, csat: false, journeys: false, knowledgeBase: false },
    productSummary: 'Multi-brand dealer group with 8 showrooms and 5 service centers across the Netherlands and Belgium.',
    website: 'https://www.drivelane.nl/',
    knownTeams: [
      { name: 'Sales', likelyFocus: 'convert', size: 14, description: 'Inbound lead handling, test drive bookings, and deal follow-up' },
      { name: 'Service Desk', likelyFocus: 'resolve', size: 8, description: 'Appointment scheduling, service status updates, and warranty claims' },
      { name: 'Customer Relations', likelyFocus: 'resolve', size: 3, description: 'Complaints, escalations, and post-purchase follow-up' }
    ],
    channels: ['email', 'whatsapp', 'live-chat'],
    plan: 'Grow',
    estimatedAgents: 25,
    terminologyHints: { customer: 'lead', ticket: 'inquiry', deal: 'opportunity', agent: 'advisor', resolution: 'closed' },
    currentSetup: {
      primaryUseCase: 'Lead qualification and service appointment management',
      busiestChannels: ['whatsapp', 'email'],
      avgMonthlyConversations: 4200
    },
    suggestedPreviewContext: 'Focus on lead response time, pipeline conversion by dealership, and service appointment scheduling efficiency.'
  },
  {
    id: 'orbit-mobility',
    company: 'Orbit Mobility',
    industry: 'Logistics & Mobility',
    description: 'New — workspace only, no setup yet',
    stage: 'new',
    workspaceCreatedAt: '2026-03-10T00:00:00Z',
    productSummary: 'Urban mobility platform offering shared e-bikes, e-scooters, and last-mile delivery services across 12 European cities. Both consumer app and B2B fleet management.',
    plan: 'Scale',
    estimatedAgents: 36
  }
]);

function readStoredCustomerProfiles() {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const migrated = parsed.map((profile) => {
      const migration = LEGACY_CUSTOMER_PROFILE_MIGRATIONS[profile?.id];
      if (!migration) return profile;
      const currentWebsite = String(profile?.website || '').trim();
      const legacyWebsites = Array.isArray(migration.legacyWebsites)
        ? migration.legacyWebsites
        : [migration.legacyWebsite].filter(Boolean);
      if (!legacyWebsites.includes(currentWebsite)) return profile;
      return {
        ...profile,
        ...migration.next,
      };
    });
    const profiles = ensureUniqueCustomerIds(migrated).filter(profile => profile.company || profile.industry || profile.productSummary || profile.generalNotes);
    return profiles;
  } catch {
    return null;
  }
}

async function seedCustomerProfilesFromFixtures() {
  try {
    const resp = await fetch('mock-customers/index.json');
    const indexData = await resp.json();
    const entries = Array.isArray(indexData?.customers) ? indexData.customers : [];
    const profiles = await Promise.all(entries.map(async (entry, index) => {
      try {
        const fileResp = await fetch(`mock-customers/${entry.file}`);
        const fileData = await fileResp.json();
        return normalizeCustomerProfile({ ...entry, ...fileData }, index);
      } catch {
        return normalizeCustomerProfile(entry, index);
      }
    }));
    return ensureUniqueCustomerIds(profiles);
  } catch {
    return cloneJson(BUILT_IN_CUSTOMER_PROFILES);
  }
}

function saveCustomerProfiles(profiles = []) {
  const normalized = ensureUniqueCustomerIds(profiles);
  _customerProfilesCache = cloneJson(normalized);
  try {
    localStorage.setItem(CUSTOMER_PROFILES_KEY, JSON.stringify(normalized));
  } catch {}
  return cloneJson(normalized);
}

function mergeCustomerProfiles(baseProfiles = [], storedProfiles = []) {
  const merged = [];
  const seen = new Set();
  const baseById = new Map(
    baseProfiles
      .map((profile, index) => normalizeCustomerProfile(profile, index))
      .filter(profile => profile.id)
      .map(profile => [profile.id, profile])
  );

  storedProfiles.forEach((profile, index) => {
    const normalized = normalizeCustomerProfile(profile, index);
    if (!normalized.id) return;
    const baseProfile = baseById.get(normalized.id);
    merged.push(baseProfile ? mergeCustomerProfileRecords(baseProfile, normalized) : normalized);
    seen.add(normalized.id);
  });

  baseProfiles.forEach((profile, index) => {
    const normalized = normalizeCustomerProfile(profile, index);
    if (!normalized.id || seen.has(normalized.id)) return;
    merged.push(normalized);
    seen.add(normalized.id);
  });

  return ensureUniqueCustomerIds(merged);
}

async function loadCustomerProfiles() {
  if (_customerProfilesCache) return cloneJson(_customerProfilesCache);
  const stored = readStoredCustomerProfiles();
  const seeded = await seedCustomerProfilesFromFixtures();
  if (stored) {
    const merged = mergeCustomerProfiles(seeded, stored);
    _customerProfilesCache = cloneJson(merged);
    return cloneJson(merged);
  }
  if (seeded.length) {
    return saveCustomerProfiles(seeded);
  }
  _customerProfilesCache = [];
  return [];
}

function getStoredCustomerProfilesSync() {
  if (_customerProfilesCache) return cloneJson(_customerProfilesCache);
  const stored = readStoredCustomerProfiles();
  if (stored) {
    const merged = mergeCustomerProfiles(BUILT_IN_CUSTOMER_PROFILES, stored);
    _customerProfilesCache = cloneJson(merged);
    return cloneJson(merged);
  }
  _customerProfilesCache = cloneJson(BUILT_IN_CUSTOMER_PROFILES);
  return cloneJson(BUILT_IN_CUSTOMER_PROFILES);
}

function getCustomerProfileById(id) {
  if (!id) return null;
  return getStoredCustomerProfilesSync().find(profile => profile.id === id) || null;
}

function createBlankCustomerProfile() {
  return normalizeCustomerProfile({
    id: `customer-${Date.now()}`,
    company: '',
    industry: '',
    website: '',
    helpCenterUrl: '',
    productSummary: '',
    knownTeams: [],
    extraSourceUrls: [],
    generalNotes: '',
  });
}

window.CustomerProfilesStore = {
  loadAll: loadCustomerProfiles,
  saveAll: saveCustomerProfiles,
  getAllSync: getStoredCustomerProfilesSync,
  getById: getCustomerProfileById,
  createBlank: createBlankCustomerProfile,
  guessTeamFocus: guessCustomerTeamFocus,
};
window.persistPrototypeTeams = persistPrototypeTeams;

// Initialize tabWidgets for default tabs (each gets all widget IDs from its category)
function initTabWidgets() {
  state.tabs.forEach(tab => {
    if (!state.tabWidgets[tab.id]) {
      if (tab.category && WIDGETS[tab.category]) {
        state.tabWidgets[tab.id] = new Set(WIDGETS[tab.category].map(w => w.id));
      } else {
        state.tabWidgets[tab.id] = new Set();
      }
    }
  });
}
initTabWidgets();

function buildDefaultTabWidgets() {
  const tabWidgets = {};
  DEFAULT_TABS.forEach(tab => {
    if (tab.category && WIDGETS[tab.category]) {
      tabWidgets[tab.id] = new Set(WIDGETS[tab.category].map(w => w.id));
    } else {
      tabWidgets[tab.id] = new Set();
    }
  });
  return tabWidgets;
}

function buildDefaultTeamUsecases() {
  return getTeamUsecaseMap(getDefaultTeams());
}

syncTeamsState(getActiveTeams(), { skipUIRefresh: true });

function syncRoleToggleButtons() {
  // Role toggle UI now lives in SideCar overlays — this is kept as a
  // callable no-op so existing call-sites don't need guards.
}

function resetPrototypeStateToDefaults() {
  // Feature flags are testing configuration — never reset them.
  localStorage.removeItem(USER_TEAMS_KEY);
  state.tabs = JSON.parse(JSON.stringify(DEFAULT_TABS));
  state.tabWidgets = buildDefaultTabWidgets();
  state.lens = null;
  state.role = 'supervisor';
  state.personaRole = 'supervisor';
  state.navMode = 'tabs';
  state.dateFilter = 'Last 30 days';
  state.channelFilter = new Set();
  state.teamFilter = 'All teams';
  syncTeamsState(getDefaultTeams(), { persist: 'clear-user' });
  state.opportunityStates = {};
  state.chartViewMode = {};
  state.barFilter = { widgetId: null, sectionId: null, selectedIndices: new Set() };
  state.hiddenWidgets = new Set();
  state.addedWidgets = new Set();
  state.sectionOrder = {};
  state.sectionLayout = {};
  state.widgetSpans = {};
  state.loadedSections = new Set();
  state.pendingLoads = {};
  state.instantLoadSections = new Set();
  state.activeSection = 'overview';
  if (state.expandedWidgets) state.expandedWidgets = new Set();

  document.body.dataset.role = state.role;
  syncRoleToggleButtons();
  syncLensButtons();

  if (viewEditToggleBtn) {
    viewEditToggleBtn.style.display = '';
    setViewEditMode('view');
  }
}

// ── CONFIG CONFLICT HANDLER ──────────────────────────────────
// Called by DashboardConfig when a save returns 409 (server has newer config).
// Re-applies the server's version and re-renders.
window._dashboardConfigConflictHandler = function(config) {
  DashboardConfig.apply(config, state);
  persistPrototypeTeams('user');
  initTabWidgets();
  updateTeamFilterOptions();
  syncRoleToggleButtons();
  renderTabs();
  renderSections();
  scrollToSection(state.activeSection, true);
};

// ── MOCK DATA HELPERS ──────────────────────────────────────────
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min, max, dec=1) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)); }
function pickTrend() { const v = rand(-15, 15); return { val: Math.abs(v), dir: v >= 0 ? 'up' : 'down' }; }
function hours24() { return Array.from({length:24}, (_,i) => `${i.toString().padStart(2,'0')}:00`); }
function days7() {
  const d = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(now); dt.setDate(dt.getDate() - i);
    d.push(dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return d;
}
function paletteCycle(count) {
  const palette = [CHART_COLORS.teal, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.yellow, CHART_COLORS.periwinkle];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

// ── WIDGET RENDERERS ───────────────────────────────────────────
function renderWidget(w, section, placement, rows, layout) {
  if (!isWidgetRenderable(w)) return null;

  const card = document.createElement('div');
  card.className = 'widget-card';
  card.dataset.widgetId = w.id;
  if (placement) card.dataset.row = placement.row;
  card.dataset.size = getSizeClass(w);
  if (placement) {
    card.style.gridColumn = `${placement.col + 1} / span ${placement.span}`;
    card.style.gridRow = placement.row + 1;
  }

  // Emphasis
  if (shouldEmphasize(w)) card.classList.add('emphasized');
  if (shouldDeemphasize(w)) card.classList.add('de-emphasized');

  // Resize handle (stays absolute on right edge)
  card.innerHTML = `<div class="resize-handle" title="Drag to resize"></div>`;

  // Header
  const header = document.createElement('div');
  header.className = 'widget-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'widget-title';

  // Drag handle — inline, left of title text, styled like action buttons
  const dragHandle = document.createElement('button');
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'Drag to reorder';
  dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="4.5" cy="3.5" r="1.2" fill="currentColor"/>
    <circle cx="9.5" cy="3.5" r="1.2" fill="currentColor"/>
    <circle cx="4.5" cy="7" r="1.2" fill="currentColor"/>
    <circle cx="9.5" cy="7" r="1.2" fill="currentColor"/>
    <circle cx="4.5" cy="10.5" r="1.2" fill="currentColor"/>
    <circle cx="9.5" cy="10.5" r="1.2" fill="currentColor"/>
  </svg>`;
  titleEl.appendChild(dragHandle);

  const titleText = document.createElement('span');
  titleText.className = 'widget-title-text';
  titleText.textContent = w.title;
  titleEl.appendChild(titleText);

  // Info icon with tooltip (state-aware)
  const tipText = getTooltip(w);
  if (tipText) {
    const info = document.createElement('span');
    info.className = 'info-icon';
    info.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><text x="7" y="10.5" text-anchor="middle" font-size="9" font-weight="600" fill="currentColor">i</text></svg>';
    info.addEventListener('mouseenter', (e) => showTooltip(e, tipText));
    info.addEventListener('mouseleave', hideTooltip);
    titleEl.appendChild(info);
  }
  header.appendChild(titleEl);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'widget-actions';

  // Chart/numbers view toggle — only for chart widget types
  const chartTypes = ['bar-chart', 'line-chart', 'doughnut-chart'];
  if (chartTypes.includes(w.type)) {
    const toggle = document.createElement('div');
    toggle.className = 'widget-view-toggle';
    const currentMode = state.chartViewMode[w.id] || 'chart';
    toggle.innerHTML = `
      <button class="widget-view-btn${currentMode === 'chart' ? ' active' : ''}" data-mode="chart" title="Chart view">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="7" width="3" height="7" rx="1"/><rect x="6" y="4" width="3" height="10" rx="1"/><rect x="11" y="1" width="3" height="13" rx="1"/>
        </svg>
      </button>
      <button class="widget-view-btn${currentMode === 'numbers' ? ' active' : ''}" data-mode="numbers" title="Numbers view">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <line x1="1" y1="4" x2="9" y2="4"/><line x1="1" y1="8" x2="9" y2="8"/><line x1="1" y1="12" x2="9" y2="12"/>
          <line x1="12" y1="2" x2="12" y2="14"/><line x1="10" y1="4" x2="14" y2="4"/><line x1="10" y1="14" x2="14" y2="14"/>
        </svg>
      </button>`;
    actions.appendChild(toggle);
  }

  // Download CSV button — for charts and tables
  const downloadableTypes = ['bar-chart', 'line-chart', 'doughnut-chart', 'table'];
  if (downloadableTypes.includes(w.type)) {
    const dlBtn = document.createElement('button');
    dlBtn.className = 'widget-action-btn widget-download-btn';
    dlBtn.title = 'Download as .csv';
    dlBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v7.5"/><path d="M4 7l3 3 3-3"/><path d="M2 11v1h10v-1"/></svg>';
    dlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.sendEvent('Widget CSV downloaded — ' + w.title);
      downloadWidgetCSV(w);
    });
    actions.appendChild(dlBtn);
  }

  if (w.vis !== 'always') {
    const hideBtn = document.createElement('button');
    hideBtn.className = 'widget-action-btn';
    hideBtn.title = 'Hide widget';
    hideBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>';
    hideBtn.addEventListener('click', () => {
      hideWidget(w.id, section);
    });
    actions.appendChild(hideBtn);
  }
  header.appendChild(actions);
  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'widget-body';

  // Wire up view toggle after body is created
  if (chartTypes.includes(w.type)) {
    const toggle = actions.querySelector('.widget-view-toggle');
    toggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.widget-view-btn');
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode === (state.chartViewMode[w.id] || 'chart')) return;
      state.chartViewMode[w.id] = mode;
      window.sendEvent('Widget view — ' + w.id + ' switched to ' + mode);
      toggle.querySelectorAll('.widget-view-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      body.innerHTML = '';
      if (state.charts[w.id]) { state.charts[w.id].destroy(); delete state.charts[w.id]; }
      if (mode === 'chart') {
        if (w.type === 'bar-chart') renderBarChart(body, w);
        else if (w.type === 'line-chart') renderLineChart(body, w);
        else if (w.type === 'doughnut-chart') renderDoughnutChart(body, w);
      } else {
        renderChartNumbers(body, w);
      }
    });
  }

  const initialMode = state.chartViewMode[w.id] || 'chart';
  switch (w.type) {
    case 'kpi': renderKPI(body, w); break;
    case 'kpi-group': renderKPIGroup(body, w); break;
    case 'bar-chart':
      if (initialMode === 'numbers') renderChartNumbers(body, w);
      else renderBarChart(body, w);
      break;
    case 'line-chart':
      if (initialMode === 'numbers') renderChartNumbers(body, w);
      else renderLineChart(body, w);
      break;
    case 'doughnut-chart':
      if (initialMode === 'numbers') renderChartNumbers(body, w);
      else renderDoughnutChart(body, w);
      break;
    case 'funnel': renderFunnel(body, w); break;
    case 'table': renderTable(body, w); break;
    case 'list': renderList(body, w); break;
    case 'agent-status': renderAgentOnlineStatus(body, w); break;
    case 'list-actions': renderListActions(body, w); break;
    case 'progress': renderProgress(body, w); break;
    case 'opportunities': renderOpportunities(body, w); break;
  }

  card.appendChild(body);

  // Collapsible body for list-heavy widget types
  const collapsibleTypes = ['list', 'list-actions', 'table', 'opportunities'];
  if (collapsibleTypes.includes(w.type)) {
    body.classList.add('collapsible');
    const expandedWidgets = state.expandedWidgets || (state.expandedWidgets = new Set());
    if (expandedWidgets.has(w.id)) body.classList.add('expanded');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'expand-toggle-btn' + (expandedWidgets.has(w.id) ? ' expanded' : '');
    toggleBtn.innerHTML = `<span>${expandedWidgets.has(w.id) ? 'Show less' : 'Show more'}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4.5l3 3 3-3"/></svg>`;
    toggleBtn.addEventListener('click', () => {
      const isExpanded = body.classList.toggle('expanded');
      toggleBtn.classList.toggle('expanded', isExpanded);
      toggleBtn.querySelector('span').textContent = isExpanded ? 'Show less' : 'Show more';
      if (isExpanded) expandedWidgets.add(w.id); else expandedWidgets.delete(w.id);
      window.sendEvent('Widget ' + (isExpanded ? 'expanded' : 'collapsed') + ' — ' + w.id);
    });
    card.appendChild(toggleBtn);
  }

  // Drill link
  if (w.drill) {
    const drill = document.createElement('a');
    drill.className = 'drill-link';
    drill.textContent = w.drill.label;
    drill.addEventListener('click', () => {
      scrollToSection(w.drill.target);
    });
    card.appendChild(drill);
  }

  dragHandle.addEventListener('pointerdown', (e) => {
    startDrag(e, section, w.id);
  });
  const resizeHandle = card.querySelector('.resize-handle');
  resizeHandle.addEventListener('pointerdown', (e) => {
    if (document.body.dataset.viewmode === 'view') return;
    startResize(e, section, w.id);
  });

  return card;
}

// ── STATE KEY HELPER ───────────────────────────────────────────
// When a specific team is selected and has a usecase assigned, derive the
// lens from that usecase (resolve → support, convert → sales) instead of
// using the manually selected lens from Preview options.
function getEffectiveLens() {
  if (state.teamFilter && state.teamFilter !== 'All teams') {
    const usecase = normalizeTeamUsecase(state.teamUsecases?.[state.teamFilter]);
    if (usecase === 'convert') return 'sales';
    if (usecase === 'resolve') return 'support';
  }
  return state.lens;
}

function stateKey() {
  return `${getEffectiveLens()}_${state.role}`;
}

// Sync the lens toggle buttons in Preview options to reflect the effective lens.
// When a team overrides the lens the buttons are dimmed to show they're overridden.
function syncLensButtons() {
  const effectiveLens = getEffectiveLens();
  const overridden = state.teamFilter
    && state.teamFilter !== 'All teams'
    && normalizeTeamUsecase(state.teamUsecases?.[state.teamFilter]) !== 'both';
  const noLens = effectiveLens === null;
  document.querySelectorAll('#popout-lens-toggle .lens-preview-btn').forEach(b => {
    b.classList.toggle('active', noLens ? false : b.dataset.lens === effectiveLens);
    b.style.opacity = (overridden || noLens) ? '0.45' : '';
    b.style.pointerEvents = overridden ? 'none' : '';
  });
}

// In edit mode with a team filter overriding the lens, suppress state 'hide'
// so all widgets stay visible/togglable while the user customises the layout.
function isEditModeWithTeamOverride() {
  return document.body.dataset.viewmode !== 'view'
      && state.teamFilter
      && state.teamFilter !== 'All teams'
      && normalizeTeamUsecase(state.teamUsecases?.[state.teamFilter]) !== 'both';
}

function getStateOverride(w) {
  if (!w.states) return null;
  const override = w.states[stateKey()] || null;
  if (override === 'hide' && isEditModeWithTeamOverride()) return null;
  return override;
}

function isNonVoiceChannelActive() {
  if (state.channelFilter.size === 0) return false;
  for (const ch of state.channelFilter) {
    if (!VOICE_CHANNELS.has(ch)) return true;
  }
  return false;
}

function getEffectiveVisibility(w) {
  // Explicit user/AI overrides take priority over catalog state rules
  if (state.hiddenWidgets.has(w.id)) return 'hidden';
  if (state.addedWidgets.has(w.id)) return w.vis === 'hidden' ? 'default' : w.vis;
  // Hide "by team" charts when a specific team is selected — they become redundant
  if (w.hideWhenTeamFiltered && state.teamFilter && state.teamFilter !== 'All teams') {
    return 'hidden';
  }
  // Hide "by channel" charts when a specific channel is selected — they become redundant
  if (w.hideWhenChannelFiltered && state.channelFilter.size > 0) {
    return 'hidden';
  }
  // Hide voice widgets when a non-voice channel is active — voice data is irrelevant
  if (w.hideWhenNonVoiceChannel && isNonVoiceChannelActive()) {
    return 'hidden';
  }
  const override = getStateOverride(w);
  if (override === 'hide') return 'hidden';
  if (override === 'show' || override === 'emphasize' || override === 'deemphasize') {
    // If the base was 'hidden' but the state says show/emphasize, promote to visible
    return w.vis === 'hidden' ? 'default' : w.vis;
  }
  return w.vis;
}

function shouldEmphasize(w) {
  return getStateOverride(w) === 'emphasize';
}

function shouldDeemphasize(w) {
  return getStateOverride(w) === 'deemphasize';
}

function getSizeClass(w) {
  return w.sizeClass || 'small';
}

function getAllowedSpans(w) {
  const size = getSizeClass(w);
  if (size === 'large') return [6, 8, 9, 12]; // 50%, 66.67%, 75%, 100%
  return [3, 4, 6]; // 25%, 33.33%, 50%
}

function getBaseSpan(w) {
  if (w.fullWidth) return 12;
  if (w.halfWidth) return 6;
  if (w.type === 'bar-chart') return 6;
  return 3;
}

function getSpan(w) {
  let span = state.widgetSpans[w.id] || getBaseSpan(w);
  const allowed = getAllowedSpans(w);
  if (!allowed.includes(span)) {
    span = allowed[0];
  }
  return span;
}

// Get the tooltip for the current state, falling back to default
function getTooltip(w) {
  if (w.tooltipByState && w.tooltipByState[stateKey()]) {
    return w.tooltipByState[stateKey()];
  }
  return w.tooltip || '';
}

function isWidgetRenderable(w) {
  // Explicit user/AI overrides take priority over catalog state rules
  if (state.hiddenWidgets.has(w.id)) return false;
  if (state.addedWidgets.has(w.id)) return true;
  const stateOverride = getStateOverride(w);
  if (stateOverride === 'hide') return false;
  // State overrides can promote hidden widgets to visible
  if (stateOverride === 'show' || stateOverride === 'emphasize' || stateOverride === 'deemphasize') {
    // Even if base vis is 'hidden', an active override makes it renderable
  } else if (w.vis === 'hidden') {
    // Hidden by default and no override promoting it — not renderable
    return false;
  }
  // Filter-reactive hides (team, channel, voice)
  if (w.hideWhenTeamFiltered && state.teamFilter && state.teamFilter !== 'All teams') return false;
  if (w.hideWhenChannelFiltered && state.channelFilter.size > 0) return false;
  if (w.hideWhenNonVoiceChannel && isNonVoiceChannelActive()) return false;
  return true;
}

function getWidgetById(sectionId, id) {
  return getWidgetsForTab(sectionId).find(w => w.id === id);
}

function ensureSectionOrder(sectionId) {
  if (!state.sectionOrder[sectionId]) {
    state.sectionOrder[sectionId] = getWidgetsForTab(sectionId).map(w => w.id);
  }
}

function resetViewState() {
  state.hiddenWidgets = new Set();
  state.addedWidgets = new Set();
  state.widgetSpans = {};
  state.sectionLayout = {};
  state.sectionOrder = {};
  if (state.expandedWidgets) state.expandedWidgets = new Set();
  // Preserve custom (non-default) tab widget assignments across reset
  const customTabWidgets = {};
  if (state.tabWidgets) {
    for (const [tabId, widgetSet] of Object.entries(state.tabWidgets)) {
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab && !tab.isDefault) {
        customTabWidgets[tabId] = widgetSet;
      }
    }
  }
  // Re-initialize default tab widget sets, then restore custom ones
  state.tabWidgets = {};
  initTabWidgets();
  Object.assign(state.tabWidgets, customTabWidgets);
}

function getVisibleWidgets(sectionId) {
  ensureSectionOrder(sectionId);
  const order = state.sectionOrder[sectionId];
  const widgets = [];
  order.forEach(id => {
    const w = getWidgetById(sectionId, id);
    if (w && isWidgetRenderable(w)) widgets.push(w);
  });
  return widgets;
}

function findSlot(row, span) {
  if (span === 12) {
    return row.every(cell => cell === null) ? 0 : -1;
  }
  for (let c = 0; c <= 12 - span; c++) {
    let ok = true;
    for (let i = c; i < c + span; i++) {
      if (row[i] !== null) { ok = false; break; }
    }
    if (ok) return c;
  }
  return -1;
}

function computeLayout(sectionId, widgets) {
  const rows = [];
  const placements = {};
  widgets.forEach(w => {
    const span = getSpan(w);
    let placed = false;
    for (let r = 0; r < rows.length; r++) {
      const col = findSlot(rows[r], span);
      if (col !== -1) {
        for (let i = col; i < col + span; i++) rows[r][i] = w.id;
        placements[w.id] = { row: r, col, span };
        placed = true;
        break;
      }
    }
    if (!placed) {
      const row = Array.from({ length: 12 }, () => null);
      const col = findSlot(row, span);
      for (let i = col; i < col + span; i++) row[i] = w.id;
      rows.push(row);
      placements[w.id] = { row: rows.length - 1, col, span };
    }
  });
  state.sectionLayout[sectionId] = { rows, placements };
  return { rows, placements };
}

function rowCardIds(row) {
  const seen = new Set();
  const ordered = [];
  row.forEach(id => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  });
  return ordered;
}

function compactRow(layout, rowIdx) {
  const row = layout.rows[rowIdx];
  const ids = rowCardIds(row);
  const newRow = Array.from({ length: 12 }, () => null);
  let col = 0;
  ids.forEach(id => {
    const placement = layout.placements[id];
    if (!placement) return;
    for (let i = 0; i < placement.span; i++) {
      newRow[col + i] = id;
    }
    placement.row = rowIdx;
    placement.col = col;
    col += placement.span;
  });
  layout.rows[rowIdx] = newRow;
}

function normalizeLayout(sectionId, layout) {
  const rows = [];
  const placements = { ...layout.placements };
  let hasGapRow = false;

  layout.rows.forEach((row, idx) => {
    const ids = rowCardIds(row);
    if (ids.length === 0) {
      rows.push({ type: 'empty', row: row, oldIndex: idx });
      return;
    }
    compactRow(layout, idx);
    const compacted = layout.rows[idx];
    const emptyCount = compacted.filter(v => v === null).length;
    if (emptyCount > 0) hasGapRow = true;
    rows.push({ type: 'cards', row: compacted, oldIndex: idx, emptyCount });
  });

  const finalRows = [];
  const rowIndexMap = {};
  let keepFullEmptyAtEnd = false;
  if (!hasGapRow) {
    const last = rows[rows.length - 1];
    if (last && last.type === 'empty') keepFullEmptyAtEnd = true;
  }

  rows.forEach((r, i) => {
    if (r.type === 'empty') {
      if (i === rows.length - 1 && keepFullEmptyAtEnd) {
        rowIndexMap[r.oldIndex] = finalRows.length;
        finalRows.push(r.row);
      }
      return;
    }
    rowIndexMap[r.oldIndex] = finalRows.length;
    finalRows.push(r.row);
  });

  Object.keys(placements).forEach(id => {
    const placement = placements[id];
    if (placement && rowIndexMap[placement.row] !== undefined) {
      placement.row = rowIndexMap[placement.row];
    }
  });

  // Rebuild placements from rows to avoid overlaps
  const rebuilt = {};
  finalRows.forEach((row, r) => {
    let c = 0;
    while (c < 12) {
      const id = row[c];
      if (!id) { c += 1; continue; }
      let span = 1;
      while (c + span < 12 && row[c + span] === id) span += 1;
      if (!rebuilt[id]) rebuilt[id] = { row: r, col: c, span };
      c += span;
    }
  });
  layout.placements = rebuilt;

  const emptyTiles = [];
  finalRows.forEach((row, r) => {
    let lastIndex = -1;
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] !== null) { lastIndex = i; break; }
    }
    if (lastIndex === -1) return;
    const occupied = lastIndex + 1;
    const emptyCount = Math.max(0, 12 - occupied);
    if (emptyCount === 0) return;
    const start = occupied;
    emptyTiles.push({ row: r, col: start, span: emptyCount });
  });

  layout.rows = finalRows;
  layout.placements = rebuilt;
  return { layout, emptyTiles };
}

function ensureLayout(sectionId, widgets) {
  let layout = state.sectionLayout[sectionId];
  if (!layout) {
    return computeLayout(sectionId, widgets);
  }

  // Remove hidden widgets from layout but keep empty slots
  let removedFilterReactive = false;
  Object.keys(layout.placements).forEach(id => {
    const w = getWidgetById(sectionId, id);
    if (!w || !isWidgetRenderable(w)) {
      // Track if a filter-reactive widget was removed — those should repack rather than leave holes
      if (w && (w.hideWhenTeamFiltered || w.hideWhenChannelFiltered || w.hideWhenNonVoiceChannel)) {
        removedFilterReactive = true;
      }
      const placement = layout.placements[id];
      if (placement) {
        for (let c = placement.col; c < placement.col + placement.span; c++) {
          if (layout.rows[placement.row] && layout.rows[placement.row][c] === id) {
            layout.rows[placement.row][c] = null;
          }
        }
      }
      delete layout.placements[id];
    }
  });
  // Filter-reactive removals: recompute from scratch so remaining widgets fill the freed space
  if (removedFilterReactive) {
    delete state.sectionLayout[sectionId];
    return computeLayout(sectionId, widgets);
  }

  // Filter-reactive additions: if a filter-reactive widget just became renderable
  // but isn't in the cached layout, the filter was cleared — recompute from scratch
  // so it returns to its original position rather than being appended to the end.
  let addedFilterReactive = false;
  widgets.forEach(w => {
    if (layout.placements[w.id]) return; // already placed
    if (!isWidgetRenderable(w)) return;  // not renderable, skip
    if (w.hideWhenTeamFiltered || w.hideWhenChannelFiltered || w.hideWhenNonVoiceChannel) {
      addedFilterReactive = true;
    }
  });
  if (addedFilterReactive) {
    delete state.sectionLayout[sectionId];
    return computeLayout(sectionId, widgets);
  }

  // Normalize row length to 12 columns
  layout.rows.forEach((row, idx) => {
    if (row.length < 12) {
      const padded = row.concat(Array.from({ length: 12 - row.length }, () => null));
      layout.rows[idx] = padded;
    }
  });

  // Place newly visible widgets in the earliest available slot
  widgets.forEach(w => {
    if (layout.placements[w.id]) return;
    const span = getSpan(w);
    let placed = false;
    for (let r = 0; r < layout.rows.length; r++) {
      const col = findSlot(layout.rows[r], span);
      if (col !== -1) {
        for (let c = col; c < col + span; c++) layout.rows[r][c] = w.id;
        layout.placements[w.id] = { row: r, col, span };
        placed = true;
        break;
      }
    }
    if (!placed) {
      const row = Array.from({ length: 12 }, () => null);
      const col = findSlot(row, span);
      for (let c = col; c < col + span; c++) row[c] = w.id;
      layout.rows.push(row);
      layout.placements[w.id] = { row: layout.rows.length - 1, col, span };
    }
  });

  state.sectionLayout[sectionId] = layout;
  return layout;
}

function canExpand(w, placement, rows, layout) {
  const size = getSizeClass(w);
  const row = rows[placement.row];
  const ids = rowCardIds(row);
  const totalSpan = ids.reduce((sum, id) => {
    const p = layout && layout.placements && layout.placements[id];
    return sum + (p ? p.span : row.filter(v => v === id).length);
  }, 0);
  const allowed = getAllowedSpans(w);
  const currentIdx = allowed.indexOf(placement.span);
  if (currentIdx === -1 || currentIdx === allowed.length - 1) return false;
  const nextSpan = allowed[currentIdx + 1];
  return totalSpan - placement.span + nextSpan <= 12;
}

function canContract(w, placement) {
  const allowed = getAllowedSpans(w);
  const currentIdx = allowed.indexOf(placement.span);
  return currentIdx > 0;
}

function adjustWidgetSpan(sectionId, id, action) {
  const w = getWidgetById(sectionId, id);
  if (!w) return;
  const layout = state.sectionLayout[sectionId];
  if (!layout || !layout.placements[id]) return;
  const placement = layout.placements[id];
  const row = layout.rows[placement.row];
  const allowed = getAllowedSpans(w);
  const current = placement.span;
  const currentIdx = allowed.indexOf(current);
  let next = current;
  if (action === 'expand') {
    if (!canExpand(w, placement, layout.rows, layout)) return;
    if (currentIdx === -1 || currentIdx === allowed.length - 1) return;
    next = allowed[currentIdx + 1];
    placement.span = next;
    state.widgetSpans[id] = next;
    compactRow(layout, placement.row);
    remountSection(sectionId);
    DashboardConfig.notifyChanged();
    return;
  } else if (action === 'contract') {
    if (currentIdx <= 0) return;
    next = allowed[currentIdx - 1];
    for (let c = placement.col; c < placement.col + placement.span; c++) {
      if (row[c] === id) row[c] = null;
    }
    placement.span = next;
    state.widgetSpans[id] = next;
    // Mark one cell so compactRow's rowCardIds still finds this widget
    row[placement.col] = id;
    compactRow(layout, placement.row);
    remountSection(sectionId);
    DashboardConfig.notifyChanged();
    return;
  }
}

function setWidgetSpan(sectionId, id, targetSpan) {
  const w = getWidgetById(sectionId, id);
  if (!w) return;
  const layout = state.sectionLayout[sectionId];
  if (!layout || !layout.placements[id]) return;
  const placement = layout.placements[id];
  const row = layout.rows[placement.row];
  const allowed = getAllowedSpans(w);
  if (!allowed.includes(targetSpan)) return;
  if (targetSpan === placement.span) return;

  const rowIds = rowCardIds(row);
  const totalSpan = rowIds.reduce((sum, wid) => {
    const p = layout.placements[wid];
    return sum + (p ? p.span : 0);
  }, 0);
  const nextTotal = totalSpan - placement.span + targetSpan;
  if (nextTotal > 12) return;

  for (let c = placement.col; c < placement.col + placement.span; c++) {
    if (row[c] === id) row[c] = null;
  }
  placement.span = targetSpan;
  state.widgetSpans[id] = targetSpan;
  // Mark one cell so compactRow's rowCardIds still finds this widget
  // (compactRow rebuilds all positions from scratch using placement.span)
  row[placement.col] = id;
  compactRow(layout, placement.row);
  remountSection(sectionId);
  DashboardConfig.notifyChanged();
}

function moveWidget(sectionId, id, direction) {
  // deprecated by drag-and-drop
}

function buildRowRects(sectionId, gridEl, layout) {
  const rects = Array.from({ length: layout.rows.length }, () => ({ top: Infinity, bottom: -Infinity }));
  gridEl.querySelectorAll('.widget-card, .empty-tile, .drag-placeholder').forEach(el => {
    const rowIdx = Number(el.dataset.row);
    if (Number.isNaN(rowIdx)) return;
    const r = rects[rowIdx];
    const rect = el.getBoundingClientRect();
    r.top = Math.min(r.top, rect.top);
    r.bottom = Math.max(r.bottom, rect.bottom);
  });
  return rects.map(r => (r.top === Infinity ? null : r));
}

function findSlotNear(row, span, colGuess) {
  let best = -1;
  let bestDist = Infinity;
  for (let c = 0; c <= 12 - span; c++) {
    let ok = true;
    for (let i = c; i < c + span; i++) {
      if (row[i] !== null) { ok = false; break; }
    }
    if (!ok) continue;
    const dist = Math.abs(c - colGuess);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

// Remove the drop insert-bar from the grid
// Returns the left pixel position (in viewport coords) of a given grid column,
// properly accounting for column gaps in the CSS grid.
function colPixelLeft(gridEl, gridRect, colIdx) {
  // Use getComputedStyle to read the actual column track positions
  const style = window.getComputedStyle(gridEl);
  const cols = style.gridTemplateColumns.split(' ');
  const gap = parseFloat(style.columnGap || style.gap || '0');
  let left = gridRect.left;
  for (let i = 0; i < colIdx; i++) {
    left += parseFloat(cols[i] || '0') + gap;
  }
  return left;
}

function clearInsertBar() {
  if (dragState.insertBar) { dragState.insertBar.remove(); dragState.insertBar = null; }
}

// Place an insert-bar at a pixel x position within the grid, at a given row
function updateInsertBar(gridEl, x, rowTop, rowBottom) {
  if (!dragState.insertBar) {
    const bar = document.createElement('div');
    bar.className = 'drag-insert-bar';
    gridEl.appendChild(bar);
    dragState.insertBar = bar;
  }
  const gridRect = gridEl.getBoundingClientRect();
  dragState.insertBar.style.left = `${x - gridRect.left}px`;
  dragState.insertBar.style.top  = `${rowTop - gridRect.top}px`;
  dragState.insertBar.style.height = `${rowBottom - rowTop}px`;
}

// Given a row, find the best insertion col for the dragged widget.
// If the row was originally full (no real free space), always use displacement
// so the widget reorders rather than snapping back to its freed cells.
function findInsertCol(layout, rowIdx, span, colGuess, widgetId) {
  const originalRow = layout.rows[rowIdx];

  // Was the row full before drag started (no nulls when dragged widget included)?
  const rowWasFull = originalRow.every(v => v !== null);

  if (!rowWasFull) {
    // Row has genuine free space — free the dragged widget's cells and find a free slot
    const row = originalRow.slice();
    row.forEach((v, i) => { if (v === widgetId) row[i] = null; });
    const free = findSlotNear(row, span, colGuess);
    if (free !== -1) return { col: free, displaced: false };
  }

  // Row is full (or only free space is from the dragged widget itself) —
  // use displacement: clamp guess to a valid insertion col
  const col = Math.max(0, Math.min(12 - span, colGuess));
  return { col, displaced: true };
}

function startDrag(e, sectionId, widgetId) {
  if (document.body.dataset.viewmode === 'view') return;
  if (dragState.active) return;
  if (resizeState.active) return;
  e.stopPropagation();
  e.preventDefault();
  const layout = state.sectionLayout[sectionId];
  if (!layout || !layout.placements[widgetId]) return;
  const card = e.target.closest('.widget-card');
  const grid = e.target.closest('.widget-grid');
  if (!card || !grid) return;
  if (e.pointerId !== undefined && card.setPointerCapture) {
    try { card.setPointerCapture(e.pointerId); } catch (_) {}
  }

  dragState.active = true;
  dragState.sectionId = sectionId;
  dragState.widgetId = widgetId;
  dragState.span = layout.placements[widgetId].span;
  dragState.cardEl = card;
  dragState.gridEl = grid;
  dragState.targetRow = layout.placements[widgetId].row;
  dragState.targetCol = layout.placements[widgetId].col;
  dragState.insertBar = null;

  // Record pointer offset from card top-left so ghost tracks top-left corner
  const cardRect = card.getBoundingClientRect();
  dragState.pointerOffsetX = e.clientX - cardRect.left;
  dragState.pointerOffsetY = e.clientY - cardRect.top;

  card.classList.add('dragging');
  // Prevent browser scroll/pan gestures from cancelling the drag
  card.style.touchAction = 'none';

  // Ghost: cloned card, positioned at top-left relative to pointer
  const ghost = card.cloneNode(true);
  ghost.classList.remove('dragging');
  ghost.classList.add('drag-ghost');
  const origCanvases = card.querySelectorAll('canvas');
  const ghostCanvases = ghost.querySelectorAll('canvas');
  origCanvases.forEach((c, i) => {
    const gc = ghostCanvases[i];
    if (!gc) return;
    try {
      const img = document.createElement('img');
      img.src = c.toDataURL('image/png');
      img.style.cssText = 'width:100%;height:100%;display:block;';
      gc.parentNode.replaceChild(img, gc);
    } catch (_) {}
  });
  ghost.style.width  = `${cardRect.width}px`;
  ghost.style.height = `${cardRect.height}px`;
  ghost.style.left   = `${cardRect.left}px`;
  ghost.style.top    = `${cardRect.top}px`;
  document.body.appendChild(ghost);
  dragState.ghost = ghost;

  // Placeholder: solid grey shape at current position
  const placeholder = document.createElement('div');
  placeholder.className = 'drag-placeholder';
  placeholder.dataset.row = dragState.targetRow;
  placeholder.style.gridColumn = `${dragState.targetCol + 1} / span ${dragState.span}`;
  placeholder.style.gridRow = dragState.targetRow + 1;
  grid.appendChild(placeholder);
  dragState.placeholder = placeholder;

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
  window.addEventListener('pointercancel', onDragEnd, { once: true });
}

function onDragMove(e) {
  if (!dragState.active) return;
  e.preventDefault();

  // Move ghost anchored at top-left (offset from where pointer grabbed)
  if (dragState.ghost) {
    dragState.ghost.style.left = `${e.clientX - dragState.pointerOffsetX}px`;
    dragState.ghost.style.top  = `${e.clientY - dragState.pointerOffsetY}px`;
  }

  const sectionId = dragState.sectionId;
  const layout    = state.sectionLayout[sectionId];
  if (!layout) return;
  const gridRect  = dragState.gridEl.getBoundingClientRect();
  const rowRects  = buildRowRects(sectionId, dragState.gridEl, layout);

  // Determine which row the cursor is in
  let targetRow = null;
  for (let i = 0; i < rowRects.length; i++) {
    const r = rowRects[i];
    if (!r) continue;
    if (e.clientY >= r.top && e.clientY <= r.bottom) { targetRow = i; break; }
  }
  if (targetRow === null) {
    targetRow = e.clientY > (rowRects[rowRects.length - 1]?.bottom ?? gridRect.bottom)
      ? rowRects.length : 0;
  }

  const colW     = gridRect.width / 12;
  const colGuess = Math.max(0, Math.min(11, Math.floor((e.clientX - gridRect.left) / colW)));

  let targetCol = 0;
  let targetDisplaced = false;
  if (targetRow < layout.rows.length) {
    const { col, displaced } = findInsertCol(layout, targetRow, dragState.span, colGuess, dragState.widgetId);
    targetCol = col;
    targetDisplaced = displaced;

    // Show insert-bar at the left edge of where the placeholder would land.
    // Use colPixelLeft() to account for grid gaps accurately.
    const r = rowRects[targetRow];
    if (r) {
      const barX = colPixelLeft(dragState.gridEl, gridRect, targetCol);
      updateInsertBar(dragState.gridEl, barX, r.top, r.bottom);
    }
  } else {
    clearInsertBar();
    targetCol = 0;
  }

  dragState.targetRow = targetRow;
  dragState.targetCol = targetCol;
  dragState.targetDisplaced = targetDisplaced;
  if (dragState.placeholder) {
    dragState.placeholder.dataset.row = targetRow;
    dragState.placeholder.style.gridRow    = targetRow + 1;
    dragState.placeholder.style.gridColumn = `${targetCol + 1} / span ${dragState.span}`;
  }
}

function onDragEnd() {
  if (!dragState.active) return;
  const sectionId = dragState.sectionId;
  const layout = state.sectionLayout[sectionId];
  const placement = layout && layout.placements[dragState.widgetId];

  if (layout && placement) {
    const widgetId = dragState.widgetId;
    const span     = dragState.span;
    let targetRow  = dragState.targetRow;
    let targetCol  = dragState.targetCol;
    const displaced = dragState.targetDisplaced;

    // Remove dragged widget from its old row
    const oldRow = layout.rows[placement.row];
    for (let c = placement.col; c < placement.col + placement.span; c++) {
      if (oldRow[c] === widgetId) oldRow[c] = null;
    }

    if (targetRow >= layout.rows.length) {
      // Drop into a new row at the bottom
      const newRow = Array.from({ length: 12 }, () => null);
      for (let c = targetCol; c < targetCol + span; c++) newRow[c] = widgetId;
      layout.rows.push(newRow);
    } else if (!displaced) {
      // Free slot — just place it
      const row = layout.rows[targetRow];
      for (let c = targetCol; c < targetCol + span; c++) row[c] = widgetId;
    } else {
      // Row is full — reorder by inserting dragged widget at targetCol,
      // shifting other widgets around it, with overflow going to new rows.
      const row = layout.rows[targetRow];
      const blankRow = () => Array.from({ length: 12 }, () => null);

      // Collect unique widget IDs in left-to-right order, excluding the dragged one
      const seen = new Set();
      const others = [];
      for (let c = 0; c < 12; c++) {
        const id = row[c];
        if (id && id !== widgetId && !seen.has(id)) {
          seen.add(id);
          others.push({ id, span: layout.placements[id].span });
        }
      }

      // Build final ordered list: insert dragged widget so its left edge lands at targetCol.
      // Walk through others accumulating column widths; insert dragged widget
      // when the accumulated width reaches or exceeds targetCol.
      const ordered = [];
      let colCursor = 0;
      let inserted = false;
      for (const w of others) {
        // Insert dragged widget here if targetCol falls within or before this widget's start
        if (!inserted && colCursor >= targetCol) {
          ordered.push({ id: widgetId, span });
          inserted = true;
        }
        ordered.push(w);
        colCursor += w.span;
      }
      if (!inserted) ordered.push({ id: widgetId, span });

      // Repack left-to-right, inserting new rows as needed (never overwrite existing rows)
      layout.rows[targetRow] = blankRow();
      let curRow = targetRow;
      let cursor = 0;
      for (const { id: wid, span: wspan } of ordered) {
        if (cursor + wspan > 12) {
          curRow++;
          if (curRow >= layout.rows.length) layout.rows.push(blankRow());
          else layout.rows.splice(curRow, 0, blankRow()); // insert, don't overwrite
          cursor = 0;
        }
        for (let c = cursor; c < cursor + wspan; c++) layout.rows[curRow][c] = wid;
        layout.placements[wid].row = curRow;
        layout.placements[wid].col = cursor;
        cursor += wspan;
      }
    }

    // Re-sync all placements to actual row positions
    layout.rows = layout.rows.filter(row => row.some(v => v !== null));
    Object.keys(layout.placements).forEach(id => {
      const rIdx = layout.rows.findIndex(row => row.includes(id));
      if (rIdx !== -1) {
        layout.placements[id].row = rIdx;
        // Find leftmost col
        const row = layout.rows[rIdx];
        const col = row.indexOf(id);
        if (col !== -1) layout.placements[id].col = col;
      }
    });
  }

  clearInsertBar();
  if (dragState.placeholder) dragState.placeholder.remove();
  if (dragState.ghost) dragState.ghost.remove();
  if (dragState.cardEl) {
    dragState.cardEl.classList.remove('dragging');
    dragState.cardEl.style.touchAction = '';
  }
  dragState.active = false;
  dragState.sectionId = null;
  dragState.widgetId = null;
  dragState.span = 1;
  dragState.cardEl = null;
  dragState.gridEl = null;
  dragState.placeholder = null;
  dragState.ghost = null;
  dragState.targetRow = null;
  dragState.targetCol = null;
  dragState.targetDisplaced = false;

  remountSection(sectionId);
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointercancel', onDragEnd);
  DashboardConfig.notifyChanged();
  window.sendEvent('Widget reordered');
}

function startResize(e, sectionId, widgetId) {
  if (document.body.dataset.viewmode === 'view') return;
  e.preventDefault();
  e.stopPropagation();
  if (resizeState.active) return;
  const layout = state.sectionLayout[sectionId];
  if (!layout || !layout.placements[widgetId]) return;
  const grid = e.target.closest('.widget-grid');
  const gridRect = grid ? grid.getBoundingClientRect() : null;
  const card = e.target.closest('.widget-card');
  const cardRect = card ? card.getBoundingClientRect() : null;
  resizeState.active = true;
  resizeState.sectionId = sectionId;
  resizeState.widgetId = widgetId;
  resizeState.startX = e.clientX;
  resizeState.startSpan = layout.placements[widgetId].span;
  resizeState.lastSpan = layout.placements[widgetId].span;
  resizeState.rowWidth = gridRect ? gridRect.width : 0;
  resizeState.cardEl = card;
  resizeState.cardRect = cardRect;
  resizeState.gridRect = gridRect;
  resizeState.targetSpan = layout.placements[widgetId].span;

  if (grid && card) {
    const placement = layout.placements[widgetId];
    const placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.dataset.row = placement.row;
    placeholder.style.gridColumn = `${placement.col + 1} / span ${placement.span}`;
    placeholder.style.gridRow = placement.row + 1;
    grid.appendChild(placeholder);
    resizeState.placeholder = placeholder;
    card.style.transformOrigin = 'left center';
  }

  if (cardRect) {
    const ghost = document.createElement('div');
    ghost.className = 'resize-ghost';
    ghost.style.left = `${cardRect.left}px`;
    ghost.style.top = `${cardRect.top}px`;
    ghost.style.width = `${cardRect.width}px`;
    ghost.style.height = `${cardRect.height}px`;
    document.body.appendChild(ghost);
    resizeState.ghostCard = ghost;
  }

  // Build snap indicator track
  if (cardRect && gridRect) {
    const w = getWidgetById(sectionId, widgetId);
    if (w) {
      const allowed = getAllowedSpans(w);
      const placement = layout.placements[widgetId];
      const row = layout.rows[placement.row];
      const rIds = rowCardIds(row);
      const otherSpan = rIds.reduce((s, rid) => rid === widgetId ? s : s + (layout.placements[rid]?.span || 0), 0);
      const maxByRow = 12 - otherSpan;
      const feasible = allowed.filter(s => s <= maxByRow);
      if (feasible.length > 0) {
        const track = document.createElement('div');
        track.className = 'resize-snap-track';
        track.style.left = `${cardRect.left}px`;
        track.style.top = `${cardRect.bottom + 4}px`;
        track.style.width = `${gridRect.width}px`;
        track.style.height = '36px';
        const colWidth = gridRect.width / 12;
        feasible.forEach((span, i) => {
          const xPos = span * colWidth;
          const tick = document.createElement('div');
          tick.className = 'resize-snap-tick';
          tick.dataset.span = span;
          if (i === 0) tick.classList.add('at-min');
          if (i === feasible.length - 1) tick.classList.add('at-max');
          if (span === resizeState.startSpan) tick.classList.add('active');
          tick.style.left = `${xPos - 1}px`;
          track.appendChild(tick);
          const label = document.createElement('div');
          label.className = 'resize-snap-label';
          label.dataset.span = span;
          if (span === resizeState.startSpan) label.classList.add('active');
          const pct = Math.round((span / 12) * 100);
          label.textContent = `${pct}%`;
          label.style.left = `${xPos}px`;
          track.appendChild(label);
        });
        document.body.appendChild(track);
        resizeState.snapTrack = track;
      }
    }
  }

  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', onResizeEnd, { once: true });
}

function onResizeMove(e) {
  if (!resizeState.active) return;
  resizeState.pendingX = e.clientX;
  if (resizeState.raf) return;
  resizeState.raf = requestAnimationFrame(() => {
    const sectionId = resizeState.sectionId;
    const widgetId = resizeState.widgetId;
    const layout = state.sectionLayout[sectionId];
    if (!layout || !layout.placements[widgetId]) {
      resizeState.raf = null;
      return;
    }
    const w = getWidgetById(sectionId, widgetId);
    if (!w) {
      resizeState.raf = null;
      return;
    }
    const allowed = getAllowedSpans(w);
    const dx = resizeState.pendingX - resizeState.startX;
    const rowWidth = resizeState.rowWidth || layout.rows.length;
    const currentPct = (resizeState.startSpan / 12) * 100;
    const minPct = (Math.min(...allowed) / 12) * 100;
    // Limit max span by both widget type and available row space
    const placement0 = layout.placements[widgetId];
    const row0 = layout.rows[placement0.row];
    const rowIds0 = rowCardIds(row0);
    const otherSpan = rowIds0.reduce((sum, rid) => {
      if (rid === widgetId) return sum;
      const p = layout.placements[rid];
      return sum + (p ? p.span : 0);
    }, 0);
    const maxByRow = 12 - otherSpan;
    const structuralMax = Math.max(...allowed);
    const effectiveMax = Math.min(structuralMax, maxByRow);
    // Filter allowed spans to those that fit in the row
    const feasible = allowed.filter(s => s <= effectiveMax);
    if (feasible.length === 0) { resizeState.raf = null; return; }
    const maxPct = (Math.max(...feasible) / 12) * 100;
    const desiredPct = Math.max(minPct, Math.min(maxPct, currentPct + (dx / rowWidth) * 100));
    const feasiblePct = feasible.map(s => (s / 12) * 100);
    let targetSpan = feasible[0];
    let bestDist = Infinity;
    feasiblePct.forEach((pct, i) => {
      const dist = Math.abs(pct - desiredPct);
      if (dist < bestDist) {
        bestDist = dist;
        targetSpan = feasible[i];
      }
    });
    resizeState.targetSpan = targetSpan;
    // Update snap indicators
    if (resizeState.snapTrack) {
      resizeState.snapTrack.querySelectorAll('.resize-snap-tick, .resize-snap-label').forEach(el => {
        el.classList.toggle('active', Number(el.dataset.span) === targetSpan);
      });
    }
    if (resizeState.placeholder) {
      const placement = layout.placements[widgetId];
      resizeState.placeholder.style.gridColumn = `${placement.col + 1} / span ${targetSpan}`;
      resizeState.placeholder.style.gridRow = placement.row + 1;
      resizeState.placeholder.dataset.row = placement.row;

      // Adjust empty tile in the same row so it doesn't overlap the resized card
      const grid = resizeState.cardEl ? resizeState.cardEl.closest('.widget-grid') : null;
      if (grid) {
        const row = layout.rows[placement.row];
        if (row) {
          // Calculate total occupied columns in this row (using original spans, not the resize target)
          const rowIds = rowCardIds(row);
          let occupiedCols = 0;
          rowIds.forEach(id => {
            const p = layout.placements[id];
            if (p) occupiedCols += (id === widgetId ? targetSpan : p.span);
          });
          const emptySpan = Math.max(0, 12 - occupiedCols);
          const emptyStart = occupiedCols;
          grid.querySelectorAll('.empty-tile').forEach(tile => {
            if (Number(tile.dataset.row) === placement.row) {
              if (emptySpan <= 0) {
                tile.style.display = 'none';
              } else {
                tile.style.display = '';
                tile.style.gridColumn = `${emptyStart + 1} / span ${emptySpan}`;
              }
            }
          });
        }
      }
    }
    // Keep card content undistorted; only move ghost edge + placeholder
    if (resizeState.ghostCard && resizeState.cardRect) {
      const minW = (minPct / 100) * resizeState.rowWidth;
      const maxW = (maxPct / 100) * resizeState.rowWidth;
      const desiredW = Math.max(minW, Math.min(maxW, (desiredPct / 100) * resizeState.rowWidth));
      resizeState.ghostCard.style.width = `${desiredW}px`;
    }
    resizeState.raf = null;
  });
}

function onResizeEnd(e) {
  if (!resizeState.active) return;
  if (resizeState.cardEl) {
    resizeState.cardEl.style.transform = '';
    resizeState.cardEl.style.transformOrigin = '';
  }
  if (resizeState.placeholder) resizeState.placeholder.remove();
  if (resizeState.ghostCard) resizeState.ghostCard.remove();
  if (resizeState.snapTrack) { resizeState.snapTrack.remove(); resizeState.snapTrack = null; }
  if (resizeState.targetSpan && resizeState.sectionId && resizeState.widgetId) {
    setWidgetSpan(resizeState.sectionId, resizeState.widgetId, resizeState.targetSpan);
    window.sendEvent('Widget resized — ' + resizeState.widgetId);
  }
  resizeState.active = false;
  resizeState.sectionId = null;
  resizeState.widgetId = null;
  resizeState.startX = 0;
  resizeState.startSpan = 1;
  resizeState.lastSpan = 1;
  resizeState.pendingX = null;
  resizeState.rowWidth = 0;
  resizeState.placeholder = null;
  resizeState.cardEl = null;
  resizeState.targetSpan = null;
  resizeState.ghostCard = null;
  resizeState.cardRect = null;
  resizeState.gridRect = null;
  if (resizeState.raf) cancelAnimationFrame(resizeState.raf);
  resizeState.raf = null;
  window.removeEventListener('pointermove', onResizeMove);
}

// ── KPI ────────────────────────────────────────────────────────
function getPrevPeriodLabel() {
  const map = {
    'Today':        'vs yesterday',
    'Last 7 days':  'vs prev 7 days',
    'Last 14 days': 'vs prev 14 days',
    'Last 30 days': 'vs prev 30 days',
    'Last 90 days': 'vs prev 90 days',
  };
  return map[state.dateFilter] || 'vs prev period';
}

function renderKPI(container, w) {
  const data = getMockKPIData(w.id);
  // Use scope-aware label if available
  let subText = data.sub || '';
  if (w.scopeLabel && w.scopeLabel[state.role]) {
    subText = w.scopeLabel[state.role];
  }
  const extrasHtml = (data.extras && data.extras.length)
    ? `<div class="kpi-extras">${data.extras.map(e =>
        `<div class="kpi-extra-row">
          <span class="kpi-extra-label">${e.label}</span>
          <span class="kpi-extra-value">${e.value}</span>
        </div>`
      ).join('')}</div>`
    : '';
  container.innerHTML = `
    <div class="kpi-value">${data.value}</div>
    <div class="kpi-sub">${subText}</div>
    <div class="kpi-trend ${data.trend.dir}">
      ${data.trend.dir === 'up' ? '\u2191' : '\u2193'} ${data.trend.val}%
      <span style="color:var(--gray-400);margin-left:4px">${getPrevPeriodLabel()}</span>
    </div>
    ${extrasHtml}
  `;
}

function renderKPIGroup(container, w) {
  if (w.id === 'ov-sales-kpis') {
    const pipeline = `€${(rand(80, 200) * 1000).toLocaleString()}`;
    const winRate  = `${rand(25, 55)}%`;
    const avgDeal  = `€${(rand(2, 8) * 1000 + rand(0, 999)).toLocaleString()}`;
    const cycle    = `${rand(12, 35)} days`;
    container.innerHTML = `
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div>
          <div style="font-size:12px;color:var(--gray-500)">Pipeline value</div>
          <div style="font-size:22px;font-weight:700;color:var(--accent-dark)">${pipeline}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--gray-500)">Win rate</div>
          <div style="font-size:22px;font-weight:700;color:#82c9ff">${winRate}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--gray-500)">Avg deal size</div>
          <div style="font-size:22px;font-weight:700;color:var(--yellow)">${avgDeal}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--gray-500)">Avg sales cycle</div>
          <div style="font-size:22px;font-weight:700;color:var(--gray-400)">${cycle}</div>
        </div>
      </div>
    `;
    return;
  }
  if (w.id === 'vc-call-duration-kpis' || w.id === 'op-vc-call-duration-kpis') {
    const avg = `${rand(2,6)}m ${rand(0,59)}s`;
    const longest = `${rand(15,35)}m ${rand(0,59)}s`;
    const shortest = `0m ${rand(10,59)}s`;
    container.innerHTML = `
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div>
          <div style="font-size:12px;color:var(--gray-500)">Average</div>
          <div style="font-size:22px;font-weight:700;color:var(--accent-dark)">${avg}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--gray-500)">Longest</div>
          <div style="font-size:22px;font-weight:700;color:var(--yellow)">${longest}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--gray-500)">Shortest</div>
          <div style="font-size:22px;font-weight:700;color:var(--gray-400)">${shortest}</div>
        </div>
      </div>
    `;
    return;
  }
  container.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:12px;color:var(--gray-500)">Positive responses</div>
        <div style="font-size:22px;font-weight:700;color:var(--accent-dark)">\ud83d\udc4d 30</div>
      </div>
      <div>
        <div style="font-size:12px;color:var(--gray-500)">Neutral responses</div>
        <div style="font-size:22px;font-weight:700;color:var(--yellow)">\ud83d\ude10 1</div>
      </div>
      <div>
        <div style="font-size:12px;color:var(--gray-500)">Negative responses</div>
        <div style="font-size:22px;font-weight:700;color:var(--red)">\ud83d\udc4e 2</div>
      </div>
    </div>
  `;
}

function getMockKPIData(id) {
  if (state.mockData.kpi[id]) return state.mockData.kpi[id];
  const map = {
    'ov-pipeline-value':   { value: '€124,500', sub: 'Sum of amounts for open deals', trend: pickTrend() },
    'ov-win-rate':         { value: '34%', sub: 'Closed-won / total opportunities created', trend: pickTrend() },
    'ov-avg-deal-size':    { value: '€3,680', sub: 'Total revenue from Closed-Won / # Closed-Won', trend: pickTrend() },
    'ov-avg-sales-cycle':  { value: '18 days', sub: 'Avg. days from deal created to closed (won or lost)', trend: pickTrend() },
    'ov-open-tickets':     { value: '16,610', sub: 'Across all channels', trend: pickTrend() },
    'ov-assigned-tickets': { value: '1,183', sub: 'Currently assigned', trend: pickTrend() },
    'ov-first-response':   { value: '27m 35s', sub: 'Median', trend: pickTrend() },
    'ov-resolution-time':  { value: '25h 35m', sub: 'Median', trend: pickTrend() },
    'ov-escalation-rate':  { value: '8.7%', sub: 'AI \u2192 human handoff', trend: pickTrend(),
      extras: [
        { label: 'Avg time before escalation', value: '4m 12s' },
        { label: 'Avg AI replies before escalation', value: '3.2' },
      ]
    },
    'ov-knowledge-gaps':   { value: '42', sub: 'Unresolved or fallback cases', trend: { val: 12, dir: 'up' } },
    'op-first-response':   { value: '27m 35s', sub: 'Median first response', trend: pickTrend() },
    'op-resolution-time':  { value: '25h 35m', sub: 'Median resolution', trend: pickTrend() },
    'op-reopened':         { value: '24', sub: 'Reopened this period', trend: pickTrend() },
    'im-csat':             { value: '88%', sub: 'Customer satisfaction', trend: { val: 2, dir: 'up' } },
    'im-response-rate':    { value: '18%', sub: 'Survey response rate', trend: pickTrend() },
    'im-reopen-rate':      { value: '3.2%', sub: 'Of resolved tickets', trend: { val: 0.5, dir: 'down' } },
    'im-surveys':          { value: '33', sub: 'Total surveys received', trend: pickTrend() },
    'un-unknown-intents':  { value: '127', sub: 'Unclassified tickets', trend: { val: 8, dir: 'up' } },
    'au-ai-tickets':       { value: '10,419', sub: 'AI-handled tickets', trend: { val: 18.7, dir: 'up' } },
    'au-resolution-rate':  { value: '30.1%', sub: '4,159 tickets resolved', trend: { val: 8.7, dir: 'up' },
      extras: [
        { label: 'Avg time to resolution', value: '2m 48s' },
        { label: 'Avg AI replies to resolve', value: '4.1' },
      ]
    },
    'au-assistance-rate':  { value: '35.9%', sub: '4,964 tickets assisted', trend: { val: 3.8, dir: 'down' },
      extras: [
        { label: 'Avg time before handoff', value: '3m 22s' },
        { label: 'Avg AI replies before handoff', value: '2.8' },
      ]
    },
    'au-open-ticket-rate': { value: '48', sub: 'No response yet', trend: { val: 5, dir: 'down' } },
    'au-journeys-escalations': { value: '312', sub: 'Escalated from journeys', trend: pickTrend() },
    'vc-total-calls':          { value: '1,847', sub: 'Inbound + outbound', trend: pickTrend() },
    'vc-missed-calls':         { value: '143', sub: 'Calls not answered', trend: { val: 12, dir: 'up' } },
    'vc-time-to-answer':       { value: '32s', sub: 'Avg — all agents', trend: pickTrend() },
    'vc-longest-wait':         { value: '8m 47s', sub: 'Single longest this period', trend: pickTrend() },
    'vc-ivr-queue-time':       { value: '1m 48s', sub: 'Average per call', trend: pickTrend() },
    'vc-channel-count':        { value: '6', sub: 'Active voice channels', trend: { val: 0, dir: 'up' } },
    'vc-fcr-rate':             { value: '67%', sub: 'First call resolution', trend: { val: 3, dir: 'up' } },
    'vc-callbacks-requested':  { value: '89', sub: 'Callback requests this period', trend: pickTrend() },
    'vc-call-ticket-rate':     { value: '22%', sub: 'Calls resulting in a ticket', trend: pickTrend() },
    // Cross-tab voice KPI mirrors
    'op-vc-longest-wait':        { value: '8m 47s', sub: 'Single longest this period', trend: pickTrend() },
    'op-vc-callbacks-requested': { value: '89', sub: 'Callback requests this period', trend: pickTrend() },
    'ov-vc-missed-calls':      { value: '143', sub: 'Calls not answered', trend: { val: 12, dir: 'up' } },
    'ov-vc-total-calls':       { value: '1,847', sub: 'Inbound + outbound', trend: pickTrend() },
    'op-vc-time-to-answer':    { value: '32s', sub: 'Avg \u2014 all agents', trend: pickTrend() },
    'im-vc-fcr-rate':          { value: '67%', sub: 'First call resolution', trend: { val: 3, dir: 'up' } },
    'im-vc-call-ticket-rate':  { value: '22%', sub: 'Calls resulting in a ticket', trend: pickTrend() },
    'au-vc-ivr-queue-time':    { value: '1m 48s', sub: 'Average per call', trend: pickTrend() },
  };
  const value = map[id] || { value: rand(100,9999).toLocaleString(), sub: '', trend: pickTrend() };
  state.mockData.kpi[id] = value;
  return value;
}

// ── CHART NUMBERS VIEW ─────────────────────────────────────────
function renderChartNumbers(container, w) {
  let data;
  if (w.type === 'doughnut-chart') {
    data = getMockDoughnutData(w.id);
    const vals = data.datasets[0].data;
    const total = vals.reduce((a, b) => a + b, 0);
    let html = '<div class="chart-numbers">';
    data.labels.forEach((label, i) => {
      const val = vals[i];
      const pct = total > 0 ? Math.round(val / total * 100) : 0;
      html += `<div class="chart-numbers-row">
        <span class="chart-numbers-dot" style="background:${data.datasets[0].backgroundColor[i]}"></span>
        <span class="chart-numbers-label">${label}</span>
        <span class="chart-numbers-value">${val.toLocaleString()}</span>
        <span class="chart-numbers-pct">${pct}%</span>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } else {
    // bar / line: show each dataset's total or latest value
    const getter = w.type === 'bar-chart' ? getMockBarData : getMockLineData;
    data = getter(w.id);
    let html = '<div class="chart-numbers">';
    // Single-dataset with per-bar colours → one row per label (like doughnut view)
    const ds0 = data.datasets[0];
    const isPerBarColor = data.datasets.length === 1 && Array.isArray(ds0.backgroundColor) && ds0.backgroundColor.length > 1;
    if (isPerBarColor) {
      data.labels.forEach((label, i) => {
        const val = ds0.data[i];
        if (typeof val !== 'number') return;
        html += `<div class="chart-numbers-row">
          <span class="chart-numbers-dot" style="background:${ds0.backgroundColor[i]}"></span>
          <span class="chart-numbers-label">${label}</span>
          <span class="chart-numbers-value">${val.toLocaleString()}</span>
        </div>`;
      });
    } else {
      data.datasets.forEach(ds => {
        const vals = ds.data.filter(v => typeof v === 'number');
        const total = vals.reduce((a, b) => a + b, 0);
        const avg = vals.length ? Math.round(total / vals.length) : 0;
        const color = ds.borderColor || (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor) || 'var(--gray-400)';
        html += `<div class="chart-numbers-row">
          <span class="chart-numbers-dot" style="background:${color}"></span>
          <span class="chart-numbers-label">${ds.label}</span>
          <span class="chart-numbers-value">${total.toLocaleString()}</span>
          <span class="chart-numbers-pct">avg ${avg.toLocaleString()}/day</span>
        </div>`;
      });
      // Also show label-by-label breakdown if single dataset and ≤8 labels
      if (data.datasets.length === 1 && data.labels.length <= 8) {
        html += '<div class="chart-numbers-breakdown">';
        data.labels.forEach((label, i) => {
          const val = data.datasets[0].data[i];
          if (typeof val !== 'number') return;
          html += `<div class="chart-numbers-breakdown-row">
            <span class="chart-numbers-breakdown-label">${label}</span>
            <span class="chart-numbers-breakdown-value">${val.toLocaleString()}</span>
          </div>`;
        });
        html += '</div>';
      }
    }
    html += '</div>';
    container.innerHTML = html;
  }
}

// ── FUNNEL ─────────────────────────────────────────────────────
function renderFunnel(container, w) {
  const stages = [
    { label: 'New',         value: 240 },
    { label: 'Qualified',   value: 160 },
    { label: 'Proposal',    value: 95  },
    { label: 'Negotiation', value: 58  },
    { label: 'Closed Won',  value: 32  },
  ];
  const chartH   = 200;
  const maxVal    = stages[0].value;
  const barH      = stages.map(s => Math.max(8, Math.round((s.value / maxVal) * chartH)));
  const connW     = 52;
  const parts     = [];

  stages.forEach((s, i) => {
    parts.push(`
      <div class="funnel-stage">
        <div class="funnel-bar-col">
          <div class="funnel-bar" style="height:${barH[i]}px"><span class="funnel-bar-value">${s.value}</span></div>
        </div>
        <span class="funnel-stage-label">${s.label}</span>
      </div>`);
    if (i < stages.length - 1) {
      const pct  = Math.round((stages[i + 1].value / s.value) * 100);
      const drop = 100 - pct;
      const y1   = chartH - barH[i];
      const y2   = chartH - barH[i + 1];
      const pts  = `0,${y1} 0,${chartH} ${connW},${chartH} ${connW},${y2}`;
      parts.push(`
        <div class="funnel-connector">
          <svg viewBox="0 0 ${connW} ${chartH}" preserveAspectRatio="none">
            <polygon points="${pts}" fill="rgba(111,205,191,0.18)"/>
          </svg>
          <div class="funnel-rate-pill">
            <span class="funnel-rate-pct">${pct}%</span>
            <span class="funnel-rate-drop">↓ ${drop}%</span>
          </div>
        </div>`);
    }
  });
  container.innerHTML = `<div class="funnel-container">${parts.join('')}</div>`;
}

// ── CSV DOWNLOAD ────────────────────────────────────────────────
function downloadWidgetCSV(w) {
  let csvRows = [];
  const chartTypes = ['bar-chart', 'line-chart', 'doughnut-chart'];

  if (chartTypes.includes(w.type)) {
    // Get chart data from the same mock functions used for rendering
    let data;
    if (w.type === 'bar-chart') data = getMockBarData(w.id);
    else if (w.type === 'line-chart') data = getMockLineData(w.id);
    else data = getMockDoughnutData(w.id);

    if (data.datasets.length === 1) {
      // Single dataset: Label, Value columns
      csvRows.push(['"Label"', `"${data.datasets[0].label || 'Value'}"`]);
      data.labels.forEach((label, i) => {
        const val = data.datasets[0].data[i];
        csvRows.push([`"${label}"`, typeof val === 'number' ? val : `"${val}"`]);
      });
    } else {
      // Multiple datasets: Label, Dataset1, Dataset2, ...
      const header = ['"Label"', ...data.datasets.map(ds => `"${ds.label || 'Value'}"`)];
      csvRows.push(header);
      data.labels.forEach((label, i) => {
        const row = [`"${label}"`];
        data.datasets.forEach(ds => {
          const val = ds.data[i];
          row.push(typeof val === 'number' ? val : `"${val || ''}"`);
        });
        csvRows.push(row);
      });
    }
  } else if (w.type === 'table') {
    // Extract from rendered table in the DOM
    const card = document.querySelector(`[data-widget="${w.id}"]`);
    if (card) {
      const table = card.querySelector('table');
      if (table) {
        const rows = table.querySelectorAll('tr');
        rows.forEach(tr => {
          const cells = tr.querySelectorAll('th, td');
          const row = [];
          cells.forEach(cell => {
            const text = cell.textContent.trim().replace(/"/g, '""');
            row.push(`"${text}"`);
          });
          csvRows.push(row);
        });
      }
    }
  }

  if (csvRows.length === 0) return;

  const csv = csvRows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${w.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── CHARTS ─────────────────────────────────────────────────────
function renderBarChart(container, w) {
  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-container';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);
  container.appendChild(chartWrap);

  requestAnimationFrame(() => {
    const data = getMockBarData(w.id);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: data,
      options: chartOptions(w)
    });
    state.charts[w.id] = chart;
  });
}

function renderLineChart(container, w) {
  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-container tall';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);
  container.appendChild(chartWrap);

  requestAnimationFrame(() => {
    const data = getMockLineData(w.id);
    const chart = new Chart(canvas, {
      type: 'line',
      data: data,
      options: chartOptions(w)
    });
    state.charts[w.id] = chart;
  });
}

function renderDoughnutChart(container, w) {
  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-container';
  chartWrap.style.height = '180px';
  chartWrap.style.maxWidth = '240px';
  chartWrap.style.margin = '0 auto';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);
  container.appendChild(chartWrap);

  requestAnimationFrame(() => {
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: getMockDoughnutData(w.id),
      /*
      data: {
        labels: ['New contacts', 'Returning contacts'],
        datasets: [{ data: [62, 38], backgroundColor: [CHART_COLORS.teal, CHART_COLORS.periwinkle], borderWidth: 0 }]
      },
      */
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: {
            font: { family: 'Inter', size: 11 }, padding: 12,
            usePointStyle: true, pointStyle: 'circle',
            generateLabels(chart) {
              const bg = chart.data.datasets[0]?.backgroundColor || [];
              const labels = chart.data.labels || [];
              return labels.map((label, i) => ({
                text:        label,
                fillStyle:   Array.isArray(bg) ? bg[i] : bg,
                strokeStyle: Array.isArray(bg) ? bg[i] : bg,
                lineWidth:   0,
                pointStyle:  'circle',
                hidden:      false,
                index:       i,
              }));
            }
          } },
          tooltip: {
            backgroundColor: '#ffffff',
            titleColor: '#18181b',
            bodyColor: '#52525b',
            borderColor: '#e4e4e7',
            borderWidth: 1,
            titleFont: { family: 'Inter', size: 12, weight: '600' },
            bodyFont: { family: 'Inter', size: 12 },
            padding: { top: 10, bottom: 10, left: 14, right: 14 },
            cornerRadius: 10,
            boxWidth: 8,
            boxHeight: 8,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
              labelColor(context) {
                const bg = context.chart.data.datasets[0]?.backgroundColor || [];
                const colour = Array.isArray(bg) ? bg[context.dataIndex] : bg;
                return { borderColor: colour, backgroundColor: colour, borderWidth: 0 };
              },
              label(context) {
                const label = context.label || '';
                const value = context.formattedValue;
                return `${label}    ${value}`;
              }
            }
          }
        }
      }
    });
    state.charts[w.id] = chart;
  });
}

function getMockDoughnutData(id) {
  if (state.mockData.charts[id]) return cloneData(state.mockData.charts[id]);
  const salesChLabels = ['WhatsApp', 'Voice', 'Email', 'Live chat', 'Telegram', 'TikTok'];
  const salesChColors = [CHART_COLORS.teal, CHART_COLORS.blue, CHART_COLORS.periwinkle, CHART_COLORS.yellow, CHART_COLORS.purple, CHART_COLORS.tealLight];
  let data;
  if (id === 'un-deals-by-channel') {
    data = {
      labels: salesChLabels,
      datasets: [{ data: salesChLabels.map((_, i) => rand(i === 0 ? 30 : 5, i === 0 ? 80 : 40)), backgroundColor: salesChColors, borderWidth: 0 }]
    };
  } else if (id === 'un-deals-won-by-channel') {
    data = {
      labels: salesChLabels,
      datasets: [{ data: [rand(10,25), rand(5,15), rand(8,20), rand(3,12), rand(2,8), rand(1,5)], backgroundColor: salesChColors, borderWidth: 0 }]
    };
  } else {
    data = {
      labels: ['New contacts', 'Returning contacts'],
      datasets: [{ data: [62, 38], backgroundColor: [CHART_COLORS.teal, CHART_COLORS.periwinkle], borderWidth: 0 }]
    };
  }
  state.mockData.charts[id] = data;
  return cloneData(data);
}

function chartOptions(w) {
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 8, right: 4 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          font: { family: 'Inter', size: 11 },
          padding: 12,
          usePointStyle: true,
          pointStyle: 'circle',
          generateLabels(chart) {
            const datasets = chart.data.datasets;
            // Single-dataset bar chart with per-bar colours → no legend (x-axis labels already name each bar)
            if (datasets.length === 1 && Array.isArray(datasets[0].backgroundColor) && datasets[0].backgroundColor.length > 1) {
              return [];
            }
            // Default: one legend item per dataset
            const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
            items.forEach((item, i) => {
              const ds = datasets[i];
              if (!ds) return;
              // Solid colour: line charts use borderColor, bar charts use backgroundColor
              const colour = ds.borderColor || (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor) || item.fillStyle;
              item.fillStyle   = colour;
              item.strokeStyle = colour;
              item.lineWidth   = 0;
              item.pointStyle  = 'circle';
            });
            return items;
          }
        }
      },
      tooltip: {
        backgroundColor: '#ffffff',
        titleColor: '#18181b',
        bodyColor: '#52525b',
        borderColor: '#e4e4e7',
        borderWidth: 1,
        titleFont: { family: 'Inter', size: 12, weight: '600' },
        bodyFont: { family: 'Inter', size: 12 },
        padding: { top: 10, bottom: 10, left: 14, right: 14 },
        cornerRadius: 10,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
          labelColor(context) {
            const ds = context.chart.data.datasets[context.datasetIndex];
            const colour = ds.borderColor ||
              (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[context.dataIndex] : ds.backgroundColor) ||
              '#18181b';
            return { borderColor: colour, backgroundColor: colour, borderWidth: 0 };
          },
          label(context) {
            const ds = context.dataset;
            const label = ds.label || '';
            const value = context.formattedValue;
            return `  ${label}: ${value}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#a1a1aa' }
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.045)', drawTicks: false },
        border: { display: false, dash: [3, 3] },
        ticks: {
          font: { family: 'Inter', size: 11 }, color: '#a1a1aa', padding: 8,
          maxTicksLimit: 5,
          callback(value) {
            if (value >= 1000000) return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1) + 'M';
            if (value >= 1000)    return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
            return value;
          }
        },
        beginAtZero: true
      }
    }
  };
  // Dual y-axis for mixed charts (satisfaction score)
  if (w.id === 'im-satisfaction-score') {
    opts.scales.y.title = { display: true, text: 'Score %', font: { family: 'Inter', size: 11 } };
    opts.scales.y1 = {
      type: 'linear',
      display: true,
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { font: { family: 'Inter', size: 11 }, color: '#71717a' },
      beginAtZero: true,
      title: { display: true, text: 'Surveys', font: { family: 'Inter', size: 11 } }
    };
  }
  // Dual y-axis for call abandonment trend
  if (w.id === 'vc-abandonment-trend') {
    opts.scales.y.title = { display: true, text: 'Abandon %', font: { family: 'Inter', size: 11 } };
    opts.scales.y1 = {
      type: 'linear',
      display: true,
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { font: { family: 'Inter', size: 11 }, color: '#71717a' },
      beginAtZero: true,
      title: { display: true, text: 'Calls', font: { family: 'Inter', size: 11 } }
    };
  }
  // In-graph bar filtering
  if (w.type === 'bar-chart') {
    opts.onClick = (event, elements) => {
      if (!elements.length) return;
      const index = elements[0].index;
      const bf = state.barFilter;
      if (bf.widgetId && bf.widgetId !== w.id) clearBarFilter();
      if (bf.selectedIndices.has(index)) bf.selectedIndices.delete(index);
      else bf.selectedIndices.add(index);
      if (bf.selectedIndices.size === 0) {
        clearBarFilter();
      } else {
        bf.widgetId = w.id;
        bf.sectionId = getSectionForWidget(w.id);
        applyBarFilter(w.id);
      }
    };
  }
  return opts;
}

function getMockBarData(id) {
  if (state.mockData.charts[id]) return cloneData(state.mockData.charts[id]);
  const labels7 = days7();
  const hours = hours24();
  const channels = ['Email', 'WhatsApp', 'Live chat', 'Phone', 'Instagram', 'Facebook'];
  const intents = ['Pricing', 'Shipping', 'Returns', 'Account', 'Product info', 'Billing', 'Feature request'];
  const handoffReasons = ['Missing knowledge', 'Customer requested', 'Excess wait time', 'Excess open time', 'Safety guardrail'];

  let data;
  switch (id) {
    case 'ov-tickets-by-hour':
      data = {
        labels: hours,
        datasets: [
          { label: 'Today', data: hours.map(() => rand(2, 75)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 },
          { label: 'Average', data: hours.map(() => rand(5, 40)), backgroundColor: CHART_COLORS.gray, borderRadius: 6 }
        ]
      };
      break;
    case 'un-leads-created': {
      const sCh = ['WhatsApp', 'Voice', 'Email', 'Live chat', 'Telegram', 'TikTok'];
      const sCols = [CHART_COLORS.teal, CHART_COLORS.blue, CHART_COLORS.periwinkle, CHART_COLORS.yellow, CHART_COLORS.purple, CHART_COLORS.tealLight];
      data = {
        labels: labels7,
        datasets: sCh.map((ch, i) => ({ label: ch, data: labels7.map(() => rand(5, 60)), backgroundColor: sCols[i], borderRadius: 6 }))
      };
      break;
    }
    case 'un-deals-created': {
      const sCh = ['WhatsApp', 'Voice', 'Email', 'Live chat', 'Telegram', 'TikTok'];
      const sCols = [CHART_COLORS.teal, CHART_COLORS.blue, CHART_COLORS.periwinkle, CHART_COLORS.yellow, CHART_COLORS.purple, CHART_COLORS.tealLight];
      data = {
        labels: labels7,
        datasets: sCh.map((ch, i) => ({ label: ch, data: labels7.map(() => rand(1, 18)), backgroundColor: sCols[i], borderRadius: 6 }))
      };
      break;
    }
    case 'un-sales-funnel':
      data = {
        labels: ['New', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'],
        datasets: [{ label: 'Deals', data: [240, 160, 95, 58, 32], backgroundColor: paletteCycle(5), borderRadius: 6 }]
      };
      break;
    case 'un-entry-channels':
      data = {
        labels: channels,
        datasets: [
          { label: 'Tickets', data: channels.map(() => rand(200, 1200)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 },
          { label: 'Contacts', data: channels.map(() => rand(100, 800)), backgroundColor: CHART_COLORS.blue, borderRadius: 6 }
        ]
      };
      break;
    case 'un-intent-clusters':
      data = {
        labels: intents,
        datasets: [{ label: 'Tickets', data: intents.map(() => rand(100, 900)), backgroundColor: paletteCycle(intents.length), borderRadius: 6 }]
      };
      break;
    case 'un-escalations-intent':
      data = {
        labels: intents.slice(0, 5),
        datasets: [{ label: 'Escalations', data: [rand(50,200), rand(40,150), rand(30,120), rand(20,100), rand(10,80)], backgroundColor: paletteCycle(5), borderRadius: 6 }]
      };
      break;
    case 'im-surveys':
      data = {
        labels: labels7,
        datasets: [{ label: 'Surveys received', data: labels7.map(() => rand(2, 12)), backgroundColor: CHART_COLORS.periwinkle, borderRadius: 6 }]
      };
      break;
    case 'im-knowledge-gaps':
      data = {
        labels: intents.slice(0, 5),
        datasets: [{ label: 'Knowledge gaps', data: [rand(10,50), rand(8,40), rand(5,35), rand(3,25), rand(2,15)], backgroundColor: paletteCycle(5), borderRadius: 6 }]
      };
      break;
    case 'op-bottlenecks':
      data = {
        labels: ['New', 'Awaiting reply', 'In progress', 'On hold', 'Pending close'],
        datasets: [{ label: 'Tickets', data: [rand(200,800), rand(300,1000), rand(100,500), rand(50,300), rand(20,100)], backgroundColor: paletteCycle(5), borderRadius: 6 }]
      };
      break;
    case 'au-handoff-reasons':
      data = {
        labels: handoffReasons,
        datasets: [{ label: 'Count', data: handoffReasons.map(() => rand(30, 400)), backgroundColor: [CHART_COLORS.purple, CHART_COLORS.blue, CHART_COLORS.teal, CHART_COLORS.yellow, CHART_COLORS.periwinkle], borderRadius: 6 }]
      };
      break;
    case 'vc-inbound-outbound':
      data = {
        labels: labels7,
        datasets: [
          { label: 'Inbound connected', data: labels7.map(() => rand(80, 250)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 },
          { label: 'Inbound missed', data: labels7.map(() => rand(5, 40)), backgroundColor: CHART_COLORS.yellow, borderRadius: 6 },
          { label: 'Outbound connected', data: labels7.map(() => rand(40, 150)), backgroundColor: CHART_COLORS.blue, borderRadius: 6 },
          { label: 'Outbound failed', data: labels7.map(() => rand(3, 20)), backgroundColor: CHART_COLORS.periwinkle, borderRadius: 6 },
        ]
      };
      break;
    case 'vc-calls-by-hour': {
      const hrs = hours24();
      data = {
        labels: hrs,
        datasets: [
          { label: 'Today', data: hrs.map(() => rand(0, 60)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 },
          { label: '30-day avg', data: hrs.map(() => rand(5, 35)), backgroundColor: CHART_COLORS.gray, borderRadius: 6 },
        ]
      };
      break;
    }
    case 'vc-calls-by-team': {
      const teamLabels = ['Sales team', 'SMB Central', 'Mid-Market', 'Expansion', 'Retention', 'Core Services'];
      data = {
        labels: teamLabels,
        datasets: [
          { label: 'Inbound', data: teamLabels.map(() => rand(50, 300)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 },
          { label: 'Outbound', data: teamLabels.map(() => rand(20, 150)), backgroundColor: CHART_COLORS.blue, borderRadius: 6 },
        ]
      };
      break;
    }
    case 'vc-avg-wait-by-team': {
      const waitTeams = ['Sales team', 'SMB Central', 'Mid-Market', 'Expansion', 'Retention', 'Core Services'];
      data = {
        labels: waitTeams,
        datasets: [{ label: 'Avg wait (s)', data: waitTeams.map(() => rand(15, 180)), backgroundColor: paletteCycle(6), borderRadius: 6 }]
      };
      break;
    }
    case 'vc-duration-by-team': {
      const durTeams = ['Sales team', 'SMB Central', 'Mid-Market', 'Expansion', 'Retention', 'Core Services'];
      data = {
        labels: durTeams,
        datasets: [
          { label: 'Inbound avg (s)', data: durTeams.map(() => rand(60, 480)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 },
          { label: 'Outbound avg (s)', data: durTeams.map(() => rand(45, 360)), backgroundColor: CHART_COLORS.blue, borderRadius: 6 },
        ]
      };
      break;
    }
    case 'vc-duration-inbound-outbound':
      data = {
        labels: labels7,
        datasets: [
          { label: 'Inbound avg (s)', data: labels7.map(() => rand(120, 480)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 },
          { label: 'Outbound avg (s)', data: labels7.map(() => rand(90, 360)), backgroundColor: CHART_COLORS.blue, borderRadius: 6 },
        ]
      };
      break;
    case 'vc-agents-per-channel': {
      const vcChannels = ['Support EN', 'Support NL', 'Sales', 'Billing', 'Onboarding', 'Tier-2'];
      data = {
        labels: vcChannels,
        datasets: [{ label: 'Agents', data: vcChannels.map(() => rand(2, 15)), backgroundColor: paletteCycle(6), borderRadius: 6 }]
      };
      break;
    }
    default:
      data = {
        labels: labels7,
        datasets: [{ label: 'Count', data: labels7.map(() => rand(50, 500)), backgroundColor: CHART_COLORS.teal, borderRadius: 6 }]
      };
  }
  state.mockData.charts[id] = data;
  return cloneData(data);
}

function getMockLineData(id) {
  if (state.mockData.charts[id]) return cloneData(state.mockData.charts[id]);
  const labels = days7();
  let data;
  switch (id) {
    case 'un-tickets-created':
      data = {
        labels,
        datasets: [{
          label: 'Tickets created',
          data: [rand(800,1100), rand(300,500), rand(600,900), rand(800,1000), rand(400,600), rand(100,250), rand(150,300)],
          borderColor: CHART_COLORS.teal, backgroundColor: 'rgba(31,157,139,.10)', fill: true, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2
        }]
      };
      break;
    case 'un-intent-trends':
      data = {
        labels,
        datasets: [
          { label: 'Pricing', data: labels.map(() => rand(80,200)), borderColor: CHART_COLORS.purple, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
          { label: 'Shipping', data: labels.map(() => rand(60,180)), borderColor: CHART_COLORS.teal, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
          { label: 'Returns', data: labels.map(() => rand(40,150)), borderColor: CHART_COLORS.yellow, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
        ]
      };
      break;
    case 'op-created-closed':
      data = {
        labels,
        datasets: [
          { label: 'Created tickets', data: [rand(800,1100), rand(300,500), rand(600,900), rand(800,1000), rand(400,600), rand(100,250), rand(150,300)], borderColor: CHART_COLORS.teal, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
          { label: 'Closed tickets', data: [rand(700,1000), rand(250,450), rand(500,800), rand(700,950), rand(350,550), rand(80,200), rand(120,280)], borderColor: CHART_COLORS.periwinkle, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
        ]
      };
      break;
    case 'op-capacity-demand':
      data = {
        labels,
        datasets: [
          { label: 'Demand (tickets)', data: labels.map(() => rand(400,900)), borderColor: CHART_COLORS.yellow, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
          { label: 'Capacity (agents)', data: labels.map(() => rand(500,700)), borderColor: CHART_COLORS.teal, borderDash: [5,3], tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 },
        ]
      };
      break;
    case 'im-satisfaction-score':
      data = {
        labels,
        datasets: [
          { label: 'Score', data: [92, 80, 95, 88, 85, 78, 90], borderColor: CHART_COLORS.navy, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, yAxisID: 'y' },
          { label: 'Surveys', data: [5, 8, 3, 4, 2, 6, 10], borderColor: CHART_COLORS.periwinkle, type: 'bar', backgroundColor: 'rgba(178,189,223,.45)', yAxisID: 'y1' },
        ]
      };
      break;
    case 'vc-abandonment-trend':
      data = {
        labels,
        datasets: [
          { label: 'Abandonment rate %', data: labels.map(() => randF(3, 18)), borderColor: CHART_COLORS.yellow, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, yAxisID: 'y' },
          { label: 'Total calls', data: labels.map(() => rand(150, 350)), borderColor: CHART_COLORS.periwinkle, type: 'bar', backgroundColor: 'rgba(183,194,230,.4)', yAxisID: 'y1' },
        ]
      };
      break;
    default:
      data = {
        labels,
        datasets: [{ label: 'Value', data: labels.map(() => rand(100,800)), borderColor: CHART_COLORS.teal, tension: .3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }]
      };
  }
  state.mockData.charts[id] = data;
  return cloneData(data);
}

// ── TABLE ──────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#5b8af5', '#e8734a', '#4bb08a', '#a06cd5',
  '#e0a030', '#d95f7b', '#3eaecf', '#7b9e5a'
];
function agentAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function agentAvatar(name) {
  const letter = name.charAt(0).toUpperCase();
  const color  = agentAvatarColor(name);
  return `<span class="agent-avatar" style="background:${color}">${letter}</span>`;
}

function renderTable(container, w) {
  if (w.id === 'op-workload-agent') {
    // Determine which agents to show — filtered to selected team's members if applicable
    const teamData = state.teamFilter && state.teamFilter !== 'All teams'
      ? getPrototypeTeamByName(state.teamFilter)
      : null;
    const allAgents = ['Victor Montala', 'Greg Aquino', 'Isabella Escobar', 'Federico Lai', 'Donovan van der Weerd', 'Deborah Pia', 'Rowan Milwid', 'Dmytro Hachok'];
    const agents = teamData && Array.isArray(teamData.members) && teamData.members.length
      ? teamData.members
      : allAgents;

    // Cache keyed by widget id + team so switching teams generates fresh mock data
    const cacheKey = w.id + '::' + (state.teamFilter || 'All teams');
    if (!state.mockData.tables[cacheKey]) {
      state.mockData.tables[cacheKey] = agents.map(a => ({
        agent: a,
        assigned: rand(20,200),
        firstResponse: `${rand(5,60)}m ${rand(0,59)}s`,
        totalResolution: `${rand(1,48)}h ${rand(0,59)}m`,
        closed: rand(10,180),
        messages: rand(50,500),
        comments: rand(5,80),
      }));
    }
    const rows = state.mockData.tables[cacheKey];
    let html = `<div style="overflow-x:auto"><table class="widget-table"><thead><tr>
      <th>Agent</th><th>Assigned tickets</th><th>First response time</th><th>Total resolution time</th><th>Closed tickets</th><th>Messages sent</th><th>Internal comments</th>
    </tr></thead><tbody>`;
    rows.forEach(r => {
      html += `<tr>
        <td><div class="agent-cell">${agentAvatar(r.agent)}<span style="font-weight:500">${r.agent}</span></div></td>
        <td>${r.assigned}</td>
        <td>${r.firstResponse}</td>
        <td>${r.totalResolution}</td>
        <td>${r.closed}</td>
        <td>${r.messages}</td>
        <td>${r.comments}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } else if (w.id === 'un-vc-channel-performance') {
    const vcChannels = ['Support EN', 'Support NL', 'Sales', 'Billing', 'Onboarding', 'Tier-2'];
    const cacheKey = w.id + '::' + (state.teamFilter || 'All teams');
    if (!state.mockData.tables[cacheKey]) {
      state.mockData.tables[cacheKey] = vcChannels.map(ch => ({
        channel: ch,
        totalCalls: rand(80, 500),
        missedCalls: rand(3, 40),
        avgWait: `${rand(10, 120)}s`,
        avgDuration: `${rand(1, 8)}m ${rand(0, 59)}s`,
        answerRate: `${rand(75, 99)}%`,
      }));
    }
    const rows = state.mockData.tables[cacheKey];
    let html = `<div style="overflow-x:auto"><table class="widget-table"><thead><tr>
      <th>Channel</th><th>Total calls</th><th>Missed calls</th><th>Avg wait</th><th>Avg duration</th><th>Answer rate</th>
    </tr></thead><tbody>`;
    rows.forEach(r => {
      html += `<tr>
        <td style="font-weight:500">${r.channel}</td>
        <td>${r.totalCalls}</td>
        <td>${r.missedCalls}</td>
        <td>${r.avgWait}</td>
        <td>${r.avgDuration}</td>
        <td>${r.answerRate}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } else if (w.id === 'op-channel-perf') {
    const channels = filterConfigs['filter-channel'].groups.filter(g => g.children).flatMap(g => g.children);
    const cacheKey = w.id + '::cache';
    if (!state.mockData.tables[cacheKey]) {
      state.mockData.tables[cacheKey] = channels.map(ch => ({
        channel: ch,
        resolutionTime: `${rand(1,24)}h ${rand(0,59)}m`,
        firstResponse: `${rand(1,60)}m ${rand(0,59)}s`,
        slaCompliance: rand(70, 99) + '%',
        closedTickets: rand(50, 800),
        openTickets: rand(20, 300),
      }));
    }
    const rows = state.mockData.tables[cacheKey];
    let html = `<div style="overflow-x:auto"><table class="widget-table"><thead><tr>
      <th>Channel</th>
      <th>Resolution time</th>
      <th>First response time</th>
      <th>SLA compliance</th>
      <th>Closed tickets</th>
      <th>Open tickets</th>
    </tr></thead><tbody>`;
    rows.forEach(r => {
      const isSelected = state.channelFilter.has(r.channel);
      const slaNum = parseInt(r.slaCompliance);
      const slaCls = slaNum >= 90 ? 'sla-good' : slaNum >= 80 ? 'sla-warn' : 'sla-bad';
      html += `<tr class="channel-row${isSelected ? ' channel-row-selected' : ''}" data-channel="${r.channel}">
        <td><span class="channel-pill">${getChannelIconHTML(r.channel)}<span>${r.channel}</span></span></td>
        <td>${r.resolutionTime}</td>
        <td>${r.firstResponse}</td>
        <td><span class="sla-value ${slaCls}">${r.slaCompliance}</span></td>
        <td>${r.closedTickets.toLocaleString()}</td>
        <td>${r.openTickets.toLocaleString()}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Wire row click → channel filter (toggle: click selected row to deselect)
    container.querySelectorAll('.channel-row').forEach(row => {
      row.addEventListener('click', () => {
        const ch = row.dataset.channel;
        if (state.channelFilter.has(ch)) state.channelFilter.delete(ch);
        else state.channelFilter.add(ch);
        updateChannelChipLabel();
        [...state.loadedSections].forEach(s => remountSection(s));
      });
    });
  } else if (w.id === 'op-sales-performance') {
    const salesAgents = ['Ava Laurent', 'Noah Müller', 'Mila Santos', 'Youssef El Idrissi', 'Sofia Ivanova', 'Liam O\'Brien'];
    const cacheKey = w.id + '::cache';
    if (!state.mockData.tables[cacheKey]) {
      state.mockData.tables[cacheKey] = salesAgents.map(a => ({
        agent: a,
        leads: rand(40, 180),
        deals: rand(12, 70),
        pipeline: `€${(rand(8, 60) * 1000).toLocaleString()}`,
        revenue: `€${(rand(3, 35) * 1000).toLocaleString()}`,
        winRate: `${rand(20, 65)}%`,
      }));
    }
    const rows = state.mockData.tables[cacheKey];
    let html = `<div style="overflow-x:auto"><table class="widget-table"><thead><tr>
      <th>Agent</th><th>Leads</th><th>Deals created</th><th>Pipeline value</th><th>Revenue</th><th>Win rate</th>
    </tr></thead><tbody>`;
    rows.forEach(r => {
      html += `<tr>
        <td><div class="agent-cell">${agentAvatar(r.agent)}<span style="font-weight:500">${r.agent}</span></div></td>
        <td>${r.leads}</td>
        <td>${r.deals}</td>
        <td>${r.pipeline}</td>
        <td>${r.revenue}</td>
        <td>${r.winRate}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } else if (w.id === 'op-channel-stage-matrix') {
    const salesCh = ['WhatsApp', 'Voice', 'Email', 'Live chat', 'Telegram', 'TikTok'];
    const stages  = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
    const cacheKey = w.id + '::cache';
    if (!state.mockData.tables[cacheKey]) {
      state.mockData.tables[cacheKey] = salesCh.map(ch => {
        const counts = stages.map((s, i) => rand(Math.max(1, 80 - i * 12), Math.max(5, 220 - i * 35)));
        return { channel: ch, counts, total: counts.reduce((a, b) => a + b, 0) };
      });
    }
    const rows = state.mockData.tables[cacheKey];
    let html = `<div style="overflow-x:auto"><table class="widget-table"><thead><tr>
      <th>Channel</th>${stages.map(s => `<th>${s}</th>`).join('')}<th>Total</th>
    </tr></thead><tbody>`;
    rows.forEach(r => {
      html += `<tr>
        <td style="font-weight:500">${r.channel}</td>
        ${r.counts.map(c => `<td>${c}</td>`).join('')}
        <td><strong>${r.total}</strong></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }
}

// ── AGENT ONLINE STATUS ─────────────────────────────────────────
function renderAgentOnlineStatus(container, w) {
  const agents = [
    { name: 'Victor Montala',        status: 'On a call' },
    { name: 'Greg Aquino',           status: 'Online'    },
    { name: 'Isabella Escobar',      status: 'Away'      },
    { name: 'Federico Lai',          status: 'Online'    },
    { name: 'Donovan van der Weerd', status: 'Offline'   },
    { name: 'Deborah Pia',           status: 'On a call' },
  ];
  const statusClass = {
    'Online':    'status-online',
    'On a call': 'status-oncall',
    'Away':      'status-away',
    'Offline':   'status-offline',
  };
  container.innerHTML = agents.map(a => `
    <div class="list-item">
      <div class="agent-cell">
        ${agentAvatar(a.name)}
        <span style="font-weight:500;color:var(--gray-800)">${a.name}</span>
      </div>
      <span class="agent-status-badge ${statusClass[a.status] || ''}">${a.status}</span>
    </div>`).join('');
}

// ── LIST ───────────────────────────────────────────────────────
function renderList(container, w) {
  const items = getMockListItems(w.id);
  let html = '';
  items.forEach(item => {
    html += `<div class="list-item">
      <span class="list-item-label">${item.label}</span>
      <span>
        <span class="list-item-value">${item.value}</span>
        <span class="list-item-trend ${item.trend >= 0 ? 'kpi-trend up' : 'kpi-trend down'}">${item.trend >= 0 ? '\u2191' : '\u2193'} ${Math.abs(item.trend)}%</span>
      </span>
    </div>`;
  });

  // Expandable detail
  html += `<button class="expandable-toggle" onclick="this.nextElementSibling.classList.toggle('open'); this.textContent = this.nextElementSibling.classList.contains('open') ? '\u25B2 Show less' : '\u25BC Show more'">
    \u25BC Show more
  </button>
  <div class="expandable-content">
    <div class="list-item"><span class="list-item-label">Additional detail 1</span><span class="list-item-value">${rand(10,100)}</span></div>
    <div class="list-item"><span class="list-item-label">Additional detail 2</span><span class="list-item-value">${rand(10,100)}</span></div>
  </div>`;

  container.innerHTML = html;
}

function getMockListItems(id) {
  if (state.mockData.lists[id]) return state.mockData.lists[id];
  let items;
  switch (id) {
    case 'ov-intent-trends':
      items = [
        { label: 'Pricing inquiry', value: '1,284', trend: 23 },
        { label: 'Shipping status', value: '987', trend: -8 },
        { label: 'Feature request', value: '654', trend: 45 },
        { label: 'Account access', value: '432', trend: -12 },
      ];
      break;
    case 'ov-exceptions':
      items = [
        { label: 'Unusual spike in WhatsApp volume', value: '+180%', trend: 180 },
        { label: 'SLA breach risk: 23 tickets near deadline', value: '23', trend: -5 },
        { label: 'AI confidence below threshold on 12 tickets', value: '12', trend: 12 },
      ];
      break;
    case 'un-emerging-intents':
      items = [
        { label: 'New: API integration help', value: '89', trend: 340 },
        { label: 'New: Mobile app issues', value: '67', trend: 220 },
        { label: 'Growing: Bulk pricing', value: '134', trend: 85 },
      ];
      break;
    case 'au-conflicts':
      items = [
        { label: 'Journey "Onboarding" vs AI agent "Sales Triage"', value: '14 conflicts', trend: -3 },
        { label: 'Journey "Support Routing" vs AI agent "1st Level"', value: '8 conflicts', trend: 5 },
      ];
      break;
    case 'au-safety':
      items = [
        { label: 'PII detection triggered', value: '7 stops', trend: -2 },
        { label: 'Confidence too low', value: '23 stops', trend: 8 },
        { label: 'Harmful content filter', value: '2 stops', trend: -1 },
      ];
      break;
    case 'vc-agent-online-status':
      items = [
        { label: 'Victor Montala', value: 'On a call', trend: 0 },
        { label: 'Greg Aquino', value: 'Online', trend: 0 },
        { label: 'Isabella Escobar', value: 'Away', trend: 0 },
        { label: 'Federico Lai', value: 'Online', trend: 0 },
        { label: 'Donovan van der Weerd', value: 'Offline', trend: 0 },
        { label: 'Deborah Pia', value: 'On a call', trend: 0 },
      ];
      break;
    default:
      items = [
        { label: 'Item A', value: rand(100,999).toString(), trend: rand(-20,20) },
        { label: 'Item B', value: rand(100,999).toString(), trend: rand(-20,20) },
        { label: 'Item C', value: rand(100,999).toString(), trend: rand(-20,20) },
      ];
      break;
  }
  state.mockData.lists[id] = items;
  return items;
}

// ── LIST WITH ACTIONS (approve/reject) ─────────────────────────
function renderListActions(container, w) {
  const suggestions = [
    { title: 'Add article: "How to connect API keys"', source: 'AI analysis of 42 fallback tickets' },
    { title: 'Update article: "Pricing plans overview"', source: 'Customer feedback + escalation data' },
    { title: 'Add article: "Mobile app troubleshooting"', source: 'Emerging intent detection' },
  ];
  let html = '';
  suggestions.forEach((s, i) => {
    html += `<div class="list-item" id="suggestion-${i}" style="flex-wrap:wrap;gap:8px;">
      <div style="flex:1;min-width:200px;">
        <div style="font-weight:500;color:var(--gray-800)">${s.title}</div>
        <div style="font-size:11px;color:var(--gray-400);margin-top:2px">${s.source}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-accent" onclick="this.closest('.list-item').style.opacity='0.4'; this.closest('.list-item').querySelector('.badge-result')?.remove(); this.parentElement.innerHTML='<span class=\\'badge badge-green\\'>Approved</span>'">Approve</button>
        <button class="btn btn-sm btn-danger-outline" onclick="this.closest('.list-item').style.opacity='0.4'; this.parentElement.innerHTML='<span class=\\'badge badge-red\\'>Rejected</span>'">Reject</button>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

// ── PROGRESS ───────────────────────────────────────────────────
function renderProgress(container, w) {
  let pct, label;
  if (w.id === 'op-sla-compliance') {
    pct = state.role === 'agent' ? 91 : 87;
    label = w.scopeLabel ? w.scopeLabel[state.role] : `${pct}% of tickets within SLA`;
  }
  else if (w.id === 'au-journeys-success') { pct = 72; label = '72% of journeys completed successfully'; }
  else { pct = rand(60, 95); label = `${pct}%`; }

  const color = pct >= 80 ? 'green' : pct >= 60 ? 'orange' : 'red';
  container.innerHTML = `
    <div class="kpi-value">${pct}%</div>
    <div class="kpi-sub">${label}</div>
    <div class="progress-bar"><div class="progress-fill ${color}" style="width:${pct}%"></div></div>
  `;
}

// ── OPPORTUNITIES BACKLOG ──────────────────────────────────────
function renderOpportunities(container, w) {
  const opps = [
    { id: 'opp1', source: 'Add knowledge article for API integration', impact: 'high', owner: 'AI Analysis', status: 'new' },
    { id: 'opp2', source: 'Improve routing for billing intents', impact: 'medium', owner: 'AI Analysis', status: 'new' },
    { id: 'opp3', source: 'Enable auto-close for resolved shipping queries', impact: 'medium', owner: 'AI Analysis', status: 'approved' },
    { id: 'opp4', source: 'Merge duplicate FAQ articles on pricing', impact: 'low', owner: 'Content Team', status: 'new' },
    { id: 'opp5', source: 'Add WhatsApp quick-reply templates', impact: 'high', owner: 'AI Analysis', status: 'new' },
    { id: 'opp6', source: 'Create escalation playbook for VIP accounts', impact: 'high', owner: 'Support Lead', status: 'new' },
    { id: 'opp7', source: 'Automate tagging for refund-related tickets', impact: 'medium', owner: 'AI Analysis', status: 'new' },
    { id: 'opp8', source: 'Add canned responses for top 10 intents', impact: 'medium', owner: 'Content Team', status: 'approved' },
    { id: 'opp9', source: 'Reduce handoff rate for onboarding flow', impact: 'high', owner: 'AI Analysis', status: 'new' },
    { id: 'opp10', source: 'Flag tickets with sentiment < 30% for priority review', impact: 'medium', owner: 'AI Analysis', status: 'new' },
    { id: 'opp11', source: 'Consolidate duplicate intents: "pricing" vs "cost inquiry"', impact: 'low', owner: 'Content Team', status: 'new' },
    { id: 'opp12', source: 'Train AI agent on new return policy (updated Jan 2026)', impact: 'high', owner: 'AI Analysis', status: 'new' },
    { id: 'opp13', source: 'Add proactive message for delayed shipment notifications', impact: 'medium', owner: 'Automation Team', status: 'new' },
    { id: 'opp14', source: 'Review low-confidence AI responses from last 7 days', impact: 'low', owner: 'AI Analysis', status: 'new' },
    { id: 'opp15', source: 'Set up SLA breach alerts for enterprise tier accounts', impact: 'high', owner: 'Support Lead', status: 'new' },
  ];

  let html = `<div style="margin-bottom:12px;font-size:12px;color:var(--gray-500);display:flex;gap:24px;">
    <span><strong>Source</strong></span>
    <span style="margin-left:auto;display:flex;gap:24px;">
      <span><strong>Impact</strong></span>
      <span><strong>Owner</strong></span>
      <span><strong>Status</strong></span>
      <span style="width:130px"><strong>Actions</strong></span>
    </span>
  </div>`;

  opps.forEach(opp => {
    const oppState = state.opportunityStates[opp.id];
    const dismissed = oppState === 'dismissed';
    const confirmed = oppState === 'confirmed';
    html += `<div class="opp-item ${dismissed ? 'dismissed' : ''} ${confirmed ? 'confirmed' : ''}" data-opp-id="${opp.id}">
      <span class="opp-source">${opp.source}</span>
      <span class="opp-impact ${opp.impact}">${opp.impact}</span>
      <span class="opp-owner">${opp.owner}</span>
      <span class="opp-status-badge">${confirmed ? 'Implemented' : opp.status}</span>
      <span class="opp-actions">
        ${dismissed || confirmed ? '' : `
          <button class="btn btn-sm btn-secondary" onclick="dismissOpportunity('${opp.id}')">Dismiss</button>
          <button class="btn btn-sm btn-primary" onclick="actionOpportunity('${opp.id}', '${opp.source.replace(/'/g, "\\'")}')">Action</button>
        `}
      </span>
    </div>`;
  });

  container.innerHTML = html;
}

// Global opportunity handlers
window.dismissOpportunity = function(id) {
  state.opportunityStates[id] = 'dismissed';
  const el = document.querySelector(`[data-opp-id="${id}"]`);
  if (el) el.classList.add('dismissed');
};

window.actionOpportunity = function(id, source) {
  const overlay = document.getElementById('opportunity-modal-overlay');
  const body = document.getElementById('opp-modal-body');
  const confirmBtn = document.getElementById('opp-modal-confirm');
  const cancelBtn = document.getElementById('opp-modal-cancel');
  const closeBtn = document.getElementById('opp-modal-close');

  body.innerHTML = `
    <div class="ai-chat-label">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M5 7h4M7 5v4" stroke="currentColor" stroke-width="1.2"/></svg>
      AI Recommendation
    </div>
    <div class="ai-chat-bubble">
      Based on analysis of <strong>42 recent tickets</strong> related to this topic, I recommend adding a new knowledge article:<br><br>
      <strong>"${source}"</strong><br><br>
      This would address approximately <strong>78%</strong> of the fallback cases observed in the last 7 days and could reduce escalation rate by an estimated <strong>12%</strong>.
    </div>
    <p style="font-size:12px;color:var(--gray-500);">Confirming will create a draft knowledge article and route it for review.</p>
  `;

  overlay.style.display = 'flex';

  const cleanup = () => {
    overlay.style.display = 'none';
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    closeBtn.replaceWith(closeBtn.cloneNode(true));
  };

  document.getElementById('opp-modal-confirm').addEventListener('click', () => {
    state.opportunityStates[id] = 'confirmed';
    body.innerHTML = `<div class="success-state">
      <div class="check-icon">\u2713</div>
      <p>Knowledge article draft created successfully!</p>
      <p style="font-size:12px;color:var(--gray-400);margin-top:8px">Routed to Content Team for review.</p>
    </div>`;
    document.getElementById('opp-modal-confirm').style.display = 'none';
    document.getElementById('opp-modal-cancel').textContent = 'Close';
    // Update the row
    const el = document.querySelector(`[data-opp-id="${id}"]`);
    if (el) {
      el.classList.add('confirmed');
      const badge = el.querySelector('.opp-status-badge');
      if (badge) badge.textContent = 'Implemented';
      const actions = el.querySelector('.opp-actions');
      if (actions) actions.innerHTML = '';
    }
  });

  document.getElementById('opp-modal-cancel').addEventListener('click', cleanup);
  document.getElementById('opp-modal-close').addEventListener('click', cleanup);
};

// ── SECTION MOUNTING ───────────────────────────────────────────
function mountSection(sectionId) {
  if (state.loadedSections.has(sectionId)) return;
  if (state.pendingLoads[sectionId]) {
    clearTimeout(state.pendingLoads[sectionId]);
    delete state.pendingLoads[sectionId];
  }
  state.loadedSections.add(sectionId);

  const contentEl = document.querySelector(`.section-content[data-section="${sectionId}"]`);
  if (!contentEl) return;

  contentEl.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'widget-grid';

  const widgets = getVisibleWidgets(sectionId);
  const baseLayout = ensureLayout(sectionId, widgets);
  const { layout, emptyTiles } = normalizeLayout(sectionId, baseLayout);

  widgets.forEach(w => {
    const placement = layout.placements[w.id];
    const card = renderWidget(w, sectionId, placement, layout.rows, layout);
    if (card) grid.appendChild(card);
  });

  // Count widgets that could be added via the drawer (from all categories, not on this tab)
  const tabWidgetSet = state.tabWidgets[sectionId] || new Set();
  let availableNotOnTab = 0;
  Object.keys(WIDGETS).forEach(cat => {
    WIDGETS[cat].forEach(w => {
      if (tabWidgetSet.has(w.id)) return; // already on this tab
      if (getStateOverride(w) === 'hide') return; // not available in this role/lens
      if (w.hideWhenTeamFiltered && state.teamFilter && state.teamFilter !== 'All teams') return;
      if (w.hideWhenChannelFiltered && state.channelFilter.size > 0) return;
      if (w.hideWhenNonVoiceChannel && isNonVoiceChannelActive()) return;
      availableNotOnTab++;
    });
  });
  const hiddenCount = availableNotOnTab;
  const allWidgets = getWidgetsForTab(sectionId);
  const isEmptyPage = tabWidgetSet.size === 0;
  const emptyPageHtml = `<div>Add widgets to build this page</div>
    <div class="add-cta" onclick="openWidgetDrawer('${sectionId}')">+ Manage widgets</div>`;

  if (emptyTiles.length > 0) {
    emptyTiles.forEach(tile => {
      const empty = document.createElement('div');
      empty.className = 'empty-tile';
      if (isEmptyPage) {
        empty.innerHTML = emptyPageHtml;
      } else if (hiddenCount > 0) {
        empty.innerHTML = `<div>${hiddenCount} more widget${hiddenCount > 1 ? 's' : ''} available</div>
          <div class="add-cta" onclick="openWidgetDrawer('${sectionId}')">+ Add widgets</div>`;
      } else {
        empty.innerHTML = `<div>All widgets are shown</div>`;
      }
      empty.style.gridColumn = `${tile.col + 1} / span ${tile.span}`;
      empty.style.gridRow = tile.row + 1;
      empty.dataset.row = tile.row;
      grid.appendChild(empty);
    });
  } else if (hiddenCount >= 0 || isEmptyPage) {
    const empty = document.createElement('div');
    empty.className = 'empty-tile';
    if (isEmptyPage) {
      empty.innerHTML = emptyPageHtml;
    } else if (hiddenCount > 0) {
      empty.innerHTML = `<div>${hiddenCount} more widget${hiddenCount > 1 ? 's' : ''} available</div>
        <div class="add-cta" onclick="openWidgetDrawer('${sectionId}')">+ Add widgets</div>`;
    } else {
      empty.innerHTML = `<div>All widgets are shown</div>`;
    }
    empty.style.gridColumn = `1 / span 12`;
    empty.style.gridRow = layout.rows.length + 1;
    empty.dataset.row = layout.rows.length;
    grid.appendChild(empty);
  }

  contentEl.appendChild(grid);
  contentEl.classList.add('loaded');
}

function remountSection(sectionId) {
  // Clear any active bar filter for this section before destroying charts
  if (state.barFilter && state.barFilter.sectionId === sectionId) clearBarFilter();
  state.loadedSections.delete(sectionId);
  // Destroy charts for this section
  const widgets = getWidgetsForTab(sectionId);
  widgets.forEach(w => {
    if (state.charts[w.id]) {
      state.charts[w.id].destroy();
      delete state.charts[w.id];
    }
  });
  mountSection(sectionId);
}

// ── BAR FILTER ─────────────────────────────────────────────────
function applyBarFilter(widgetId) {
  const chart = state.charts[widgetId];
  if (!chart) return;
  const bf = state.barFilter;
  const totalBars = chart.data.labels.length;

  // Dim non-selected bars across all datasets
  chart.data.datasets.forEach(dataset => {
    const base = Array.isArray(dataset.backgroundColor)
      ? dataset.backgroundColor.slice()
      : Array(totalBars).fill(dataset.backgroundColor);
    dataset.backgroundColor = base.map((color, i) =>
      bf.selectedIndices.has(i) ? color : hexToRgba(color, 0.2)
    );
  });
  chart.update('none');

  // Badge on widget card
  const card = document.querySelector(`.widget-card[data-widget-id="${widgetId}"]`);
  if (card) {
    let badge = card.querySelector('.bar-filter-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'bar-filter-badge';
      const header = card.querySelector('.widget-header');
      if (header) header.after(badge);
    }
    badge.innerHTML = `Showing ${bf.selectedIndices.size} of ${totalBars} <button class="bar-filter-clear-btn" onclick="clearBarFilter()">×</button>`;
  }

  // Show "Filtered" badge on KPI cards in this section
  showKPIFilteredBadge(bf.sectionId);
}

function clearBarFilter() {
  const bf = state.barFilter;
  if (!bf.widgetId) return;

  // Restore original bar colours from cached data
  const chart = state.charts[bf.widgetId];
  if (chart) {
    const cached = state.mockData.charts[bf.widgetId];
    if (cached) {
      cached.datasets.forEach((ds, i) => {
        if (chart.data.datasets[i]) chart.data.datasets[i].backgroundColor = ds.backgroundColor;
      });
    }
    chart.update('none');
  }

  // Remove chart badge
  const badge = document.querySelector(`.widget-card[data-widget-id="${bf.widgetId}"] .bar-filter-badge`);
  if (badge) badge.remove();

  // Remove KPI badges
  hideKPIFilteredBadge(bf.sectionId);

  bf.widgetId = null;
  bf.sectionId = null;
  bf.selectedIndices.clear();
}

function showKPIFilteredBadge(sectionId) {
  if (!sectionId) return;
  document.querySelectorAll(`.section-content[data-section="${sectionId}"] .widget-card`).forEach(card => {
    if (card.querySelector('.kpi-value') && !card.querySelector('.kpi-filter-badge')) {
      const badge = document.createElement('span');
      badge.className = 'kpi-filter-badge';
      badge.textContent = 'Filtered';
      const val = card.querySelector('.kpi-value');
      if (val) val.after(badge);
    }
  });
}

function hideKPIFilteredBadge(sectionId) {
  if (!sectionId) return;
  document.querySelectorAll(`.section-content[data-section="${sectionId}"] .kpi-filter-badge`)
    .forEach(el => el.remove());
}

window.clearBarFilter = clearBarFilter;

// ── HIDE / ADD WIDGETS ─────────────────────────────────────────
function hideWidget(id, section) {
  window.sendEvent('Widget hidden — ' + id);
  // Remove widget from the current tab's set
  if (state.tabWidgets[section]) {
    state.tabWidgets[section].delete(id);
  }
  delete state.sectionOrder[section];
  delete state.sectionLayout[section];
  remountSection(section);
  DashboardConfig.notifyChanged();
}

let _drawerSection = null;

let _drawerCategory = 'all';
let _drawerSearchQuery = '';
let _drawerSort = 'default'; // 'default' | 'name-asc' | 'name-desc' | 'status'

const WIDGET_TYPE_ICONS = {
  'kpi':            `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="5" width="14" height="8" rx="1.5"/><line x1="5" y1="5" x2="5" y2="3"/><line x1="8" y1="5" x2="8" y2="2"/><line x1="11" y1="5" x2="11" y2="3"/></svg>`,
  'kpi-group':      `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="4" height="7" rx="1"/><rect x="6" y="4" width="4" height="9" rx="1"/><rect x="11" y="2" width="4" height="11" rx="1"/></svg>`,
  'bar-chart':      `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="4" height="7" rx="1"/><rect x="6" y="3" width="4" height="10" rx="1"/><rect x="11" y="8" width="4" height="5" rx="1"/></svg>`,
  'line-chart':     `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,12 5,7 9,9 13,4 15,5"/></svg>`,
  'doughnut-chart': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/></svg>`,
  'list':           `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="4" x2="14" y2="4"/><line x1="4" y1="8" x2="14" y2="8"/><line x1="4" y1="12" x2="14" y2="12"/><circle cx="1.5" cy="4" r=".8" fill="currentColor" stroke="none"/><circle cx="1.5" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="1.5" cy="12" r=".8" fill="currentColor" stroke="none"/></svg>`,
  'list-actions':   `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="4" x2="11" y2="4"/><line x1="4" y1="8" x2="11" y2="8"/><line x1="4" y1="12" x2="11" y2="12"/><circle cx="1.5" cy="4" r=".8" fill="currentColor" stroke="none"/><circle cx="1.5" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="1.5" cy="12" r=".8" fill="currentColor" stroke="none"/><polyline points="12,6 14,8 12,10" stroke-linejoin="round"/></svg>`,
  'table':          `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="1" y="1" width="14" height="14" rx="1.5"/><line x1="1" y1="5" x2="15" y2="5"/><line x1="6" y1="5" x2="6" y2="15"/></svg>`,
  'progress':       `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="1" y="6" width="14" height="4" rx="2"/><rect x="1" y="6" width="9" height="4" rx="2" fill="currentColor" stroke="none" opacity=".25"/></svg>`,
  'opportunities':  `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="6" r="3.5"/><path d="M6 9.5 L5 14 L8 12.5 L11 14 L10 9.5"/></svg>`,
};
const WIDGET_TYPE_ICON_DEFAULT = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>`;

window.openWidgetDrawer = function(sectionId) {
  _drawerSection = sectionId;
  document.body.classList.add('drawer-open');
  if (window.setPanelState && document.body.dataset.panel !== 'bar') {
    window.setPanelState('bar');
  }

  // Determine pre-selected category
  const tab = state.tabs.find(t => t.id === sectionId);
  const CATEGORY_KEYS = Object.keys(WIDGETS);
  if (tab && tab.category && CATEGORY_KEYS.includes(tab.category)) {
    _drawerCategory = tab.category;
  } else {
    _drawerCategory = 'all';
  }

  _drawerSearchQuery = '';
  _drawerSort = 'default';
  updateDrawerCategoryLabel();
  updateDrawerSortLabel();
  renderDrawerWidgets();
};

const SORT_OPTIONS = [
  { value: 'default',   label: 'Default' },
  { value: 'name-asc',  label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'status',    label: 'Visible first' },
];
const DRAWER_SECTION_LABELS = {
  overview:   'Key Metrics',
  understand: 'Patterns & Insights',
  operate:    'Operations & Performance',
  improve:    'Quality & Improvement',
  automate:   'AI & Automation',
};
const CATEGORY_OPTIONS = [
  { value: 'all',        label: 'All' },
  { value: 'overview',   label: 'Key Metrics' },
  { value: 'understand', label: 'Patterns & Insights' },
  { value: 'operate',    label: 'Operations' },
  { value: 'improve',    label: 'Quality' },
  { value: 'automate',   label: 'AI & Automation' },
];

function updateDrawerCategoryLabel() {
  const el = document.getElementById('drawer-category-label');
  if (el) el.textContent = (CATEGORY_OPTIONS.find(o => o.value === _drawerCategory) || CATEGORY_OPTIONS[0]).label;
}
function updateDrawerSortLabel() {
  const el = document.getElementById('drawer-sort-label');
  if (el) el.textContent = (SORT_OPTIONS.find(o => o.value === _drawerSort) || SORT_OPTIONS[0]).label;
}

let _drawerDropdownOutsideHandler = null;

function closeDrawerDropdown() {
  const existing = document.getElementById('drawer-dropdown');
  if (existing) existing.remove();
  if (_drawerDropdownOutsideHandler) {
    document.removeEventListener('click', _drawerDropdownOutsideHandler);
    _drawerDropdownOutsideHandler = null;
  }
  document.querySelectorAll('.drawer-filter-chip').forEach(c => c.classList.remove('active'));
}

function openDrawerDropdown(chipId, type) {
  const chip = document.getElementById(chipId);
  if (!chip) return;

  // Toggle off if already open
  const existing = document.getElementById('drawer-dropdown');
  if (existing && existing.dataset.type === type) { closeDrawerDropdown(); return; }
  closeDrawerDropdown();

  chip.classList.add('active');

  const options = type === 'sort' ? SORT_OPTIONS : CATEGORY_OPTIONS;
  const currentValue = type === 'sort' ? _drawerSort : _drawerCategory;

  const dropdown = document.createElement('div');
  dropdown.className = 'drawer-dropdown';
  dropdown.id = 'drawer-dropdown';
  dropdown.dataset.type = type;

  dropdown.innerHTML = options.map(opt => `
    <div class="filter-option${opt.value === currentValue ? ' selected' : ''}" data-value="${opt.value}">
      <span class="filter-option-label">${opt.label}</span>
      <span class="filter-option-tick"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 5.5"/></svg></span>
    </div>
  `).join('');

  // Position below chip, inside the drawer
  const drawer = document.getElementById('widget-drawer');
  const chipRect = chip.getBoundingClientRect();
  const drawerRect = drawer.getBoundingClientRect();

  drawer.appendChild(dropdown);

  // Align dropdown: category (left chip) aligns left, sort (right chip) aligns right
  dropdown.style.top = (chipRect.bottom - drawerRect.top + 4) + 'px';
  if (type === 'category') {
    dropdown.style.left = (chipRect.left - drawerRect.left) + 'px';
  } else {
    dropdown.style.right = (drawerRect.right - chipRect.right) + 'px';
  }

  // Handle option clicks
  dropdown.querySelectorAll('.filter-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.dataset.value;
      if (type === 'sort') {
        _drawerSort = val;
        updateDrawerSortLabel();
      } else {
        _drawerCategory = val;
        updateDrawerCategoryLabel();
      }
      closeDrawerDropdown();
      renderDrawerWidgets();
    });
  });

  // Close on outside click (use tracked handler so closeDrawerDropdown can clean it up)
  setTimeout(() => {
    _drawerDropdownOutsideHandler = function(e) {
      if (!dropdown.contains(e.target) && !e.target.closest('.drawer-filter-chip')) {
        closeDrawerDropdown();
      }
    };
    document.addEventListener('click', _drawerDropdownOutsideHandler);
  }, 0);
}

function renderDrawerWidgets() {
  const body = document.getElementById('drawer-body');
  let html = `<div class="drawer-search"><input type="text" id="drawer-search-input" placeholder="Search widgets..." value="${_drawerSearchQuery.replace(/"/g, '&quot;')}" /></div>`;
  const query = _drawerSearchQuery.toLowerCase().trim();
  const activeTab = _drawerSection || state.activeSection;
  const tabWidgetSet = state.tabWidgets[activeTab] || new Set();

  // Collect widgets with their section info
  const collectWidgets = (secId) => {
    const widgets = WIDGETS[secId] || [];
    return widgets
      .filter(w => !query || w.title.toLowerCase().includes(query) || (w.tooltip && w.tooltip.toLowerCase().includes(query)))
      .map(w => ({ ...w, _secId: secId }));
  };

  let allWidgets = [];
  if (_drawerCategory === 'all') {
    Object.keys(WIDGETS).forEach(secId => {
      allWidgets = allWidgets.concat(collectWidgets(secId));
    });
  } else {
    allWidgets = collectWidgets(_drawerCategory);
  }

  // Apply sort
  if (_drawerSort === 'name-asc') {
    allWidgets.sort((a, b) => a.title.localeCompare(b.title));
  } else if (_drawerSort === 'name-desc') {
    allWidgets.sort((a, b) => b.title.localeCompare(a.title));
  } else if (_drawerSort === 'status') {
    allWidgets.sort((a, b) => {
      const aStateHidden = getStateOverride(a) === 'hide';
      const aFilterHidden = (a.hideWhenTeamFiltered && state.teamFilter && state.teamFilter !== 'All teams') ||
                             (a.hideWhenChannelFiltered && state.channelFilter.size > 0) ||
                             (a.hideWhenNonVoiceChannel && isNonVoiceChannelActive());
      const bStateHidden = getStateOverride(b) === 'hide';
      const bFilterHidden = (b.hideWhenTeamFiltered && state.teamFilter && state.teamFilter !== 'All teams') ||
                             (b.hideWhenChannelFiltered && state.channelFilter.size > 0) ||
                             (b.hideWhenNonVoiceChannel && isNonVoiceChannelActive());
      const aVis = tabWidgetSet.has(a.id) && !aStateHidden && !aFilterHidden;
      const bVis = tabWidgetSet.has(b.id) && !bStateHidden && !bFilterHidden;
      return (bVis ? 1 : 0) - (aVis ? 1 : 0);
    });
  }

  // Group by section for category headers (only in default sort + all category view)
  const showSectionHeaders = _drawerSort === 'default';
  let lastSecId = null;

  allWidgets.forEach(w => {
    const secId = w._secId;
    if (showSectionHeaders && secId !== lastSecId) {
      html += `<div style="margin:12px 0 6px;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;">${DRAWER_SECTION_LABELS[secId] || secId.charAt(0).toUpperCase() + secId.slice(1)}</div>`;
      lastSecId = secId;
    }
    // Visibility is now based on whether the widget is in the current tab's set
    const isOnTab = tabWidgetSet.has(w.id);
    const isStateHidden = getStateOverride(w) === 'hide';
    const isFilterHidden = (w.hideWhenTeamFiltered && state.teamFilter && state.teamFilter !== 'All teams') ||
                           (w.hideWhenChannelFiltered && state.channelFilter.size > 0) ||
                           (w.hideWhenNonVoiceChannel && isNonVoiceChannelActive());
    const canToggle = !isStateHidden && !isFilterHidden;
    const statusText = isFilterHidden ? 'Not available with current filter' :
                       isStateHidden  ? 'Not available in this view' :
                       isOnTab ? 'On this page' : 'Not on this page';
    const typeIcon = WIDGET_TYPE_ICONS[w.type] || WIDGET_TYPE_ICON_DEFAULT;
    html += `<div class="drawer-widget-item${canToggle ? ' drawer-widget-item--toggleable' : ''}" ${(isStateHidden || isFilterHidden) ? 'style="opacity:.4"' : ''} ${canToggle ? `onclick="this.querySelector('button').click()"` : ''}>
      <div class="drawer-widget-icon">${typeIcon}</div>
      <div class="drawer-widget-info">
        <div class="drawer-widget-name">${w.title}</div>
        <div class="drawer-widget-status">${statusText}</div>
      </div>
      ${canToggle ? `<button class="btn btn-sm ${isOnTab ? 'btn-secondary' : 'btn-primary'}" onclick="event.stopPropagation();toggleWidgetFromDrawer('${w.id}', '${secId}', ${isOnTab})">${isOnTab ? 'Hide' : 'Add'}</button>` : ''}
    </div>`;
  });

  if (!allWidgets.length) {
    html += '<div style="padding:24px 0;color:var(--gray-400);font-size:13px;">No widgets match your search.</div>';
  }
  body.innerHTML = html;

  // Re-attach search input listener (since it's inside the scrollable body)
  const searchInput = document.getElementById('drawer-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      _drawerSearchQuery = e.target.value;
      renderDrawerWidgets();
    });
    // Restore cursor position after re-render
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }
}

// Drawer chip click handlers
document.getElementById('drawer-sort-chip')?.addEventListener('click', () => {
  openDrawerDropdown('drawer-sort-chip', 'sort');
});
document.getElementById('drawer-category-chip')?.addEventListener('click', () => {
  openDrawerDropdown('drawer-category-chip', 'category');
});

window.toggleWidgetFromDrawer = function(id, section, currentlyVisible) {
  const activeTab = _drawerSection || state.activeSection;
  if (!state.tabWidgets[activeTab]) state.tabWidgets[activeTab] = new Set();

  if (currentlyVisible) {
    // Remove widget from this tab
    state.tabWidgets[activeTab].delete(id);
  } else {
    // Add widget to this tab
    state.tabWidgets[activeTab].add(id);
  }

  // Clear cached section order/layout so it rebuilds with the new widget set
  delete state.sectionOrder[activeTab];
  delete state.sectionLayout[activeTab];

  remountSection(activeTab);
  // Refresh drawer without resetting category/search
  renderDrawerWidgets();
  DashboardConfig.notifyChanged();
};

const ICON_PLUS  = `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_CLOSE = `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_WIDGETS = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="4.5" height="4.5" rx=".8"/><rect x="1" y="8.5" width="4.5" height="4.5" rx=".8"/><rect x="8.5" y="8.5" width="4.5" height="4.5" rx=".8"/><line x1="11" y1="1.2" x2="11" y2="4.8"/><line x1="9.2" y1="3" x2="12.8" y2="3"/></svg>`;

function setManageWidgetsBtnLabel(open) {
  const btn = document.getElementById('manage-widgets-btn');
  if (!btn) return;
  btn.innerHTML = (open ? ICON_CLOSE : ICON_WIDGETS) + '<span>' + (open ? 'Close widgets' : 'Manage widgets') + '</span>';
}

document.getElementById('drawer-close').addEventListener('click', () => {
  document.body.classList.remove('drawer-open');
  _drawerSection = null;
  _drawerSearchQuery = '';
  _drawerSort = 'default';
  closeDrawerDropdown();
  const searchInput = document.getElementById('drawer-search-input');
  if (searchInput) searchInput.value = '';
  setManageWidgetsBtnLabel(false);
});

// ── TOOLTIP ────────────────────────────────────────────────────
let tooltipEl = null;
function showTooltip(e, text) {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'custom-tooltip';
    document.body.appendChild(tooltipEl);
  }
  tooltipEl.textContent = text;
  tooltipEl.classList.add('visible');
  const rect = e.target.getBoundingClientRect();
  tooltipEl.style.top  = (rect.bottom + window.scrollY + 8) + 'px';
  tooltipEl.style.left = (rect.left + window.scrollX - 100) + 'px';
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove('visible');
}

// ── INTERSECTION OBSERVER (LAZY LOADING) ───────────────────────
const sentinelObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && entry.intersectionRatio >= 0.75) {
      const section = entry.target.dataset.section;
      // Only apply lazy-loading in anchors mode
      if (state.navMode !== 'anchors') {
        mountSection(section);
        return;
      }

      // If already loaded, do nothing
      if (state.loadedSections.has(section)) return;

      // If this section is explicitly requested (nav click), load immediately
      if (state.instantLoadSections.has(section)) {
        state.instantLoadSections.delete(section);
        mountSection(section);
        return;
      }

      // If a load is already pending, do nothing
      if (state.pendingLoads[section]) return;

      // Show loading state immediately
      const contentEl = document.querySelector(`.section-content[data-section="${section}"]`);
      if (contentEl) {
        contentEl.innerHTML = `
          <div class="section-loading">
            <div class="spinner"></div>
            Loading section…
          </div>`;
      }

      state.pendingLoads[section] = setTimeout(() => {
        mountSection(section);
      }, 800);
      return;
    }
  });
}, { rootMargin: '0px 0px -10% 0px', threshold: 0.75 });

function setupSentinels() {
  document.querySelectorAll('.section-sentinel').forEach(s => {
    sentinelObserver.observe(s);
  });
}

function teardownSentinels() {
  sentinelObserver.disconnect();
}

// ── SECTION SCROLL OBSERVER (for sub-nav highlight) ────────────
let sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const section = entry.target.dataset.section;
      setActiveSubNav(section);
    }
  });
}, { rootMargin: '-120px 0px -60% 0px', threshold: 0.1 });

function setupSectionObserver() {
  if (state.navMode === 'tabs') return;
  document.querySelectorAll('.analytics-section').forEach(s => {
    sectionObserver.observe(s);
  });
}

function teardownSectionObserver() {
  if (!sectionObserver) return;
  sectionObserver.disconnect();
}

// ── DYNAMIC TAB RENDERING ─────────────────────────────────────

function getWidgetsForTab(tabId) {
  const widgetIds = state.tabWidgets[tabId];
  if (!widgetIds || widgetIds.size === 0) return [];
  // Return widget definitions in a stable order: iterate all categories, keep only IDs in this tab's set
  const result = [];
  Object.keys(WIDGETS).forEach(cat => {
    WIDGETS[cat].forEach(w => {
      if (widgetIds.has(w.id)) result.push(w);
    });
  });
  return result;
}

function renderTabs() {
  const nav = document.getElementById('sub-nav-tabs');
  if (!nav) return;
  nav.innerHTML = '';

  state.tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'sub-nav-btn' + (tab.id === state.activeSection ? ' active' : '');
    btn.dataset.section = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      scrollToSection(tab.id, true);
      window.sendEvent(tab.label + ' tab — clicked');
      if (document.body.classList.contains('drawer-open')) {
        openWidgetDrawer(tab.id);
      }
    });
    nav.appendChild(btn);
  });

  // Edit-mode only: "+" add tab button
  const addBtn = document.createElement('button');
  addBtn.className = 'sub-nav-add-btn edit-only-ui';
  addBtn.title = 'Add new tab';
  addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>`;
  addBtn.addEventListener('click', () => createNewTab());
  nav.appendChild(addBtn);
  scheduleResponsiveFilterLayoutUpdate();
}

function renderSections() {
  const container = document.getElementById('analytics-sections');
  if (!container) return;

  // Destroy charts and clear loaded state since DOM is being recreated
  [...state.loadedSections].forEach(secId => {
    const widgets = getWidgetsForTab(secId);
    widgets.forEach(w => {
      if (state.charts[w.id]) {
        state.charts[w.id].destroy();
        delete state.charts[w.id];
      }
    });
  });
  state.loadedSections = new Set();

  container.innerHTML = '';

  state.tabs.forEach(tab => {
    const section = document.createElement('section');
    section.className = 'analytics-section';
    section.id = `section-${tab.id}`;
    section.dataset.section = tab.id;
    section.innerHTML = `
      <div class="section-header">
        <h2>${tab.label}</h2>
        <button class="section-edit-btn edit-only-ui" data-tab-id="${tab.id}" title="Rename or remove tab">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>
        </button>
      </div>
      <div class="section-sentinel" data-section="${tab.id}"></div>
      <div class="section-content" data-section="${tab.id}"></div>
    `;
    container.appendChild(section);
  });

  // Wire edit button click handlers
  container.querySelectorAll('.section-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => openTabEditMenu(e));
  });

  // Re-setup observers
  teardownSentinels();
  teardownSectionObserver();
  setupSentinels();
  setupSectionObserver();
}

// ── TAB CRUD ──────────────────────────────────────────────────

function createNewTab() {
  const id = 'custom-' + Date.now();
  const newTab = { id, label: 'New Tab', category: null, isDefault: false };
  state.tabs.push(newTab);
  state.tabWidgets[id] = new Set(); // custom tabs start with no widgets
  state.loadedSections.delete(id);
  renderTabs();
  renderSections();
  scrollToSection(id, true);
  // Open rename popover below the new tab button in the nav bar
  setTimeout(() => {
    const tabBtn = document.querySelector(`.sub-nav-btn[data-section="${id}"]`);
    if (tabBtn) openTabEditMenu({ target: tabBtn }, tabBtn);
  }, 50);
  window.sendEvent('New tab — created');
  DashboardConfig.notifyChanged();
}

function renameTab(tabId, newLabel) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;
  const trimmed = newLabel.trim();
  if (!trimmed) return; // revert to old name
  if (trimmed === tab.label) return;
  tab.label = trimmed;
  renderTabs();
  // Update the section header h2
  const h2 = document.querySelector(`#section-${tabId} .section-header h2`);
  if (h2) h2.textContent = tab.label;
  window.sendEvent('"' + tab.label + '" tab — renamed');
  DashboardConfig.notifyChanged();
}

let _pendingDeleteTabId = null;

function requestDeleteTab(tabId) {
  if (state.tabs.length <= 1) return;
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;
  _pendingDeleteTabId = tabId;
  document.getElementById('delete-tab-name').textContent = tab.label;
  document.getElementById('delete-tab-modal-overlay').style.display = '';
}

function confirmDeleteTab() {
  if (!_pendingDeleteTabId) return;
  const tabId = _pendingDeleteTabId;
  const deletedLabel = (state.tabs.find(t => t.id === tabId) || {}).label || 'Tab';
  _pendingDeleteTabId = null;

  // Clean up state
  const widgets = getWidgetsForTab(tabId);
  widgets.forEach(w => {
    if (state.charts[w.id]) {
      state.charts[w.id].destroy();
      delete state.charts[w.id];
    }
  });
  state.tabs = state.tabs.filter(t => t.id !== tabId);
  delete state.sectionLayout[tabId];
  delete state.sectionOrder[tabId];
  delete state.tabWidgets[tabId];
  state.loadedSections.delete(tabId);

  // Switch to first tab if active was deleted
  if (state.activeSection === tabId) {
    state.activeSection = state.tabs[0].id;
  }

  // Close drawer if it was for this tab
  if (_drawerSection === tabId) {
    document.body.classList.remove('drawer-open');
    _drawerSection = null;
    setManageWidgetsBtnLabel(false);
  }

  renderTabs();
  renderSections();
  scrollToSection(state.activeSection, true);
  document.getElementById('delete-tab-modal-overlay').style.display = 'none';
  window.sendEvent('"' + deletedLabel + '" tab — deleted');
  DashboardConfig.notifyChanged();
}

function openTabEditMenu(event, anchorEl) {
  closeTabEditMenu();
  const btn = event.target.closest('.section-edit-btn');
  const tabId = btn ? btn.dataset.tabId : (anchorEl?.dataset?.section || state.activeSection);
  const activeTab = state.tabs.find(t => t.id === tabId);
  if (!activeTab) return;

  const popover = document.createElement('div');
  popover.className = 'tab-edit-popover';
  popover.id = 'tab-edit-popover';

  const prevLabel = activeTab.label;
  popover.innerHTML = `
    <div class="tab-edit-field">
      <label>Tab name</label>
      <input type="text" id="tab-rename-input" value="${activeTab.label}" maxlength="30" />
    </div>
    <div class="tab-edit-actions">
      ${state.tabs.length > 1 ? `<button class="btn btn-danger" id="tab-delete-btn">Remove tab</button>` : ''}
      <button class="btn btn-primary" id="tab-save-btn">Save</button>
    </div>
  `;

  // Prevent clicks inside the popover from propagating to the edit button or document
  popover.addEventListener('click', (e) => e.stopPropagation());

  document.body.appendChild(popover);

  // Position below the anchor element (tab button) or the edit button
  const anchor = anchorEl || event.target.closest('.section-edit-btn') || event.target;
  const rect = anchor.getBoundingClientRect();
  popover.style.top = (rect.bottom + 8) + 'px';
  popover.style.left = rect.left + 'px';

  const input = document.getElementById('tab-rename-input');
  input.select();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      renameTab(activeTab.id, input.value);
      closeTabEditMenu();
    }
    if (e.key === 'Escape') closeTabEditMenu();
  });
  // Close popover when clicking outside
  setTimeout(() => {
    _tabEditOutsideClick = function(e) {
      if (!popover.contains(e.target) && !e.target.closest('.section-edit-btn') && !e.target.closest('.sub-nav-btn')) {
        closeTabEditMenu();
      }
    };
    document.addEventListener('click', _tabEditOutsideClick);
  }, 0);

  document.getElementById('tab-delete-btn')?.addEventListener('click', () => {
    closeTabEditMenu();
    requestDeleteTab(activeTab.id);
  });

  document.getElementById('tab-save-btn')?.addEventListener('click', () => {
    const val = input.value.trim();
    if (val) renameTab(activeTab.id, val);
    closeTabEditMenu();
  });
}

let _tabEditOutsideClick = null;

function closeTabEditMenu() {
  if (_tabEditOutsideClick) {
    document.removeEventListener('click', _tabEditOutsideClick);
    _tabEditOutsideClick = null;
  }
  const existing = document.getElementById('tab-edit-popover');
  if (existing) existing.remove();
}

// Delete tab modal event listeners
document.getElementById('delete-tab-cancel')?.addEventListener('click', () => {
  document.getElementById('delete-tab-modal-overlay').style.display = 'none';
  _pendingDeleteTabId = null;
});
document.getElementById('delete-tab-modal-close')?.addEventListener('click', () => {
  document.getElementById('delete-tab-modal-overlay').style.display = 'none';
  _pendingDeleteTabId = null;
});
document.getElementById('delete-tab-confirm')?.addEventListener('click', confirmDeleteTab);
document.getElementById('delete-tab-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('delete-tab-modal-overlay')) {
    document.getElementById('delete-tab-modal-overlay').style.display = 'none';
    _pendingDeleteTabId = null;
  }
});

function setActiveSubNav(section) {
  state.activeSection = section;
  document.querySelectorAll('.sub-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });
}

function updateSectionsVisibility() {
  const sections = document.querySelectorAll('.analytics-section');
  document.body.classList.toggle('nav-mode-tabs', state.navMode === 'tabs');
  sections.forEach(sec => {
    const id = sec.dataset.section;
    if (state.navMode === 'tabs') {
      sec.style.display = id === state.activeSection ? 'block' : 'none';
    } else {
      sec.style.display = 'block';
    }
  });
}

function resetLazySections() {
  state.loadedSections = new Set();
  Object.keys(state.pendingLoads).forEach(k => {
    clearTimeout(state.pendingLoads[k]);
  });
  state.pendingLoads = {};
  document.querySelectorAll('.section-content').forEach(el => {
    el.innerHTML = '';
    el.classList.remove('loaded');
  });
}

// ── SCROLL TO SECTION ──────────────────────────────────────────
function scrollToSection(sectionId, updateHash = false) {
  if (state.navMode === 'tabs') {
    setActiveSubNav(sectionId);
    updateSectionsVisibility();
    mountSection(sectionId);
    if (updateHash) {
      window.location.hash = `#analytics/${sectionId}`;
    }
    return;
  }
  if (updateHash) {
    state.instantLoadSections.add(sectionId);
  }
  const el = document.getElementById(`section-${sectionId}`);
  if (el) {
    const headerH = document.getElementById('analytics-header').offsetHeight;
    const y = el.getBoundingClientRect().top + window.pageYOffset - headerH - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
    setActiveSubNav(sectionId);
    if (state.navMode === 'anchors') {
      setupSentinels();
    }
    if (updateHash) {
      window.location.hash = `#analytics/${sectionId}`;
    }
  }
}

// ── ROUTING ────────────────────────────────────────────────────
function navigate(view) {
  if (view === 'analytics') {
    state.currentView = 'analytics';
    document.getElementById('landing-state').style.display = 'none';
    document.getElementById('analytics-page').style.display = 'flex';
    if (!window.location.hash.startsWith('#analytics')) {
      window.location.hash = '#analytics';
    }
    // After showing, set up observers
    setTimeout(() => {
      teardownSentinels();
      setupSentinels();
      teardownSectionObserver();
      setupSectionObserver();
      if (state.navMode === 'anchors') {
        resetLazySections();
      }
      scheduleResponsiveFilterLayoutUpdate();
    }, 50);
    scheduleResponsiveFilterLayoutUpdate();
  } else {
    state.currentView = 'landing';
    document.getElementById('landing-state').style.display = 'flex';
    document.getElementById('analytics-page').style.display = 'none';
    window.location.hash = '';
  }
}

function handleHash() {
  const hash = window.location.hash;
  if (hash.startsWith('#analytics')) {
    navigate('analytics');
    // Check for sub-section
    const parts = hash.split('/');
    if (parts.length > 1) {
      setTimeout(() => scrollToSection(parts[1]), 200);
    }
  } else {
    navigate('analytics'); // Default to analytics
  }
}

// ── NAV CLICKS ─────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.nav === 'analytics') {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      navigate('analytics');
      setTimeout(() => scrollToSection('overview', true), 80);
    } else {
      // Other items: do nothing (look real but inert)
    }
  });
});

// Sub-nav clicks are now attached dynamically in renderTabs()

// ── LENS & ROLE TOGGLES ───────────────────────────────────────
document.querySelectorAll('#popout-lens-toggle .lens-preview-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.lens = btn.dataset.lens;
    resetViewState();
    // Snapshot then remount — Set is mutated during remount so we must copy first
    [...state.loadedSections].forEach(s => remountSection(s));
    syncLensButtons();
    if (document.body.classList.contains('drawer-open')) renderDrawerWidgets();
    window.sendEvent('Lens changed — ' + btn.dataset.lens);
    DashboardConfig.notifyChanged();
  });
});


// Set initial role attribute
document.body.dataset.role = state.role;
syncRoleToggleButtons();


// ── VIEW / EDIT MODE ────────────────────────────────────────────
const viewEditToggleBtn = document.getElementById('viewedit-toggle-btn');

// Eye-open SVG (View mode icon)
const VIEW_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s3-5.5 7-5.5S15 8 15 8s-3 5.5-7 5.5S1 8 1 8z"/><circle cx="8" cy="8" r="2.5"/></svg>`;
// Pencil SVG (Edit mode icon)
const EDIT_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>`;

let _currentViewMode = 'view'; // 'edit' or 'view'

function setViewEditMode(mode) {
  _currentViewMode = mode;
  if (mode === 'view') {
    document.body.dataset.viewmode = 'view';
    // In view mode → show "Edit" action to switch back
    viewEditToggleBtn.innerHTML = EDIT_ICON + '<span>Edit</span>';
    viewEditToggleBtn.title = 'Switch to Edit mode';
  } else {
    delete document.body.dataset.viewmode;
    // In edit mode → show "View" action to switch to view
    viewEditToggleBtn.innerHTML = VIEW_ICON + '<span>View</span>';
    viewEditToggleBtn.title = 'Switch to View mode';
  }
  // When a team filter overrides the lens (feature flag on), switching modes
  // changes which widgets are visible (edit shows all, view hides lens-mismatched).
  if (state.teamFilter && state.teamFilter !== 'All teams') {
    [...state.loadedSections].forEach(s => remountSection(s));
  }
  applyTeamSettingsFlag();
  renderFilterChips(_filterChipCompactMode);
  scheduleResponsiveFilterLayoutUpdate();
}

// Default: View/Edit mode enabled on load
viewEditToggleBtn.style.display = '';
setViewEditMode('view');

if (viewEditToggleBtn) {
  viewEditToggleBtn.addEventListener('click', () => {
    setViewEditMode(_currentViewMode === 'edit' ? 'view' : 'edit');
    window.sendEvent('Edit mode — ' + (_currentViewMode === 'edit' ? 'entered' : 'exited'));
  });
}

// ── MANAGE WIDGETS BUTTON (sub-nav) ────────────────────────────
const manageWidgetsBtn = document.getElementById('manage-widgets-btn');
if (manageWidgetsBtn) {
  manageWidgetsBtn.addEventListener('click', () => {
    const isOpen = document.body.classList.contains('drawer-open');
    if (isOpen) {
      document.body.classList.remove('drawer-open');
      _drawerSection = null;
      setManageWidgetsBtnLabel(false);
    } else {
      openWidgetDrawer(state.activeSection);
      setManageWidgetsBtnLabel(true);
    }
  });
}

// ── RESET ACTIONS (triggered by SideCar via _prototypeGuideAPI.triggerAction) ──
async function performResetSubnav() {
  resetPrototypeStateToDefaults();
  DashboardConfig.clearLocal();
  history.replaceState(null, '', '#analytics/overview');
  const userId = localStorage.getItem('trengo_session_user_name');
  if (userId) {
    await DashboardConfig.save(userId, DashboardConfig.serialize(state, 'reset-subnav')).catch(() => {});
  }
  setTimeout(() => { location.reload(); }, 300);
}

async function performResetOnboarding() {
  localStorage.removeItem('trengo_onboarding_done');
  localStorage.removeItem('trengo_easy_setup_done');
  resetPrototypeStateToDefaults();
  DashboardConfig.clearLocal();
  history.replaceState(null, '', '#analytics/overview');
  const userId = localStorage.getItem('trengo_session_user_name');
  if (userId) {
    await DashboardConfig.save(userId, DashboardConfig.serialize(state, 'reset-onboarding')).catch(() => {});
  }
  if (typeof AdminAssistant !== 'undefined') {
    await AdminAssistant.resetOnboarding();
  }
  setTimeout(() => { location.reload(); }, 800);
}

async function performResetAll() {
  localStorage.removeItem('trengo_onboarding_done');
  localStorage.removeItem('trengo_easy_setup_done');
  localStorage.removeItem('trengo_onboarding_personal');
  resetPrototypeStateToDefaults();
  DashboardConfig.clearLocal();
  history.replaceState(null, '', '#analytics/overview');
  const userId = localStorage.getItem('trengo_session_user_name');
  if (userId) {
    await DashboardConfig.save(userId, DashboardConfig.serialize(state, 'reset-all')).catch(() => {});
  }
  if (typeof AdminAssistant !== 'undefined') await AdminAssistant.resetAll();
  setTimeout(() => { location.reload(); }, 800);
}


// ── FILTER DROPDOWNS ───────────────────────────────────────────
const FILTER_CHIP_IDS = ['filter-date', 'filter-channel', 'filter-team'];
const FILTER_CHIP_CHEVRON_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3 3 3-3"/></svg>`;
const FILTER_CHIP_ICON_SVG = {
  'filter-date': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12"/><path d="M5 1.5v3"/><path d="M11 1.5v3"/></svg>`,
  'filter-channel': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10a1 1 0 011 1v4a1 1 0 01-1 1H8.2L5 14v-3.5H3a1 1 0 01-1-1v-4a1 1 0 011-1z"/><path d="M5 7h6"/></svg>`,
  'filter-team': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="5.2" r="2"/><circle cx="11" cy="6.2" r="1.7"/><path d="M1.8 13.2c.7-2.3 2.5-3.6 5.2-3.6s4.5 1.3 5.2 3.6"/><path d="M8.6 13.2c.4-1.4 1.5-2.3 3.1-2.3 1.4 0 2.5.7 3.1 2.3"/></svg>`
};
let _filterChipCompactMode = false;
let _filterLayoutSyncRaf = 0;
let _filterLayoutResizeObserver = null;

function getFilterBarEl() {
  return document.querySelector('.filter-bar');
}

function getSubNavEl() {
  return document.getElementById('sub-nav');
}

function getSubNavTabsEl() {
  return document.getElementById('sub-nav-tabs');
}

function getSubNavActionsEl() {
  return document.getElementById('sub-nav-actions');
}

function getFilterChipLabel(filterId) {
  if (filterId === 'filter-date') return state.dateFilter || 'Last 30 days';
  if (filterId === 'filter-channel') {
    const n = state.channelFilter.size;
    if (n === 0) return 'All channels';
    if (n === 1) return [...state.channelFilter][0];
    return `${n} channels`;
  }
  if (filterId === 'filter-team') return state.teamFilter || 'All teams';
  return '';
}

function renderFilterChip(filterId, compact = _filterChipCompactMode) {
  const chip = document.getElementById(filterId);
  if (!chip) return;

  const label = getFilterChipLabel(filterId);
  const filterBar = getFilterBarEl();
  chip.dataset.mode = compact ? 'compact' : 'full';
  chip.dataset.location = filterBar?.dataset.location || 'subnav';
  chip.dataset.filterKey = filterId.replace('filter-', '');
  chip.setAttribute('aria-label', label);
  chip.title = label;
  chip.innerHTML = compact
    ? (FILTER_CHIP_ICON_SVG[filterId] || FILTER_CHIP_ICON_SVG['filter-date'])
    : `<span>${escapeHtml(label)}</span>${FILTER_CHIP_CHEVRON_SVG}`;
}

function renderFilterChips(compact = _filterChipCompactMode) {
  FILTER_CHIP_IDS.forEach(filterId => renderFilterChip(filterId, compact));
}

function moveFilterBarToSubNav() {
  const filterBar = getFilterBarEl();
  const subNav = getSubNavEl();
  const tabs = getSubNavTabsEl();
  if (!filterBar || !subNav) return;
  if (filterBar.parentElement === subNav) return;
  subNav.insertBefore(filterBar, tabs ? tabs.nextSibling : subNav.firstChild);
  filterBar.dataset.location = 'subnav';
}

function moveFilterBarToTopRow() {
  const filterBar = getFilterBarEl();
  const actions = getSubNavActionsEl();
  const anchor = viewEditToggleBtn || document.getElementById('viewedit-toggle-btn');
  if (!filterBar || !actions) return;
  if (anchor && anchor.parentElement === actions) {
    actions.insertBefore(filterBar, anchor);
  } else {
    actions.appendChild(filterBar);
  }
  filterBar.dataset.location = 'top';
}

function repositionSharedFilterDropdown() {
  const dropdown = document.getElementById('filter-dropdown');
  if (!dropdown || dropdown.style.display !== 'block') return;
  const filterId = dropdown.dataset.filter;
  if (!filterId) return;
  const chip = document.getElementById(filterId);
  if (!chip) return;
  const rect = chip.getBoundingClientRect();
  dropdown.style.top = (rect.bottom + 4) + 'px';
  dropdown.style.left = rect.left + 'px';
}

function repositionChannelDropdown() {
  const dropdown = document.getElementById('channel-dropdown');
  if (!dropdown || dropdown.style.display !== 'flex') return;
  const chip = document.getElementById('filter-channel');
  if (!chip) return;
  const rect = chip.getBoundingClientRect();
  dropdown.style.top = (rect.bottom + 4) + 'px';
  dropdown.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 400)) + 'px';
}

function repositionOpenFilterDropdowns() {
  repositionSharedFilterDropdown();
  repositionChannelDropdown();
}

function syncResponsiveFilterLayout() {
  const filterBar = getFilterBarEl();
  const subNav = getSubNavEl();
  const tabs = getSubNavTabsEl();
  const header = document.getElementById('analytics-header');
  if (!filterBar || !subNav || !tabs || state.currentView !== 'analytics') return;

  moveFilterBarToSubNav();
  renderFilterChips(false);
  const fullFits = tabs.scrollWidth + filterBar.scrollWidth <= subNav.clientWidth + 1;

  let compactMode = false;
  let dockedTop = false;

  if (!fullFits) {
    renderFilterChips(true);
    moveFilterBarToSubNav();
    compactMode = true;
    dockedTop = tabs.scrollWidth + filterBar.scrollWidth > subNav.clientWidth + 1;
  }

  _filterChipCompactMode = compactMode;
  renderFilterChips(compactMode);
  if (dockedTop) moveFilterBarToTopRow();
  else moveFilterBarToSubNav();
  filterBar.dataset.mode = compactMode ? 'compact' : 'full';
  filterBar.dataset.location = dockedTop ? 'top' : 'subnav';
  if (header) {
    header.dataset.location = dockedTop ? 'top' : 'subnav';
    header.dataset.mode = compactMode ? 'compact' : 'full';
  }
  subNav.dataset.location = dockedTop ? 'top' : 'subnav';
  subNav.dataset.mode = compactMode ? 'compact' : 'full';
  repositionOpenFilterDropdowns();
}

function scheduleResponsiveFilterLayoutUpdate() {
  if (_filterLayoutSyncRaf) return;
  _filterLayoutSyncRaf = requestAnimationFrame(() => {
    _filterLayoutSyncRaf = 0;
    syncResponsiveFilterLayout();
  });
}

window.addEventListener('resize', scheduleResponsiveFilterLayoutUpdate);
if (window.ResizeObserver) {
  _filterLayoutResizeObserver = new ResizeObserver(() => scheduleResponsiveFilterLayoutUpdate());
  [
    document.getElementById('analytics-header'),
    document.getElementById('sub-nav'),
    document.getElementById('sub-nav-tabs'),
    document.getElementById('sub-nav-actions')
  ].filter(Boolean).forEach(el => _filterLayoutResizeObserver.observe(el));
}

function buildTickSVG() {
  return `<svg class="filter-option-tick" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6.5 5.5 10 11 3"/></svg>`;
}
function buildChevronSVG(expanded) {
  return `<svg class="filter-option-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--gray-400);transition:transform .15s;transform:rotate(${expanded ? '90deg' : '0deg'})"><path d="M4 3l4 3-4 3"/></svg>`;
}

function getChannelIconHTML(name) {
  const n = (name || '').toLowerCase();
  const emailSVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><polyline points="1.5,3.5 8,9 14.5,3.5"/></svg>`;
  const chatSVG  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 2.5V11H3a1 1 0 01-1-1V3z"/></svg>`;
  const phoneSVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2a1 1 0 011-1h1.5a1 1 0 011 1v2a1 1 0 01-1 1H5A7 7 0 0011 11h-.5a1 1 0 011-1h2a1 1 0 011 1V12.5a1 1 0 01-1 1H13A11 11 0 012 3V2z"/></svg>`;
  const waSVG    = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5a6.5 6.5 0 016.5 6.5c0 1.3-.38 2.5-1.05 3.55L14.5 14.5l-3-.95A6.5 6.5 0 118 1.5z"/><path d="M6 6.5a.5.5 0 01.5-.5h.2c.2 0 .36.14.4.33l.4 1.7a.4.4 0 01-.12.4l-.5.45a4 4 0 002.24 2.24l.45-.5a.4.4 0 01.4-.12l1.7.4c.19.04.33.2.33.4v.2a.5.5 0 01-.5.5C7.6 11.5 6 9.9 6 8v-1.5z"/></svg>`;
  const igSVG    = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="3"/><circle cx="8" cy="8" r="2.8"/><circle cx="11.5" cy="4.5" r=".6" fill="currentColor" stroke="none"/></svg>`;
  const fbSVG    = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 2.5H11V0H9C7.1 0 5.5 1.6 5.5 3.5V6H3.5V8.5H5.5V16H8V8.5H10.5L11 6H8V3.5C8 2.9 8.6 2.5 9.5 2.5Z"/></svg>`;
  const socialSVG= `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="13" r="1.5"/><line x1="10.5" y1="3.7" x2="5.5" y2="7.3"/><line x1="5.5" y1="8.7" x2="10.5" y2="12.3"/></svg>`;
  const allSVG   = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`;
  let bg, color, svg;
  if      (n === 'all channels')                                                            { bg='#f3f4f6'; color='#6b7280'; svg=allSVG; }
  else if (n.includes('email'))                                                             { bg='#dbeafe'; color='#2563eb'; svg=emailSVG; }
  else if (n.includes('whatsapp'))                                                          { bg='#dcfce7'; color='#16a34a'; svg=waSVG; }
  else if (n.includes('instagram'))                                                         { bg='#fce7f3'; color='#db2777'; svg=igSVG; }
  else if (n.includes('facebook'))                                                          { bg='#dbeafe'; color='#1d4ed8'; svg=fbSVG; }
  else if (n.includes('chat') || n.includes('website') || n.includes('help'))              { bg='#d1fae5'; color='#059669'; svg=chatSVG; }
  else if (n === 'phone' || n === 'voice' || n.includes('support') || n === 'billing' || n === 'onboarding' || n === 'sales') { bg='#fef3c7'; color='#d97706'; svg=phoneSVG; }
  else if (n === 'social')                                                                  { bg='#ede9fe'; color='#7c3aed'; svg=socialSVG; }
  else                                                                                      { bg='#f3f4f6'; color='#6b7280'; svg=allSVG; }
  return `<span class="channel-icon" style="background:${bg};color:${color}">${svg}</span>`;
}

const channelExpandedGroups = new Set();

function buildGroupedDropdownHTML(config) {
  let html = '';
  for (const group of config.groups) {
    const hasChildren = !!(group.children && group.children.length);
    const isExpanded = channelExpandedGroups.has(group.value);
    html += `<div class="filter-option filter-option-group ${hasChildren ? 'has-children' : ''} ${isExpanded ? 'expanded' : ''}" data-value="${group.value}" data-group-toggle="${hasChildren}">${getChannelIconHTML(group.value)}<span class="filter-option-label">${group.label}</span>${hasChildren ? buildChevronSVG(isExpanded) : buildTickSVG()}</div>`;
    if (hasChildren) {
      for (const child of group.children) {
        const sel = state[config.stateKey] === child;
        html += `<div class="filter-option filter-option-sub ${sel ? 'selected' : ''} ${isExpanded ? '' : 'hidden'}" data-value="${child}">${getChannelIconHTML(child)}<span class="filter-option-label">${child}</span>${buildTickSVG()}</div>`;
      }
    }
  }
  return html;
}

// ── CHANNEL TWO-PANEL DROPDOWN ──────────────────────────────
function checkboxCheckedSVG() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="0.5" y="0.5" width="15" height="15" rx="3" fill="#1a1a1a" stroke="#1a1a1a"/><polyline points="4.5 8 7 10.5 11.5 5.5" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function checkboxEmptySVG() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="0.5" y="0.5" width="15" height="15" rx="3" fill="white" stroke="#d1d1d6"/></svg>`;
}

let _activeChannelType = null;

function openChannelDropdown(chip) {
  const dropdown = document.getElementById('channel-dropdown');
  // Toggle off if already open
  if (dropdown.style.display === 'flex') { closeChannelDropdown(); return; }
  // Close shared dropdown
  document.getElementById('filter-dropdown').style.display = 'none';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-filter'));
  chip.classList.add('active-filter');
  // Position below chip
  const rect = chip.getBoundingClientRect();
  dropdown.style.top = (rect.bottom + 4) + 'px';
  dropdown.style.left = Math.min(rect.left, window.innerWidth - 400) + 'px';
  dropdown.style.display = 'flex';
  _activeChannelType = null;
  renderChannelTypesPanel();
  document.getElementById('channel-dropdown-children').style.display = 'none';
}

function closeChannelDropdown() {
  document.getElementById('channel-dropdown').style.display = 'none';
  const chip = document.getElementById('filter-channel');
  if (chip) chip.classList.remove('active-filter');
  _activeChannelType = null;
}

function renderChannelTypesPanel() {
  const config = filterConfigs['filter-channel'];
  const container = document.getElementById('channel-dropdown-types');
  let html = '';
  for (const group of config.groups) {
    const hasChildren = !!(group.children && group.children.length);
    const isActive = _activeChannelType === group.value;
    const total = hasChildren ? group.children.length : 0;
    const selected = hasChildren ? group.children.filter(c => state.channelFilter.has(c)).length : 0;
    const hasSel = selected > 0;
    html += `<div class="channel-type-item ${isActive ? 'active' : ''} ${hasSel ? 'has-selection' : ''}" data-type-value="${group.value}">` +
      `<span class="channel-type-label">${group.label}</span>` +
      (hasChildren
        ? (hasSel ? `<span class="channel-type-selection-count">${selected}/${total}</span>` : `<span class="channel-type-count">${total}</span>`) +
          `<svg class="channel-type-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l4 3-4 3"/></svg>`
        : '') +
      `</div>`;
  }
  container.innerHTML = html;
}

function renderChannelChildrenPanel(typeValue) {
  const config = filterConfigs['filter-channel'];
  const group = config.groups.find(g => g.value === typeValue);
  if (!group || !group.children) return;
  const container = document.getElementById('channel-dropdown-children');
  const allSelected = group.children.every(c => state.channelFilter.has(c));
  let html = `<div class="channel-child-item channel-child-select-all" data-value="${typeValue}">` +
    `<span class="channel-checkbox">${allSelected ? checkboxCheckedSVG() : checkboxEmptySVG()}</span>` +
    `<span class="channel-child-label">Select all</span></div>` +
    `<div class="channel-children-divider"></div>`;
  for (const child of group.children) {
    const isChecked = state.channelFilter.has(child);
    html += `<div class="channel-child-item ${isChecked ? 'checked' : ''}" data-value="${child}" data-parent-type="${typeValue}">` +
      `<span class="channel-checkbox">${isChecked ? checkboxCheckedSVG() : checkboxEmptySVG()}</span>` +
      `<span class="channel-child-label">${child}</span></div>`;
  }
  container.innerHTML = html;
  container.style.display = 'block';
}

function updateChannelChipLabel() {
  const chip = document.getElementById('filter-channel');
  if (!chip) return;
  const n = state.channelFilter.size;
  // Toggle active styling on chip when filter is applied
  chip.classList.toggle('filter-applied', n > 0);
  renderFilterChip('filter-channel', _filterChipCompactMode);
  scheduleResponsiveFilterLayoutUpdate();
}

const filterConfigs = {
  'filter-date': {
    options: ['Today', 'Last 7 days', 'Last 14 days', 'Last 30 days', 'Last 90 days'],
    stateKey: 'dateFilter'
  },
  'filter-channel': {
    stateKey: 'channelFilter',
    groups: [
      { label: 'All channels', value: 'All channels', children: null },
      { label: 'Email',        value: 'Email',        children: ['Support Email', 'Sales Email'] },
      { label: 'Live chat',    value: 'Live chat',    children: ['Main website', 'Help center'] },
      { label: 'Social',       value: 'Social',       children: ['WhatsApp', 'Instagram', 'Facebook'] },
      { label: 'Voice',        value: 'Voice',        children: ['Support EN', 'Support NL', 'Sales', 'Billing', 'Onboarding'] },
    ]
  },
  'filter-team': {
    options: [],
    stateKey: 'teamFilter'
  }
};

function getTeamFilterOptions() {
  return ['All teams', ...getRoleScopedTeams().map(team => team.name)];
}

function updateTeamFilterOptions() {
  const options = getTeamFilterOptions();
  filterConfigs['filter-team'].options = options;

  if (!options.includes(state.teamFilter)) {
    state.teamFilter = 'All teams';
  }

  const chip = document.getElementById('filter-team');
  if (chip) {
    chip.classList.toggle('filter-applied', state.teamFilter !== 'All teams');
    renderFilterChip('filter-team', _filterChipCompactMode);
  }

  const dropdown = document.getElementById('filter-dropdown');
  if (dropdown?.style.display === 'block' && dropdown.dataset.filter === 'filter-team') {
    const content = document.getElementById('filter-dropdown-content');
    content.innerHTML = options.map(opt =>
      `<div class="filter-option ${state.teamFilter === opt ? 'selected' : ''}" data-value="${opt}"><span class="filter-option-label">${opt}</span>${buildTickSVG()}</div>`
    ).join('');
  }

  scheduleResponsiveFilterLayoutUpdate();
}

updateTeamFilterOptions();
window.updateTeamFilterOptions = updateTeamFilterOptions;

// Chip click handlers — open/populate the dropdown only
Object.keys(filterConfigs).forEach(filterId => {
  const chip = document.getElementById(filterId);
  if (!chip) return;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();

    // Channel filter uses its own two-panel dropdown
    if (filterId === 'filter-channel') {
      document.getElementById('filter-dropdown').style.display = 'none';
      openChannelDropdown(chip);
      return;
    }

    const dropdown = document.getElementById('filter-dropdown');
    const content = document.getElementById('filter-dropdown-content');
    const config = filterConfigs[filterId];
    const rect = chip.getBoundingClientRect();

    // Close channel dropdown if open
    closeChannelDropdown();

    // Toggle
    if (dropdown.style.display === 'block' && dropdown.dataset.filter === filterId) {
      dropdown.style.display = 'none';
      chip.classList.remove('active-filter');
      return;
    }

    // Close others
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-filter'));
    chip.classList.add('active-filter');

    content.innerHTML = config.options.map(opt =>
      `<div class="filter-option ${state[config.stateKey] === opt ? 'selected' : ''}" data-value="${opt}"><span class="filter-option-label">${opt}</span>${buildTickSVG()}</div>`
    ).join('');

    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.display = 'block';
    dropdown.dataset.filter = filterId;
  });
});

// Single delegated listener on content — wired once, handles all filters
document.getElementById('filter-dropdown-content').addEventListener('click', e => {
  const item = e.target.closest('.filter-option');
  if (!item) return;
  e.stopPropagation();

  const dropdown = document.getElementById('filter-dropdown');
  const content = document.getElementById('filter-dropdown-content');
  const filterId = dropdown.dataset.filter;
  if (!filterId) return;
  const config = filterConfigs[filterId];
  const chip = document.getElementById(filterId);

  if (item.dataset.groupToggle === 'true') {
    // Expand/collapse group — no filter change
    const val = item.dataset.value;
    if (channelExpandedGroups.has(val)) channelExpandedGroups.delete(val);
    else channelExpandedGroups.add(val);
    content.innerHTML = buildGroupedDropdownHTML(config);
    return;
  }

  // Leaf item — apply filter + close
  state[config.stateKey] = item.dataset.value;
  window.sendEvent('Filter changed — ' + config.stateKey + ' = ' + item.dataset.value);
  dropdown.style.display = 'none';
  chip.classList.remove('active-filter');
  [...state.loadedSections].forEach(s => remountSection(s));
  if (filterId === 'filter-team') syncLensButtons();
  if (document.body.classList.contains('drawer-open')) renderDrawerWidgets();
  if (filterId === 'filter-channel') {
    updateChannelChipLabel();
  } else {
    renderFilterChip(filterId, _filterChipCompactMode);
    scheduleResponsiveFilterLayoutUpdate();
  }
});

// ── Channel two-panel: types panel click ──────────────────────
document.getElementById('channel-dropdown-types').addEventListener('click', (e) => {
  const item = e.target.closest('.channel-type-item');
  if (!item) return;
  e.stopPropagation();
  const typeValue = item.dataset.typeValue;
  const config = filterConfigs['filter-channel'];
  const group = config.groups.find(g => g.value === typeValue);
  if (!group) return;

  // "All channels" — no children, clear filter
  if (!group.children || !group.children.length) {
    state.channelFilter = new Set();
    updateChannelChipLabel();
    closeChannelDropdown();
    [...state.loadedSections].forEach(s => remountSection(s));
    if (document.body.classList.contains('drawer-open')) renderDrawerWidgets();
    return;
  }

  // Open children panel for this type
  _activeChannelType = typeValue;
  renderChannelTypesPanel();
  renderChannelChildrenPanel(typeValue);
});

// ── Channel two-panel: children panel click ───────────────────
document.getElementById('channel-dropdown-children').addEventListener('click', (e) => {
  const item = e.target.closest('.channel-child-item');
  if (!item) return;
  e.stopPropagation();
  const value = item.dataset.value;

  if (item.classList.contains('channel-child-select-all')) {
    // Toggle all children of this type
    const config = filterConfigs['filter-channel'];
    const group = config.groups.find(g => g.value === value);
    if (group && group.children) {
      const allSelected = group.children.every(c => state.channelFilter.has(c));
      if (allSelected) {
        group.children.forEach(c => state.channelFilter.delete(c));
      } else {
        group.children.forEach(c => state.channelFilter.add(c));
      }
    }
  } else {
    // Individual child toggle
    if (state.channelFilter.has(value)) state.channelFilter.delete(value);
    else state.channelFilter.add(value);
  }

  window.sendEvent('Filter — channel toggled: ' + value);
  updateChannelChipLabel();
  renderChannelChildrenPanel(_activeChannelType);
  renderChannelTypesPanel();
  [...state.loadedSections].forEach(s => remountSection(s));
  if (document.body.classList.contains('drawer-open')) renderDrawerWidgets();
});

// Close dropdown on outside click + clear bar filter when clicking outside a widget card
document.addEventListener('click', (e) => {
  document.getElementById('filter-dropdown').style.display = 'none';
  // Close channel two-panel dropdown on outside click
  if (!e.target.closest('#channel-dropdown') && !e.target.closest('#filter-channel')) {
    closeChannelDropdown();
  }
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-filter'));
  if (state.barFilter && state.barFilter.widgetId && !e.target.closest('.widget-card')) {
    clearBarFilter();
  }
});

// ── TEAM SETTINGS ──────────────────────────────────────────────
let _teamSettingsDraft = [];
let _teamSettingsMode = 'session'; // 'session' | 'default'

function applyTeamSettingsFlag() {
  const btn = document.getElementById('team-display-settings-btn');
  if (btn) btn.style.display = _currentViewMode === 'edit' ? '' : 'none';
  scheduleResponsiveFilterLayoutUpdate();
}

function buildTeamSettingsDraft(teams) {
  return cloneTeamDefinitions(teams).map(team => ({
    name: team.name,
    members: [...team.members],
    usecase: normalizeTeamUsecase(team.usecase),
    supervisorScope: normalizeSupervisorScope(team.supervisorScope),
    originalName: team.name,
  }));
}

function getTeamSettingsSource(mode) {
  if (mode === 'default') return getDefaultTeams();
  const liveTeams = getPrototypeTeams();
  return liveTeams.length ? liveTeams : getActiveTeams();
}

function teamSettingsModeMeta() {
  const editingDefaults = _teamSettingsMode === 'default';
  return {
    title: editingDefaults ? 'Edit default teams' : 'Manage teams',
    subtitle: editingDefaults
      ? 'Update the prototype defaults used when a session has not customised teams, including which teams are in scope for supervisor onboarding.'
      : 'Update team names and whether each team is support, sales, or both for this session.',
  };
}

function renderTeamSettingsModal() {
  const body = document.getElementById('team-settings-body');
  const title = document.getElementById('team-settings-title');
  const subtitle = document.getElementById('team-settings-subtitle');
  if (!body || !title || !subtitle) return;

  const { title: titleText, subtitle: subtitleText } = teamSettingsModeMeta();
  title.textContent = titleText;
  subtitle.textContent = subtitleText;

  const editingDefaults = _teamSettingsMode === 'default';

  const rows = _teamSettingsDraft.map((team, index) => {
    const memberCount = Array.isArray(team.members) ? team.members.length : 0;
    const memberText = memberCount === 0
      ? 'No members assigned'
      : `${memberCount} member${memberCount === 1 ? '' : 's'} linked`;

    return `<div class="team-settings-editor-row ${editingDefaults ? 'editing-defaults' : ''}" data-index="${index}">
      <div class="team-settings-editor-main">
        <label class="team-settings-field-label" for="team-settings-name-${index}">Team name</label>
        <input
          class="team-settings-name-input"
          id="team-settings-name-${index}"
          type="text"
          value="${escapeHtml(team.name)}"
          placeholder="Team name"
        />
        <div class="team-settings-row-meta">${memberText}</div>
      </div>
      <div class="team-settings-editor-focus">
        <div class="team-settings-field-label">Focus</div>
        <div class="ai-setup-team-row-choices">
          ${['resolve', 'convert', 'both'].map(usecase => `
            <button
              class="ai-setup-team-choice ${normalizeTeamUsecase(team.usecase) === usecase ? 'selected' : ''}"
              data-index="${index}"
              data-usecase="${usecase}"
              type="button"
            >${usecase === 'resolve' ? 'Support' : usecase === 'convert' ? 'Sales' : 'Both'}</button>
          `).join('')}
        </div>
      </div>
      ${editingDefaults ? `
      <div class="team-settings-editor-scope">
        <div class="team-settings-field-label">Supervisor onboarding</div>
        <div class="team-settings-scope-toggle">
          <button
            class="team-settings-scope-btn ${normalizeSupervisorScope(team.supervisorScope) ? 'selected' : ''}"
            data-index="${index}"
            data-supervisor-scope="true"
            type="button"
          >Included</button>
          <button
            class="team-settings-scope-btn ${!normalizeSupervisorScope(team.supervisorScope) ? 'selected' : ''}"
            data-index="${index}"
            data-supervisor-scope="false"
            type="button"
          >Excluded</button>
        </div>
      </div>` : ''}
      <button class="team-settings-delete-btn" data-index="${index}" type="button">Delete</button>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="team-settings-toolbar">
      <div class="team-settings-toolbar-note">${editingDefaults ? 'Default changes affect new or reset team setups on this browser.' : 'Session changes update the team filter and current dashboard view.'}</div>
    </div>
    <div class="team-settings-editor-list">${rows}</div>
    <div class="team-settings-footer-tools">
      <button class="team-settings-add-btn" id="team-settings-add-btn" type="button">Add team</button>
    </div>
    <div class="team-settings-error" id="team-settings-error"></div>
  `;

  body.querySelectorAll('.team-settings-name-input').forEach(input => {
    input.addEventListener('input', () => {
      const index = Number(input.closest('.team-settings-editor-row')?.dataset.index);
      if (Number.isNaN(index) || !_teamSettingsDraft[index]) return;
      _teamSettingsDraft[index].name = input.value;
    });
  });

  body.querySelectorAll('.ai-setup-team-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      if (Number.isNaN(index) || !_teamSettingsDraft[index]) return;
      _teamSettingsDraft[index].usecase = btn.dataset.usecase;
      renderTeamSettingsModal();
    });
  });

  body.querySelectorAll('[data-supervisor-scope]').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      if (Number.isNaN(index) || !_teamSettingsDraft[index]) return;
      _teamSettingsDraft[index].supervisorScope = btn.dataset.supervisorScope === 'true';
      renderTeamSettingsModal();
    });
  });

  body.querySelectorAll('.team-settings-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      if (Number.isNaN(index)) return;
      _teamSettingsDraft.splice(index, 1);
      renderTeamSettingsModal();
    });
  });

  body.querySelector('#team-settings-add-btn')?.addEventListener('click', () => {
    _teamSettingsDraft.push({
      name: '',
      members: [],
      usecase: 'resolve',
      supervisorScope: true,
      originalName: null,
    });
    renderTeamSettingsModal();
    requestAnimationFrame(() => {
      const lastInput = body.querySelector('.team-settings-editor-row:last-child .team-settings-name-input');
      lastInput?.focus();
    });
  });
}

function validateTeamSettingsDraft() {
  const seen = new Set();
  const renameMap = {};
  const teams = [];

  for (const team of _teamSettingsDraft) {
    const name = String(team?.name || '').trim();
    if (!name) {
      return { error: 'Every team needs a name.' };
    }
    const nameKey = name.toLowerCase();
    if (seen.has(nameKey)) {
      return { error: `Team names need to be unique. "${name}" appears more than once.` };
    }
    seen.add(nameKey);
    teams.push({
      name,
      members: Array.isArray(team?.members) ? [...team.members] : [],
      usecase: normalizeTeamUsecase(team?.usecase),
      supervisorScope: normalizeSupervisorScope(team?.supervisorScope),
    });
    if (team?.originalName && team.originalName !== name) {
      renameMap[team.originalName] = name;
    }
  }

  if (!teams.length) {
    return { error: 'Keep at least one team.' };
  }

  return { teams, renameMap };
}

function applySavedTeams(teams, renameMap = {}) {
  const previousFilter = state.teamFilter;
  syncTeamsState(teams, { persist: 'user' });

  if (previousFilter && previousFilter !== 'All teams') {
    state.teamFilter = renameMap[previousFilter] || previousFilter;
  }
  updateTeamFilterOptions();
  syncLensButtons();
  resetViewState();
  [...state.loadedSections].forEach(sectionId => remountSection(sectionId));
  if (document.body.classList.contains('drawer-open')) renderDrawerWidgets();
  DashboardConfig.notifyChanged();
}

function saveTeamSettingsModal() {
  const body = document.getElementById('team-settings-body');
  const errorEl = document.getElementById('team-settings-error');
  const { teams, renameMap, error } = validateTeamSettingsDraft();

  if (error) {
    if (errorEl) errorEl.textContent = error;
    return false;
  }

  if (_teamSettingsMode === 'default') {
    const hadUserOverride = hasStoredUserTeams();
    writeStoredTeams(DEFAULT_TEAMS_KEY, teams);
    if (!hadUserOverride) {
      syncTeamsState(teams);
      updateTeamFilterOptions();
      syncLensButtons();
      resetViewState();
      [...state.loadedSections].forEach(sectionId => remountSection(sectionId));
      if (document.body.classList.contains('drawer-open')) renderDrawerWidgets();
      DashboardConfig.notifyChanged();
    }
  } else {
    applySavedTeams(teams, renameMap);
  }

  if (body) body.scrollTop = 0;
  closeTeamSettingsModal();
  return true;
}

function openTeamSettingsModal(mode = 'session') {
  _teamSettingsMode = mode;
  _teamSettingsDraft = buildTeamSettingsDraft(getTeamSettingsSource(mode));
  renderTeamSettingsModal();
  document.getElementById('team-settings-modal-overlay').style.display = 'flex';
}

function closeTeamSettingsModal() {
  document.getElementById('team-settings-modal-overlay').style.display = 'none';
}

let _defaultCustomerProfiles = [];
let _userCustomerProfiles = [];
let _addCustomerDraft = null;
let _editingUserCustomerIndex = null;
let _editingUserCustomerDraft = null;
let _addSectionCollapsed = false;
const _builtInCustomerIds = new Set(BUILT_IN_CUSTOMER_PROFILES.map(p => p.id));

function buildKnownTeamsFromText(value) {
  return uniqueNonEmptyLines(value).map(name => {
    const likelyFocus = guessCustomerTeamFocus(name);
    return likelyFocus ? { name, likelyFocus } : { name };
  });
}

function _draftFromProfile(profile, index) {
  const normalized = normalizeCustomerProfile(profile, index);
  return {
    ...cloneJson(normalized),
    knownTeamsText: (normalized.knownTeams || []).map(t => t.name).join('\n'),
    extraSourceUrlsText: Array.isArray(normalized.extraSourceUrls) ? normalized.extraSourceUrls.join('\n') : '',
  };
}

function _profileFromDraft(draft, index) {
  return normalizeCustomerProfile({
    ...draft,
    company: String(draft.company || '').trim(),
    industry: String(draft.industry || '').trim(),
    website: String(draft.website || '').trim(),
    helpCenterUrl: String(draft.helpCenterUrl || '').trim(),
    productSummary: String(draft.productSummary || '').trim(),
    generalNotes: String(draft.generalNotes || '').trim(),
    extraSourceUrls: uniqueNonEmptyLines(draft.extraSourceUrlsText),
    knownTeams: buildKnownTeamsFromText(draft.knownTeamsText),
  }, index);
}

function _allProfilesList() {
  return [..._defaultCustomerProfiles, ..._userCustomerProfiles];
}

function _persistAndRefresh() {
  saveCustomerProfiles(_allProfilesList());
  if (window.AdminAssistant?.refreshMetaStart) window.AdminAssistant.refreshMetaStart();
}

function _validateDraft(draft, existingProfiles, excludeId) {
  const company = String(draft.company || '').trim();
  if (!company) return { error: 'Company name is required.' };
  const dup = existingProfiles.find(p =>
    p.id !== excludeId && p.company.toLowerCase() === company.toLowerCase()
  );
  if (dup) return { error: `"${company}" already exists.` };
  return { ok: true };
}

// ── Customer form field template (reused by add + edit) ──
function _renderCustomerFormFields(draft, prefix) {
  return `
    <div class="customer-settings-grid">
      <div class="customer-settings-field">
        <label class="team-settings-field-label">Company name</label>
        <input class="customer-settings-input" data-${prefix}-field="company" type="text" value="${escapeHtml(draft.company || '')}" placeholder="Company name" />
      </div>
      <div class="customer-settings-field">
        <label class="team-settings-field-label">Industry</label>
        <input class="customer-settings-input" data-${prefix}-field="industry" type="text" value="${escapeHtml(draft.industry || '')}" placeholder="Industry" />
      </div>
      <div class="customer-settings-field">
        <label class="team-settings-field-label">Website</label>
        <input class="customer-settings-input" data-${prefix}-field="website" type="url" value="${escapeHtml(draft.website || '')}" placeholder="https://example.com" />
      </div>
      <div class="customer-settings-field">
        <label class="team-settings-field-label">Help center / docs URL</label>
        <input class="customer-settings-input" data-${prefix}-field="helpCenterUrl" type="url" value="${escapeHtml(draft.helpCenterUrl || '')}" placeholder="https://help.example.com" />
      </div>
      <div class="customer-settings-field-wide">
        <label class="team-settings-field-label">Product or service summary</label>
        <textarea class="customer-settings-textarea" data-${prefix}-field="productSummary" placeholder="What does this company do?">${escapeHtml(draft.productSummary || '')}</textarea>
      </div>
      <div class="customer-settings-field">
        <label class="team-settings-field-label">Known teams</label>
        <textarea class="customer-settings-textarea" data-${prefix}-field="knownTeamsText" placeholder="One team per line">${escapeHtml(draft.knownTeamsText || '')}</textarea>
      </div>
      <div class="customer-settings-field">
        <label class="team-settings-field-label">Extra source URLs</label>
        <textarea class="customer-settings-textarea" data-${prefix}-field="extraSourceUrlsText" placeholder="One URL per line">${escapeHtml(draft.extraSourceUrlsText || '')}</textarea>
      </div>
      <div class="customer-settings-field-wide">
        <label class="team-settings-field-label">General information</label>
        <textarea class="customer-settings-textarea" data-${prefix}-field="generalNotes" placeholder="Anything else the onboarding agent should know about this customer...">${escapeHtml(draft.generalNotes || '')}</textarea>
      </div>
    </div>`;
}

function renderCustomerSettingsModal() {
  const body = document.getElementById('customer-settings-body');
  if (!body) return;

  const modalEl = document.getElementById('customer-settings-modal');
  if (modalEl) {
    const h3 = modalEl.querySelector('.modal-header h3');
    const sub = modalEl.querySelector('.modal-subtitle');
    if (h3) h3.textContent = 'Manage Customers';
    if (sub) sub.textContent = 'Add your own customer profiles or use the built-in defaults.';
  }

  const isAddCollapsed = _addSectionCollapsed || _editingUserCustomerIndex !== null;

  // ── Section 1: Default customers ──
  const defaultRows = _defaultCustomerProfiles.map(p => `
    <div class="cs-default-row">
      <span class="cs-default-company">${escapeHtml(p.company)}</span>
      <span class="cs-default-sep">&middot;</span>
      <span class="cs-default-description">${escapeHtml(p.description || p.industry || '')}</span>
    </div>`).join('');

  const section1 = `
    <div class="cs-section">
      <div class="cs-section-header">
        <div class="cs-section-title">Default Customers</div>
        <div class="cs-section-note">System-level demo profiles — these can't be edited or removed.</div>
      </div>
      <div class="cs-defaults-list">${defaultRows}</div>
    </div>`;

  // ── Section 2: Add new customer ──
  const section2 = `
    <div class="cs-section cs-section-add${isAddCollapsed ? ' collapsed' : ''}">
      <button class="cs-add-collapsed-header" id="cs-expand-add-btn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add New Customer
      </button>
      <div class="cs-section-header">
        <div class="cs-section-title">Add New Customer</div>
      </div>
      <div class="cs-add-form">
        ${_renderCustomerFormFields(_addCustomerDraft || {}, 'add')}
        <div class="cs-add-form-actions">
          <button class="cs-add-save-btn" id="cs-add-save-btn" type="button">Save</button>
          <button class="customer-settings-add-btn customer-settings-upload-btn" id="customer-settings-upload-btn" type="button">Upload file</button>
          <input type="file" id="customer-settings-file-input" accept=".pdf,.docx,.txt,.csv" style="display:none">
        </div>
        <div class="customer-settings-upload-status" id="customer-settings-upload-status" style="display:none"></div>
        <div class="cs-error" id="cs-add-error"></div>
      </div>
    </div>`;

  // ── Section 3: User customers ──
  let userRows = '';
  if (_userCustomerProfiles.length === 0) {
    userRows = '<div class="cs-user-empty">No custom customers yet.</div>';
  } else {
    userRows = _userCustomerProfiles.map((p, i) => {
      const isEditing = _editingUserCustomerIndex === i;
      let html = `
        <div class="cs-user-row${isEditing ? ' editing' : ''}" data-user-index="${i}">
          <div class="cs-user-info">
            <span class="cs-user-company">${escapeHtml(p.company)}</span>
            <span class="cs-user-industry">${escapeHtml(p.industry || '')}</span>
          </div>
          <div class="cs-user-actions">
            <button class="cs-user-edit-btn" data-user-edit="${i}" type="button" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="cs-user-delete-btn" data-user-delete="${i}" type="button" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>`;
      if (isEditing && _editingUserCustomerDraft) {
        html += `
          <div class="cs-user-edit-drawer">
            ${_renderCustomerFormFields(_editingUserCustomerDraft, 'edit')}
            <div class="cs-edit-drawer-actions">
              <button class="cs-edit-cancel-btn" id="cs-edit-cancel-btn" type="button">Cancel</button>
              <button class="cs-edit-save-btn" id="cs-edit-save-btn" type="button">Save</button>
            </div>
            <div class="cs-error" id="cs-edit-error"></div>
          </div>`;
      }
      return html;
    }).join('');
  }

  const section3 = `
    <div class="cs-section">
      <div class="cs-section-header">
        <div class="cs-section-title">Your Customers</div>
      </div>
      <div class="cs-user-list">${userRows}</div>
    </div>`;

  body.innerHTML = section1 + section2 + section3;

  // ── Wire events ──

  // Add form: bind inputs to _addCustomerDraft
  body.querySelectorAll('[data-add-field]').forEach(input => {
    input.addEventListener('input', () => {
      if (_addCustomerDraft) _addCustomerDraft[input.dataset.addField] = input.value;
    });
  });

  // Add form: save
  body.querySelector('#cs-add-save-btn')?.addEventListener('click', () => {
    const errorEl = body.querySelector('#cs-add-error');
    const v = _validateDraft(_addCustomerDraft, _allProfilesList(), null);
    if (v.error) { if (errorEl) errorEl.textContent = v.error; return; }
    const profile = _profileFromDraft(_addCustomerDraft, _userCustomerProfiles.length);
    _userCustomerProfiles.push(profile);
    _persistAndRefresh();
    _addCustomerDraft = { ...createBlankCustomerProfile(), knownTeamsText: '', extraSourceUrlsText: '' };
    renderCustomerSettingsModal();
    requestAnimationFrame(() => {
      const rows = body.querySelectorAll('.cs-user-row');
      if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  // Add form: upload file
  body.querySelector('#customer-settings-upload-btn')?.addEventListener('click', () => {
    body.querySelector('#customer-settings-file-input')?.click();
  });
  body.querySelector('#customer-settings-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = body.querySelector('#customer-settings-upload-status');
    const uploadBtn = body.querySelector('#customer-settings-upload-btn');
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = `Analyzing ${file.name}…`; }
    if (uploadBtn) uploadBtn.disabled = true;
    try {
      const profile = await AdminAssistant.analyzeFileForCustomer(file);
      _addCustomerDraft = {
        ...createBlankCustomerProfile(),
        company: profile.company || '',
        industry: profile.industry || '',
        website: profile.website || '',
        helpCenterUrl: profile.helpCenterUrl || '',
        productSummary: profile.productSummary || '',
        generalNotes: profile.generalNotes || '',
        knownTeamsText: (profile.knownTeams || []).join('\n'),
        extraSourceUrlsText: '',
      };
      // Ensure add section is expanded
      _editingUserCustomerIndex = null;
      _editingUserCustomerDraft = null;
      renderCustomerSettingsModal();
    } catch (err) {
      if (statusEl) statusEl.textContent = `Failed to analyze file: ${err.message}`;
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
    }
  });

  // Expand add section (when collapsed)
  body.querySelector('#cs-expand-add-btn')?.addEventListener('click', () => {
    _editingUserCustomerIndex = null;
    _editingUserCustomerDraft = null;
    _addSectionCollapsed = false;
    renderCustomerSettingsModal();
  });

  // User customer: edit buttons
  body.querySelectorAll('[data-user-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.userEdit);
      if (Number.isNaN(idx) || !_userCustomerProfiles[idx]) return;
      _editingUserCustomerIndex = idx;
      _editingUserCustomerDraft = _draftFromProfile(_userCustomerProfiles[idx], idx);
      renderCustomerSettingsModal();
    });
  });

  // User customer: delete buttons
  body.querySelectorAll('[data-user-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.userDelete);
      if (Number.isNaN(idx) || !_userCustomerProfiles[idx]) return;
      if (!confirm(`Delete "${_userCustomerProfiles[idx].company}"?`)) return;
      _userCustomerProfiles.splice(idx, 1);
      if (_editingUserCustomerIndex === idx) {
        _editingUserCustomerIndex = null;
        _editingUserCustomerDraft = null;
      } else if (_editingUserCustomerIndex !== null && _editingUserCustomerIndex > idx) {
        _editingUserCustomerIndex--;
      }
      _persistAndRefresh();
      renderCustomerSettingsModal();
    });
  });

  // Edit drawer: bind inputs
  body.querySelectorAll('[data-edit-field]').forEach(input => {
    input.addEventListener('input', () => {
      if (_editingUserCustomerDraft) _editingUserCustomerDraft[input.dataset.editField] = input.value;
    });
  });

  // Edit drawer: save
  body.querySelector('#cs-edit-save-btn')?.addEventListener('click', () => {
    const errorEl = body.querySelector('#cs-edit-error');
    const originalId = _userCustomerProfiles[_editingUserCustomerIndex]?.id;
    const v = _validateDraft(_editingUserCustomerDraft, _allProfilesList(), originalId);
    if (v.error) { if (errorEl) errorEl.textContent = v.error; return; }
    _userCustomerProfiles[_editingUserCustomerIndex] = _profileFromDraft(_editingUserCustomerDraft, _editingUserCustomerIndex);
    _editingUserCustomerIndex = null;
    _editingUserCustomerDraft = null;
    _addSectionCollapsed = true;
    _persistAndRefresh();
    renderCustomerSettingsModal();
  });

  // Edit drawer: cancel
  body.querySelector('#cs-edit-cancel-btn')?.addEventListener('click', () => {
    _editingUserCustomerIndex = null;
    _editingUserCustomerDraft = null;
    _addSectionCollapsed = true;
    renderCustomerSettingsModal();
  });
}

async function openCustomerSettingsModal() {
  const profiles = await loadCustomerProfiles();
  _defaultCustomerProfiles = profiles.filter(p => _builtInCustomerIds.has(p.id));
  _userCustomerProfiles = profiles.filter(p => !_builtInCustomerIds.has(p.id));
  _addCustomerDraft = { ...createBlankCustomerProfile(), knownTeamsText: '', extraSourceUrlsText: '' };
  _editingUserCustomerIndex = null;
  _editingUserCustomerDraft = null;
  _addSectionCollapsed = false;
  renderCustomerSettingsModal();
  const overlay = document.getElementById('customer-settings-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeCustomerSettingsModal() {
  const overlay = document.getElementById('customer-settings-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Wire up button and modal controls
const teamSettingsBtn = document.getElementById('team-display-settings-btn');
if (teamSettingsBtn) {
  teamSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTeamSettingsModal();
  });
}

document.getElementById('team-settings-modal-close')?.addEventListener('click', closeTeamSettingsModal);
document.getElementById('team-settings-cancel')?.addEventListener('click', closeTeamSettingsModal);
document.getElementById('team-settings-save')?.addEventListener('click', saveTeamSettingsModal);
document.getElementById('customer-settings-modal-close')?.addEventListener('click', closeCustomerSettingsModal);
document.getElementById('customer-settings-cancel')?.addEventListener('click', closeCustomerSettingsModal);

// Close on overlay backdrop click
document.getElementById('team-settings-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('team-settings-modal-overlay')) closeTeamSettingsModal();
});
document.getElementById('customer-settings-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('customer-settings-modal-overlay')) closeCustomerSettingsModal();
});

applyTeamSettingsFlag();
syncLensButtons();


// ── ADD WIDGET BUTTONS (inline "+ Add widgets" CTA kept working) ────
document.querySelectorAll('.add-widget-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const isOpen = document.body.classList.contains('drawer-open');
    if (isOpen) {
      document.body.classList.remove('drawer-open');
      _drawerSection = null;
      setManageWidgetsBtnLabel(false);
    } else {
      openWidgetDrawer(btn.dataset.section);
      setManageWidgetsBtnLabel(true);
    }
  });
});

function getConfigUpdatedAtMs(config) {
  const timestamp = Date.parse(config?.updatedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isLocalConfigNewer(localConfig, remoteConfig) {
  if (!localConfig) return false;
  if (!remoteConfig) return true;
  return getConfigUpdatedAtMs(localConfig) > getConfigUpdatedAtMs(remoteConfig);
}

// ── INIT (async config bootstrap) ────────────────────────────
(async function bootstrapDashboard() {
  let configLoaded = false;

  // 1. Instant: load from localStorage (survives refresh without network)
  const localConfig = DashboardConfig.loadLocal();
  if (localConfig) {
    DashboardConfig.apply(localConfig, state);
    configLoaded = true;
  }

  // 2. Authoritative: load from Cloudflare KV if user is identified
  const userId = localStorage.getItem('trengo_session_user_name');
  if (userId) {
    DashboardConfig.setUserId(userId);
    try {
      const kvConfig = await DashboardConfig.load(userId);
      if (kvConfig) {
        const latestLocalConfig = DashboardConfig.loadLocal();
        if (isLocalConfigNewer(latestLocalConfig, kvConfig)) {
          // Keep the freshest local state and re-sync it instead of overwriting
          // onboarding edits with an older server snapshot.
          DashboardConfig.apply(latestLocalConfig, state);
          DashboardConfig.notifyChanged();
        } else {
          DashboardConfig.apply(kvConfig, state);
          // Update localStorage with the authoritative KV version
          DashboardConfig.saveLocal(kvConfig);
        }
        configLoaded = true;
      }
    } catch (e) {
      console.warn('[bootstrap] KV config load failed, using localStorage fallback:', e);
    }
  }

  if (configLoaded) {
    persistPrototypeTeams('user');
    updateTeamFilterOptions();
    syncRoleToggleButtons();
    // Apply role to body dataset so CSS role selectors work
    if (state.role) document.body.dataset.role = state.role;
    syncLensButtons();
  }

  // Proceed with rendering (whether config loaded or defaults)
  renderTabs();
  renderSections();
  handleHash();
  window.addEventListener('hashchange', handleHash);
  updateSectionsVisibility();
})();

// Set Chart.js defaults
Chart.defaults.font.family = 'Inter';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#71717a';

// ── GUIDE ADAPTER API ────────────────────────────────────────
// Exposes prototype state for the Sidecar panel to render
// settings/admin controls. Used by guide-adapter.js postMessage bridge.
window._prototypeGuideAPI = {
  getSettingsData: function () {
    return {
      role: {
        current: state.personaRole || state.role || 'supervisor',
        options: [
          { value: 'admin', label: 'Admin' },
          { value: 'supervisor', label: 'Supervisor' },
          { value: 'agent', label: 'Agent' }
        ]
      },
      anchorsNavUser: localStorage.getItem(ANCHORS_NAV_USER_KEY) === 'true'
    };
  },
  getAdminData: function () {
    var thresholds = window._confidenceThresholds || {};
    return {
      confidenceSkipSourceGathering: thresholds.confidenceSkipSourceGathering,
      confidenceSkipTeamConfirmation: thresholds.confidenceSkipTeamConfirmation,
      confidenceSkipDecisionGoals: thresholds.confidenceSkipDecisionGoals,
      confidenceSkipSignalFollowup: thresholds.confidenceSkipSignalFollowup,
      confidenceAutoDraft: thresholds.confidenceAutoDraft,
      confidenceSkipDensity: thresholds.confidenceSkipDensity,
      correctionSensitivity: thresholds.correctionSensitivity,
      flags: FEATURE_FLAGS.map(function (f) {
        return {
          id: f.id,
          label: f.label,
          triState: f.triState || null,
          value: getFeatureFlagValue(f.id)
        };
      }),
      actions: [
        { type: 'button-row', header: 'Demo data', buttons: [
          { id: 'edit-customers', label: 'Customers' },
          { id: 'edit-teams', label: 'Teams' }
        ]},
        { type: 'button-row', header: 'Reset prototype', buttons: [
          { id: 'reset-all', label: 'Reset all' }
        ]}
      ]
    };
  },
  setRole: function (role) {
    state.personaRole = role;
    state.role = role;
    document.body.dataset.role = role;
    syncRoleToggleButtons();
    renderTabs();
    renderSections();
    scrollToSection(state.activeSection, true);
    DashboardConfig.notifyChanged();
  },
  setFlag: function (id, value) {
    // Use the existing flag setter which handles localStorage
    setFeatureFlag(id, value);
    // Trigger known side effects
    if (id === 'anchors-nav') {
      var userToggle = localStorage.getItem(ANCHORS_NAV_USER_KEY) === 'true';
      applyNavMode((value !== 'off' || userToggle) ? 'anchors' : 'tabs');
    }
  },
  setAnchorsNavUser: function (checked) {
    if (checked) {
      localStorage.setItem(ANCHORS_NAV_USER_KEY, 'true');
    } else {
      localStorage.removeItem(ANCHORS_NAV_USER_KEY);
    }
    var shouldBeAnchors = isFeatureEnabled('anchors-nav') || checked;
    applyNavMode(shouldBeAnchors ? 'anchors' : 'tabs');
  },
  setToggle: function (key, checked) {
    // Generic toggle handler — routes to specific implementations
    if (key === 'anchorsNavUser') {
      this.setAnchorsNavUser(checked);
    }
  },
  setSlider: function (key, value) {
    // Confidence threshold sliders — persist to localStorage and update global
    if (key in window._confidenceThresholds) {
      window._confidenceThresholds[key] = value;
      localStorage.setItem(CONFIDENCE_THRESHOLDS_KEY, JSON.stringify(window._confidenceThresholds));
    }
  },
  triggerAction: function (actionId) {
    switch (actionId) {
      case 'manage-teams': openTeamSettingsModal(); break;
      case 'add-customer': openCustomerSettingsModal(); break;
      case 'edit-customers': openCustomerSettingsModal(); break;
      case 'edit-teams': openTeamSettingsModal('default'); break;
      case 'reset-all': performResetAll(); break;
      case 'reset-onboarding': performResetOnboarding(); break;
      case 'reset-subnav': performResetSubnav(); break;
    }
  }
};

// ── AI ONBOARDING ASSISTANT INITIALIZATION ───────────────────
if (typeof AdminAssistant !== 'undefined') {
  AdminAssistant.init();
}

// ── ONBOARDING OVERLAY ──────────────────────────────────────
(function() {
  const ONBOARDING_KEY = 'trengo_onboarding_done';
  const AI_SETUP_MODE_KEY = 'trengo_ai_setup_mode';
  const WALKTHROUGH_TITLE = 'Prototype Walkthrough';
  const WALKTHROUGH_SUBTITLE = 'Internal only. Quick context for reviewers providing feedback.';
  const ONBOARDING_STEPS = [
    {
      text: 'This prototype explores a customisable analytics model with five broadly applicable default sections. Focus feedback on the overall structure, logic, and decisions it supports.'
    },
    {
      text: 'Sidecar — the panel on the right — answers concept questions and collects your feedback. Use the icons below its header for settings.'
    },
    {
      text: 'The default navigation is only a starting point. The model is designed to be customised to each company’s language, structure, and priorities. In edit mode, users can also add, remove, reorder, and resize charts.'
    }
  ];

  let onboardingStep = 0;
  const overlay       = document.getElementById('onboarding-overlay');
  const stepsContainer = document.getElementById('onboarding-steps');
  let onboardingBodyText = null;
  let onboardingSkipBtn = null;
  let onboardingNextBtn = null;
  let onboardingDots = [];

  function animateStepText() {
    if (!onboardingBodyText) return;
    onboardingBodyText.classList.remove('onboarding-step-text-enter');
    // Restart the text-only transition for each new message.
    void onboardingBodyText.offsetWidth;
    onboardingBodyText.classList.add('onboarding-step-text-enter');
  }

  function updateControls() {
    if (!onboardingSkipBtn || !onboardingNextBtn) return;
    const isLastStep = onboardingStep === ONBOARDING_STEPS.length - 1;
    onboardingSkipBtn.classList.toggle('hidden', isLastStep);
    onboardingSkipBtn.disabled = isLastStep;
    onboardingNextBtn.innerHTML = isLastStep
      ? '<span class="onboarding-next-text">Done</span><svg class="onboarding-next-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<span class="onboarding-next-text">Next</span><svg class="onboarding-next-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
  }

  function updateDots() {
    onboardingDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === onboardingStep);
    });
  }

  function showStep(index, { animate = true } = {}) {
    onboardingStep = index;
    if (onboardingBodyText) {
      onboardingBodyText.textContent = ONBOARDING_STEPS[index].text;
      if (animate) animateStepText();
      else onboardingBodyText.classList.remove('onboarding-step-text-enter');
    }
    updateControls();
    updateDots();
  }

  function nextOnboardingStep() {
    const nextIndex = onboardingStep + 1;
    if (nextIndex >= ONBOARDING_STEPS.length) {
      closeOnboarding();
      return;
    }
    showStep(nextIndex);
  }

  function closeOnboarding() {
    overlay.classList.add('closing');
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.classList.remove('closing');
      stepsContainer.innerHTML = '';
      onboardingBodyText = null;
      onboardingSkipBtn = null;
      onboardingNextBtn = null;
      onboardingDots = [];
    }, 350);
  }

  function showOnboarding() {
    stepsContainer.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'onboarding-step-card';

    const header = document.createElement('div');
    header.className = 'onboarding-card-header';

    const title = document.createElement('h2');
    title.className = 'onboarding-title';
    title.textContent = WALKTHROUGH_TITLE;

    const subtitle = document.createElement('p');
    subtitle.className = 'onboarding-subtitle';
    subtitle.textContent = WALKTHROUGH_SUBTITLE;

    header.appendChild(title);
    header.appendChild(subtitle);
    card.appendChild(header);

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'onboarding-step-body';

    const bodyTextWrap = document.createElement('div');
    bodyTextWrap.className = 'onboarding-step-text-wrap';

    const body = document.createElement('p');
    body.className = 'onboarding-step-text';
    body.setAttribute('aria-live', 'polite');
    bodyTextWrap.appendChild(body);
    bodyWrap.appendChild(bodyTextWrap);
    card.appendChild(bodyWrap);

    const footer = document.createElement('div');
    footer.className = 'onboarding-card-footer';

    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'onboarding-dots';
    onboardingDots = ONBOARDING_STEPS.map(() => {
      const dot = document.createElement('div');
      dot.className = 'onboarding-dot';
      dotsWrap.appendChild(dot);
      return dot;
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'onboarding-skip';
    skipBtn.innerHTML = 'Skip intro <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    skipBtn.addEventListener('click', closeOnboarding);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'onboarding-next';
    nextBtn.addEventListener('click', nextOnboardingStep);

    footer.appendChild(dotsWrap);
    footer.appendChild(skipBtn);
    footer.appendChild(nextBtn);
    card.appendChild(footer);

    stepsContainer.appendChild(card);
    onboardingBodyText = body;
    onboardingSkipBtn = skipBtn;
    onboardingNextBtn = nextBtn;
    onboardingStep = 0;
    overlay.classList.remove('closing');
    overlay.style.display = 'block';
    showStep(0, { animate: false });
  }

  function initOnboarding() {
    if (localStorage.getItem(ONBOARDING_KEY)) return;
    if (typeof AdminAssistant !== 'undefined' && localStorage.getItem(AI_SETUP_MODE_KEY) !== 'assistant') return;

    // Wait for analytics page to be visible, then show walkthrough
    const waitForReady = () => {
      const analyticsPage = document.getElementById('analytics-page');
      if (analyticsPage && analyticsPage.style.display !== 'none') {
        const overviewContent = document.querySelector('.section-content[data-section="overview"]');
        if (overviewContent && !overviewContent.classList.contains('loaded')) {
          mountSection('overview');
        }
        setTimeout(showOnboarding, 100);
      } else {
        setTimeout(waitForReady, 200);
      }
    };
    setTimeout(waitForReady, 300);
  }

  window.triggerWalkthrough = function() {
    localStorage.removeItem(ONBOARDING_KEY);
    const overviewContent = document.querySelector('.section-content[data-section="overview"]');
    if (overviewContent && !overviewContent.classList.contains('loaded')) mountSection('overview');
    setTimeout(showOnboarding, 300);
  };

  initOnboarding();
})();
