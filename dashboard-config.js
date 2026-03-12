/* ============================================================
   TRENGO ANALYTICS PROTOTYPE — Dashboard Config Manager
   ============================================================
   Handles serialization, persistence (Cloudflare KV), and sync
   of per-user dashboard configuration. Used by both the UI
   (auto-save on changes) and the AI onboarding agent (GET/PUT).
   ============================================================ */

const DashboardConfig = (() => {
  const PROXY_URL = 'https://trengo-chatbot-proxy.analytics-chatbot.workers.dev';
  let _currentRevision = 0;
  let _saveTimer = null;
  let _userId = null;
  const SAVE_DEBOUNCE_MS = 1500;

  function normalizeTeamUsecase(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'support' || normalized === 'resolve') return 'resolve';
    if (normalized === 'sales' || normalized === 'convert') return 'convert';
    if (normalized === 'both') return 'both';
    return 'resolve';
  }

  // ── Serialize: state → config JSON ─────────────────────────
  function serialize(state, actor = 'ui') {
    // Convert tabWidgets Sets to arrays
    const tabWidgets = {};
    if (state.tabWidgets) {
      for (const [tabId, widgetSet] of Object.entries(state.tabWidgets)) {
        tabWidgets[tabId] = widgetSet instanceof Set ? [...widgetSet] : (Array.isArray(widgetSet) ? widgetSet : []);
      }
    }

    // Convert teamUsecases to teams format
    const teams = {};
    if (state.teamUsecases) {
      for (const [teamName, usecase] of Object.entries(state.teamUsecases)) {
        teams[teamName] = { usecase: normalizeTeamUsecase(usecase) };
      }
    }

    const teamDefinitions = Array.isArray(state.teams)
      ? state.teams.map(team => ({
          name: team.name,
          usecase: normalizeTeamUsecase(team.usecase || state.teamUsecases?.[team.name]),
          members: Array.isArray(team.members) ? [...team.members] : [],
        }))
      : [];

    return {
      version: 1,
      revision: _currentRevision,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
      lens: state.lens || 'support',
      role: state.role || 'supervisor',
      personaRole: state.personaRole || state.role || 'supervisor',
      teams,
      teamDefinitions,
      tabs: (state.tabs || []).map(t => ({
        id: t.id,
        label: t.label,
        category: t.category || null,
        isDefault: !!t.isDefault,
      })),
      tabWidgets,
      sectionOrder: state.sectionOrder ? { ...state.sectionOrder } : {},
      widgetSpans: state.widgetSpans ? { ...state.widgetSpans } : {},
    };
  }

  // ── Apply: config JSON → state ─────────────────────────────
  function apply(config, state) {
    if (!config) return;

    // Revision tracking
    if (typeof config.revision === 'number') {
      _currentRevision = config.revision;
    }

    // Lens & role
    if (config.lens) state.lens = config.lens;
    if (config.role) state.role = config.role;
    if (config.personaRole) state.personaRole = config.personaRole;

    // Teams → editable team definitions + teamUsecases
    if (Array.isArray(config.teamDefinitions) && config.teamDefinitions.length > 0) {
      state.teams = config.teamDefinitions.map(team => ({
        name: team.name,
        usecase: normalizeTeamUsecase(team.usecase),
        members: Array.isArray(team.members) ? [...team.members] : [],
      }));
      state.teamUsecases = {};
      state.teams.forEach(team => {
        state.teamUsecases[team.name] = normalizeTeamUsecase(team.usecase);
      });
    } else if (config.teams) {
      const existingMembers = new Map(
        Array.isArray(state.teams)
          ? state.teams.map(team => [team.name, Array.isArray(team.members) ? [...team.members] : []])
          : []
      );
      state.teamUsecases = {};
      state.teams = Object.entries(config.teams).map(([teamName, teamConfig]) => {
        const usecase = normalizeTeamUsecase(teamConfig.usecase);
        state.teamUsecases[teamName] = usecase;
        return {
          name: teamName,
          usecase,
          members: existingMembers.get(teamName) || [],
        };
      });
    }

    // Tabs
    if (config.tabs && config.tabs.length > 0) {
      state.tabs = config.tabs.map(t => ({
        id: t.id,
        label: t.label,
        category: t.category || null,
        isDefault: !!t.isDefault,
      }));
    }

    // Tab widgets — convert arrays back to Sets
    if (config.tabWidgets) {
      state.tabWidgets = {};
      for (const [tabId, widgetIds] of Object.entries(config.tabWidgets)) {
        state.tabWidgets[tabId] = new Set(Array.isArray(widgetIds) ? widgetIds : []);
      }
    }

    // Section order
    if (config.sectionOrder) {
      state.sectionOrder = {};
      for (const [sectionId, order] of Object.entries(config.sectionOrder)) {
        state.sectionOrder[sectionId] = Array.isArray(order) ? [...order] : [];
      }
    }

    // Widget spans
    if (config.widgetSpans) {
      state.widgetSpans = { ...config.widgetSpans };
    }

    // Clear computed layouts so they recompute
    state.sectionLayout = {};
  }

  // ── Load: GET /config/:userId ──────────────────────────────
  async function load(userId) {
    if (!userId) return null;
    try {
      const res = await fetch(`${PROXY_URL}/config/${encodeURIComponent(userId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && typeof data.revision === 'number') {
        _currentRevision = data.revision;
      }
      return data;
    } catch (e) {
      console.warn('[DashboardConfig] load failed:', e);
      return null;
    }
  }

  // ── Save: PUT /config/:userId ──────────────────────────────
  async function save(userId, config) {
    if (!userId) return false;
    try {
      const body = { ...config, baseRevision: _currentRevision };
      const res = await fetch(`${PROXY_URL}/config/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        // Conflict — server has a newer version
        console.warn('[DashboardConfig] save conflict (409). Reloading latest config.');
        const latest = await res.json();
        if (latest && latest.config) {
          _currentRevision = latest.config.revision || 0;
          // Apply the server's version (caller should re-render)
          if (typeof window._dashboardConfigConflictHandler === 'function') {
            window._dashboardConfigConflictHandler(latest.config);
          }
        }
        return false;
      }

      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.revision === 'number') {
          _currentRevision = data.revision;
        }
        return true;
      }

      console.warn('[DashboardConfig] save returned', res.status);
      return false;
    } catch (e) {
      console.warn('[DashboardConfig] save failed:', e);
      return false;
    }
  }

  // ── Notify Changed: debounced auto-save ────────────────────
  function notifyChanged() {
    if (!_userId) {
      _userId = localStorage.getItem('trengo_session_user_name');
    }
    if (!_userId) return; // No user, can't save

    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      // `state` is a global in app.js
      if (typeof state !== 'undefined') {
        const config = serialize(state, 'ui');
        save(_userId, config);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  // ── Set User ID ────────────────────────────────────────────
  function setUserId(userId) {
    _userId = userId;
  }

  // ── Get current revision ───────────────────────────────────
  function getRevision() {
    return _currentRevision;
  }

  return {
    serialize,
    apply,
    load,
    save,
    notifyChanged,
    setUserId,
    getRevision,
  };
})();
