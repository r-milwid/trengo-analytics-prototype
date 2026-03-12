/* ============================================================
   TRENGO ANALYTICS — Assistant Storage (localStorage)
   ============================================================
   Manages structured memory + conversation history for the
   AI onboarding agent and post-onboarding admin assistant.
   Keyed by {customerId}:{role} to support multi-customer testing.
   ============================================================ */

const AssistantStorage = (() => {
  const NAMESPACE = 'trengo_assistant';
  const META_KEY = 'trengo_assistant_meta';

  // ── Storage key helpers ──────────────────────────────────
  function storageKey(customerId, role) {
    return `${NAMESPACE}_${customerId || 'default'}_${role || 'admin'}`;
  }

  // ── Default session shape ────────────────────────────────
  function createEmpty(customerId, role) {
    return {
      customerId: customerId || null,
      impersonationRole: role || 'admin',
      mode: 'onboarding', // 'onboarding' | 'assistant'

      structured: {
        confirmedFacts: {},    // { company, industry, productSummary, ... }
        teamAssignments: {},   // { 'Support': 'resolve' | 'convert' | 'both' }
        collectedGoals: [],    // ['reduce response time', 'track pipeline']
        analyzedSources: [],   // [{ url?, filename?, title, summary, extractedText }]
        appliedPatches: [],    // [{ tool, input, timestamp }]
        pendingProposals: [],  // [{ id, description, patch }]
        suggestedConfigDraft: null, // latest AI-suggested config snapshot
        pendingTabDraft: null,      // latest editable tab draft in progress
        sourceStatus: {
          requested: false,
          provided: false,
          skipped: false,
          lastUpdatedAt: null,
        },
        pendingProposalSource: null, // 'ai' | 'user' | null
      },

      messages: [], // Anthropic messages format (role + content)

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function ensureSessionShape(session) {
    if (!session) return null;
    if (!session.structured) session.structured = {};
    const defaults = createEmpty(session.customerId, session.impersonationRole || 'admin');
    session.impersonationRole = session.impersonationRole || defaults.impersonationRole;
    session.mode = session.mode || defaults.mode;
    session.structured = {
      ...defaults.structured,
      ...session.structured,
      sourceStatus: {
        ...defaults.structured.sourceStatus,
        ...(session.structured.sourceStatus || {}),
      },
    };
    if (!Array.isArray(session.messages)) session.messages = [];
    if (!session.createdAt) session.createdAt = defaults.createdAt;
    if (!session.updatedAt) session.updatedAt = defaults.updatedAt;
    return session;
  }

  // ── Meta: which customer/role is active ──────────────────
  function getMeta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY)) || {};
    } catch { return {}; }
  }

  function setMeta(meta) {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function getActiveSession() {
    const meta = getMeta();
    return { customerId: meta.customerId || null, role: meta.role || null };
  }

  function setActiveSession(customerId, role) {
    setMeta({ customerId, role });
  }

  // ── Load / Save full session ─────────────────────────────
  function load(customerId, role) {
    const key = storageKey(customerId, role);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return ensureSessionShape(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function save(session) {
    if (!session) return;
    session.updatedAt = new Date().toISOString();
    const key = storageKey(session.customerId, session.impersonationRole);
    localStorage.setItem(key, JSON.stringify(session));
  }

  function loadOrCreate(customerId, role) {
    const existing = load(customerId, role);
    if (existing) return existing;
    const fresh = createEmpty(customerId, role);
    save(fresh);
    return fresh;
  }

  // ── Messages ─────────────────────────────────────────────
  function getMessages(session) {
    return session ? session.messages : [];
  }

  function appendMessage(session, role, content) {
    if (!session) return;
    session.messages.push({ role, content });
    session.updatedAt = new Date().toISOString();
  }

  function appendToolUse(session, assistantContent) {
    // assistantContent is the full content array from the API response
    if (!session) return;
    session.messages.push({ role: 'assistant', content: assistantContent });
    session.updatedAt = new Date().toISOString();
  }

  function appendToolResult(session, toolResults) {
    // toolResults is an array of { type: 'tool_result', tool_use_id, content }
    if (!session) return;
    session.messages.push({ role: 'user', content: toolResults });
    session.updatedAt = new Date().toISOString();
  }

  // ── Structured state updates ─────────────────────────────
  function updateFacts(session, facts) {
    if (!session) return;
    Object.assign(session.structured.confirmedFacts, facts);
  }

  function setTeamAssignments(session, assignments) {
    if (!session) return;
    Object.assign(session.structured.teamAssignments, assignments);
  }

  function addGoal(session, goal) {
    if (!session) return;
    if (!session.structured.collectedGoals.includes(goal)) {
      session.structured.collectedGoals.push(goal);
    }
  }

  function addSource(session, source) {
    if (!session) return;
    session.structured.analyzedSources.push({
      ...source,
      addedAt: new Date().toISOString(),
    });
    setSourceStatus(session, { requested: true, provided: true, skipped: false });
  }

  function recordPatch(session, tool, input) {
    if (!session) return;
    session.structured.appliedPatches.push({
      tool,
      input,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Mode transitions ─────────────────────────────────────
  function getMode(session) {
    return session ? session.mode : null;
  }

  function setMode(session, mode) {
    if (!session) return;
    session.mode = mode;
  }

  function setSuggestedConfigDraft(session, draft) {
    if (!session) return;
    session.structured.suggestedConfigDraft = draft || null;
  }

  function setPendingTabDraft(session, draft) {
    if (!session) return;
    session.structured.pendingTabDraft = draft || null;
  }

  function setSourceStatus(session, patch) {
    if (!session) return;
    session.structured.sourceStatus = {
      ...session.structured.sourceStatus,
      ...patch,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  function setPendingProposalSource(session, source) {
    if (!session) return;
    session.structured.pendingProposalSource = source || null;
  }

  // ── Reset ────────────────────────────────────────────────
  function clearAll() {
    // Remove all assistant-related localStorage keys
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(NAMESPACE) || key === META_KEY)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  function clearSession(customerId, role) {
    const key = storageKey(customerId, role);
    localStorage.removeItem(key);
  }

  // ── Build compact context for system prompt ──────────────
  function buildPromptContext(session) {
    if (!session) return '';
    const s = session.structured;
    const parts = [];

    if (Object.keys(s.confirmedFacts).length > 0) {
      parts.push('Confirmed facts: ' + JSON.stringify(s.confirmedFacts));
    }
    if (Object.keys(s.teamAssignments).length > 0) {
      parts.push('Team assignments: ' + JSON.stringify(s.teamAssignments));
    }
    if (s.collectedGoals.length > 0) {
      parts.push('Goals: ' + s.collectedGoals.join(', '));
    }
    if (s.analyzedSources.length > 0) {
      const summaries = s.analyzedSources.map(src =>
        `- ${src.title || src.url || src.filename}: ${(src.summary || '').substring(0, 200)}`
      );
      parts.push('Analyzed sources:\n' + summaries.join('\n'));
    }
    if (s.sourceStatus) {
      parts.push('Source status: ' + JSON.stringify(s.sourceStatus));
    }
    if (s.suggestedConfigDraft) {
      const draftTabs = (Array.isArray(s.suggestedConfigDraft.tabs) ? s.suggestedConfigDraft.tabs : []).map(t => t.label).join(', ');
      parts.push('Suggested config draft: ' + JSON.stringify({
        tabs: draftTabs,
        widgetCount: Array.isArray(s.suggestedConfigDraft.widgetIds) ? s.suggestedConfigDraft.widgetIds.length : undefined,
      }));
    }
    if (s.pendingTabDraft) {
      const pendingTabs = (Array.isArray(s.pendingTabDraft) ? s.pendingTabDraft : []).map(t => t.label).join(', ');
      parts.push('Pending tab draft: ' + pendingTabs);
    }
    if (s.pendingProposalSource) {
      parts.push('Pending proposal source: ' + s.pendingProposalSource);
    }
    if (s.appliedPatches.length > 0) {
      parts.push('Applied changes: ' + s.appliedPatches.length + ' config patches');
    }

    return parts.join('\n\n');
  }

  // ── Get full source text for prompt injection ────────────
  function getSourceTexts(session) {
    if (!session) return '';
    return session.structured.analyzedSources
      .map(src => {
        const label = src.title || src.url || src.filename || 'Source';
        const text = src.extractedText || '';
        return `### ${label}\n${text}`;
      })
      .join('\n\n---\n\n');
  }

  return {
    getMeta,
    setMeta,
    getActiveSession,
    setActiveSession,
    load,
    save,
    loadOrCreate,
    createEmpty,
    getMessages,
    appendMessage,
    appendToolUse,
    appendToolResult,
    updateFacts,
    setTeamAssignments,
    addGoal,
    addSource,
    recordPatch,
    getMode,
    setMode,
    setSuggestedConfigDraft,
    setPendingTabDraft,
    setSourceStatus,
    setPendingProposalSource,
    clearAll,
    clearSession,
    buildPromptContext,
    getSourceTexts,
  };
})();
