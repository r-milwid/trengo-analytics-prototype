const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Valid widget IDs (synced from widget-catalog.js) ─────────
const VALID_WIDGET_IDS = new Set([
  'ov-open-tickets', 'ov-assigned-tickets', 'ov-first-response', 'ov-escalation-rate',
  'ov-resolution-time', 'ov-pipeline-value', 'ov-win-rate', 'ov-avg-deal-size',
  'ov-avg-sales-cycle', 'ov-tickets-by-hour', 'ov-vc-missed-calls', 'ov-vc-total-calls',
  'ov-intent-trends', 'ov-knowledge-gaps', 'ov-exceptions', 'ov-vc-calls-by-hour',
  'un-tickets-created', 'un-leads-created', 'un-deals-created', 'un-sales-funnel',
  'un-deals-won-by-channel', 'un-deals-by-channel', 'un-entry-channels',
  'un-vc-inbound-outbound', 'un-vc-duration-inbound-outbound', 'un-new-returning',
  'un-intent-clusters', 'un-intent-trends', 'un-emerging-intents', 'un-unknown-intents',
  'un-escalations-intent', 'un-vc-channel-performance',
  'op-first-response', 'op-vc-time-to-answer', 'op-vc-call-duration-kpis',
  'op-resolution-time', 'op-created-closed', 'op-reopened', 'op-workload-agent',
  'op-sales-performance', 'op-channel-stage-matrix', 'op-vc-calls-by-team',
  'op-vc-avg-wait-by-team', 'op-vc-longest-wait', 'op-vc-duration-by-team',
  'op-sla-compliance', 'op-bottlenecks', 'op-channel-perf', 'op-capacity-demand',
  'op-vc-abandonment-trend', 'op-vc-callbacks-requested', 'op-vc-agent-online-status',
  'im-csat', 'im-response-rate', 'im-vc-fcr-rate', 'im-vc-call-ticket-rate',
  'im-responses', 'im-satisfaction-score', 'im-surveys', 'im-reopen-rate',
  'im-knowledge-gaps', 'im-suggested-knowledge', 'im-opportunities',
  'au-ai-tickets', 'au-resolution-rate', 'au-assistance-rate', 'au-open-ticket-rate',
  'au-vc-ivr-queue-time', 'au-journeys-success', 'au-journeys-escalations',
  'au-handoff-reasons', 'au-conflicts', 'au-safety',
]);

// ── Config validation ────────────────────────────────────────
function validateConfig(config) {
  const errors = [];

  if (typeof config.version !== 'number') errors.push('missing or invalid "version"');

  // Tabs
  if (!Array.isArray(config.tabs) || config.tabs.length === 0) {
    errors.push('"tabs" must be a non-empty array');
  } else {
    const tabIds = new Set();
    config.tabs.forEach((t, i) => {
      if (!t.id || typeof t.id !== 'string') errors.push(`tabs[${i}]: missing "id"`);
      if (!t.label || typeof t.label !== 'string') errors.push(`tabs[${i}]: missing "label"`);
      if (t.id) tabIds.add(t.id);
    });

    // tabWidgets keys must reference existing tabs
    if (config.tabWidgets && typeof config.tabWidgets === 'object') {
      for (const tabId of Object.keys(config.tabWidgets)) {
        if (!tabIds.has(tabId)) errors.push(`tabWidgets["${tabId}"]: no matching tab`);
        const widgets = config.tabWidgets[tabId];
        if (Array.isArray(widgets)) {
          for (const wid of widgets) {
            // Allow custom tab IDs (custom-*) but validate widget IDs
            if (!VALID_WIDGET_IDS.has(wid)) errors.push(`tabWidgets["${tabId}"]: unknown widget "${wid}"`);
          }
        }
      }
    }

    // sectionOrder keys must reference existing tabs
    if (config.sectionOrder && typeof config.sectionOrder === 'object') {
      for (const secId of Object.keys(config.sectionOrder)) {
        if (!tabIds.has(secId)) errors.push(`sectionOrder["${secId}"]: no matching tab`);
        const order = config.sectionOrder[secId];
        if (Array.isArray(order)) {
          for (const wid of order) {
            if (!VALID_WIDGET_IDS.has(wid)) errors.push(`sectionOrder["${secId}"]: unknown widget "${wid}"`);
          }
        }
      }
    }
  }

  // Lens and role
  if (config.lens && !['support', 'sales'].includes(config.lens)) {
    errors.push(`"lens" must be "support" or "sales", got "${config.lens}"`);
  }
  if (config.role && !['supervisor', 'agent'].includes(config.role)) {
    errors.push(`"role" must be "supervisor" or "agent", got "${config.role}"`);
  }

  return errors;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const path = new URL(request.url).pathname;

    // ── GET /config/:userId — read user dashboard config ─────
    if (path.startsWith('/config/') && request.method === 'GET') {
      const userId = decodeURIComponent(path.split('/config/')[1]);
      if (!userId) return json({ error: 'missing userId' }, 400);
      try {
        const config = await env.DASHBOARD_CONFIG.get(userId, 'json');
        if (!config) return json({ error: 'not found' }, 404);
        return new Response(JSON.stringify(config), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
        });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── PUT /config/:userId — write user dashboard config ────
    if (path.startsWith('/config/') && request.method === 'PUT') {
      const userId = decodeURIComponent(path.split('/config/')[1]);
      if (!userId) return json({ error: 'missing userId' }, 400);
      try {
        const incoming = await request.json();
        const { baseRevision, ...config } = incoming;

        // Validate config shape
        const errors = validateConfig(config);
        if (errors.length > 0) {
          return json({ error: 'validation failed', details: errors }, 400);
        }

        // Optimistic concurrency check
        const existing = await env.DASHBOARD_CONFIG.get(userId, 'json');
        if (existing) {
          const currentRevision = existing.revision || 0;
          if (typeof baseRevision === 'number' && baseRevision !== currentRevision) {
            return json({ error: 'conflict', config: existing }, 409);
          }
          config.revision = currentRevision + 1;
        } else {
          // First write for this user
          config.revision = 1;
        }

        config.updatedAt = new Date().toISOString();
        await env.DASHBOARD_CONFIG.put(userId, JSON.stringify(config));
        return json({ ok: true, revision: config.revision });
      } catch (e) {
        return json({ error: 'kv error', message: e.message }, 500);
      }
    }

    // ── POST /feedback — store one feedback item ──────────────
    if (path === '/feedback' && request.method === 'POST') {
      const item = await request.json();
      const id = Date.now().toString();
      await env.FEEDBACK_STORE.put(id, JSON.stringify({ id, ...item }));
      return json({ ok: true, id });
    }

    // ── PUT /feedback/:id — update an existing feedback item ─────
    if (path.startsWith('/feedback/') && request.method === 'PUT') {
      const id = path.split('/feedback/')[1];
      if (!id) return json({ error: 'missing id' }, 400);
      try {
        const existing = await env.FEEDBACK_STORE.get(id, 'json');
        if (!existing) return json({ error: 'not found' }, 404);
        const patch = await request.json();
        await env.FEEDBACK_STORE.put(id, JSON.stringify({ ...existing, ...patch }));
        return json({ ok: true });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── DELETE /feedback/:id — delete a feedback item ───────────
    if (path.startsWith('/feedback/') && request.method === 'DELETE') {
      const id = path.split('/feedback/')[1];
      if (!id) return json({ error: 'missing id' }, 400);
      try {
        await env.FEEDBACK_STORE.delete(id);
        return json({ ok: true });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── DELETE /feedback — delete all feedback items ──────────
    if (path === '/feedback' && request.method === 'DELETE') {
      try {
        const list = await env.FEEDBACK_STORE.list();
        await Promise.all(list.keys.map(k => env.FEEDBACK_STORE.delete(k.name)));
        return json({ ok: true, deleted: list.keys.length });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── GET /feedback — retrieve all feedback items ───────────
    if (path === '/feedback' && request.method === 'GET') {
      try {
        const list = await env.FEEDBACK_STORE.list();
        const items = await Promise.all(
          list.keys.map(k => env.FEEDBACK_STORE.get(k.name, 'json'))
        );
        return new Response(JSON.stringify({ feedback: items.filter(Boolean) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
        });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── POST /onboarding/chat — Sonnet proxy with tool_use ────
    if (path === '/onboarding/chat' && request.method === 'POST') {
      try {
        const { system, messages, tools } = await request.json();
        const body = {
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system,
          messages,
        };
        if (tools && tools.length > 0) body.tools = tools;
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        return json(data);
      } catch (e) {
        return json({ error: 'proxy error', message: e.message }, 500);
      }
    }

    // ── GET /profile/:userId — read customer profile ─────────
    if (path.startsWith('/profile/') && request.method === 'GET') {
      const userId = decodeURIComponent(path.split('/profile/')[1]);
      if (!userId) return json({ error: 'missing userId' }, 400);
      try {
        const profile = await env.CUSTOMER_PROFILES.get(userId, 'json');
        if (!profile) return json({ error: 'not found' }, 404);
        return new Response(JSON.stringify(profile), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
        });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── PUT /profile/:userId — write customer profile ────────
    if (path.startsWith('/profile/') && request.method === 'PUT') {
      const userId = decodeURIComponent(path.split('/profile/')[1]);
      if (!userId) return json({ error: 'missing userId' }, 400);
      try {
        const profile = await request.json();
        profile.updatedAt = new Date().toISOString();
        if (!profile.createdAt) profile.createdAt = profile.updatedAt;
        await env.CUSTOMER_PROFILES.put(userId, JSON.stringify(profile));
        return json({ ok: true });
      } catch (e) {
        return json({ error: 'kv error', message: e.message }, 500);
      }
    }

    // ── POST /extract-url — fetch URL and extract text ───────
    if (path === '/extract-url' && request.method === 'POST') {
      try {
        const { url } = await request.json();
        if (!url) return json({ error: 'missing url' }, 400);

        const fetchWithProfile = async (targetUrl) => fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          redirect: 'follow',
        });

        let response = await fetchWithProfile(url);
        if (!response.ok) {
          const normalized = (() => {
            try {
              const parsed = new URL(url);
              return parsed.origin + '/';
            } catch {
              return null;
            }
          })();
          if (normalized && normalized !== url) {
            response = await fetchWithProfile(normalized);
          }
        }
        if (!response.ok) {
          return json({ error: 'fetch failed', status: response.status }, 502);
        }

        const html = await response.text();

        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // Strip HTML to plain text
        let text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')  // remove scripts
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')    // remove styles
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')        // remove nav
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')  // remove header
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')  // remove footer
          .replace(/<[^>]+>/g, ' ')                           // strip remaining tags
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#?\w+;/g, ' ')                           // remaining entities
          .replace(/\s+/g, ' ')                               // collapse whitespace
          .trim();

        // Truncate to ~50k chars
        if (text.length > 50000) text = text.substring(0, 50000) + '... [truncated]';

        return json({ text, title, url });
      } catch (e) {
        return json({ error: 'extraction failed', message: e.message }, 500);
      }
    }

    // ── POST / — chat proxy (Prototype Guide — Haiku) ────────
    if (path === '/' && request.method === 'POST') {
      const { system, messages } = await request.json();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system,
          messages,
        }),
      });
      const data = await response.json();
      return json(data);
    }

    return new Response('Not found', { status: 404 });
  },
};
