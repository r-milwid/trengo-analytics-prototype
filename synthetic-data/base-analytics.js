const DAY_MS = 24 * 60 * 60 * 1000;
const TOTAL_DAYS = 400;

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
const DEFAULT_GEOGRAPHIES = [
  { region: 'Benelux', country: 'Netherlands', city: 'Amsterdam', language: 'nl-NL', businessUnit: 'Customer Operations' },
  { region: 'DACH', country: 'Germany', city: 'Berlin', language: 'de-DE', businessUnit: 'Revenue Operations' },
  { region: 'UK & Ireland', country: 'United Kingdom', city: 'London', language: 'en-GB', businessUnit: 'Strategic Accounts' },
];
const DEFAULT_ACCOUNT_SEGMENTS = [
  { accountSegment: 'SMB', accountTier: 'Growth', plan: 'Scale', lifecycleStage: 'Active', cohort: '2025-Q1' },
  { accountSegment: 'Mid-market', accountTier: 'Enterprise', plan: 'Enterprise', lifecycleStage: 'Expansion', cohort: '2024-Q3' },
  { accountSegment: 'Strategic', accountTier: 'Strategic', plan: 'Enterprise Plus', lifecycleStage: 'Renewal', cohort: '2023-Q4' },
];
const DEFAULT_QUEUE_DEFINITIONS = [
  { queue: 'General support', priority: 'Standard', slaPolicy: 'P3 4h / 24h' },
  { queue: 'Priority support', priority: 'High', slaPolicy: 'P2 1h / 8h' },
  { queue: 'Urgent cases', priority: 'Urgent', slaPolicy: 'P1 15m / 4h' },
];
const DEFAULT_PRODUCT_AREAS = [
  { productLine: 'Core platform', featureArea: 'Inbox & routing', issueType: 'Routing configuration' },
  { productLine: 'Core platform', featureArea: 'Automation', issueType: 'Journey failure' },
  { productLine: 'Voice', featureArea: 'Queues & callbacks', issueType: 'Missed call handling' },
  { productLine: 'Analytics', featureArea: 'Dashboarding', issueType: 'Reporting question' },
];
const DEFAULT_CAMPAIGNS = [
  { campaign: 'Website conversion', source: 'Website' },
  { campaign: 'Partner expansion', source: 'Partner' },
  { campaign: 'Referral program', source: 'Referral' },
  { campaign: 'Outbound sequence', source: 'Outbound' },
];
const DEFAULT_KNOWLEDGE_ARTICLES = [
  { article: 'Reset account access', articleCategory: 'Access' },
  { article: 'Configure routing rules', articleCategory: 'Administration' },
  { article: 'Handle billing exceptions', articleCategory: 'Billing' },
  { article: 'Callback and queue setup', articleCategory: 'Voice' },
];
const DEFAULT_AI_MODELS = [
  { aiModel: 'triage-gpt-5-mini', promptVersion: 'triage-v4', guardrailType: 'Policy' },
  { aiModel: 'assist-gpt-5-mini', promptVersion: 'assist-v3', guardrailType: 'Compliance' },
  { aiModel: 'routing-gpt-5-mini', promptVersion: 'routing-v2', guardrailType: 'Escalation' },
];
const DEFAULT_AUTOMATION_JOURNEYS = [
  { journey: 'Welcome flow', journeyVersion: 'v3.1', triggerType: 'New conversation', exitReason: 'Resolved automatically' },
  { journey: 'Priority handoff', journeyVersion: 'v2.4', triggerType: 'Priority detected', exitReason: 'Handed to team' },
  { journey: 'Callback recovery', journeyVersion: 'v1.9', triggerType: 'Missed call', exitReason: 'Callback booked' },
];
const DEFAULT_DEAL_ATTRIBUTES = [
  { dealOwner: 'Alex Rivera', currency: 'EUR', closeReason: 'Budget approved', competitor: 'Zendesk' },
  { dealOwner: 'Mila Santos', currency: 'EUR', closeReason: 'Multi-team fit', competitor: 'Intercom' },
  { dealOwner: 'Noah Muller', currency: 'GBP', closeReason: 'Pilot converted', competitor: 'Freshdesk' },
  { dealOwner: 'Sofia Ivanova', currency: 'USD', closeReason: 'Lost to incumbent', competitor: 'Salesforce' },
];
const DEFAULT_CALL_ATTRIBUTES = [
  { voiceLine: 'Support line', connectionResult: 'Connected', recordingFlag: 'Recorded' },
  { voiceLine: 'Priority line', connectionResult: 'Transferred', recordingFlag: 'Recorded' },
  { voiceLine: 'Callback queue', connectionResult: 'Voicemail', recordingFlag: 'Not recorded' },
  { voiceLine: 'Support line', connectionResult: 'Dropped', recordingFlag: 'Not recorded' },
];
const DEFAULT_SURVEY_DETAILS = [
  { surveyTemplate: 'Post-resolution CSAT', surveyQuestion: 'How satisfied were you with this interaction?', deliveryChannel: 'Email', respondentType: 'Customer', sentimentLabel: 'Positive' },
  { surveyTemplate: 'Post-resolution CSAT', surveyQuestion: 'Was your issue resolved quickly enough?', deliveryChannel: 'WhatsApp', respondentType: 'Customer', sentimentLabel: 'Neutral' },
  { surveyTemplate: 'Voice follow-up', surveyQuestion: 'How would you rate the call experience?', deliveryChannel: 'SMS', respondentType: 'Caller', sentimentLabel: 'Negative' },
  { surveyTemplate: 'Sales follow-up', surveyQuestion: 'How clear was the demo or proposal?', deliveryChannel: 'Email', respondentType: 'Lead', sentimentLabel: 'Positive' },
];
const DEFAULT_WORKFORCE_PLANS = [
  { schedule: 'Weekday core coverage', shift: 'Morning' },
  { schedule: 'Weekday core coverage', shift: 'Afternoon' },
  { schedule: 'Extended support', shift: 'Evening' },
  { schedule: 'Weekend coverage', shift: 'Weekend' },
];

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
  lost_deals: { entity: 'deal_attribute_daily', label: 'Lost deals', kind: 'count', aggregate: 'sum', sourceKey: 'lostDeals', preferredChart: 'bar' },
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
  won_revenue: { entity: 'team_daily', label: 'Won revenue', kind: 'currency', aggregate: 'sum', sourceKey: 'wonRevenue' },
  renewal_risk_accounts: { entity: 'account_daily', label: 'Renewal risk accounts', kind: 'count', aggregate: 'sum', sourceKey: 'renewalRiskAccounts', preferredChart: 'bar' },
  churn_risk_revenue: { entity: 'account_daily', label: 'Churn risk revenue', kind: 'currency', aggregate: 'sum', sourceKey: 'churnRiskRevenue', preferredChart: 'bar' },
  expansion_pipeline_value: { entity: 'account_daily', label: 'Expansion pipeline', kind: 'currency', aggregate: 'sum', sourceKey: 'expansionPipelineValue', preferredChart: 'bar' },
  article_views: { entity: 'knowledge_article_daily', label: 'Article views', kind: 'count', aggregate: 'sum', sourceKey: 'articleViews', preferredChart: 'bar' },
  ai_article_citations: { entity: 'knowledge_article_daily', label: 'AI article citations', kind: 'count', aggregate: 'sum', sourceKey: 'aiCitations', preferredChart: 'bar' },
  article_fallback_tickets: { entity: 'knowledge_article_daily', label: 'Fallback tickets', kind: 'count', aggregate: 'sum', sourceKey: 'fallbackTickets', preferredChart: 'bar' },
  journey_runs: { entity: 'journey_daily', label: 'Journey runs', kind: 'count', aggregate: 'sum', sourceKey: 'automationRuns', preferredChart: 'bar' },
  journey_completion_minutes: { entity: 'journey_daily', label: 'Journey completion time', kind: 'duration_minutes', aggregate: 'weighted_average', sourceKey: 'avgCompletionMinutes', weightKey: 'automationRuns' },
  transfer_count: { entity: 'call_quality_daily', label: 'Transfer count', kind: 'count', aggregate: 'sum', sourceKey: 'transferCount', preferredChart: 'bar' },
  recorded_calls: { entity: 'call_quality_daily', label: 'Recorded calls', kind: 'count', aggregate: 'sum', sourceKey: 'recordedCalls', preferredChart: 'bar' },
  hold_minutes: { entity: 'call_quality_daily', label: 'Hold time', kind: 'duration_minutes', aggregate: 'sum', sourceKey: 'holdMinutes', preferredChart: 'bar' },
  avg_hold_minutes: { entity: 'call_quality_daily', label: 'Average hold time', kind: 'duration_minutes', aggregate: 'weighted_average', sourceKey: 'avgHoldMinutes', weightKey: 'totalCalls', preferredChart: 'bar' },
  surveys_sent: { entity: 'survey_detail_daily', label: 'Surveys sent', kind: 'count', aggregate: 'sum', sourceKey: 'surveysSent', preferredChart: 'bar' },
  planned_capacity_hours: { entity: 'workforce_daily', label: 'Planned capacity hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'plannedCapacityHours', preferredChart: 'bar' },
  scheduled_hours: { entity: 'workforce_daily', label: 'Scheduled hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'scheduledHours', preferredChart: 'bar' },
  overtime_hours: { entity: 'workforce_daily', label: 'Overtime hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'overtimeHours', preferredChart: 'bar' },
  online_hours: { entity: 'agent_presence_daily', label: 'Online hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'onlineHours', preferredChart: 'bar' },
  busy_hours: { entity: 'agent_presence_daily', label: 'Busy hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'busyHours', preferredChart: 'bar' },
  away_hours: { entity: 'agent_presence_daily', label: 'Away hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'awayHours', preferredChart: 'bar' },
  offline_hours: { entity: 'agent_presence_daily', label: 'Offline hours', kind: 'duration_hours', aggregate: 'sum', sourceKey: 'offlineHours', preferredChart: 'bar' },
  occupancy_rate: { entity: 'agent_presence_daily', label: 'Occupancy rate', kind: 'rate', aggregate: 'ratio', numeratorKey: 'busyHours', denominatorKey: 'onlineHours', preferredChart: 'bar' },
};

const METRIC_ALIASES = {
  conversations: 'conversations',
  volume: 'conversations',
  'contact volume': 'conversations',
  'new leads': 'leads_created',
  leads: 'leads_created',
  'tickets created': 'tickets_created',
  'created tickets': 'tickets_created',
  'ticket volume': 'tickets_created',
  'ticket trend': 'tickets_created',
  'tickets per day': 'tickets_created',
  'average tickets per day': 'tickets_created',
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
  revenue: 'won_revenue',
  'won revenue': 'won_revenue',
  'closed won revenue': 'won_revenue',
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
  'lost deals': 'lost_deals',
  'deals lost': 'lost_deals',
  'lost opportunities': 'lost_deals',
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
  'renewal risk': 'renewal_risk_accounts',
  'renewal risk accounts': 'renewal_risk_accounts',
  'churn risk revenue': 'churn_risk_revenue',
  'expansion pipeline': 'expansion_pipeline_value',
  'article views': 'article_views',
  'knowledge article views': 'article_views',
  'kb article views': 'article_views',
  'ai article citations': 'ai_article_citations',
  'article citations': 'ai_article_citations',
  'fallback tickets': 'article_fallback_tickets',
  'journey runs': 'journey_runs',
  'automation runs': 'journey_runs',
  'journey completion time': 'journey_completion_minutes',
  'journey completion': 'journey_completion_minutes',
  'surveys sent': 'surveys_sent',
  'transfer count': 'transfer_count',
  transfers: 'transfer_count',
  'recorded calls': 'recorded_calls',
  recordings: 'recorded_calls',
  'hold time': 'hold_minutes',
  'total hold time': 'hold_minutes',
  'average hold time': 'avg_hold_minutes',
  'planned capacity': 'planned_capacity_hours',
  'planned capacity hours': 'planned_capacity_hours',
  'scheduled hours': 'scheduled_hours',
  overtime: 'overtime_hours',
  'overtime hours': 'overtime_hours',
  'online hours': 'online_hours',
  'busy hours': 'busy_hours',
  'away hours': 'away_hours',
  'offline hours': 'offline_hours',
  occupancy: 'occupancy_rate',
  'occupancy rate': 'occupancy_rate',
  'agent availability': 'online_hours',
  'agent online status': 'online_hours',
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

function normalizeLabel(value, fallback = 'Unknown') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function getCustomerModelArray(customerProfile, key, fallback = []) {
  const values = customerProfile?.analyticsDataModel?.[key];
  return Array.isArray(values) && values.length ? values : fallback;
}

function buildShareVector(definitions = [], seedKey = 'default') {
  if (!definitions.length) return [];
  const raw = definitions.map((definition, index) => {
    const rand = mulberry32(hashSeed(`${seedKey}:${index}`));
    const configuredWeight = Number(definition?.weight || definition?.shareWeight || 0);
    const baseWeight = configuredWeight > 0 ? configuredWeight : (definitions.length - index);
    return Math.max(0.12, baseWeight * (0.82 + rand() * 0.34));
  });
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  return raw.map(value => value / total);
}

function buildGeographies(customerProfile) {
  return getCustomerModelArray(customerProfile, 'geographies', DEFAULT_GEOGRAPHIES).map((geo) => ({
    region: normalizeLabel(geo.region),
    country: normalizeLabel(geo.country),
    city: normalizeLabel(geo.city),
    language: normalizeLabel(geo.language, 'en-US'),
    businessUnit: normalizeLabel(geo.businessUnit, 'Operations'),
    weight: Number(geo.weight || geo.shareWeight || 0) || undefined,
  }));
}

function buildAccountSegments(customerProfile) {
  return getCustomerModelArray(customerProfile, 'accountSegments', DEFAULT_ACCOUNT_SEGMENTS).map((segment) => ({
    accountSegment: normalizeLabel(segment.accountSegment),
    accountTier: normalizeLabel(segment.accountTier, 'Standard'),
    plan: normalizeLabel(segment.plan, customerProfile?.plan || 'Scale'),
    lifecycleStage: normalizeLabel(segment.lifecycleStage, 'Active'),
    cohort: normalizeLabel(segment.cohort, '2025-Q1'),
    weight: Number(segment.weight || segment.shareWeight || 0) || undefined,
  }));
}

function buildQueueDefinitions(customerProfile) {
  return getCustomerModelArray(customerProfile, 'queues', DEFAULT_QUEUE_DEFINITIONS).map((queue) => ({
    queue: normalizeLabel(queue.queue),
    priority: normalizeLabel(queue.priority, 'Standard'),
    slaPolicy: normalizeLabel(queue.slaPolicy, 'P3 4h / 24h'),
    weight: Number(queue.weight || queue.shareWeight || 0) || undefined,
  }));
}

function buildProductAreas(customerProfile) {
  return getCustomerModelArray(customerProfile, 'productAreas', DEFAULT_PRODUCT_AREAS).map((area) => ({
    productLine: normalizeLabel(area.productLine),
    featureArea: normalizeLabel(area.featureArea),
    issueType: normalizeLabel(area.issueType),
    weight: Number(area.weight || area.shareWeight || 0) || undefined,
  }));
}

function buildCampaignDefinitions(customerProfile) {
  return getCustomerModelArray(customerProfile, 'campaigns', DEFAULT_CAMPAIGNS).map((campaign) => ({
    campaign: normalizeLabel(campaign.campaign),
    source: normalizeLabel(campaign.source, 'Website'),
    weight: Number(campaign.weight || campaign.shareWeight || 0) || undefined,
  }));
}

function buildKnowledgeArticles(customerProfile) {
  return getCustomerModelArray(customerProfile, 'knowledgeArticles', DEFAULT_KNOWLEDGE_ARTICLES).map((article) => ({
    article: normalizeLabel(article.article),
    articleCategory: normalizeLabel(article.articleCategory, 'General'),
    weight: Number(article.weight || article.shareWeight || 0) || undefined,
  }));
}

function buildAiModels(customerProfile) {
  return getCustomerModelArray(customerProfile, 'aiModels', DEFAULT_AI_MODELS).map((model) => ({
    aiModel: normalizeLabel(model.aiModel),
    promptVersion: normalizeLabel(model.promptVersion, 'default-v1'),
    guardrailType: normalizeLabel(model.guardrailType, 'Policy'),
    weight: Number(model.weight || model.shareWeight || 0) || undefined,
  }));
}

function buildAutomationJourneys(customerProfile) {
  return getCustomerModelArray(customerProfile, 'automationJourneys', DEFAULT_AUTOMATION_JOURNEYS).map((journey) => ({
    journey: normalizeLabel(journey.journey),
    journeyVersion: normalizeLabel(journey.journeyVersion, 'v1.0'),
    triggerType: normalizeLabel(journey.triggerType, 'Conversation started'),
    exitReason: normalizeLabel(journey.exitReason, 'Resolved automatically'),
    weight: Number(journey.weight || journey.shareWeight || 0) || undefined,
  }));
}

function buildVoiceLines(customerProfile) {
  return getCustomerModelArray(customerProfile, 'voiceLines', DEFAULT_VOICE_LINES).map(line => normalizeLabel(line));
}

function buildDealAttributes(customerProfile) {
  return getCustomerModelArray(customerProfile, 'dealAttributes', DEFAULT_DEAL_ATTRIBUTES).map((attribute) => ({
    dealOwner: normalizeLabel(attribute.dealOwner, 'Unassigned'),
    currency: normalizeLabel(attribute.currency, 'EUR'),
    closeReason: normalizeLabel(attribute.closeReason, 'General fit'),
    competitor: normalizeLabel(attribute.competitor, 'No competitor'),
    weight: Number(attribute.weight || attribute.shareWeight || 0) || undefined,
  }));
}

function buildCallAttributes(customerProfile, voiceLines = []) {
  const configured = getCustomerModelArray(customerProfile, 'callAttributes', []);
  const fallback = configured.length
    ? configured
    : voiceLines.length
      ? [
          { voiceLine: voiceLines[0] || DEFAULT_VOICE_LINES[0], connectionResult: 'Connected', recordingFlag: 'Recorded', weight: 4 },
          { voiceLine: voiceLines[1] || voiceLines[0] || DEFAULT_VOICE_LINES[1], connectionResult: 'Transferred', recordingFlag: 'Recorded', weight: 3 },
          { voiceLine: voiceLines[2] || voiceLines[0] || DEFAULT_VOICE_LINES[2], connectionResult: 'Voicemail', recordingFlag: 'Not recorded', weight: 2 },
          { voiceLine: voiceLines[0] || DEFAULT_VOICE_LINES[0], connectionResult: 'Dropped', recordingFlag: 'Not recorded', weight: 1 },
        ]
      : DEFAULT_CALL_ATTRIBUTES;
  return (configured.length ? configured : fallback).map((attribute) => ({
    voiceLine: normalizeLabel(attribute.voiceLine, voiceLines[0] || DEFAULT_VOICE_LINES[0]),
    connectionResult: normalizeLabel(attribute.connectionResult, 'Connected'),
    recordingFlag: normalizeLabel(attribute.recordingFlag, 'Recorded'),
    weight: Number(attribute.weight || attribute.shareWeight || 0) || undefined,
  }));
}

function buildSurveyDetails(customerProfile) {
  return getCustomerModelArray(customerProfile, 'surveyDetails', DEFAULT_SURVEY_DETAILS).map((detail) => ({
    surveyTemplate: normalizeLabel(detail.surveyTemplate, 'Post-resolution CSAT'),
    surveyQuestion: normalizeLabel(detail.surveyQuestion, 'How satisfied were you?'),
    deliveryChannel: normalizeLabel(detail.deliveryChannel, 'Email'),
    respondentType: normalizeLabel(detail.respondentType, 'Customer'),
    sentimentLabel: normalizeLabel(detail.sentimentLabel, 'Neutral'),
    weight: Number(detail.weight || detail.shareWeight || 0) || undefined,
  }));
}

function buildWorkforcePlans(customerProfile) {
  return getCustomerModelArray(customerProfile, 'workforcePlans', DEFAULT_WORKFORCE_PLANS).map((plan) => ({
    schedule: normalizeLabel(plan.schedule, 'Weekday core coverage'),
    shift: normalizeLabel(plan.shift, 'Morning'),
    weight: Number(plan.weight || plan.shareWeight || 0) || undefined,
  }));
}

function getIntentVersion(customerProfile, focus) {
  const versions = customerProfile?.analyticsDataModel?.intentVersions || {};
  const focusKey = focus === 'sales' ? 'sales' : 'support';
  return normalizeLabel(versions[focusKey] || versions.default, '2026.1');
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

function getIntentCatalog(focus, customerProfile = {}) {
  const configuredSupport = getCustomerModelArray(customerProfile, 'supportIntents', DEFAULT_SUPPORT_INTENTS).map(intent => normalizeLabel(intent));
  const configuredSales = getCustomerModelArray(customerProfile, 'salesIntents', DEFAULT_SALES_INTENTS).map(intent => normalizeLabel(intent));
  if (focus === 'support') return configuredSupport;
  if (focus === 'sales') return configuredSales;
  return [...configuredSupport.slice(0, 4), ...configuredSales.slice(0, 3)];
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
  const geographies = buildGeographies(customerProfile);
  const accountSegments = buildAccountSegments(customerProfile);
  const queueDefinitions = buildQueueDefinitions(customerProfile);
  const productAreas = buildProductAreas(customerProfile);
  const campaigns = buildCampaignDefinitions(customerProfile);
  const knowledgeArticles = buildKnowledgeArticles(customerProfile);
  const aiModels = buildAiModels(customerProfile);
  const automationJourneys = buildAutomationJourneys(customerProfile);
  const voiceLines = buildVoiceLines(customerProfile);
  const dealAttributes = buildDealAttributes(customerProfile);
  const callAttributes = buildCallAttributes(customerProfile, voiceLines);
  const surveyDetails = buildSurveyDetails(customerProfile);
  const workforcePlans = buildWorkforcePlans(customerProfile);
  const overlay = getOverlayFactors(customerProfile);
  const seedBase = hashSeed(`${customerProfile?.id || customerProfile?.company || 'prototype'}:${context.role || 'admin'}`);
  const datasetEndUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const startDateUtc = datasetEndUtc - ((TOTAL_DAYS - 1) * DAY_MS);

  const teamDaily = [];
  const agentDaily = [];
  const regionDaily = [];
  const accountDaily = [];
  const queueDaily = [];
  const productDaily = [];
  const campaignDaily = [];
  const knowledgeArticleDaily = [];
  const aiModelDaily = [];
  const journeyDaily = [];
  const dealAttributeDaily = [];
  const callQualityDaily = [];
  const surveyDetailDaily = [];
  const workforceDaily = [];
  const agentPresenceDaily = [];
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
      const dateTs = startDateUtc + (dayIndex * DAY_MS);
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
      const intentCatalog = getIntentCatalog(team.focus, customerProfile);
      const intentVersion = getIntentVersion(customerProfile, team.focus);
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
          intentVersion,
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
      let remainingWonRevenue = Math.max(0, teamTotals.wonRevenue);
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
        const wonRevenue = sourceIndex === DEFAULT_LEAD_SOURCES.length - 1
          ? remainingWonRevenue
          : Math.max(0, Math.round(remainingWonRevenue * (0.14 + ((DEFAULT_LEAD_SOURCES.length - sourceIndex) * 0.04)) * (0.8 + localRand() * 0.24)));
        remainingWonRevenue = Math.max(0, remainingWonRevenue - wonRevenue);
        leadSourceDaily.push({
          date,
          team: team.name,
          source,
          leadCount,
          dealsCreated,
          dealsWon,
          pipelineValue,
          wonRevenue,
        });
      });

      const geoShares = buildShareVector(geographies, `${seedBase}:${team.key}:geo:${dayIndex}`);
      geographies.forEach((geo, geoIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:geo:${geo.region}:${dayIndex}`));
        const share = geoShares[geoIndex] || 0;
        const surveyResponses = Math.max(1, Math.round(teamTotals.surveyResponses * share * (0.84 + localRand() * 0.22)));
        regionDaily.push({
          date,
          team: team.name,
          region: geo.region,
          country: geo.country,
          city: geo.city,
          language: geo.language,
          businessUnit: geo.businessUnit,
          conversations: Math.max(0, Math.round(teamTotals.conversations * share * (0.9 + localRand() * 0.16))),
          ticketsCreated: Math.max(0, Math.round(teamTotals.ticketsCreated * share * (0.88 + localRand() * 0.18))),
          ticketsResolved: Math.max(0, Math.round(teamTotals.ticketsResolved * share * (0.88 + localRand() * 0.18))),
          openTickets: Math.max(0, Math.round(teamTotals.openTickets * share * (0.9 + localRand() * 0.18))),
          dealsCreated: Math.max(0, Math.round(teamTotals.dealsCreated * share * (0.86 + localRand() * 0.22))),
          dealsWon: Math.max(0, Math.round(teamTotals.dealsWon * share * (0.86 + localRand() * 0.22))),
          totalCalls: Math.max(0, Math.round(teamTotals.totalCalls * share * (0.88 + localRand() * 0.18))),
          pipelineValue: Math.max(0, Math.round(teamTotals.pipelineValue * share * (0.86 + localRand() * 0.22))),
          wonRevenue: Math.max(0, Math.round(teamTotals.wonRevenue * share * (0.86 + localRand() * 0.22))),
          aiTickets: Math.max(0, Math.round(teamTotals.aiTickets * share * (0.88 + localRand() * 0.18))),
          aiResolvedCount: Math.max(0, Math.round(teamTotals.aiResolvedCount * share * (0.88 + localRand() * 0.18))),
          handoffCount: Math.max(0, Math.round(teamTotals.handoffCount * share * (0.88 + localRand() * 0.18))),
          afterHoursVolume: Math.max(0, Math.round(teamTotals.afterHoursVolume * share * (0.88 + localRand() * 0.2))),
          surveyResponses,
          csatScore: round(clamp((supportLike ? 4.24 : 4.08) * (0.96 + localRand() * 0.08), 3.4, 4.95), 2),
        });
      });

      const accountShares = buildShareVector(accountSegments, `${seedBase}:${team.key}:accounts:${dayIndex}`);
      accountSegments.forEach((segment, segmentIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:segment:${segment.accountSegment}:${dayIndex}`));
        const share = accountShares[segmentIndex] || 0;
        const surveyResponses = Math.max(1, Math.round(teamTotals.surveyResponses * share * (0.84 + localRand() * 0.22)));
        const renewalRiskAccounts = Math.max(
          0,
          Math.round((0.8 + localRand() * 2.4) * (segment.lifecycleStage.toLowerCase().includes('renew') ? 1.8 : segment.lifecycleStage.toLowerCase().includes('at risk') ? 2.2 : 1))
        );
        accountDaily.push({
          date,
          team: team.name,
          accountSegment: segment.accountSegment,
          accountTier: segment.accountTier,
          plan: segment.plan,
          lifecycleStage: segment.lifecycleStage,
          cohort: segment.cohort,
          conversations: Math.max(0, Math.round(teamTotals.conversations * share * (0.88 + localRand() * 0.18))),
          ticketsCreated: Math.max(0, Math.round(teamTotals.ticketsCreated * share * (0.88 + localRand() * 0.18))),
          ticketsResolved: Math.max(0, Math.round(teamTotals.ticketsResolved * share * (0.88 + localRand() * 0.18))),
          openTickets: Math.max(0, Math.round(teamTotals.openTickets * share * (0.9 + localRand() * 0.18))),
          dealsCreated: Math.max(0, Math.round(teamTotals.dealsCreated * share * (0.86 + localRand() * 0.24))),
          dealsWon: Math.max(0, Math.round(teamTotals.dealsWon * share * (0.86 + localRand() * 0.22))),
          pipelineValue: Math.max(0, Math.round(teamTotals.pipelineValue * share * (0.86 + localRand() * 0.24))),
          wonRevenue: Math.max(0, Math.round(teamTotals.wonRevenue * share * (0.86 + localRand() * 0.24))),
          aiTickets: Math.max(0, Math.round(teamTotals.aiTickets * share * (0.88 + localRand() * 0.18))),
          aiResolvedCount: Math.max(0, Math.round(teamTotals.aiResolvedCount * share * (0.88 + localRand() * 0.18))),
          handoffCount: Math.max(0, Math.round(teamTotals.handoffCount * share * (0.88 + localRand() * 0.18))),
          expansionPipelineValue: Math.max(0, Math.round(teamTotals.pipelineValue * share * clamp(0.24 + localRand() * 0.18, 0.08, 0.68))),
          churnRiskRevenue: Math.max(0, Math.round(teamTotals.wonRevenue * share * clamp(0.08 + localRand() * 0.12, 0.02, 0.42))),
          renewalRiskAccounts,
          surveyResponses,
          csatScore: round(clamp((supportLike ? 4.18 : 4.02) * (0.96 + localRand() * 0.08), 3.32, 4.92), 2),
        });
      });

      const queueShares = buildShareVector(queueDefinitions, `${seedBase}:${team.key}:queue:${dayIndex}`);
      queueDefinitions.forEach((queueDef, queueIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:queue:${queueDef.queue}:${dayIndex}`));
        const share = queueShares[queueIndex] || 0;
        queueDaily.push({
          date,
          team: team.name,
          queue: queueDef.queue,
          priority: queueDef.priority,
          slaPolicy: queueDef.slaPolicy,
          ticketsCreated: Math.max(0, Math.round(teamTotals.ticketsCreated * share * (0.9 + localRand() * 0.18))),
          openTickets: Math.max(0, Math.round(teamTotals.openTickets * share * (0.92 + localRand() * 0.18))),
          assignedTickets: Math.max(0, Math.round(teamTotals.assignedTickets * share * (0.9 + localRand() * 0.18))),
          nearBreachTickets: Math.max(0, Math.round(teamTotals.nearBreachTickets * share * (0.94 + localRand() * 0.18))),
          slaBreaches: Math.max(0, Math.round(teamTotals.slaBreaches * share * (0.94 + localRand() * 0.18))),
          firstResponseMinutes: round((supportLike ? 20 : 16) * (queueDef.priority === 'Urgent' ? 0.54 : queueDef.priority === 'High' ? 0.72 : 1.08) * (0.9 + localRand() * 0.16), 1),
          avgWaitMinutes: round((supportLike ? 2.5 : 1.7) * (queueDef.priority === 'Urgent' ? 0.62 : queueDef.priority === 'High' ? 0.84 : 1.12) * (0.9 + localRand() * 0.16), 1),
          queueOverflowTickets: Math.max(0, Math.round(teamTotals.queueOverflowTickets * share * (0.92 + localRand() * 0.18))),
          capacityHours: round(teamTotals.capacityHours * share * (0.9 + localRand() * 0.12), 1),
          demandHours: round(teamTotals.demandHours * share * (0.92 + localRand() * 0.14), 1),
        });
      });

      const productShares = buildShareVector(productAreas, `${seedBase}:${team.key}:product:${dayIndex}`);
      productAreas.forEach((area, areaIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:product:${area.featureArea}:${dayIndex}`));
        const share = productShares[areaIndex] || 0;
        const surveyResponses = Math.max(1, Math.round(teamTotals.surveyResponses * share * (0.84 + localRand() * 0.22)));
        productDaily.push({
          date,
          team: team.name,
          productLine: area.productLine,
          featureArea: area.featureArea,
          issueType: area.issueType,
          ticketsCreated: Math.max(0, Math.round(teamTotals.ticketsCreated * share * (0.9 + localRand() * 0.18))),
          ticketsResolved: Math.max(0, Math.round(teamTotals.ticketsResolved * share * (0.9 + localRand() * 0.18))),
          reopenedTickets: Math.max(0, Math.round(teamTotals.reopenedTickets * share * (0.92 + localRand() * 0.18))),
          knowledgeGapCount: Math.max(0, Math.round(teamTotals.knowledgeGapCount * share * (0.94 + localRand() * 0.18))),
          dealsCreated: Math.max(0, Math.round(teamTotals.dealsCreated * share * clamp(0.12 + localRand() * 0.12, 0.02, 0.34))),
          surveyResponses,
          csatScore: round(clamp((supportLike ? 4.16 : 4.04) * (0.96 + localRand() * 0.08), 3.28, 4.9), 2),
        });
      });

      const campaignShares = buildShareVector(campaigns, `${seedBase}:${team.key}:campaign:${dayIndex}`);
      campaigns.forEach((campaign, campaignIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:campaign:${campaign.campaign}:${dayIndex}`));
        const share = campaignShares[campaignIndex] || 0;
        campaignDaily.push({
          date,
          team: team.name,
          campaign: campaign.campaign,
          source: campaign.source,
          conversations: Math.max(0, Math.round(teamTotals.conversations * share * (0.88 + localRand() * 0.18))),
          leadsCreated: Math.max(0, Math.round(teamTotals.leadsCreated * share * (0.9 + localRand() * 0.18))),
          dealsCreated: Math.max(0, Math.round(teamTotals.dealsCreated * share * (0.88 + localRand() * 0.2))),
          dealsWon: Math.max(0, Math.round(teamTotals.dealsWon * share * (0.88 + localRand() * 0.2))),
          pipelineValue: Math.max(0, Math.round(teamTotals.pipelineValue * share * (0.88 + localRand() * 0.2))),
          wonRevenue: Math.max(0, Math.round(teamTotals.wonRevenue * share * (0.88 + localRand() * 0.2))),
        });
      });

      const articleShares = buildShareVector(knowledgeArticles, `${seedBase}:${team.key}:article:${dayIndex}`);
      knowledgeArticles.forEach((article, articleIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:article:${article.article}:${dayIndex}`));
        const share = articleShares[articleIndex] || 0;
        knowledgeArticleDaily.push({
          date,
          team: team.name,
          article: article.article,
          articleCategory: article.articleCategory,
          articleViews: Math.max(1, Math.round(teamTotals.conversations * share * (0.28 + localRand() * 0.18))),
          aiCitations: Math.max(0, Math.round(teamTotals.aiTickets * share * (0.18 + localRand() * 0.16))),
          fallbackTickets: Math.max(0, Math.round(teamTotals.knowledgeGapCount * share * (0.86 + localRand() * 0.22))),
          knowledgeGapCount: Math.max(0, Math.round(teamTotals.knowledgeGapCount * share * (0.92 + localRand() * 0.16))),
          ticketsResolved: Math.max(0, Math.round(teamTotals.ticketsResolved * share * (0.18 + localRand() * 0.12))),
        });
      });

      const modelShares = buildShareVector(aiModels, `${seedBase}:${team.key}:model:${dayIndex}`);
      aiModels.forEach((model, modelIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:model:${model.aiModel}:${dayIndex}`));
        const share = modelShares[modelIndex] || 0;
        aiModelDaily.push({
          date,
          team: team.name,
          aiModel: model.aiModel,
          promptVersion: model.promptVersion,
          guardrailType: model.guardrailType,
          aiTickets: Math.max(0, Math.round(teamTotals.aiTickets * share * (0.92 + localRand() * 0.18))),
          aiResolvedCount: Math.max(0, Math.round(teamTotals.aiResolvedCount * share * (0.9 + localRand() * 0.18))),
          handoffCount: Math.max(0, Math.round(teamTotals.handoffCount * share * (0.92 + localRand() * 0.18))),
          safetyViolations: Math.max(0, Math.round(teamTotals.safetyViolations * share * (0.94 + localRand() * 0.22))),
          lowConfidenceAiTickets: Math.max(0, Math.round(teamTotals.lowConfidenceAiTickets * share * (0.92 + localRand() * 0.18))),
          automationConflicts: Math.max(0, Math.round(teamTotals.automationConflicts * share * (0.9 + localRand() * 0.2))),
        });
      });

      const journeyShares = buildShareVector(automationJourneys, `${seedBase}:${team.key}:journey:${dayIndex}`);
      automationJourneys.forEach((journey, journeyIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:journey:${journey.journey}:${dayIndex}`));
        const share = journeyShares[journeyIndex] || 0;
        journeyDaily.push({
          date,
          team: team.name,
          journey: journey.journey,
          journeyVersion: journey.journeyVersion,
          triggerType: journey.triggerType,
          exitReason: journey.exitReason,
          automationRuns: Math.max(0, Math.round(teamTotals.automationRuns * share * (0.92 + localRand() * 0.18))),
          automationSuccessCount: Math.max(0, Math.round(teamTotals.automationSuccessCount * share * (0.92 + localRand() * 0.18))),
          journeysEscalations: Math.max(0, Math.round(teamTotals.journeysEscalations * share * (0.94 + localRand() * 0.18))),
          safetyViolations: Math.max(0, Math.round(teamTotals.safetyViolations * share * (0.92 + localRand() * 0.2))),
          automationConflicts: Math.max(0, Math.round(teamTotals.automationConflicts * share * (0.92 + localRand() * 0.2))),
          avgCompletionMinutes: round((supportLike ? 6.2 : 8.4) * (0.9 + localRand() * 0.18), 1),
        });
      });

      const dealAttributeShares = buildShareVector(dealAttributes, `${seedBase}:${team.key}:deal-attributes:${dayIndex}`);
      dealAttributes.forEach((attribute, attributeIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:deal-attributes:${attribute.dealOwner}:${dayIndex}`));
        const share = dealAttributeShares[attributeIndex] || 0;
        const dealsCreated = Math.max(0, Math.round(teamTotals.dealsCreated * share * (0.88 + localRand() * 0.18)));
        const dealsWon = Math.max(0, Math.round(teamTotals.dealsWon * share * (0.88 + localRand() * 0.18)));
        dealAttributeDaily.push({
          date,
          team: team.name,
          dealOwner: attribute.dealOwner,
          currency: attribute.currency,
          closeReason: attribute.closeReason,
          competitor: attribute.competitor,
          dealsCreated,
          dealsWon,
          lostDeals: Math.max(0, dealsCreated - dealsWon + Math.round(localRand() * 2)),
          pipelineValue: Math.max(0, Math.round(teamTotals.pipelineValue * share * (0.88 + localRand() * 0.18))),
          wonRevenue: Math.max(0, Math.round(teamTotals.wonRevenue * share * (0.88 + localRand() * 0.18))),
        });
      });

      const callAttributeShares = buildShareVector(callAttributes, `${seedBase}:${team.key}:call-attributes:${dayIndex}`);
      callAttributes.forEach((attribute, attributeIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:call-attributes:${attribute.voiceLine}:${attribute.connectionResult}:${dayIndex}`));
        const share = callAttributeShares[attributeIndex] || 0;
        const totalCalls = Math.max(0, Math.round(teamTotals.totalCalls * share * (0.9 + localRand() * 0.18)));
        const transferCount = Math.max(
          0,
          Math.round(totalCalls * (attribute.connectionResult === 'Transferred' ? 0.72 : attribute.connectionResult === 'Connected' ? 0.18 : 0.05) * (0.84 + localRand() * 0.22))
        );
        const holdMinutes = round(totalCalls * (attribute.connectionResult === 'Transferred' ? 1.8 : attribute.connectionResult === 'Connected' ? 0.9 : 0.36) * (0.84 + localRand() * 0.22), 1);
        const recordedCalls = Math.max(0, Math.round(totalCalls * (attribute.recordingFlag === 'Recorded' ? 0.86 : 0.08) * (0.9 + localRand() * 0.18)));
        callQualityDaily.push({
          date,
          team: team.name,
          voiceLine: attribute.voiceLine,
          connectionResult: attribute.connectionResult,
          recordingFlag: attribute.recordingFlag,
          totalCalls,
          missedCalls: Math.max(0, Math.round(totalCalls * (attribute.connectionResult === 'Dropped' ? 0.62 : attribute.connectionResult === 'Voicemail' ? 0.34 : 0.08))),
          callbackRequests: Math.max(0, Math.round(totalCalls * (attribute.connectionResult === 'Voicemail' ? 0.28 : 0.08) * (0.9 + localRand() * 0.18))),
          avgWaitMinutes: round((attribute.connectionResult === 'Transferred' ? 2.9 : attribute.connectionResult === 'Connected' ? 1.8 : 1.2) * (0.88 + localRand() * 0.18), 1),
          avgCallDurationMinutes: round((attribute.connectionResult === 'Connected' ? 5.1 : attribute.connectionResult === 'Transferred' ? 6.3 : 2.2) * (0.88 + localRand() * 0.18), 1),
          transferCount,
          holdMinutes,
          avgHoldMinutes: round(totalCalls > 0 ? holdMinutes / totalCalls : 0, 1),
          recordedCalls,
        });
      });

      const surveyDetailShares = buildShareVector(surveyDetails, `${seedBase}:${team.key}:survey-details:${dayIndex}`);
      surveyDetails.forEach((detail, detailIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:survey-details:${detail.surveyTemplate}:${detail.deliveryChannel}:${dayIndex}`));
        const share = surveyDetailShares[detailIndex] || 0;
        const surveyResponses = Math.max(1, Math.round(teamTotals.surveyResponses * share * (0.88 + localRand() * 0.18)));
        const surveysSent = Math.max(surveyResponses, Math.round(teamTotals.surveysSent * share * (0.88 + localRand() * 0.18)));
        const sentiment = detail.sentimentLabel.toLowerCase();
        const promoterResponses = Math.max(
          0,
          Math.min(surveyResponses, Math.round(surveyResponses * (sentiment === 'positive' ? 0.74 : sentiment === 'neutral' ? 0.22 : 0.08) * (0.9 + localRand() * 0.14)))
        );
        const detractorResponses = Math.max(
          0,
          Math.min(surveyResponses - promoterResponses, Math.round(surveyResponses * (sentiment === 'negative' ? 0.62 : sentiment === 'neutral' ? 0.18 : 0.06) * (0.9 + localRand() * 0.14)))
        );
        surveyDetailDaily.push({
          date,
          team: team.name,
          surveyTemplate: detail.surveyTemplate,
          surveyQuestion: detail.surveyQuestion,
          deliveryChannel: detail.deliveryChannel,
          respondentType: detail.respondentType,
          sentimentLabel: detail.sentimentLabel,
          surveysSent,
          surveyResponses,
          promoterResponses,
          detractorResponses,
          csatScore: round(clamp((sentiment === 'positive' ? 4.7 : sentiment === 'negative' ? 3.46 : 4.02) * (0.96 + localRand() * 0.08), 3.2, 4.94), 2),
        });
      });

      const workforceShares = buildShareVector(workforcePlans, `${seedBase}:${team.key}:workforce:${dayIndex}`);
      workforcePlans.forEach((plan, planIndex) => {
        const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:workforce:${plan.schedule}:${plan.shift}:${dayIndex}`));
        const share = workforceShares[planIndex] || 0;
        const plannedCapacityHours = round(teamTotals.capacityHours * share * (0.9 + localRand() * 0.14), 1);
        const demandHours = round(teamTotals.demandHours * share * (0.92 + localRand() * 0.16), 1);
        const scheduledHours = round(plannedCapacityHours * (0.92 + localRand() * 0.1), 1);
        const overtimeHours = round(Math.max(0, demandHours - scheduledHours) * (0.42 + localRand() * 0.22), 1);
        const onlineHours = round(scheduledHours * (0.76 + localRand() * 0.16), 1);
        const busyHours = round(Math.min(onlineHours, demandHours * (0.82 + localRand() * 0.14)), 1);
        workforceDaily.push({
          date,
          team: team.name,
          schedule: plan.schedule,
          shift: plan.shift,
          plannedCapacityHours,
          scheduledHours,
          overtimeHours,
          capacityHours: plannedCapacityHours,
          demandHours,
          onlineHours,
          busyHours,
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
        const voiceLineShares = buildShareVector(
          voiceLines.map((voiceLine, lineIndex) => ({ voiceLine, weight: lineIndex === 0 ? 3 : lineIndex === 1 ? 2 : 1 })),
          `${seedBase}:${team.key}:voice-line:${dayIndex}`
        );
        voiceLines.forEach((voiceLine, lineIndex) => {
          const localRand = mulberry32(hashSeed(`${seedBase}:${team.key}:${voiceLine}:${dayIndex}`));
          const share = voiceLineShares[lineIndex] || 0;
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
        const assignedOpenTickets = Math.max(0, Math.round((teamTotals.assignedTickets / agents.length) * contribution * (0.82 + localRand() * 0.18)));
        agentDaily.push({
          date,
          team: team.name,
          agent: agentName,
          teamFocus: team.focus,
          conversations: conversationsHandled,
          conversationsHandled,
          openTickets: assignedOpenTickets,
          ticketsResolved: resolved,
          assignedOpenTickets,
          firstResponseMinutes: round((supportLike ? 22 : 17) * (0.88 + localRand() * 0.22), 1),
          csatScore: round(clamp((supportLike ? 4.3 : 4.1) * (0.97 + localRand() * 0.06), 3.4, 4.96), 2),
          surveyResponses,
          dealsWon: salesLike ? Math.round((teamTotals.dealsWon / agents.length) * contribution * (0.8 + localRand() * 0.26)) : 0,
          pipelineValue: round((teamTotals.pipelineValue / agents.length) * (0.7 + localRand() * 0.56), 0),
          aiAssistCount: Math.round(conversationsHandled * clamp(0.18 + localRand() * 0.18, 0.06, 0.52)),
        });

        const onlineHours = round(clamp((supportLike ? 6.8 : 6.1) * (0.9 + localRand() * 0.14), 3.6, 8.6), 1);
        const busyHours = round(onlineHours * clamp(0.42 + localRand() * 0.22, 0.18, 0.88), 1);
        const awayHours = round(clamp((8.5 - onlineHours) * (0.4 + localRand() * 0.3), 0.2, 2.4), 1);
        const offlineHours = round(Math.max(0, 24 - onlineHours - awayHours), 1);
        const availabilityRoll = localRand();
        const availabilityStatus = availabilityRoll > 0.8 ? 'Offline' : availabilityRoll > 0.56 ? 'Away' : availabilityRoll > 0.28 ? 'Busy' : 'Online';
        agentPresenceDaily.push({
          date,
          team: team.name,
          agent: agentName,
          availabilityStatus,
          onlineHours,
          busyHours,
          awayHours,
          offlineHours,
          totalCalls: Math.max(0, Math.round((teamTotals.totalCalls / agents.length) * contribution * (0.82 + localRand() * 0.18))),
          conversationsHandled,
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
    regionDaily,
    accountDaily,
    queueDaily,
    productDaily,
    campaignDaily,
    knowledgeArticleDaily,
    aiModelDaily,
    journeyDaily,
    dealAttributeDaily,
    callQualityDaily,
    surveyDetailDaily,
    workforceDaily,
    agentPresenceDaily,
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

function metricSupportedByRows(metricId, rows = []) {
  const meta = METRIC_DEFINITIONS[metricId];
  const sample = rows[0];
  if (!meta || !sample) return false;
  if (meta.aggregate === 'ratio' || meta.aggregate === 'difference') {
    return meta.numeratorKey in sample && meta.denominatorKey in sample;
  }
  if (meta.aggregate === 'weighted_average') {
    return meta.sourceKey in sample && meta.weightKey in sample;
  }
  if (meta.sourceKey) return meta.sourceKey in sample;
  return false;
}

function metricsForEntity(entityId, dataset) {
  const rows = dataset[{
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
  }[entityId]] || [];
  return Object.keys(METRIC_DEFINITIONS).filter(metricId => metricSupportedByRows(metricId, rows));
}

function getSemanticSchema(customerProfile = {}, context = {}) {
  const dataset = buildSyntheticDataset(customerProfile, context);
  return {
    entities: [
      { id: 'team_daily', label: 'Team daily performance', metrics: metricsForEntity('team_daily', dataset) },
      { id: 'agent_daily', label: 'Agent daily performance', metrics: metricsForEntity('agent_daily', dataset) },
      { id: 'region_daily', label: 'Regional and language mix', metrics: metricsForEntity('region_daily', dataset) },
      { id: 'account_daily', label: 'Account segment and lifecycle mix', metrics: metricsForEntity('account_daily', dataset) },
      { id: 'queue_daily', label: 'Queue, priority, and SLA slices', metrics: metricsForEntity('queue_daily', dataset) },
      { id: 'product_daily', label: 'Product line and issue mix', metrics: metricsForEntity('product_daily', dataset) },
      { id: 'campaign_daily', label: 'Campaign and acquisition performance', metrics: metricsForEntity('campaign_daily', dataset) },
      { id: 'knowledge_article_daily', label: 'Knowledge base coverage', metrics: metricsForEntity('knowledge_article_daily', dataset) },
      { id: 'ai_model_daily', label: 'AI model and prompt performance', metrics: metricsForEntity('ai_model_daily', dataset) },
      { id: 'journey_daily', label: 'Automation journey performance', metrics: metricsForEntity('journey_daily', dataset) },
      { id: 'deal_attribute_daily', label: 'Deal owner, competitor, and close-reason slices', metrics: metricsForEntity('deal_attribute_daily', dataset) },
      { id: 'call_quality_daily', label: 'Call transfer, recording, and hold-time slices', metrics: metricsForEntity('call_quality_daily', dataset) },
      { id: 'survey_detail_daily', label: 'Survey template and respondent slices', metrics: metricsForEntity('survey_detail_daily', dataset) },
      { id: 'workforce_daily', label: 'Shift and staffing plan slices', metrics: metricsForEntity('workforce_daily', dataset) },
      { id: 'agent_presence_daily', label: 'Agent availability and occupancy', metrics: metricsForEntity('agent_presence_daily', dataset) },
      { id: 'intent_daily', label: 'Intent trend and quality data', metrics: metricsForEntity('intent_daily', dataset) },
      { id: 'stage_daily', label: 'Sales stage and channel funnel data', metrics: metricsForEntity('stage_daily', dataset) },
      { id: 'hourly_daily', label: 'Hourly volume patterns', metrics: metricsForEntity('hourly_daily', dataset) },
      { id: 'voice_channel_daily', label: 'Voice channel performance', metrics: metricsForEntity('voice_channel_daily', dataset) },
      { id: 'voice_direction_daily', label: 'Inbound vs outbound voice activity', metrics: metricsForEntity('voice_direction_daily', dataset) },
      { id: 'workflow_status_daily', label: 'Workflow status distribution', metrics: metricsForEntity('workflow_status_daily', dataset) },
      { id: 'handoff_reason_daily', label: 'Automation handoff reasons', metrics: metricsForEntity('handoff_reason_daily', dataset) },
      { id: 'contact_type_daily', label: 'New vs returning contacts', metrics: metricsForEntity('contact_type_daily', dataset) },
      { id: 'aging_band_daily', label: 'Backlog aging buckets', metrics: metricsForEntity('aging_band_daily', dataset) },
      { id: 'sla_risk_daily', label: 'SLA risk buckets', metrics: metricsForEntity('sla_risk_daily', dataset) },
      { id: 'satisfaction_theme_daily', label: 'Satisfaction themes and detractors', metrics: metricsForEntity('satisfaction_theme_daily', dataset) },
      { id: 'reopen_reason_daily', label: 'Reopen reasons', metrics: metricsForEntity('reopen_reason_daily', dataset) },
      { id: 'lead_source_daily', label: 'Lead source quality and value', metrics: metricsForEntity('lead_source_daily', dataset) },
      { id: 'call_outcome_daily', label: 'Voice call outcomes', metrics: metricsForEntity('call_outcome_daily', dataset) },
      { id: 'ai_confidence_daily', label: 'AI confidence mix', metrics: metricsForEntity('ai_confidence_daily', dataset) },
    ],
    dimensions: [
      'team', 'channel', 'agent', 'date', 'week', 'month', 'quarter',
      'intent', 'intent_version', 'stage', 'hour', 'status', 'reason', 'contact_type', 'direction',
      'age_band', 'risk_band', 'theme', 'source', 'outcome', 'confidence_band',
      'region', 'country', 'city', 'language', 'business_unit',
      'account_segment', 'account_tier', 'plan', 'lifecycle_stage', 'cohort',
      'queue', 'priority', 'sla_policy',
      'product_line', 'feature_area', 'issue_type',
      'campaign', 'article', 'article_category',
      'ai_model', 'prompt_version', 'guardrail_type',
      'journey', 'journey_version', 'trigger_type', 'exit_reason',
      'deal_owner', 'currency', 'close_reason', 'competitor',
      'voice_line', 'connection_result', 'recording_flag',
      'survey_template', 'survey_question', 'delivery_channel', 'respondent_type', 'sentiment_label',
      'schedule', 'shift', 'availability_status',
    ],
    metrics: Object.entries(METRIC_DEFINITIONS).map(([id, meta]) => ({ id, ...meta })),
    aliases: METRIC_ALIASES,
    availableTeams: dataset.teams.map(team => ({ name: team.name, focus: team.focus })),
    availableChannels: dataset.channels,
    defaultTimeRange: 'last_30_days',
    notes: [
      'Analytics data with customer-specific overlays.',
      'Covers visible dashboard topics plus nearby supporting data that is not always shown in the dashboard.',
      'Includes geography, account segmentation, queue/SLA, product area, campaign, knowledge base, AI model, journey, deal-attribute, survey-detail, call-quality, and staffing slices.',
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
