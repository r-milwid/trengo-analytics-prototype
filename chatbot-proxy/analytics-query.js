import {
  METRIC_ALIASES,
  METRIC_DEFINITIONS,
  buildSyntheticDataset,
  getSemanticSchema,
} from '../synthetic-data/base-analytics.js';

const ENTITY_ROW_MAP = {
  team_daily: 'teamDaily',
  agent_daily: 'agentDaily',
  intent_daily: 'intentDaily',
  stage_daily: 'stageDaily',
  hourly_daily: 'hourlyDaily',
  voice_channel_daily: 'voiceChannelDaily',
  voice_direction_daily: 'voiceDirectionDaily',
  workflow_status_daily: 'workflowStatusDaily',
  handoff_reason_daily: 'handoffReasonDaily',
  contact_type_daily: 'contactTypeDaily',
};

const DIMENSION_FIELD_MAP = {
  team: 'team',
  channel: 'channel',
  agent: 'agent',
  intent: 'intent',
  stage: 'stage',
  hour: 'hour',
  status: 'status',
  reason: 'reason',
  contact_type: 'contactType',
  direction: 'direction',
  date: 'date',
};

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalDimension(value) {
  const normalized = lower(value);
  if (normalized === 'contacttype' || normalized === 'contact type') return 'contact_type';
  return normalized;
}

function parseTimeRange(value, question = '') {
  const source = `${value || ''} ${question || ''}`.toLowerCase();
  if (source.includes('today')) return { key: 'today', days: 1, label: 'Today' };
  if (source.includes('yesterday')) return { key: 'yesterday', days: 1, offsetDays: 1, label: 'Yesterday' };
  if (source.includes('last 7') || source.includes('past 7') || source.includes('this week')) return { key: 'last_7_days', days: 7, label: 'Last 7 days' };
  if (source.includes('last 90') || source.includes('past 90') || source.includes('quarter')) return { key: 'last_90_days', days: 90, label: 'Last 90 days' };
  if (source.includes('last 60') || source.includes('past 60')) return { key: 'last_60_days', days: 60, label: 'Last 60 days' };
  if (source.includes('year') || source.includes('annual')) return { key: 'last_180_days', days: 180, label: 'Last 180 days' };
  return { key: 'last_30_days', days: 30, label: 'Last 30 days' };
}

function inferMetric(question, requestedMetrics = []) {
  const normalized = requestedMetrics
    .map(lower)
    .map(metric => METRIC_ALIASES[metric] || metric)
    .filter(metric => METRIC_DEFINITIONS[metric]);
  if (normalized.length > 0) return normalized[0];

  const q = lower(question);
  const ranked = Object.entries(METRIC_ALIASES)
    .filter(([alias]) => alias && q.includes(alias))
    .sort((a, b) => b[0].length - a[0].length);
  if (ranked.length > 0) return ranked[0][1];

  if (q.includes('pipeline')) return 'pipeline_value';
  if (q.includes('deal')) return q.includes('won') ? 'deals_won' : 'deals_created';
  if (q.includes('response')) return q.includes('survey') ? 'survey_response_rate' : 'first_response_minutes';
  if (q.includes('resolution')) return q.includes('first call') ? 'first_call_resolution_rate' : 'resolution_hours';
  if (q.includes('csat') || q.includes('satisfaction')) return 'csat';
  if (q.includes('voice') || q.includes('call')) return q.includes('missed') ? 'missed_calls' : 'total_calls';
  if (q.includes('automation') || q.includes('journey')) return 'automation_success_rate';
  if (q.includes('intent')) return 'intent_volume';
  return 'conversations';
}

function inferDimension(question, requestedDimensions = []) {
  const explicit = requestedDimensions.map(canonicalDimension).find(Boolean);
  if (explicit) return explicit;

  const q = lower(question);
  if (q.includes('agent') || q.includes('advisor')) return 'agent';
  if (q.includes('team')) return 'team';
  if (q.includes('channel')) return 'channel';
  if (q.includes('intent')) return 'intent';
  if (q.includes('stage') || q.includes('funnel')) return 'stage';
  if (q.includes('status') || q.includes('bottleneck')) return 'status';
  if (q.includes('handoff reason') || q.includes('reason')) return 'reason';
  if (q.includes('new vs returning') || q.includes('contact type') || q.includes('returning contacts')) return 'contact_type';
  if (q.includes('inbound') || q.includes('outbound') || q.includes('direction')) return 'direction';
  if (q.includes('hour') || q.includes('time of day')) return 'hour';
  return null;
}

function inferGrain(question, requestedGrain) {
  const explicit = canonicalDimension(requestedGrain);
  if (['date', 'day', 'week', 'month'].includes(explicit)) return explicit === 'day' ? 'date' : explicit;
  const q = lower(question);
  if (q.includes('by week') || q.includes('weekly')) return 'week';
  if (q.includes('by month') || q.includes('monthly')) return 'month';
  if (q.includes('trend') || q.includes('over time') || q.includes('how has') || q.includes('changed') || q.includes('by day') || q.includes('daily')) return 'date';
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
  Object.entries(filters).forEach(([key, value]) => {
    const dimension = canonicalDimension(key);
    const items = Array.isArray(value) ? value : [value];
    normalized[dimension] = items.filter(Boolean).map(item => String(item).trim());
  });

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
  if (!rows.length || !timeRange) return rows;
  const end = getDateBounds(rows);
  const offset = Number(timeRange.offsetDays || 0);
  const endTs = end.getTime() - (offset * 24 * 60 * 60 * 1000);
  const startTs = endTs - ((timeRange.days - 1) * 24 * 60 * 60 * 1000);
  return rows.filter((row) => {
    if (!row.date) return true;
    const ts = new Date(`${row.date}T00:00:00Z`).getTime();
    return ts >= startTs && ts <= endTs;
  });
}

function rowValueForDimension(row, dimension) {
  const field = DIMENSION_FIELD_MAP[dimension];
  return field ? row[field] : undefined;
}

function filterRows(rows, filters = {}) {
  return rows.filter((row) => {
    return Object.entries(filters).every(([dimension, values]) => {
      if (!values || !values.length) return true;
      const rowValue = rowValueForDimension(row, dimension);
      return values.map(lower).includes(lower(rowValue));
    });
  });
}

function bucketForRow(row, dimension, grain) {
  if (dimension) {
    const value = rowValueForDimension(row, dimension);
    return value == null ? 'Unknown' : String(value);
  }

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

function getMetricValue(meta, rows) {
  if (!rows.length || !meta) return 0;
  const sum = (key) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);

  switch (meta.aggregate) {
    case 'sum':
      return sum(meta.sourceKey);
    case 'max':
      return rows.reduce((max, row) => Math.max(max, Number(row[meta.sourceKey] || 0)), 0);
    case 'weighted_average': {
      const total = rows.reduce((acc, row) => acc + (Number(row[meta.sourceKey] || 0) * Number(row[meta.weightKey] || 0)), 0);
      const denom = rows.reduce((acc, row) => acc + Number(row[meta.weightKey] || 0), 0);
      return denom ? total / denom : 0;
    }
    case 'ratio': {
      const numerator = sum(meta.numeratorKey);
      const denominator = sum(meta.denominatorKey);
      return denominator ? numerator / denominator : 0;
    }
    case 'difference':
      return sum(meta.numeratorKey) - sum(meta.denominatorKey);
    default:
      return 0;
  }
}

function formatMetricValue(metric, value) {
  const meta = METRIC_DEFINITIONS[metric] || {};
  if (meta.kind === 'rate') return `${(value * 100).toFixed(1)}%`;
  if (meta.kind === 'score') return value.toFixed(2);
  if (meta.kind === 'currency') return `€${Math.round(value).toLocaleString('en-US')}`;
  if (meta.kind === 'duration_minutes') return `${value.toFixed(1)} min`;
  if (meta.kind === 'duration_hours') return `${value.toFixed(1)} h`;
  if (meta.kind === 'duration_days') return `${value.toFixed(1)} d`;
  return Math.round(value).toLocaleString('en-US');
}

function compareValue(metric, current, previous) {
  const meta = METRIC_DEFINITIONS[metric] || {};
  if (previous === 0) return null;
  if (meta.kind === 'rate' || meta.kind === 'score') {
    return current - previous;
  }
  return (current - previous) / Math.abs(previous);
}

function getSortedRows(rows, dimension) {
  if (dimension === 'hour') {
    return [...rows].sort((a, b) => Number(a.label) - Number(b.label));
  }
  return [...rows].sort((a, b) => b.value - a.value);
}

function buildSummaryHints(metric, resultType, querySpec, data, context = {}) {
  const meta = METRIC_DEFINITIONS[metric] || {};
  return {
    metricLabel: meta.label || metric,
    resultType,
    preferredVisualization: meta.preferredChart || (resultType === 'timeseries' ? 'line' : resultType === 'table' ? 'table' : 'bar'),
    timeframeLabel: querySpec.timeRange?.label || 'Selected period',
    dimensionLabel: querySpec.dimension || null,
    dataPoints: Array.isArray(data?.points) ? data.points.length : Array.isArray(data?.rows) ? data.rows.length : 1,
    visibleDashboardMetrics: context.dashboardContext?.visibleWidgetTitles || [],
  };
}

function buildPresentation(metric, resultType, querySpec, data) {
  const meta = METRIC_DEFINITIONS[metric] || {};
  if (resultType === 'metric') return null;

  if (resultType === 'timeseries') {
    return {
      kind: 'timeseries',
      layout: 'wide',
      title: `${meta.label || metric} trend`,
      series: data.points,
      metric,
      chartType: meta.preferredChart === 'bar' ? 'bar' : 'line',
    };
  }

  if (resultType === 'distribution') {
    return {
      kind: 'distribution',
      title: `${meta.label || metric} split`,
      metric,
      rows: data.rows,
    };
  }

  if (resultType === 'table') {
    return {
      kind: 'table',
      layout: 'wide',
      title: `${meta.label || metric} breakdown`,
      metric,
      rows: data.rows,
      dimension: querySpec.dimension,
    };
  }

  if (resultType === 'ranking') {
    return {
      kind: 'ranking',
      layout: data.rows.length > 5 ? 'wide' : 'standard',
      title: `${meta.label || metric} by ${querySpec.dimension || 'breakdown'}`,
      metric,
      rows: data.rows,
    };
  }

  return null;
}

function executeSemanticQuery(querySpec, context) {
  const dataset = buildSyntheticDataset(context.customerProfile || {}, context);
  const meta = METRIC_DEFINITIONS[querySpec.metric];
  const sourceRows = dataset[ENTITY_ROW_MAP[querySpec.entity || meta?.entity]] || [];
  const filtered = filterRows(filterRowsByTime(sourceRows, querySpec.timeRange), querySpec.filters);
  const previousRows = querySpec.comparison === 'previous_period'
    ? filterRows(filterRowsByTime(sourceRows, { ...querySpec.timeRange, offsetDays: querySpec.timeRange.days }), querySpec.filters)
    : [];
  const currentValue = getMetricValue(meta, filtered);
  const previousValue = previousRows.length ? getMetricValue(meta, previousRows) : null;

  if (querySpec.grain) {
    const bucketMap = new Map();
    filtered.forEach((row) => {
      const key = bucketForRow(row, null, querySpec.grain);
      if (!bucketMap.has(key)) bucketMap.set(key, []);
      bucketMap.get(key).push(row);
    });
    const points = [...bucketMap.entries()]
      .map(([label, rows]) => ({ label, value: getMetricValue(meta, rows) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
      .map(point => ({ ...point, displayValue: formatMetricValue(querySpec.metric, point.value) }));

    return {
      querySpec,
      resultType: 'timeseries',
      data: { points },
      comparison: previousValue == null ? null : {
        current: currentValue,
        previous: previousValue,
        delta: compareValue(querySpec.metric, currentValue, previousValue),
      },
    };
  }

  if (querySpec.dimension) {
    const bucketMap = new Map();
    filtered.forEach((row) => {
      const key = bucketForRow(row, querySpec.dimension, null);
      if (!bucketMap.has(key)) bucketMap.set(key, []);
      bucketMap.get(key).push(row);
    });

    const rows = getSortedRows(
      [...bucketMap.entries()].map(([label, groupRows]) => ({
        label,
        value: getMetricValue(meta, groupRows),
      })),
      querySpec.dimension
    )
      .slice(0, querySpec.limit || 6)
      .map(row => ({ ...row, displayValue: formatMetricValue(querySpec.metric, row.value) }));

    const wantsDistribution = meta.preferredChart === 'doughnut' && rows.length > 1 && rows.length <= 5;
    const wantsTimeseriesBars = querySpec.dimension === 'hour';
    return {
      querySpec,
      resultType: wantsTimeseriesBars ? 'timeseries' : wantsDistribution ? 'distribution' : (rows.length > 5 || meta.preferredChart === 'table' ? 'table' : 'ranking'),
      data: wantsTimeseriesBars
        ? { points: rows.map(row => ({ label: row.label, value: row.value, displayValue: row.displayValue })) }
        : { rows },
      comparison: previousValue == null ? null : {
        current: currentValue,
        previous: previousValue,
        delta: compareValue(querySpec.metric, currentValue, previousValue),
      },
    };
  }

  return {
    querySpec,
    resultType: 'metric',
    data: {
      value: currentValue,
      displayValue: formatMetricValue(querySpec.metric, currentValue),
    },
    comparison: previousValue == null ? null : {
      current: currentValue,
      previous: previousValue,
      delta: compareValue(querySpec.metric, currentValue, previousValue),
    },
  };
}

function planSemanticQuery(payload = {}, context = {}) {
  const question = payload.question || '';
  const metric = inferMetric(question, payload.metrics || []);
  const explicitDimension = inferDimension(question, payload.dimensions || []);
  const grain = inferGrain(question, payload.grain);
  const meta = METRIC_DEFINITIONS[metric] || {};
  const dimension = explicitDimension || (!grain ? meta.defaultDimension || null : null);
  const comparison = inferComparison(question, payload.comparison);
  const timeRange = parseTimeRange(payload.timeRange, question);
  const filters = normalizeFilters(payload.filters || {}, context);
  const limit = inferLimit(question, payload.limit);

  const needsClarification = !dimension && !grain && /(which|who|best|worst|top|where)/i.test(question)
    ? 'Do you want that broken down by team, channel, agent, or over time?'
    : null;

  return {
    querySpec: {
      entity: meta.entity || 'team_daily',
      metric,
      dimension,
      filters,
      timeRange,
      grain,
      comparison,
      limit,
    },
    needsClarification,
    confidence: needsClarification ? 0.74 : 0.92,
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

function summarizeQueryResult(payload = {}, context = {}) {
  const querySpec = payload.querySpec || {};
  const result = payload.result || {};
  const metric = querySpec.metric || 'conversations';
  const resultType = result.resultType || 'metric';
  const data = result.data || {};

  return {
    resultType,
    summaryHints: buildSummaryHints(metric, resultType, querySpec, data, context),
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
    return summarizeQueryResult(body, context);
  }
  return { error: 'unknown action' };
}
