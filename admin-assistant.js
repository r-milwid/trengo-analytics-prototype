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
  let _pendingResolve = null; // for blocking UI tools (show_options, show_source_input)

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
      description: 'Configure per-team focus — assign convert (sales) or resolve (support) to each team. Auto-applied.',
      input_schema: {
        type: 'object',
        properties: {
          assignments: {
            type: 'object',
            description: 'Object mapping team name to "convert" or "resolve"',
            additionalProperties: { type: 'string', enum: ['convert', 'resolve'] }
          }
        },
        required: ['assignments']
      }
    },
    {
      name: 'configure_tabs',
      description: 'Set the dashboard tab structure — can rename any tab (including the 5 defaults), reorder, add, or remove tabs. IMPORTANT: Always propose this change to the user first via show_options with Accept/Modify/Skip before calling this tool.',
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
      description: 'Display clickable option cards, chips, or a list to the user. Use when clicking is faster than typing. The conversation will pause until the user makes a selection.',
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
    supervisor: ['set_lens', 'set_team_usecases', 'set_widget_visibility', 'show_options', 'show_source_input', 'complete_onboarding'],
    agent: ['set_widget_visibility', 'show_options', 'complete_onboarding'],
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
    const teamsInfo = TEAMS_DATA.map(t =>
      `- ${t.name} (${t.members.length} members: ${t.members.join(', ')})`
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

RESPONSE RULES
- 1-2 sentences per turn. Never exceed 3 unless the user asks for detail.
- ONE question per turn. No lists of upcoming questions.
- Prefer show_options (cards/chips) over free text when choices are from a known set.
- Do not repeat information the user already confirmed.
- Do not explain what you just did — the user can see the preview update.
- No filler ("Great!", "Sure!", "Absolutely!"). Get to the point.

SCOPE (${role})
${role === 'admin' ? 'Full access: lens, tabs (rename/reorder/add/remove), widget visibility, team usecases, company profile.' :
  role === 'supervisor' ? 'Team usecases (own team), widget visibility, lens.' :
  'Widget visibility for personal view only.'}

APPLY VS PROPOSE
- Tab structure changes (rename/reorder/add/remove): propose via show_options first.
- Low-confidence widget changes: propose first.
- Everything else: auto-apply.

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
- If pre-existing data exists, confirm it ("You're in Healthcare SaaS with 22 agents — sound right?"). Don't re-ask what you already know.
- Flow: confirm known data → lens/focus → teams → sources (offer upload/URL/paste) → widgets → complete.
- Skip anything the user wants to skip. No minimum. Defaults are fine.
- Preserve partial progress on skip.
- Call complete_onboarding when the user is satisfied or wants to finish.`;
    } else {
      prompt += `

ASSISTANT MODE
- User finished (or skipped) onboarding. Help with changes, not re-onboarding.
- Do not ask setup questions unprompted.
- Respond to what they ask. Suggest only when directly relevant.`;
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
      case 'show_source_input':
        return handleShowSourceInput(toolInput);
      case 'complete_onboarding':
        return handleCompleteOnboarding(toolInput);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
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
    state.role = role;
    document.body.dataset.role = role;
    document.querySelectorAll('#role-toggle .role-preview-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === role);
    });
    [...state.loadedSections].forEach(s => remountSection(s));
    DashboardConfig.notifyChanged();
    renderPreview();
    updatePreviewRoleBadge();
    showConfigChange(`Role set to ${role}`);
    return { success: true, role };
  }

  function handleSetTeamUsecases({ assignments }) {
    if (!state.teamUsecases) state.teamUsecases = {};
    Object.assign(state.teamUsecases, assignments);
    setFeatureFlag('team-usecases', true);
    applyTeamSettingsFlag();
    [...state.loadedSections].forEach(s => remountSection(s));
    DashboardConfig.notifyChanged();
    AssistantStorage.setTeamAssignments(_session, assignments);
    renderPreview();
    const summary = Object.entries(assignments).map(([t, u]) => `${t}: ${u}`).join(', ');
    showConfigChange(`Team usecases updated`);
    return { success: true, assignments };
  }

  function handleConfigureTabs({ tabs }) {
    state.tabs = tabs.map(t => ({
      id: t.id,
      label: t.label,
      category: t.category || null,
      isDefault: DEFAULT_TABS.some(dt => dt.id === t.id),
    }));
    // Ensure tabWidgets exist for new tabs
    state.tabs.forEach(t => {
      if (!state.tabWidgets[t.id]) {
        state.tabWidgets[t.id] = new Set();
      }
    });
    renderTabs();
    renderSections();
    scrollToSection(state.tabs[0]?.id || 'overview', true);
    DashboardConfig.notifyChanged();
    renderPreview();
    showConfigChange(`Tabs updated`);
    return { success: true, tabs: state.tabs.map(t => ({ id: t.id, label: t.label })) };
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

  function handleShowSourceInput({ prompt, allowedTypes }) {
    // Also a blocking tool
    return new Promise(resolve => {
      _pendingResolve = resolve;
      renderSourceInputUI(prompt, allowedTypes || ['file', 'url', 'paste'], resolve);
    });
  }

  function handleCompleteOnboarding({ summary }) {
    AssistantStorage.setMode(_session, 'assistant');
    AssistantStorage.save(_session);
    localStorage.setItem(AI_SETUP_MODE_KEY, 'assistant');

    // Close overlay, show FAB
    const overlay = document.getElementById('ai-setup-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        hideOnboarding();
        overlay.style.opacity = '';
        overlay.style.transition = '';
      }, 300);
    }
    showFAB();
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
      for (const block of toolUseBlocks) {
        const result = await handleToolUse(block.name, block.input);
        AssistantStorage.recordPatch(_session, block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      // Append tool results to history
      AssistantStorage.appendToolResult(_session, toolResults);

      // Incremental save after each complete exchange
      AssistantStorage.save(_session);
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
    typing.innerHTML = '<span></span><span></span><span></span>';
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
      confirmBtn.textContent = 'Confirm selection';
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

  function disableOptions(wrapper) {
    wrapper.querySelectorAll('button').forEach(btn => {
      btn.disabled = true;
      btn.style.pointerEvents = 'none';
    });
  }

  // ── Source input UI (rendered when AI calls show_source_input)
  function renderSourceInputUI(prompt, allowedTypes, resolve) {
    const container = getMessagesContainer();
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-setup-source-input';

    // Prompt text
    const promptEl = document.createElement('div');
    promptEl.className = 'ai-setup-source-prompt';
    promptEl.textContent = prompt;
    wrapper.appendChild(promptEl);

    // Tab bar
    const tabs = document.createElement('div');
    tabs.className = 'ai-setup-source-tabs';
    const tabDefs = [
      { id: 'file', label: 'File' },
      { id: 'url', label: 'URL' },
      { id: 'paste', label: 'Paste' },
    ].filter(t => allowedTypes.includes(t.id));

    let activeTab = tabDefs[0]?.id;

    tabDefs.forEach(td => {
      const btn = document.createElement('button');
      btn.className = 'ai-setup-source-tab' + (td.id === activeTab ? ' active' : '');
      btn.textContent = td.label;
      btn.addEventListener('click', () => {
        activeTab = td.id;
        tabs.querySelectorAll('.ai-setup-source-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wrapper.querySelectorAll('.ai-setup-source-panel').forEach(p => p.style.display = 'none');
        wrapper.querySelector(`.ai-setup-source-panel[data-panel="${td.id}"]`).style.display = '';
      });
      tabs.appendChild(btn);
    });
    wrapper.appendChild(tabs);

    // File panel
    if (allowedTypes.includes('file')) {
      const filePanel = document.createElement('div');
      filePanel.className = 'ai-setup-source-panel';
      filePanel.dataset.panel = 'file';
      filePanel.style.display = activeTab === 'file' ? '' : 'none';
      filePanel.innerHTML = `
        <div class="ai-setup-source-dropzone" id="ai-setup-dropzone">
          <p>Drop a file here or click to browse</p>
          <p class="ai-setup-source-hint">PDF, DOCX, TXT, CSV</p>
          <input type="file" id="ai-setup-file-input" accept=".pdf,.docx,.txt,.csv" style="display:none">
        </div>
        <div class="ai-setup-source-file-name" id="ai-setup-file-name" style="display:none"></div>
      `;
      wrapper.appendChild(filePanel);
    }

    // URL panel
    if (allowedTypes.includes('url')) {
      const urlPanel = document.createElement('div');
      urlPanel.className = 'ai-setup-source-panel';
      urlPanel.dataset.panel = 'url';
      urlPanel.style.display = activeTab === 'url' ? '' : 'none';
      urlPanel.innerHTML = `
        <input type="url" class="ai-setup-source-url-input" placeholder="https://example.com" id="ai-setup-url-input">
      `;
      wrapper.appendChild(urlPanel);
    }

    // Paste panel
    if (allowedTypes.includes('paste')) {
      const pastePanel = document.createElement('div');
      pastePanel.className = 'ai-setup-source-panel';
      pastePanel.dataset.panel = 'paste';
      pastePanel.style.display = activeTab === 'paste' ? '' : 'none';
      pastePanel.innerHTML = `
        <textarea class="ai-setup-source-paste-input" placeholder="Paste text here..." rows="5" id="ai-setup-paste-input"></textarea>
      `;
      wrapper.appendChild(pastePanel);
    }

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.className = 'ai-setup-source-submit';
    submitBtn.textContent = 'Analyze';
    submitBtn.addEventListener('click', async () => {
      await processSourceSubmit(activeTab, wrapper, resolve);
    });
    wrapper.appendChild(submitBtn);

    // Skip button
    const skipBtn = document.createElement('button');
    skipBtn.className = 'ai-setup-source-skip';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      wrapper.classList.add('ai-setup-source-resolved');
      disableSourceInput(wrapper);
      _pendingResolve = null;
      resolve({ skipped: true });
    });
    wrapper.appendChild(skipBtn);

    container.appendChild(wrapper);
    scrollToBottom(container);

    // Wire up file interactions
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

  async function processSourceSubmit(tab, wrapper, resolve) {
    const processingEl = showProcessingState('Analyzing...');

    try {
      let result;
      if (tab === 'url') {
        const urlInput = wrapper.querySelector('#ai-setup-url-input');
        const url = urlInput?.value?.trim();
        if (!url) { hideProcessingState(processingEl); return; }
        processingEl.querySelector('.ai-setup-processing-text').textContent = 'Fetching website...';
        result = await extractFromUrl(url);
      } else if (tab === 'file') {
        const fileInput = wrapper.querySelector('#ai-setup-file-input');
        if (!fileInput?.files?.length) { hideProcessingState(processingEl); return; }
        const file = fileInput.files[0];
        processingEl.querySelector('.ai-setup-processing-text').textContent = `Extracting text from ${file.name}...`;
        result = await extractFromFile(file);
      } else if (tab === 'paste') {
        const pasteInput = wrapper.querySelector('#ai-setup-paste-input');
        const text = pasteInput?.value?.trim();
        if (!text) { hideProcessingState(processingEl); return; }
        result = { text, title: 'Pasted text', source: 'paste' };
      }

      hideProcessingState(processingEl);

      if (result && result.text) {
        // Store in session
        AssistantStorage.addSource(_session, {
          url: result.url || null,
          filename: result.filename || null,
          title: result.title || 'Source',
          summary: result.text.substring(0, 500),
          extractedText: result.text.substring(0, 30000),
        });
        AssistantStorage.save(_session);

        wrapper.classList.add('ai-setup-source-resolved');
        disableSourceInput(wrapper);
        _pendingResolve = null;
        resolve({
          success: true,
          title: result.title,
          textLength: result.text.length,
          preview: result.text.substring(0, 200),
        });
      } else {
        renderErrorBubble('Could not extract text from the source. Try a different format.');
      }
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
    el.innerHTML = `<div class="ai-setup-processing-spinner"></div><span class="ai-setup-processing-text">${escapeHtml(text)}</span>`;
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

    content.innerHTML = '';

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'preview-tab-bar';
    state.tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = 'preview-tab' + (tab.id === state.activeSection ? ' active' : '');
      btn.textContent = tab.label;
      tabBar.appendChild(btn);
    });
    content.appendChild(tabBar);

    // Widget cards for each section
    state.tabs.forEach(tab => {
      const section = document.createElement('div');
      section.className = 'preview-section';

      const header = document.createElement('div');
      header.className = 'preview-section-header';
      header.textContent = tab.label;
      section.appendChild(header);

      // Get visible widgets for this tab
      const widgets = getPreviewWidgets(tab.id);
      const grid = document.createElement('div');
      grid.className = 'preview-widget-grid';

      widgets.forEach(w => {
        const card = document.createElement('div');
        card.className = 'preview-widget-card';
        card.innerHTML = `
          <span class="preview-widget-title">${escapeHtml(w.title)}</span>
          <span class="preview-widget-type">${w.type}</span>
        `;
        grid.appendChild(card);
      });

      if (widgets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'preview-widget-empty';
        empty.textContent = 'No widgets configured';
        grid.appendChild(empty);
      }

      section.appendChild(grid);
      content.appendChild(section);
    });

    updatePreviewRoleBadge();
  }

  function getPreviewWidgets(tabId) {
    // Get widgets that would be visible in this tab given current state
    const sectionWidgets = WIDGETS[tabId] || [];
    return sectionWidgets.filter(w => {
      if (state.hiddenWidgets.has(w.id)) return false;
      const override = getEffectiveVisibilityForPreview(w);
      return override !== 'hide';
    });
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

  // ═══════════════════════════════════════════════════════════
  //  META-START: Customer + Role selection
  // ═══════════════════════════════════════════════════════════

  async function initMetaStart() {
    const grid = document.getElementById('ai-setup-customer-grid');
    if (!grid) return;

    // Load mock customer list
    let customers = [];
    try {
      const resp = await fetch('mock-customers/index.json');
      const data = await resp.json();
      customers = data.customers || [];
    } catch (e) {
      console.warn('[AdminAssistant] Could not load mock customers:', e);
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
      // Load full customer data
      try {
        const resp = await fetch(`mock-customers/${customer.file}`);
        _customerData = await resp.json();
      } catch (e) {
        console.warn('[AdminAssistant] Could not load customer data:', e);
        _customerData = customer;
      }
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
      let initialUserMsg = 'Hi! I\'m ready to set up my analytics dashboard.';
      if (_customerData) {
        initialUserMsg += ` I'm from ${_customerData.company}.`;
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
        for (const block of toolUseBlocks) {
          const result = await handleToolUse(block.name, block.input);
          AssistantStorage.recordPatch(_session, block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
        AssistantStorage.appendToolResult(_session, toolResults);
        AssistantStorage.save(_session);
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
          if (block.type === 'tool_use') {
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
    if (!text || _loopRunning) return;
    sendMessage(text);
  }

  function handleSkip() {
    // Preserve partial progress, switch to assistant mode
    handleCompleteOnboarding({ summary: 'User skipped setup — defaults applied.' });
  }

  function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  // ═══════════════════════════════════════════════════════════
  //  POST-ONBOARDING: FAB + ASSISTANT PANEL
  // ═══════════════════════════════════════════════════════════

  function showFAB() {
    const fab = document.getElementById('assistant-fab');
    if (fab) {
      fab.style.display = '';
      fab.classList.add('pulse');
      setTimeout(() => fab.classList.remove('pulse'), 3000);
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
    if (fab) fab.style.display = '';
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
      if (_customerId && !_customerId.startsWith('new-')) {
        fetch(`mock-customers/${_customerId}.json`)
          .then(r => r.json())
          .then(data => { _customerData = data; })
          .catch(() => {});
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
    // Disable settings cog during onboarding
    const settingsNav = document.getElementById('settings-nav');
    if (settingsNav) {
      settingsNav.style.pointerEvents = 'none';
      settingsNav.style.opacity = '0.35';
    }
  }

  function hideOnboarding() {
    const overlay = document.getElementById('ai-setup-overlay');
    if (overlay) overlay.style.display = 'none';
    // Re-enable settings cog
    const settingsNav = document.getElementById('settings-nav');
    if (settingsNav) {
      settingsNav.style.pointerEvents = '';
      settingsNav.style.opacity = '';
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
