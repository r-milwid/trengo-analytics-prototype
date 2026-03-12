const DAY_MS = 24 * 60 * 60 * 1000;
const START_DATE_UTC = Date.UTC(2025, 8, 15);
const TOTAL_DAYS = 210;

const DEFAULT_CHANNELS = ['email', 'whatsapp', 'live-chat', 'voice', 'instagram', 'facebook-messenger'];
const DEFAULT_VOICE_LINES = ['Support line', 'Priority line', 'Callback queue'];
const DEFAULT_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const DEFAULT_STATUSES = ['New', 'Assigned', 'Waiting', 'Escalated', 'Resolved'];
const DEFAULT_HANDOFF_REASONS = [
  'Low AI confidence',
  'Policy exception',
  'Billing complexity',
  'Identity verification',
  'High-value opportunity',
];
const DEFAULT_SUPPORT_INTENTS = [
  'Billing help',
  'Appointment changes',
  'Delivery issue',
  'Order status',
  'Technical problem',
  'Account access',
  'Cancellation',
];
const DEFAULT_SALES_INTENTS = [
  'Product demo',
  'Pricing request',
  'Plan comparison',
  'Procurement question',
  'Renewal discussion',
  'Expansion request',
  'Partner inquiry',
];
const DEFAULT_BACKLOG_BANDS = ['0-1 days', '2-3 days', '4-7 days', '8+ days'];
const DEFAULT_SLA_RISK_BANDS = ['On track', 'At risk', 'Near breach', 'Breached'];
const DEFAULT_SATISFACTION_THEMES = ['Speed', 'Clarity', 'Resolution quality', 'Empathy', 'Self-serve content'];
const DEFAULT_REOPEN_REASONS = ['Knowledge gap', 'Incorrect resolution', 'Cross-team handoff', 'Waiting on customer', 'Policy edge case'];
const DEFAULT_LEAD_SOURCES = ['Website', 'Paid search', 'Referral', 'Partner', 'Outbound'];
const DEFAULT_CALL_OUTCOMES = ['Connected', 'Missed', 'Callback requested', 'Voicemail', 'Escalated on call'];
const DEFAULT_AI_CONFIDENCE_BANDS = ['High', 'Medium', 'Low', 'Very low'];

const SUPPORT_CHANNEL_WEIGHTS = {
  email: 1.0,
  whatsapp: 1.18,
  'live-chat': 0.92,
  voice: 0.78,
  instagram: 0.42,
  'facebook-messenger': 0.38,
};

const SALES_CHANNEL_WEIGHTS = {
  email: 0.88,
  whatsapp: 0.94,
  'live-chat': 1.02,
  voice: 0.58,
  instagram: 1.18,
  'facebook-messenger': 1.04,
};

const AGENT_NAMES = [
  'Alex', 'Sam', 'Mila', 'Nina', 'Omar', 'Jules', 'Iris', 'Mason',
  'Leah', 'Theo', 'Sara', 'Noah', 'Emma', 'Luca', 'Yara', 'Mika',
];

const METRIC_DEFINITIONS = {
  conversations: { entity: 'team_daily', label: 'Conversations', kind: 'count', aggregate: 'sum', sourceKey: 'conversations' },
  leads_created: { entity: 'team_daily', label: 'New leads', kind: 'count', aggregate: 'sum', sourceKey: 'leadsCreated', preferredChart: 'bar' },
  tickets_created: { entity: 'team_daily', label: 'Tickets created', kind: 'count', aggregate: 'sum', sourceKey: 'ticketsCreated', preferredChart: 'line' },
  tickets_resolved: { entity: 'team_daily', label: 'Tickets resolved', kind: 'count', aggregate: 'sum', sourceKey: 'ticketsResolved', preferredChart: 'line' },
  open_tickets: { entity: 'team_daily', label: 'Open tickets', kind: 'count', aggregate: 'sum', sourceKey: 'openTickets' },
  assigned_tickets: { entity: 'team_daily', label: 'Assigned tickets', kind: 'count', aggregate: 'sum', sourceKey: 'assignedTickets' },
  reopened_tickets: { entity: 'team_daily', label: 'Reopened tickets', kind: 'count', aggregate: 'sum', sourceKey: 'reopenedTickets' },
  reopen_rate: { entity: 'team_daily', label: 'Reopen rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'reopenedTickets', denominatorKey: 'ticketsResolved' },
  aged_backlog_tickets: { entity: 'team_daily', label: 'Backlog older than 7 days', kind: 'count', aggregate: 'sum', sourceKey: 'backlogOlderThan7Days' },
  first_response_minutes: { entity: 'team_daily', label: 'First response time', kind: 'duration_minutes', aggregate: 'weighted_average', sourceKey: 'firstResponseMinutes', weightKey: 'ticketsCreated' },
  resolution_hours: { entity: 'team_daily', label: 'Resolution time', kind: 'duration_hours', aggregate: 'weighted_average', sourceKey: 'resolutionHours', weightKey: 'ticketsResolved' },
  sla_breaches: { entity: 'team_daily', label: 'SLA breaches', kind: 'count', aggregate: 'sum', sourceKey: 'slaBreaches' },
  sla_breach_rate: { entity: 'team_daily', label: 'SLA breach rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'slaBreaches', denominatorKey: 'ticketsCreated' },
  near_breach_tickets: { entity: 'team_daily', label: 'Tickets near breach', kind: 'count', aggregate: 'sum', sourceKey: 'nearBreachTickets' },
  csat: { entity: 'team_daily', label: 'CSAT', kind: 'score', aggregate: 'weighted_average', sourceKey: 'csatScore', weightKey: 'surveyResponses' },
  survey_responses: { entity: 'team_daily', label: 'Survey responses', kind: 'count', aggregate: 'sum', sourceKey: 'surveyResponses', preferredChart: 'bar' },
  survey_response_rate: { entity: 'team_daily', label: 'Response rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'surveyResponses', denominatorKey: 'surveysSent' },
  detractor_responses: { entity: 'team_daily', label: 'Detractor responses', kind: 'count', aggregate: 'sum', sourceKey: 'detractorResponses' },
  promoter_responses: { entity: 'team_daily', label: 'Promoter responses', kind: 'count', aggregate: 'sum', sourceKey: 'promoterResponses' },
  ai_tickets: { entity: 'team_daily', label: 'AI tickets', kind: 'count', aggregate: 'sum', sourceKey: 'aiTickets' },
  ai_assist_rate: { entity: 'team_daily', label: 'AI assistance rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'aiAssistCount', denominatorKey: 'ticketsCreated' },
  ai_resolution_rate: { entity: 'team_daily', label: 'AI resolution rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'aiResolvedCount', denominatorKey: 'ticketsCreated' },
  ai_open_ticket_rate: { entity: 'team_daily', label: 'Open ticket rate (AI)', kind: 'rate', aggregate: 'ratio', numeratorKey: 'aiOpenTickets', denominatorKey: 'aiTickets' },
  low_confidence_ai_tickets: { entity: 'team_daily', label: 'Low-confidence AI tickets', kind: 'count', aggregate: 'sum', sourceKey: 'lowConfidenceAiTickets' },
  handoff_rate: { entity: 'team_daily', label: 'Handoff rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'handoffCount', denominatorKey: 'aiTickets' },
  escalation_rate: { entity: 'team_daily', label: 'Escalation rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'handoffCount', denominatorKey: 'ticketsCreated' },
  automation_success_rate: { entity: 'team_daily', label: 'Journeys success ratio', kind: 'rate', aggregate: 'ratio', numeratorKey: 'automationSuccessCount', denominatorKey: 'automationRuns' },
  journeys_escalations: { entity: 'team_daily', label: 'Journeys escalations', kind: 'count', aggregate: 'sum', sourceKey: 'journeysEscalations' },
  guardrail_violations: { entity: 'team_daily', label: 'Safety and guardrail violations', kind: 'count', aggregate: 'sum', sourceKey: 'safetyViolations' },
  automation_conflicts: { entity: 'team_daily', label: 'Automation conflicts', kind: 'count', aggregate: 'sum', sourceKey: 'automationConflicts' },
  pipeline_value: { entity: 'team_daily', label: 'Pipeline value', kind: 'currency', aggregate: 'sum', sourceKey: 'pipelineValue' },
  deals_created: { entity: 'team_daily', label: 'Deals created', kind: 'count', aggregate: 'sum', sourceKey: 'dealsCreated', preferredChart: 'bar' },
  deals_won: { entity: 'team_daily', label: 'Deals won', kind: 'count', aggregate: 'sum', sourceKey: 'dealsWon' },
  win_rate: { entity: 'team_daily', label: 'Win rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'dealsWon', denominatorKey: 'dealsCreated' },
  avg_deal_size: { entity: 'team_daily', label: 'Average deal size', kind: 'currency', aggregate: 'ratio', numeratorKey: 'wonRevenue', denominatorKey: 'dealsWon' },
  sales_cycle_days: { entity: 'team_daily', label: 'Sales cycle', kind: 'duration_days', aggregate: 'weighted_average', sourceKey: 'salesCycleDays', weightKey: 'dealsCreated' },
  total_calls: { entity: 'team_daily', label: 'Total calls', kind: 'count', aggregate: 'sum', sourceKey: 'totalCalls' },
  missed_calls: { entity: 'team_daily', label: 'Missed calls', kind: 'count', aggregate: 'sum', sourceKey: 'missedCalls' },
  missed_call_rate: { entity: 'team_daily', label: 'Missed call rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'missedCalls', denominatorKey: 'inboundCalls' },
  inbound_calls: { entity: 'team_daily', label: 'Inbound calls', kind: 'count', aggregate: 'sum', sourceKey: 'inboundCalls' },
  outbound_calls: { entity: 'team_daily', label: 'Outbound calls', kind: 'count', aggregate: 'sum', sourceKey: 'outboundCalls' },
  avg_wait_minutes: { entity: 'team_daily', label: 'Average wait time', kind: 'duration_minutes', aggregate: 'weighted_average', sourceKey: 'avgWaitMinutes', weightKey: 'totalCalls' },
  longest_wait_minutes: { entity: 'team_daily', label: 'Longest wait time', kind: 'duration_minutes', aggregate: 'max', sourceKey: 'longestWaitMinutes' },
  callback_requests: { entity: 'team_daily', label: 'Callback requests', kind: 'count', aggregate: 'sum', sourceKey: 'callbackRequests' },
  callback_completion_rate: { entity: 'team_daily', label: 'Callback completion rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'callbackCompletedCount', denominatorKey: 'callbackRequests' },
  avg_call_duration_minutes: { entity: 'team_daily', label: 'Call duration', kind: 'duration_minutes', aggregate: 'weighted_average', sourceKey: 'avgCallDurationMinutes', weightKey: 'totalCalls' },
  first_call_resolution_rate: { entity: 'team_daily', label: 'First call resolution', kind: 'rate', aggregate: 'ratio', numeratorKey: 'firstCallResolutionCount', denominatorKey: 'inboundCalls' },
  call_to_ticket_rate: { entity: 'team_daily', label: 'Call-to-ticket rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'callToTicketCount', denominatorKey: 'totalCalls' },
  abandonment_rate: { entity: 'team_daily', label: 'Abandonment rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'abandonmentCount', denominatorKey: 'inboundCalls' },
  ivr_queue_minutes: { entity: 'team_daily', label: 'Time in IVR / queue', kind: 'duration_minutes', aggregate: 'weighted_average', sourceKey: 'ivrQueueMinutes', weightKey: 'totalCalls' },
  knowledge_gap_count: { entity: 'team_daily', label: 'Knowledge gaps', kind: 'count', aggregate: 'sum', sourceKey: 'knowledgeGapCount' },
  unknown_intents: { entity: 'team_daily', label: 'Unknown intents', kind: 'count', aggregate: 'sum', sourceKey: 'unknownIntents' },
  opportunity_count: { entity: 'team_daily', label: 'Opportunities backlog', kind: 'count', aggregate: 'sum', sourceKey: 'opportunityCount' },
  capacity_hours: { entity: 'team_daily', label: 'Capacity hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'capacityHours' },
  demand_hours: { entity: 'team_daily', label: 'Demand hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'demandHours' },
  capacity_gap_hours: { entity: 'team_daily', label: 'Capacity gap', kind: 'duration_hours', aggregate: 'difference', numeratorKey: 'demandHours', denominatorKey: 'capacityHours' },
  after_hours_volume: { entity: 'team_daily', label: 'After-hours volume', kind: 'count', aggregate: 'sum', sourceKey: 'afterHoursVolume' },
  queue_overflow_tickets: { entity: 'team_daily', label: 'Queue overflow tickets', kind: 'count', aggregate: 'sum', sourceKey: 'queueOverflowTickets' },
  conversations_handled: { entity: 'agent_daily', label: 'Conversations handled', kind: 'count', aggregate: 'sum', sourceKey: 'conversationsHandled' },
  agent_csat: { entity: 'agent_daily', label: 'Agent CSAT', kind: 'score', aggregate: 'weighted_average', sourceKey: 'csatScore', weightKey: 'surveyResponses' },
  agent_open_tickets: { entity: 'agent_daily', label: 'Assigned open tickets', kind: 'count', aggregate: 'sum', sourceKey: 'assignedOpenTickets' },
  intent_volume: { entity: 'intent_daily', label: 'Intent volume', kind: 'count', aggregate: 'sum', sourceKey: 'intentVolume', defaultDimension: 'intent', preferredChart: 'bar' },
  intent_escalations: { entity: 'intent_daily', label: 'Escalations by intent', kind: 'count', aggregate: 'sum', sourceKey: 'escalationCount', defaultDimension: 'intent', preferredChart: 'bar' },
  intent_knowledge_gaps: { entity: 'intent_daily', label: 'Knowledge gaps by intent', kind: 'count', aggregate: 'sum', sourceKey: 'knowledgeGapCount', defaultDimension: 'intent', preferredChart: 'bar' },
  stage_count: { entity: 'stage_daily', label: 'Deals by stage', kind: 'count', aggregate: 'sum', sourceKey: 'dealCount', defaultDimension: 'stage', preferredChart: 'bar' },
  stage_value: { entity: 'stage_daily', label: 'Pipeline by stage', kind: 'currency', aggregate: 'sum', sourceKey: 'stageValue', defaultDimension: 'stage', preferredChart: 'bar' },
  status_count: { entity: 'workflow_status_daily', label: 'Ticket count by status', kind: 'count', aggregate: 'sum', sourceKey: 'count', defaultDimension: 'status', preferredChart: 'bar' },
  handoff_reason_count: { entity: 'handoff_reason_daily', label: 'Automation handoff reasons', kind: 'count', aggregate: 'sum', sourceKey: 'handoffCount', defaultDimension: 'reason', preferredChart: 'bar' },
  contact_count: { entity: 'contact_type_daily', label: 'Contacts', kind: 'count', aggregate: 'sum', sourceKey: 'contactCount', defaultDimension: 'contact_type', preferredChart: 'doughnut' },
  backlog_age_count: { entity: 'aging_band_daily', label: 'Backlog aging', kind: 'count', aggregate: 'sum', sourceKey: 'ticketCount', defaultDimension: 'age_band', preferredChart: 'bar' },
  sla_risk_count: { entity: 'sla_risk_daily', label: 'SLA risk mix', kind: 'count', aggregate: 'sum', sourceKey: 'ticketCount', defaultDimension: 'risk_band', preferredChart: 'bar' },
  satisfaction_theme_count: { entity: 'satisfaction_theme_daily', label: 'Satisfaction themes', kind: 'count', aggregate: 'sum', sourceKey: 'responseCount', defaultDimension: 'theme', preferredChart: 'bar' },
  satisfaction_theme_detractors: { entity: 'satisfaction_theme_daily', label: 'Detractor themes', kind: 'count', aggregate: 'sum', sourceKey: 'detractorCount', defaultDimension: 'theme', preferredChart: 'bar' },
  reopen_reason_count: { entity: 'reopen_reason_daily', label: 'Reopen reasons', kind: 'count', aggregate: 'sum', sourceKey: 'reopenCount', defaultDimension: 'reason', preferredChart: 'bar' },
  lead_source_count: { entity: 'lead_source_daily', label: 'Lead sources', kind: 'count', aggregate: 'sum', sourceKey: 'leadCount', defaultDimension: 'source', preferredChart: 'bar' },
  lead_source_win_rate: { entity: 'lead_source_daily', label: 'Lead source win rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'dealsWon', denominatorKey: 'dealsCreated', defaultDimension: 'source', preferredChart: 'bar' },
  lead_source_pipeline_value: { entity: 'lead_source_daily', label: 'Pipeline by lead source', kind: 'currency', aggregate: 'sum', sourceKey: 'pipelineValue', defaultDimension: 'source', preferredChart: 'bar' },
  call_outcome_count: { entity: 'call_outcome_daily', label: 'Call outcomes', kind: 'count', aggregate: 'sum', sourceKey: 'outcomeCount', defaultDimension: 'outcome', preferredChart: 'bar' },
  ai_confidence_count: { entity: 'ai_confidence_daily', label: 'AI confidence mix', kind: 'count', aggregate: 'sum', sourceKey: 'ticketCount', defaultDimension: 'confidence_band', preferredChart: 'bar' },
  ai_confidence_handoffs: { entity: 'ai_confidence_daily', label: 'Handoffs by AI confidence', kind: 'count', aggregate: 'sum', sourceKey: 'handoffCount', defaultDimension: 'confidence_band', preferredChart: 'bar' },
  new_contacts: { entity: 'team_daily', label: 'New contacts', kind: 'count', aggregate: 'sum', sourceKey: 'newContacts' },
  returning_contacts: { entity: 'team_daily', label: 'Returning contacts', kind: 'count', aggregate: 'sum', sourceKey: 'returningContacts' },
  hourly_ticket_count: { entity: 'hourly_daily', label: 'Tickets by hour', kind: 'count', aggregate: 'sum', sourceKey: 'ticketCount', defaultDimension: 'hour', preferredChart: 'bar' },
  hourly_call_count: { entity: 'hourly_daily', label: 'Calls by hour', kind: 'count', aggregate: 'sum', sourceKey: 'callCount', defaultDimension: 'hour', preferredChart: 'bar' },
  voice_channel_calls: { entity: 'voice_channel_daily', label: 'Voice channel calls', kind: 'count', aggregate: 'sum', sourceKey: 'totalCalls', defaultDimension: 'channel', preferredChart: 'table' },
  voice_channel_wait: { entity: 'voice_channel_daily', label: 'Voice channel wait time', kind: 'duration_minutes', aggregate: 'weighted_average', sourceKey: 'avgWaitMinutes', weightKey: 'totalCalls', defaultDimension: 'channel', preferredChart: 'table' },
  direction_calls: { entity: 'voice_direction_daily', label: 'Calls by direction', kind: 'count', aggregate: 'sum', sourceKey: 'callCount', defaultDimension: 'direction', preferredChart: 'bar' },
};

const METRIC_ALIASES = {
  conversations: 'conversations',
  volume: 'conversations',
  'contact volume': 'conversations',
  'new leads': 'leads_created',
  leads: 'leads_created',
  'tickets created': 'tickets_created',
  'created tickets': 'tickets_created',
  'closed tickets': 'tickets_resolved',
  'resolved tickets': 'tickets_resolved',
  'open tickets': 'open_tickets',
  'assigned tickets': 'assigned_tickets',
  'reopened tickets': 'reopened_tickets',
  'reopen rate': 'reopen_rate',
  'aged backlog': 'aged_backlog_tickets',
  'old backlog': 'aged_backlog_tickets',
  'backlog older than 7 days': 'aged_backlog_tickets',
  frt: 'first_response_minutes',
  'first response': 'first_response_minutes',
  'first response time': 'first_response_minutes',
  'resolution time': 'resolution_hours',
  'sla breaches': 'sla_breaches',
  'sla breach rate': 'sla_breach_rate',
  'sla compliance': 'sla_breach_rate',
  'near breach tickets': 'near_breach_tickets',
  'tickets near breach': 'near_breach_tickets',
  'sla risk': 'sla_risk_count',
  'breach risk': 'sla_risk_count',
  'sla risk mix': 'sla_risk_count',
  sla: 'sla_breach_rate',
  csat: 'csat',
  satisfaction: 'csat',
  detractors: 'detractor_responses',
  'detractor responses': 'detractor_responses',
  promoters: 'promoter_responses',
  'promoter responses': 'promoter_responses',
  'csat themes': 'satisfaction_theme_count',
  'satisfaction themes': 'satisfaction_theme_count',
  'detractor themes': 'satisfaction_theme_detractors',
  'why is csat down': 'satisfaction_theme_detractors',
  'response rate': 'survey_response_rate',
  'survey response rate': 'survey_response_rate',
  'surveys received': 'survey_responses',
  surveys: 'survey_responses',
  'ai tickets': 'ai_tickets',
  'ai agent tickets': 'ai_tickets',
  'ai assist rate': 'ai_assist_rate',
  'ai assistance rate': 'ai_assist_rate',
  'ai resolution rate': 'ai_resolution_rate',
  'open ticket rate': 'ai_open_ticket_rate',
  'open ticket rate (ai)': 'ai_open_ticket_rate',
  'low confidence ai tickets': 'low_confidence_ai_tickets',
  'low confidence': 'ai_confidence_count',
  'ai confidence': 'ai_confidence_count',
  'ai confidence mix': 'ai_confidence_count',
  'handoffs by confidence': 'ai_confidence_handoffs',
  'handoff rate': 'handoff_rate',
  handoffs: 'handoff_reason_count',
  'handoff reasons': 'handoff_reason_count',
  'automation handoff reasons': 'handoff_reason_count',
  'escalation rate': 'escalation_rate',
  'journeys success': 'automation_success_rate',
  'journeys success ratio': 'automation_success_rate',
  'automation success rate': 'automation_success_rate',
  'journeys escalations': 'journeys_escalations',
  'guardrail violations': 'guardrail_violations',
  safety: 'guardrail_violations',
  conflicts: 'automation_conflicts',
  'automation conflicts': 'automation_conflicts',
  pipeline: 'pipeline_value',
  'pipeline value': 'pipeline_value',
  'deals created': 'deals_created',
  'deals won': 'deals_won',
  'win rate': 'win_rate',
  'avg deal size': 'avg_deal_size',
  'average deal size': 'avg_deal_size',
  'sales cycle': 'sales_cycle_days',
  'total calls': 'total_calls',
  calls: 'total_calls',
  'missed calls': 'missed_calls',
  'missed call rate': 'missed_call_rate',
  'inbound calls': 'inbound_calls',
  'outbound calls': 'outbound_calls',
  'average wait time': 'avg_wait_minutes',
  'wait time': 'avg_wait_minutes',
  'longest wait time': 'longest_wait_minutes',
  'callback requests': 'callback_requests',
  callbacks: 'callback_requests',
  'callback completion rate': 'callback_completion_rate',
  'after hours volume': 'after_hours_volume',
  'after-hours volume': 'after_hours_volume',
  'queue overflow': 'queue_overflow_tickets',
  'overflow tickets': 'queue_overflow_tickets',
  'call outcomes': 'call_outcome_count',
  'how calls end': 'call_outcome_count',
  'call result': 'call_outcome_count',
  'call duration': 'avg_call_duration_minutes',
  'first call resolution': 'first_call_resolution_rate',
  'call-to-ticket rate': 'call_to_ticket_rate',
  'call to ticket rate': 'call_to_ticket_rate',
  'abandonment rate': 'abandonment_rate',
  abandonment: 'abandonment_rate',
  'ivr / queue time': 'ivr_queue_minutes',
  'time in ivr': 'ivr_queue_minutes',
  'time in queue': 'ivr_queue_minutes',
  'knowledge gaps': 'knowledge_gap_count',
  'knowledge gaps by intent': 'intent_knowledge_gaps',
  'unknown intents': 'unknown_intents',
  'unknown / unclassified intents': 'unknown_intents',
  'opportunities backlog': 'opportunity_count',
  opportunities: 'opportunity_count',
  'backlog age': 'backlog_age_count',
  'aging buckets': 'backlog_age_count',
  'age bands': 'backlog_age_count',
  'reopen reasons': 'reopen_reason_count',
  'why tickets reopen': 'reopen_reason_count',
  'capacity vs demand': 'capacity_gap_hours',
  'capacity gap': 'capacity_gap_hours',
  'over capacity': 'capacity_gap_hours',
  'capacity shortfall': 'capacity_gap_hours',
  overloaded: 'capacity_gap_hours',
  'capacity hours': 'capacity_hours',
  'demand hours': 'demand_hours',
  'conversations handled': 'conversations_handled',
  'agent csat': 'agent_csat',
  'workload by agent': 'agent_open_tickets',
  'intent trends': 'intent_volume',
  'intent clusters': 'intent_volume',
  'emerging intents': 'intent_volume',
  'escalations by intent': 'intent_escalations',
  'funnel': 'stage_count',
  'sales funnel': 'stage_count',
  'pipeline funnel': 'stage_count',
  'lead sources': 'lead_source_count',
  'best lead source': 'lead_source_win_rate',
  'lead source win rate': 'lead_source_win_rate',
  'pipeline by source': 'lead_source_pipeline_value',
  'channel x stage': 'stage_count',
  'ticket counts per status': 'status_count',
  bottlenecks: 'status_count',
  'new vs returning': 'contact_count',
  'new vs returning contacts': 'contact_count',
  'new contacts': 'new_contacts',
  'returning contacts': 'returning_contacts',
  'tickets by hour': 'hourly_ticket_count',
  'tickets created by hour': 'hourly_ticket_count',
  'calls by hour': 'hourly_call_count',
  'calls by team': 'total_calls',
  'voice channel performance': 'voice_channel_wait',
  'performance by channel': 'voice_channel_wait',
  'calls by direction': 'direction_calls',
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
    supportBias: industry.includes('health') ? 1.18 : industry.includes('mobility') ? 1.1 : 1.0,
    salesBias: industry.includes('commerce') ? 1.18 : 1.0,
    voiceBias: industry.includes('health') || industry.includes('mobility') ? 1.14 : 0.86,
    automationBias: 0.92 + rand() * 0.18,
    aiBias: 0.94 + rand() * 0.16,
    csatBias: 0.96 + rand() * 0.12,
    pipelineBias: 0.9 + rand() * 0.22,
    queueBias: 0.94 + rand() * 0.2,
    growthBias: 0.96 + rand() * 0.14,
  };
}

function getIntentCatalog(focus) {
  if (focus === 'support') return DEFAULT_SUPPORT_INTENTS;
  if (focus === 'sales') return DEFAULT_SALES_INTENTS;
  return [...DEFAULT_SUPPORT_INTENTS.slice(0, 4), ...DEFAULT_SALES_INTENTS.slice(0, 3)];
}

function getStatusWeights(focus) {
  if (focus === 'sales') {
    return { New: 0.18, Assigned: 0.2, Waiting: 0.18, Escalated: 0.08, Resolved: 0.36 };
  }
  return { New: 0.14, Assigned: 0.24, Waiting: 0.21, Escalated: 0.09, Resolved: 0.32 };
}

function getStageWeights() {
  return {
    Lead: 0.28,
    Qualified: 0.22,
    Proposal: 0.18,
    Negotiation: 0.14,
    Won: 0.1,
    Lost: 0.08,
  };
}

function buildSyntheticDataset(customerProfile = {}, context = {}) {
  const teams = buildTeamDefinitions(customerProfile);
  const channels = buildChannels(customerProfile);
  const overlay = getOverlayFactors(customerProfile);
  const seedBase = hashSeed(`${customerProfile?.id || customerProfile?.company || 'prototype'}:${context.role || 'admin'}`);

  const teamDaily = [];
  const agentDaily = [];
  const intentDaily = [];
  const stageDaily = [];
  const hourlyDaily = [];
  const voiceChannelDaily = [];
  const voiceDirectionDaily = [];
  const workflowStatusDaily = [];
  const handoffReasonDaily = [];
  const contactTypeDaily = [];
  const agingBandDaily = [];
  const slaRiskDaily = [];
  const satisfactionThemeDaily = [];
  const reopenReasonDaily = [];
  const leadSourceDaily = [];
  const callOutcomeDaily = [];
  const aiConfidenceDaily = [];
  const agentStatusSnapshot = [];

  teams.forEach((team, teamIndex) => {
    const agents = buildAgentNames(team.name, clamp(Math.round(team.size / 2), 3, 8));
    const supportLike = team.focus === 'support' || team.focus === 'both';
    const salesLike = team.focus === 'sales' || team.focus === 'both';
    const baseVolume = (supportLike ? 118 : 46) * (supportLike ? overlay.supportBias : overlay.salesBias) * (0.92 + teamIndex * 0.08);
    const teamCapacityBase = team.size * (supportLike ? 7.3 : 6.8);

    for (let dayIndex = 0; dayIndex < TOTAL_DAYS; dayIndex += 1) {
      const dateTs = START_DATE_UTC + (dayIndex * DAY_MS);
      const weekday = new Date(dateTs).getUTCDay();
      const weekdayFactor = weekday === 0 ? 0.72 : weekday === 6 ? 0.82 : weekday === 1 ? 1.06 : 1.0;
      const trendFactor = 0.92 + ((dayIndex / TOTAL_DAYS) * 0.16 * overlay.growthBias);
      const seasonalFactor = 1 + (Math.sin((dayIndex / 14) + teamIndex) * 0.08);

      const teamTotals = {
        conversations: 0,
        leadsCreated: 0,
        ticketsCreated: 0,
        ticketsResolved: 0,
        openTickets: 0,
        assignedTickets: 0,
        reopenedTickets: 0,
        backlogOlderThan7Days: 0,
        slaBreaches: 0,
        pipelineValue: 0,
        wonRevenue: 0,
        dealsCreated: 0,
        dealsWon: 0,
        totalCalls: 0,
        inboundCalls: 0,
        outboundCalls: 0,
        missedCalls: 0,
        abandonmentCount: 0,
        callbackRequests: 0,
        callbackCompletedCount: 0,
        surveysSent: 0,
        surveyResponses: 0,
        detractorResponses: 0,
        promoterResponses: 0,
        knowledgeGapCount: 0,
        unknownIntents: 0,
        opportunityCount: 0,
        handoffCount: 0,
        automationRuns: 0,
        automationSuccessCount: 0,
        journeysEscalations: 0,
        safetyViolations: 0,
        automationConflicts: 0,
        aiTickets: 0,
        aiResolvedCount: 0,
        aiAssistCount: 0,
        aiOpenTickets: 0,
        lowConfidenceAiTickets: 0,
        callToTicketCount: 0,
        firstCallResolutionCount: 0,
        demandHours: 0,
        capacityHours: teamCapacityBase * weekdayFactor,
        afterHoursVolume: 0,
        nearBreachTickets: 0,
        queueOverflowTickets: 0,
        channelRows: [],
      };

      channels.forEach((channel, channelIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:${channel}:${dayIndex}`));
        const channelWeights = salesLike ? SALES_CHANNEL_WEIGHTS : SUPPORT_CHANNEL_WEIGHTS;
        const channelWeight = channelWeights[channel] || 0.64;
        const voiceFactor = channel === 'voice' ? overlay.voiceBias : 1;
        const conversations = Math.max(
          2,
          Math.round(baseVolume * channelWeight * weekdayFactor * seasonalFactor * trendFactor * voiceFactor * (0.86 + localRand() * 0.32))
        );
        const ticketsCreated = supportLike
          ? Math.round(conversations * (0.74 + localRand() * 0.16))
          : Math.round(conversations * (0.24 + localRand() * 0.1));
        const leadsCreated = salesLike
          ? Math.round(conversations * (0.18 + localRand() * 0.08))
          : Math.round(conversations * 0.04 * (0.8 + localRand() * 0.4));
        const ticketsResolved = Math.round(ticketsCreated * (supportLike ? 0.78 + localRand() * 0.12 : 0.56 + localRand() * 0.14));
        const openTickets = Math.max(2, Math.round(ticketsCreated * (0.38 + localRand() * 0.16)));
        const assignedTickets = Math.max(1, Math.round(openTickets * (0.76 + localRand() * 0.12)));
        const reopenedTickets = Math.round(ticketsResolved * (supportLike ? 0.06 + localRand() * 0.03 : 0.03 + localRand() * 0.02));
        const backlogOlderThan7Days = Math.round(openTickets * clamp(0.12 + localRand() * 0.12, 0.04, 0.44));
        const firstResponseMinutes = round((supportLike ? 24 : 18) * (channel === 'voice' ? 0.52 : 1) * (0.9 + localRand() * 0.24), 1);
        const resolutionHours = round((supportLike ? 13 : 34) * (0.86 + localRand() * 0.28), 1);
        const slaBreaches = Math.round(ticketsCreated * (supportLike ? 0.06 : 0.03) * (0.84 + localRand() * 0.42));
        const nearBreachTickets = Math.round(Math.max(openTickets, ticketsCreated * 0.4) * clamp(0.12 + localRand() * 0.12, 0.04, 0.34));
        const surveysSent = Math.round(Math.max(1, ticketsResolved * (0.46 + localRand() * 0.12)));
        const surveyResponses = Math.round(Math.max(1, surveysSent * (0.28 + localRand() * 0.12)));
        const detractorResponses = Math.min(
          surveyResponses,
          Math.round(surveyResponses * clamp(0.1 + localRand() * 0.1, 0.03, 0.34))
        );
        const promoterResponses = Math.min(
          surveyResponses - detractorResponses,
          Math.round(surveyResponses * clamp(0.42 + localRand() * 0.18, 0.16, 0.78))
        );
        const csatScore = round(clamp((supportLike ? 4.25 : 4.08) * overlay.csatBias * (0.97 + localRand() * 0.05), 3.45, 4.92), 2);
        const aiTickets = Math.round(ticketsCreated * clamp((supportLike ? 0.56 : 0.34) * overlay.aiBias * (0.92 + localRand() * 0.16), 0.08, 0.82));
        const aiAssistCount = Math.round(ticketsCreated * clamp((supportLike ? 0.44 : 0.28) * overlay.aiBias * (0.9 + localRand() * 0.18), 0.08, 0.74));
        const aiResolvedCount = Math.round(aiTickets * clamp((supportLike ? 0.38 : 0.24) * (0.88 + localRand() * 0.18), 0.05, 0.68));
        const handoffCount = Math.round(aiTickets * clamp((supportLike ? 0.22 : 0.16) * (0.9 + localRand() * 0.18), 0.04, 0.42));
        const aiOpenTickets = Math.max(0, aiTickets - aiResolvedCount - Math.round(handoffCount * 0.45));
        const lowConfidenceAiTickets = Math.round(aiTickets * clamp(0.16 + localRand() * 0.16, 0.04, 0.48));
        const automationRuns = Math.round(ticketsCreated * clamp((supportLike ? 0.28 : 0.18) * overlay.automationBias * (0.9 + localRand() * 0.2), 0.05, 0.56));
        const automationSuccessCount = Math.round(automationRuns * clamp(0.68 + localRand() * 0.18, 0.44, 0.93));
        const journeysEscalations = Math.round(automationRuns * clamp(0.08 + localRand() * 0.06, 0.02, 0.24));
        const safetyViolations = Math.round(automationRuns * clamp(0.009 + localRand() * 0.008, 0.002, 0.04));
        const automationConflicts = Math.round(automationRuns * clamp(0.012 + localRand() * 0.008, 0.002, 0.05));
        const avgDealSize = round((salesLike ? 3200 : 900) * overlay.pipelineBias * (0.82 + localRand() * 0.36), 0);
        const dealsCreated = salesLike ? Math.round(leadsCreated * (0.62 + localRand() * 0.12)) : Math.round(leadsCreated * 0.28);
        const dealsWon = Math.round(dealsCreated * clamp((salesLike ? 0.32 : 0.16) * (0.88 + localRand() * 0.18), 0.05, 0.62));
        const pipelineValue = round(dealsCreated * avgDealSize * (1.24 + localRand() * 0.76), 0);
        const wonRevenue = round(dealsWon * avgDealSize * (0.82 + localRand() * 0.28), 0);
        const salesCycleDays = round((salesLike ? 22 : 8) * (0.88 + localRand() * 0.24), 1);
        const totalCalls = channel === 'voice' ? Math.max(0, Math.round(conversations * (0.9 + localRand() * 0.12))) : 0;
        const inboundCalls = Math.round(totalCalls * (supportLike ? 0.74 : 0.56));
        const outboundCalls = Math.max(0, totalCalls - inboundCalls);
        const missedCalls = Math.round(inboundCalls * clamp(0.06 + localRand() * 0.06, 0.02, 0.24));
        const abandonmentCount = Math.round(inboundCalls * clamp(0.05 + localRand() * 0.05, 0.02, 0.22));
        const callbackRequests = Math.round(abandonmentCount * clamp(0.34 + localRand() * 0.28, 0.12, 0.82));
        const callbackCompletedCount = Math.round(callbackRequests * clamp(0.44 + localRand() * 0.28, 0.14, 0.92));
        const avgWaitMinutes = round((supportLike ? 2.8 : 1.9) * overlay.queueBias * (0.88 + localRand() * 0.22), 1);
        const longestWaitMinutes = round(avgWaitMinutes * (3.2 + localRand() * 2.1), 1);
        const avgCallDurationMinutes = round((supportLike ? 7.8 : 5.9) * (0.88 + localRand() * 0.24), 1);
        const firstCallResolutionCount = Math.round(inboundCalls * clamp((supportLike ? 0.62 : 0.48) * (0.9 + localRand() * 0.16), 0.2, 0.92));
        const callToTicketCount = Math.round(totalCalls * clamp((supportLike ? 0.32 : 0.12) * (0.9 + localRand() * 0.16), 0.02, 0.74));
        const ivrQueueMinutes = round(avgWaitMinutes * (0.72 + localRand() * 0.18), 1);
        const knowledgeGapCount = Math.round(ticketsCreated * clamp(0.04 + localRand() * 0.04, 0.01, 0.18));
        const unknownIntents = Math.round(ticketsCreated * clamp(0.03 + localRand() * 0.03, 0.01, 0.16));
        const opportunityCount = Math.round((knowledgeGapCount + reopenedTickets + missedCalls) * clamp(0.42 + localRand() * 0.24, 0.18, 1.2));
        const newContacts = Math.round(conversations * clamp((salesLike ? 0.62 : 0.36) * (0.9 + localRand() * 0.18), 0.12, 0.88));
        const returningContacts = Math.max(0, conversations - newContacts);
        const demandHours = round((ticketsCreated * 0.11) + ((totalCalls * avgCallDurationMinutes) / 60) + (dealsCreated * 0.35), 1);
        const capacityHours = round(teamCapacityBase * weekdayFactor * (conversations / Math.max(1, baseVolume * channels.length * 0.9)), 1);
        const afterHoursVolume = Math.round(conversations * clamp((channel === 'whatsapp' ? 0.14 : channel === 'voice' ? 0.1 : 0.07) * (0.9 + localRand() * 0.16), 0.02, 0.28));
        const queueOverflowTickets = Math.round(ticketsCreated * clamp(0.03 + localRand() * 0.04, 0.01, 0.18));

        const row = {
          date: formatDate(dateTs),
          team: team.name,
          teamKey: team.key,
          teamFocus: team.focus,
          channel,
          conversations,
          leadsCreated,
          ticketsCreated,
          ticketsResolved,
          openTickets,
          assignedTickets,
          reopenedTickets,
          backlogOlderThan7Days,
          firstResponseMinutes,
          resolutionHours,
          slaBreaches,
          nearBreachTickets,
          surveysSent,
          surveyResponses,
          detractorResponses,
          promoterResponses,
          csatScore,
          aiTickets,
          aiAssistCount,
          aiResolvedCount,
          aiOpenTickets,
          lowConfidenceAiTickets,
          handoffCount,
          automationRuns,
          automationSuccessCount,
          journeysEscalations,
          safetyViolations,
          automationConflicts,
          dealsCreated,
          dealsWon,
          pipelineValue,
          wonRevenue,
          salesCycleDays,
          totalCalls,
          missedCalls,
          inboundCalls,
          outboundCalls,
          abandonmentCount,
          callbackRequests,
          callbackCompletedCount,
          avgWaitMinutes,
          longestWaitMinutes,
          avgCallDurationMinutes,
          firstCallResolutionCount,
          callToTicketCount,
          ivrQueueMinutes,
          knowledgeGapCount,
          unknownIntents,
          opportunityCount,
          newContacts,
          returningContacts,
          capacityHours,
          demandHours,
          afterHoursVolume,
          queueOverflowTickets,
        };

        teamDaily.push(row);
        teamTotals.conversations += conversations;
        teamTotals.leadsCreated += leadsCreated;
        teamTotals.ticketsCreated += ticketsCreated;
        teamTotals.ticketsResolved += ticketsResolved;
        teamTotals.openTickets += openTickets;
        teamTotals.assignedTickets += assignedTickets;
        teamTotals.reopenedTickets += reopenedTickets;
        teamTotals.backlogOlderThan7Days += backlogOlderThan7Days;
        teamTotals.slaBreaches += slaBreaches;
        teamTotals.pipelineValue += pipelineValue;
        teamTotals.wonRevenue += wonRevenue;
        teamTotals.dealsCreated += dealsCreated;
        teamTotals.dealsWon += dealsWon;
        teamTotals.totalCalls += totalCalls;
        teamTotals.inboundCalls += inboundCalls;
        teamTotals.outboundCalls += outboundCalls;
        teamTotals.missedCalls += missedCalls;
        teamTotals.abandonmentCount += abandonmentCount;
        teamTotals.callbackRequests += callbackRequests;
        teamTotals.callbackCompletedCount += callbackCompletedCount;
        teamTotals.surveysSent += surveysSent;
        teamTotals.surveyResponses += surveyResponses;
        teamTotals.detractorResponses += detractorResponses;
        teamTotals.promoterResponses += promoterResponses;
        teamTotals.knowledgeGapCount += knowledgeGapCount;
        teamTotals.unknownIntents += unknownIntents;
        teamTotals.opportunityCount += opportunityCount;
        teamTotals.handoffCount += handoffCount;
        teamTotals.automationRuns += automationRuns;
        teamTotals.automationSuccessCount += automationSuccessCount;
        teamTotals.journeysEscalations += journeysEscalations;
        teamTotals.safetyViolations += safetyViolations;
        teamTotals.automationConflicts += automationConflicts;
        teamTotals.aiTickets += aiTickets;
        teamTotals.aiResolvedCount += aiResolvedCount;
        teamTotals.aiAssistCount += aiAssistCount;
        teamTotals.aiOpenTickets += aiOpenTickets;
        teamTotals.lowConfidenceAiTickets += lowConfidenceAiTickets;
        teamTotals.callToTicketCount += callToTicketCount;
        teamTotals.firstCallResolutionCount += firstCallResolutionCount;
        teamTotals.demandHours += demandHours;
        teamTotals.afterHoursVolume += afterHoursVolume;
        teamTotals.nearBreachTickets += nearBreachTickets;
        teamTotals.queueOverflowTickets += queueOverflowTickets;
        teamTotals.channelRows.push(row);
      });

      const date = formatDate(dateTs);
      const intentCatalog = getIntentCatalog(team.focus);
      const intentSeed = mulberry32(hashSeed(`${seedBase}:${team.key}:intent:${dayIndex}`));
      let remainingIntentVolume = Math.max(12, teamTotals.ticketsCreated + Math.round(teamTotals.leadsCreated * 0.5));
      intentCatalog.forEach((intent, intentIndex) => {
        const shareBase = 0.12 + ((intentCatalog.length - intentIndex) * 0.02);
        const intentVolume = intentIndex === intentCatalog.length - 1
          ? remainingIntentVolume
          : Math.max(2, Math.round(remainingIntentVolume * shareBase * (0.7 + intentSeed() * 0.4)));
        remainingIntentVolume = Math.max(0, remainingIntentVolume - intentVolume);
        const escalationCount = Math.round(intentVolume * clamp(0.05 + intentSeed() * 0.08, 0.01, 0.34));
        const knowledgeGapCount = Math.round(intentVolume * clamp(0.03 + intentSeed() * 0.05, 0.01, 0.22));
        const unknownIntentCount = Math.round(intentVolume * clamp(0.01 + intentSeed() * 0.03, 0, 0.14));
        const csatResponses = Math.max(1, Math.round(intentVolume * clamp(0.08 + intentSeed() * 0.08, 0.02, 0.24)));
        const csatScore = round(clamp((supportLike ? 4.2 : 4.06) * (0.96 + intentSeed() * 0.08), 3.4, 4.9), 2);
        intentDaily.push({
          date,
          team: team.name,
          intent,
          teamFocus: team.focus,
          intentVolume,
          escalationCount,
          knowledgeGapCount,
          unknownIntentCount,
          csatResponses,
          csatScore,
        });
      });

      const stageWeights = getStageWeights();
      const salesChannels = teamTotals.channelRows.filter(row => row.dealsCreated > 0);
      DEFAULT_STAGES.forEach((stage) => {
        salesChannels.forEach((row) => {
          const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:${stage}:${row.channel}:${dayIndex}`));
          const stageShare = stageWeights[stage];
          const dealCount = Math.round(row.dealsCreated * stageShare * (0.88 + localRand() * 0.2));
          const stageValue = round(row.pipelineValue * stageShare * (0.9 + localRand() * 0.16), 0);
          stageDaily.push({
            date,
            team: team.name,
            stage,
            channel: row.channel,
            dealCount,
            stageValue,
            wonRevenue: stage === 'Won' ? round(row.wonRevenue * (0.9 + localRand() * 0.16), 0) : 0,
          });
        });
      });

      const statusWeights = getStatusWeights(team.focus);
      DEFAULT_STATUSES.forEach((status) => {
        workflowStatusDaily.push({
          date,
          team: team.name,
          status,
          count: Math.max(1, Math.round(Math.max(teamTotals.openTickets, teamTotals.ticketsCreated) * statusWeights[status])),
        });
      });

      DEFAULT_HANDOFF_REASONS.forEach((reason, reasonIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:${reason}:${dayIndex}`));
        handoffReasonDaily.push({
          date,
          team: team.name,
          reason,
          handoffCount: Math.max(0, Math.round(teamTotals.handoffCount * (0.14 + ((DEFAULT_HANDOFF_REASONS.length - reasonIndex) * 0.04)) * (0.8 + localRand() * 0.36))),
        });
      });

      const contactSeed = mulberry32(hashSeed(`${seedBase}:${team.key}:contacts:${dayIndex}`));
      const newContacts = Math.max(1, Math.round(teamTotals.conversations * clamp((salesLike ? 0.58 : 0.34) * (0.92 + contactSeed() * 0.12), 0.1, 0.9)));
      const returningContacts = Math.max(1, teamTotals.conversations - newContacts);
      contactTypeDaily.push(
        { date, team: team.name, contactType: 'New', contactCount: newContacts },
        { date, team: team.name, contactType: 'Returning', contactCount: returningContacts },
      );

      const backlogBuckets = {
        '8+ days': teamTotals.backlogOlderThan7Days,
      };
      const youngerBacklog = Math.max(0, teamTotals.openTickets - teamTotals.backlogOlderThan7Days);
      backlogBuckets['4-7 days'] = Math.round(youngerBacklog * 0.28);
      backlogBuckets['2-3 days'] = Math.round(youngerBacklog * 0.34);
      backlogBuckets['0-1 days'] = Math.max(0, youngerBacklog - backlogBuckets['4-7 days'] - backlogBuckets['2-3 days']);
      DEFAULT_BACKLOG_BANDS.forEach((ageBand) => {
        agingBandDaily.push({
          date,
          team: team.name,
          ageBand,
          ticketCount: Math.max(0, backlogBuckets[ageBand] || 0),
        });
      });

      const workloadAtRisk = Math.max(teamTotals.openTickets, Math.round(teamTotals.ticketsCreated * 0.78));
      const breachedCount = Math.min(teamTotals.slaBreaches, workloadAtRisk);
      const nearBreachCount = Math.min(teamTotals.nearBreachTickets, Math.max(0, workloadAtRisk - breachedCount));
      const riskBuckets = {
        Breached: breachedCount,
        'Near breach': nearBreachCount,
      };
      const unresolvedRisk = Math.max(0, workloadAtRisk - breachedCount - nearBreachCount);
      riskBuckets['At risk'] = Math.round(unresolvedRisk * 0.24);
      riskBuckets['On track'] = Math.max(0, unresolvedRisk - riskBuckets['At risk']);
      DEFAULT_SLA_RISK_BANDS.forEach((riskBand) => {
        slaRiskDaily.push({
          date,
          team: team.name,
          riskBand,
          ticketCount: Math.max(0, riskBuckets[riskBand] || 0),
        });
      });

      let remainingResponses = Math.max(1, teamTotals.surveyResponses);
      let remainingDetractors = Math.max(0, teamTotals.detractorResponses);
      DEFAULT_SATISFACTION_THEMES.forEach((theme, themeIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:${theme}:${dayIndex}`));
        const responseCount = themeIndex === DEFAULT_SATISFACTION_THEMES.length - 1
          ? remainingResponses
          : Math.max(1, Math.round(remainingResponses * (0.16 + ((DEFAULT_SATISFACTION_THEMES.length - themeIndex) * 0.04)) * (0.76 + localRand() * 0.28)));
        remainingResponses = Math.max(0, remainingResponses - responseCount);
        const detractorCount = themeIndex === DEFAULT_SATISFACTION_THEMES.length - 1
          ? remainingDetractors
          : Math.min(responseCount, Math.max(0, Math.round(responseCount * (0.12 + localRand() * 0.16))));
        remainingDetractors = Math.max(0, remainingDetractors - detractorCount);
        satisfactionThemeDaily.push({
          date,
          team: team.name,
          theme,
          responseCount,
          detractorCount,
        });
      });

      let remainingReopens = Math.max(1, teamTotals.reopenedTickets);
      DEFAULT_REOPEN_REASONS.forEach((reason, reasonIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:reopen:${reason}:${dayIndex}`));
        const reopenCount = reasonIndex === DEFAULT_REOPEN_REASONS.length - 1
          ? remainingReopens
          : Math.max(0, Math.round(remainingReopens * (0.18 + ((DEFAULT_REOPEN_REASONS.length - reasonIndex) * 0.03)) * (0.8 + localRand() * 0.24)));
        remainingReopens = Math.max(0, remainingReopens - reopenCount);
        reopenReasonDaily.push({
          date,
          team: team.name,
          reason,
          reopenCount,
        });
      });

      let remainingLeads = Math.max(0, teamTotals.leadsCreated);
      let remainingDealsCreated = Math.max(0, teamTotals.dealsCreated);
      let remainingDealsWon = Math.max(0, teamTotals.dealsWon);
      let remainingPipeline = Math.max(0, teamTotals.pipelineValue);
      DEFAULT_LEAD_SOURCES.forEach((source, sourceIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:source:${source}:${dayIndex}`));
        const leadCount = sourceIndex === DEFAULT_LEAD_SOURCES.length - 1
          ? remainingLeads
          : Math.max(0, Math.round(remainingLeads * (0.16 + ((DEFAULT_LEAD_SOURCES.length - sourceIndex) * 0.04)) * (0.78 + localRand() * 0.28)));
        remainingLeads = Math.max(0, remainingLeads - leadCount);
        const dealsCreated = sourceIndex === DEFAULT_LEAD_SOURCES.length - 1
          ? remainingDealsCreated
          : Math.min(leadCount, Math.max(0, Math.round(remainingDealsCreated * (0.18 + ((DEFAULT_LEAD_SOURCES.length - sourceIndex) * 0.03)) * (0.8 + localRand() * 0.22))));
        remainingDealsCreated = Math.max(0, remainingDealsCreated - dealsCreated);
        const dealsWon = sourceIndex === DEFAULT_LEAD_SOURCES.length - 1
          ? remainingDealsWon
          : Math.min(dealsCreated, Math.max(0, Math.round(remainingDealsWon * (0.18 + ((DEFAULT_LEAD_SOURCES.length - sourceIndex) * 0.03)) * (0.82 + localRand() * 0.2))));
        remainingDealsWon = Math.max(0, remainingDealsWon - dealsWon);
        const pipelineValue = sourceIndex === DEFAULT_LEAD_SOURCES.length - 1
          ? remainingPipeline
          : Math.max(0, Math.round(remainingPipeline * (0.14 + ((DEFAULT_LEAD_SOURCES.length - sourceIndex) * 0.04)) * (0.8 + localRand() * 0.24)));
        remainingPipeline = Math.max(0, remainingPipeline - pipelineValue);
        leadSourceDaily.push({
          date,
          team: team.name,
          source,
          leadCount,
          dealsCreated,
          dealsWon,
          pipelineValue,
        });
      });

      const outcomeBuckets = {
        Missed: teamTotals.missedCalls,
        'Callback requested': teamTotals.callbackRequests,
        'Escalated on call': Math.round(teamTotals.totalCalls * 0.08),
      };
      const residualVoice = Math.max(0, teamTotals.totalCalls - outcomeBuckets.Missed - outcomeBuckets['Callback requested'] - outcomeBuckets['Escalated on call']);
      outcomeBuckets.Voicemail = Math.round(residualVoice * 0.16);
      outcomeBuckets.Connected = Math.max(0, residualVoice - outcomeBuckets.Voicemail);
      DEFAULT_CALL_OUTCOMES.forEach((outcome) => {
        callOutcomeDaily.push({
          date,
          team: team.name,
          outcome,
          outcomeCount: Math.max(0, outcomeBuckets[outcome] || 0),
        });
      });

      const confidenceBuckets = {
        'Very low': Math.round(teamTotals.lowConfidenceAiTickets * 0.38),
        Low: Math.max(0, teamTotals.lowConfidenceAiTickets - Math.round(teamTotals.lowConfidenceAiTickets * 0.38)),
      };
      const higherConfidence = Math.max(0, teamTotals.aiTickets - teamTotals.lowConfidenceAiTickets);
      confidenceBuckets.Medium = Math.round(higherConfidence * 0.44);
      confidenceBuckets.High = Math.max(0, higherConfidence - confidenceBuckets.Medium);
      DEFAULT_AI_CONFIDENCE_BANDS.forEach((confidenceBand) => {
        const bandCount = Math.max(0, confidenceBuckets[confidenceBand] || 0);
        aiConfidenceDaily.push({
          date,
          team: team.name,
          confidenceBand,
          ticketCount: bandCount,
          handoffCount: Math.round(bandCount * (confidenceBand === 'Very low' ? 0.44 : confidenceBand === 'Low' ? 0.24 : confidenceBand === 'Medium' ? 0.12 : 0.05)),
        });
      });

      for (let hour = 0; hour < 24; hour += 1) {
        const profile = hour >= 8 && hour <= 10 ? 1.2
          : hour >= 11 && hour <= 14 ? 1.35
            : hour >= 15 && hour <= 18 ? 1.08
              : hour >= 19 && hour <= 21 ? 0.6
                : 0.18;
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:hour:${hour}:${dayIndex}`));
        hourlyDaily.push({
          date,
          team: team.name,
          hour,
          ticketCount: Math.max(0, Math.round((teamTotals.ticketsCreated / 12) * profile * (0.82 + localRand() * 0.34))),
          callCount: Math.max(0, Math.round((teamTotals.totalCalls / 12) * profile * (0.84 + localRand() * 0.32))),
        });
      }

      if (channels.includes('voice') || teamTotals.totalCalls > 0) {
        DEFAULT_VOICE_LINES.forEach((voiceLine, lineIndex) => {
          const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:${voiceLine}:${dayIndex}`));
          const share = lineIndex === 0 ? 0.48 : lineIndex === 1 ? 0.31 : 0.21;
          voiceChannelDaily.push({
            date,
            team: team.name,
            channel: voiceLine,
            totalCalls: Math.max(0, Math.round(teamTotals.totalCalls * share * (0.88 + localRand() * 0.18))),
            missedCalls: Math.max(0, Math.round(teamTotals.missedCalls * share * (0.84 + localRand() * 0.22))),
            avgWaitMinutes: round((supportLike ? 2.6 : 1.8) * (1 + lineIndex * 0.12) * (0.9 + localRand() * 0.18), 1),
            avgCallDurationMinutes: round((supportLike ? 7.4 : 5.7) * (0.92 + localRand() * 0.14), 1),
            firstCallResolutionCount: Math.max(0, Math.round(teamTotals.firstCallResolutionCount * share * (0.86 + localRand() * 0.18))),
            callToTicketCount: Math.max(0, Math.round(teamTotals.callToTicketCount * share * (0.9 + localRand() * 0.18))),
            abandonmentCount: Math.max(0, Math.round(teamTotals.abandonmentCount * share * (0.88 + localRand() * 0.18))),
            callbackRequests: Math.max(0, Math.round(teamTotals.callbackRequests * share * (0.88 + localRand() * 0.18))),
            ivrQueueMinutes: round((supportLike ? 2.1 : 1.4) * (1 + lineIndex * 0.1) * (0.9 + localRand() * 0.16), 1),
          });
        });

        voiceDirectionDaily.push(
          { date, team: team.name, direction: 'Inbound', callCount: teamTotals.inboundCalls },
          { date, team: team.name, direction: 'Outbound', callCount: teamTotals.outboundCalls },
        );
      }

      agents.forEach((agentName, agentIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:agent:${agentName}:${dayIndex}`));
        const contribution = 0.68 + ((agentIndex + 1) / (agents.length + 3));
        const conversationsHandled = Math.max(1, Math.round((teamTotals.conversations / agents.length) * contribution * (0.78 + localRand() * 0.22)));
        const resolved = Math.max(0, Math.round((teamTotals.ticketsResolved / agents.length) * contribution * (0.8 + localRand() * 0.18)));
        const surveyResponses = Math.max(1, Math.round((teamTotals.surveyResponses / agents.length) * contribution * (0.8 + localRand() * 0.18)));
        agentDaily.push({
          date,
          team: team.name,
          agent: agentName,
          teamFocus: team.focus,
          conversationsHandled,
          ticketsResolved: resolved,
          assignedOpenTickets: Math.max(0, Math.round((teamTotals.assignedTickets / agents.length) * contribution * (0.82 + localRand() * 0.18))),
          firstResponseMinutes: round((supportLike ? 22 : 17) * (0.88 + localRand() * 0.22), 1),
          csatScore: round(clamp((supportLike ? 4.3 : 4.1) * (0.97 + localRand() * 0.06), 3.4, 4.96), 2),
          surveyResponses,
          dealsWon: salesLike ? Math.round((teamTotals.dealsWon / agents.length) * contribution * (0.8 + localRand() * 0.26)) : 0,
          pipelineValue: round((teamTotals.pipelineValue / agents.length) * (0.7 + localRand() * 0.56), 0),
          aiAssistCount: Math.round(conversationsHandled * clamp(0.18 + localRand() * 0.18, 0.06, 0.52)),
        });
      });
    }

    agents.forEach((agentName, agentIndex) => {
      const statusSeed = mulberry32(hashSeed(`${seedBase}:${team.key}:status:${agentName}`));
      const statusRoll = statusSeed();
      const status = statusRoll > 0.78 ? 'Offline' : statusRoll > 0.54 ? 'Away' : statusRoll > 0.26 ? 'Busy' : 'Online';
      agentStatusSnapshot.push({
        team: team.name,
        agent: agentName,
        status,
        queueCount: Math.max(0, Math.round((agentIndex + 1) * statusSeed() * 2)),
      });
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    customer: customerProfile?.company || 'Prototype customer',
    teams,
    channels,
    teamDaily,
    agentDaily,
    intentDaily,
    stageDaily,
    hourlyDaily,
    voiceChannelDaily,
    voiceDirectionDaily,
    workflowStatusDaily,
    handoffReasonDaily,
    contactTypeDaily,
    agingBandDaily,
    slaRiskDaily,
    satisfactionThemeDaily,
    reopenReasonDaily,
    leadSourceDaily,
    callOutcomeDaily,
    aiConfidenceDaily,
    agentStatusSnapshot,
  };
}

function getSemanticSchema(customerProfile = {}, context = {}) {
  const dataset = buildSyntheticDataset(customerProfile, context);
  return {
    entities: [
      { id: 'team_daily', label: 'Team daily performance', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'team_daily') },
      { id: 'agent_daily', label: 'Agent daily performance', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'agent_daily') },
      { id: 'intent_daily', label: 'Intent trend and quality data', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'intent_daily') },
      { id: 'stage_daily', label: 'Sales stage and channel funnel data', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'stage_daily') },
      { id: 'hourly_daily', label: 'Hourly volume patterns', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'hourly_daily') },
      { id: 'voice_channel_daily', label: 'Voice channel performance', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'voice_channel_daily') },
      { id: 'voice_direction_daily', label: 'Inbound vs outbound voice activity', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'voice_direction_daily') },
      { id: 'workflow_status_daily', label: 'Workflow status distribution', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'workflow_status_daily') },
      { id: 'handoff_reason_daily', label: 'Automation handoff reasons', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'handoff_reason_daily') },
      { id: 'contact_type_daily', label: 'New vs returning contacts', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'contact_type_daily') },
      { id: 'aging_band_daily', label: 'Backlog aging buckets', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'aging_band_daily') },
      { id: 'sla_risk_daily', label: 'SLA risk buckets', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'sla_risk_daily') },
      { id: 'satisfaction_theme_daily', label: 'Satisfaction themes and detractors', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'satisfaction_theme_daily') },
      { id: 'reopen_reason_daily', label: 'Reopen reasons', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'reopen_reason_daily') },
      { id: 'lead_source_daily', label: 'Lead source quality and value', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'lead_source_daily') },
      { id: 'call_outcome_daily', label: 'Voice call outcomes', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'call_outcome_daily') },
      { id: 'ai_confidence_daily', label: 'AI confidence mix', metrics: Object.keys(METRIC_DEFINITIONS).filter(key => METRIC_DEFINITIONS[key].entity === 'ai_confidence_daily') },
    ],
    dimensions: ['team', 'channel', 'agent', 'date', 'week', 'month', 'intent', 'stage', 'hour', 'status', 'reason', 'contact_type', 'direction', 'age_band', 'risk_band', 'theme', 'source', 'outcome', 'confidence_band'],
    metrics: Object.entries(METRIC_DEFINITIONS).map(([id, meta]) => ({ id, ...meta })),
    aliases: METRIC_ALIASES,
    availableTeams: dataset.teams.map(team => ({ name: team.name, focus: team.focus })),
    availableChannels: dataset.channels,
    defaultTimeRange: 'last_30_days',
    notes: [
      'Prototype synthetic analytics data with customer overlays.',
      'Covers visible dashboard topics plus nearby supporting data that is not always shown in the dashboard.',
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
