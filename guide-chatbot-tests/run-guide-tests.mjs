import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROXY_URL = 'https://trengo-chatbot-proxy.analytics-chatbot.workers.dev';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const OUTPUT_DIR = __dirname;
const RESULTS_DIR = path.join(OUTPUT_DIR, 'results');

const EXTERNAL_REFERENCES = [
  {
    id: 'trengo-live-dashboard',
    title: 'Live Dashboard: real-time reporting and analytics',
    url: 'https://help.trengo.com/article/live-dashboard-real-time-reporting-and-analytics',
    note: 'Used to shape questions about current real-time workload reporting, teams, channels, labels, and business-hours filtering.'
  },
  {
    id: 'trengo-ticket-details',
    title: 'Ticket Details: deep dive into your tickets',
    url: 'https://help.trengo.com/article/ticket-details-deep-dive-into-your-tickets',
    note: 'Used to shape questions about deep dives, exports, filters, and how ticket-level analysis relates to the prototype watchtower model.'
  },
  {
    id: 'trengo-csat-report',
    title: 'Customer Satisfaction (CSAT) Report',
    url: 'https://help.trengo.com/article/customer-satisfaction-csat-report',
    note: 'Used to shape questions about CSAT, survey analysis, and where satisfaction signals belong in the new structure.'
  },
  {
    id: 'trengo-exports-legacy',
    title: 'Exporting reports (legacy)',
    url: 'https://help.trengo.com/article/exporting-reports',
    note: 'Used to shape questions about exports, CSV workflows, and continuity with existing reporting habits.'
  },
  {
    id: 'trengo-channels-report',
    title: 'The Channels report (legacy)',
    url: 'https://help.trengo.com/article/the-channels-report',
    note: 'Used to shape questions about channel-centric reporting and how the prototype reframes it.'
  },
  {
    id: 'trengo-labels-report',
    title: 'The Labels report (legacy)',
    url: 'https://help.trengo.com/article/the-labels-report',
    note: 'Used to shape questions about label-driven analysis and where those insights map into the new concept.'
  },
  {
    id: 'trengo-ai-labeling',
    title: 'AI Labeling in Journeys: Automate and Analyze Conversations',
    url: 'https://help.trengo.com/article/ai-labeling-in-journeys-automate-and-analyze-conversations',
    note: 'Used to shape questions about intent clustering, automated classification, and improvement loops.'
  },
  {
    id: 'trengo-help-centre-ai-agent',
    title: 'Connecting your Trengo Help Centre to AI Agent',
    url: 'https://help.trengo.com/article/connecting-your-trengo-help-centre-to-helpmate',
    note: 'Used to shape questions about knowledge gaps, AI enablement, and the relationship between knowledge sources and automation analytics.'
  },
  {
    id: 'trengo-analytics-index',
    title: 'Trengo Help Center landing page',
    url: 'https://help.trengo.com/',
    note: 'Used as an index to current Trengo analytics/help topics and to ground realistic stakeholder questions in existing product language.'
  }
];

const SECTION_META = [
  {
    id: 'overview',
    name: 'Overview',
    coreQuestion: 'What is happening right now, and where should attention be directed?',
    purpose: 'awareness and prioritisation',
    notFor: 'deep diagnosis or optimisation decisions',
    adjacent: 'Understand'
  },
  {
    id: 'understand',
    name: 'Understand',
    coreQuestion: 'Why is work entering the system, and why is it changing?',
    purpose: 'composition, drivers, and change in incoming work',
    notFor: 'live operational management',
    adjacent: 'Operate'
  },
  {
    id: 'operate',
    name: 'Operate',
    coreQuestion: 'Is work flowing toward its goal at this moment?',
    purpose: 'execution, flow, backlog, and bottlenecks',
    notFor: 'root-cause analysis or long-term improvement prioritisation',
    adjacent: 'Improve'
  },
  {
    id: 'improve',
    name: 'Improve',
    coreQuestion: 'What changes would lead to better outcomes?',
    purpose: 'prioritised change decisions and trend-based opportunities',
    notFor: 'live queue monitoring',
    adjacent: 'Automate'
  },
  {
    id: 'automate',
    name: 'Automate',
    coreQuestion: 'What runs without humans, and how well does it run?',
    purpose: 'coverage, health, and reliability of AI and automation',
    notFor: 'deciding what to automate next',
    adjacent: 'Improve'
  }
];

const WIDGET_META = [
  { name: 'Open tickets', section: 'Overview', signal: 'current system load', action: 'where immediate attention may be needed' },
  { name: 'First response time', section: 'Operate', signal: 'speed of first human response', action: 'whether execution is keeping up' },
  { name: 'Intent trend highlights', section: 'Overview', signal: 'directional movement in customer demand', action: 'where users should look next' },
  { name: 'Entry channels', section: 'Understand', signal: 'where work enters the system', action: 'how composition changes by channel' },
  { name: 'Intent clusters', section: 'Understand', signal: 'what users are contacting about', action: 'which themes are driving volume' },
  { name: 'Unknown / unclassified intents', section: 'Understand', signal: 'gaps in understanding incoming work', action: 'where the intent model is weak' },
  { name: 'Workload by agent', section: 'Operate', signal: 'distribution of active work', action: 'whether capacity is balanced' },
  { name: 'Capacity vs demand', section: 'Operate', signal: 'supply-demand pressure', action: 'whether teams can absorb current volume' },
  { name: 'Bottlenecks', section: 'Operate', signal: 'where flow is slowing down', action: 'where friction is happening now' },
  { name: 'Knowledge gaps by intent', section: 'Improve', signal: 'topics where answers are missing', action: 'what knowledge improvements to prioritise' },
  { name: 'Suggested knowledge additions', section: 'Improve', signal: 'candidate knowledge fixes', action: 'what could reduce future escalations' },
  { name: 'Opportunities backlog', section: 'Improve', signal: 'prioritised change opportunities', action: 'which improvements deserve action first' },
  { name: 'AI Agent tickets', section: 'Automate', signal: 'automation coverage volume', action: 'how much work AI is taking on' },
  { name: 'Resolution rate AI Agents', section: 'Automate', signal: 'automation effectiveness', action: 'how well AI resolves work end-to-end' },
  { name: 'Journeys success ratio', section: 'Automate', signal: 'journey completion reliability', action: 'whether automation flows finish successfully' },
  { name: 'Automation handoff reasons', section: 'Automate', signal: 'why automation transfers to humans', action: 'where automated flows break down' },
  { name: 'Voice channel performance', section: 'Understand', signal: 'voice-specific composition and performance', action: 'how voice behaves within the overall system' },
  { name: 'Sales pipeline funnel', section: 'Understand', signal: 'drop-off across sales stages', action: 'where conversion weakens structurally' },
  { name: 'New vs returning contacts', section: 'Understand', signal: 'mix of first-time and repeat demand', action: 'whether work is new demand or repeated need' }
];

const FOUNDATION_QUESTIONS = [
  'Why does this analytics model start from questions instead of dashboards?',
  'What problem is the prototype trying to solve in the current reporting setup?',
  'Why is the model described as AI-native?',
  'What does the watchtower idea actually mean in practice?',
  'Why is fragmentation such a big concern in analytics design?',
  'What makes this model more future-proof than a ticket-based structure?',
  'How does the concept change the organising logic without discarding important metrics?',
  'Why keep one structure for support and sales instead of separate reporting systems?',
  'What would go wrong if AI metrics were just layered onto the old dashboards?',
  'Why are the five sections meant to stay stable even when use cases change?',
  'What kind of change is this model meant to survive over time?',
  'How does the prototype move from historical evidence toward directional guidance?',
  'Why is the section order fixed?',
  'What does it mean that the model is question-led rather than feature-led?',
  'How does this concept help when the unit of work is not just tickets anymore?',
  'What is the conceptual difference between a reporting dashboard and a control surface?',
  'Why is continuity with existing metrics still important here?',
  'What stays the same from traditional reporting, and what changes?',
  'Why is structural stability more important than tailoring the nav to every team?',
  'How does the model avoid becoming obsolete when automation handles more of the workload?',
  'Why is the prototype more about organising interpretation than inventing new metrics?',
  'What does the concept mean by directional signals?',
  'Why is the model described as a structural shift rather than a dashboard redesign?',
  'What is the main promise of the five-section model to stakeholders?',
  'If this concept succeeded, what would be easier for teams to do?',
  'Why is retrospective reporting not enough for this direction?',
  'How does the concept frame risks differently from a normal KPI dashboard?',
  'Why does the prototype emphasise prioritised action instead of just visibility?',
  'What is the strongest argument for this model if a stakeholder only hears one point?',
  'Why does the concept care so much about decision context?'
];

const BOUNDARY_QUESTIONS = [
  'How should stakeholders explain the difference between Overview and Understand?',
  'How should stakeholders explain the difference between Understand and Operate?',
  'How should stakeholders explain the difference between Operate and Improve?',
  'How should stakeholders explain the difference between Improve and Automate?',
  'Why can a similar signal appear in both Operate and Improve?',
  'How does the prototype decide whether a signal belongs in Overview or Operate?',
  'What makes something a diagnosis signal rather than an execution signal?',
  'When would repetition across sections be valid instead of redundant?',
  'Why is Automate separate from Improve if both deal with automation-related issues?',
  'What is the cleanest rule for deciding where a metric belongs?'
];

const FILTER_AND_CONFIGURATION_QUESTIONS = [
  'Why does the settings popout use role and use case instead of creating different dashboards?',
  'What is the point of the Supervisor and Agent preview toggle?',
  'What is the point of the Resolve and Convert preview toggle?',
  'How do role and use case combine conceptually in the prototype?',
  'Why are filters treated as adaptation rather than structural change?',
  'What does the channel filter help users understand in this concept?',
  'Why is the team filter an emphasis tool instead of a navigation model?',
  'What is the rationale for keeping date, channel, and team filters together above the content?',
  'Why is View mode different from disabling the settings toggles entirely?',
  'What is the purpose of Edit mode in a conceptual prototype like this?',
  'Why allow custom pages if the five-section structure is supposed to stay stable?',
  'How should stakeholders think about custom pages versus the default five sections?',
  'Why can users add widgets from any section to a custom page without changing the core structure?',
  'Why are the default pages customisable but not removable?',
  'What does Reset All communicate about the intended prototype baseline?',
  'Why should reset restore filters, role, use case, tabs, and widgets together?',
  'What stays conceptual when someone switches role or use case in the popout?',
  'Why is a single shared structure more valuable than separate support and sales tabs?',
  'What is the purpose of the team-specific use case setting when enabled?',
  'Why does the prototype include both global filters and preview toggles?',
  'How do filters differ from structural lenses in this model?',
  'Why are voice signals hidden unless the channel context makes them relevant?',
  'What does the settings popout teach stakeholders about adaptability?',
  'Why is labels filtering present conceptually even if it is not fully functional here?',
  'What does the reset behavior imply about the prototype as a review tool?'
];

const GUIDE_AND_FEEDBACK_QUESTIONS = [
  'What is the Prototype Guide supposed to help stakeholders understand?',
  'Why does the guide answer only from the prototype specification?',
  'Why is the guide so strict about not speculating?',
  'What kinds of questions should the guide handle well?',
  'What kinds of questions should the guide refuse?',
  'Why does the guide talk in third person about users and teams?',
  'How should the guide respond when a stakeholder gives design feedback?',
  'What is the difference between structural feedback and detail feedback in the guide logic?',
  'Why does the guide sometimes ask a clarifying question before logging feedback?',
  'What is the purpose of logging feedback instead of just chatting about it?',
  'Why is the walkthrough part of the prototype instead of relying only on the guide?',
  'What does the walkthrough cover that the guide does not guarantee proactively?',
  'Why does the guide respond to navigation events differently from direct questions?',
  'How should stakeholders use the guide during a concept review?',
  'What does it mean that the guide is for evaluating the model rather than using the final product?',
  'Why is the guide allowed to explain rationale but not broader product roadmap?',
  'Why is concise answering important in this guide experience?',
  'How does the guide reinforce the five-section mental model?',
  'Why does the guide avoid turning every answer into a long report?',
  'What is the intended relationship between the walkthrough, the guide, and manual exploration?'
];

const PROMPT_BEHAVIOR_QUESTIONS = [
  'How should the guide handle a message that includes both a question and feedback?',
  'What should the guide do if feedback is about spacing or button polish rather than the model itself?',
  'If a stakeholder says "make this a bar chart", what should the guide try to understand before logging it?',
  'What makes feedback clear enough to log without asking a clarifying question first?',
  'If a user says only "this feels off", what should the guide do next?',
  'How should the guide answer a question about a non-final UI detail in the prototype?',
  'If someone asks whether a chart type in the prototype is final, how should the guide frame the answer?',
  'How should the guide respond if someone asks about Trengo\'s roadmap for this analytics model?',
  'How should the guide respond if someone asks what feedback has been collected without using the word Helion?',
  'Why should the guide prefer logging the underlying concern instead of only the proposed cosmetic fix?'
];

const BREVITY_STRUCTURE_TOPICS = [
  'the model uses five sections instead of team dashboards',
  'the structure is question-led instead of ticket-led',
  'the watchtower framing matters',
  'Overview is separate from Understand',
  'Operate is separate from Improve',
  'Automate exists as its own section',
  'support and sales share one structure',
  'the prototype keeps continuity with existing metrics',
  'the settings popout uses role and use case toggles instead of separate dashboards',
  'custom pages do not undermine the core model',
  'drill links exist between sections',
  'the guide is framed for stakeholders rather than end users',
  'the guide should answer briefly by default',
  'detail feedback gets nudged before logging',
  'the guide should prefer the underlying concern over a cosmetic fix',
  'non-final UI details should be answered provisionally',
  'voice signals are scoped instead of given a separate structure',
  'the Bottlenecks widget belongs in Operate',
  'Reset All matters in a stakeholder review session',
  'ticket-detail deep dives are not the organising structure of the model',
  'the model is more future-proof than a ticket-based dashboard system',
  'the prototype keeps one structure while adapting by lens and role',
  'the model treats AI and automation as core parts of the system',
  'the concept focuses on decision context instead of metric type'
];

const BREVITY_STRUCTURE_WRAPPERS = [
  topic => `Why does ${topic}?`,
  topic => `Briefly, why does ${topic}?`,
  topic => `In one sentence, why does ${topic}?`,
  topic => `Short answer only: why does ${topic}?`,
  topic => `What's the main reason ${topic}?`,
  topic => `At a high level, why does ${topic}?`,
  topic => `If you had to compress it, why does ${topic}?`,
  topic => `What's the core point behind why ${topic}?`,
  topic => `Could you give the shortest clear answer for why ${topic}?`,
  topic => `From a stakeholder perspective, why does ${topic}?`,
  topic => `Can you answer very briefly why ${topic}?`,
  topic => `I only need the top reason: why does ${topic}?`
];

function buildBrevityStructureQuestions() {
  const questions = [];
  for (const topic of BREVITY_STRUCTURE_TOPICS) {
    for (const wrapper of BREVITY_STRUCTURE_WRAPPERS) {
      questions.push(wrapper(topic));
    }
  }
  return questions;
}

const CUSTOMISATION_AND_INTERACTION_QUESTIONS = [
  'Why let users drag and resize widgets in this prototype?',
  'What does hiding a widget represent conceptually?',
  'Why does the widget drawer show widgets from every section?',
  'What is the value of showing unavailable widgets in the drawer with state labels?',
  'Why do some widgets include drill links to other sections?',
  'What should stakeholders infer from the Manage widgets flow?',
  'Why can the prototype create empty custom pages?',
  'What does the Add widgets prompt on an empty page say about the model?',
  'Why is CSV export included on chart widgets in a conceptual prototype?',
  'How does the edit experience support the watchtower idea rather than undermine it?',
  'Why is there a distinction between view-only and editable states?',
  'What does the ability to assemble a personal page imply about the model?',
  'Why does each page keep its own widget set?',
  'Why are users allowed to rename custom pages but not the five core sections?',
  'What should stakeholders infer from the delete-page safeguard that at least one page must remain?',
  'Why is reorder-and-resize useful even when the prototype uses mock data?',
  'How does the prototype separate structural questions from layout preferences?',
  'What is the conceptual purpose of tooltip text on the widgets?',
  'Why do some list widgets support show more and show less?',
  'How do widget interactions help stakeholders evaluate whether the structure is flexible enough?'
];

const EXTERNAL_CONTEXT_QUESTIONS = [
  'How is this concept different from the current Trengo Live Dashboard idea?',
  'Does this prototype replace a live dashboard or sit above it conceptually?',
  'How would today\'s ticket-detail deep dive fit into this new model?',
  'Would ticket exports still matter if this model became the main analytics structure?',
  'Where would a classic CSAT report map into the five sections?',
  'How does this concept reframe channel reports from legacy reporting?',
  'How does this concept reframe label-based reporting from legacy reporting?',
  'If current reporting starts from channels and tickets, what does this model start from instead?',
  'How should stakeholders think about business-hours metrics inside this new concept?',
  'Would the prototype remove the need for ticket-level investigation pages?',
  'How does this model change the role of CSV export workflows?',
  'Where would AI labeling signals fit conceptually in this structure?',
  'How does connecting a help centre to AI Agent relate to the Improve and Automate sections?',
  'How would teams compare support and sales performance without separate dashboard systems?',
  'What part of the new model best replaces current fragmented reporting surfaces?',
  'Why is a question-led structure better suited to AI growth than report-by-report additions?',
  'What continuity does this model keep with current Trengo metrics like first response time or resolution time?',
  'If a stakeholder is used to channel reports, how should they mentally translate them into this concept?',
  'If a stakeholder is used to ticket-detail tables, how should they think about them here?',
  'How does this prototype avoid becoming another reporting surface on top of the existing ones?',
  'What would likely remain necessary from current reporting even if the concept is adopted?',
  'How should stakeholders compare this prototype to current analytics without expecting one-to-one widget parity?',
  'What does this concept add that current report collections do not add structurally?',
  'Why is the model trying to reduce surface fragmentation instead of adding more specialised dashboards?',
  'How can this concept coexist with existing analytics while a migration is still incomplete?'
];

const SECTION_QUESTIONS = SECTION_META.flatMap(section => ([
  `What is the core purpose of ${section.name}?`,
  `What question is ${section.name} meant to answer?`,
  `Why does ${section.name} exist as its own section instead of being merged with ${section.adjacent}?`,
  `What decision context defines ${section.name}?`,
  `What belongs in ${section.name} because it supports ${section.purpose}?`,
  `What does not belong in ${section.name} because it is really about ${section.notFor}?`,
  `How should stakeholders describe ${section.name} in one sentence?`,
  `Why would a stakeholder click into ${section.name} after scanning the dashboard?`,
  `What would make ${section.name} fail conceptually?`
]));

const WIDGET_QUESTIONS = WIDGET_META.flatMap(widget => ([
  `What decision is "${widget.name}" meant to support?`,
  `Why is "${widget.name}" shown in ${widget.section} instead of another section?`,
  `What does "${widget.name}" tell users about ${widget.signal}?`,
  `If "${widget.name}" changes suddenly, what kind of follow-up question should it trigger?`
]));

const CROSS_MODEL_QUESTIONS = [
  'If a stakeholder says this still looks like normal reporting with better labels, what is the rebuttal?',
  'What is the simplest way to explain why Overview is not just a homepage?',
  'Why is Understand not just a segmentation report?',
  'Why is Operate not just a performance dashboard?',
  'Why is Improve not just a backlog of random ideas?',
  'Why is Automate not just an AI KPI page?',
  'How does the model make AI performance observable without letting AI dominate the entire navigation?',
  'Why is prioritisation separated from explanation in this structure?',
  'How does the model help teams decide where to act next?',
  'Why does the concept make room for opportunities rather than only outcomes?'
];

const SINGLE_QUESTION_GROUPS = [
  { id: 'foundation', title: 'Concept foundations', source: 'repo', questions: FOUNDATION_QUESTIONS },
  { id: 'sections', title: 'Section purposes and boundaries', source: 'repo', questions: SECTION_QUESTIONS.concat(BOUNDARY_QUESTIONS) },
  { id: 'widgets', title: 'Widget-specific questions', source: 'repo', questions: WIDGET_QUESTIONS },
  { id: 'filters', title: 'Filters, role, lens, and settings', source: 'repo', questions: FILTER_AND_CONFIGURATION_QUESTIONS },
  { id: 'interactions', title: 'Customisation and interaction model', source: 'repo', questions: CUSTOMISATION_AND_INTERACTION_QUESTIONS },
  { id: 'guide', title: 'Guide, walkthrough, and feedback', source: 'repo', questions: GUIDE_AND_FEEDBACK_QUESTIONS },
  { id: 'prompt-behavior', title: 'Prompt behavior and edge cases', source: 'repo', questions: PROMPT_BEHAVIOR_QUESTIONS },
  { id: 'brevity-structure', title: 'Brevity and structure stress tests', source: 'repo', questions: buildBrevityStructureQuestions() },
  { id: 'external', title: 'Questions informed by current Trengo docs', source: 'external', questions: EXTERNAL_CONTEXT_QUESTIONS.concat(CROSS_MODEL_QUESTIONS) }
];

function buildSingleQuestions() {
  const items = [];
  let index = 1;
  for (const group of SINGLE_QUESTION_GROUPS) {
    for (const question of group.questions) {
      items.push({
        id: `Q${String(index).padStart(3, '0')}`,
        groupId: group.id,
        groupTitle: group.title,
        source: group.source,
        text: question
      });
      index += 1;
    }
  }
  return items;
}

function branchByKeywords(lastAssistant, branches, fallbackPrompt) {
  if (!lastAssistant) return fallbackPrompt || branches?.[0]?.prompt || '';
  const normalized = lastAssistant.toLowerCase();
  for (const branch of branches || []) {
    const keywords = branch.ifIncludes || [];
    if (keywords.every(keyword => normalized.includes(keyword.toLowerCase()))) {
      return branch.prompt;
    }
  }
  return fallbackPrompt || branches?.find(branch => branch.default)?.prompt || '';
}

function buildSequences() {
  return [
    {
      id: 'S01',
      title: 'Five-section rationale thread',
      turns: [
        { prompt: 'Why is the model organised around five sections instead of dashboards by team?' },
        {
          branches: [
            {
              ifIncludes: ['stable'],
              prompt: 'What kinds of change is that stability meant to survive?'
            },
            {
              ifIncludes: ['future'],
              prompt: 'What kinds of future change is the structure meant to survive?'
            },
            {
              default: true,
              prompt: 'What makes these five sections more durable than a team-based structure?'
            }
          ]
        },
        {
          branches: [
            {
              ifIncludes: ['ai'],
              prompt: 'How does that help once AI handles more of the work?'
            },
            {
              default: true,
              prompt: 'How does that logic still work when the work is not only handled by humans?'
            }
          ]
        },
        { prompt: 'Does that mean support and sales are expected to share one structure even if their goals differ?' }
      ]
    },
    {
      id: 'S02',
      title: 'Overview versus Understand thread',
      turns: [
        { prompt: 'What is the difference between Overview and Understand?' },
        {
          branches: [
            {
              ifIncludes: ['where to look'],
              prompt: 'So is it fair to say Overview points attention while Understand explains causes?'
            },
            {
              default: true,
              prompt: 'Which one is about prioritisation, and which one is about explanation?'
            }
          ]
        },
        { prompt: 'Where would intent trend highlights fit in that distinction?' },
        { prompt: 'Why would the prototype show some directional intent signal in Overview before a deeper analysis in Understand?' }
      ]
    },
    {
      id: 'S03',
      title: 'Operate versus Improve thread',
      turns: [
        { prompt: 'What is the difference between Operate and Improve?' },
        {
          branches: [
            {
              ifIncludes: ['flow'],
              prompt: 'Does that mean Operate is about current flow while Improve is about what should change next?'
            },
            {
              default: true,
              prompt: 'How should stakeholders tell live friction apart from change prioritisation?'
            }
          ]
        },
        { prompt: 'If response time is bad today, why would that show up differently in Operate than in Improve?' },
        { prompt: 'What would make a metric feel misplaced between those two sections?' }
      ]
    },
    {
      id: 'S04',
      title: 'Automate boundary thread',
      turns: [
        { prompt: 'Why does Automate exist as its own section?' },
        {
          branches: [
            {
              ifIncludes: ['without humans'],
              prompt: 'So is the main question there what runs without humans and how well it runs?'
            },
            {
              default: true,
              prompt: 'What specific decision context makes automation worth separating out?'
            }
          ]
        },
        { prompt: 'Why is deciding what to automate next not the core job of Automate?' },
        { prompt: 'Where should automation opportunities live if they are not primarily an Automate decision?' }
      ]
    },
    {
      id: 'S05',
      title: 'Widget rationale thread',
      turns: [
        { prompt: 'What decision is "Opportunities backlog" meant to support?' },
        {
          branches: [
            {
              ifIncludes: ['priorit'],
              prompt: 'Why does that make it an Improve widget instead of an Operate widget?'
            },
            {
              default: true,
              prompt: 'Why does that belong in Improve rather than in a live operations section?'
            }
          ]
        },
        { prompt: 'How is that different from simply showing a list of current problems?' },
        { prompt: 'Would it be fair to say this widget turns analytics into an action-prioritisation surface?' }
      ]
    },
    {
      id: 'S06',
      title: 'AI coverage and performance thread',
      turns: [
        { prompt: 'What is the conceptual difference between "AI Agent tickets" and "Resolution rate AI Agents"?' },
        {
          branches: [
            {
              ifIncludes: ['coverage'],
              prompt: 'So one is coverage and the other is effectiveness?'
            },
            {
              default: true,
              prompt: 'Is one measuring volume while the other measures quality of automation outcomes?'
            }
          ]
        },
        { prompt: 'Why are both still in Automate instead of splitting them across sections?' },
        { prompt: 'What kind of follow-up question should "Automation handoff reasons" answer after those two?' }
      ]
    },
    {
      id: 'S07',
      title: 'Role and use case thread',
      turns: [
        { prompt: 'Why does the settings popout use Role and Use Case toggles instead of separate support and sales dashboards?' },
        {
          branches: [
            {
              ifIncludes: ['shared'],
              prompt: 'So the structure stays shared while emphasis changes?'
            },
            {
              default: true,
              prompt: 'Is the key idea that the structure stays stable while the emphasis shifts?'
            }
          ]
        },
        { prompt: 'What changes conceptually when a stakeholder switches from Resolve to Convert?' },
        { prompt: 'Why is that treated as adaptation rather than a new information architecture?' }
      ]
    },
    {
      id: 'S08',
      title: 'Custom page thread',
      turns: [
        { prompt: 'Why does the prototype allow custom pages if the five-section structure is supposed to stay stable?' },
        {
          branches: [
            {
              ifIncludes: ['personal'],
              prompt: 'So the custom page is a personal assembly layer, not a replacement for the core model?'
            },
            {
              default: true,
              prompt: 'Does that mean custom pages are for convenience without redefining the model?'
            }
          ]
        },
        { prompt: 'Why can widgets from any section be mixed onto a custom page?' },
        { prompt: 'What keeps that flexibility from undermining the five-section logic?' }
      ]
    },
    {
      id: 'S09',
      title: 'Guide and walkthrough thread',
      turns: [
        { prompt: 'What is the Prototype Guide meant to do for stakeholders?' },
        {
          branches: [
            {
              ifIncludes: ['stakeholder'],
              prompt: 'Why is it framed for stakeholders rather than end users?'
            },
            {
              default: true,
              prompt: 'Why does the guide talk about users in third person instead of addressing the reader as the product user?'
            }
          ]
        },
        { prompt: 'What does the walkthrough cover that the guide does not guarantee proactively?' },
        { prompt: 'Why does the guide avoid speculating beyond the prototype?' }
      ]
    },
    {
      id: 'S10',
      title: 'Feedback logging thread',
      turns: [
        { prompt: 'If I give feedback about the prototype, what is the guide supposed to do?' },
        {
          branches: [
            {
              ifIncludes: ['feedback'],
              prompt: 'How does it decide whether feedback is structural or just detail-level polish?'
            },
            {
              default: true,
              prompt: 'How does the guide distinguish structural feedback from detail feedback?'
            }
          ]
        },
        { prompt: 'Why would the guide sometimes ask a clarifying question before logging feedback?' },
        { prompt: 'Why is logging feedback treated differently from normal Q&A?' }
      ]
    },
    {
      id: 'S11',
      title: 'External reporting continuity thread',
      turns: [
        { prompt: 'How is this concept different from the current Trengo Live Dashboard idea?' },
        {
          branches: [
            {
              ifIncludes: ['structure'],
              prompt: 'So is the main shift the organising structure rather than the existence of real-time metrics?'
            },
            {
              default: true,
              prompt: 'Is the difference more about organising logic than about deleting live operational metrics?'
            }
          ]
        },
        { prompt: 'Would ticket-detail deep dives still have a role in this model?' },
        { prompt: 'How should stakeholders think about CSV exports if the watchtower model becomes the main surface?' }
      ]
    },
    {
      id: 'S12',
      title: 'Voice signal thread',
      turns: [
        { prompt: 'Why are voice-specific widgets hidden unless the channel context makes them relevant?' },
        {
          branches: [
            {
              ifIncludes: ['relevant'],
              prompt: 'So the idea is to avoid polluting the shared structure with irrelevant noise?'
            },
            {
              default: true,
              prompt: 'Is the goal to preserve one structure while only surfacing voice signals when they matter?'
            }
          ]
        },
        { prompt: 'Why is "Voice channel performance" in Understand instead of Operate?' },
        { prompt: 'What makes a voice signal about composition versus immediate flow?' }
      ]
    },
    {
      id: 'S13',
      title: 'Intent and knowledge thread',
      turns: [
        { prompt: 'Why are intent clusters and unknown intents both important in this model?' },
        {
          branches: [
            {
              ifIncludes: ['incoming'],
              prompt: 'Does that mean one explains incoming demand while the other exposes gaps in classification?'
            },
            {
              default: true,
              prompt: 'Is one about the shape of demand and the other about limits in understanding it?'
            }
          ]
        },
        { prompt: 'How do those signals connect to knowledge gaps by intent in Improve?' },
        { prompt: 'Why is that chain useful for an AI-native analytics concept?' }
      ]
    },
    {
      id: 'S14',
      title: 'Reset and defaults thread',
      turns: [
        { prompt: 'What is Reset All supposed to restore in the prototype?' },
        {
          branches: [
            {
              ifIncludes: ['default'],
              prompt: 'Why is restoring the baseline useful during stakeholder review sessions?'
            },
            {
              default: true,
              prompt: 'Why does the prototype need a clean baseline reset for review sessions?'
            }
          ]
        },
        { prompt: 'Why is that reset conceptually broader than just resetting the sub-navigation?' }
      ]
    },
    {
      id: 'S15',
      title: 'Misplaced metric thread',
      turns: [
        { prompt: 'What is the cleanest rule for deciding where a metric belongs?' },
        {
          branches: [
            {
              ifIncludes: ['decision'],
              prompt: 'So the first test is the decision context rather than the metric type?'
            },
            {
              default: true,
              prompt: 'Is decision context more important than whether something is a KPI, chart, or table?'
            }
          ]
        },
        { prompt: 'Can the same metric legitimately appear in two sections if the decision context changes?' },
        { prompt: 'What would make that repetition feel unjustified?' }
      ]
    },
    {
      id: 'S16',
      title: 'Migration and parity thread',
      turns: [
        { prompt: 'Why does the concept insist on continuity with existing metrics before migration?' },
        {
          branches: [
            {
              ifIncludes: ['parity'],
              prompt: 'So stakeholders should not read this as permission to drop core operational metrics?'
            },
            {
              default: true,
              prompt: 'Does that mean the new structure still needs parity with critical operational reporting?'
            }
          ]
        },
        { prompt: 'How does that reduce risk when moving away from the current reporting model?' },
        { prompt: 'What changes first in a migration like this: the metrics, or the organising logic?' }
      ]
    },
    {
      id: 'S17',
      title: 'Detail feedback nudge thread',
      turns: [
        { prompt: 'The spacing in the settings popout feels off.' },
        {
          branches: [
            {
              ifIncludes: ['readability'],
              prompt: 'The real problem is readability. The controls do not scan clearly enough.'
            },
            {
              ifIncludes: ['clarity'],
              prompt: 'The real problem is clarity. The controls do not scan clearly enough.'
            },
            {
              default: true,
              prompt: 'The real problem is readability. The controls do not scan clearly enough.'
            }
          ]
        },
        { prompt: 'Yes, please log that concern.' }
      ]
    },
    {
      id: 'S18',
      title: 'Mixed question and feedback thread',
      turns: [
        { prompt: 'Why is Overview separate from Understand? Also, the tab labels feel a bit too abstract.' },
        {
          branches: [
            {
              ifIncludes: ['what feels wrong'],
              prompt: 'The concern is that a new stakeholder may not know where to click first.'
            },
            {
              ifIncludes: ['which section'],
              prompt: 'I mean the main sub-navigation labels. The concern is that a new stakeholder may not know where to click first.'
            },
            {
              default: true,
              prompt: 'The concern is that a new stakeholder may not know where to click first.'
            }
          ]
        },
        { prompt: 'Yes, log that.' }
      ]
    },
    {
      id: 'S19',
      title: 'Provisional detail question thread',
      turns: [
        { prompt: 'Why does the prototype currently show a funnel chart for sales pipeline?' },
        { prompt: 'Is that chart type meant to be final?' },
        { prompt: 'So should stakeholders focus more on the structural point than the exact visual treatment?' }
      ]
    },
    {
      id: 'S20',
      title: 'Out-of-scope fallback and recovery thread',
      turns: [
        { prompt: 'What is Trengo\'s roadmap for shipping this analytics model?' },
        { prompt: 'What can you say about what is already firm in the prototype today?' }
      ]
    },
    {
      id: 'S21',
      title: 'Unclear structural feedback clarification thread',
      turns: [
        { prompt: 'I don\'t think this works.' },
        {
          branches: [
            {
              ifIncludes: ['which section'],
              prompt: 'I mean the View / Edit mode control in the settings popout.'
            },
            {
              ifIncludes: ['what feels wrong'],
              prompt: 'It makes the prototype feel more like a sandbox than a stakeholder review.'
            },
            {
              default: true,
              prompt: 'I mean the View / Edit mode control in the settings popout.'
            }
          ]
        },
        {
          branches: [
            {
              ifIncludes: ['what feels wrong'],
              prompt: 'It makes the prototype feel more like a sandbox than a stakeholder review.'
            },
            {
              default: true,
              prompt: 'The issue is that it makes the prototype feel more like a sandbox than a stakeholder review.'
            }
          ]
        },
        { prompt: 'Yes, please log that.' }
      ]
    }
  ];
}

function evaluateResponse(cleanText) {
  const text = (cleanText || '').trim();
  const normalized = text.toLowerCase();
  const exactFallbacks = new Set([
    "sorry, i can't answer that — please ask rowan",
    "sorry, i can't answer that — please ask rowan."
  ]);
  return {
    empty: text.length === 0,
    fallback: exactFallbacks.has(normalized),
    tooLong: text.split(/\s+/).length > 120,
    hasQuestionBack: text.includes('?'),
    sentenceCount: text.split(/[.!?]+/).map(chunk => chunk.trim()).filter(Boolean).length
  };
}

function parseSentinels(text) {
  let clean = text || '';
  const feedbackMatches = [...clean.matchAll(/<<FEEDBACK:(\{[\s\S]*?\})>>/g)];
  const contextMatches = [...clean.matchAll(/<<CONTEXT:(\{[\s\S]*?\})>>/g)];
  const conflictMatches = [...clean.matchAll(/<<CONFLICT:(\{[\s\S]*?\})>>/g)];
  const sentinelPatterns = [/<<FEEDBACK:(\{[\s\S]*?\})>>/g, /<<CONTEXT:(\{[\s\S]*?\})>>/g, /<<CONFLICT:(\{[\s\S]*?\})>>/g];
  for (const pattern of sentinelPatterns) {
    clean = clean.replace(pattern, '').trim();
  }
  return {
    cleanText: clean,
    feedbackSentinelCount: feedbackMatches.length,
    contextSentinelCount: contextMatches.length,
    conflictSentinelCount: conflictMatches.length
  };
}

async function extractSystemPromptBase() {
  const source = await readFile(APP_JS_PATH, 'utf8');
  const match = source.match(/const SYSTEM_PROMPT_BASE = `([\s\S]*?)`;\n\n  \/\/ ── Element references/);
  if (!match) {
    throw new Error('Could not extract SYSTEM_PROMPT_BASE from app.js');
  }
  return match[1];
}

function buildSystemPrompt(basePrompt) {
  return basePrompt;
}

async function callGuide(basePrompt, messages) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: buildSystemPrompt(basePrompt),
      messages
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Guide proxy returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  const rawText = data?.content?.[0]?.text || '';
  const parsed = parseSentinels(rawText);
  return {
    rawText,
    cleanText: parsed.cleanText,
    sentinelCounts: {
      feedback: parsed.feedbackSentinelCount,
      context: parsed.contextSentinelCount,
      conflict: parsed.conflictSentinelCount
    },
    evaluation: evaluateResponse(parsed.cleanText)
  };
}

function buildArtifacts() {
  const singles = buildSingleQuestions();
  const sequences = buildSequences();
  const bank = {
    generatedAt: new Date().toISOString(),
    counts: {
      singleQuestions: singles.length,
      sequences: sequences.length,
      sequenceTurns: sequences.reduce((sum, sequence) => sum + sequence.turns.length, 0),
      totalPromptsRepresented: singles.length + sequences.reduce((sum, sequence) => sum + sequence.turns.length, 0)
    },
    externalReferences: EXTERNAL_REFERENCES,
    singles,
    sequences
  };
  return bank;
}

function renderQuestionBankMarkdown(bank) {
  const lines = [];
  lines.push('# Prototype Guide question bank');
  lines.push('');
  lines.push(`Generated at: ${bank.generatedAt}`);
  lines.push('');
  lines.push(`Single questions: ${bank.counts.singleQuestions}`);
  lines.push(`Sequences: ${bank.counts.sequences}`);
  lines.push(`Total prompts represented: ${bank.counts.totalPromptsRepresented}`);
  lines.push('');

  const groups = new Map();
  for (const single of bank.singles) {
    if (!groups.has(single.groupTitle)) groups.set(single.groupTitle, []);
    groups.get(single.groupTitle).push(single);
  }

  for (const [groupTitle, questions] of groups.entries()) {
    lines.push(`## ${groupTitle}`);
    lines.push('');
    for (const question of questions) {
      lines.push(`${question.id}. ${question.text}`);
    }
    lines.push('');
  }

  lines.push('## Follow-up sequences');
  lines.push('');
  for (const sequence of bank.sequences) {
    lines.push(`### ${sequence.id} - ${sequence.title}`);
    lines.push('');
    sequence.turns.forEach((turn, index) => {
      if (turn.prompt) {
        lines.push(`${index + 1}. ${turn.prompt}`);
      } else {
        const prompts = (turn.branches || []).map(branch => branch.prompt);
        lines.push(`${index + 1}. Branching follow-up options: ${prompts.join(' | ')}`);
      }
    });
    lines.push('');
  }

  return lines.join('\n');
}

function renderReferencesMarkdown() {
  const lines = [];
  lines.push('# External references used for question design');
  lines.push('');
  for (const reference of EXTERNAL_REFERENCES) {
    lines.push(`- ${reference.title}`);
    lines.push(`  URL: ${reference.url}`);
    lines.push(`  Use: ${reference.note}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function writeQuestionArtifacts(bank) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, 'question-bank.json'),
    JSON.stringify(bank, null, 2) + '\n',
    'utf8'
  );
  await writeFile(
    path.join(OUTPUT_DIR, 'question-bank.md'),
    renderQuestionBankMarkdown(bank) + '\n',
    'utf8'
  );
  await writeFile(
    path.join(OUTPUT_DIR, 'external-references.md'),
    renderReferencesMarkdown() + '\n',
    'utf8'
  );
}

function getTestSingles(bank) {
  const selectedPrompts = [
    'Why does this analytics model start from questions instead of dashboards?',
    'What makes this model more future-proof than a ticket-based structure?',
    'What stays the same from traditional reporting, and what changes?',
    'How should stakeholders describe Overview in one sentence?',
    'What decision context defines Operate?',
    'How should stakeholders explain the difference between Operate and Improve?',
    'What decision is "Intent trend highlights" meant to support?',
    'What decision is "Bottlenecks" meant to support?',
    'If "Resolution rate AI Agents" changes suddenly, what kind of follow-up question should it trigger?',
    'Why is "Sales pipeline funnel" shown in Understand instead of another section?',
    'What does the channel filter help users understand in this concept?',
    'How do filters differ from structural lenses in this model?',
    'Why do some widgets include drill links to other sections?',
    'Why are users allowed to rename custom pages but not the five core sections?',
    'How should the guide handle a message that includes both a question and feedback?',
    'What should the guide do if feedback is about spacing or button polish rather than the model itself?',
    'If a stakeholder says "make this a bar chart", what should the guide try to understand before logging it?',
    'What makes feedback clear enough to log without asking a clarifying question first?',
    'If a user says only "this feels off", what should the guide do next?',
    'How should the guide answer a question about a non-final UI detail in the prototype?',
    'If someone asks whether a chart type in the prototype is final, how should the guide frame the answer?',
    'How should the guide respond if someone asks about Trengo\'s roadmap for this analytics model?',
    'How should the guide respond if someone asks what feedback has been collected without using the word Helion?',
    'Why should the guide prefer logging the underlying concern instead of only the proposed cosmetic fix?'
  ];
  const fixedSelection = bank.singles.filter(item => selectedPrompts.includes(item.text));
  if (fixedSelection.length !== selectedPrompts.length) {
    throw new Error('Test singles selection is out of sync with generated IDs.');
  }
  const brevitySelection = bank.singles.filter(item => item.groupId === 'brevity-structure');
  return fixedSelection.concat(brevitySelection);
}

async function runSingleTests(basePrompt, bank) {
  const singles = getTestSingles(bank);
  const results = [];
  for (const single of singles) {
    const messages = [{ role: 'user', content: single.text }];
    const reply = await callGuide(basePrompt, messages);
    results.push({
      id: single.id,
      category: single.groupTitle,
      prompt: single.text,
      assistant: reply.cleanText,
      rawAssistant: reply.rawText,
      sentinelCounts: reply.sentinelCounts,
      evaluation: reply.evaluation
    });
    await sleep(250);
  }
  return results;
}

async function runSequenceTests(basePrompt, bank) {
  const results = [];
  for (const sequence of bank.sequences) {
    const messages = [];
    const turns = [];
    let lastAssistant = '';

    for (let index = 0; index < sequence.turns.length; index += 1) {
      const turn = sequence.turns[index];
      let prompt = turn.prompt || branchByKeywords(lastAssistant, turn.branches, turn.fallbackPrompt);

      if (!prompt) {
        prompt = 'Can you explain that a bit more simply?';
      }

      if (index > 0 && /sorry, i can't answer that|please ask rowan/i.test(lastAssistant)) {
        prompt = turn.fallbackPrompt || 'Can you answer that using only the prototype concept and section logic?';
      }

      messages.push({ role: 'user', content: prompt });
      const reply = await callGuide(basePrompt, messages);
      messages.push({ role: 'assistant', content: reply.rawText });
      lastAssistant = reply.cleanText;

      turns.push({
        turn: index + 1,
        prompt,
        assistant: reply.cleanText,
        rawAssistant: reply.rawText,
        sentinelCounts: reply.sentinelCounts,
        evaluation: reply.evaluation
      });

      await sleep(250);
    }

    results.push({
      id: sequence.id,
      title: sequence.title,
      turns
    });
  }
  return results;
}

function renderResultsMarkdown(resultBundle) {
  const lines = [];
  lines.push('# Prototype Guide test run');
  lines.push('');
  lines.push(`Started: ${resultBundle.startedAt}`);
  lines.push(`Completed: ${resultBundle.completedAt}`);
  lines.push('');
  lines.push(`Single-thread tests: ${resultBundle.singleTests.length}`);
  lines.push(`Sequence-thread tests: ${resultBundle.sequenceTests.length}`);
  lines.push('');

  lines.push('## Single-thread tests');
  lines.push('');
  for (const test of resultBundle.singleTests) {
    lines.push(`### ${test.id} - ${test.category}`);
    lines.push('');
    lines.push(`Prompt: ${test.prompt}`);
    lines.push('');
    lines.push(`Response: ${test.assistant}`);
    lines.push('');
    lines.push(`Evaluation: fallback=${test.evaluation.fallback}, empty=${test.evaluation.empty}, tooLong=${test.evaluation.tooLong}, questionBack=${test.evaluation.hasQuestionBack}, sentences=${test.evaluation.sentenceCount}`);
    lines.push('');
  }

  lines.push('## Sequence-thread tests');
  lines.push('');
  for (const sequence of resultBundle.sequenceTests) {
    lines.push(`### ${sequence.id} - ${sequence.title}`);
    lines.push('');
    for (const turn of sequence.turns) {
      lines.push(`Turn ${turn.turn} prompt: ${turn.prompt}`);
      lines.push('');
      lines.push(`Turn ${turn.turn} response: ${turn.assistant}`);
      lines.push('');
      lines.push(`Turn ${turn.turn} evaluation: fallback=${turn.evaluation.fallback}, empty=${turn.evaluation.empty}, tooLong=${turn.evaluation.tooLong}, questionBack=${turn.evaluation.hasQuestionBack}, sentences=${turn.evaluation.sentenceCount}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

async function writeResults(resultBundle) {
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = resultBundle.completedAt.replace(/[:.]/g, '-');
  await writeFile(
    path.join(RESULTS_DIR, `guide-test-run-${stamp}.json`),
    JSON.stringify(resultBundle, null, 2) + '\n',
    'utf8'
  );
  await writeFile(
    path.join(RESULTS_DIR, `guide-test-run-${stamp}.md`),
    renderResultsMarkdown(resultBundle) + '\n',
    'utf8'
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateCommand() {
  const bank = buildArtifacts();
  await writeQuestionArtifacts(bank);
  console.log(`Generated question bank with ${bank.counts.singleQuestions} single questions and ${bank.counts.sequences} sequences.`);
}

async function testCommand() {
  const startedAt = new Date().toISOString();
  const bank = buildArtifacts();
  await writeQuestionArtifacts(bank);
  const basePrompt = await extractSystemPromptBase();
  const singleTests = await runSingleTests(basePrompt, bank);
  const sequenceTests = await runSequenceTests(basePrompt, bank);
  const resultBundle = {
    startedAt,
    completedAt: new Date().toISOString(),
    proxyUrl: PROXY_URL,
    corpusSnapshot: {
      singleQuestions: bank.counts.singleQuestions,
      sequences: bank.counts.sequences
    },
    singleTests,
    sequenceTests
  };
  await writeResults(resultBundle);
  console.log(`Completed guide tests: ${singleTests.length} singles, ${sequenceTests.length} sequences.`);
}

async function main() {
  const command = process.argv[2] || 'generate';
  if (command === 'generate') {
    await generateCommand();
    return;
  }
  if (command === 'test') {
    await testCommand();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
