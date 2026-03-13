import {
  METRIC_ALIASES,
  METRIC_DEFINITIONS,
  buildSyntheticDataset,
  getSemanticSchema,
} from '../synthetic-data/base-analytics.js';

const ENTITY_ROW_MAP = {
  team_daily: 'teamDaily',
  agent_daily: 'agentDaily',
  region_daily: 'regionDaily',
  account_daily: 'accountDaily',
  queue_daily: 'queueDaily',
  product_daily: 'productDaily',
  campaign_daily: 'campaignDaily',
  knowledge_article_daily: 'knowledgeArticleDaily',
  ai_model_daily: 'aiModelDaily',
  journey_daily: 'journeyDaily',
  deal_attribute_daily: 'dealAttributeDaily',
  call_quality_daily: 'callQualityDaily',
  survey_detail_daily: 'surveyDetailDaily',
  workforce_daily: 'workforceDaily',
  agent_presence_daily: 'agentPresenceDaily',
  intent_daily: 'intentDaily',
  stage_daily: 'stageDaily',
  hourly_daily: 'hourlyDaily',
  voice_channel_daily: 'voiceChannelDaily',
  voice_direction_daily: 'voiceDirectionDaily',
  workflow_status_daily: 'workflowStatusDaily',
  handoff_reason_daily: 'handoffReasonDaily',
  contact_type_daily: 'contactTypeDaily',
  aging_band_daily: 'agingBandDaily',
  sla_risk_daily: 'slaRiskDaily',
  satisfaction_theme_daily: 'satisfactionThemeDaily',
  reopen_reason_daily: 'reopenReasonDaily',
  lead_source_daily: 'leadSourceDaily',
  call_outcome_daily: 'callOutcomeDaily',
  ai_confidence_daily: 'aiConfidenceDaily',
};

const DIMENSION_FIELD_MAP = {
  team: 'team',
  channel: 'channel',
  agent: 'agent',
  intent: 'intent',
  intent_version: 'intentVersion',
  stage: 'stage',
  hour: 'hour',
  status: 'status',
  reason: 'reason',
  contact_type: 'contactType',
  direction: 'direction',
  age_band: 'ageBand',
  risk_band: 'riskBand',
  theme: 'theme',
  source: 'source',
  outcome: 'outcome',
  confidence_band: 'confidenceBand',
  region: 'region',
  country: 'country',
  city: 'city',
  language: 'language',
  business_unit: 'businessUnit',
  account_segment: 'accountSegment',
  account_tier: 'accountTier',
  plan: 'plan',
  lifecycle_stage: 'lifecycleStage',
  cohort: 'cohort',
  queue: 'queue',
  priority: 'priority',
  sla_policy: 'slaPolicy',
  product_line: 'productLine',
  feature_area: 'featureArea',
  issue_type: 'issueType',
  campaign: 'campaign',
  article: 'article',
  article_category: 'articleCategory',
  ai_model: 'aiModel',
  prompt_version: 'promptVersion',
  guardrail_type: 'guardrailType',
  journey: 'journey',
  journey_version: 'journeyVersion',
  trigger_type: 'triggerType',
  exit_reason: 'exitReason',
  deal_owner: 'dealOwner',
  currency: 'currency',
  close_reason: 'closeReason',
  competitor: 'competitor',
  voice_line: 'voiceLine',
  connection_result: 'connectionResult',
  recording_flag: 'recordingFlag',
  survey_template: 'surveyTemplate',
  survey_question: 'surveyQuestion',
  delivery_channel: 'deliveryChannel',
  respondent_type: 'respondentType',
  sentiment_label: 'sentimentLabel',
  schedule: 'schedule',
  shift: 'shift',
  availability_status: 'availabilityStatus',
  date: 'date',
};

const DIMENSION_ENTITY_MAP = {
  agent: 'agent_daily',
  intent: 'intent_daily',
  intent_version: 'intent_daily',
  stage: 'stage_daily',
  hour: 'hourly_daily',
  status: 'workflow_status_daily',
  contact_type: 'contact_type_daily',
  direction: 'voice_direction_daily',
  age_band: 'aging_band_daily',
  risk_band: 'sla_risk_daily',
  theme: 'satisfaction_theme_daily',
  source: 'lead_source_daily',
  outcome: 'call_outcome_daily',
  confidence_band: 'ai_confidence_daily',
  region: 'region_daily',
  country: 'region_daily',
  city: 'region_daily',
  language: 'region_daily',
  business_unit: 'region_daily',
  account_segment: 'account_daily',
  account_tier: 'account_daily',
  plan: 'account_daily',
  lifecycle_stage: 'account_daily',
  cohort: 'account_daily',
  queue: 'queue_daily',
  priority: 'queue_daily',
  sla_policy: 'queue_daily',
  product_line: 'product_daily',
  feature_area: 'product_daily',
  issue_type: 'product_daily',
  campaign: 'campaign_daily',
  article: 'knowledge_article_daily',
  article_category: 'knowledge_article_daily',
  ai_model: 'ai_model_daily',
  prompt_version: 'ai_model_daily',
  guardrail_type: 'ai_model_daily',
  journey: 'journey_daily',
  journey_version: 'journey_daily',
  trigger_type: 'journey_daily',
  exit_reason: 'journey_daily',
  deal_owner: 'deal_attribute_daily',
  currency: 'deal_attribute_daily',
  close_reason: 'deal_attribute_daily',
  competitor: 'deal_attribute_daily',
  voice_line: 'call_quality_daily',
  connection_result: 'call_quality_daily',
  recording_flag: 'call_quality_daily',
  survey_template: 'survey_detail_daily',
  survey_question: 'survey_detail_daily',
  delivery_channel: 'survey_detail_daily',
  respondent_type: 'survey_detail_daily',
  sentiment_label: 'survey_detail_daily',
  schedule: 'workforce_daily',
  shift: 'workforce_daily',
  availability_status: 'agent_presence_daily',
};

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalDimension(value) {
  const normalized = lower(value);
  if (normalized === 'contacttype' || normalized === 'contact type') return 'contact_type';
  if (normalized === 'ageband' || normalized === 'age band' || normalized === 'backlog age') return 'age_band';
  if (normalized === 'riskband' || normalized === 'risk band' || normalized === 'breach risk') return 'risk_band';
  if (normalized === 'confidenceband' || normalized === 'confidence band' || normalized === 'confidence bucket') return 'confidence_band';
  if (normalized === 'intent version' || normalized === 'taxonomy version') return 'intent_version';
  if (normalized === 'business unit' || normalized === 'businessunit') return 'business_unit';
  if (normalized === 'account segment' || normalized === 'segment' || normalized === 'customer segment') return 'account_segment';
  if (normalized === 'account tier' || normalized === 'tier') return 'account_tier';
  if (normalized === 'lifecycle stage' || normalized === 'lifecycle') return 'lifecycle_stage';
  if (normalized === 'sla policy' || normalized === 'slapolicy') return 'sla_policy';
  if (normalized === 'product line' || normalized === 'productline') return 'product_line';
  if (normalized === 'feature area' || normalized === 'featurearea' || normalized === 'feature') return 'feature_area';
  if (normalized === 'issue type' || normalized === 'issuetype') return 'issue_type';
  if (normalized === 'article category' || normalized === 'articlecategory' || normalized === 'knowledge category') return 'article_category';
  if (normalized === 'ai model' || normalized === 'model') return 'ai_model';
  if (normalized === 'prompt version' || normalized === 'prompt') return 'prompt_version';
  if (normalized === 'guardrail type' || normalized === 'guardrail') return 'guardrail_type';
  if (normalized === 'journey version' || normalized === 'workflow version') return 'journey_version';
  if (normalized === 'trigger type' || normalized === 'trigger') return 'trigger_type';
  if (normalized === 'exit reason' || normalized === 'exit') return 'exit_reason';
  if (normalized === 'deal owner' || normalized === 'owner') return 'deal_owner';
  if (normalized === 'close reason' || normalized === 'closed reason') return 'close_reason';
  if (normalized === 'voice line' || normalized === 'phone line') return 'voice_line';
  if (normalized === 'connection result' || normalized === 'call result') return 'connection_result';
  if (normalized === 'recording flag' || normalized === 'recorded') return 'recording_flag';
  if (normalized === 'survey template' || normalized === 'survey type') return 'survey_template';
  if (normalized === 'survey question' || normalized === 'question') return 'survey_question';
  if (normalized === 'delivery channel') return 'delivery_channel';
  if (normalized === 'respondent type') return 'respondent_type';
  if (normalized === 'sentiment label' || normalized === 'sentiment') return 'sentiment_label';
  if (normalized === 'work schedule' || normalized === 'schedule type') return 'schedule';
  if (normalized === 'availability status' || normalized === 'presence status') return 'availability_status';
  return normalized;
}

function parseTimeRange(value, question = '') {
  const source = `${value || ''} ${question || ''}`.toLowerCase();
  const daysMatch = source.match(/(?:last|past)\s+(\d+)\s+days?/);
  if (daysMatch) {
    const days = Math.max(1, Math.min(400, Number(daysMatch[1])));
    return { key: `last_${days}_days`, days, label: `Last ${days} days` };
  }
  if (source.includes('this month')) return { key: 'last_30_days', days: 30, label: 'This month' };
  if (source.includes('last month')) return { key: 'last_month', days: 30, offsetDays: 30, label: 'Last month' };
  if (source.includes('today')) return { key: 'today', days: 1, label: 'Today' };
  if (source.includes('yesterday')) return { key: 'yesterday', days: 1, offsetDays: 1, label: 'Yesterday' };
  if (source.includes('last 7') || source.includes('past 7') || source.includes('this week')) return { key: 'last_7_days', days: 7, label: 'Last 7 days' };
  if (source.includes('last 90') || source.includes('past 90') || source.includes('quarter')) return { key: 'last_90_days', days: 90, label: 'Last 90 days' };
  if (source.includes('last 60') || source.includes('past 60')) return { key: 'last_60_days', days: 60, label: 'Last 60 days' };
  if (source.includes('year') || source.includes('annual')) return { key: 'last_365_days', days: 365, label: 'Last 365 days' };
  return { key: 'last_30_days', days: 30, label: 'Last 30 days' };
}

function inferMetric(question, requestedMetrics = []) {
  const normalized = requestedMetrics
    .map(lower)
    .map(metric => METRIC_ALIASES[metric] || metric)
    .filter(metric => METRIC_DEFINITIONS[metric]);
  if (normalized.length > 0) return normalized[0];

  const q = lower(question);
  if (q.includes('reopen') && (q.includes('why') || q.includes('reason'))) return 'reopen_reason_count';
  if (q.includes('csat') && (q.includes('theme') || q.includes('driver') || q.includes('lower') || q.includes('down'))) {
    return 'satisfaction_theme_detractors';
  }
  if (q.includes('call') && (q.includes('ending') || q.includes('outcome') || q.includes('end'))) return 'call_outcome_count';
  if (q.includes('lead source') && q.includes('win rate')) return 'lead_source_win_rate';
  if (q.includes('lead source') && q.includes('pipeline')) return 'lead_source_pipeline_value';
  if (q.includes('lead source') && (q.includes('revenue') || q.includes('won revenue') || q.includes('closed won'))) return 'won_revenue';
  if (q.includes('lead source')) return 'lead_source_count';
  if (q.includes('near breach') && (q.includes('how many') || q.includes('tickets'))) return 'near_breach_tickets';
  if ((q.includes('lost') || q.includes('lose')) && (q.includes('deal') || q.includes('opportunit') || q.includes('competitor'))) return 'lost_deals';
  if (q.includes('renewal risk')) return 'renewal_risk_accounts';
  if (q.includes('churn risk')) return 'churn_risk_revenue';
  if (q.includes('occupancy')) return 'occupancy_rate';
  if (q.includes('journey completion')) return 'journey_completion_minutes';
  if (q.includes('journey runs') || q.includes('automation runs')) return 'journey_runs';
  if (q.includes('survey') && q.includes('sent')) return 'surveys_sent';
  if (q.includes('transfer')) return 'transfer_count';
  if ((q.includes('recorded') || q.includes('recording')) && q.includes('call')) return 'recorded_calls';
  if (q.includes('hold') && q.includes('average')) return 'avg_hold_minutes';
  if (q.includes('hold')) return 'hold_minutes';
  if (q.includes('planned capacity')) return 'planned_capacity_hours';
  if (q.includes('scheduled hours')) return 'scheduled_hours';
  if (q.includes('overtime')) return 'overtime_hours';
  if ((q.includes('article') || q.includes('knowledge base') || q.includes('kb')) && q.includes('citation')) return 'ai_article_citations';
  if ((q.includes('article') || q.includes('knowledge base') || q.includes('kb')) && q.includes('fallback')) return 'article_fallback_tickets';
  if ((q.includes('article') || q.includes('knowledge base') || q.includes('kb')) && q.includes('view')) return 'article_views';

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
  if (q.includes('region')) return 'region';
  if (q.includes('country')) return 'country';
  if (q.includes('city')) return 'city';
  if (q.includes('language')) return 'language';
  if (q.includes('intent version') || q.includes('taxonomy version')) return 'intent_version';
  if (q.includes('business unit')) return 'business_unit';
  if (q.includes('segment')) return 'account_segment';
  if (q.includes('tier')) return 'account_tier';
  if (q.includes('plan')) return 'plan';
  if (q.includes('lifecycle')) return 'lifecycle_stage';
  if (q.includes('cohort')) return 'cohort';
  if (q.includes('queue')) return 'queue';
  if (q.includes('priority')) return 'priority';
  if (q.includes('sla policy')) return 'sla_policy';
  if (q.includes('product line')) return 'product_line';
  if (q.includes('feature area') || q.includes('feature')) return 'feature_area';
  if (q.includes('issue type')) return 'issue_type';
  if (q.includes('campaign')) return 'campaign';
  if (q.includes('article category') || q.includes('knowledge category')) return 'article_category';
  if (q.includes('article') || q.includes('knowledge base') || q.includes('knowledge article') || q.includes('kb')) return 'article';
  if (q.includes('prompt version') || q.includes('prompt')) return 'prompt_version';
  if (q.includes('ai model') || q.includes('model version') || q.includes('model')) return 'ai_model';
  if (q.includes('guardrail')) return 'guardrail_type';
  if (q.includes('journey version') || q.includes('workflow version')) return 'journey_version';
  if (q.includes('trigger')) return 'trigger_type';
  if (q.includes('exit reason')) return 'exit_reason';
  if (q.includes('deal owner') || q.includes('owner')) return 'deal_owner';
  if (q.includes('currency')) return 'currency';
  if (q.includes('close reason')) return 'close_reason';
  if (q.includes('competitor')) return 'competitor';
  if (q.includes('voice line') || q.includes('phone line')) return 'voice_line';
  if (q.includes('connection result') || q.includes('call result')) return 'connection_result';
  if (q.includes('recording')) return 'recording_flag';
  if (q.includes('survey template') || q.includes('survey type')) return 'survey_template';
  if (q.includes('survey question')) return 'survey_question';
  if (q.includes('delivery channel')) return 'delivery_channel';
  if (q.includes('respondent type')) return 'respondent_type';
  if (q.includes('sentiment')) return 'sentiment_label';
  if (q.includes('shift')) return 'shift';
  if (q.includes('schedule')) return 'schedule';
  if (q.includes('availability status') || q.includes('presence status')) return 'availability_status';
  if (q.includes('agent') || q.includes('advisor')) return 'agent';
  if (q.includes('team')) return 'team';
  if (q.includes('channel')) return 'channel';
  if (q.includes('intent')) return 'intent';
  if (q.includes('stage') || q.includes('funnel')) return 'stage';
  if (q.includes('status') || q.includes('bottleneck')) return 'status';
  if (q.includes('handoff reason') || q.includes('reason')) return 'reason';
  if (q.includes('new vs returning') || q.includes('contact type') || q.includes('returning contacts')) return 'contact_type';
  if (q.includes('inbound') || q.includes('outbound') || q.includes('direction')) return 'direction';
  if (q.includes('age band') || q.includes('aging bucket') || q.includes('backlog age') || q.includes('older than')) return 'age_band';
  if (q.includes('risk band') || q.includes('risk bucket') || q.includes('breach risk') || q.includes('near breach')) return 'risk_band';
  if (q.includes('theme') || q.includes('driver')) return 'theme';
  if (q.includes('source')) return 'source';
  if (q.includes('call outcome') || q.includes('outcome')) return 'outcome';
  if (q.includes('confidence band') || q.includes('confidence bucket')) return 'confidence_band';
  if (q.includes('hour') || q.includes('time of day')) return 'hour';
  return null;
}

function inferGrain(question, requestedGrain) {
  const explicit = normalizeGrain(requestedGrain);
  if (explicit) return explicit;
  const q = lower(question);
  if (q.includes('rising') || q.includes('falling') || q.includes('increasing') || q.includes('decreasing') || q.includes('trajectory')) return 'date';
  if (q.includes('by week') || q.includes('weekly')) return 'week';
  if (q.includes('by month') || q.includes('monthly')) return 'month';
  if (q.includes('by quarter') || q.includes('quarterly')) return 'quarter';
  if (q.includes('trend') || q.includes('over time') || q.includes('how has') || q.includes('changed') || q.includes('by day') || q.includes('daily')) return 'date';
  return null;
}

function normalizeGrain(value) {
  const normalized = lower(value);
  if (!normalized) return null;
  if (normalized === 'date' || normalized === 'day' || normalized === 'daily' || normalized.includes('day')) return 'date';
  if (normalized === 'week' || normalized === 'weekly' || normalized.includes('week')) return 'week';
  if (normalized === 'month' || normalized === 'monthly' || normalized.includes('month')) return 'month';
  if (normalized === 'quarter' || normalized === 'quarterly' || normalized.includes('quarter')) return 'quarter';
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

function resolveEntity(metric, dimension, explicitEntity = null) {
  if (explicitEntity && ENTITY_ROW_MAP[explicitEntity]) return explicitEntity;
  if (dimension && DIMENSION_ENTITY_MAP[dimension]) return DIMENSION_ENTITY_MAP[dimension];
  return METRIC_DEFINITIONS[metric]?.entity || 'team_daily';
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
  if (grain === 'quarter') {
    const date = new Date(`${row.date}T00:00:00Z`);
    return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
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

function buildPresentation(metric, resultType, querySpec, data, extras = {}) {
  const meta = METRIC_DEFINITIONS[metric] || {};
  if (resultType === 'metric') return null;

  const hint = lower(extras.chartHint || '');

  const shared = {
    metric,
    metricKind: meta.kind || 'count',
    aggregate: extras.aggregate || null,
    comparison: extras.comparison || null,
    timeframeLabel: extras.timeframeLabel || null,
  };

  if (resultType === 'timeseries') {
    const wantsBar = hint === 'bar' || (meta.preferredChart === 'bar' && hint !== 'line');
    return {
      kind: 'timeseries',
      layout: 'wide',
      title: `${meta.label || metric} trend`,
      series: data.points,
      chartType: wantsBar ? 'bar' : 'line',
      ...shared,
    };
  }

  if (resultType === 'distribution') {
    return {
      kind: 'distribution',
      title: `${meta.label || metric} split`,
      rows: data.rows,
      ...shared,
    };
  }

  if (resultType === 'table') {
    // Hint can promote a table to ranking or distribution when row count is low
    if ((hint === 'ranking' || hint === 'bar') && data.rows?.length <= 10) {
      return {
        kind: 'ranking',
        layout: data.rows.length > 5 ? 'wide' : 'standard',
        title: `${meta.label || metric} by ${querySpec.dimension || 'breakdown'}`,
        rows: data.rows,
        ...shared,
      };
    }
    if ((hint === 'donut' || hint === 'distribution' || hint === 'pie') && data.rows?.length <= 6) {
      return {
        kind: 'distribution',
        title: `${meta.label || metric} split`,
        rows: data.rows,
        ...shared,
      };
    }
    return {
      kind: 'table',
      layout: 'wide',
      title: `${meta.label || metric} breakdown`,
      rows: data.rows,
      dimension: querySpec.dimension,
      ...shared,
    };
  }

  if (resultType === 'ranking') {
    // Honour donut/distribution hint when row count allows it
    if ((hint === 'donut' || hint === 'distribution' || hint === 'pie') && data.rows?.length <= 6) {
      return {
        kind: 'distribution',
        title: `${meta.label || metric} split`,
        rows: data.rows,
        ...shared,
      };
    }
    return {
      kind: 'ranking',
      layout: data.rows.length > 5 ? 'wide' : 'standard',
      title: `${meta.label || metric} by ${querySpec.dimension || 'breakdown'}`,
      rows: data.rows,
      ...shared,
    };
  }

  return null;
}

function buildDerivedTrendPresentation(metric, querySpec, context = {}, extras = {}) {
  const meta = METRIC_DEFINITIONS[metric] || {};
  if (!metric || !meta || querySpec?.grain || querySpec?.dimension) return null;
  if (!querySpec?.timeRange?.days || querySpec.timeRange.days < 2) return null;

  const trendResult = executeSemanticQuery({
    ...querySpec,
    grain: querySpec.timeRange.days <= 90 ? 'date' : 'week',
  }, context);

  if (trendResult?.resultType !== 'timeseries' || !Array.isArray(trendResult?.data?.points) || trendResult.data.points.length <= 1) {
    return null;
  }

  const hint = lower(extras.chartHint || '');
  const wantsBar = hint === 'bar' || (meta.preferredChart === 'bar' && hint !== 'line');
  return {
    kind: 'timeseries',
    layout: 'wide',
    title: `${meta.label || metric} trend`,
    series: trendResult.data.points,
    metric,
    metricKind: meta.kind || 'count',
    chartType: wantsBar ? 'bar' : 'line',
    ...extras,
  };
}

function normalizeQuerySpec(querySpec = {}, context = {}) {
  let metric = inferMetric('', [querySpec.metric].filter(Boolean));
  let meta = METRIC_DEFINITIONS[metric] || {};
  let dimension = canonicalDimension(querySpec.dimension);
  let grain = normalizeGrain(querySpec.grain);

  if (dimension === 'date') {
    grain = 'date';
    dimension = null;
  }

  if (!grain && !dimension && meta.defaultDimension) {
    dimension = meta.defaultDimension;
  }

  if (dimension === 'risk_band' && metric === 'near_breach_tickets') {
    metric = 'sla_risk_count';
    meta = METRIC_DEFINITIONS[metric] || meta;
  }

  const timeRange = querySpec.timeRange?.days
    ? querySpec.timeRange
    : parseTimeRange(
      querySpec.timeRange?.label || querySpec.timeRange?.key || querySpec.timeRange,
      ''
    );
  const entity = resolveEntity(metric, dimension, querySpec.entity);

  return {
    entity,
    metric,
    dimension,
    filters: normalizeFilters(querySpec.filters || {}, context),
    timeRange,
    grain,
    comparison: inferComparison('', querySpec.comparison),
    limit: inferLimit('', querySpec.limit),
  };
}

function executeSemanticQuery(querySpec, context) {
  const normalizedQuerySpec = normalizeQuerySpec(querySpec, context);
  const query = normalizedQuerySpec;
  const dataset = buildSyntheticDataset(context.customerProfile || {}, context);
  const meta = METRIC_DEFINITIONS[query.metric];
  const sourceRows = dataset[ENTITY_ROW_MAP[query.entity || meta?.entity]] || [];
  const filtered = filterRows(filterRowsByTime(sourceRows, query.timeRange), query.filters);
  const previousRows = query.comparison === 'previous_period'
    ? filterRows(filterRowsByTime(sourceRows, { ...query.timeRange, offsetDays: query.timeRange.days }), query.filters)
    : [];
  const currentValue = getMetricValue(meta, filtered);
  const previousValue = previousRows.length ? getMetricValue(meta, previousRows) : null;

  if (query.grain) {
    const bucketMap = new Map();
    filtered.forEach((row) => {
      const key = bucketForRow(row, null, query.grain);
      if (!bucketMap.has(key)) bucketMap.set(key, []);
      bucketMap.get(key).push(row);
    });
    const points = [...bucketMap.entries()]
      .map(([label, rows]) => ({ label, value: getMetricValue(meta, rows) }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
      .map(point => ({ ...point, displayValue: formatMetricValue(querySpec.metric, point.value) }));

    return {
      querySpec: query,
      resultType: 'timeseries',
      data: { points },
      comparison: previousValue == null ? null : {
        current: currentValue,
        previous: previousValue,
        delta: compareValue(query.metric, currentValue, previousValue),
      },
    };
  }

  if (query.dimension) {
    const bucketMap = new Map();
    filtered.forEach((row) => {
      const key = bucketForRow(row, query.dimension, null);
      if (!bucketMap.has(key)) bucketMap.set(key, []);
      bucketMap.get(key).push(row);
    });

    const rows = getSortedRows(
      [...bucketMap.entries()].map(([label, groupRows]) => ({
        label,
        value: getMetricValue(meta, groupRows),
      })),
      query.dimension
    )
      .slice(0, query.limit || 6)
      .map(row => ({ ...row, displayValue: formatMetricValue(query.metric, row.value) }));

    const wantsDistribution = meta.preferredChart === 'doughnut' && rows.length > 1 && rows.length <= 5;
    const wantsTimeseriesBars = query.dimension === 'hour';
    return {
      querySpec: query,
      resultType: wantsTimeseriesBars ? 'timeseries' : wantsDistribution ? 'distribution' : (rows.length > 5 || meta.preferredChart === 'table' ? 'table' : 'ranking'),
      data: wantsTimeseriesBars
        ? { points: rows.map(row => ({ label: row.label, value: row.value, displayValue: row.displayValue })) }
        : { rows },
      comparison: previousValue == null ? null : {
        current: currentValue,
        previous: previousValue,
        delta: compareValue(query.metric, currentValue, previousValue),
      },
    };
  }

  return {
    querySpec: query,
    resultType: 'metric',
    data: {
      value: currentValue,
      displayValue: formatMetricValue(query.metric, currentValue),
    },
    comparison: previousValue == null ? null : {
      current: currentValue,
      previous: previousValue,
      delta: compareValue(query.metric, currentValue, previousValue),
    },
  };
}

function planSemanticQuery(payload = {}, context = {}) {
  const question = payload.question || '';
  let metric = inferMetric(question, payload.metrics || []);
  const explicitDimension = inferDimension(question, payload.dimensions || []);
  const grain = inferGrain(question, payload.grain);
  if (explicitDimension === 'risk_band' && metric === 'near_breach_tickets') {
    metric = 'sla_risk_count';
  }
  const meta = METRIC_DEFINITIONS[metric] || {};
  const dimension = explicitDimension || (!grain ? meta.defaultDimension || null : null);
  const comparison = inferComparison(question, payload.comparison);
  const timeRange = parseTimeRange(payload.timeRange, question);
  const filters = normalizeFilters(payload.filters || {}, context);
  const limit = inferLimit(question, payload.limit);
  const entity = resolveEntity(metric, dimension, payload.entity);

  const needsClarification = !dimension && !grain && /(which|who|best|worst|top|where)/i.test(question)
    ? 'Do you want that broken down by team, channel, region, plan, agent, or over time?'
    : null;

  return {
    querySpec: {
      entity,
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
  const querySpec = normalizeQuerySpec(payload.querySpec || {}, context);
  const result = payload.result || {};
  const metric = querySpec.metric || 'conversations';
  const resultType = result.resultType || 'metric';
  const data = result.data || {};

  // Compute aggregate + comparison via a metric-only query
  const aggResult = executeSemanticQuery({
    ...querySpec, grain: null, dimension: null, comparison: 'previous_period',
  }, context);

  const aggregate = aggResult?.data
    ? { value: aggResult.data.value ?? 0, displayValue: aggResult.data.displayValue ?? '0' }
    : null;

  const comparisonData = aggResult?.comparison && aggResult.comparison.delta != null
    ? {
        delta: aggResult.comparison.delta,
        direction: aggResult.comparison.delta > 0.001 ? 'up' : aggResult.comparison.delta < -0.001 ? 'down' : 'flat',
      }
    : null;

  // Resolve chart hint — explicit param takes priority, then infer from question text
  const explicitHint = lower(payload.chartHint || '');
  const inferredHint = (() => {
    if (explicitHint) return explicitHint;
    const q = lower(payload.question || '');
    if (q.includes('bar chart') || q.includes('bar graph') || q.includes('as a bar') || q.includes('as bar')) return 'bar';
    if (q.includes('donut') || q.includes('doughnut') || q.includes('pie chart') || q.includes('as a pie')) return 'donut';
    if (q.includes('line chart') || q.includes('line graph') || q.includes('as a line') || q.includes('trend line')) return 'line';
    if (q.includes('as a table') || q.includes('table view') || q.includes('show table')) return 'table';
    if (q.includes('ranking') || q.includes('horizontal bar') || q.includes('ranked')) return 'ranking';
    return '';
  })();

  const extras = {
    aggregate,
    comparison: comparisonData,
    timeframeLabel: querySpec.timeRange?.label || 'Selected period',
    chartHint: inferredHint || null,
  };

  const derivedTrendPresentation = resultType === 'metric'
    ? buildDerivedTrendPresentation(metric, querySpec, context, extras)
    : null;

  return {
    resultType,
    summaryHints: buildSummaryHints(metric, resultType, querySpec, data, context),
    presentation: buildPresentation(metric, resultType, querySpec, data, extras) || derivedTrendPresentation,
    caveats: [],
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
