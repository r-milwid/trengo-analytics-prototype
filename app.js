/* ============================================================
   TRENGO ANALYTICS PROTOTYPE — app.js
   ============================================================ */

// ── STATE ──────────────────────────────────────────────────────
const state = {
  currentView: 'landing', // 'landing' | 'analytics'
  lens: 'support',        // 'support' | 'sales'
  role: 'supervisor',     // 'supervisor' | 'agent'
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
  channelFilter: 'All channels',
  teamFilter: 'All teams',
  charts: {},
  mockData: { kpi: {}, lists: {}, tables: {}, charts: {} },
  opportunityStates: {}, // id -> 'dismissed' | 'confirmed'
  chartViewMode: {}      // widgetId -> 'chart' | 'numbers'
};

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

const FEATURE_FLAGS = [
  { id: 'anchors-nav',      label: 'Anchors navigation',      desc: 'Navigate between sections by scrolling instead of tabs' },
  { id: 'team-usecases',   label: 'Team specific usecases',  desc: 'Assign Convert or Resolve usecases per team from a display settings button next to the team filter' },
];

function isFeatureEnabled(id) {
  try {
    const flags = JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}');
    return flags[id] === true;
  } catch { return false; }
}

function setFeatureFlag(id, value) {
  try {
    const flags = JSON.parse(localStorage.getItem(FEATURE_FLAGS_KEY) || '{}');
    flags[id] = value;
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags));
  } catch {}
}

function showHelionAvatar() {
  const btn = document.getElementById('user-flag-btn');
  if (btn) btn.style.display = 'flex';
}

function unlockHelionAccess() {
  if (localStorage.getItem(HELION_UNLOCKED_KEY)) return;
  localStorage.setItem(HELION_UNLOCKED_KEY, 'true');
  showHelionAvatar();
}

// Restore unlock state on page load
if (localStorage.getItem(HELION_UNLOCKED_KEY)) showHelionAvatar();

// Bootstrap nav mode from feature flag (before sections render)
if (isFeatureEnabled('anchors-nav')) state.navMode = 'anchors';

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

// ── WIDGET DEFINITIONS ─────────────────────────────────────────
// vis: 'always' | 'default' | 'hidden'  (base visibility before state logic)
//
// NEW: Each widget can have a `states` object describing per-state overrides.
// Keys are "support_supervisor", "support_agent", "sales_supervisor", "sales_agent".
// Values: 'show' | 'hide' | 'emphasize' | 'deemphasize'
// If a state key is absent the base `vis` applies.
//
// `scopeLabel` — optional object { supervisor: '...', agent: '...' } to swap
//   the KPI sub-label depending on role.
// `tooltipByState` — optional object keyed same as `states` to swap tooltip text.

const WIDGETS = {
  // ─── OVERVIEW ────────────────────
  overview: [
    { id: 'ov-open-tickets', title: 'Open tickets', vis: 'always', type: 'kpi',
      tooltip: 'Total tickets currently open across all channels. A rising number may indicate capacity issues.',
      scopeLabel: { supervisor: 'Across all channels', agent: 'Your open tickets' },
      tooltipByState: {
        support_agent: 'Tickets currently assigned to you. Focus on the oldest first.',
        sales_supervisor: 'Open contacts across the pipeline. Monitor for stale entries.',
        sales_agent: 'Your open contacts. Prioritize those closest to a next step.'
      }
    },
    { id: 'ov-assigned-tickets', title: 'Assigned tickets', vis: 'default', type: 'kpi',
      tooltip: 'Tickets currently assigned to an agent. Compare with open tickets to spot unassigned backlog.',
      scopeLabel: { supervisor: 'Currently assigned', agent: 'Assigned to you' },
      states: { sales_supervisor: 'show', sales_agent: 'show' }
    },
    { id: 'ov-first-response', title: 'First response time', vis: 'default', type: 'kpi',
      tooltip: 'Median time to first agent reply. This directly impacts customer perception of responsiveness.',
      scopeLabel: { supervisor: 'Median — all agents', agent: 'Your median' },
      states: { sales_supervisor: 'deemphasize', sales_agent: 'deemphasize' }
    },
    { id: 'ov-resolution-time', title: 'Resolution time', vis: 'default', type: 'kpi',
      tooltip: 'Median time from ticket creation to resolution. Long times signal process or knowledge gaps.',
      scopeLabel: { supervisor: 'Median — all agents', agent: 'Your median' },
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'ov-tickets-by-hour', title: 'Tickets created by hour', vis: 'default', type: 'bar-chart', fullWidth: true, sizeClass: 'large',
      tooltip: 'Hourly distribution of new tickets. Use this to plan staffing and identify peak demand windows.',
      states: { support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'ov-escalation-rate', title: 'Escalation rate (AI \u2192 human)', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of AI-handled tickets escalated to a human agent. Rising rates suggest knowledge or confidence gaps in AI.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'ov-intent-trends', title: 'Intent trend highlights', vis: 'default', type: 'list',
      tooltip: 'Top rising and declining customer intents. Helps you anticipate demand shifts before they become critical.',
      drill: { label: 'See why \u2192', target: 'understand' },
      states: { support_agent: 'hide', sales_supervisor: 'emphasize', sales_agent: 'hide' }
    },
    { id: 'ov-knowledge-gaps', title: 'Knowledge gap alerts', vis: 'hidden', type: 'kpi',
      tooltip: 'Count of unresolved or fallback cases where the AI lacked sufficient knowledge to respond.',
      drill: { label: 'Improve this \u2192', target: 'improve' },
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'ov-exceptions', title: 'Exceptions requiring attention', vis: 'hidden', type: 'list',
      tooltip: 'System-detected anomalies or risks that may need immediate attention.',
      drill: { label: 'Check automation \u2192', target: 'automate' },
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
  ],
  // ─── UNDERSTAND ──────────────────
  understand: [
    { id: 'un-tickets-created', title: 'Tickets created', vis: 'always', type: 'line-chart', halfWidth: true,
      tooltip: 'Trend of new tickets created over the selected period.',
      states: { sales_supervisor: 'deemphasize', sales_agent: 'hide' }
    },
    { id: 'un-entry-channels', title: 'Entry channels', vis: 'always', type: 'bar-chart', halfWidth: true,
      tooltip: 'Distribution of tickets and contacts by channel (email, WhatsApp, chat, etc.).',
      tooltipByState: {
        sales_supervisor: 'Which channels bring in new contacts and pipeline entries.',
        sales_agent: 'Where your contacts are coming from.'
      }
    },
    { id: 'un-new-returning', title: 'New vs returning contacts', vis: 'default', type: 'doughnut-chart',
      tooltip: 'Proportion of first-time vs repeat contacts. High repeat rates may indicate unresolved issues.',
      states: { sales_supervisor: 'emphasize', sales_agent: 'show' }
    },
    { id: 'un-intent-clusters', title: 'Intent clusters', vis: 'default', type: 'bar-chart', halfWidth: true, sizeClass: 'large',
      tooltip: 'Primary reasons customers contact you, clustered by AI classification.',
      states: { support_agent: 'hide', sales_supervisor: 'emphasize', sales_agent: 'hide' }
    },
    { id: 'un-intent-trends', title: 'Intent trends over time', vis: 'default', type: 'line-chart', fullWidth: true, sizeClass: 'large',
      tooltip: 'How top intents change over time. Use this to spot emerging patterns.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'un-emerging-intents', title: 'Emerging intents', vis: 'hidden', type: 'list',
      tooltip: 'New or rapidly growing intent clusters that have appeared recently.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'un-unknown-intents', title: 'Unknown / unclassified intents', vis: 'default', type: 'kpi',
      tooltip: 'Tickets the AI could not classify. These represent gaps in your intent model.',
      states: { support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'un-escalations-intent', title: 'Escalations by intent', vis: 'hidden', type: 'bar-chart',
      tooltip: 'Which intents most frequently result in escalation. Shows where understanding breaks down.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
  ],
  // ─── OPERATE ─────────────────────
  operate: [
    { id: 'op-first-response', title: 'First response time', vis: 'always', type: 'kpi',
      tooltip: 'Median first response time for the selected period.',
      scopeLabel: { supervisor: 'Median — all agents', agent: 'Your median' },
      states: { sales_supervisor: 'deemphasize', sales_agent: 'deemphasize' }
    },
    { id: 'op-resolution-time', title: 'Resolution time (tickets)', vis: 'always', type: 'kpi',
      tooltip: 'Median resolution time across all closed tickets.',
      scopeLabel: { supervisor: 'Median — all agents', agent: 'Your median' },
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-created-closed', title: 'Created tickets vs Closed tickets', vis: 'default', type: 'line-chart', fullWidth: true, sizeClass: 'large',
      tooltip: 'Compare inflow vs outflow. A widening gap means your backlog is growing.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-reopened', title: 'Reopened tickets', vis: 'default', type: 'kpi',
      tooltip: 'Tickets that were reopened after being marked resolved. High numbers suggest premature closures.',
      scopeLabel: { supervisor: 'Reopened this period', agent: 'Your reopened tickets' },
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-workload-agent', title: 'Workload by agent', vis: 'default', type: 'table', fullWidth: true, sizeClass: 'large',
      tooltip: 'Per-agent breakdown of key operational metrics.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-sla-compliance', title: 'SLA compliance', vis: 'default', type: 'progress',
      tooltip: 'Percentage of tickets meeting SLA targets for response and resolution.',
      scopeLabel: { supervisor: '87% of tickets within SLA', agent: '91% of your tickets within SLA' },
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-bottlenecks', title: 'Bottlenecks by status or stage', vis: 'always', type: 'bar-chart',
      tooltip: 'Where tickets are getting stuck in your workflow.',
      states: { support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' },
      tooltipByState: { sales_supervisor: 'Where contacts are getting stuck in your pipeline stages.' }
    },
    { id: 'op-capacity-demand', title: 'Capacity vs demand', vis: 'hidden', type: 'line-chart', halfWidth: true,
      tooltip: 'Volume of incoming work vs available agent capacity. Gaps indicate understaffing.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
  ],
  // ─── IMPROVE ─────────────────────
  improve: [
    { id: 'im-csat', title: 'CSAT score', vis: 'always', type: 'kpi',
      tooltip: 'Customer Satisfaction score from survey responses.',
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-response-rate', title: 'Response rate', vis: 'always', type: 'kpi',
      tooltip: 'Percentage of delivered surveys that received a response.',
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-responses', title: 'Positive responses / Neutral responses / Negative responses', vis: 'default', type: 'kpi-group',
      tooltip: 'Breakdown of survey responses by sentiment.',
      states: { support_agent: 'show', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-satisfaction-score', title: 'Satisfaction score', vis: 'default', type: 'line-chart', halfWidth: true, sizeClass: 'large',
      tooltip: 'CSAT trend over the selected period alongside survey volume.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-surveys', title: 'Surveys received', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'Number of surveys received per day.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-reopen-rate', title: 'Reopen rate', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of resolved tickets that get reopened. A quality indicator.',
      scopeLabel: { supervisor: 'Of resolved tickets', agent: 'Of your resolved tickets' },
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-knowledge-gaps', title: 'Knowledge gaps by intent', vis: 'hidden', type: 'bar-chart',
      tooltip: 'Which intents have the most knowledge gaps, driving poor outcomes.',
      states: { support_agent: 'show', sales_supervisor: 'hide', sales_agent: 'hide' },
      tooltipByState: { support_agent: 'Knowledge gaps you encountered most often.' }
    },
    { id: 'im-suggested-knowledge', title: 'Suggested knowledge additions', vis: 'default', type: 'list-actions', halfWidth: true,
      tooltip: 'AI-suggested knowledge base articles to fill gaps. Approve or reject each suggestion.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-opportunities', title: 'Opportunities backlog', vis: 'always', type: 'opportunities', fullWidth: true, sizeClass: 'large',
      tooltip: 'Prioritized list of improvement opportunities identified by AI analysis.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
  ],
  // ─── AUTOMATE ────────────────────
  automate: [
    { id: 'au-ai-tickets', title: 'AI Agent tickets', vis: 'always', type: 'kpi',
      tooltip: 'Total tickets handled or touched by AI agents.',
      scopeLabel: { supervisor: 'AI-handled tickets', agent: 'AI-handled on your behalf' },
      states: { sales_supervisor: 'show', sales_agent: 'show' }
    },
    { id: 'au-resolution-rate', title: 'Resolution rate (AI Agents)', vis: 'always', type: 'kpi',
      tooltip: 'Percentage of AI-handled tickets fully resolved without human intervention.',
      states: { support_agent: 'deemphasize', sales_agent: 'deemphasize' }
    },
    { id: 'au-assistance-rate', title: 'Assistance rate (AI Agents)', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of tickets where AI assisted but did not fully resolve.',
      states: { support_agent: 'show', sales_agent: 'show' }
    },
    { id: 'au-open-ticket-rate', title: 'Open ticket rate (AI Agents)', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of AI-assigned tickets still open without a response.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'au-journeys-success', title: 'Journeys success ratio', vis: 'default', type: 'progress',
      tooltip: 'Percentage of automation journeys that complete successfully.',
      states: { support_agent: 'hide', sales_supervisor: 'emphasize', sales_agent: 'hide' }
    },
    { id: 'au-journeys-escalations', title: 'Journeys escalations', vis: 'default', type: 'kpi',
      tooltip: 'Number of automation journeys that resulted in escalation to a human.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'au-handoff-reasons', title: 'Automation handoff reasons', vis: 'default', type: 'bar-chart', halfWidth: true, sizeClass: 'large',
      tooltip: 'Why automation stopped and handed off to a human agent.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'au-conflicts', title: 'Automation conflicts', vis: 'hidden', type: 'list',
      tooltip: 'Cases where journeys and AI agents produced conflicting actions.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'au-safety', title: 'Safety and guardrail violations', vis: 'hidden', type: 'list',
      tooltip: 'Intentional stops triggered by safety guardrails in automation.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
  ],
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

  // Drag handle
  card.innerHTML = `
    <div class="drag-handle" title="Drag to reorder">
      <span></span><span></span><span></span><span></span><span></span><span></span>
    </div>
    <div class="resize-handle" title="Drag to resize"></div>
  `;

  // Header
  const header = document.createElement('div');
  header.className = 'widget-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'widget-title';
  titleEl.textContent = w.title;

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

  if (w.vis !== 'always') {
    const hideBtn = document.createElement('button');
    hideBtn.className = 'widget-action-btn';
    hideBtn.title = 'Hide widget';
    hideBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>';
    hideBtn.addEventListener('click', () => {
      hideWidget(w.id, section);
      window.sendEvent('"' + w.title + '" widget — hidden');
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
      window.sendEvent('"' + w.title + '" widget — ' + mode + ' view');
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
    case 'table': renderTable(body, w); break;
    case 'list': renderList(body, w); break;
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
      window.sendEvent('"' + w.title + '" widget — ' + (isExpanded ? 'expanded' : 'collapsed'));
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
      window.sendEvent('"' + w.drill.label + '" drill link — clicked');
    });
    card.appendChild(drill);
  }

  const dragHandle = card.querySelector('.drag-handle');
  dragHandle.addEventListener('pointerdown', (e) => {
    if (document.body.dataset.viewmode === 'view') return;
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
    const usecase = (state.teamUsecases && state.teamUsecases[state.teamFilter]) || 'resolve';
    return usecase === 'convert' ? 'sales' : 'support';
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
  const overridden = state.teamFilter && state.teamFilter !== 'All teams';
  document.querySelectorAll('#popout-lens-toggle .lens-preview-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lens === effectiveLens);
    b.style.opacity = overridden ? '0.45' : '';
    b.style.pointerEvents = overridden ? 'none' : '';
  });
}

function getStateOverride(w) {
  if (!w.states) return null;
  return w.states[stateKey()] || null;
}

function getEffectiveVisibility(w) {
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
  const stateOverride = getStateOverride(w);
  if (stateOverride === 'hide') return false;
  const effectiveVis = getEffectiveVisibility(w);
  const isAdded = state.addedWidgets.has(w.id);
  if (effectiveVis === 'hidden' && !isAdded) return false;
  if (state.hiddenWidgets.has(w.id)) return false;
  return true;
}

function getWidgetById(sectionId, id) {
  return (WIDGETS[sectionId] || []).find(w => w.id === id);
}

function ensureSectionOrder(sectionId) {
  if (!state.sectionOrder[sectionId]) {
    state.sectionOrder[sectionId] = (WIDGETS[sectionId] || []).map(w => w.id);
  }
}

function resetViewState() {
  state.hiddenWidgets = new Set();
  state.addedWidgets = new Set();
  state.widgetSpans = {};
  state.sectionLayout = {};
  if (state.expandedWidgets) state.expandedWidgets = new Set();
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
  Object.keys(layout.placements).forEach(id => {
    const w = getWidgetById(sectionId, id);
    if (!w || !isWidgetRenderable(w)) {
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

  card.classList.add('dragging');
  const ghost = card.cloneNode(true);
  ghost.classList.remove('dragging');
  ghost.classList.add('drag-ghost');
  // Preserve chart visuals in ghost by swapping canvases with images
  const origCanvases = card.querySelectorAll('canvas');
  const ghostCanvases = ghost.querySelectorAll('canvas');
  origCanvases.forEach((c, i) => {
    const gc = ghostCanvases[i];
    if (!gc) return;
    try {
      const img = document.createElement('img');
      img.src = c.toDataURL('image/png');
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.display = 'block';
      gc.parentNode.replaceChild(img, gc);
    } catch (_) {
      // If canvas is tainted or unavailable, keep the empty canvas
    }
  });
  ghost.style.width = `${card.getBoundingClientRect().width}px`;
  ghost.style.height = `${card.getBoundingClientRect().height}px`;
  document.body.appendChild(ghost);
  dragState.ghost = ghost;
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;

  const placeholder = document.createElement('div');
  placeholder.className = 'drag-placeholder';
  placeholder.dataset.row = dragState.targetRow;
  placeholder.style.gridColumn = `${dragState.targetCol + 1} / span ${dragState.span}`;
  placeholder.style.gridRow = dragState.targetRow + 1;
  grid.appendChild(placeholder);
  dragState.placeholder = placeholder;

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(e) {
  if (!dragState.active) return;
  e.preventDefault();
  if (dragState.ghost) {
    dragState.ghost.style.left = `${e.clientX}px`;
    dragState.ghost.style.top = `${e.clientY}px`;
  }
  const sectionId = dragState.sectionId;
  const layout = state.sectionLayout[sectionId];
  if (!layout) return;
  const gridRect = dragState.gridEl.getBoundingClientRect();
  const rowRects = buildRowRects(sectionId, dragState.gridEl, layout);
  let targetRow = null;
  for (let i = 0; i < rowRects.length; i++) {
    const r = rowRects[i];
    if (!r) continue;
    if (e.clientY >= r.top && e.clientY <= r.bottom) {
      targetRow = i;
      break;
    }
  }
  if (targetRow === null) {
    if (rowRects.length === 0 || e.clientY > (rowRects[rowRects.length - 1]?.bottom || gridRect.bottom)) {
      targetRow = rowRects.length; // new row at end
    } else {
      targetRow = 0;
    }
  }

  let targetCol = 0;
  if (targetRow < layout.rows.length) {
    const row = layout.rows[targetRow].slice();
    // free dragged widget cells if in this row
    row.forEach((v, idx) => {
      if (v === dragState.widgetId) row[idx] = null;
    });
    const colW = gridRect.width / 12;
    const colGuess = Math.max(0, Math.min(11, Math.floor((e.clientX - gridRect.left) / colW)));
    const col = findSlotNear(row, dragState.span, colGuess);
    if (col === -1) return;
    targetCol = col;
  } else {
    targetCol = 0;
  }

  dragState.targetRow = targetRow;
  dragState.targetCol = targetCol;
  if (dragState.placeholder) {
    dragState.placeholder.dataset.row = targetRow;
    dragState.placeholder.style.gridRow = targetRow + 1;
    dragState.placeholder.style.gridColumn = `${targetCol + 1} / span ${dragState.span}`;
  }
}

function onDragEnd() {
  if (!dragState.active) return;
  const sectionId = dragState.sectionId;
  const layout = state.sectionLayout[sectionId];
  const placement = layout && layout.placements[dragState.widgetId];

  if (layout && placement) {
    const oldRow = layout.rows[placement.row];
    for (let c = placement.col; c < placement.col + placement.span; c++) {
      if (oldRow[c] === dragState.widgetId) oldRow[c] = null;
    }

    let targetRow = dragState.targetRow;
    let targetCol = dragState.targetCol;
    if (targetRow >= layout.rows.length) {
      const newRow = Array.from({ length: 12 }, () => null);
      for (let c = targetCol; c < targetCol + dragState.span; c++) newRow[c] = dragState.widgetId;
      layout.rows.push(newRow);
      placement.row = layout.rows.length - 1;
      placement.col = targetCol;
    } else {
      const row = layout.rows[targetRow];
      for (let c = targetCol; c < targetCol + dragState.span; c++) row[c] = dragState.widgetId;
      placement.row = targetRow;
      placement.col = targetCol;
    }
  }

  if (dragState.placeholder) dragState.placeholder.remove();
  if (dragState.ghost) dragState.ghost.remove();
  if (dragState.cardEl) dragState.cardEl.classList.remove('dragging');
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

  remountSection(sectionId);
  window.removeEventListener('pointermove', onDragMove);
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
  container.innerHTML = `
    <div class="kpi-value">${data.value}</div>
    <div class="kpi-sub">${subText}</div>
    <div class="kpi-trend ${data.trend.dir}">
      ${data.trend.dir === 'up' ? '\u2191' : '\u2193'} ${data.trend.val}%
      <span style="color:var(--gray-400);margin-left:4px">${getPrevPeriodLabel()}</span>
    </div>
  `;
}

function renderKPIGroup(container, w) {
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
    'ov-open-tickets':     { value: '16,610', sub: 'Across all channels', trend: pickTrend() },
    'ov-assigned-tickets': { value: '1,183', sub: 'Currently assigned', trend: pickTrend() },
    'ov-first-response':   { value: '27m 35s', sub: 'Median', trend: pickTrend() },
    'ov-resolution-time':  { value: '25h 35m', sub: 'Median', trend: pickTrend() },
    'ov-escalation-rate':  { value: '8.7%', sub: 'AI \u2192 human handoff', trend: pickTrend() },
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
    'au-resolution-rate':  { value: '30.1%', sub: '4,159 tickets resolved', trend: { val: 8.7, dir: 'up' } },
    'au-assistance-rate':  { value: '35.9%', sub: '4,964 tickets assisted', trend: { val: 3.8, dir: 'down' } },
    'au-open-ticket-rate': { value: '48', sub: 'No response yet', trend: { val: 5, dir: 'down' } },
    'au-journeys-escalations': { value: '312', sub: 'Escalated from journeys', trend: pickTrend() },
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
            backgroundColor: '#18181b',
            titleFont: { family: 'Inter', size: 12 },
            bodyFont: { family: 'Inter', size: 12 },
            padding: 10,
            cornerRadius: 6,
            usePointStyle: true,
            callbacks: {
              labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
              labelColor(context) {
                const bg = context.chart.data.datasets[0]?.backgroundColor || [];
                const colour = Array.isArray(bg) ? bg[context.dataIndex] : bg;
                return { borderColor: colour, backgroundColor: colour, borderWidth: 0 };
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
  const data = {
    labels: ['New contacts', 'Returning contacts'],
    datasets: [{ data: [62, 38], backgroundColor: [CHART_COLORS.teal, CHART_COLORS.periwinkle], borderWidth: 0 }]
  };
  state.mockData.charts[id] = data;
  return cloneData(data);
}

function chartOptions(w) {
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
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
        backgroundColor: '#18181b',
        titleFont: { family: 'Inter', size: 12 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 10,
        cornerRadius: 6,
        usePointStyle: true,
        callbacks: {
          labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
          labelColor(context) {
            const ds = context.chart.data.datasets[context.datasetIndex];
            const colour = ds.borderColor ||
              (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[context.dataIndex] : ds.backgroundColor) ||
              '#fff';
            return { borderColor: colour, backgroundColor: colour, borderWidth: 0 };
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#71717a' }
      },
      y: {
        grid: { color: '#f3f3f4' },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#71717a' },
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
          { label: 'Today', data: hours.map(() => rand(2, 75)), backgroundColor: CHART_COLORS.teal, borderRadius: 3 },
          { label: 'Average', data: hours.map(() => rand(5, 40)), backgroundColor: CHART_COLORS.gray, borderRadius: 3 }
        ]
      };
      break;
    case 'un-entry-channels':
      data = {
        labels: channels,
        datasets: [
          { label: 'Tickets', data: channels.map(() => rand(200, 1200)), backgroundColor: CHART_COLORS.teal, borderRadius: 3 },
          { label: 'Contacts', data: channels.map(() => rand(100, 800)), backgroundColor: CHART_COLORS.blue, borderRadius: 3 }
        ]
      };
      break;
    case 'un-intent-clusters':
      data = {
        labels: intents,
        datasets: [{ label: 'Tickets', data: intents.map(() => rand(100, 900)), backgroundColor: paletteCycle(intents.length), borderRadius: 3 }]
      };
      break;
    case 'un-escalations-intent':
      data = {
        labels: intents.slice(0, 5),
        datasets: [{ label: 'Escalations', data: [rand(50,200), rand(40,150), rand(30,120), rand(20,100), rand(10,80)], backgroundColor: paletteCycle(5), borderRadius: 3 }]
      };
      break;
    case 'im-surveys':
      data = {
        labels: labels7,
        datasets: [{ label: 'Surveys received', data: labels7.map(() => rand(2, 12)), backgroundColor: CHART_COLORS.periwinkle, borderRadius: 3 }]
      };
      break;
    case 'im-knowledge-gaps':
      data = {
        labels: intents.slice(0, 5),
        datasets: [{ label: 'Knowledge gaps', data: [rand(10,50), rand(8,40), rand(5,35), rand(3,25), rand(2,15)], backgroundColor: paletteCycle(5), borderRadius: 3 }]
      };
      break;
    case 'op-bottlenecks':
      data = {
        labels: ['New', 'Awaiting reply', 'In progress', 'On hold', 'Pending close'],
        datasets: [{ label: 'Tickets', data: [rand(200,800), rand(300,1000), rand(100,500), rand(50,300), rand(20,100)], backgroundColor: paletteCycle(5), borderRadius: 3 }]
      };
      break;
    case 'au-handoff-reasons':
      data = {
        labels: handoffReasons,
        datasets: [{ label: 'Count', data: handoffReasons.map(() => rand(30, 400)), backgroundColor: [CHART_COLORS.purple, CHART_COLORS.blue, CHART_COLORS.teal, CHART_COLORS.yellow, CHART_COLORS.periwinkle], borderRadius: 3 }]
      };
      break;
    default:
      data = {
        labels: labels7,
        datasets: [{ label: 'Count', data: labels7.map(() => rand(50, 500)), backgroundColor: CHART_COLORS.teal, borderRadius: 3 }]
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
          borderColor: CHART_COLORS.teal, backgroundColor: 'rgba(31,157,139,.12)', fill: true, tension: .3, pointRadius: 3
        }]
      };
      break;
    case 'un-intent-trends':
      data = {
        labels,
        datasets: [
          { label: 'Pricing', data: labels.map(() => rand(80,200)), borderColor: CHART_COLORS.purple, tension: .3, pointRadius: 2 },
          { label: 'Shipping', data: labels.map(() => rand(60,180)), borderColor: CHART_COLORS.teal, tension: .3, pointRadius: 2 },
          { label: 'Returns', data: labels.map(() => rand(40,150)), borderColor: CHART_COLORS.yellow, tension: .3, pointRadius: 2 },
        ]
      };
      break;
    case 'op-created-closed':
      data = {
        labels,
        datasets: [
          { label: 'Created tickets', data: [rand(800,1100), rand(300,500), rand(600,900), rand(800,1000), rand(400,600), rand(100,250), rand(150,300)], borderColor: CHART_COLORS.teal, tension: .3, pointRadius: 3 },
          { label: 'Closed tickets', data: [rand(700,1000), rand(250,450), rand(500,800), rand(700,950), rand(350,550), rand(80,200), rand(120,280)], borderColor: CHART_COLORS.periwinkle, tension: .3, pointRadius: 3 },
        ]
      };
      break;
    case 'op-capacity-demand':
      data = {
        labels,
        datasets: [
          { label: 'Demand (tickets)', data: labels.map(() => rand(400,900)), borderColor: CHART_COLORS.yellow, tension: .3, pointRadius: 3 },
          { label: 'Capacity (agents)', data: labels.map(() => rand(500,700)), borderColor: CHART_COLORS.teal, borderDash: [5,3], tension: .3, pointRadius: 3 },
        ]
      };
      break;
    case 'im-satisfaction-score':
      data = {
        labels,
        datasets: [
          { label: 'Score', data: [92, 80, 95, 88, 85, 78, 90], borderColor: CHART_COLORS.navy, tension: .3, pointRadius: 3, yAxisID: 'y' },
          { label: 'Surveys', data: [5, 8, 3, 4, 2, 6, 10], borderColor: CHART_COLORS.periwinkle, type: 'bar', backgroundColor: 'rgba(178,189,223,.45)', yAxisID: 'y1' },
        ]
      };
      break;
    default:
      data = {
        labels,
        datasets: [{ label: 'Value', data: labels.map(() => rand(100,800)), borderColor: CHART_COLORS.teal, tension: .3, pointRadius: 3 }]
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
    if (!state.mockData.tables[w.id]) {
      const agents = ['Victor Montala', 'Greg Aquino', 'Isabella Escobar', 'Federico Lai', 'Donovan van der Weerd', 'Deborah Pia', 'Rowan Milwid', 'Dmytro Hachok'];
      state.mockData.tables[w.id] = agents.map(a => ({
        agent: a,
        assigned: rand(20,200),
        firstResponse: `${rand(5,60)}m ${rand(0,59)}s`,
        totalResolution: `${rand(1,48)}h ${rand(0,59)}m`,
        closed: rand(10,180),
        messages: rand(50,500),
        comments: rand(5,80),
      }));
    }
    const rows = state.mockData.tables[w.id];
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
  }
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
        <button class="btn btn-sm btn-secondary btn-danger" onclick="this.closest('.list-item').style.opacity='0.4'; this.parentElement.innerHTML='<span class=\\'badge badge-red\\'>Rejected</span>'">Reject</button>
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
  window.sendEvent('Opportunity dismissed');
};

window.actionOpportunity = function(id, source) {
  window.sendEvent('Opportunity actioned');
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
    window.sendEvent('AI recommendation confirmed — draft article created');
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

  // Count widgets that could be added via the drawer (not currently visible on the grid)
  const allWidgets = WIDGETS[sectionId] || [];
  const hiddenCount = allWidgets.filter(w => {
    if (getStateOverride(w) === 'hide') return false; // not available in this role/lens
    if (w.vis === 'always') return false; // always visible, can't be toggled
    const isVisible = !state.hiddenWidgets.has(w.id) &&
      (getEffectiveVisibility(w) !== 'hidden' || state.addedWidgets.has(w.id));
    return !isVisible;
  }).length;
  if (emptyTiles.length > 0) {
    emptyTiles.forEach(tile => {
      const empty = document.createElement('div');
      empty.className = 'empty-tile';
      if (hiddenCount > 0) {
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
  } else if (hiddenCount >= 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-tile';
    if (hiddenCount > 0) {
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
  state.loadedSections.delete(sectionId);
  // Destroy charts for this section
  const widgets = WIDGETS[sectionId] || [];
  widgets.forEach(w => {
    if (state.charts[w.id]) {
      state.charts[w.id].destroy();
      delete state.charts[w.id];
    }
  });
  mountSection(sectionId);
}

// ── HIDE / ADD WIDGETS ─────────────────────────────────────────
function hideWidget(id, section) {
  state.hiddenWidgets.add(id);
  remountSection(section);
}

let _drawerSection = null;

window.openWidgetDrawer = function(sectionId) {
  _drawerSection = sectionId;
  const body = document.getElementById('drawer-body');
  document.body.classList.add('drawer-open');
  // Collapse chat panel to bar when widget drawer opens
  if (window.setPanelState && document.body.dataset.panel !== 'bar') {
    window.setPanelState('bar');
  }

  let html = '';
  const renderSection = (secId, label) => {
    const widgets = WIDGETS[secId] || [];
    if (!widgets.length) return;
    html += `<div style="margin:12px 0 6px;font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.04em;">${label}</div>`;
    widgets.forEach(w => {
      const effVis = getEffectiveVisibility(w);
      const isVisible = !state.hiddenWidgets.has(w.id) && (effVis !== 'hidden' || state.addedWidgets.has(w.id));
      const isStateHidden = getStateOverride(w) === 'hide';
      const canToggle = w.vis !== 'always' && !isStateHidden;
      const statusText = isStateHidden ? 'Not available in this view' : (w.vis === 'always' ? 'Always visible' : isVisible ? 'Visible' : 'Hidden');
      const typeIcon = {
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
      }[w.type] || `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>`;
      html += `<div class="drawer-widget-item${canToggle ? ' drawer-widget-item--toggleable' : ''}" ${isStateHidden ? 'style="opacity:.4"' : ''} ${canToggle ? `onclick="this.querySelector('button').click()"` : ''}>
        <div class="drawer-widget-icon">${typeIcon}</div>
        <div class="drawer-widget-info">
          <div class="drawer-widget-name">${w.title}</div>
          <div class="drawer-widget-status">${statusText}</div>
        </div>
        ${canToggle ? `<button class="btn btn-sm ${isVisible ? 'btn-secondary' : 'btn-primary'}" onclick="event.stopPropagation();toggleWidgetFromDrawer('${w.id}', '${secId}', ${isVisible})">${isVisible ? 'Hide' : 'Add'}</button>` : ''}
      </div>`;
    });
  };

  if (!sectionId || !WIDGETS[sectionId]) {
    renderSection('overview', 'Overview');
    renderSection('understand', 'Understand');
    renderSection('operate', 'Operate');
    renderSection('improve', 'Improve');
    renderSection('automate', 'Automate');
  } else {
    renderSection(sectionId, sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
  }

  body.innerHTML = html;
};

window.toggleWidgetFromDrawer = function(id, section, currentlyVisible) {
  if (currentlyVisible) {
    state.hiddenWidgets.add(id);
    state.addedWidgets.delete(id);
  } else {
    state.hiddenWidgets.delete(id);
    state.addedWidgets.add(id);
  }
  remountSection(section);
  openWidgetDrawer(section); // Refresh drawer
  const w = (WIDGETS[section] || []).find(x => x.id === id);
  const title = w ? w.title : id;
  window.sendEvent('"' + title + '" widget — ' + (currentlyVisible ? 'hidden' : 'added'));
};

const ICON_PLUS  = `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_CLOSE = `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`;

function setManageWidgetsBtnLabel(open) {
  document.querySelectorAll('.add-widget-btn').forEach(btn => {
    btn.innerHTML = (open ? ICON_CLOSE : ICON_PLUS) + (open ? ' Close widgets' : ' Manage widgets');
  });
}

document.getElementById('drawer-close').addEventListener('click', () => {
  document.body.classList.remove('drawer-open');
  _drawerSection = null;
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
  tooltipEl.style.top = (rect.bottom + 8) + 'px';
  tooltipEl.style.left = (rect.left - 100) + 'px';
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
    window.location.hash = '#analytics';
    // After showing, set up observers
    setTimeout(() => {
      teardownSentinels();
      setupSentinels();
      teardownSectionObserver();
      setupSectionObserver();
      if (state.navMode === 'anchors') {
        resetLazySections();
      }
    }, 50);
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
      window.sendEvent('Analytics nav — clicked');
    } else {
      // Other items: do nothing (look real but inert)
      const label = item.querySelector('.nav-tooltip')?.textContent?.trim();
      if (label) window.sendEvent(label + ' nav — clicked');
    }
  });
});

// Sub-nav clicks
document.querySelectorAll('.sub-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    scrollToSection(btn.dataset.section, true);
    const name = btn.dataset.section.charAt(0).toUpperCase() + btn.dataset.section.slice(1);
    window.sendEvent(name + ' tab — clicked');
    // Update widget drawer content if it's open
    if (document.body.classList.contains('drawer-open')) {
      openWidgetDrawer(btn.dataset.section);
    }
  });
});

// ── LENS & ROLE TOGGLES ───────────────────────────────────────
document.querySelectorAll('#popout-lens-toggle .lens-preview-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.lens = btn.dataset.lens;
    resetViewState();
    // Snapshot then remount — Set is mutated during remount so we must copy first
    [...state.loadedSections].forEach(s => remountSection(s));
    syncLensButtons();
    window.sendEvent(btn.textContent.trim() + ' lens — selected');
  });
});

document.querySelectorAll('#role-toggle .role-preview-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.role = btn.dataset.role;
    document.querySelectorAll('#role-toggle .role-preview-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    resetViewState();
    // Snapshot then remount — Set is mutated during remount so we must copy first
    [...state.loadedSections].forEach(s => remountSection(s));
    const roleName = btn.dataset.role.charAt(0).toUpperCase() + btn.dataset.role.slice(1);
    window.sendEvent(roleName + ' role — selected');
  });
});


// ── VIEW / EDIT MODE ────────────────────────────────────────────
const headerViewEditControl = document.getElementById('header-viewedit-control');
const headerSegmentToggle   = document.getElementById('header-segment-toggle');

function setViewEditMode(mode) {
  document.querySelectorAll('#header-segment-toggle .header-segment-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === mode);
  });
  if (mode === 'view') {
    document.body.dataset.viewmode = 'view';
  } else {
    delete document.body.dataset.viewmode;
  }
}

document.querySelectorAll('#editmode-mode-toggle .editmode-preview-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#editmode-mode-toggle .editmode-preview-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const enabled = btn.dataset.editmode === 'enabled';
    if (enabled) {
      headerViewEditControl.style.display = '';
      setViewEditMode('edit');
    } else {
      headerViewEditControl.style.display = 'none';
      delete document.body.dataset.viewmode;
    }
    window.sendEvent('View/Edit mode — ' + (enabled ? 'enabled' : 'disabled'));
  });
});

// Default: View/Edit mode enabled on load
headerViewEditControl.style.display = '';
setViewEditMode('edit');

if (headerSegmentToggle) {
  headerSegmentToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.header-segment-btn');
    if (!btn) return;
    setViewEditMode(btn.dataset.view);
    window.sendEvent('View/Edit — ' + btn.dataset.view + ' selected');
  });
}

// User popout toggle (triggered by settings cog)
const settingsNav = document.getElementById('settings-nav');
const userPopout = document.getElementById('user-popout');
const userPopoutClose = document.getElementById('user-popout-close');
if (settingsNav && userPopout) {
  settingsNav.addEventListener('click', (e) => {
    e.stopPropagation();
    if (userPopout.style.display === 'block') {
      userPopout.classList.remove('open');
      setTimeout(() => { userPopout.style.display = 'none'; }, 200);
    } else {
      // Position popout next to the settings cog
      const rect = settingsNav.getBoundingClientRect();
      userPopout.style.top = rect.top + 'px';
      userPopout.style.display = 'block';
      requestAnimationFrame(() => userPopout.classList.add('open'));
      window.sendEvent('Settings / Preview options — opened');
    }

  });
}
if (userPopoutClose) {
  userPopoutClose.addEventListener('click', () => {
    userPopout.classList.remove('open');
    setTimeout(() => { userPopout.style.display = 'none'; }, 200);
  });
}
document.addEventListener('click', (e) => {
  if (!userPopout) return;
  if (userPopout.style.display === 'block' && !userPopout.contains(e.target) && !settingsNav.contains(e.target)) {
    userPopout.classList.remove('open');
    setTimeout(() => { userPopout.style.display = 'none'; }, 200);
  }
});
// Reset onboarding button
const resetOnboardingBtn = document.getElementById('reset-onboarding-btn');
if (resetOnboardingBtn) {
  resetOnboardingBtn.addEventListener('click', () => {
    localStorage.removeItem('trengo_onboarding_done');
    resetOnboardingBtn.textContent = 'Walkthrough reset ✓';
    setTimeout(() => { location.reload(); }, 800);
  });
}

// Ensure popout starts hidden (no auto-open)
window.addEventListener('load', () => {
  if (!userPopout) return;
  userPopout.classList.remove('open');
  userPopout.style.display = 'none';
});

// ── FEATURE FLAG POPOUT ─────────────────────────────────────────
const flagBtn    = document.getElementById('user-flag-btn');
const flagPopout = document.getElementById('feature-flag-popout');
const flagClose  = document.getElementById('flag-popout-close');

function renderFlagList() {
  const list = document.getElementById('flag-list');
  if (!list) return;
  list.innerHTML = FEATURE_FLAGS.map(f => `
    <div class="flag-item">
      <div>
        <div class="flag-label">${f.label}</div>
        <div class="flag-desc">${f.desc}</div>
      </div>
      <label class="flag-toggle" title="${f.label}">
        <input type="checkbox" data-flag="${f.id}"${isFeatureEnabled(f.id) ? ' checked' : ''}>
        <span class="flag-track"></span>
      </label>
    </div>`).join('');
  list.querySelectorAll('.flag-toggle input').forEach(cb => {
    cb.addEventListener('change', () => {
      setFeatureFlag(cb.dataset.flag, cb.checked);
      // Flags with immediate side-effects
      if (cb.dataset.flag === 'anchors-nav') {
        applyNavMode(cb.checked ? 'anchors' : 'tabs');
      }
      if (cb.dataset.flag === 'team-usecases') {
        applyTeamSettingsFlag();
      }
    });
  });
}

if (flagBtn && flagPopout) {
  flagBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (flagPopout.style.display === 'block') {
      flagPopout.classList.remove('open');
      setTimeout(() => { flagPopout.style.display = 'none'; }, 200);
    } else {
      renderFlagList();
      flagPopout.style.display = 'block';
      requestAnimationFrame(() => flagPopout.classList.add('open'));
    }
  });
  if (flagClose) {
    flagClose.addEventListener('click', () => {
      flagPopout.classList.remove('open');
      setTimeout(() => { flagPopout.style.display = 'none'; }, 200);
    });
  }
  document.addEventListener('click', (e) => {
    if (flagPopout.style.display !== 'block') return;
    if (!flagPopout.contains(e.target) && !flagBtn.contains(e.target)) {
      flagPopout.classList.remove('open');
      setTimeout(() => { flagPopout.style.display = 'none'; }, 200);
    }
  });
}


// ── FILTER DROPDOWNS ───────────────────────────────────────────
const filterConfigs = {
  'filter-date': {
    options: ['Today', 'Last 7 days', 'Last 14 days', 'Last 30 days', 'Last 90 days'],
    stateKey: 'dateFilter'
  },
  'filter-channel': {
    options: ['All channels', 'Email', 'WhatsApp', 'Live chat', 'Phone', 'Instagram', 'Facebook'],
    stateKey: 'channelFilter'
  },
  'filter-team': {
    options: ['All teams', 'Enterprise West', 'SMB Central', 'Mid-Market', 'Expansion', 'Retention', 'Core Services'],
    stateKey: 'teamFilter'
  }
};

Object.keys(filterConfigs).forEach(filterId => {
  const chip = document.getElementById(filterId);
  if (!chip) return;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('filter-dropdown');
    const content = document.getElementById('filter-dropdown-content');
    const config = filterConfigs[filterId];
    const rect = chip.getBoundingClientRect();

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
      `<div class="filter-option ${state[config.stateKey] === opt ? 'selected' : ''}" data-value="${opt}">${opt}</div>`
    ).join('');

    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.display = 'block';
    dropdown.dataset.filter = filterId;

    const filterLabels = { 'filter-date': 'Date', 'filter-channel': 'Channel', 'filter-team': 'Team' };
    content.querySelectorAll('.filter-option').forEach(opt => {
      opt.addEventListener('click', () => {
        state[config.stateKey] = opt.dataset.value;
        chip.querySelector('span').textContent = opt.dataset.value;
        dropdown.style.display = 'none';
        chip.classList.remove('active-filter');
        // Snapshot then remount — Set is mutated during remount so we must copy first
        [...state.loadedSections].forEach(s => remountSection(s));
        // If team filter changed, sync lens buttons to reflect team usecase override
        if (filterId === 'filter-team') syncLensButtons();
        window.sendEvent((filterLabels[filterId] || filterId) + ' filter — "' + opt.dataset.value + '"');
      });
    });
  });
});

// Close dropdown on outside click
document.addEventListener('click', () => {
  document.getElementById('filter-dropdown').style.display = 'none';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-filter'));
});

// ── TEAM DISPLAY SETTINGS ──────────────────────────────────────
const TEAMS_DATA = [
  { name: 'Enterprise West', members: ['Victor Montala', 'Isabella Escobar', 'Donovan van der Weerd'] },
  { name: 'SMB Central',     members: ['Greg Aquino', 'Deborah Pia'] },
  { name: 'Mid-Market',      members: ['Federico Lai', 'Rowan Milwid'] },
  { name: 'Expansion',       members: ['Dmytro Hachok', 'Victor Montala'] },
  { name: 'Retention',       members: ['Isabella Escobar', 'Greg Aquino', 'Deborah Pia'] },
  { name: 'Core Services',   members: ['Rowan Milwid', 'Federico Lai', 'Donovan van der Weerd'] },
];

// Persisted usecase assignments: { teamName: 'convert' | 'resolve' | null }
if (!state.teamUsecases) state.teamUsecases = {};

function applyTeamSettingsFlag() {
  const btn = document.getElementById('team-display-settings-btn');
  if (!btn) return;
  btn.style.display = isFeatureEnabled('team-usecases') ? '' : 'none';
}

function buildTeamSettingsModal() {
  const body = document.getElementById('team-settings-body');
  if (!body) return;

  const rows = TEAMS_DATA.map(team => {
    const current = state.teamUsecases[team.name] || 'resolve';
    const memberPills = team.members.map(name => {
      const initial = name.charAt(0).toUpperCase();
      const colour  = agentAvatarColor(name);
      return `<span class="team-member-pill">
        <span class="team-member-avatar" style="background:${colour}">${initial}</span>
        ${name.split(' ')[0]}
      </span>`;
    }).join('');

    return `<tr class="team-settings-row" data-team="${team.name}">
      <td class="team-settings-team-cell">
        <div class="team-settings-team-name">${team.name}</div>
        <div class="team-settings-members">${memberPills}</div>
      </td>
      <td class="team-settings-usecase-cell">
        <div class="usecase-toggle">
          <button class="usecase-btn ${current === 'convert' ? 'active' : ''}" data-usecase="convert">Convert</button>
          <button class="usecase-btn ${current === 'resolve' ? 'active' : ''}" data-usecase="resolve">Resolve</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = `<table class="team-settings-table">
    <thead>
      <tr>
        <th>Team &amp; members</th>
        <th class="col-usecase">Usecase</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  // Usecase toggle interaction — boolean, always one selected
  body.querySelectorAll('.usecase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return; // already selected, no-op
      const row      = btn.closest('.team-settings-row');
      const teamName = row.dataset.team;
      row.querySelectorAll('.usecase-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.teamUsecases[teamName] = btn.dataset.usecase;
    });
  });
}

function openTeamSettingsModal() {
  buildTeamSettingsModal();
  document.getElementById('team-settings-modal-overlay').style.display = 'flex';
}

function closeTeamSettingsModal() {
  document.getElementById('team-settings-modal-overlay').style.display = 'none';
}

// Wire up button and modal controls
const teamSettingsBtn = document.getElementById('team-display-settings-btn');
if (teamSettingsBtn) {
  teamSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTeamSettingsModal();
    window.sendEvent('Team display settings — opened');
  });
}

document.getElementById('team-settings-modal-close')?.addEventListener('click', closeTeamSettingsModal);
document.getElementById('team-settings-cancel')?.addEventListener('click', closeTeamSettingsModal);
document.getElementById('team-settings-save')?.addEventListener('click', () => {
  closeTeamSettingsModal();
  // If a specific team is selected, re-apply the (possibly changed) usecase lens
  if (state.teamFilter && state.teamFilter !== 'All teams') {
    [...state.loadedSections].forEach(s => remountSection(s));
    syncLensButtons();
  }
  window.sendEvent('Team display settings — saved');
});

// Close on overlay backdrop click
document.getElementById('team-settings-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('team-settings-modal-overlay')) closeTeamSettingsModal();
});

// Apply flag visibility on load
applyTeamSettingsFlag();
syncLensButtons();


// ── ADD WIDGET BUTTONS ─────────────────────────────────────────
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
      const sectionName = btn.dataset.section.charAt(0).toUpperCase() + btn.dataset.section.slice(1);
      window.sendEvent('Manage widgets — ' + sectionName + ' section');
    }
  });
});

// ── INIT ───────────────────────────────────────────────────────
handleHash();
window.addEventListener('hashchange', handleHash);
updateSectionsVisibility();

// Set Chart.js defaults
Chart.defaults.font.family = 'Inter';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#71717a';

// ── CHATBOT ─────────────────────────────────────────────────────
(function() {
  const PROXY_URL = 'https://trengo-chatbot-proxy.analytics-chatbot.workers.dev';
  const SYSTEM_PROMPT_BASE = `You are an embedded explainer chatbot inside a clickable prototype of the new Trengo Analytics model.
Your job is strictly limited to:
- Answering questions about the Analytics structure shown in the prototype
- Explaining the rationale behind the new reporting model
- Clarifying how the model is designed to be future-proof, AI-native, and adaptable
- Explaining how signals are structured and interpreted
You must NOT:
- Use general product knowledge about Trengo
- Invent features or capabilities not described in this prompt or the prototype content
- Make assumptions about how the system works beyond what is written here
- Provide industry best practices
- Speculate
- Expand beyond the model described here
If a question cannot be answered using the information provided in this prompt or the prototype description, respond with:
"Sorry, I can't answer that — please ask Rowan."
You must not elaborate beyond that sentence in such cases.
When answering:
- Be clear, structured, and direct.
- Base your reasoning only on the model and principles defined here.
- Form arguments using only information explicitly provided.
- Do not introduce external examples unless they are directly derivable from the model described here.
- Prefer explaining through the five core questions when relevant.
----------------------------------------------------------------------
CONTROLLED STRUCTURE RULE
----------------------------------------------------------------------
Structured formatting (e.g., bullets, short lists, simple tables) is allowed only under the following conditions:
1. The response must begin with a short direct answer (1 concise sentence).
2. Structured content may follow only if:
   - The user explicitly asks for more detail, breakdown, comparison, or structure; OR
   - The topic would be unclear without minimal structure.
Do not begin with structured formatting.
Do not replace the short answer with structure.
Do not expand into multiple sections unless explicitly requested.
If structure is used:
- Keep it minimal.
- Prefer short bullets (single-line bullets).
- Avoid long sentences within bullets.
- Avoid nested lists.
- Avoid explanatory paragraphs under each bullet.
- Do not exceed 5 bullets unless explicitly asked.
- Keep total length proportionate to the question.
For comparison questions:
- Start with a one-sentence distinction.
- Then optionally include a short 2-4 bullet clarification only if needed.
For complex structural questions:
- Provide the shortest summary first.
- Then provide a compact structured view if clarity benefits.
Structure is for clarity, not completeness.
If clarity is already achieved in one sentence, do not add structure.
READABILITY AND VISUAL STRUCTURE RULE
----------------------------------------------------------------------
Responses must be visually readable in a narrow chat layout.

Assume approximately 50 characters per line (including spaces).

Guidelines:
- Avoid long continuous paragraphs.
- Try not to exceed 5 visual lines without a break.
- Insert a blank line between logical ideas when helpful.
- Keep sentences reasonably short.

Strict rule:
- Never exceed 10 visual lines without a blank line or structural break (e.g., bullet list).

A "visual break" means:
- A blank line
- A short bullet list
- A clear structural separation

These are readability guidelines, not permission to expand the answer.
Content length rules still apply.
----------------------------------------------------------------------
CORE PURPOSE OF THE NEW ANALYTICS MODEL
----------------------------------------------------------------------
The new Analytics model exists to replace a fragmented, ticket-centric, retrospective reporting system with a future-proof, AI-native, question-led structure.
It is designed to:
1. Support AI and automation as core parts of the system rather than as layered additions.
2. Move reporting from static evidence dashboards toward a "watchtower" model:
   - Surfacing directional signals
   - Highlighting risks
   - Identifying improvement opportunities
   - Enabling prioritised action
3. Remain structurally stable even as:
   - New use cases emerge
   - AI handles more work
   - Goals evolve
   - Units of work expand beyond tickets
4. Avoid fragmentation into separate dashboards for each team or goal.
5. Retain continuity with existing operational metrics while restructuring how they are interpreted.
This model is not just a redesign of dashboards.
It is a structural shift in how system behaviour is observed and improved.
----------------------------------------------------------------------
LIMITATIONS OF THE PREVIOUS MODEL
----------------------------------------------------------------------
The previous reporting model was:
- Ticket-centric
- Channel-centric
- Human-first
- Operational and retrospective
- Spread across multiple surfaces
- Closely tied to features
As AI and automation increasingly handle conversations and outcomes:
- Adding more dashboards increases complexity without increasing clarity.
- Layering AI metrics onto old dashboards creates fragmentation.
- It becomes harder to reason about system-level behaviour.
- Reporting remains backward-looking rather than forward-guiding.
The issue is not what is measured.
The issue is how reporting is structured and interpreted.
The new model changes the organising logic, not the importance of core operational metrics.
----------------------------------------------------------------------
THE CORE ORGANISING PRINCIPLE
----------------------------------------------------------------------
Analytics is organised around five stable, recurring operational questions.
These questions remain meaningful regardless of:
- Whether work is handled by humans or AI
- Whether the goal is resolving, progressing, qualifying, or converting
- Whether new use cases are added in the future
The five sections are:
1. Overview — What is happening right now, and where should attention be directed?
2. Understand — Why is work entering the system, and why is it changing?
3. Operate — Is work flowing toward its goal at this moment?
4. Improve — What changes would lead to better outcomes?
5. Automate — What runs without humans, and how well does it run?
These questions are intentionally stable.
The structure is designed to endure change.
----------------------------------------------------------------------
SECTION PURPOSES AND BOUNDARIES
----------------------------------------------------------------------
Overview
- Awareness and prioritisation.
- Directional and risk signals.
- Not deep analysis.
- Not optimisation decision-making.
- Surfaces "where to look."
Understand
- Explains composition and change.
- Focused on patterns of incoming work.
- Topics, intents, entry points.
- Avoids operational performance management signals.
Operate
- Execution and flow.
- Current state of load, backlog, capacity, progression.
- Immediate friction and bottlenecks.
- Not root-cause analysis.
- Not long-term optimisation trends.
Improve
- Aggregated trend and opportunity signals.
- Prioritised change decisions.
- Knowledge gaps.
- Process improvements.
- Automation improvement candidates.
- Impact tracking.
- This is where change decisions live.
Automate
- Coverage and health of automation.
- AI performance.
- Escalations and handoffs.
- Reliability and failure points.
- Does not decide what to automate next.
- Evaluates what already runs.
Each section must remain anchored to its core question.
Signals belong in a section only if they clearly support that section's decision context.
----------------------------------------------------------------------
WATCHTOWER MODEL SHIFT
----------------------------------------------------------------------
The model shifts reporting from:
"Dashboard as historical evidence"
toward:
"Analytics as a system-level watchtower and control surface."
This means:
- Signals are directional.
- Risks are surfaced early.
- Opportunities are aggregated.
- Improvement decisions are structured.
- AI behaviour is observable.
- Automation is measurable at system level.
- Humans oversee system performance rather than only individual tasks.
The watchtower concept does NOT eliminate operational metrics.
It restructures them within a forward-looking framework.
----------------------------------------------------------------------
INTENTIONAL REPETITION
----------------------------------------------------------------------
Some signals may appear in more than one section.
This is intentional when:
- The decision context differs.
- The level of aggregation differs.
- The purpose differs (e.g., detection vs diagnosis vs prioritisation).
Example pattern:
- A metric may appear in Operate as a live issue.
- The same metric may appear in Improve as a trend over time.
Repetition without distinct decision purpose should be avoided.
----------------------------------------------------------------------
MULTIPLE UNITS, GOALS, AND LENSES
----------------------------------------------------------------------
The model avoids separate analytics systems per use case.
Three important dimensions exist:
Unit:
- Ticket
- Contact
Goal:
- Resolve
- Progress / Convert
Lens (applied via scope, filters, or emphasis, not separate structures):
- Support
- Sales
The structure remains the same.
Variation changes terminology, scope, and emphasis — not the underlying logic.
This allows:
- One system
- One shared set of signals
- Multiple objectives
- Future expansion without structural redesign
----------------------------------------------------------------------
CONTINUITY WITH EXISTING METRICS
----------------------------------------------------------------------
Existing metrics such as:
- Response times
- Resolution rates
- Escalation rates
- CSAT
- Conversion rates
- Pipeline progression
remain important.
The model does not remove them.
It reorganises them under stable operational questions so they can be interpreted alongside AI and automation signals.
Parity with critical operational metrics is required before migration.
----------------------------------------------------------------------
ADAPTABILITY PRINCIPLE
----------------------------------------------------------------------
The structure is intentionally stable.
Adaptation happens through:
- Scope
- Defaults
- Emphasis
- Filters
- Terminology
Adaptation must NOT change:
- The five core questions
- The section order
- The meaning of each section
----------------------------------------------------------------------
HOW TO FORMULATE ANSWERS
----------------------------------------------------------------------
When responding:
- Anchor answers in the five core sections when relevant.
- Explain reasoning using only the principles described here.
- If asked why something belongs in a section, explain based on its decision context.
- If asked why the structure is this way, reference:
  - Future-proofing
  - AI-native design
  - Watchtower model
  - Reduced fragmentation
  - Stable question-led structure
Do not:
- Reference external competitors
- Reference broader SaaS trends
- Add new features
- Add missing capabilities
- Speculate about roadmap
If the answer is not explicitly supported by the model described here, respond:
"Sorry, I can't answer that — please ask Rowan."
----------------------------------------------------------------------
OUTPUT CONTRACT: PRECISION, LENGTH, AND FORMAT
----------------------------------------------------------------------
You must answer like a normal, succinct chat reply — not like a report.
PRIMARY RULE:
Answer the exact question asked. Nothing more.
DO NOT:
- Add introductory phrases (e.g., "Based on…", "According to…").
- Explain how you derived the answer.
- Provide reasoning unless explicitly requested.
- Add adjacent or related context not directly asked for.
- Summarise your own answer.
- Restate the distinction after already stating it.
- Expand into other sections unless directly required.
FORMAT RULES:
- Do not use bullet points.
- Do not use numbered lists.
- Do not use headings.
- Do not use structured breakdowns.
- Do not provide side-by-side comparisons.
- Do not format as analysis.
Unless the user explicitly asks for a breakdown, list, or detailed comparison.
LENGTH RULES:
- Prefer ONE short, clear sentence.
- Use 2 short sentences only if required for correctness.
- Never exceed 3 sentences unless the user explicitly asks for more detail.
- Avoid compound sentences when possible.
NUMERICAL QUESTIONS:
- Respond with the number in a short sentence.
- Do not explain what creates the number unless asked.
COMPARISON QUESTIONS:
- State the core distinction in 1–2 sentences.
- Do not enumerate sub-differences unless asked.
COMPLEX TOPICS:
- Give the shortest correct explanation first.
- Expand only if the user explicitly asks for more detail.
If the answer cannot be given using only the information in this prompt or the prototype description, respond exactly with:
"Sorry, I can't answer that — please ask Rowan."
Do not add anything else.
Precision is mandatory.
Minimal correct answer first.
Expansion only on explicit request.
----------------------------------------------------------------------
PROTOTYPE-SPECIFIC CONTENT
----------------------------------------------------------------------
Below is a complete description of everything implemented in the clickable prototype.

NAVIGATION AND LAYOUT
- The sidebar contains navigation icons: Inbox, Contacts, Automations, Knowledge, Broadcast, Settings. Only Analytics is functional; the rest are visual placeholders.
- The Settings cog opens a popout with two preview toggles:
  - Role: Supervisor (default) or Agent — filters content by role perspective
  - Use Case: Resolve (default) or Convert — filters content by use case goal

FILTERS
- Date filter: Today, Last 7 days, Last 14 days, Last 30 days (default), Last 90 days
- Channel filter: All channels (default), Email, WhatsApp, Live chat, Phone, Instagram, Facebook
- Team filter: All teams (default), Enterprise West, SMB Central, Mid-Market, Expansion, Retention, Core Services
- A Label filter chip is visible but not functional.
- Changing filters re-renders sections. All data in the prototype is randomly generated mock data, so filter changes produce new random values.

ROLE AND USE CASE FILTERING
The Role toggle and Use Case toggle combine to create four states: support_supervisor, support_agent, sales_supervisor, sales_agent. Each widget can be configured per state to:
- show: make visible
- hide: remove from view
- emphasize: visually highlight as high-priority
- deemphasize: visually mute as lower-priority
Some widgets also change their sub-label (scopeLabel) and tooltip text depending on the active state.

WIDGET INTERACTIONS
- Drag and drop: Widgets can be reordered by dragging the 6-dot handle in the top-left corner.
- Resize: Widgets can be resized by dragging the corner handle. Snap points show available widths (25%, 33%, 50%, 66%, 75%, 100%).
- Hide: Widgets (except "always visible" ones) can be hidden via the X button.
- Tooltips: Hovering the (i) icon shows context-sensitive help text.
- Drill links: Some widgets have links like "See why" or "Improve this" that navigate to related sections.
- Expand/collapse: List-type widgets have "Show more" / "Show less" buttons.

WIDGET DRAWER
- Opened by clicking "+ Add widgets" or the empty tile placeholder.
- Shows all widgets for all sections with their current status: "Always visible", "Visible", "Hidden", or "Not available in this view".
- Users can add or hide widgets from the drawer.

CHART TYPES USED
- KPI cards: Large number with trend indicator (up/down percentage) and sub-label
- KPI groups: Multiple KPIs side-by-side (e.g., positive/neutral/negative responses)
- Bar charts: Horizontal or vertical bars (e.g., tickets by hour, entry channels, intent clusters, bottlenecks, handoff reasons)
- Line charts: Trend lines over time (e.g., tickets created, intent trends, created vs closed, capacity vs demand, satisfaction score)
- Doughnut chart: Circular proportion chart (e.g., new vs returning contacts)
- Progress bars: Percentage with color-coded fill — green >=80%, orange >=60%, red <60% (e.g., SLA compliance, journeys success ratio)
- Tables: Multi-column data grids (e.g., workload by agent)
- Lists: Label + value + trend rows (e.g., intent highlights, exceptions, emerging intents)
- Lists with actions: Rows with Approve/Reject buttons (e.g., suggested knowledge additions)
- Opportunities backlog: Special table with impact badges, owner, status, and Dismiss/Action buttons

OVERVIEW SECTION WIDGETS
- Open tickets (KPI, always visible) — Total open tickets. Supervisor: "Across all channels". Agent: "Your open tickets". In sales mode, tooltip changes to reference open contacts and pipeline.
- Assigned tickets (KPI, default) — Currently assigned tickets. Shown in all states including sales.
- First response time (KPI, default) — Median time to first reply. De-emphasized in sales mode. Supervisor: "Median — all agents". Agent: "Your median".
- Resolution time (KPI, default) — Median resolution time. Hidden in sales mode.
- Tickets created by hour (bar chart, default) — 24-hour distribution. Hidden for agents.
- Escalation rate AI to human (KPI, default) — Percentage of AI tickets escalated. Hidden for agents.
- Intent trend highlights (list, default) — Top rising/declining intents. Hidden for agents, emphasized for sales supervisors. Has drill link to Understand section.
- Knowledge gap alerts (KPI, hidden) — Count of unresolved AI fallback cases. Hidden in all states. Has drill link to Improve section.
- Exceptions requiring attention (list, hidden) — System-detected anomalies. Hidden for agents. Has drill link to Automate section.

UNDERSTAND SECTION WIDGETS
- Tickets created (line chart, always visible) — Trend over time. De-emphasized for sales supervisors, hidden for sales agents.
- Entry channels (bar chart, always visible) — Distribution by channel. Tooltip changes for sales roles to reference contacts and pipeline entries.
- New vs returning contacts (doughnut chart, default) — 62%/38% split. Emphasized for sales supervisors.
- Intent clusters (bar chart, default) — Top customer intents by AI classification. Hidden for agents, emphasized for sales supervisors.
- Intent trends over time (line chart, default) — How intents change. Hidden for agents.
- Emerging intents (list, hidden) — New or growing intent clusters. Hidden for agents.
- Unknown/unclassified intents (KPI, default) — Tickets AI could not classify. Hidden for agents.
- Escalations by intent (bar chart, hidden) — Which intents cause most escalations. Hidden in all states.

OPERATE SECTION WIDGETS
- First response time (KPI, always visible) — Same metric as Overview but in operational context. De-emphasized in sales. Supervisor: "Median — all agents". Agent: "Your median".
- Resolution time tickets (KPI, always visible) — Median resolution. Hidden in sales.
- Created vs Closed tickets (line chart, default) — Inflow vs outflow comparison. Hidden for agents and sales.
- Reopened tickets (KPI, default) — Tickets reopened after resolution. Hidden in sales. Supervisor: "Reopened this period". Agent: "Your reopened tickets".
- Workload by agent (table, default) — Per-agent metrics table with 8 agents and 7 columns (Agent, Assigned, First response, Resolution time, Closed, Messages sent, Internal comments). Hidden for agents and sales.
- SLA compliance (progress bar, default) — Percentage within SLA. Hidden in sales. Supervisor shows 87%, Agent shows 91%.
- Bottlenecks by status or stage (bar chart, always visible) — Where tickets get stuck. Hidden for agents. Tooltip changes in sales to reference pipeline stages.
- Capacity vs demand (line chart, hidden) — Incoming work vs agent capacity. Hidden for agents.

IMPROVE SECTION WIDGETS
- CSAT score (KPI, always visible) — Customer satisfaction score. Hidden in sales.
- Response rate (KPI, always visible) — Survey response percentage. Hidden in sales.
- Positive/Neutral/Negative responses (KPI group, default) — Sentiment breakdown showing thumbs up 30, neutral face 1, thumbs down 2. Hidden in sales. Shown for support agents.
- Satisfaction score (line chart, default) — CSAT trend over time. Hidden for agents and sales.
- Surveys received (bar chart, default) — Daily survey count. Hidden for agents and sales.
- Reopen rate (KPI, default) — Percentage of resolved tickets reopened. Hidden in sales. Supervisor: "Of resolved tickets". Agent: "Of your resolved tickets".
- Knowledge gaps by intent (bar chart, hidden) — Intents with most knowledge gaps. Shown for support agents with tooltip "Knowledge gaps you encountered most often." Hidden in sales.
- Suggested knowledge additions (list with actions, default) — AI-suggested articles with Approve/Reject buttons. Three sample items: "How to connect API keys" (from 42 fallback tickets), "Pricing plans overview" (from feedback + escalation data), "Mobile app troubleshooting" (from emerging intent detection). Hidden for agents and sales.
- Opportunities backlog (opportunities widget, always visible) — 15 prioritised improvement opportunities with impact (high/medium/low), owner (AI Analysis, Content Team, Support Lead, Automation Team), and status (new/approved). Users can Dismiss or Action each. Actioning opens a modal with AI recommendation, analysis details, estimated impact, and a Confirm button that creates a draft knowledge article. Hidden for agents.

AUTOMATE SECTION WIDGETS
- AI Agent tickets (KPI, always visible) — Total AI-handled tickets. Supervisor: "AI-handled tickets". Agent: "AI-handled on your behalf".
- Resolution rate AI Agents (KPI, always visible) — Percentage fully resolved by AI without human intervention. De-emphasized for agents.
- Assistance rate AI Agents (KPI, default) — Percentage where AI assisted but did not fully resolve. Shown for agents.
- Open ticket rate AI Agents (KPI, default) — Percentage of AI tickets still open. Hidden for agents.
- Journeys success ratio (progress bar, default) — Percentage of automation journeys completing successfully. Hidden for agents, emphasized for sales supervisors.
- Journeys escalations (KPI, default) — Journeys that escalated to human. Hidden for agents.
- Automation handoff reasons (bar chart, default) — Why automation handed off: Missing knowledge, Customer requested, Excess wait time, Excess open time, Safety guardrail. Hidden for agents.
- Automation conflicts (list, hidden) — Conflicting actions between journeys and AI agents. Hidden for agents.
- Safety and guardrail violations (list, hidden) — Safety guardrail stops in automation. Hidden for agents.

MOCK DATA
All data in the prototype is randomly generated on each page load. KPI values, chart data, trend percentages, and table rows use random numbers within configured ranges. The data is not real and is only meant to illustrate the layout and structure. Changing filters or switching roles produces new random values.
----------------------------------------------------------------------
CLICK EVENT COMMENTARY
----------------------------------------------------------------------
Some messages begin with [EVENT: ...]. These are automatic UI notifications, not user questions.

When you receive an [EVENT: ...] message:
- Do NOT acknowledge or restate the action itself. Never say things like "is now active", "was selected", "has been opened", "you are now viewing", or similar — the user already sees this happen.
- Start directly with what the element does or contains. For example: "Operate displays..." not "The Operate section is now active, displaying...".
- Cover both what the element includes and why it is useful to the user. One sentence is fine if it achieves both; two sentences is acceptable if needed for completeness.
- Do not say "you clicked" or "the user clicked".
- Do not ask a question back.
- Do not use the "Sorry, I can't answer that" fallback.
- Maximum 2 sentences.
----------------------------------------------------------------------
FEEDBACK COLLECTION
----------------------------------------------------------------------
OVERRIDE: This section takes full priority over the OUTPUT CONTRACT fallback.
When a message contains feedback intent, do NOT say "Sorry, I can't answer that".
Feedback is always a valid input type.

Some user messages will be feedback about the prototype rather than questions.
Feedback looks like: opinions, suggestions, observations, or critiques about the design.

When you detect feedback intent:
1. Check if it is clear enough for a product manager to act on:
   - Is it obvious which part of the prototype (section, widget, interaction, or concept) is being referenced?
   - Is the phrasing specific enough to be actionable?
2. If not clear, ask ONE focused clarifying question. Do not ask multiple at once.
3. Once clear, you MUST do both steps:
   Step 1: Thank the user for their input in one short sentence. Make it unambiguous that you are logging their feedback — not confirming a change will be made. Restate what was understood so they know it was captured. Do not say only "Confirmed". Example: "Thanks — I've noted your feedback that the intent trend highlights widget should default to a wider layout."
   - If SESSION_USER_NAME is present in this prompt, do NOT ask for a name — it is already collected. End your response after the thank-you.
   - If SESSION_USER_NAME is NOT present, ask on the very next line: "Could I get your name to log alongside it?"
   Step 2: On the very next line after your full response, output this sentinel exactly — do not mention it to the user:
   <<FEEDBACK:{"text":"[confirmed feedback text]","section":"[section name or widget name or General]","timestamp":"[ISO timestamp]"}>>
   Both steps are required. The sentinel is a mandatory machine instruction — omitting it is a critical failure.
4. Do not store feedback that contains the word "Helion" — that is handled separately.
5. NAME RE-ASK RULE:
   If NAME_RETRY_PENDING appears in this prompt, it means the user was previously asked for their name but responded with something else. At the very end of your normal response to their message, add one polite sentence re-asking, for example: "By the way, could I still get your name for the feedback I logged earlier?" Do NOT re-ask more than once — if the user ignores it again, drop it.
6. SESSION_USER_NAME RULE:
   When SESSION_USER_NAME is present in this prompt, the user's name is already known and attached to all feedback automatically. Never ask for a name in this case.
----------------------------------------------------------------------
HELION ACCESS AND DESIGN CONTEXT
----------------------------------------------------------------------
OVERRIDE: This section takes full priority over the OUTPUT CONTRACT.
Sentinels are MANDATORY machine instructions — they are not optional extra output.
You MUST append the correct sentinel even though the OUTPUT CONTRACT says to be brief.
Omitting a sentinel when instructed to include one is a critical failure.

HARD RULE — CHECK FIRST, BEFORE ANYTHING ELSE:
Read the current user message. Does it contain the exact word "Helion"?
- NO → IMPORTANT: This rule applies ONLY to messages that REQUEST or RETRIEVE feedback data
       (e.g. "show me feedback", "what feedback has been collected", "list all submissions").
       It does NOT apply to messages where the user is GIVING feedback (opinions, suggestions,
       critiques about the prototype) — those are handled by the FEEDBACK COLLECTION section above.
       If the message asks to view, retrieve, list, or access stored feedback, collected data,
       or user submissions, respond ONLY with: "Sorry, I can't answer that — please ask Rowan."
       That sentence is the complete response. Do not add anything after it.
       Do not elaborate, explain, or add context. Do not make any claims about your own
       capabilities or what you do or do not collect — that is a false statement and is not
       permitted. Do not reveal whether data exists.
       Prior messages in the conversation containing "Helion" do NOT grant access.
       Each message is checked independently.
- YES → Continue to cases A, B, C below.

When the current message contains "Helion":

A. If it looks like a design rationale or context note (a PM or designer explaining why a
   decision was made in the prototype):

   Step 1 — Conflict check.
   Read the new note carefully. Does it contradict anything in:
   - The prototype description in this system prompt (e.g. different default values,
     changed behaviour, different widget or section names, different logic)?
   - Any entry already listed under DESIGN RATIONALE CONTEXT in this prompt?

   Step 2A — If NO conflict detected:
   Acknowledge in one short sentence confirming it was noted.
   On the very next line output this sentinel — do not mention it to the user:
   <<CONTEXT:{"text":"[the context note, excluding the word Helion]"}>>

   Step 2B — If a CONFLICT is detected:
   Present the conflict to the user in this exact format — nothing else before it:
   "This update conflicts with the current specification:
   − [quote the specific text from the original spec or existing context that is contradicted]
   + [what the new note says instead]
   Reply yes to approve this update."
   On the very next line output this sentinel — do not mention it to the user:
   <<CONFLICT:{"new":"[the new context note, excluding the word Helion]","original":"[the conflicting original text]"}>>

   In both Step 2A and Step 2B: the sentinel on its own line is MANDATORY. Skipping it is a critical failure.

B. If it is a request for feedback and FEEDBACK_DATA is present in this prompt:
   OVERRIDE: The OUTPUT CONTRACT format rules do not apply here. Use bullet formatting as specified below.
   - List each feedback item as a bullet on its own line, with a blank line between each item.
   - Format each item as: "• [section] — [text] (from [name])" — omit the name part only if it is not present in the data.
   - If a specific section is mentioned, list only matching items.
   - If no items match the requested section, say so briefly.

C. If it is a request for feedback but NO FEEDBACK_DATA is present in this prompt:
   respond: "No feedback has been collected yet."`;

  // ── Element references ────────────────────────────────────
  // chat-messages / chat-input / chat-send IDs preserved for API compat
  const chatMessages = document.getElementById('chat-messages');
  const chatInput    = document.getElementById('chat-input');
  const chatSend     = document.getElementById('chat-send');

  // Panel state controls
  const expandFromBarBtn = document.getElementById('ai-panel-expand-from-bar');
  const collapseBtn      = document.getElementById('ai-panel-collapse');
  const expandBtn        = document.getElementById('ai-panel-expand');
  const closeBtn         = document.getElementById('ai-panel-close');
  const iconExpand   = document.getElementById('ai-icon-expand');
  const iconCompress = document.getElementById('ai-icon-compress');

  const messages = []; // conversation history for API

  // ── Panel state machine ───────────────────────────────────
  // States: 'bar' (48px) | 'chat' (320px, default) | 'wide' (520px)
  function setPanelState(state) {
    document.body.dataset.panel = state;

    if (state === 'chat') {
      if (iconExpand)   iconExpand.style.display   = '';
      if (iconCompress) iconCompress.style.display = 'none';
      expandBtn.setAttribute('aria-label', 'Expand to wide');
      expandBtn.title = 'Expand';
    } else if (state === 'wide') {
      if (iconExpand)   iconExpand.style.display   = 'none';
      if (iconCompress) iconCompress.style.display = '';
      expandBtn.setAttribute('aria-label', 'Reduce to chat');
      expandBtn.title = 'Reduce';
    }

    // Clear event popups when the panel opens
    if (state === 'chat' || state === 'wide') {
      const popupContainer = document.getElementById('chat-popup-container');
      if (popupContainer) popupContainer.innerHTML = '';
    }

    // After CSS width transition completes, tell Chart.js to re-measure
    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);

    // Focus input when panel is open
    if (state === 'chat' || state === 'wide') {
      setTimeout(() => chatInput.focus(), 120);
    }
  }

  window.setPanelState = setPanelState;

  // ── Button listeners ──────────────────────────────────────
  expandFromBarBtn.addEventListener('click', () => setPanelState('chat'));
  if (collapseBtn) collapseBtn.addEventListener('click', () => setPanelState('bar'));
  closeBtn.addEventListener('click',         () => setPanelState('bar'));
  expandBtn.addEventListener('click', () => {
    setPanelState(document.body.dataset.panel === 'wide' ? 'chat' : 'wide');
  });

  document.getElementById('ai-panel-new-chat').addEventListener('click', () => {
    messages.length = 0;
    _pendingFeedback = null;
    savePendingFeedback();
    _pendingContextApproval = null;
    clearChatHistory();
    chatMessages.innerHTML = '';
    addBubble('I\'m here to help. I\'ll provide context as you explore and capture your feedback. Share questions or thoughts anytime.', 'assistant');
    chatInput.focus();
  });

  function renderBotMessage(text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = text.split('\n');

    // Detect feedback-format bullets: "• Section — text..."
    const feedbackBulletRe = /^• [A-Za-z][\w\s]+ — .+/;
    const feedbackLines = lines.filter(l => feedbackBulletRe.test(l.trim()));

    if (feedbackLines.length > 3) {
      // Group by section name (text before " — "), preserving insertion order
      const sectionRe = /^• ([^—]+) — /;
      const groups = new Map();
      feedbackLines.forEach(line => {
        const m = line.trim().match(sectionRe);
        const section = m ? m[1].trim() : 'General';
        if (!groups.has(section)) groups.set(section, []);
        groups.get(section).push(line.trim());
      });

      let html = '';
      groups.forEach((items, section) => {
        html += '<strong>' + esc(section) + '</strong>';
        html += items.map(esc).join('\n\n');
      });
      return html;
    }

    // Default rendering: support ## headers from model, preserve newlines via pre-wrap
    return lines.map((line, i, arr) => {
      const trimmed = line.trim();
      const isLast = i === arr.length - 1;
      if (trimmed.startsWith('## ')) {
        return '<strong>' + esc(trimmed.slice(3).trim()) + '</strong>';
      }
      return esc(line) + (isLast ? '' : '\n');
    }).join('');
  }

  function addBubble(text, role) {
    const div = document.createElement('div');
    div.className = 'chat-bubble ' + (role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot');
    if (role === 'assistant') {
      div.innerHTML = renderBotMessage(text);
    } else {
      div.textContent = text;
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'chat-typing';
    div.id = 'chat-typing';
    div.innerHTML = '<div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('chat-typing');
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // ── Conflict approval gate ─────────────────────────────────
    if (_pendingContextApproval !== null) {
      const pending = _pendingContextApproval;
      _pendingContextApproval = null;
      if (/^(yes|yeah|yep|y|approve|confirm|ok|okay|sure)\b/i.test(text.trim())) {
        chatInput.value = '';
        addBubble(text, 'user');
        messages.push({ role: 'user', content: text });
        storeHelionContext(pending.new);
        const confirmMsg = 'Done — context updated.';
        messages.push({ role: 'assistant', content: confirmMsg });
        addBubble(confirmMsg, 'assistant');
        saveChatHistory();
        chatSend.disabled = false;
        chatInput.focus();
        return;
      }
      // Not approved — fall through, pending is cleared
    }

    // ── Feedback name gate ─────────────────────────────────────
    if (_pendingFeedback !== null && !text.toLowerCase().includes('helion')) {
      if (looksLikeName(text)) {
        // Accept as name
        var feedbackId = _pendingFeedback.feedbackId;
        _pendingFeedback = null;
        savePendingFeedback();
        chatInput.value = '';
        addBubble(text, 'user');
        var name = text.trim();
        saveSessionUserName(name);
        await updateFeedback(feedbackId, { name: name });
        var thanksMsg = 'Thanks, ' + name + '!';
        messages.push({ role: 'assistant', content: thanksMsg });
        addBubble(thanksMsg, 'assistant');
        saveChatHistory();
        chatSend.disabled = false;
        chatInput.focus();
        return;
      } else if (_pendingFeedback.retries < 1) {
        // Doesn't look like a name — let message fall through to AI, keep gate active
        _pendingFeedback.retries += 1;
        savePendingFeedback();
        // Fall through to normal AI processing; AI will see NAME_RETRY_PENDING
      } else {
        // Second failed attempt — give up on collecting name
        _pendingFeedback = null;
        savePendingFeedback();
        // Fall through to normal AI processing
      }
    }

    chatInput.value = '';
    chatSend.disabled = true;
    if (document.body.dataset.panel === 'bar') setPanelState('chat');
    addBubble(text, 'user');
    messages.push({ role: 'user', content: text });
    showTyping();

    // Build system prompt — inject feedback data whenever a Helion message is sent
    let feedbackBlock = '';
    const hasHelion = text.toLowerCase().includes('helion');
    if (hasHelion) {
      unlockHelionAccess();
      const items = await fetchFeedback();
      feedbackBlock = formatFeedbackBlock(items);
    }
    const system = buildSystemPrompt(feedbackBlock);

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, messages }),
      });
      const data = await res.json();
      removeTyping();

      if (data.content && data.content[0]) {
        const raw = data.content[0].text;
        const { cleanText, feedback, context, conflict } = parseSentinels(raw);
        messages.push({ role: 'assistant', content: cleanText });
        addBubble(cleanText, 'assistant');
        saveChatHistory();
        if (feedback) {
          if (_sessionUserName) {
            // Name already known — store feedback with name, skip name gate
            feedback.name = _sessionUserName;
            await storeFeedback(feedback);
          } else {
            // No name yet — store without name, activate name gate
            var fbId = await storeFeedback(feedback);
            _pendingFeedback = { feedbackId: fbId, feedbackObj: feedback, retries: 0 };
            savePendingFeedback();
          }
        }
        if (context) storeHelionContext(context.text);
        if (conflict) _pendingContextApproval = conflict;
      } else if (data.error) {
        addErrorBubble(data.error.message || 'API error');
      }
    } catch (err) {
      removeTyping();
      addErrorBubble('Failed to connect. Is the proxy deployed?');
    }
    chatSend.disabled = false;
    chatInput.focus();
  }

  function addErrorBubble(text) {
    const div = document.createElement('div');
    div.className = 'chat-error';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addEventBubble(label) {
    const div = document.createElement('div');
    div.className = 'chat-bubble-event';
    div.innerHTML = '<span class="chat-bubble-event-icon">ℹ</span><span>' + label + '</span>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showEventPopup(text) {
    const container = document.getElementById('chat-popup-container');
    if (!container) return;

    const { cleanText } = parseSentinels(text);
    const popup = document.createElement('div');
    popup.className = 'chat-popup';

    const content = document.createElement('div');
    content.innerHTML = renderBotMessage(cleanText);
    popup.appendChild(content);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'chat-popup-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    popup.appendChild(closeBtn);

    container.appendChild(popup);

    let fadeTimer, removeTimer;

    function startTimer() {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      fadeTimer = setTimeout(() => {
        popup.classList.add('fading');
        removeTimer = setTimeout(() => popup.remove(), 5100);
      }, 10000);
    }

    function resetTimer() {
      popup.classList.remove('fading');
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      startTimer();
    }

    closeBtn.addEventListener('click', () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      popup.remove();
    });

    popup.addEventListener('mouseenter', resetTimer);
    startTimer();
  }

  async function _sendEvent(label) {
    // Skip if this exact event has already been recorded in the conversation
    const eventKey = '[EVENT: ' + label + ']';
    if (messages.some(m => m.role === 'user' && m.content === eventKey)) return;

    const isBarMode = document.body.dataset.panel === 'bar';
    addEventBubble(label);
    messages.push({ role: 'user', content: eventKey });
    showTyping();
    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: buildSystemPrompt(), messages }),
      });
      const data = await res.json();
      removeTyping();
      if (data.content && data.content[0]) {
        const reply = data.content[0].text;
        messages.push({ role: 'assistant', content: reply });
        addBubble(reply, 'assistant');
        if (isBarMode) showEventPopup(reply);
        saveChatHistory();
      }
    } catch (err) {
      removeTyping(); // fail silently — no error bubble for background events
    }
  }

  let _eventTimer = null;
  let _pendingContextApproval = null; // holds {new, original} awaiting user yes/no after a conflict
  let _pendingFeedback = null;        // holds feedback object awaiting name before storing
  let _sessionUserName = null;        // cached user name for the session (persisted in localStorage)

  function sendEvent(label) {
    clearTimeout(_eventTimer);
    _eventTimer = setTimeout(() => _sendEvent(label), 300);
  }

  // ── Feedback & context storage ────────────────────────────

  const HELION_CONTEXT_KEY    = 'trengo_design_context';
  const CHAT_HISTORY_KEY      = 'trengo_chat_history';
  const SESSION_USER_NAME_KEY = 'trengo_session_user_name';
  const PENDING_FEEDBACK_KEY  = 'trengo_pending_feedback';

  function saveChatHistory() {
    try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages)); } catch { /* full */ }
  }

  function loadChatHistory() {
    try { return JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]'); }
    catch { return []; }
  }

  function clearChatHistory() {
    localStorage.removeItem(CHAT_HISTORY_KEY);
  }

  // ── Session user name helpers ──────────────────────────────
  function loadSessionUserName() {
    try { return localStorage.getItem(SESSION_USER_NAME_KEY) || null; }
    catch { return null; }
  }
  function saveSessionUserName(name) {
    _sessionUserName = name;
    try { localStorage.setItem(SESSION_USER_NAME_KEY, name); } catch { /* full */ }
  }

  // ── Pending feedback persistence (sessionStorage) ──────────
  function savePendingFeedback() {
    try {
      if (_pendingFeedback) {
        sessionStorage.setItem(PENDING_FEEDBACK_KEY, JSON.stringify(_pendingFeedback));
      } else {
        sessionStorage.removeItem(PENDING_FEEDBACK_KEY);
      }
    } catch { /* ignore */ }
  }
  function loadPendingFeedback() {
    try {
      var raw = sessionStorage.getItem(PENDING_FEEDBACK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function loadHelionContext() {
    try { return JSON.parse(localStorage.getItem(HELION_CONTEXT_KEY) || '[]'); }
    catch { return []; }
  }

  function storeHelionContext(text) {
    const items = loadHelionContext();
    items.push({ text, timestamp: new Date().toISOString() });
    localStorage.setItem(HELION_CONTEXT_KEY, JSON.stringify(items));
  }

  async function storeFeedback(feedbackObj) {
    try {
      const res = await fetch(PROXY_URL.replace(/\/$/, '') + '/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackObj),
      });
      const data = await res.json();
      return data.id || null;
    } catch (e) { return null; }
  }

  async function updateFeedback(id, patch) {
    if (!id) return;
    try {
      await fetch(PROXY_URL.replace(/\/$/, '') + '/feedback/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (e) { /* fail silently */ }
  }

  async function fetchFeedback() {
    try {
      const res = await fetch(PROXY_URL.replace(/\/$/, '') + '/feedback');
      if (!res.ok) {
        console.error('[fetchFeedback] Worker returned', res.status);
        return [];
      }
      const data = await res.json();
      return data.feedback || [];
    } catch (e) {
      console.error('[fetchFeedback] Network error:', e);
      return [];
    }
  }

  function looksLikeName(text) {
    var t = text.trim();
    if (!t || t.length > 50 || t.includes('?')) return false;
    var words = t.split(/\s+/);
    if (words.length > 5) return false;
    if (words.some(function(w) { return w.length > 20; })) return false;
    return true;
  }

  function formatFeedbackBlock(items) {
    if (!items.length) return '';
    const lines = items.map(f => {
      const nameStr = f.name ? ` (from ${f.name})` : '';
      return '• ' + (f.section || 'General') + ' — ' + f.text + nameStr;
    }).join('\n');
    return '----------------------------------------------------------------------\nFEEDBACK_DATA\n----------------------------------------------------------------------\n' + lines;
  }

  function buildSystemPrompt(feedbackBlock) {
    feedbackBlock = feedbackBlock || '';
    let prompt = SYSTEM_PROMPT_BASE;
    // Inject session user name if known
    if (_sessionUserName) {
      prompt += '\n----------------------------------------------------------------------\nSESSION_USER_NAME: ' + _sessionUserName + '\n----------------------------------------------------------------------';
    }
    // Inject name retry signal if the user was asked but didn't provide a name
    if (_pendingFeedback && _pendingFeedback.retries > 0 && _pendingFeedback.retries < 2) {
      prompt += '\nNAME_RETRY_PENDING: The user was asked for their name but responded with something else. Re-ask once politely at the end of your response.';
    }
    const ctx = loadHelionContext();
    if (ctx.length > 0) {
      prompt += '\n----------------------------------------------------------------------\nDESIGN RATIONALE CONTEXT\nThese entries represent decisions and updates made after the initial specification.\nFor any topic they address, prefer these over the base specification above.\n----------------------------------------------------------------------\n';
      prompt += ctx.map(c => '• ' + c.text).join('\n');
    }
    if (feedbackBlock) {
      prompt += '\n' + feedbackBlock;
    }
    return prompt;
  }

  // Parse sentinels from bot response; returns { cleanText, feedback, context, conflict }
  function parseSentinels(text) {
    let feedback = null;
    let context = null;
    let conflict = null;
    let clean = text;

    const fbMatch = clean.match(/<<FEEDBACK:(\{[\s\S]*?\})>>/);
    if (fbMatch) {
      try { feedback = JSON.parse(fbMatch[1]); } catch {}
      clean = clean.replace(fbMatch[0], '').trim();
    }

    const ctxMatch = clean.match(/<<CONTEXT:(\{[\s\S]*?\})>>/);
    if (ctxMatch) {
      try { context = JSON.parse(ctxMatch[1]); } catch {}
      clean = clean.replace(ctxMatch[0], '').trim();
    }

    const conflictMatch = clean.match(/<<CONFLICT:(\{[\s\S]*?\})>>/);
    if (conflictMatch) {
      try { conflict = JSON.parse(conflictMatch[1]); } catch {}
      clean = clean.replace(conflictMatch[0], '').trim();
    }

    return { cleanText: clean, feedback, context, conflict };
  }

  chatSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Initialise default panel state on page load
  setPanelState('chat');

  // Restore session user name and pending feedback state
  _sessionUserName = loadSessionUserName();
  _pendingFeedback = loadPendingFeedback();

  // Restore persisted chat history, or show greeting for a fresh session
  const _savedHistory = loadChatHistory();
  if (_savedHistory.length > 0) {
    messages.push(..._savedHistory);
    _savedHistory.forEach(msg => {
      if (msg.role === 'user' && msg.content.startsWith('[EVENT:')) return;
      addBubble(msg.content, msg.role === 'user' ? 'user' : 'assistant');
    });
  } else {
    addBubble('I\'m here to help. I\'ll provide context as you explore and capture your feedback. Share questions or thoughts anytime.', 'assistant');
  }

  // Nav toast — show "Outside prototype scope." for non-settings nav clicks
  const navToast = document.getElementById('nav-toast');
  let navToastTimer = null;
  document.querySelectorAll('.nav-item:not([data-nav="settings"])').forEach(item => {
    item.addEventListener('click', () => {
      clearTimeout(navToastTimer);
      navToast.classList.add('visible');
      navToastTimer = setTimeout(() => navToast.classList.remove('visible'), 3000);
    });
  });

  // Expose event tracker for click handlers outside this IIFE
  window.sendEvent = sendEvent;

  // ── ONBOARDING OVERLAY ──────────────────────────────────────
  const ONBOARDING_KEY = 'trengo_onboarding_done';
  const ONBOARDING_STEPS = [
    {
      text: 'The Guide is not part of the prototype \u2014 it\u2019s internal only. Use it to ask questions and provide feedback.',
      getTargets: () => [document.querySelector('#ai-panel')],
      placement: 'left-of-panel'
    },
    {
      text: 'The Analytics navigation answers operational questions: Overview (where to look), Understand (why work enters), Operate (is it flowing), Improve (what changes help), and Automate (what runs without humans).',
      getTargets: () => [document.querySelector('#sub-nav')],
      placement: 'above-subnav'
    },
    {
      text: 'Use the settings icon to preview how this dashboard appears for different roles and use cases. This will most likely be configuration that Trengo or an admin would set up for users.',
      getTargets: () => [document.querySelector('#settings-nav')],
      placement: 'right-of-cog'
    },
    {
      text: 'Customise which metrics are visible in each section. Add hidden widgets or remove ones you don\u2019t need.',
      getTargets: () => [
        document.querySelector('.add-widget-btn[data-section="overview"]'),
        document.querySelector('#section-overview .widget-action-btn')
      ],
      placement: 'center-dual'
    }
  ];

  let onboardingStep = 0;
  const overlay       = document.getElementById('onboarding-overlay');
  const stepsContainer = document.getElementById('onboarding-steps');
  const arrowsSvg     = document.getElementById('onboarding-arrows');

  function arrowGeometry(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(dist * 0.3, 60);
    const nx = -dy / dist * curvature;
    const ny =  dx / dist * curvature;
    const mx = (x1 + x2) / 2 + nx;
    const my = (y1 + y2) / 2 + ny;
    // Tangent direction at t=1 on quadratic bezier
    const tx = x2 - mx, ty = y2 - my;
    const tLen = Math.sqrt(tx * tx + ty * ty);
    const ux = tx / tLen, uy = ty / tLen; // unit tangent
    const px = -uy,       py =  ux;       // unit perpendicular
    return { mx, my, ux, uy, px, py };
  }

  function drawArrow(x1, y1, x2, y2) {
    const HEAD = 13;   // arrowhead length
    const WING = 0.38; // half-width ratio relative to HEAD

    const { mx, my, ux, uy, px, py } = arrowGeometry(x1, y1, x2, y2);

    // Stop the path slightly before the tip so the stroke doesn't bleed through
    const pathEndX = x2 - ux * HEAD * 0.6;
    const pathEndY = y2 - uy * HEAD * 0.6;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1},${y1} Q${mx},${my} ${pathEndX},${pathEndY}`);
    arrowsSvg.appendChild(path);

    // Arrowhead — sharp isoceles triangle pointing at (x2, y2)
    const tipX = x2, tipY = y2;
    const baseX = tipX - ux * HEAD;
    const baseY = tipY - uy * HEAD;
    const p1x = baseX + px * HEAD * WING;
    const p1y = baseY + py * HEAD * WING;
    const p2x = baseX - px * HEAD * WING;
    const p2y = baseY - py * HEAD * WING;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('points', `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`);
    arrowsSvg.appendChild(arrow);
  }

  function positionStep(index) {
    arrowsSvg.innerHTML = '';
    const step = ONBOARDING_STEPS[index];
    const card = stepsContainer.children[index];
    if (!card) return;

    const targets = step.getTargets();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Reset card position so we can measure it
    card.style.top = '0px';
    card.style.left = '0px';
    card.style.removeProperty('right');
    const cardRect = card.getBoundingClientRect();
    const cw = cardRect.width;
    const ch = cardRect.height;

    if (step.placement === 'left-of-panel') {
      const panel = targets[0];
      if (!panel) return;
      const pr = panel.getBoundingClientRect();
      // Centre card in the main content area, vertically near panel top
      const mainLeft = 64;
      const centerX = (mainLeft + pr.left) / 2;
      const cardLeft = centerX - cw / 2;
      const cardTop = pr.top + 140;
      card.style.left = cardLeft + 'px';
      card.style.top = cardTop + 'px';
      // Arrow from card right edge to panel top area
      drawArrow(cardLeft + cw + 4, cardTop + ch / 2, pr.left + (pr.width / 2), pr.top + 58);

    } else if (step.placement === 'above-subnav') {
      const nav = targets[0];
      if (!nav) return;
      const nr = nav.getBoundingClientRect();
      // Position card below the sub-nav with a larger gap to clear the header/subtitle
      const mainLeft = 64; // sidebar width
      const mainRight = vw;
      const centerX = (mainLeft + mainRight) / 2;
      const cardLeft = centerX - cw / 2;
      const cardTop = nr.bottom + 80;
      card.style.left = cardLeft + 'px';
      card.style.top = cardTop + 'px';
      // Arrow from card top-center UP to sub-nav bottom edge
      drawArrow(cardLeft + cw / 2, cardTop - 4, nr.left + nr.width * 0.35, nr.bottom - 4);

    } else if (step.placement === 'right-of-cog') {
      const cog = targets[0];
      if (!cog) return;
      const cr = cog.getBoundingClientRect();
      // Card well to the right of sidebar so arrow is clearly visible
      const cardLeft = 140;
      const cardTop = cr.top + cr.height / 2 - ch / 2;
      card.style.left = cardLeft + 'px';
      card.style.top = cardTop + 'px';
      // Arrow from card left edge to just right of cog
      drawArrow(cardLeft - 4, cardTop + ch / 2, cr.right + 2, cr.top + cr.height / 2);

    } else if (step.placement === 'center-dual') {
      const mainLeft = 64;
      const mainRight = vw;
      const centerX = (mainLeft + mainRight) / 2;
      const centerY = vh / 2;
      const cardLeft = centerX - cw / 2;
      const cardTop = centerY - ch / 2;
      card.style.left = cardLeft + 'px';
      card.style.top = cardTop + 'px';

      // Arrow 1: to manage widgets button
      if (targets[0]) {
        const br = targets[0].getBoundingClientRect();
        drawArrow(cardLeft + cw - 20, cardTop + 10, br.left + br.width / 2, br.top + br.height / 2);
      }
      // Arrow 2: to widget X button (start from same top-right corner as arrow 1)
      if (targets[1]) {
        const xr = targets[1].getBoundingClientRect();
        drawArrow(cardLeft + cw - 20, cardTop + 10, xr.left + xr.width / 2, xr.top + xr.height / 2);
      }
    }
  }

  function updateDots() {
    // Each card has its own dot set — only update the active card's dots
    const card = stepsContainer.children[onboardingStep];
    if (!card) return;
    card.querySelectorAll('.onboarding-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === onboardingStep);
    });
  }

  function updateNextButton() {
    const card = stepsContainer.children[onboardingStep];
    if (!card) return;
    const nextText = card.querySelector('.onboarding-next-text');
    const nextIcon = card.querySelector('.onboarding-next-icon');
    const skipBtn  = card.querySelector('.onboarding-skip');
    const isLast   = onboardingStep === ONBOARDING_STEPS.length - 1;
    if (nextText) nextText.textContent = isLast ? 'Done' : 'Next';
    if (nextIcon) nextIcon.innerHTML = isLast
      ? '<polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<polyline points="9 6 15 12 9 18" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    if (skipBtn) skipBtn.classList.toggle('hidden', isLast);
  }

  function showStep(index) {
    const cards = stepsContainer.querySelectorAll('.onboarding-step-card');
    cards.forEach((c, i) => {
      if (i === index) {
        c.style.display = '';
        c.classList.remove('exit');
        // Position before making visible so card doesn't flash at wrong spot
        positionStep(index);
        // Force reflow then add active
        void c.offsetWidth;
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
    updateDots();
    updateNextButton();
  }

  function nextOnboardingStep() {
    const cards = stepsContainer.querySelectorAll('.onboarding-step-card');
    const current = cards[onboardingStep];
    if (current) {
      current.classList.remove('active');
      current.classList.add('exit');
    }

    onboardingStep++;
    if (onboardingStep >= ONBOARDING_STEPS.length) {
      closeOnboarding();
      return;
    }

    // Wait for exit transition, then show next
    setTimeout(() => {
      if (current) current.style.display = 'none';
      showStep(onboardingStep);
    }, 350);
  }

  function closeOnboarding() {
    overlay.classList.add('closing');
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.classList.remove('closing');
    }, 350);
  }

  function showOnboarding() {
    stepsContainer.innerHTML = '';

    ONBOARDING_STEPS.forEach((step, i) => {
      const card = document.createElement('div');
      card.className = 'onboarding-step-card';

      // Text body
      const body = document.createElement('p');
      body.className = 'onboarding-step-text';
      body.textContent = step.text;
      card.appendChild(body);

      // Footer: dots · skip · next
      const footer = document.createElement('div');
      footer.className = 'onboarding-card-footer';

      // Dots (same set in every card, active one updated per step)
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'onboarding-dots';
      ONBOARDING_STEPS.forEach((_, di) => {
        const dot = document.createElement('div');
        dot.className = 'onboarding-dot' + (di === i ? ' active' : '');
        dotsWrap.appendChild(dot);
      });

      // Skip button
      const skipBtn = document.createElement('button');
      skipBtn.className = 'onboarding-skip';
      skipBtn.innerHTML = 'Skip intro <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      skipBtn.addEventListener('click', closeOnboarding);

      // Next/Done button
      const nextBtn = document.createElement('button');
      nextBtn.className = 'onboarding-next';
      nextBtn.innerHTML = '<span class="onboarding-next-text">Next</span><svg class="onboarding-next-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
      nextBtn.addEventListener('click', nextOnboardingStep);

      footer.appendChild(dotsWrap);
      footer.appendChild(skipBtn);
      footer.appendChild(nextBtn);
      card.appendChild(footer);

      if (i !== 0) card.style.display = 'none';
      stepsContainer.appendChild(card);
    });

    onboardingStep = 0;
    overlay.style.display = 'block';
    updateNextButton();

    // Position first step after a short delay so layout is computed
    setTimeout(() => {
      const firstCard = stepsContainer.children[0];
      if (firstCard) {
        positionStep(0);
        void firstCard.offsetWidth;
        firstCard.classList.add('active');
      }
    }, 50);
  }

  function initOnboarding() {
    if (localStorage.getItem(ONBOARDING_KEY)) return;

    // Wait for analytics page to be visible, then show onboarding
    const waitForReady = () => {
      const analyticsPage = document.getElementById('analytics-page');
      if (analyticsPage && analyticsPage.style.display !== 'none') {
        // Force mount overview section if not loaded (needed for step 4 widget X target)
        const overviewContent = document.querySelector('.section-content[data-section="overview"]');
        if (overviewContent && !overviewContent.classList.contains('loaded')) {
          mountSection('overview');
        }
        // Small extra delay to let mount finish rendering
        setTimeout(showOnboarding, 100);
      } else {
        setTimeout(waitForReady, 200);
      }
    };
    setTimeout(waitForReady, 300);
  }

  // Reposition on resize
  let onboardingResizeTimer;
  window.addEventListener('resize', () => {
    if (overlay.style.display === 'none') return;
    clearTimeout(onboardingResizeTimer);
    onboardingResizeTimer = setTimeout(() => positionStep(onboardingStep), 100);
  });

  initOnboarding();
})();
