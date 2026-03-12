const DAY_MS = 24 * 60 * 60 * 1000;
const START_DATE_UTC = Date.UTC(2025, 8, 15);
const TOTAL_DAYS = 210;

const DEFAULT_CHANNELS = ['email', 'whatsapp', 'live-chat', 'voice', 'instagram', 'facebook-messenger'];
const SUPPORT_CHANNEL_WEIGHTS = {
  email: 1.0,
  whatsapp: 1.15,
  'live-chat': 0.9,
  voice: 0.7,
  instagram: 0.45,
  'facebook-messenger': 0.4,
};
const SALES_CHANNEL_WEIGHTS = {
  email: 0.9,
  whatsapp: 0.95,
  'live-chat': 1.0,
  voice: 0.55,
  instagram: 1.2,
  'facebook-messenger': 1.05,
};

const AGENT_NAMES = [
  'Alex', 'Sam', 'Mila', 'Nina', 'Omar', 'Jules', 'Iris', 'Mason',
  'Leah', 'Theo', 'Sara', 'Noah', 'Emma', 'Luca', 'Yara', 'Mika',
];

const METRIC_DEFINITIONS = {
  conversations: { entity: 'team_daily', label: 'Conversations', kind: 'count' },
  tickets_created: { entity: 'team_daily', label: 'Tickets created', kind: 'count' },
  tickets_resolved: { entity: 'team_daily', label: 'Tickets resolved', kind: 'count' },
  first_response_minutes: { entity: 'team_daily', label: 'First response time', kind: 'duration' },
  resolution_hours: { entity: 'team_daily', label: 'Resolution time', kind: 'duration' },
  sla_breaches: { entity: 'team_daily', label: 'SLA breaches', kind: 'count' },
  sla_breach_rate: { entity: 'team_daily', label: 'SLA breach rate', kind: 'rate' },
  csat: { entity: 'team_daily', label: 'CSAT', kind: 'score' },
  ai_assist_rate: { entity: 'team_daily', label: 'AI assistance rate', kind: 'rate' },
  ai_resolution_rate: { entity: 'team_daily', label: 'AI resolution rate', kind: 'rate' },
  handoff_rate: { entity: 'team_daily', label: 'Handoff rate', kind: 'rate' },
  automation_success_rate: { entity: 'team_daily', label: 'Automation success rate', kind: 'rate' },
  deals_created: { entity: 'team_daily', label: 'Deals created', kind: 'count' },
  deals_won: { entity: 'team_daily', label: 'Deals won', kind: 'count' },
  win_rate: { entity: 'team_daily', label: 'Win rate', kind: 'rate' },
  pipeline_value: { entity: 'team_daily', label: 'Pipeline value', kind: 'currency' },
  avg_deal_size: { entity: 'team_daily', label: 'Average deal size', kind: 'currency' },
  sales_cycle_days: { entity: 'team_daily', label: 'Sales cycle', kind: 'duration_days' },
  conversations_handled: { entity: 'agent_daily', label: 'Conversations handled', kind: 'count' },
  agent_csat: { entity: 'agent_daily', label: 'Agent CSAT', kind: 'score' },
};

const METRIC_ALIASES = {
  conversations: 'conversations',
  volume: 'conversations',
  'conversation volume': 'conversations',
  'open tickets': 'tickets_created',
  'tickets created': 'tickets_created',
  'created tickets': 'tickets_created',
  'closed tickets': 'tickets_resolved',
  'resolved tickets': 'tickets_resolved',
  'first response time': 'first_response_minutes',
  frt: 'first_response_minutes',
  'resolution time': 'resolution_hours',
  'sla breaches': 'sla_breaches',
  'sla breach rate': 'sla_breach_rate',
  sla: 'sla_breach_rate',
  csat: 'csat',
  satisfaction: 'csat',
  'ai assist rate': 'ai_assist_rate',
  'ai assistance rate': 'ai_assist_rate',
  'ai resolution rate': 'ai_resolution_rate',
  'handoff rate': 'handoff_rate',
  handoffs: 'handoff_rate',
  'automation success rate': 'automation_success_rate',
  'deals created': 'deals_created',
  'deals won': 'deals_won',
  'win rate': 'win_rate',
  pipeline: 'pipeline_value',
  'pipeline value': 'pipeline_value',
  'average deal size': 'avg_deal_size',
  'avg deal size': 'avg_deal_size',
  'sales cycle': 'sales_cycle_days',
};

function hashSeed(value) {
  return String(value || '').split('').reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeChannel(channel) {
  return String(channel || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function normalizeFocus(likelyFocus) {
  if (likelyFocus === 'resolve' || likelyFocus === 'support') return 'support';
  if (likelyFocus === 'convert' || likelyFocus === 'sales') return 'sales';
  if (likelyFocus === 'both') return 'both';
  return null;
}

function buildTeamDefinitions(customerProfile) {
  const knownTeams = Array.isArray(customerProfile?.knownTeams) && customerProfile.knownTeams.length
    ? customerProfile.knownTeams
    : [
      { name: 'Customer Support', likelyFocus: 'resolve' },
      { name: 'Sales', likelyFocus: 'convert' },
      { name: 'Operations', likelyFocus: 'both' },
    ];

  return knownTeams.map((team, index) => {
    const focus = normalizeFocus(team.likelyFocus) || (index % 2 === 0 ? 'support' : 'sales');
    return {
      key: `team-${index + 1}`,
      name: team.name,
      focus,
      size: Number(team.size || 6 + (index * 2)),
      description: team.description || '',
    };
  });
}

function buildChannels(customerProfile) {
  const channels = Array.isArray(customerProfile?.channels) && customerProfile.channels.length
    ? customerProfile.channels.map(normalizeChannel).filter(Boolean)
    : DEFAULT_CHANNELS;
  return [...new Set(channels)];
}

function buildAgentNames(teamName, count) {
  const prefix = teamName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'TM';
  return Array.from({ length: count }).map((_, index) => `${AGENT_NAMES[index % AGENT_NAMES.length]} ${prefix}${index + 1}`);
}

function getOverlayFactors(customerProfile) {
  const companySeed = hashSeed(customerProfile?.id || customerProfile?.company || 'prototype');
  const rand = mulberry32(companySeed);
  const industry = String(customerProfile?.industry || '').toLowerCase();

  return {
    supportBias: industry.includes('health') ? 1.18 : industry.includes('mobility') ? 1.12 : 1.0,
    salesBias: industry.includes('commerce') ? 1.16 : 1.0,
    voiceBias: industry.includes('health') || industry.includes('mobility') ? 1.12 : 0.88,
    automationBias: 0.92 + rand() * 0.18,
    aiBias: 0.94 + rand() * 0.16,
    csatBias: 0.96 + rand() * 0.1,
    pipelineBias: 0.9 + rand() * 0.22,
  };
}

function buildSyntheticDataset(customerProfile = {}, context = {}) {
  const teams = buildTeamDefinitions(customerProfile);
  const channels = buildChannels(customerProfile);
  const overlay = getOverlayFactors(customerProfile);
  const seedBase = hashSeed(`${customerProfile?.id || customerProfile?.company || 'prototype'}:${context.role || 'admin'}`);
  const rand = mulberry32(seedBase);

  const teamDaily = [];
  const agentDaily = [];

  teams.forEach((team, teamIndex) => {
    const agents = buildAgentNames(team.name, clamp(Math.round(team.size / 2), 3, 8));
    const supportLike = team.focus === 'support' || team.focus === 'both';
    const salesLike = team.focus === 'sales' || team.focus === 'both';
    const baseVolume = (supportLike ? 120 : 45) * (supportLike ? overlay.supportBias : overlay.salesBias) * (0.9 + teamIndex * 0.07);

    for (let dayIndex = 0; dayIndex < TOTAL_DAYS; dayIndex += 1) {
      const dateTs = START_DATE_UTC + (dayIndex * DAY_MS);
      const weekday = new Date(dateTs).getUTCDay();
      const weekdayFactor = weekday === 0 ? 0.72 : weekday === 6 ? 0.81 : weekday === 1 ? 1.06 : 1.0;
      const trendFactor = 0.92 + ((dayIndex / TOTAL_DAYS) * 0.16);
      const seasonalFactor = 1 + (Math.sin((dayIndex / 14) + teamIndex) * 0.08);

      let teamDayConversationTotal = 0;
      let teamDayResolvedTotal = 0;
      let teamDayPipeline = 0;

      channels.forEach((channel, channelIndex) => {
        const channelWeights = salesLike ? SALES_CHANNEL_WEIGHTS : SUPPORT_CHANNEL_WEIGHTS;
        const channelWeight = channelWeights[channel] || 0.65;
        const voiceFactor = channel === 'voice' ? overlay.voiceBias : 1;
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:${channel}:${dayIndex}`));

        const conversations = Math.max(
          2,
          Math.round(baseVolume * channelWeight * weekdayFactor * seasonalFactor * trendFactor * voiceFactor * (0.86 + localRand() * 0.32))
        );
        const ticketsCreated = supportLike
          ? Math.round(conversations * (0.82 + localRand() * 0.16))
          : Math.round(conversations * (0.38 + localRand() * 0.12));
        const ticketsResolved = supportLike
          ? Math.round(ticketsCreated * (0.82 + localRand() * 0.12))
          : Math.round(ticketsCreated * (0.58 + localRand() * 0.14));

        const firstResponseMinutes = round(
          (supportLike ? 26 : 18) * (channel === 'voice' ? 0.55 : 1) * (1.04 - Math.min(dayIndex / TOTAL_DAYS, 0.2)) * (0.92 + localRand() * 0.24),
          1
        );
        const resolutionHours = round(
          (supportLike ? 13 : 38) * (salesLike ? 1.2 : 1) * (0.88 + localRand() * 0.28),
          1
        );
        const slaBreaches = Math.round(ticketsCreated * (supportLike ? 0.06 : 0.03) * (0.8 + localRand() * 0.7));
        const csatResponses = Math.round(Math.max(1, ticketsResolved * (0.22 + localRand() * 0.12)));
        const csatScore = round(clamp((supportLike ? 4.28 : 4.05) * overlay.csatBias * (0.97 + localRand() * 0.06), 3.4, 4.9), 2);
        const aiAssistCount = Math.round(ticketsCreated * clamp((supportLike ? 0.42 : 0.24) * overlay.aiBias * (0.9 + localRand() * 0.2), 0.08, 0.78));
        const aiResolvedCount = Math.round(aiAssistCount * clamp((supportLike ? 0.48 : 0.3) * (0.9 + localRand() * 0.18), 0.05, 0.72));
        const handoffCount = Math.round(ticketsCreated * clamp((supportLike ? 0.16 : 0.08) * (0.9 + localRand() * 0.2), 0.02, 0.32));
        const automationRuns = Math.round(ticketsCreated * clamp((supportLike ? 0.28 : 0.18) * overlay.automationBias * (0.9 + localRand() * 0.2), 0.04, 0.55));
        const automationSuccessCount = Math.round(automationRuns * clamp(0.68 + localRand() * 0.18, 0.45, 0.92));

        const dealsCreated = salesLike ? Math.round(conversations * (0.18 + localRand() * 0.12)) : Math.round(conversations * 0.03 * (0.8 + localRand() * 0.4));
        const dealsWon = Math.round(dealsCreated * clamp((salesLike ? 0.32 : 0.18) * (0.85 + localRand() * 0.25), 0.05, 0.62));
        const avgDealSize = round((salesLike ? 3400 : 850) * overlay.pipelineBias * (0.82 + localRand() * 0.4), 0);
        const pipelineValue = round(dealsCreated * avgDealSize * (1.3 + localRand() * 0.8), 0);
        const salesCycleDays = round((salesLike ? 24 : 8) * (0.84 + localRand() * 0.3), 1);

        teamDaily.push({
          date: formatDate(dateTs),
          team: team.name,
          teamKey: team.key,
          teamFocus: team.focus,
          channel,
          conversations,
          ticketsCreated,
          ticketsResolved,
          firstResponseMinutes,
          resolutionHours,
          slaBreaches,
          csatResponses,
          csatScore,
          aiAssistCount,
          aiResolvedCount,
          handoffCount,
          automationRuns,
          automationSuccessCount,
          dealsCreated,
          dealsWon,
          pipelineValue,
          avgDealSize,
          salesCycleDays,
        });

        teamDayConversationTotal += conversations;
        teamDayResolvedTotal += ticketsResolved;
        teamDayPipeline += pipelineValue;
      });

      agents.forEach((agentName, agentIndex) => {
        const agentRand = mulberry32(hashSeed(`${seedBase}:${team.key}:agent:${agentName}:${dayIndex}`));
        const contribution = 0.7 + ((agentIndex + 1) / (agents.length + 2));
        const conversationsHandled = Math.max(1, Math.round((teamDayConversationTotal / agents.length) * contribution * (0.76 + agentRand() * 0.25)));
        const resolved = Math.max(0, Math.round((teamDayResolvedTotal / agents.length) * contribution * (0.78 + agentRand() * 0.2)));
        const dealsWon = salesLike ? Math.round((teamDayPipeline / Math.max(agents.length * 4200, 1)) * (0.6 + agentRand() * 0.7)) : 0;
        agentDaily.push({
          date: formatDate(dateTs),
          team: team.name,
          agent: agentName,
          teamFocus: team.focus,
          conversationsHandled,
          ticketsResolved: resolved,
          firstResponseMinutes: round((supportLike ? 22 : 17) * (0.88 + agentRand() * 0.26), 1),
          csatScore: round(clamp((supportLike ? 4.3 : 4.08) * (0.96 + agentRand() * 0.06), 3.5, 4.95), 2),
          dealsWon,
          pipelineValue: round((teamDayPipeline / agents.length) * (0.7 + agentRand() * 0.5), 0),
          aiAssistCount: Math.round(conversationsHandled * clamp(0.22 + agentRand() * 0.2, 0.08, 0.54)),
        });
      });
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    customer: customerProfile?.company || 'Prototype customer',
    teams,
    channels,
    teamDaily,
    agentDaily,
  };
}

function getSemanticSchema(customerProfile = {}, context = {}) {
  const dataset = buildSyntheticDataset(customerProfile, context);
  return {
    entities: [
      { id: 'team_daily', label: 'Team daily performance', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'team_daily') },
      { id: 'agent_daily', label: 'Agent daily performance', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'agent_daily') },
    ],
    dimensions: ['team', 'channel', 'agent', 'date', 'week', 'month'],
    metrics: Object.entries(METRIC_DEFINITIONS).map(([id, meta]) => ({ id, ...meta })),
    aliases: METRIC_ALIASES,
    availableTeams: dataset.teams.map(team => ({ name: team.name, focus: team.focus })),
    availableChannels: dataset.channels,
    defaultTimeRange: 'last_30_days',
    notes: [
      'Prototype synthetic analytics data with customer overlays.',
      'Use for visible-chart questions and deeper analytics questions.',
    ],
  };
}

export {
  METRIC_ALIASES,
  METRIC_DEFINITIONS,
  buildSyntheticDataset,
  getSemanticSchema,
  normalizeFocus,
};
