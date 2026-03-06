/* ============================================================
   TRENGO ANALYTICS PROTOTYPE — Widget Catalog
   ============================================================
   Static definitions for all available widgets, sections (tabs),
   and teams. Extracted from app.js so they can be referenced by
   the AI onboarding agent and kept separate from runtime logic.
   ============================================================ */

// ── DEFAULT TABS / SECTIONS ───────────────────────────────────
const DEFAULT_TABS = [
  { id: 'overview',   label: 'Overview',   category: 'overview',   isDefault: true },
  { id: 'understand', label: 'Understand', category: 'understand', isDefault: true },
  { id: 'operate',    label: 'Operate',    category: 'operate',    isDefault: true },
  { id: 'improve',    label: 'Improve',    category: 'improve',    isDefault: true },
  { id: 'automate',   label: 'Automate',   category: 'automate',   isDefault: true },
];

// ── TEAM DEFINITIONS ──────────────────────────────────────────
const TEAMS_DATA = [
  { name: 'Sales team',    members: ['Tycho', 'Kat', 'Raymond'] },
  { name: 'SMB Central',   members: ['Greg Aquino', 'Deborah Pia'] },
  { name: 'Mid-Market',    members: ['Federico Lai', 'Rowan Milwid'] },
  { name: 'Expansion',     members: ['Dmytro Hachok', 'Victor Montala'] },
  { name: 'Retention',     members: ['Isabella Escobar', 'Greg Aquino', 'Deborah Pia'] },
  { name: 'Core Services', members: ['Rowan Milwid', 'Federico Lai', 'Donovan van der Weerd'] },
];

// ── WIDGET DEFINITIONS ─────────────────────────────────────────
// vis: 'always' | 'default' | 'hidden'  (base visibility before state logic)
//
// Each widget can have a `states` object describing per-state overrides.
// Keys are "support_supervisor", "support_agent", "sales_supervisor", "sales_agent".
// Values: 'show' | 'hide' | 'emphasize' | 'deemphasize'
// If a state key is absent the base `vis` applies.
//
// `scopeLabel` — optional object { supervisor: '...', agent: '...' } to swap
//   the KPI sub-label depending on role.
// `tooltipByState` — optional object keyed same as `states` to swap tooltip text.

function getSectionForWidget(widgetId) {
  for (const [sid, ws] of Object.entries(WIDGETS)) {
    if (ws.some(w => w.id === widgetId)) return sid;
  }
  return null;
}

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
    { id: 'ov-escalation-rate', title: 'Escalation rate (AI → human)', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of AI-handled tickets escalated to a human agent. Rising rates suggest knowledge or confidence gaps in AI.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'ov-resolution-time', title: 'Resolution time', vis: 'default', type: 'kpi',
      tooltip: 'Median time from ticket creation to resolution. Long times signal process or knowledge gaps.',
      scopeLabel: { supervisor: 'Median — all agents', agent: 'Your median' },
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'ov-pipeline-value', title: 'Pipeline value', vis: 'default', type: 'kpi',
      tooltip: 'Total value of all open deals in the pipeline.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'ov-win-rate', title: 'Win rate', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of opportunities that resulted in a closed-won deal.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'ov-avg-deal-size', title: 'Avg deal size', vis: 'default', type: 'kpi',
      tooltip: 'Average revenue per closed-won deal over the selected period.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'ov-avg-sales-cycle', title: 'Avg sales cycle', vis: 'default', type: 'kpi',
      tooltip: 'Average number of days from deal creation to close (won or lost).',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'ov-tickets-by-hour', title: 'Tickets created by hour', vis: 'default', type: 'bar-chart', fullWidth: true, sizeClass: 'large',
      tooltip: 'Hourly distribution of new tickets. Use this to plan staffing and identify peak demand windows.',
      states: { support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'ov-vc-missed-calls', title: 'Missed calls', vis: 'default', type: 'kpi',
      tooltip: 'Total calls that rang without being answered. A rising trend signals understaffing or poor routing.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'ov-vc-total-calls', title: 'Total calls', vis: 'default', type: 'kpi',
      tooltip: 'Total calls handled across all voice channels in the selected period. Includes inbound and outbound.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'ov-intent-trends', title: 'Intent trend highlights', vis: 'default', type: 'list', halfWidth: true,
      tooltip: 'Top rising and declining customer intents. Helps you anticipate demand shifts before they become critical.',
      drill: { label: 'See why →', target: 'understand' },
      states: { support_agent: 'hide', sales_supervisor: 'emphasize', sales_agent: 'hide' }
    },
    { id: 'ov-knowledge-gaps', title: 'Knowledge gap alerts', vis: 'hidden', type: 'kpi',
      tooltip: 'Count of unresolved or fallback cases where the AI lacked sufficient knowledge to respond.',
      drill: { label: 'Improve this →', target: 'improve' },
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'ov-exceptions', title: 'Exceptions requiring attention', vis: 'hidden', type: 'list', halfWidth: true,
      tooltip: 'System-detected anomalies or risks that may need immediate attention.',
      drill: { label: 'Check automation →', target: 'automate' },
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'ov-vc-calls-by-hour', title: 'Calls by hour of day', vis: 'default', type: 'bar-chart', fullWidth: true, sizeClass: 'large',
      tooltip: 'Hourly distribution of call volume — today vs 30-day average. Compare with ticket demand peaks to plan staffing across channels.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
  ],
  // ─── UNDERSTAND ──────────────────
  understand: [
    { id: 'un-tickets-created', title: 'Tickets created', vis: 'always', type: 'line-chart', halfWidth: true,
      tooltip: 'Trend of new tickets created over the selected period.',
      states: { sales_supervisor: 'deemphasize', sales_agent: 'hide' }
    },
    { id: 'un-leads-created', title: 'New leads', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'New contacts (leads) created per day, broken down by channel.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'un-deals-created', title: 'Deals created', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'New deals created per day, broken down by channel.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'un-sales-funnel', title: 'Sales pipeline funnel', vis: 'default', type: 'funnel', fullWidth: true, sizeClass: 'large',
      tooltip: 'Deal count at each pipeline stage. Declining bars show conversion drop-off between stages.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'un-deals-won-by-channel', title: 'Deals closed by channel (Won)', vis: 'default', type: 'doughnut-chart',
      tooltip: 'Breakdown of closed-won deals by last communication channel. Shows which channels drive successful closes.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'un-deals-by-channel', title: 'Deals created by channel', vis: 'default', type: 'doughnut-chart',
      tooltip: 'Distribution of newly created deals by the contact\'s entry channel.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'un-entry-channels', title: 'Entry channels', vis: 'always', type: 'bar-chart', halfWidth: true,
      tooltip: 'Distribution of tickets and contacts by channel (email, WhatsApp, chat, etc.).',
      tooltipByState: {
        sales_supervisor: 'Which channels bring in new contacts and pipeline entries.',
        sales_agent: 'Where your contacts are coming from.'
      },
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'un-vc-inbound-outbound', title: 'Inbound vs outbound calls', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'Daily split of inbound calls (connected vs missed) and outbound calls (connected vs not connected). Complements the entry channels breakdown with voice-specific composition.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'un-vc-duration-inbound-outbound', title: 'Duration: inbound vs outbound', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'Daily comparison of average call duration for inbound and outbound calls. Pairs with the inbound/outbound volume split above.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'deemphasize', sales_supervisor: 'show', sales_agent: 'hide' }
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
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'un-escalations-intent', title: 'Escalations by intent', vis: 'hidden', type: 'bar-chart',
      tooltip: 'Which intents most frequently result in escalation. Shows where understanding breaks down.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'un-vc-channel-performance', title: 'Voice channel performance', vis: 'default', type: 'table', fullWidth: true, sizeClass: 'large',
      tooltip: 'Per-channel summary of key voice metrics. Compare channel performance and identify underperforming channels.',
      hideWhenChannelFiltered: true, hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
  ],
  // ─── OPERATE ─────────────────────
  operate: [
    { id: 'op-first-response', title: 'First response time', vis: 'always', type: 'kpi',
      tooltip: 'Median first response time for the selected period.',
      scopeLabel: { supervisor: 'Median — all agents', agent: 'Your median' },
      states: { sales_supervisor: 'deemphasize', sales_agent: 'deemphasize' }
    },
    { id: 'op-vc-time-to-answer', title: 'Time to answer', vis: 'default', type: 'kpi',
      tooltip: 'Average time from a call arriving to an agent answering. The voice equivalent of first response time.',
      scopeLabel: { supervisor: 'Avg — all agents', agent: 'Your average' },
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'show', sales_supervisor: 'show', sales_agent: 'show' }
    },
    { id: 'op-vc-call-duration-kpis', title: 'Call duration', vis: 'default', type: 'kpi-group',
      tooltip: 'Average, longest and shortest call duration this period. Pairs with time-to-answer as the two key per-call efficiency metrics.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'show', sales_supervisor: 'show', sales_agent: 'show' }
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
    { id: 'op-sales-performance', title: 'Sales performance', vis: 'default', type: 'table', fullWidth: true, sizeClass: 'large',
      tooltip: 'Per-agent sales performance: leads, deals created, pipeline value, revenue, and win rate.',
      states: { support_supervisor: 'hide', support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-channel-stage-matrix', title: 'Channel × stage', vis: 'default', type: 'table', fullWidth: true, sizeClass: 'large',
      tooltip: 'Deal counts by channel and pipeline stage. Shows which channels drive deals furthest in the funnel.',
      states: { support_supervisor: 'hide', support_agent: 'hide' }
    },
    { id: 'op-vc-calls-by-team', title: 'Calls by team', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'Inbound and outbound call volume distributed by team. Voice equivalent of workload by agent.',
      hideWhenTeamFiltered: true, hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'op-vc-avg-wait-by-team', title: 'Average wait time by team', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'Average caller wait time per team before an agent answers. Helps identify which teams need more voice capacity.',
      hideWhenTeamFiltered: true, hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'op-vc-longest-wait', title: 'Longest wait time', vis: 'default', type: 'kpi',
      tooltip: 'The single longest wait time recorded this period. Outliers indicate routing or capacity failures.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'op-vc-duration-by-team', title: 'Call duration by team', vis: 'default', type: 'bar-chart', halfWidth: true,
      tooltip: 'Average call duration per team. Long durations may indicate complex queries or insufficient agent knowledge.',
      hideWhenTeamFiltered: true, hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'op-sla-compliance', title: 'SLA compliance', vis: 'default', type: 'progress',
      tooltip: 'Percentage of tickets meeting SLA targets for response and resolution.',
      scopeLabel: { supervisor: '87% of tickets within SLA', agent: '91% of your tickets within SLA' },
      states: { sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-bottlenecks', title: 'Ticket counts per status or stage', vis: 'always', type: 'bar-chart',
      tooltip: 'Where tickets are getting stuck in your workflow.',
      states: { support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' },
      tooltipByState: { sales_supervisor: 'Where contacts are getting stuck in your pipeline stages.' }
    },
    { id: 'op-channel-perf', title: 'Performance by channel', vis: 'default', type: 'table', fullWidth: true, sizeClass: 'large',
      tooltip: 'Key metrics broken down by channel. Click a row to filter the entire view by that channel.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-capacity-demand', title: 'Capacity vs demand', vis: 'hidden', type: 'line-chart', halfWidth: true,
      tooltip: 'Volume of incoming work vs available agent capacity. Gaps indicate understaffing.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
    },
    { id: 'op-vc-abandonment-trend', title: 'Call abandonment trend', vis: 'default', type: 'line-chart', halfWidth: true,
      tooltip: 'Percentage of callers who hung up before being answered, plotted against total call volume. Rising abandon rate signals capacity shortfall.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'op-vc-callbacks-requested', title: 'Callback requests', vis: 'default', type: 'kpi',
      tooltip: 'Callers who opted into a callback instead of waiting on hold. High numbers signal demand vs capacity mismatch.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
    },
    { id: 'op-vc-agent-online-status', title: 'Agent online status', vis: 'default', type: 'agent-status',
      tooltip: 'Current online status of agents across voice channels. Real-time availability view for supervisors.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'show', sales_agent: 'hide' }
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
    { id: 'im-vc-fcr-rate', title: 'First call resolution', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of calls resolved in a single call without a callback or follow-up ticket. The voice equivalent of CSAT.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'emphasize', support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-vc-call-ticket-rate', title: 'Call-to-ticket rate', vis: 'default', type: 'kpi',
      tooltip: 'Percentage of calls that result in a ticket being created afterward. High rates signal agents are not fully resolving on the call — a coaching or knowledge-base improvement signal.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
    },
    { id: 'im-responses', title: 'CSAT Breakdown', vis: 'default', type: 'kpi-group',
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
      states: {}
    },
    { id: 'im-knowledge-gaps', title: 'Knowledge gaps by intent', vis: 'hidden', type: 'bar-chart',
      tooltip: 'Which intents have the most knowledge gaps, driving poor outcomes.',
      states: { support_agent: 'show', sales_supervisor: 'hide', sales_agent: 'show' },
      tooltipByState: { support_agent: 'Knowledge gaps you encountered most often.' }
    },
    { id: 'im-suggested-knowledge', title: 'Suggested knowledge additions', vis: 'default', type: 'list-actions', halfWidth: true,
      tooltip: 'AI-suggested knowledge base articles to fill gaps. Approve or reject each suggestion.',
      states: { support_agent: 'hide', sales_agent: 'hide' }
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
    { id: 'au-vc-ivr-queue-time', title: 'Time in IVR / queue', vis: 'default', type: 'kpi',
      tooltip: 'Average time callers spend navigating IVR menus or waiting in queues before reaching an agent. High values indicate automation underperformance in the pre-agent layer.',
      hideWhenNonVoiceChannel: true,
      states: { support_supervisor: 'show', support_agent: 'hide', sales_supervisor: 'hide', sales_agent: 'hide' }
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

// Flat lookup: widget ID → widget definition (with _sourceCategory attached)
const WIDGET_BY_ID = {};
Object.keys(WIDGETS).forEach(cat => {
  WIDGETS[cat].forEach(w => {
    WIDGET_BY_ID[w.id] = { ...w, _sourceCategory: cat };
  });
});

// Set of all valid widget IDs (used by dashboard-config.js for validation)
const ALL_WIDGET_IDS = new Set(Object.keys(WIDGET_BY_ID));
