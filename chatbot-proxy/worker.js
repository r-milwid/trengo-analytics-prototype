import { handleAnalyticsQuery } from './analytics-query.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, OPTIONS',
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

    // ── POST /onboarding/chat — AI proxy with Anthropic → OpenAI fallback ────
    if (path === '/onboarding/chat' && request.method === 'POST') {
      try {
        const { system, messages, tools } = await request.json();

        // --- Provider 1: Anthropic (Claude Sonnet) ---
        if (env.ANTHROPIC_API_KEY) {
          const anthropicBody = {
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system,
            messages,
          };
          if (tools && tools.length > 0) anthropicBody.tools = tools;
          const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(anthropicBody),
          });
          const anthropicData = await anthropicResp.json();
          // Only fall through on billing/auth errors, not on successful responses (even with stop_reason)
          if (anthropicResp.ok) return json(anthropicData);
          const errType = anthropicData?.error?.type || '';
          const errMsg = anthropicData?.error?.message || '';
          const isBillingOrAuth = errType === 'authentication_error' ||
            errMsg.toLowerCase().includes('credit') ||
            errMsg.toLowerCase().includes('billing') ||
            anthropicResp.status === 401 || anthropicResp.status === 403;
          if (!isBillingOrAuth) return json(anthropicData, anthropicResp.status);
          // Billing/auth error → fall through to OpenAI
        }

        // --- Provider 2: OpenAI (GPT-4.1) ---
        if (env.OPENAI_API_KEY) {
          // Convert Anthropic message format to OpenAI format
          const openaiMessages = [];
          if (system) openaiMessages.push({ role: 'system', content: system });
          for (const msg of messages) {
            if (typeof msg.content === 'string') {
              openaiMessages.push({ role: msg.role, content: msg.content });
            } else if (Array.isArray(msg.content)) {
              // Handle tool_result blocks and text blocks
              const parts = [];
              const toolResults = [];
              for (const block of msg.content) {
                if (block.type === 'text') parts.push(block.text);
                else if (block.type === 'tool_use') {
                  // Assistant tool call — handled separately
                  openaiMessages.push({ role: 'assistant', content: parts.length ? parts.join('\n') : null,
                    tool_calls: [{ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } }] });
                  parts.length = 0;
                  continue;
                } else if (block.type === 'tool_result') {
                  toolResults.push({ role: 'tool', tool_call_id: block.tool_use_id, content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content) });
                }
              }
              if (parts.length > 0) openaiMessages.push({ role: msg.role, content: parts.join('\n') });
              toolResults.forEach(tr => openaiMessages.push(tr));
            }
          }

          // Convert Anthropic tools to OpenAI function format
          let openaiTools;
          if (tools && tools.length > 0) {
            openaiTools = tools.map(t => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.input_schema },
            }));
          }

          const openaiBody = { model: 'gpt-4.1', messages: openaiMessages, max_tokens: 4096 };
          if (openaiTools) openaiBody.tools = openaiTools;

          const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
            body: JSON.stringify(openaiBody),
          });
          const openaiData = await openaiResp.json();

          if (openaiResp.ok) {
            // Normalise OpenAI response → Anthropic format for frontend compatibility
            const choice = openaiData.choices?.[0];
            const contentBlocks = [];
            if (choice?.message?.content) contentBlocks.push({ type: 'text', text: choice.message.content });
            if (choice?.message?.tool_calls) {
              for (const tc of choice.message.tool_calls) {
                contentBlocks.push({
                  type: 'tool_use', id: tc.id, name: tc.function.name,
                  input: JSON.parse(tc.function.arguments || '{}'),
                });
              }
            }
            return json({
              id: openaiData.id, type: 'message', role: 'assistant', content: contentBlocks,
              stop_reason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
              model: openaiData.model, provider: 'openai',
            });
          }
          const openaiErr = openaiData?.error?.code || openaiData?.error?.type || '';
          const isOpenAIBilling = openaiErr === 'insufficient_quota' || openaiResp.status === 401 || openaiResp.status === 429;
          if (!isOpenAIBilling) return json({ error: openaiData?.error?.message || 'OpenAI error' }, openaiResp.status);
          // Fall through to Gemini
        }

        return json({ error: 'No AI provider available — check API keys' }, 503);
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

    // ── POST /analytics/query — semantic analytics query ────
    if (path === '/analytics/query' && request.method === 'POST') {
      try {
        const body = await request.json();
        const result = await handleAnalyticsQuery(body);
        const status = result?.error ? 400 : 200;
        return json(result, status);
      } catch (e) {
        return json({ error: 'analytics query failed', message: e.message }, 500);
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
