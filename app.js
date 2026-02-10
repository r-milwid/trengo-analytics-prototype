/* ============================================================
   TRENGO ANALYTICS PROTOTYPE — app.js
   ============================================================ */

// ── STATE ──────────────────────────────────────────────────────
const state = {
  currentView: 'landing', // 'landing' | 'analytics'
  lens: 'support',        // 'support' | 'sales'
  role: 'supervisor',     // 'supervisor' | 'agent'
  activeSection: 'overview',
  loadedSections: new Set(),
  hiddenWidgets: new Set(),
  addedWidgets: new Set(),
  widgetSpans: {}, // id -> 1 | 2 | 4
  sectionOrder: {}, // sectionId -> [widgetId...]
  sectionLayout: {}, // sectionId -> { rows, placements }
  dateFilter: 'Last 7 days',
  channelFilter: 'All channels',
  teamFilter: 'All teams',
  charts: {},
  mockData: { kpi: {}, lists: {}, tables: {}, charts: {} },
  opportunityStates: {} // id -> 'dismissed' | 'confirmed'
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
    { id: 'op-capacity-demand', title: 'Capacity vs demand', vis: 'hidden', type: 'line-chart',
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

  if (w.vis !== 'always') {
    const hideBtn = document.createElement('button');
    hideBtn.className = 'widget-action-btn';
    hideBtn.title = 'Hide widget';
    hideBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>';
    hideBtn.addEventListener('click', () => hideWidget(w.id, section));
    actions.appendChild(hideBtn);
  }
  header.appendChild(actions);
  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'widget-body';

  switch (w.type) {
    case 'kpi': renderKPI(body, w); break;
    case 'kpi-group': renderKPIGroup(body, w); break;
    case 'bar-chart': renderBarChart(body, w); break;
    case 'line-chart': renderLineChart(body, w); break;
    case 'doughnut-chart': renderDoughnutChart(body, w); break;
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
    });
    card.appendChild(toggleBtn);
  }

  // Drill link
  if (w.drill) {
    const drill = document.createElement('a');
    drill.className = 'drill-link';
    drill.textContent = w.drill.label;
    drill.addEventListener('click', () => scrollToSection(w.drill.target));
    card.appendChild(drill);
  }

  const dragHandle = card.querySelector('.drag-handle');
  dragHandle.addEventListener('pointerdown', (e) => startDrag(e, section, w.id));
  const resizeHandle = card.querySelector('.resize-handle');
  resizeHandle.addEventListener('pointerdown', (e) => startResize(e, section, w.id));

  return card;
}

// ── STATE KEY HELPER ───────────────────────────────────────────
function stateKey() {
  return `${state.lens}_${state.role}`;
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
      <span style="color:var(--gray-400);margin-left:4px">vs prev period</span>
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
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 12 } } }
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
        labels: { font: { family: 'Inter', size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 }
      },
      tooltip: {
        backgroundColor: '#18181b',
        titleFont: { family: 'Inter', size: 12 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 10,
        cornerRadius: 6,
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
        <td style="font-weight:500">${r.agent}</td>
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

  // Check if we need empty tiles for widgets that are effectively hidden and not yet added
  const allWidgets = WIDGETS[sectionId] || [];
  const hiddenCount = allWidgets.filter(w => {
    if (state.addedWidgets.has(w.id)) return false;
    if (state.hiddenWidgets.has(w.id)) return false; // already hidden by user, don't count
    const eff = getEffectiveVisibility(w);
    return eff === 'hidden';
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

window.openWidgetDrawer = function(sectionId) {
  const overlay = document.getElementById('widget-drawer-overlay');
  const body = document.getElementById('drawer-body');
  overlay.style.display = 'flex';

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
      html += `<div class="drawer-widget-item" ${isStateHidden ? 'style="opacity:.4"' : ''}>
        <div>
          <div class="drawer-widget-name">${w.title}</div>
          <div class="drawer-widget-status">${statusText}</div>
        </div>
        ${canToggle ? `<button class="btn btn-sm ${isVisible ? 'btn-secondary' : 'btn-primary'}" onclick="toggleWidgetFromDrawer('${w.id}', '${secId}', ${isVisible})">${isVisible ? 'Hide' : 'Add'}</button>` : ''}
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
};

document.getElementById('drawer-close').addEventListener('click', () => {
  document.getElementById('widget-drawer-overlay').style.display = 'none';
});
document.getElementById('widget-drawer-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('widget-drawer-overlay').style.display = 'none';
  }
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
    if (entry.isIntersecting) {
      const section = entry.target.dataset.section;
      mountSection(section);
    }
  });
}, { rootMargin: '0px', threshold: 0.1 });

function setupSentinels() {
  document.querySelectorAll('.section-sentinel').forEach(s => {
    sentinelObserver.observe(s);
  });
}

// ── SECTION SCROLL OBSERVER (for sub-nav highlight) ────────────
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const section = entry.target.dataset.section;
      setActiveSubNav(section);
    }
  });
}, { rootMargin: '-120px 0px -60% 0px', threshold: 0.1 });

function setupSectionObserver() {
  document.querySelectorAll('.analytics-section').forEach(s => {
    sectionObserver.observe(s);
  });
}

function setActiveSubNav(section) {
  state.activeSection = section;
  document.querySelectorAll('.sub-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });
}

// ── SCROLL TO SECTION ──────────────────────────────────────────
function scrollToSection(sectionId, updateHash = false) {
  const el = document.getElementById(`section-${sectionId}`);
  if (el) {
    const headerH = document.getElementById('analytics-header').offsetHeight;
    const y = el.getBoundingClientRect().top + window.pageYOffset - headerH - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
    setActiveSubNav(sectionId);
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
      setupSentinels();
      setupSectionObserver();
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
    }
    // Other items: do nothing (look real but inert)
  });
});

// Sub-nav clicks
document.querySelectorAll('.sub-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    scrollToSection(btn.dataset.section, true);
  });
});

// ── LENS & ROLE TOGGLES ───────────────────────────────────────
document.querySelectorAll('#lens-toggle .toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.lens = btn.dataset.lens;
    document.querySelectorAll('#lens-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    resetViewState();
    // Snapshot then remount — Set is mutated during remount so we must copy first
    [...state.loadedSections].forEach(s => remountSection(s));
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
  });
});

// User popout toggle
const userAvatar = document.getElementById('user-avatar');
const userPopout = document.getElementById('user-popout');
const userPopoutClose = document.getElementById('user-popout-close');
if (userAvatar && userPopout) {
  userAvatar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (userPopout.style.display === 'block') {
      userPopout.classList.remove('open');
      setTimeout(() => { userPopout.style.display = 'none'; }, 200);
    } else {
      userPopout.style.display = 'block';
      requestAnimationFrame(() => userPopout.classList.add('open'));
    }
    const hint = document.querySelector('.avatar-hint');
    if (hint) hint.style.display = 'none';
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
  if (userPopout.style.display === 'block' && !userPopout.contains(e.target) && !userAvatar.contains(e.target)) {
    userPopout.classList.remove('open');
    setTimeout(() => { userPopout.style.display = 'none'; }, 200);
  }
});

// Ensure popout starts hidden (no auto-open)
window.addEventListener('load', () => {
  if (!userPopout) return;
  userPopout.classList.remove('open');
  userPopout.style.display = 'none';
});

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
    options: ['All teams', 'Support Team', 'Sales Team', 'Technical Team', 'Billing Team'],
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

    content.querySelectorAll('.filter-option').forEach(opt => {
      opt.addEventListener('click', () => {
        state[config.stateKey] = opt.dataset.value;
        chip.querySelector('span').textContent = opt.dataset.value;
        dropdown.style.display = 'none';
        chip.classList.remove('active-filter');
        // Snapshot then remount — Set is mutated during remount so we must copy first
        [...state.loadedSections].forEach(s => remountSection(s));
      });
    });
  });
});

// Close dropdown on outside click
document.addEventListener('click', () => {
  document.getElementById('filter-dropdown').style.display = 'none';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-filter'));
});

// ── ADD WIDGET BUTTONS ─────────────────────────────────────────
document.querySelectorAll('.add-widget-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    openWidgetDrawer(btn.dataset.section);
  });
});

// ── INIT ───────────────────────────────────────────────────────
handleHash();
window.addEventListener('hashchange', handleHash);

// Set Chart.js defaults
Chart.defaults.font.family = 'Inter';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#71717a';
