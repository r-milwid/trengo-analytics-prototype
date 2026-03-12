import {
  METRIC_ALIASES,
  METRIC_DEFINITIONS,
  buildSyntheticDataset,
  getSemanticSchema,
} from '../synthetic-data/base-analytics.js';

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function parseTimeRange(value, question = '') {
  const source = `${value || ''} ${question || ''}`.toLowerCase();
  if (source.includes('today')) return { key: 'today', days: 1, label: 'Today' };
  if (source.includes('yesterday')) return { key: 'yesterday', days: 1, offsetDays: 1, label: 'Yesterday' };
  if (source.includes('last 7') || source.includes('past 7') || source.includes('this week')) return { key: 'last_7_days', days: 7, label: 'Last 7 days' };
  if (source.includes('last 90') || source.includes('past 90') || source.includes('quarter')) return { key: 'last_90_days', days: 90, label: 'Last 90 days' };
  if (source.includes('year')) return { key: 'last_180_days', days: 180, label: 'Last 180 days' };
  return { key: 'last_30_days', days: 30, label: 'Last 30 days' };
}

function inferMetric(question, requestedMetrics = []) {
  const normalized = requestedMetrics.map(lower).map(metric => METRIC_ALIASES[metric] || metric).filter(metric => METRIC_DEFINITIONS[metric]);
  if (normalized.length > 0) return normalized[0];

  const q = lower(question);
  const ranked = Object.entries(METRIC_ALIASES)
    .filter(([alias]) => alias && q.includes(alias))
    .sort((a, b) => b[0].length - a[0].length);
  if (ranked.length > 0) return ranked[0][1];

  if (q.includes('pipeline')) return 'pipeline_value';
  if (q.includes('deal')) return q.includes('won') ? 'deals_won' : 'deals_created';
  if (q.includes('response')) return 'first_response_minutes';
  if (q.includes('sla')) return 'sla_breach_rate';
  if (q.includes('satisfaction') || q.includes('csat')) return 'csat';
  if (q.includes('automation')) return 'automation_success_rate';
  if (q.includes('handoff')) return 'handoff_rate';
  if (q.includes('ai')) return 'ai_resolution_rate';
  return 'conversations';
}

function inferDimension(question, requestedDimensions = []) {
  const explicit = requestedDimensions.map(lower).find(Boolean);
  if (explicit) return explicit;
  const q = lower(question);
  if (q.includes('agent') || q.includes('advisor')) return 'agent';
  if (q.includes('team')) return 'team';
  if (q.includes('channel')) return 'channel';
  return null;
}

function inferGrain(question, requestedGrain) {
  const explicit = lower(requestedGrain);
  if (['date', 'day', 'week', 'month'].includes(explicit)) return explicit === 'day' ? 'date' : explicit;
  const q = lower(question);
  if (q.includes('by week') || q.includes('weekly')) return 'week';
  if (q.includes('by month') || q.includes('monthly')) return 'month';
  if (q.includes('trend') || q.includes('over time') || q.includes('by day') || q.includes('daily')) return 'date';
  return null;
}

function inferComparison(question, requestedComparison) {
  const explicit = lower(requestedComparison);
  if (explicit) return explicit;
  const q = lower(question);
  if (q.includes('vs previous') || q.includes('compared with previous') || q.includes('compared to previous') || q.includes('changed')) {
    return 'previous_period';
  }
  return null;
}

function inferLimit(question, requestedLimit) {
  const numeric = Number(requestedLimit);
  if (Number.isFinite(numeric) && numeric > 0) return Math.min(10, Math.max(1, Math.round(numeric)));
  const q = lower(question);
  if (q.includes('top 3')) return 3;
  if (q.includes('top 5')) return 5;
  if (q.includes('top')) return 5;
  return 5;
}

function normalizeFilters(filters = {}, context = {}) {
  const normalized = {};
  if (filters.team) {
    normalized.team = Array.isArray(filters.team) ? filters.team : [filters.team];
  }
  if (filters.channel) {
    normalized.channel = Array.isArray(filters.channel) ? filters.channel.map(lower) : [lower(filters.channel)];
  }
  if (context.role !== 'admin' && Array.isArray(context.scopedTeams) && context.scopedTeams.length > 0) {
    normalized.team = normalized.team
      ? normalized.team.filter(team => context.scopedTeams.includes(team))
      : [...context.scopedTeams];
  }
  return normalized;
}

function getDateBounds(rows) {
  const lastDate = rows.length ? rows[rows.length - 1].date : '2026-03-01';
  return new Date(`${lastDate}T00:00:00Z`);
}

function filterRowsByTime(rows, timeRange) {
  const end = getDateBounds(rows);
  const offset = Number(timeRange.offsetDays || 0);
  const endTs = end.getTime() - (offset * 24 * 60 * 60 * 1000);
  const startTs = endTs - ((timeRange.days - 1) * 24 * 60 * 60 * 1000);
  return rows.filter(row => {
    const ts = new Date(`${row.date}T00:00:00Z`).getTime();
    return ts >= startTs && ts <= endTs;
  });
}

function filterRows(rows, filters = {}) {
  return rows.filter((row) => {
    if (filters.team && !filters.team.includes(row.team)) return false;
    if (filters.channel && row.channel && !filters.channel.includes(lower(row.channel))) return false;
    return true;
  });
}

function bucketForRow(row, dimension, grain) {
  if (dimension === 'team') return row.team;
  if (dimension === 'channel') return row.channel;
  if (dimension === 'agent') return row.agent;
  if (grain === 'month') return row.date.slice(0, 7);
  if (grain === 'week') {
    const date = new Date(`${row.date}T00:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  if (grain === 'date') return row.date;
  return 'all';
}

function aggregateMetric(metric, rows) {
  if (!rows.length) return 0;
  const sum = (key) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);

  switch (metric) {
    case 'conversations': return sum('conversations');
    case 'tickets_created': return sum('ticketsCreated');
    case 'tickets_resolved': return sum('ticketsResolved');
    case 'sla_breaches': return sum('slaBreaches');
    case 'deals_created': return sum('dealsCreated');
    case 'deals_won': return sum('dealsWon');
    case 'pipeline_value': return sum('pipelineValue');
    case 'conversations_handled': return sum('conversationsHandled');
    case 'first_response_minutes': {
      const total = rows.reduce((acc, row) => acc + (Number(row.firstResponseMinutes || 0) * Number(row.ticketsCreated || row.conversationsHandled || 1)), 0);
      const denom = rows.reduce((acc, row) => acc + Number(row.ticketsCreated || row.conversationsHandled || 1), 0);
      return denom ? total / denom : 0;
    }
    case 'resolution_hours': {
      const total = rows.reduce((acc, row) => acc + (Number(row.resolutionHours || 0) * Number(row.ticketsResolved || 1)), 0);
      const denom = rows.reduce((acc, row) => acc + Number(row.ticketsResolved || 1), 0);
      return denom ? total / denom : 0;
    }
    case 'csat':
    case 'agent_csat': {
      const total = rows.reduce((acc, row) => acc + (Number(row.csatScore || 0) * Number(row.csatResponses || row.conversationsHandled || 1)), 0);
      const denom = rows.reduce((acc, row) => acc + Number(row.csatResponses || row.conversationsHandled || 1), 0);
      return denom ? total / denom : 0;
    }
    case 'sla_breach_rate': {
      const numerator = sum('slaBreaches');
      const denominator = sum('ticketsCreated');
      return denominator ? numerator / denominator : 0;
    }
    case 'ai_assist_rate': {
      const numerator = sum('aiAssistCount');
      const denominator = sum('ticketsCreated');
      return denominator ? numerator / denominator : 0;
    }
    case 'ai_resolution_rate': {
      const numerator = sum('aiResolvedCount');
      const denominator = sum('ticketsCreated');
      return denominator ? numerator / denominator : 0;
    }
    case 'handoff_rate': {
      const numerator = sum('handoffCount');
      const denominator = sum('ticketsCreated');
      return denominator ? numerator / denominator : 0;
    }
    case 'automation_success_rate': {
      const numerator = sum('automationSuccessCount');
      const denominator = sum('automationRuns');
      return denominator ? numerator / denominator : 0;
    }
    case 'win_rate': {
      const numerator = sum('dealsWon');
      const denominator = sum('dealsCreated');
      return denominator ? numerator / denominator : 0;
    }
    case 'avg_deal_size': {
      const denominator = sum('dealsWon') || sum('dealsCreated');
      return denominator ? sum('pipelineValue') / denominator : 0;
    }
    case 'sales_cycle_days': {
      const total = rows.reduce((acc, row) => acc + (Number(row.salesCycleDays || 0) * Number(row.dealsCreated || 1)), 0);
      const denom = rows.reduce((acc, row) => acc + Number(row.dealsCreated || 1), 0);
      return denom ? total / denom : 0;
    }
    default:
      return 0;
  }
}

function formatMetricValue(metric, value) {
  const meta = METRIC_DEFINITIONS[metric] || {};
  if (meta.kind === 'rate') return `${(value * 100).toFixed(1)}%`;
  if (meta.kind === 'score') return value.toFixed(2);
  if (meta.kind === 'currency') return `€${Math.round(value).toLocaleString('en-US')}`;
  if (metric === 'first_response_minutes') return `${value.toFixed(1)} min`;
  if (metric === 'resolution_hours') return `${value.toFixed(1)} h`;
  if (metric === 'sales_cycle_days') return `${value.toFixed(1)} d`;
  return Math.round(value).toLocaleString('en-US');
}

function compareValue(metric, current, previous) {
  if (previous === 0) return null;
  if ((METRIC_DEFINITIONS[metric] || {}).kind === 'rate' || metric === 'csat') {
    return current - previous;
  }
  return (current - previous) / Math.abs(previous);
}

function buildSummaryHints(metric, resultType, querySpec, data) {
  return {
    metricLabel: METRIC_DEFINITIONS[metric]?.label || metric,
    resultType,
    preferredVisualization: resultType === 'timeseries' ? 'line' : resultType === 'ranking' ? 'bar' : resultType === 'table' ? 'table' : null,
    timeframeLabel: querySpec.timeRange?.label || 'Selected period',
    dimensionLabel: querySpec.dimension || null,
    dataPoints: Array.isArray(data?.points) ? data.points.length : Array.isArray(data?.rows) ? data.rows.length : 1,
  };
}

function buildPresentation(metric, resultType, querySpec, data) {
  if (resultType === 'metric') return null;
  if (resultType === 'timeseries') {
    return {
      kind: 'timeseries',
      title: `${METRIC_DEFINITIONS[metric]?.label || metric} trend`,
      series: data.points,
      metric,
      chartType: 'line',
    };
  }
  if (resultType === 'ranking') {
    return {
      kind: 'ranking',
      title: `${METRIC_DEFINITIONS[metric]?.label || metric} by ${querySpec.dimension}`,
      metric,
      rows: data.rows,
    };
  }
  if (resultType === 'table') {
    return {
      kind: 'table',
      title: `${METRIC_DEFINITIONS[metric]?.label || metric} breakdown`,
      metric,
      rows: data.rows,
      dimension: querySpec.dimension,
    };
  }
  return null;
}

function executeSemanticQuery(querySpec, context) {
  const dataset = buildSyntheticDataset(context.customerProfile || {}, context);
  const metric = querySpec.metric;
  const sourceRows = querySpec.dimension === 'agent' || METRIC_DEFINITIONS[metric]?.entity === 'agent_daily'
    ? dataset.agentDaily
    : dataset.teamDaily;

  const filtered = filterRows(filterRowsByTime(sourceRows, querySpec.timeRange), querySpec.filters);
  const previousRows = querySpec.comparison === 'previous_period'
    ? filterRows(filterRowsByTime(sourceRows, { ...querySpec.timeRange, offsetDays: querySpec.timeRange.days }), querySpec.filters)
    : [];

  const bucketMap = new Map();
  filtered.forEach((row) => {
    const key = bucketForRow(row, querySpec.dimension, querySpec.grain);
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key).push(row);
  });

  const currentValue = aggregateMetric(metric, filtered);
  const previousValue = previousRows.length ? aggregateMetric(metric, previousRows) : null;

  if (querySpec.grain) {
    const points = [...bucketMap.entries()]
      .map(([label, rows]) => ({ label, value: aggregateMetric(metric, rows) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      querySpec,
      resultType: 'timeseries',
      data: {
        points: points.map(point => ({ ...point, displayValue: formatMetricValue(metric, point.value) })),
      },
      comparison: previousValue == null ? null : {
        current: currentValue,
        previous: previousValue,
        delta: compareValue(metric, currentValue, previousValue),
      },
    };
  }

  if (querySpec.dimension) {
    const rows = [...bucketMap.entries()]
      .map(([label, groupRows]) => ({ label, value: aggregateMetric(metric, groupRows) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, querySpec.limit || 5)
      .map(row => ({ ...row, displayValue: formatMetricValue(metric, row.value) }));
    return {
      querySpec,
      resultType: rows.length <= 4 ? 'ranking' : 'table',
      data: { rows },
      comparison: previousValue == null ? null : {
        current: currentValue,
        previous: previousValue,
        delta: compareValue(metric, currentValue, previousValue),
      },
    };
  }

  return {
    querySpec,
    resultType: 'metric',
    data: {
      value: currentValue,
      displayValue: formatMetricValue(metric, currentValue),
    },
    comparison: previousValue == null ? null : {
      current: currentValue,
      previous: previousValue,
      delta: compareValue(metric, currentValue, previousValue),
    },
  };
}

function planSemanticQuery(payload = {}, context = {}) {
  const question = payload.question || '';
  const metric = inferMetric(question, payload.metrics || []);
  const dimension = inferDimension(question, payload.dimensions || []);
  const grain = inferGrain(question, payload.grain);
  const comparison = inferComparison(question, payload.comparison);
  const timeRange = parseTimeRange(payload.timeRange, question);
  const filters = normalizeFilters(payload.filters || {}, context);
  const limit = inferLimit(question, payload.limit);

  const needsClarification = !dimension && /(which|who|best|worst|top)/i.test(question) && !grain
    ? 'Do you want that broken down by team, channel, or agent?'
    : null;

  return {
    querySpec: {
      entity: METRIC_DEFINITIONS[metric]?.entity || 'team_daily',
      metric,
      dimension,
      filters,
      timeRange,
      grain,
      comparison,
      limit,
    },
    needsClarification,
    confidence: needsClarification ? 0.72 : 0.9,
  };
}

function inspectCapability(payload = {}, context = {}) {
  const schema = getSemanticSchema(context.customerProfile || {}, context);
  const likelyMetric = inferMetric(payload.question || '', []);
  return {
    schema,
    recommendedMetric: likelyMetric,
    visibleDashboardMetrics: context.dashboardContext?.visibleWidgetTitles || [],
  };
}

function summarizeQueryResult(payload = {}) {
  const querySpec = payload.querySpec || {};
  const result = payload.result || {};
  const metric = querySpec.metric || 'conversations';
  const resultType = result.resultType || 'metric';
  const data = result.data || {};
  return {
    resultType,
    summaryHints: buildSummaryHints(metric, resultType, querySpec, data),
    presentation: buildPresentation(metric, resultType, querySpec, data),
    caveats: ['Prototype synthetic analytics data; use for directional feedback rather than exact business decisions.'],
    confidence: resultType === 'metric' ? 0.92 : 0.88,
  };
}

export async function handleAnalyticsQuery(body = {}) {
  const action = body.action;
  const context = {
    customerProfile: body.customerProfile || {},
    role: body.role || 'admin',
    scopedTeams: Array.isArray(body.scopedTeams) ? body.scopedTeams : [],
    dashboardContext: body.dashboardContext || {},
  };

  if (action === 'inspect') {
    return inspectCapability(body, context);
  }
  if (action === 'plan') {
    return planSemanticQuery(body, context);
  }
  if (action === 'run') {
    if (!body.querySpec?.metric) {
      return { error: 'missing querySpec.metric' };
    }
    return executeSemanticQuery(body.querySpec, context);
  }
  if (action === 'summarize') {
    return summarizeQueryResult(body);
  }
  return { error: 'unknown action' };
}
