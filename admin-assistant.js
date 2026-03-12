/* ============================================================
   TRENGO ANALYTICS — AI Onboarding Agent & Admin Assistant
   ============================================================
   Owns: meta-start UI, onboarding chat + preview, agentic loop,
   tool handlers, post-onboarding FAB + assistant panel.

   Depends on:
   - assistant-storage.js (AssistantStorage)
   - widget-catalog.js (WIDGETS, DEFAULT_TABS, TEAMS_DATA, WIDGET_BY_ID)
   - dashboard-config.js (DashboardConfig)
   - app.js globals (state, renderTabs, renderSections, remountSection,
                      syncLensButtons, resetViewState, initTabWidgets,
                      scrollToSection, setFeatureFlag, applyTeamSettingsFlag)
   ============================================================ */

const AdminAssistant = (() => {
  // ── Constants ──────────────────────────────────────────────
  const PROXY_URL = 'https://trengo-chatbot-proxy.analytics-chatbot.workers.dev';
  const MAX_LOOP_ITERATIONS = 10;
  const AI_SETUP_MODE_KEY = 'trengo_ai_setup_mode'; // 'onboarding' | 'assistant' | null

  // ── Internal state ─────────────────────────────────────────
  let _session = null;        // AssistantStorage session object
  let _customerData = null;   // loaded mock customer data
  let _customerId = null;
  let _role = null;           // 'admin' | 'supervisor' | 'agent'
  let _loopRunning = false;
  let _pendingResolve = null; // for blocking UI tools (show_options, show_source_input, etc)
  let _queuedUserMessage = null;

  // ── Tool definitions for Anthropic API ─────────────────────
  const ALL_TOOLS = [
    {
      name: 'set_lens',
      description: 'Set the global analytics lens (support or sales). Auto-applied immediately.',
      input_schema: {
        type: 'object',
        properties: { lens: { type: 'string', enum: ['support', 'sales'] } },
        required: ['lens']
      }
    },
    {
      name: 'set_role',
      description: 'Set the active role for the dashboard preview (supervisor or agent).',
      input_schema: {
        type: 'object',
        properties: { role: { type: 'string', enum: ['supervisor', 'agent'] } },
        required: ['role']
      }
    },
    {
      name: 'set_team_usecases',
      description: 'Configure per-team focus — assign support, sales, or both to each team. Auto-applied where compatible with the preview.',
      input_schema: {
        type: 'object',
        properties: {
          assignments: {
            type: 'object',
            description: 'Object mapping team name to "support", "sales", "both", "convert", or "resolve"',
            additionalProperties: { type: 'string', enum: ['support', 'sales', 'both', 'convert', 'resolve'] }
          }
        },
        required: ['assignments']
      }
    },
    {
      name: 'configure_tabs',
      description: 'Apply the visible dashboard tab structure. Labels, order, and custom tabs can change, but the underlying core section identities still stay tied to their existing IDs. Only call this after the user has directly edited tabs or has accepted an AI-originated proposal.',
      input_schema: {
        type: 'object',
        properties: {
          tabs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                category: { type: 'string' }
              },
              required: ['id', 'label']
            }
          }
        },
        required: ['tabs']
      }
    },
    {
      name: 'set_widget_visibility',
      description: 'Show or hide specific widgets by their IDs. Auto-applied unless you have low confidence (then propose first).',
      input_schema: {
        type: 'object',
        properties: {
          show: { type: 'array', items: { type: 'string' }, description: 'Widget IDs to show' },
          hide: { type: 'array', items: { type: 'string' }, description: 'Widget IDs to hide' }
        }
      }
    },
    {
      name: 'save_customer_profile',
      description: 'Save or update company metadata (company name, industry, goals, terminology, team names).',
      input_schema: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          industry: { type: 'string' },
          goals: { type: 'array', items: { type: 'string' } },
          terminology: { type: 'object', description: 'Custom terminology mappings, e.g. {"customer": "patient", "ticket": "case"}' },
          teamNames: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'show_options',
      description: 'Display clickable option cards, chips, or a list to the user. Use when clicking is faster than typing. Single-select choices resolve immediately on click. Multi-select should only be used when the user genuinely needs to choose several items.',
      input_schema: {
        type: 'object',
        properties: {
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                description: { type: 'string' },
                icon: { type: 'string' }
              },
              required: ['id', 'label']
            }
          },
          multiSelect: { type: 'boolean', description: 'Allow multiple selections (default: false)' },
          style: { type: 'string', enum: ['cards', 'chips', 'list'], description: 'Display style (default: cards)' }
        },
        required: ['options']
      }
    },
    {
      name: 'show_boolean_choice',
      description: 'Display a yes/no choice. Use this for yes/no questions instead of plain text or generic options.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          yesLabel: { type: 'string' },
          noLabel: { type: 'string' }
        },
        required: ['prompt']
      }
    },
    {
      name: 'show_team_assignment_matrix',
      description: 'Display one row per team with Support, Sales, and Both choices. Use this when the user needs to classify teams without typing.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          teams: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['prompt']
      }
    },
    {
      name: 'show_tab_editor',
      description: 'Open the inline tab editor so the user can rename, reorder, add, and remove tabs directly in one place. Use this instead of asking conversational rename/reorder questions.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          tabs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                category: { type: 'string' }
              },
              required: ['id', 'label']
            }
          }
        },
        required: ['prompt']
      }
    },
    {
      name: 'show_tab_proposal_choice',
      description: 'Present a proposed tab structure and let the user either accept the proposal, refine it further, or keep the defaults. Use this instead of asking whether they want to edit tabs.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          tabs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                category: { type: 'string' }
              },
              required: ['id', 'label']
            }
          }
        },
        required: ['prompt', 'tabs']
      }
    },
    {
      name: 'show_source_input',
      description: 'Show a source input UI so the user can provide a file, URL, or pasted text for analysis. The conversation pauses until the user submits.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Instruction text shown above the input' },
          allowedTypes: {
            type: 'array',
            items: { type: 'string', enum: ['file', 'url', 'paste'] },
            description: 'Which input types to show (default: all three)'
          }
        },
        required: ['prompt']
      }
    },
    {
      name: 'complete_onboarding',
      description: 'Signal that onboarding is complete. Transitions to admin assistant mode. Call this when the user seems satisfied or says they are done.',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of what was configured' }
        }
      }
    }
  ];

  // ── Role → tool scoping ────────────────────────────────────
  const ROLE_TOOLS = {
    admin: ALL_TOOLS.map(t => t.name),
    supervisor: ['set_lens', 'set_team_usecases', 'set_widget_visibility', 'show_options', 'show_boolean_choice', 'show_team_assignment_matrix', 'show_tab_editor', 'show_tab_proposal_choice', 'show_source_input', 'complete_onboarding'],
    agent: ['set_widget_visibility', 'show_options', 'show_boolean_choice', 'show_source_input', 'complete_onboarding'],
  };

  function getToolsForRole(role, mode) {
    const allowed = new Set(ROLE_TOOLS[role] || ROLE_TOOLS.admin);
    if (mode === 'assistant') allowed.delete('complete_onboarding');
    return ALL_TOOLS.filter(t => allowed.has(t.name));
  }

  // ── System prompt builder ──────────────────────────────────
  function buildSystemPrompt() {
    const mode = AssistantStorage.getMode(_session) || 'onboarding';
    const role = _role || 'admin';

    // Build widget catalog summary
    const widgetSummary = Object.entries(WIDGETS).map(([section, widgets]) => {
      const list = widgets.map(w => `  - ${w.id}: "${w.title}" (${w.type})`).join('\n');
      return `### ${section}\n${list}`;
    }).join('\n\n');

    // Current config snapshot
    const currentConfig = {
      lens: state.lens,
      role: state.role,
      tabs: state.tabs.map(t => ({ id: t.id, label: t.label })),
      teamUsecases: state.teamUsecases || {},
      hiddenWidgets: [...(state.hiddenWidgets || [])],
      addedWidgets: [...(state.addedWidgets || [])],
    };

    // Available teams
    const availableTeams = typeof window.getPrototypeTeams === 'function'
      ? window.getPrototypeTeams()
      : TEAMS_DATA;
    const teamsInfo = availableTeams.map(t =>
      `- ${t.name} (${(t.members || []).length} members${(t.members || []).length ? `: ${(t.members || []).join(', ')}` : ''})`
    ).join('\n');

    // Structured context from memory
    const memoryContext = AssistantStorage.buildPromptContext(_session);

    // Source texts
    const sourceTexts = AssistantStorage.getSourceTexts(_session);

    // Customer profile (pre-existing mock data)
    const customerInfo = _customerData
      ? JSON.stringify(_customerData, null, 2)
      : 'No pre-existing customer data available.';

    let prompt = `You configure Trengo Analytics dashboards through conversation.
Mode: ${mode.toUpperCase()} | Role: ${role}

PRIMARY GOAL
- Understand the customer well enough to make strong configuration decisions with minimal effort from the user.
- The target outcome is a good dashboard proposal, not a long interview.

CONVERSATION STYLE
- Default to 1-2 sentences. 3 is acceptable when needed for clarity. Do not become terse at the cost of poor decisions.
- Ask at most ONE question per turn.
- Sound natural, compact, and conversational. No filler, hype, or repetitive acknowledgements.
- Do not repeat facts the user already confirmed or that are already clear from customer data or source material.
- Do not explain visible preview changes unless the user asks.

DECISION POLICY
- Infer where reasonable. Ask only when the missing information would materially change the tab structure, team focus, terminology, or starting widget choices.
- If confidence is high enough to make a strong draft, propose instead of continuing to question the user.
- If confidence is too low for a good decision, briefly say what is still unclear and ask the single highest-leverage clarification question.
- Short clarification exchanges are good when needed. Do not be rigid, but do not drift into open-ended chatting.
- Prefer understanding the underlying goal or decision need over collecting lots of surface preferences.
- If the user suggests a solution-detail directly, understand the underlying need when that would improve the decision, but do not become argumentative or pushy.
- If the user skips something, preserve progress and continue with defaults or the best available assumption.

HOW TO GATHER CONTEXT
- Prioritize information that improves decisions: company/product, teams, team goals, terminology, audience, important outcomes to monitor or improve, and source material.
- Use customer data and source material before asking the user to restate known facts.
- Use source material to form hypotheses about likely team structure, terminology, and relevant analytics priorities.
- Adapt each next question to what is still missing. Do not follow a fixed questionnaire.
- Avoid handing blank configuration work to the user if you can infer a strong first proposal.
- When customer data already contains relevant context for a UI block, surface it visibly in that block and let the user edit, remove, or add to it instead of hiding it in the background.

TOOL CHOICE
- Use show_boolean_choice for yes/no questions.
- Use show_options for simple single-choice or short multi-select decisions.
- Use show_team_assignment_matrix when the user needs to classify teams as support, sales, or both.
- Use show_tab_editor when direct editing is faster than conversational back-and-forth.
- Use show_tab_proposal_choice when presenting a tab proposal. The choices should be: accept proposals, refine further, or keep defaults.
- Use show_source_input when source material would help and the user has not already provided enough.

USER VS AI CHANGES
- Treat direct user edits in the UI as final unless there is a high-confidence typo suspicion.
- Ask for confirmation only when the AI is the source of a proposed change.
- When the user has already changed something directly in the UI, apply that as their decision.

APPLY VS PROPOSE
- Propose tab structure changes before AI-driven application.
- Propose low-confidence or weakly informed changes first.
- High-confidence, low-risk changes can be auto-applied.

SCOPE (${role})
${role === 'admin' ? 'Full access: lens, tabs (rename/reorder/add/remove), widget visibility, team usecases, company profile.' :
  role === 'supervisor' ? 'Team usecases (own team), widget visibility, lens.' :
  'Widget visibility for personal view only.'}

TEAMS
${teamsInfo}

WIDGETS
${widgetSummary}

CURRENT CONFIG
${JSON.stringify(currentConfig, null, 2)}

CUSTOMER DATA
${customerInfo}

${memoryContext ? `COLLECTED SO FAR\n${memoryContext}` : ''}
${sourceTexts ? `SOURCE MATERIAL\n${sourceTexts}` : ''}`;

    if (mode === 'onboarding') {
      prompt += `

ONBOARDING
- Open by using known customer context and gathering source context early.
- If a website, help center, or known source already exists, mention it briefly and use show_source_input early so the user can add URL, file, and pasted context without friction.
- In the opening phase, focus on enough understanding to make a draft, not on collecting every possible preference.
- Ask follow-up questions only when they materially improve the likely tab proposal, team setup, terminology, or starter widget set.
- Your goal is to collect enough context to propose an initial dashboard draft, including tab names/order/number and a sensible starting widget set.
- Once you have enough for a credible draft, move to the proposal. Do not continue questioning just because more detail could be gathered.
- Do not ask the user to invent tab names, tab order, or starter widgets from scratch if you can infer a strong first proposal.
- When team classification is needed, prefer show_team_assignment_matrix over generic cards.
- When you have a concrete tab proposal, present it with show_tab_proposal_choice.
- If the user accepts a tab proposal, apply it and do not open the editor.
- If the user wants to refine a tab proposal, refine it through show_tab_editor with the proposal already filled in.
- If the user keeps the defaults, respect that and move on.
- No minimum completion is required. Defaults are valid. Preserve partial progress on skip.
- Call complete_onboarding when the user is satisfied, wants to stop, or has enough configured for now.`;
    } else {
      prompt += `

ASSISTANT MODE
- User finished (or skipped) onboarding. Help with changes, not re-onboarding.
- Do not ask setup questions unprompted.
- Respond to the request first. Ask clarifying questions only when necessary to avoid a weak or incorrect change.
- Still use clickable/editor UI tools when they are easier than making the user type several words or manually describe a structure.
- Prefer show_boolean_choice, show_options, show_team_assignment_matrix, show_tab_proposal_choice, show_tab_editor, and show_source_input when they make configuration faster.
- Keep the same user-made-vs-AI-made confirmation rule in this mode.`;
    }

    return prompt;
  }

  // ═══════════════════════════════════════════════════════════
  //  TOOL HANDLERS
  // ═══════════════════════════════════════════════════════════

  async function handleToolUse(toolName, toolInput) {
    switch (toolName) {
      case 'set_lens':
        return handleSetLens(toolInput);
      case 'set_role':
        return handleSetRole(toolInput);
      case 'set_team_usecases':
        return handleSetTeamUsecases(toolInput);
      case 'configure_tabs':
        return handleConfigureTabs(toolInput);
      case 'set_widget_visibility':
        return handleSetWidgetVisibility(toolInput);
      case 'save_customer_profile':
        return handleSaveCustomerProfile(toolInput);
      case 'show_options':
        return handleShowOptions(toolInput);
      case 'show_boolean_choice':
        return handleShowBooleanChoice(toolInput);
      case 'show_team_assignment_matrix':
        return handleShowTeamAssignmentMatrix(toolInput);
      case 'show_tab_editor':
        return handleShowTabEditor(toolInput);
      case 'show_tab_proposal_choice':
        return handleShowTabProposalChoice(toolInput);
      case 'show_source_input':
        return handleShowSourceInput(toolInput);
      case 'complete_onboarding':
        return handleCompleteOnboarding(toolInput);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  function getKnownTeamNames() {
    const savedNames = _session?.structured?.confirmedFacts?.teamNames;
    if (Array.isArray(savedNames) && savedNames.length > 0) {
      return savedNames;
    }
    const liveTeams = typeof window.getPrototypeTeams === 'function'
      ? window.getPrototypeTeams().map(team => team.name)
      : [];
    if (_customerData?.knownTeams?.length) {
      return _customerData.knownTeams.map(team => team.name);
    }
    if (liveTeams.length > 0) return liveTeams;
    return TEAMS_DATA.map(team => team.name);
  }

  function getTeamAssignmentSuggestion(teamName) {
    const existing = _session?.structured?.teamAssignments?.[teamName];
    if (existing) return existing;

    const known = _customerData?.knownTeams?.find(team =>
      team.name?.toLowerCase() === teamName?.toLowerCase()
    );
    if (known?.likelyFocus === 'resolve') return 'support';
    if (known?.likelyFocus === 'convert') return 'sales';
    if (known?.likelyFocus === 'both') return 'both';

    const name = (teamName || '').toLowerCase();
    const supportKeywords = ['support', 'care', 'service', 'success', 'retention', 'onboarding', 'help', 'customer'];
    const salesKeywords = ['sales', 'growth', 'revenue', 'commercial', 'partnership', 'business development', 'expansion', 'acquisition', 'pipeline', 'social'];
    const supportMatch = supportKeywords.some(keyword => name.includes(keyword));
    const salesMatch = salesKeywords.some(keyword => name.includes(keyword));

    if (supportMatch && salesMatch) return 'both';
    if (supportMatch) return 'support';
    if (salesMatch) return 'sales';
    return null;
  }

  function buildInlineDraftId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function buildInitialTeamDraft(teams) {
    const names = Array.isArray(teams) && teams.length ? teams : getKnownTeamNames();
    return names.map((teamName) => ({
      id: buildInlineDraftId('team'),
      name: teamName,
      usecase: getTeamAssignmentSuggestion(teamName) || '',
    }));
  }

  function buildSourceUrlDraft() {
    const dedupe = new Set();
    const rows = [];
    const addRow = (url, sourceLabel) => {
      const value = String(url || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (dedupe.has(key)) return;
      dedupe.add(key);
      rows.push({
        id: buildInlineDraftId('source-url'),
        url: value,
        sourceLabel,
      });
    };

    (_session?.structured?.analyzedSources || []).forEach((source) => {
      if (source?.url) addRow(source.url, 'Already added');
    });

    if (_customerData?.website) addRow(_customerData.website, 'Website');
    if (_customerData?.helpCenterUrl) addRow(_customerData.helpCenterUrl, 'Help center');
    if (Array.isArray(_customerData?.extraSourceUrls)) {
      _customerData.extraSourceUrls.forEach((url) => addRow(url, 'Source URL'));
    }

    return rows.length ? rows : [{
      id: buildInlineDraftId('source-url'),
      url: '',
      sourceLabel: '',
    }];
  }

  function buildInitialSourceContextText() {
    const existingPaste = (_session?.structured?.analyzedSources || []).find((source) => source?.source === 'paste' && source?.extractedText);
    if (existingPaste?.extractedText) {
      return existingPaste.extractedText.substring(0, 4000);
    }

    if (!_customerData) return '';

    const sections = [];
    if (_customerData.productSummary) {
      sections.push(`Product or service summary:\n${_customerData.productSummary}`);
    }
    if (_customerData.suggestedPreviewContext) {
      sections.push(`Suggested preview context:\n${_customerData.suggestedPreviewContext}`);
    }
    if (_customerData.generalNotes) {
      sections.push(`General information:\n${_customerData.generalNotes}`);
    }

    if (_customerData.terminologyHints && Object.keys(_customerData.terminologyHints).length > 0) {
      const terms = Object.entries(_customerData.terminologyHints)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      sections.push(`Terminology hints:\n${terms}`);
    }

    const currentSetupLines = [];
    if (_customerData?.currentSetup?.primaryUseCase) {
      currentSetupLines.push(`Primary use case: ${_customerData.currentSetup.primaryUseCase}`);
    }
    if (Array.isArray(_customerData?.channels) && _customerData.channels.length) {
      currentSetupLines.push(`Channels in use: ${_customerData.channels.join(', ')}`);
    }
    if (Array.isArray(_customerData?.currentSetup?.topPainPoints) && _customerData.currentSetup.topPainPoints.length) {
      currentSetupLines.push(`Top pain points: ${_customerData.currentSetup.topPainPoints.join('; ')}`);
    }
    if (currentSetupLines.length) {
      sections.push(`Current setup context:\n${currentSetupLines.join('\n')}`);
    }

    return sections.join('\n\n').trim();
  }

  function getCurrentTabDraft() {
    return state.tabs.map(tab => ({
      id: tab.id,
      label: tab.label,
      category: tab.category || null,
      isDefault: DEFAULT_TABS.some(dt => dt.id === tab.id),
    }));
  }

  function getPreviewDraftTabs() {
    const pendingDraft = _session?.structured?.pendingTabDraft;
    if (Array.isArray(pendingDraft) && pendingDraft.length > 0) {
      return buildTabDraftForApply(pendingDraft);
    }
    const suggestedDraft = _session?.structured?.suggestedConfigDraft?.tabs;
    if (Array.isArray(suggestedDraft) && suggestedDraft.length > 0) {
      return buildTabDraftForApply(suggestedDraft);
    }
    if ((AssistantStorage.getMode(_session) || 'onboarding') === 'assistant') {
      return getCurrentTabDraft();
    }
    return [];
  }

  function syncPreviewLayout(previewTabs) {
    const split = document.getElementById('ai-setup-split');
    if (!split) return;
    split.classList.toggle('preview-ready', Array.isArray(previewTabs) && previewTabs.length > 0);
  }

  function buildPreviewWidgetMap(tabs) {
    const map = {};
    (tabs || []).forEach(tab => {
      const explicitIds = state.tabWidgets && state.tabWidgets[tab.id]
        ? [...state.tabWidgets[tab.id]]
        : null;
      const ids = explicitIds && explicitIds.length > 0
        ? explicitIds
        : (WIDGETS[tab.id] || []).map(widget => widget.id);
      const visibleIds = ids
        .map(id => WIDGET_BY_ID[id])
        .filter(Boolean)
        .filter(widget => getEffectiveVisibilityForPreview(widget) === 'show')
        .slice(0, 3)
        .map(widget => widget.id);
      if (visibleIds.length > 0) {
        map[tab.id] = visibleIds;
      }
    });
    return map;
  }

  function updateSuggestedWidgetPreview(tabs) {
    const previewTabs = Array.isArray(tabs) && tabs.length > 0 ? buildTabDraftForApply(tabs) : getPreviewDraftTabs();
    if (previewTabs.length === 0) return;
    const currentDraft = _session?.structured?.suggestedConfigDraft || {};
    AssistantStorage.setSuggestedConfigDraft(_session, {
      ...currentDraft,
      tabs: currentDraft.tabs || previewTabs,
      widgetIdsByTab: buildPreviewWidgetMap(previewTabs),
    });
    AssistantStorage.save(_session);
  }

  function buildUniqueTabId(label, existingIds) {
    const base = (label || 'custom tab')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'custom-tab';
    let candidate = `custom-${base}`;
    let suffix = 2;
    while (existingIds.has(candidate)) {
      candidate = `custom-${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function buildTabDraftForApply(tabs) {
    return (tabs || []).map(tab => ({
      id: tab.id,
      label: tab.label,
      category: tab.category || null,
      isDefault: DEFAULT_TABS.some(dt => dt.id === tab.id),
    }));
  }

  function commitTabDraft(tabs, options = {}) {
    const draft = buildTabDraftForApply(tabs);
    state.tabs = draft.map(tab => ({
      id: tab.id,
      label: tab.label,
      category: tab.category || null,
      isDefault: tab.isDefault,
    }));

    if (!state.tabWidgets) state.tabWidgets = {};
    state.tabs.forEach(tab => {
      if (!state.tabWidgets[tab.id]) {
        state.tabWidgets[tab.id] = new Set();
      }
    });
    Object.keys(state.tabWidgets).forEach(tabId => {
      if (!state.tabs.some(tab => tab.id === tabId)) {
        delete state.tabWidgets[tabId];
      }
    });
    if (state.sectionOrder) {
      Object.keys(state.sectionOrder).forEach(tabId => {
        if (!state.tabs.some(tab => tab.id === tabId)) {
          delete state.sectionOrder[tabId];
        }
      });
    }

    renderTabs();
    renderSections();
    if (state.tabs.length > 0) {
      scrollToSection(state.tabs[0].id || 'overview', true);
    }
    DashboardConfig.notifyChanged();

    const existingDraft = _session?.structured?.suggestedConfigDraft || {};
    if (options.source) {
      AssistantStorage.setPendingProposalSource(_session, options.source);
    }
    AssistantStorage.setPendingTabDraft(_session, null);
    AssistantStorage.setSuggestedConfigDraft(_session, {
      ...existingDraft,
      tabs: draft,
      widgetIdsByTab: existingDraft.widgetIdsByTab || {},
    });
    AssistantStorage.save(_session);
    renderPreview();

    if (options.showMessage !== false) {
      showConfigChange(options.message || 'Tabs updated');
    }

    return draft;
  }

  function applyTabDraftToPreview(tabs) {
    const draft = buildTabDraftForApply(tabs);
    const currentDraft = _session?.structured?.suggestedConfigDraft || {};
    AssistantStorage.setPendingTabDraft(_session, draft);
    AssistantStorage.setSuggestedConfigDraft(_session, {
      ...currentDraft,
      tabs: draft,
      widgetIdsByTab: currentDraft.widgetIdsByTab || {},
    });
    AssistantStorage.save(_session);
    renderPreview();
  }

  function normalizeTeamAssignment(value) {
    if (value === 'resolve' || value === 'support') return 'support';
    if (value === 'convert' || value === 'sales') return 'sales';
    if (value === 'both') return 'both';
    return null;
  }

  function looksLikeTypo(label) {
    const trimmed = (label || '').trim();
    if (!trimmed) return false;
    if (/\s{2,}/.test(trimmed)) return true;
    if (/(.)\1\1/.test(trimmed)) return true;
    if (/^[^aeiouAEIOU\s]{5,}$/.test(trimmed)) return true;
    if (/^[^a-zA-Z0-9]+$/.test(trimmed)) return true;
    return false;
  }

  function handleSetLens({ lens }) {
    state.lens = lens;
    syncLensButtons();
    [...state.loadedSections].forEach(s => remountSection(s));
    DashboardConfig.notifyChanged();
    AssistantStorage.updateFacts(_session, { lens });
    renderPreview();
    showConfigChange(`Lens set to ${lens}`);
    return { success: true, lens };
  }

  function handleSetRole({ role }) {
    state.personaRole = role;
    state.role = role;
    document.body.dataset.role = role;
    document.querySelectorAll('#role-toggle .role-preview-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === (state.personaRole || role));
    });
    [...state.loadedSections].forEach(s => remountSection(s));
    DashboardConfig.notifyChanged();
    renderPreview();
    updatePreviewRoleBadge();
    showConfigChange(`Role set to ${role}`);
    return { success: true, role };
  }

  function handleSetTeamUsecases({ assignments }, options = {}) {
    if (!state.teamUsecases) state.teamUsecases = {};
    const storedAssignments = {};
    const previewAssignments = {};

    Object.entries(assignments || {}).forEach(([team, value]) => {
      const normalized = normalizeTeamAssignment(value);
      if (!normalized) return;
      storedAssignments[team] = normalized;
      if (normalized === 'support') previewAssignments[team] = 'resolve';
      if (normalized === 'sales') previewAssignments[team] = 'convert';
      if (normalized === 'both') previewAssignments[team] = 'both';
    });

    Object.assign(state.teamUsecases, previewAssignments);
    if (Array.isArray(state.teams) && state.teams.length > 0) {
      state.teams = state.teams.map(team => (
        previewAssignments[team.name]
          ? { ...team, usecase: previewAssignments[team.name] }
          : team
      ));
      if (typeof window.persistPrototypeTeams === 'function') {
        window.persistPrototypeTeams('user');
      }
    }
    [...state.loadedSections].forEach(s => remountSection(s));
    DashboardConfig.notifyChanged();
    AssistantStorage.setTeamAssignments(_session, storedAssignments);
    renderPreview();
    const summary = Object.entries(storedAssignments).map(([t, u]) => `${t}: ${u}`).join(', ');
    if (!options.quiet) {
      showConfigChange('Team usecases updated');
    }
    return { success: true, assignments: storedAssignments, previewAssignments };
  }

  function handleConfigureTabs({ tabs }) {
    const draft = commitTabDraft(tabs, { source: 'ai', message: 'Tabs updated' });
    return { success: true, tabs: draft.map(t => ({ id: t.id, label: t.label })) };
  }

  function handleSetWidgetVisibility({ show, hide }) {
    if (show) {
      show.forEach(id => {
        state.hiddenWidgets.delete(id);
        state.addedWidgets.add(id);
      });
    }
    if (hide) {
      hide.forEach(id => {
        state.hiddenWidgets.add(id);
        state.addedWidgets.delete(id);
      });
    }
    [...state.loadedSections].forEach(s => remountSection(s));
    DashboardConfig.notifyChanged();
    updateSuggestedWidgetPreview();
    renderPreview();
    const changes = [];
    if (show?.length) changes.push(`${show.length} shown`);
    if (hide?.length) changes.push(`${hide.length} hidden`);
    showConfigChange(`Widgets: ${changes.join(', ')}`);
    return { success: true, shown: show || [], hidden: hide || [] };
  }

  async function handleSaveCustomerProfile(profile) {
    // Save to KV via worker
    try {
      const userId = _customerId || 'default';
      await fetch(`${PROXY_URL}/profile/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
    } catch (e) {
      console.warn('[AdminAssistant] Failed to save profile to KV:', e);
    }
    // Also update local structured memory
    if (profile.company) AssistantStorage.updateFacts(_session, { company: profile.company });
    if (profile.industry) AssistantStorage.updateFacts(_session, { industry: profile.industry });
    if (profile.goals) profile.goals.forEach(g => AssistantStorage.addGoal(_session, g));
    if (profile.terminology) AssistantStorage.updateFacts(_session, { terminology: profile.terminology });
    if (profile.teamNames) AssistantStorage.updateFacts(_session, { teamNames: profile.teamNames });
    if (_customerData) {
      _customerData = {
        ..._customerData,
        ...(profile.company ? { company: profile.company } : {}),
        ...(profile.industry ? { industry: profile.industry } : {}),
        ...(Array.isArray(profile.teamNames) ? {
          knownTeams: profile.teamNames.map((name) => {
            const assignment = _session?.structured?.teamAssignments?.[name];
            const likelyFocus = assignment === 'support' ? 'resolve'
              : assignment === 'sales' ? 'convert'
              : assignment || null;
            return likelyFocus ? { name, likelyFocus } : { name };
          }),
        } : {}),
      };
    }
    showConfigChange(`Profile saved`);
    return { success: true };
  }

  function handleShowOptions({ options, multiSelect, style }) {
    // This is a "blocking" UI tool — we render the options and pause the loop
    return new Promise(resolve => {
      _pendingResolve = resolve;
      renderOptionsUI(options, multiSelect || false, style || 'cards', resolve);
    });
  }

  function handleShowBooleanChoice({ prompt, yesLabel, noLabel }) {
    return new Promise(resolve => {
      _pendingResolve = resolve;
      renderBooleanChoiceUI(prompt, yesLabel || 'Yes', noLabel || 'No', resolve);
    });
  }

  function handleShowTeamAssignmentMatrix({ prompt, teams }) {
    return new Promise(resolve => {
      _pendingResolve = resolve;
      renderTeamAssignmentMatrixUI(prompt, teams?.length ? teams : getKnownTeamNames(), resolve);
    });
  }

  function handleShowTabEditor({ prompt, tabs }) {
    return new Promise(resolve => {
      _pendingResolve = resolve;
      renderTabEditorUI(prompt, tabs?.length ? tabs : getCurrentTabDraft(), resolve);
    });
  }

  function handleShowTabProposalChoice({ prompt, tabs }) {
    return new Promise(resolve => {
      _pendingResolve = resolve;
      renderTabProposalChoiceUI(prompt, tabs || [], resolve);
    });
  }

  function handleShowSourceInput({ prompt, allowedTypes }) {
    // Also a blocking tool
    return new Promise(resolve => {
      AssistantStorage.setSourceStatus(_session, { requested: true });
      AssistantStorage.save(_session);
      _pendingResolve = resolve;
      renderSourceInputUI(prompt, allowedTypes || ['file', 'url', 'paste'], resolve);
    });
  }

  async function handleCompleteOnboarding({ summary }) {
    AssistantStorage.setMode(_session, 'assistant');
    AssistantStorage.save(_session);
    localStorage.setItem(AI_SETUP_MODE_KEY, 'assistant');
    if (window.setGuideOnboardingState) {
      window.setGuideOnboardingState(false);
    }

    await animateOnboardingCollapseToFAB();
    hideOnboarding();
    showFAB({ pulse: true });
    showConfigChange(`Setup complete!`);
    return { success: true, summary };
  }

  // ═══════════════════════════════════════════════════════════
  //  AGENTIC LOOP
  // ═══════════════════════════════════════════════════════════

  async function sendMessage(userText) {
    if (_loopRunning) return;
    _loopRunning = true;

    // Add user message
    AssistantStorage.appendMessage(_session, 'user', userText);
    renderUserBubble(userText);
    clearInput();

    try {
      await runAgenticLoop();
    } catch (e) {
      console.error('[AdminAssistant] Loop error:', e);
      renderErrorBubble('Something went wrong. Please try again.');
    } finally {
      _loopRunning = false;
      AssistantStorage.save(_session);
    }
  }

  async function runAgenticLoop() {
    let iterations = 0;

    while (iterations < MAX_LOOP_ITERATIONS) {
      iterations++;
      showTypingIndicator();

      const mode = AssistantStorage.getMode(_session) || 'onboarding';
      const tools = getToolsForRole(_role, mode);
      const systemPrompt = buildSystemPrompt();
      const messages = AssistantStorage.getMessages(_session);

      let data;
      try {
        const resp = await fetch(`${PROXY_URL}/onboarding/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system: systemPrompt, messages, tools }),
        });
        data = await resp.json();
      } catch (e) {
        hideTypingIndicator();
        renderErrorBubble('Network error — please check your connection.');
        return;
      }

      hideTypingIndicator();

      if (data.error) {
        renderErrorBubble(`API error: ${data.error.message || data.error}`);
        return;
      }

      // Process the response content blocks
      const content = data.content || [];
      const textBlocks = content.filter(b => b.type === 'text');
      const toolUseBlocks = content.filter(b => b.type === 'tool_use');

      // Render any text
      if (textBlocks.length > 0) {
        const fullText = textBlocks.map(b => b.text).join('\n\n');
        renderAssistantBubble(fullText);
      }

      // Append the full assistant response to history
      AssistantStorage.appendToolUse(_session, content);
      AssistantStorage.save(_session);

      // If no tool use, we're done
      if (toolUseBlocks.length === 0 || data.stop_reason === 'end_turn') {
        break;
      }

      // Execute tool calls and collect results
      const toolResults = [];
      let interruptedByUser = false;
      for (const block of toolUseBlocks) {
        const result = await handleToolUse(block.name, block.input);
        AssistantStorage.recordPatch(_session, block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
        if (result?.interruptedByUser) {
          interruptedByUser = true;
          break;
        }
      }

      // Append tool results to history
      AssistantStorage.appendToolResult(_session, toolResults);

      // Incremental save after each complete exchange
      AssistantStorage.save(_session);

      if (injectQueuedUserMessage()) {
        continue;
      }

      if (interruptedByUser) {
        break;
      }
    }

    if (iterations >= MAX_LOOP_ITERATIONS) {
      renderAssistantBubble("I've reached my processing limit for this turn. Let me know if you'd like to continue.");
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  UI RENDERING — CHAT BUBBLES
  // ═══════════════════════════════════════════════════════════

  function getMessagesContainer() {
    const mode = AssistantStorage.getMode(_session);
    if (mode === 'assistant') {
      return document.getElementById('assistant-panel-messages');
    }
    return document.getElementById('ai-setup-messages');
  }

  function renderUserBubble(text) {
    const container = getMessagesContainer();
    if (!container) return;
    const bubble = document.createElement('div');
    bubble.className = 'ai-setup-bubble user';
    bubble.textContent = text;
    container.appendChild(bubble);
    scrollToBottom(container);
  }

  function renderAssistantBubble(text) {
    const container = getMessagesContainer();
    if (!container) return;
    const bubble = document.createElement('div');
    bubble.className = 'ai-setup-bubble assistant';
    bubble.innerHTML = renderMarkdown(text);
    container.appendChild(bubble);
    scrollToBottom(container);
  }

  function renderErrorBubble(text) {
    const container = getMessagesContainer();
    if (!container) return;
    const bubble = document.createElement('div');
    bubble.className = 'ai-setup-bubble assistant ai-setup-error';
    bubble.innerHTML = `<span style="color:var(--red-500,#ef4444)">${escapeHtml(text)}</span>
      <button class="ai-setup-retry-btn" onclick="AdminAssistant.retryLastMessage()">Retry</button>`;
    container.appendChild(bubble);
    scrollToBottom(container);
  }

  function showTypingIndicator() {
    const container = getMessagesContainer();
    if (!container) return;
    // Remove existing
    container.querySelectorAll('.ai-setup-typing').forEach(el => el.remove());
    const typing = document.createElement('div');
    typing.className = 'ai-setup-typing';
    typing.innerHTML = '<span class="ai-setup-typing-dot"></span><span class="ai-setup-typing-dot"></span><span class="ai-setup-typing-dot"></span>';
    container.appendChild(typing);
    scrollToBottom(container);
  }

  function hideTypingIndicator() {
    const container = getMessagesContainer();
    if (!container) return;
    container.querySelectorAll('.ai-setup-typing').forEach(el => el.remove());
  }

  function showConfigChange(text) {
    const container = getMessagesContainer();
    if (!container) return;
    const pill = document.createElement('div');
    pill.className = 'ai-setup-config-change';
    pill.textContent = text;
    container.appendChild(pill);
    scrollToBottom(container);
  }

  // ── Options UI (rendered when AI calls show_options) ───────
  function renderOptionsUI(options, multiSelect, style, resolve) {
    const container = getMessagesContainer();
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = `ai-setup-options style-${style}`;

    const selected = new Set();

    options.forEach(opt => {
      const el = document.createElement('button');
      el.className = style === 'chips' ? 'ai-setup-option-chip' : 'ai-setup-option-card';
      el.dataset.optionId = opt.id;

      if (style === 'cards') {
        el.innerHTML = `
          ${opt.icon ? `<span class="ai-setup-option-icon">${opt.icon}</span>` : ''}
          <span class="ai-setup-option-label">${escapeHtml(opt.label)}</span>
          ${opt.description ? `<span class="ai-setup-option-desc">${escapeHtml(opt.description)}</span>` : ''}
        `;
      } else {
        el.textContent = opt.label;
      }

      el.addEventListener('click', () => {
        if (multiSelect) {
          el.classList.toggle('selected');
          if (selected.has(opt.id)) selected.delete(opt.id);
          else selected.add(opt.id);
        } else {
          // Single select — resolve immediately
          wrapper.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
          el.classList.add('selected');
          wrapper.classList.add('ai-setup-options-resolved');
          disableOptions(wrapper);
          _pendingResolve = null;
          resolve({ selected: [opt.id], selectedLabels: [opt.label] });
        }
      });

      wrapper.appendChild(el);
    });

    // For multi-select, add confirm button
    if (multiSelect) {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'ai-setup-option-confirm';
      confirmBtn.textContent = 'Continue';
      confirmBtn.addEventListener('click', () => {
        wrapper.classList.add('ai-setup-options-resolved');
        disableOptions(wrapper);
        const selectedLabels = options.filter(o => selected.has(o.id)).map(o => o.label);
        _pendingResolve = null;
        resolve({ selected: [...selected], selectedLabels });
      });
      wrapper.appendChild(confirmBtn);
    }

    container.appendChild(wrapper);
    scrollToBottom(container);
  }

  function renderBooleanChoiceUI(prompt, yesLabel, noLabel, resolve) {
    const container = getMessagesContainer();
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-setup-boolean';

    if (prompt) {
      const promptEl = document.createElement('div');
      promptEl.className = 'ai-setup-inline-prompt';
      promptEl.textContent = prompt;
      wrapper.appendChild(promptEl);
    }

    const choices = document.createElement('div');
    choices.className = 'ai-setup-boolean-choices';

    [
      { value: true, label: yesLabel || 'Yes' },
      { value: false, label: noLabel || 'No' },
    ].forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'ai-setup-option-chip';
      btn.textContent = choice.label;
      btn.addEventListener('click', () => {
        btn.classList.add('selected');
        wrapper.classList.add('ai-setup-options-resolved');
        disableOptions(wrapper);
        _pendingResolve = null;
        resolve({ value: choice.value, selected: choice.value ? ['yes'] : ['no'], selectedLabels: [choice.label] });
      });
      choices.appendChild(btn);
    });

    wrapper.appendChild(choices);
    container.appendChild(wrapper);
    scrollToBottom(container);
  }

  function renderTeamAssignmentMatrixUI(prompt, teams, resolve) {
    const container = getMessagesContainer();
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-setup-team-matrix';

    if (prompt) {
      const promptEl = document.createElement('div');
      promptEl.className = 'ai-setup-inline-prompt';
      promptEl.textContent = prompt;
      wrapper.appendChild(promptEl);
    }

    const helper = document.createElement('div');
    helper.className = 'ai-setup-inline-prompt ai-setup-inline-prompt-secondary';
    helper.textContent = 'Any teams already known from the customer profile are shown here. Edit, remove, or add more before continuing.';
    wrapper.appendChild(helper);

    let draft = buildInitialTeamDraft(teams);
    const rows = document.createElement('div');
    rows.className = 'ai-setup-team-matrix-rows';

    const errorEl = document.createElement('div');
    errorEl.className = 'ai-setup-inline-warning';
    errorEl.style.display = 'none';

    function renderRows() {
      rows.innerHTML = '';
      draft.forEach((team) => {
        const row = document.createElement('div');
        row.className = 'ai-setup-team-row';
        row.dataset.teamId = team.id;

        const nameWrap = document.createElement('div');
        nameWrap.className = 'ai-setup-team-row-main';

        const nameLabel = document.createElement('label');
        nameLabel.className = 'team-settings-field-label';
        nameLabel.textContent = 'Team';
        nameLabel.setAttribute('for', `ai-setup-team-name-${team.id}`);
        nameWrap.appendChild(nameLabel);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = `ai-setup-team-name-${team.id}`;
        nameInput.className = 'ai-setup-team-name-input';
        nameInput.value = team.name;
        nameInput.placeholder = 'Team name';
        nameInput.addEventListener('input', () => {
          team.name = nameInput.value;
        });
        nameWrap.appendChild(nameInput);
        row.appendChild(nameWrap);

        const choices = document.createElement('div');
        choices.className = 'ai-setup-team-row-choices';

        ['support', 'sales', 'both'].forEach(choice => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ai-setup-team-choice';
          btn.textContent = choice.charAt(0).toUpperCase() + choice.slice(1);
          if ((team.usecase || '').toLowerCase() === choice) {
            btn.classList.add('selected');
          }
          btn.addEventListener('click', () => {
            team.usecase = choice;
            row.querySelectorAll('.ai-setup-team-choice').forEach(el => el.classList.remove('selected'));
            btn.classList.add('selected');
          });
          choices.appendChild(btn);
        });
        row.appendChild(choices);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'ai-setup-team-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.disabled = draft.length <= 1;
        removeBtn.addEventListener('click', () => {
          draft = draft.filter(item => item.id !== team.id);
          renderRows();
        });
        row.appendChild(removeBtn);

        rows.appendChild(row);
      });
    }

    renderRows();

    wrapper.appendChild(rows);
    wrapper.appendChild(errorEl);

    const addRowWrap = document.createElement('div');
    addRowWrap.className = 'ai-setup-team-add-row';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'ai-setup-inline-action-secondary';
    addBtn.textContent = 'Add team';
    addBtn.addEventListener('click', () => {
      draft.push({
        id: buildInlineDraftId('team'),
        name: '',
        usecase: '',
      });
      renderRows();
      requestAnimationFrame(() => {
        wrapper.querySelector('.ai-setup-team-row:last-child .ai-setup-team-name-input')?.focus();
      });
    });
    addRowWrap.appendChild(addBtn);
    wrapper.appendChild(addRowWrap);

    const actions = document.createElement('div');
    actions.className = 'ai-setup-inline-actions';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'ai-setup-inline-action-primary';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => {
      const seen = new Set();
      const cleaned = [];
      for (const row of draft) {
        const name = String(row.name || '').trim();
        if (!name) {
          errorEl.textContent = 'Every team needs a name.';
          errorEl.style.display = '';
          return;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
          errorEl.textContent = `Team names need to be unique. "${name}" appears more than once.`;
          errorEl.style.display = '';
          return;
        }
        seen.add(key);
        cleaned.push({
          id: row.id,
          name,
          usecase: row.usecase || getTeamAssignmentSuggestion(name) || '',
        });
      }
      errorEl.style.display = 'none';

      const assignments = {};
      const teamState = cleaned.map((row) => {
        const normalized = normalizeTeamAssignment(row.usecase || getTeamAssignmentSuggestion(row.name));
        if (normalized) assignments[row.name] = normalized;
        return {
          name: row.name,
          members: [],
          usecase: normalized === 'support' ? 'resolve' : normalized === 'sales' ? 'convert' : normalized || 'resolve',
        };
      });

      if (typeof window.syncTeamsState === 'function') {
        window.syncTeamsState(teamState, { persist: 'user' });
      }
      AssistantStorage.updateFacts(_session, { teamNames: cleaned.map(row => row.name) });
      AssistantStorage.setTeamAssignments(_session, assignments);
      AssistantStorage.save(_session);
      if (_customerData) {
        _customerData.knownTeams = cleaned.map((row) => {
          const likelyFocus = normalizeTeamAssignment(row.usecase);
          return likelyFocus ? { name: row.name, likelyFocus } : { name: row.name };
        });
      }
      handleSetTeamUsecases({ assignments }, { quiet: true });
      wrapper.classList.add('ai-setup-options-resolved');
      disableOptions(wrapper);
      _pendingResolve = null;
      resolve({ assignments, teamNames: cleaned.map(row => row.name) });
    });
    actions.appendChild(doneBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'ai-setup-inline-action-secondary';
    skipBtn.textContent = 'Skip for now';
    skipBtn.addEventListener('click', () => {
      wrapper.classList.add('ai-setup-options-resolved');
      disableOptions(wrapper);
      _pendingResolve = null;
      resolve({ skipped: true });
    });
    actions.appendChild(skipBtn);

    wrapper.appendChild(actions);
    container.appendChild(wrapper);
    scrollToBottom(container);
  }

  function renderTabProposalChoiceUI(prompt, tabs, resolve) {
    const container = getMessagesContainer();
    if (!container) return;

    const proposalTabs = buildTabDraftForApply(tabs);
    const currentDraft = _session?.structured?.suggestedConfigDraft || {};
    AssistantStorage.setSuggestedConfigDraft(_session, {
      ...currentDraft,
      tabs: proposalTabs,
      widgetIdsByTab: currentDraft.widgetIdsByTab || {},
    });
    AssistantStorage.setPendingTabDraft(_session, null);
    AssistantStorage.setPendingProposalSource(_session, 'ai');
    AssistantStorage.save(_session);
    renderPreview();

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-setup-tab-proposal';

    if (prompt) {
      const promptEl = document.createElement('div');
      promptEl.className = 'ai-setup-inline-prompt';
      promptEl.textContent = prompt;
      wrapper.appendChild(promptEl);
    }

    const summary = document.createElement('div');
    summary.className = 'ai-setup-tab-proposal-summary';
    proposalTabs.forEach(tab => {
      const pill = document.createElement('span');
      pill.className = 'ai-setup-tab-proposal-pill';
      pill.textContent = tab.label;
      summary.appendChild(pill);
    });
    wrapper.appendChild(summary);

    const choices = document.createElement('div');
    choices.className = 'ai-setup-options style-cards';

    const decisionOptions = [
      {
        id: 'accept_proposal',
        label: 'Accept proposals',
        description: 'Use this draft as-is and continue.',
      },
      {
        id: 'refine_further',
        label: 'Refine further',
        description: 'Adjust the proposal directly before applying it.',
      },
      {
        id: 'keep_defaults',
        label: 'Keep defaults',
        description: 'Drop this proposal and stay with the baseline tabs.',
      },
    ];

    decisionOptions.forEach(option => {
      const button = document.createElement('button');
      button.className = 'ai-setup-option-card';
      button.innerHTML = `
        <span class="ai-setup-option-label">${escapeHtml(option.label)}</span>
        <span class="ai-setup-option-desc">${escapeHtml(option.description)}</span>
      `;
      button.addEventListener('click', () => {
        if (option.id === 'accept_proposal') {
          wrapper.classList.add('ai-setup-options-resolved');
          disableOptions(wrapper);
          _pendingResolve = null;
          resolve({
            decision: option.id,
            tabs: proposalTabs.map(tab => ({ id: tab.id, label: tab.label, category: tab.category || null })),
          });
          return;
        }

        if (option.id === 'keep_defaults') {
          AssistantStorage.setSuggestedConfigDraft(_session, null);
          AssistantStorage.setPendingTabDraft(_session, null);
          AssistantStorage.setPendingProposalSource(_session, null);
          AssistantStorage.save(_session);
          renderPreview();
          wrapper.classList.add('ai-setup-options-resolved');
          disableOptions(wrapper);
          _pendingResolve = null;
          resolve({ decision: option.id, keepDefaults: true });
          return;
        }

        disableOptions(wrapper);
        renderTabEditorUI('Refine the proposed tabs directly.', proposalTabs, (result) => {
          _pendingResolve = null;
          resolve({
            decision: option.id,
            ...result,
          });
        });
      });
      choices.appendChild(button);
    });

    wrapper.appendChild(choices);
    container.appendChild(wrapper);
    scrollToBottom(container);
  }

  function renderTabEditorUI(prompt, tabs, resolve) {
    const container = getMessagesContainer();
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-setup-tab-editor';

    if (prompt) {
      const promptEl = document.createElement('div');
      promptEl.className = 'ai-setup-inline-prompt';
      promptEl.textContent = prompt;
      wrapper.appendChild(promptEl);
    }

    let draft = buildTabDraftForApply(tabs?.length ? tabs : getCurrentTabDraft());
    let draggedId = null;
    const typoConfirmedIds = new Set();

    AssistantStorage.setPendingTabDraft(_session, draft);
    AssistantStorage.setPendingProposalSource(_session, 'user');
    AssistantStorage.save(_session);

    const list = document.createElement('div');
    list.className = 'ai-setup-tab-editor-list';

    const composer = document.createElement('div');
    composer.className = 'ai-setup-tab-editor-add';
    composer.innerHTML = `
      <input type="text" class="ai-setup-tab-add-input" placeholder="Add a new tab name">
      <button type="button" class="ai-setup-inline-action-secondary">Add tab</button>
    `;

    function moveDraftItem(tabId, targetId) {
      if (tabId === targetId) return;
      const sourceIndex = draft.findIndex(tab => tab.id === tabId);
      const targetIndex = draft.findIndex(tab => tab.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;
      const [moved] = draft.splice(sourceIndex, 1);
      draft.splice(targetIndex, 0, moved);
    }

    function renderDraftList() {
      list.innerHTML = '';
      draft.forEach(tab => {
        const row = document.createElement('div');
        row.className = 'ai-setup-tab-row';
        row.draggable = true;
        row.dataset.tabId = tab.id;

        row.addEventListener('dragstart', () => {
          draggedId = tab.id;
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => {
          draggedId = null;
          row.classList.remove('dragging');
          list.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
        });
        row.addEventListener('dragover', (event) => {
          event.preventDefault();
          row.classList.add('drag-target');
        });
        row.addEventListener('dragleave', () => {
          row.classList.remove('drag-target');
        });
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          row.classList.remove('drag-target');
          if (!draggedId) return;
          moveDraftItem(draggedId, tab.id);
          AssistantStorage.setPendingTabDraft(_session, draft);
          AssistantStorage.save(_session);
          applyTabDraftToPreview(draft);
          renderDraftList();
        });

        const handle = document.createElement('span');
        handle.className = 'ai-setup-tab-drag';
        handle.innerHTML = '&#8942;&#8942;';
        row.appendChild(handle);

        const labelWrap = document.createElement('div');
        labelWrap.className = 'ai-setup-tab-label-wrap';

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = tab.label;
        labelInput.className = 'ai-setup-tab-label-input';
        labelInput.setAttribute('aria-label', `Tab label for ${tab.label}`);
        labelInput.addEventListener('input', () => {
          tab.label = labelInput.value;
          typoConfirmedIds.delete(tab.id);
          AssistantStorage.setPendingTabDraft(_session, draft);
          AssistantStorage.setPendingProposalSource(_session, 'user');
          AssistantStorage.save(_session);
          applyTabDraftToPreview(draft);
          const suspicious = looksLikeTypo(tab.label);
          warning.style.display = suspicious ? '' : 'none';
          warning.textContent = suspicious
            ? 'This looks like it may be a typo. Edit it or keep it as typed.'
            : '';
          keepBtn.style.display = suspicious ? '' : 'none';
        });

        labelWrap.appendChild(labelInput);

        const warning = document.createElement('div');
        warning.className = 'ai-setup-inline-warning';
        warning.style.display = 'none';

        const keepBtn = document.createElement('button');
        keepBtn.type = 'button';
        keepBtn.className = 'ai-setup-inline-link-btn';
        keepBtn.textContent = 'Keep as typed';
        keepBtn.style.display = 'none';
        keepBtn.addEventListener('click', () => {
          typoConfirmedIds.add(tab.id);
          warning.style.display = 'none';
          warning.textContent = '';
          keepBtn.style.display = 'none';
        });

        const toggleWarning = () => {
          const suspicious = looksLikeTypo(tab.label) && !typoConfirmedIds.has(tab.id);
          warning.style.display = suspicious ? '' : 'none';
          keepBtn.style.display = suspicious ? '' : 'none';
          warning.textContent = suspicious ? 'This looks like it may be a typo. Edit it or keep it as typed.' : '';
        };

        labelInput.addEventListener('blur', toggleWarning);
        labelWrap.appendChild(warning);
        labelWrap.appendChild(keepBtn);
        row.appendChild(labelWrap);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'ai-setup-tab-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.disabled = draft.length <= 1;
        removeBtn.addEventListener('click', () => {
          draft = draft.filter(item => item.id !== tab.id);
          AssistantStorage.setPendingTabDraft(_session, draft);
          AssistantStorage.setPendingProposalSource(_session, 'user');
          AssistantStorage.save(_session);
          applyTabDraftToPreview(draft);
          renderDraftList();
        });
        row.appendChild(removeBtn);

        list.appendChild(row);
      });
    }

    renderDraftList();
    wrapper.appendChild(list);

    const addInput = composer.querySelector('.ai-setup-tab-add-input');
    const addBtn = composer.querySelector('button');
    addBtn.addEventListener('click', () => {
      const label = addInput.value.trim();
      if (!label) return;
      const existingIds = new Set(draft.map(tab => tab.id));
      draft.push({
        id: buildUniqueTabId(label, existingIds),
        label,
        category: 'custom',
        isDefault: false,
      });
      addInput.value = '';
      AssistantStorage.setPendingTabDraft(_session, draft);
      AssistantStorage.setPendingProposalSource(_session, 'user');
      AssistantStorage.save(_session);
      applyTabDraftToPreview(draft);
      renderDraftList();
    });
    wrapper.appendChild(composer);

    const actions = document.createElement('div');
    actions.className = 'ai-setup-inline-actions';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'ai-setup-inline-action-primary';
    doneBtn.textContent = 'Done editing';
    doneBtn.addEventListener('click', () => {
      const suspicious = draft.find(tab => looksLikeTypo(tab.label) && !typoConfirmedIds.has(tab.id));
      if (suspicious) {
        const row = wrapper.querySelector(`.ai-setup-tab-row[data-tab-id="${suspicious.id}"] .ai-setup-tab-label-input`);
        if (row) row.focus();
        return;
      }
      const committed = commitTabDraft(draft, { source: 'user', message: 'Tabs updated' });
      wrapper.classList.add('ai-setup-options-resolved');
      disableOptions(wrapper);
      _pendingResolve = null;
      resolve({ tabs: committed.map(tab => ({ id: tab.id, label: tab.label, category: tab.category || null })) });
    });
    actions.appendChild(doneBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'ai-setup-inline-action-secondary';
    skipBtn.textContent = 'Skip for now';
    skipBtn.addEventListener('click', () => {
      wrapper.classList.add('ai-setup-options-resolved');
      disableOptions(wrapper);
      _pendingResolve = null;
      resolve({ skipped: true });
    });
    actions.appendChild(skipBtn);

    wrapper.appendChild(actions);
    container.appendChild(wrapper);
    applyTabDraftToPreview(draft);
    scrollToBottom(container);
  }

  function disableOptions(wrapper) {
    wrapper.querySelectorAll('button, input, textarea').forEach(el => {
      el.disabled = true;
      el.style.pointerEvents = 'none';
    });
  }

  // ── Source input UI (rendered when AI calls show_source_input)
  function renderSourceInputUI(prompt, allowedTypes, resolve) {
    const container = getMessagesContainer();
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-setup-source-input';

    const promptEl = document.createElement('div');
    promptEl.className = 'ai-setup-source-prompt';
    promptEl.textContent = prompt;
    wrapper.appendChild(promptEl);

    const helper = document.createElement('div');
    helper.className = 'ai-setup-source-helper';
    helper.textContent = 'Any source context already known from the customer profile is shown here. Edit, remove, or add more before continuing.';
    wrapper.appendChild(helper);

    const grid = document.createElement('div');
    grid.className = 'ai-setup-source-grid';

    if (allowedTypes.includes('file')) {
      const filePanel = document.createElement('div');
      filePanel.className = 'ai-setup-source-column';
      filePanel.dataset.panel = 'file';
      filePanel.innerHTML = `
        <div class="ai-setup-source-column-header">
          <div class="ai-setup-source-column-title">File</div>
          <div class="ai-setup-source-column-subtitle">Upload PDF, DOCX, TXT, or CSV</div>
        </div>
        <div class="ai-setup-source-dropzone" id="ai-setup-dropzone">
          <p>Drop a file here or click to browse</p>
          <p class="ai-setup-source-hint">PDF, DOCX, TXT, CSV</p>
          <input type="file" id="ai-setup-file-input" accept=".pdf,.docx,.txt,.csv" style="display:none">
        </div>
        <div class="ai-setup-source-file-name" id="ai-setup-file-name" style="display:none"></div>
      `;
      grid.appendChild(filePanel);
    }

    if (allowedTypes.includes('url')) {
      const urlDraft = buildSourceUrlDraft();
      const urlPanel = document.createElement('div');
      urlPanel.className = 'ai-setup-source-column';
      urlPanel.dataset.panel = 'url';
      urlPanel.innerHTML = `
        <div class="ai-setup-source-column-header">
          <div class="ai-setup-source-column-title">Website URL</div>
          <div class="ai-setup-source-column-subtitle">Use a homepage, help center, or docs URL</div>
        </div>
        <div class="ai-setup-source-url-list" id="ai-setup-url-list"></div>
        <button type="button" class="ai-setup-inline-action-secondary ai-setup-source-add-btn" id="ai-setup-add-url-btn">Add URL</button>
      `;

      const listEl = urlPanel.querySelector('#ai-setup-url-list');
      const renderUrlRows = () => {
        listEl.innerHTML = '';
        urlDraft.forEach((entry) => {
          const row = document.createElement('div');
          row.className = 'ai-setup-source-url-row';
          row.dataset.rowId = entry.id;
          row.innerHTML = `
            <div class="ai-setup-source-url-meta">
              ${entry.sourceLabel ? `<span class="ai-setup-source-url-badge">${escapeHtml(entry.sourceLabel)}</span>` : ''}
            </div>
            <input type="url" class="ai-setup-source-url-input" placeholder="https://example.com" value="${escapeHtml(entry.url || '')}">
            <button type="button" class="ai-setup-source-url-remove">Remove</button>
          `;
          row.querySelector('.ai-setup-source-url-input')?.addEventListener('input', (event) => {
            entry.url = event.target.value;
            entry.sourceLabel = '';
          });
          row.querySelector('.ai-setup-source-url-remove')?.addEventListener('click', () => {
            const idx = urlDraft.findIndex(item => item.id === entry.id);
            if (idx === -1) return;
            urlDraft.splice(idx, 1);
            if (!urlDraft.length) {
              urlDraft.push({ id: buildInlineDraftId('source-url'), url: '', sourceLabel: '' });
            }
            renderUrlRows();
          });
          listEl.appendChild(row);
        });
      };

      renderUrlRows();
      urlPanel.querySelector('#ai-setup-add-url-btn')?.addEventListener('click', () => {
        urlDraft.push({ id: buildInlineDraftId('source-url'), url: '', sourceLabel: '' });
        renderUrlRows();
        requestAnimationFrame(() => {
          urlPanel.querySelector('.ai-setup-source-url-row:last-child .ai-setup-source-url-input')?.focus();
        });
      });

      grid.appendChild(urlPanel);
    }

    if (allowedTypes.includes('paste')) {
      const initialPasteText = buildInitialSourceContextText();
      const pastePanel = document.createElement('div');
      pastePanel.className = 'ai-setup-source-column';
      pastePanel.dataset.panel = 'paste';
      pastePanel.innerHTML = `
        <div class="ai-setup-source-column-header">
          <div class="ai-setup-source-column-title">Pasted text</div>
          <div class="ai-setup-source-column-subtitle">${initialPasteText ? 'Preloaded context is included below. Edit it, remove it, or add more.' : 'Paste notes, docs, or copied content'}</div>
        </div>
        <textarea class="ai-setup-source-paste-input" placeholder="Paste text here..." rows="5" id="ai-setup-paste-input">${escapeHtml(initialPasteText)}</textarea>
      `;
      grid.appendChild(pastePanel);
    }

    wrapper.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'ai-setup-inline-actions';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'ai-setup-source-submit';
    submitBtn.textContent = 'Analyze sources';
    submitBtn.addEventListener('click', async () => {
      await processSourceSubmit(wrapper, allowedTypes, resolve);
    });
    actions.appendChild(submitBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'ai-setup-inline-action-secondary';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      AssistantStorage.setSourceStatus(_session, { requested: true, skipped: true });
      AssistantStorage.save(_session);
      wrapper.classList.add('ai-setup-source-resolved');
      disableSourceInput(wrapper);
      _pendingResolve = null;
      resolve({ skipped: true });
    });
    actions.appendChild(skipBtn);

    wrapper.appendChild(actions);

    container.appendChild(wrapper);
    scrollToBottom(container);

    setTimeout(() => wireFileInteractions(wrapper), 0);
  }

  function wireFileInteractions(wrapper) {
    const dropzone = wrapper.querySelector('#ai-setup-dropzone');
    const fileInput = wrapper.querySelector('#ai-setup-file-input');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        showFileName(wrapper, e.dataTransfer.files[0].name);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        showFileName(wrapper, fileInput.files[0].name);
      }
    });
  }

  function showFileName(wrapper, name) {
    const el = wrapper.querySelector('#ai-setup-file-name');
    if (el) {
      el.textContent = name;
      el.style.display = '';
    }
  }

  async function processSourceSubmit(wrapper, allowedTypes, resolve) {
    const jobs = [];

    if (allowedTypes.includes('url')) {
      const urls = [...new Set(
        [...wrapper.querySelectorAll('.ai-setup-source-url-input')]
          .map(input => input.value.trim())
          .filter(Boolean)
      )];
      urls.forEach((url) => {
        jobs.push({
          label: 'Fetching website...',
          run: () => extractFromUrl(url),
        });
      });
    }

    if (allowedTypes.includes('file')) {
      const fileInput = wrapper.querySelector('#ai-setup-file-input');
      if (fileInput?.files?.length) {
        const file = fileInput.files[0];
        jobs.push({
          label: `Extracting text from ${file.name}...`,
          run: () => extractFromFile(file),
        });
      }
    }

    if (allowedTypes.includes('paste')) {
      const text = wrapper.querySelector('#ai-setup-paste-input')?.value?.trim();
      if (text) {
        jobs.push({
          label: 'Analyzing pasted text...',
          run: async () => ({ text, title: 'Pasted text', source: 'paste' }),
        });
      }
    }

    if (!jobs.length) return;

    const processingEl = showProcessingState('Analyzing sources...');

    try {
      const results = [];

      for (const job of jobs) {
        processingEl.querySelector('.ai-setup-processing-text').textContent = job.label;
        const result = await job.run();
        if (!result?.text) continue;

        AssistantStorage.addSource(_session, {
          url: result.url || null,
          filename: result.filename || null,
          title: result.title || 'Source',
          summary: result.text.substring(0, 500),
          extractedText: result.text.substring(0, 30000),
        });

        results.push({
          source: result.source || 'source',
          title: result.title || 'Source',
          textLength: result.text.length,
          preview: result.text.substring(0, 200),
        });
      }

      AssistantStorage.save(_session);
      hideProcessingState(processingEl);

      if (!results.length) {
        renderErrorBubble('Could not extract text from the source. Try a different format.');
        return;
      }

      wrapper.classList.add('ai-setup-source-resolved');
      disableSourceInput(wrapper);
      _pendingResolve = null;
      resolve({
        success: true,
        sourceCount: results.length,
        sources: results,
      });
    } catch (e) {
      hideProcessingState(processingEl);
      console.error('[AdminAssistant] Source processing error:', e);
      renderErrorBubble(`Error processing source: ${e.message}`);
    }
  }

  function disableSourceInput(wrapper) {
    wrapper.querySelectorAll('input, textarea, button').forEach(el => {
      el.disabled = true;
      el.style.pointerEvents = 'none';
    });
  }

  function showProcessingState(text) {
    const container = getMessagesContainer();
    if (!container) return null;
    const el = document.createElement('div');
    el.className = 'ai-setup-processing';
    el.innerHTML = `<div class="spinner"></div><span class="ai-setup-processing-text">${escapeHtml(text)}</span>`;
    container.appendChild(el);
    scrollToBottom(container);
    return el;
  }

  function hideProcessingState(el) {
    if (el) el.remove();
  }

  // ═══════════════════════════════════════════════════════════
  //  SOURCE EXTRACTION
  // ═══════════════════════════════════════════════════════════

  async function extractFromUrl(url) {
    const resp = await fetch(`${PROXY_URL}/extract-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return { text: data.text, title: data.title, url, source: 'url' };
  }

  async function extractFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt' || ext === 'csv') {
      const text = await readFileAsText(file);
      return { text, title: file.name, filename: file.name, source: 'file' };
    }

    if (ext === 'pdf') {
      const text = await extractPdfText(file);
      return { text, title: file.name, filename: file.name, source: 'file' };
    }

    if (ext === 'docx') {
      const text = await extractDocxText(file);
      return { text, title: file.name, filename: file.name, source: 'file' };
    }

    // Fallback: try to read as text
    const text = await readFileAsText(file);
    return { text, title: file.name, filename: file.name, source: 'file' };
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async function extractPdfText(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js not loaded. Please refresh the page.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ');
      pages.push(text);
    }
    return pages.join('\n\n');
  }

  async function extractDocxText(file) {
    if (typeof mammoth === 'undefined') {
      throw new Error('Mammoth.js not loaded. Please refresh the page.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  // ═══════════════════════════════════════════════════════════
  //  PREVIEW PANEL (simplified dashboard preview)
  // ═══════════════════════════════════════════════════════════

  function renderPreview() {
    const content = document.getElementById('ai-setup-preview-content');
    if (!content) return;
    const previewTabs = getPreviewDraftTabs();
    syncPreviewLayout(previewTabs);

    content.innerHTML = '';
    if (previewTabs.length === 0) {
      updatePreviewRoleBadge();
      return;
    }

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'preview-tab-bar';
    previewTabs.forEach((tab, index) => {
      const btn = document.createElement('button');
      btn.className = 'preview-tab' + (index === 0 ? ' active' : '');
      btn.textContent = tab.label;
      tabBar.appendChild(btn);
    });
    content.appendChild(tabBar);

    const intro = document.createElement('div');
    intro.className = 'preview-intro-card';
    intro.innerHTML = `
      <span class="preview-intro-eyebrow">Draft preview</span>
      <strong>This updates as the onboarding draft becomes more specific.</strong>
    `;
    content.appendChild(intro);

    // Widget cards for each section
    previewTabs.forEach(tab => {
      const section = document.createElement('div');
      section.className = 'preview-section';

      const header = document.createElement('div');
      header.className = 'preview-section-header';
      const title = document.createElement('span');
      title.textContent = tab.label;
      const count = document.createElement('span');
      count.className = 'preview-section-count';
      const widgets = getPreviewWidgets(tab.id);
      count.textContent = widgets.length > 0 ? `${widgets.length} widgets` : 'Awaiting relevant widgets';
      header.appendChild(title);
      header.appendChild(count);
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'preview-widget-grid';

      widgets.forEach(w => {
        const previewType = normalizePreviewWidgetType(w.type);
        const card = document.createElement('div');
        card.className = `preview-widget-card type-${previewType}`;
        card.innerHTML = `
          <div class="preview-widget-top">
            <span class="preview-widget-icon">${getPreviewWidgetIcon(previewType)}</span>
            <span class="preview-widget-type">${escapeHtml(getPreviewWidgetTypeLabel(previewType))}</span>
          </div>
          <span class="preview-widget-title">${escapeHtml(w.title)}</span>
          <div class="preview-widget-viz type-${previewType}">
            ${buildPreviewWidgetViz(previewType)}
          </div>
        `;
        grid.appendChild(card);
      });

      if (widgets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'preview-widget-empty';
        empty.textContent = 'Relevant widgets will appear here once the draft is more specific.';
        grid.appendChild(empty);
      }

      section.appendChild(grid);
      content.appendChild(section);
    });

    updatePreviewRoleBadge();
  }

  function getPreviewWidgets(tabId) {
    const previewWidgetMap = _session?.structured?.suggestedConfigDraft?.widgetIdsByTab || {};
    const explicitIds = Array.isArray(previewWidgetMap[tabId]) ? previewWidgetMap[tabId] : [];

    if ((AssistantStorage.getMode(_session) || 'onboarding') === 'onboarding' && explicitIds.length === 0) {
      return [];
    }

    const sourceIds = explicitIds.length > 0
      ? explicitIds
      : (state.tabWidgets && state.tabWidgets[tabId] ? [...state.tabWidgets[tabId]] : []);

    const sectionWidgets = sourceIds.map(id => WIDGET_BY_ID[id]).filter(Boolean);
    return sectionWidgets.filter(w => {
      if (state.hiddenWidgets.has(w.id)) return false;
      const override = getEffectiveVisibilityForPreview(w);
      return override !== 'hide';
    });
  }

  function getPreviewWidgetTypeLabel(type) {
    const labels = {
      line: 'Line chart',
      bar: 'Bar chart',
      stackedbar: 'Stacked bar',
      area: 'Area chart',
      donut: 'Donut chart',
      funnel: 'Funnel',
      table: 'Table',
      metric: 'KPI',
      kpi: 'KPI',
      list: 'List',
    };
    return labels[type] || 'Widget';
  }

  function normalizePreviewWidgetType(type) {
    const map = {
      'line-chart': 'line',
      'bar-chart': 'bar',
      'doughnut-chart': 'donut',
      'kpi-group': 'kpi',
      'list-actions': 'list',
      opportunities: 'list',
      progress: 'metric',
      'agent-status': 'table',
    };
    return map[type] || type || 'metric';
  }

  function getPreviewWidgetIcon(type) {
    const icons = {
      line: '╱',
      bar: '▥',
      stackedbar: '▤',
      area: '▱',
      donut: '◔',
      funnel: '⏷',
      table: '☰',
      metric: '◌',
      kpi: '◌',
      list: '≣',
    };
    return icons[type] || '◌';
  }

  function buildPreviewWidgetViz(type) {
    if (type === 'bar' || type === 'stackedbar') {
      return '<span></span><span></span><span></span><span></span>';
    }
    if (type === 'line' || type === 'area') {
      return '<i></i>';
    }
    if (type === 'donut') {
      return '<i class="preview-viz-donut"></i>';
    }
    if (type === 'table' || type === 'list') {
      return '<em></em><em></em><em></em>';
    }
    return '<b></b>';
  }

  function getEffectiveVisibilityForPreview(w) {
    if (state.hiddenWidgets.has(w.id)) return 'hide';
    const key = `${state.lens}_${state.role}`;
    if (w.states && w.states[key] === 'hide') return 'hide';
    if (w.vis === 'hidden' && !state.addedWidgets.has(w.id)) return 'hide';
    return 'show';
  }

  function updatePreviewRoleBadge() {
    const badge = document.getElementById('ai-setup-preview-role');
    if (badge) {
      badge.textContent = `${state.lens} / ${state.role}`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════

  function renderMarkdown(text) {
    // Simple markdown rendering — bold, italic, code, links, lists
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.*)$/, '<p>$1</p>')
      .replace(/<p><\/p>/g, '')
      .replace(/<ul><\/ul>/g, '');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function scrollToBottom(container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  function clearInput() {
    const mode = AssistantStorage.getMode(_session);
    const input = mode === 'assistant'
      ? document.getElementById('assistant-panel-input')
      : document.getElementById('ai-setup-input');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
  }

  function getInputValue() {
    const mode = AssistantStorage.getMode(_session);
    const input = mode === 'assistant'
      ? document.getElementById('assistant-panel-input')
      : document.getElementById('ai-setup-input');
    return input?.value?.trim() || '';
  }

  function disableLatestInteractiveUI() {
    const container = getMessagesContainer();
    if (!container) return;
    const selectors = [
      '.ai-setup-options:not(.ai-setup-options-resolved)',
      '.ai-setup-boolean:not(.ai-setup-options-resolved)',
      '.ai-setup-team-matrix:not(.ai-setup-options-resolved)',
      '.ai-setup-tab-editor:not(.ai-setup-options-resolved)',
      '.ai-setup-tab-proposal:not(.ai-setup-options-resolved)',
      '.ai-setup-source-input:not(.ai-setup-source-resolved)',
    ];
    const active = [...container.querySelectorAll(selectors.join(', '))].pop();
    if (!active) return;
    if (active.classList.contains('ai-setup-source-input')) {
      active.classList.add('ai-setup-source-resolved');
      disableSourceInput(active);
      return;
    }
    active.classList.add('ai-setup-options-resolved');
    disableOptions(active);
  }

  function injectQueuedUserMessage() {
    if (!_queuedUserMessage || !_session) return false;
    const queued = _queuedUserMessage.trim();
    _queuedUserMessage = null;
    if (!queued) return false;
    AssistantStorage.appendMessage(_session, 'user', queued);
    renderUserBubble(queued);
    AssistantStorage.save(_session);
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  //  META-START: Customer + Role selection
  // ═══════════════════════════════════════════════════════════

  async function initMetaStart() {
    const grid = document.getElementById('ai-setup-customer-grid');
    if (!grid) return;

    let customers = [];
    if (window.CustomerProfilesStore?.loadAll) {
      try {
        customers = await window.CustomerProfilesStore.loadAll();
      } catch (e) {
        console.warn('[AdminAssistant] Could not load editable customer profiles:', e);
      }
    }

    // Render customer cards
    grid.innerHTML = '';

    customers.forEach(c => {
      const card = document.createElement('button');
      card.className = 'ai-setup-customer-card';
      card.innerHTML = `
        <span class="ai-setup-customer-name">${escapeHtml(c.company)}</span>
        <span class="ai-setup-customer-industry">${escapeHtml(c.industry)}</span>
      `;
      card.addEventListener('click', () => selectCustomer(c));
      grid.appendChild(card);
    });

    // "New customer" option
    const blankCard = document.createElement('button');
    blankCard.className = 'ai-setup-customer-card ai-setup-customer-blank';
    blankCard.innerHTML = `
      <span class="ai-setup-customer-name">New customer</span>
      <span class="ai-setup-customer-industry">Start from scratch</span>
    `;
    blankCard.addEventListener('click', () => selectCustomer(null));
    grid.appendChild(blankCard);
  }

  async function selectCustomer(customer) {
    if (customer) {
      _customerId = customer.id;
      _customerData = JSON.parse(JSON.stringify(customer));
    } else {
      _customerId = 'new-' + Date.now();
      _customerData = null;
    }

    // Advance to role selection
    document.getElementById('ai-setup-customer-step').style.display = 'none';
    document.getElementById('ai-setup-role-step').style.display = '';
  }

  function initRoleSelection() {
    document.querySelectorAll('.ai-setup-role-card').forEach(card => {
      card.addEventListener('click', () => {
        _role = card.dataset.role;
        state.personaRole = _role;
        // Set the app state role
        if (_role === 'admin') {
          state.role = 'supervisor'; // admin views as supervisor by default
        } else {
          state.role = _role;
        }
        document.body.dataset.role = state.role;

        startOnboardingChat();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  ONBOARDING CHAT START
  // ═══════════════════════════════════════════════════════════

  function startOnboardingChat() {
    // Initialize session
    _session = AssistantStorage.loadOrCreate(_customerId, _role);
    AssistantStorage.setMode(_session, 'onboarding');
    AssistantStorage.setActiveSession(_customerId, _role);
    localStorage.setItem(AI_SETUP_MODE_KEY, 'onboarding');

    // Transition UI from meta-start to split
    document.getElementById('ai-setup-meta').style.display = 'none';
    document.getElementById('ai-setup-split').style.display = '';

    // Render initial preview
    renderPreview();

    // If resuming, replay existing messages
    const messages = AssistantStorage.getMessages(_session);
    if (messages.length > 0) {
      replayMessages(messages);
    } else {
      // Send initial empty context to get AI's welcome message
      triggerWelcome();
    }

    // Wire up chat input
    wireOnboardingInput();
  }

  async function triggerWelcome() {
    _loopRunning = true;
    showTypingIndicator();

    try {
      const systemPrompt = buildSystemPrompt();
      const tools = getToolsForRole(_role, 'onboarding');

      // Initial message with context
      let initialUserMsg = 'Hi! I\'m ready to set up my analytics dashboard. Please start by checking what is already known, ask for any website or files that would help, and then propose a strong first draft before asking me to fine-tune details.';
      if (_customerData) {
        initialUserMsg += ` I'm from ${_customerData.company}.`;
        if (_customerData.website) {
          initialUserMsg += ` The company website is ${_customerData.website}.`;
        }
        if (_customerData.helpCenterUrl) {
          initialUserMsg += ` The help center is ${_customerData.helpCenterUrl}.`;
        }
        if (Array.isArray(_customerData.extraSourceUrls) && _customerData.extraSourceUrls.length) {
          initialUserMsg += ` Additional source URLs are ${_customerData.extraSourceUrls.join(', ')}.`;
        }
      }

      AssistantStorage.appendMessage(_session, 'user', initialUserMsg);

      const resp = await fetch(`${PROXY_URL}/onboarding/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: AssistantStorage.getMessages(_session),
          tools,
        }),
      });
      const data = await resp.json();
      hideTypingIndicator();

      if (data.error) {
        renderErrorBubble(`API error: ${data.error.message || data.error}`);
        _loopRunning = false;
        return;
      }

      const content = data.content || [];
      const textBlocks = content.filter(b => b.type === 'text');
      const toolUseBlocks = content.filter(b => b.type === 'tool_use');

      if (textBlocks.length > 0) {
        renderAssistantBubble(textBlocks.map(b => b.text).join('\n\n'));
      }

      AssistantStorage.appendToolUse(_session, content);
      AssistantStorage.save(_session);

      // Handle any tool calls in the welcome response
      if (toolUseBlocks.length > 0) {
        const toolResults = [];
        let interruptedByUser = false;
        for (const block of toolUseBlocks) {
          const result = await handleToolUse(block.name, block.input);
          AssistantStorage.recordPatch(_session, block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
          if (result?.interruptedByUser) {
            interruptedByUser = true;
            break;
          }
        }
        AssistantStorage.appendToolResult(_session, toolResults);
        AssistantStorage.save(_session);
        if (injectQueuedUserMessage()) {
          await runAgenticLoop();
          return;
        }
        if (interruptedByUser) {
          return;
        }
        // Continue loop if there were tool calls
        await runAgenticLoop();
      }
    } catch (e) {
      hideTypingIndicator();
      console.error('[AdminAssistant] Welcome error:', e);
      renderErrorBubble('Could not connect to the AI. Please try refreshing.');
    } finally {
      _loopRunning = false;
    }
  }

  function replayMessages(messages) {
    const container = getMessagesContainer();
    if (!container) return;
    container.innerHTML = '';
    const uiOnlyTools = new Set(['show_options', 'show_boolean_choice', 'show_team_assignment_matrix', 'show_tab_editor', 'show_tab_proposal_choice', 'show_source_input']);

    messages.forEach(msg => {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          renderUserBubble(msg.content);
        }
        // Skip tool_result messages in replay (they were just data for the AI)
      } else if (msg.role === 'assistant') {
        const content = Array.isArray(msg.content) ? msg.content : [msg.content];
        content.forEach(block => {
          if (typeof block === 'string') {
            renderAssistantBubble(block);
          } else if (block.type === 'text') {
            renderAssistantBubble(block.text);
          }
          // Tool uses in replay are shown as config changes (already applied)
          if (block.type === 'tool_use' && !uiOnlyTools.has(block.name)) {
            showConfigChange(`Applied: ${block.name}`);
          }
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  INPUT WIRING
  // ═══════════════════════════════════════════════════════════

  function wireOnboardingInput() {
    const input = document.getElementById('ai-setup-input');
    const sendBtn = document.getElementById('ai-setup-send');
    const skipBtn = document.getElementById('ai-setup-skip-btn');

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
      // Auto-grow
      input.addEventListener('input', () => autoGrow(input));
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', handleSend);
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', handleSkip);
    }
  }

  function wireAssistantInput() {
    const input = document.getElementById('assistant-panel-input');
    const sendBtn = document.getElementById('assistant-panel-send');

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
      input.addEventListener('input', () => autoGrow(input));
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', handleSend);
    }
  }

  function handleSend() {
    const text = getInputValue();
    if (!text) return;
    if (_pendingResolve) {
      _queuedUserMessage = text;
      clearInput();
      const resolve = _pendingResolve;
      _pendingResolve = null;
      disableLatestInteractiveUI();
      resolve({ skipped: true, interruptedByUser: true });
      return;
    }
    if (_loopRunning) return;
    sendMessage(text);
  }

  function handleSkip() {
    // Preserve partial progress, switch to assistant mode
    void handleCompleteOnboarding({ summary: 'User skipped setup — defaults applied.' });
  }

  function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // ═══════════════════════════════════════════════════════════
  //  POST-ONBOARDING: FAB + ASSISTANT PANEL
  // ═══════════════════════════════════════════════════════════

  function showFAB(options = {}) {
    const { pulse = false, hidden = false } = options;
    const fab = document.getElementById('assistant-fab');
    if (fab) {
      fab.style.display = '';
      fab.style.visibility = hidden ? 'hidden' : '';
      fab.style.opacity = hidden ? '0' : '';
      fab.style.pointerEvents = hidden ? 'none' : '';
      fab.classList.remove('pulse');
      if (!hidden && pulse) {
        fab.classList.add('pulse');
        setTimeout(() => fab.classList.remove('pulse'), 3000);
      }
    }
  }

  async function animateOnboardingCollapseToFAB() {
    const overlay = document.getElementById('ai-setup-overlay');
    const fab = document.getElementById('assistant-fab');
    const split = document.getElementById('ai-setup-split');
    const meta = document.getElementById('ai-setup-meta');
    const metaCard = meta?.querySelector('.ai-setup-meta-card');
    const surface = split && split.style.display !== 'none' ? split : metaCard;

    if (!overlay || !fab || !surface || typeof surface.animate !== 'function') {
      return;
    }

    showFAB({ hidden: true });

    const sourceRect = surface.getBoundingClientRect();
    const fabRect = fab.getBoundingClientRect();
    if (!sourceRect.width || !sourceRect.height || !fabRect.width || !fabRect.height) {
      fab.style.display = 'none';
      fab.style.visibility = '';
      fab.style.opacity = '';
      fab.style.pointerEvents = '';
      return;
    }

    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = fabRect.left + fabRect.width / 2;
    const targetCenterY = fabRect.top + fabRect.height / 2;
    const scale = Math.min(fabRect.width / sourceRect.width, fabRect.height / sourceRect.height);
    const translateX = targetCenterX - sourceCenterX;
    const translateY = targetCenterY - sourceCenterY;

    surface.style.transformOrigin = 'center center';
    overlay.style.pointerEvents = 'none';

    let surfaceAnimation = null;
    let overlayAnimation = null;

    try {
      surfaceAnimation = surface.animate([
        {
          transform: 'translate3d(0, 0, 0) scale(1)',
          opacity: 1,
          borderRadius: getComputedStyle(surface).borderRadius || '0px',
          filter: 'blur(0px)',
        },
        {
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${Math.max(scale, 0.04)})`,
          opacity: 0.18,
          borderRadius: '999px',
          filter: 'blur(1px)',
        },
      ], {
        duration: 520,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'forwards',
      });

      overlayAnimation = overlay.animate([
        { backgroundColor: 'rgba(255, 255, 255, 1)' },
        { backgroundColor: 'rgba(255, 255, 255, 0)' },
      ], {
        duration: 520,
        easing: 'ease-out',
        fill: 'forwards',
      });

      await Promise.allSettled([surfaceAnimation.finished, overlayAnimation.finished]);
    } finally {
      surfaceAnimation?.cancel();
      overlayAnimation?.cancel();
      surface.style.transformOrigin = '';
      overlay.style.pointerEvents = '';
      overlay.style.backgroundColor = '';
      fab.style.display = 'none';
      fab.style.visibility = '';
      fab.style.opacity = '';
      fab.style.pointerEvents = '';
    }
  }

  function initFAB() {
    const fab = document.getElementById('assistant-fab');
    const panel = document.getElementById('assistant-panel');
    const closeBtn = document.getElementById('assistant-panel-close');

    if (fab) {
      fab.addEventListener('click', () => openAssistantPanel());
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeAssistantPanel());
    }
  }

  function openAssistantPanel() {
    const panel = document.getElementById('assistant-panel');
    const fab = document.getElementById('assistant-fab');
    if (!panel) return;

    panel.style.display = '';
    if (fab) fab.style.display = 'none';

    // Collapse prototype guide if open
    if (window.setPanelState) {
      window.setPanelState('bar');
    }

    // Initialize session for assistant mode
    if (!_session) {
      const active = AssistantStorage.getActiveSession();
      _customerId = active.customerId;
      _role = active.role || 'admin';
      _session = AssistantStorage.loadOrCreate(_customerId, _role);
    }
    AssistantStorage.setMode(_session, 'assistant');

    // Replay messages into assistant panel
    const messages = AssistantStorage.getMessages(_session);
    const container = document.getElementById('assistant-panel-messages');
    if (container) {
      container.innerHTML = '';
      // Switch to assistant panel then replay
      replayMessages(messages);
    }

    wireAssistantInput();
  }

  function closeAssistantPanel() {
    const panel = document.getElementById('assistant-panel');
    const fab = document.getElementById('assistant-fab');
    if (panel) panel.style.display = 'none';
    if (fab) showFAB();
  }

  // ═══════════════════════════════════════════════════════════
  //  RETRY
  // ═══════════════════════════════════════════════════════════

  function retryLastMessage() {
    if (!_session || _loopRunning) return;
    const messages = AssistantStorage.getMessages(_session);
    // Find last user text message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && typeof messages[i].content === 'string') {
        // Remove everything after this message to retry
        _session.messages = messages.slice(0, i);
        AssistantStorage.save(_session);
        sendMessage(messages[i].content);
        return;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  let _initialized = false;

  function init() {
    // Check feature flag — bail out if not enabled
    if (typeof isFeatureEnabled === 'function' && !isFeatureEnabled('ai-onboarding')) return;
    _initialized = true;

    const mode = localStorage.getItem(AI_SETUP_MODE_KEY);

    initFAB();

    if (mode === 'assistant') {
      // Already completed onboarding — just show FAB
      const active = AssistantStorage.getActiveSession();
      _customerId = active.customerId;
      _role = active.role || 'admin';
      _session = AssistantStorage.loadOrCreate(_customerId, _role);
      showFAB();
      return;
    }

    if (mode === 'onboarding') {
      // Resuming mid-onboarding
      const active = AssistantStorage.getActiveSession();
      _customerId = active.customerId;
      _role = active.role || 'admin';
      _session = AssistantStorage.loadOrCreate(_customerId, _role);

      // Load customer data if available
      if (_customerId && !_customerId.startsWith('new-') && window.CustomerProfilesStore?.getById) {
        _customerData = window.CustomerProfilesStore.getById(_customerId);
      }

      showOnboarding();
      // Go directly to chat split (skip meta-start)
      document.getElementById('ai-setup-meta').style.display = 'none';
      document.getElementById('ai-setup-split').style.display = '';
      renderPreview();

      const messages = AssistantStorage.getMessages(_session);
      if (messages.length > 0) {
        replayMessages(messages);
      }
      wireOnboardingInput();
      return;
    }

    // No mode set — first visit, initialize meta-start
    initMetaStart();
    initRoleSelection();

    // Show overlay if walkthrough is already done
    if (localStorage.getItem('trengo_onboarding_done')) {
      showOnboarding();
    }
  }

  function showOnboarding() {
    const overlay = document.getElementById('ai-setup-overlay');
    if (overlay) overlay.style.display = '';
    if (window.setGuideOnboardingState) {
      window.setGuideOnboardingState(true);
    }
    // Keep the settings cog visible/hoverable, but lock clicks during onboarding
    const settingsNav = document.getElementById('settings-nav');
    if (settingsNav) {
      settingsNav.dataset.disabled = 'true';
    }
  }

  function hideOnboarding() {
    const overlay = document.getElementById('ai-setup-overlay');
    if (overlay) overlay.style.display = 'none';
    // Re-enable settings cog clicks after onboarding
    const settingsNav = document.getElementById('settings-nav');
    if (settingsNav) {
      delete settingsNav.dataset.disabled;
    }
  }

  /**
   * Called from app.js after walkthrough completes.
   * Checks if onboarding should start.
   */
  function tryStartOnboarding() {
    // If init() never ran (flag disabled), try now
    if (!_initialized) init();
    if (!_initialized) return; // flag still off

    const mode = localStorage.getItem(AI_SETUP_MODE_KEY);
    if (mode === 'assistant') {
      showFAB();
      return;
    }
    if (mode === 'onboarding') {
      showOnboarding();
      return;
    }
    // First time — show the full-screen onboarding
    showOnboarding();
  }

  /**
   * Reset all assistant/onboarding state.
   * Called from "Reset all" button.
   */
  function resetAll() {
    AssistantStorage.clearAll();
    localStorage.removeItem(AI_SETUP_MODE_KEY);
    _session = null;
    _customerData = null;
    _customerId = null;
    _role = null;

    // Hide UI elements
    hideOnboarding();
    const fab = document.getElementById('assistant-fab');
    const panel = document.getElementById('assistant-panel');
    if (fab) fab.style.display = 'none';
    if (panel) panel.style.display = 'none';
    if (window.setGuideOnboardingState) {
      window.setGuideOnboardingState(false);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    init,
    tryStartOnboarding,
    resetAll,
    retryLastMessage,
    showFAB,
    showOnboarding,
  };
})();
