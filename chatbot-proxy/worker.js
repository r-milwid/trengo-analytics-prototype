import { handleAnalyticsQuery } from './analytics-query.js';

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

// ── Feedback organizer prompt ──────────────────────────────
const ORGANIZER_SYSTEM_PROMPT = `You are a feedback organizer. You maintain a structured summary document for a product prototype's feedback.

You will receive:
1. The track type: "product" or "bugs"
2. The current structured summary (JSON with categories and items)
3. A new feedback submission to integrate

Your job:
- Decide if the new submission maps to an existing item (merge/enrich) or is genuinely new (add).
- Merge duplicates aggressively: If the new feedback describes the same concern as an existing item — even if worded differently — merge it. Do NOT create a duplicate. Update the item's summary to incorporate any new useful information from the submission, then FULLY REWRITE the summary so it reads as a single coherent statement (not an append). Increment reportCount.
- Add new items: If it's a genuinely new concern, add it under the most appropriate existing category, or create a new category if none fits. Set reportCount to 1.
- Keep summaries concise: Each item summary should be 1-2 sentences, written for a product manager. Use clear, actionable language.
- Keep categories clean: Use broad, meaningful category names. Merge near-duplicate categories.
- Preserve stable IDs: Never change an existing item's id. Generate new IDs as "item_" + timestamp for new items.
- Evidence IDs: Add the new submission's ID to the evidenceIds array of the item it maps to.

TRACK-SPECIFIC RULES:

For "bugs" track:
- reportCount is CRITICAL. It shows how many times a bug has been reported. Always display-worthy.
- Be extra aggressive about deduplication — different symptoms of the same root cause should be ONE item.
- Summaries should describe the bug clearly: what happens, where it happens, and any reproduction context.
- When merging, incorporate any new reproduction steps or affected areas, then rewrite cleanly.

For "product" track:
- reportCount tracks how many users raised the same feedback. Useful for prioritization.
- Summaries should be actionable product insights, not raw user quotes.

Output ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "categories": [
    {
      "name": "Category Name",
      "items": [
        {
          "id": "item_1234567890",
          "summary": "Concise actionable summary of the concern",
          "reportCount": 1,
          "evidenceIds": ["sub_id_1", "sub_id_2"],
          "lastUpdated": "ISO timestamp"
        }
      ]
    }
  ],
  "updatedAt": "ISO timestamp"
}`;

const REBUILD_SYSTEM_PROMPT = `You are a feedback organizer. You will receive a track type ("product" or "bugs") and a list of raw feedback submissions. Build a structured summary document from scratch.

Group related submissions into categories. Each category should have a meaningful name.
Within each category, create items that summarize distinct concerns. AGGRESSIVELY merge submissions about the same concern into one item — do NOT create duplicates.
Each item should have a concise 1-2 sentence summary written for a product manager.
Each item MUST include a reportCount field showing how many submissions were merged into it.
Link each item to the submission IDs that support it via evidenceIds.
Generate item IDs as "item_" + a unique number.

TRACK-SPECIFIC RULES:

For "bugs" track:
- Be extra aggressive about deduplication — different symptoms of the same root cause = ONE item with a higher reportCount.
- Summaries should clearly describe: what the bug is, where it occurs, and any reproduction context gathered from all merged reports.
- reportCount is critical for prioritizing bug fixes.

For "product" track:
- Summaries should be actionable product insights, not raw user quotes.
- reportCount shows how many users raised the same point, useful for prioritization.

Output ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "categories": [
    {
      "name": "Category Name",
      "items": [
        {
          "id": "item_1",
          "summary": "Concise actionable summary",
          "reportCount": 1,
          "evidenceIds": ["sub_id_1"],
          "lastUpdated": "ISO timestamp"
        }
      ]
    }
  ],
  "updatedAt": "ISO timestamp"
}`;

async function organizeFeedbackSummary(env, track, newSubmission) {
  const summaryKey = `summary:${track}`;
  const current = await env.FEEDBACK_STORE.get(summaryKey, 'json') || { categories: [], updatedAt: null };

  // Snapshot current summary before overwriting
  if (current.updatedAt) {
    await env.FEEDBACK_STORE.put(summaryKey + ':prev', JSON.stringify(current));
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: ORGANIZER_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Track type: ${track}\n\nCurrent ${track} summary:\n${JSON.stringify(current, null, 2)}\n\nNew submission to integrate:\nID: ${newSubmission.id}\nSection: ${newSubmission.section}\nText: ${newSubmission.rawText}`,
      }],
    }),
  });

  const data = await response.json();
  if (!data.content || !data.content[0]) throw new Error('Empty organizer response');

  const text = data.content[0].text.trim();
  const updated = JSON.parse(text);
  await env.FEEDBACK_STORE.put(summaryKey, JSON.stringify(updated));
}

async function rebuildFeedbackSummary(env, track, submissions) {
  // Snapshot current summary before overwriting
  const summaryKey = `summary:${track}`;
  const existing = await env.FEEDBACK_STORE.get(summaryKey, 'json');
  if (existing && existing.updatedAt) {
    await env.FEEDBACK_STORE.put(summaryKey + ':prev', JSON.stringify(existing));
  }

  if (submissions.length === 0) {
    await env.FEEDBACK_STORE.put(summaryKey, JSON.stringify({ categories: [], updatedAt: new Date().toISOString() }));
    return;
  }

  const submissionText = submissions.map(s =>
    `ID: ${s.id} | Section: ${s.section} | Text: ${s.rawText}`
  ).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: REBUILD_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Track type: ${track}\n\nBuild a ${track} feedback summary from these ${submissions.length} submissions:\n\n${submissionText}`,
      }],
    }),
  });

  const data = await response.json();
  if (!data.content || !data.content[0]) throw new Error('Empty rebuild response');

  const text = data.content[0].text.trim();
  const rebuilt = JSON.parse(text);
  await env.FEEDBACK_STORE.put(`summary:${track}`, JSON.stringify(rebuilt));
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

    // ── POST /feedback/submissions — store verbatim feedback + organize summaries ──
    if (path === '/feedback/submissions' && request.method === 'POST') {
      try {
        const item = await request.json();
        const id = Date.now().toString();
        const submission = {
          id,
          submittedAt: new Date().toISOString(),
          submitterName: item.name || null,
          rawText: item.text,
          section: item.section || 'General',
          type: item.type || 'product', // product | bug | both
          organizeStatus: 'pending',
        };
        // Store raw submission first — this must succeed before anything else
        await env.FEEDBACK_STORE.put(`sub:${id}`, JSON.stringify(submission));

        // Run organizer for applicable track(s)
        const tracks = submission.type === 'both' ? ['product', 'bugs'] : [submission.type === 'bug' ? 'bugs' : 'product'];
        let organizeOk = true;
        for (const track of tracks) {
          try {
            await organizeFeedbackSummary(env, track, submission);
          } catch (e) {
            console.error(`[organize] failed for ${track}:`, e.message);
            organizeOk = false;
          }
        }

        // Update submission status
        submission.organizeStatus = organizeOk ? 'organized' : 'needs_rebuild';
        await env.FEEDBACK_STORE.put(`sub:${id}`, JSON.stringify(submission));

        return json({ ok: true, id, organizeStatus: submission.organizeStatus });
      } catch (e) {
        return json({ error: 'submission failed', message: e.message }, 500);
      }
    }

    // ── GET /feedback/submissions — list submissions with optional filters ──
    if (path === '/feedback/submissions' && request.method === 'GET') {
      try {
        const url = new URL(request.url);
        const typeFilter = url.searchParams.get('type'); // product | bugs | bug | both
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        const cursor = url.searchParams.get('cursor') || undefined;

        const list = await env.FEEDBACK_STORE.list({ prefix: 'sub:', limit, cursor });
        const items = (await Promise.all(
          list.keys.map(k => env.FEEDBACK_STORE.get(k.name, 'json'))
        )).filter(Boolean).filter(s => !s.deleted);

        const filtered = typeFilter
          ? items.filter(s => {
              if (typeFilter === 'bugs') return s.type === 'bug' || s.type === 'both';
              if (typeFilter === 'product') return s.type === 'product' || s.type === 'both';
              return s.type === typeFilter;
            })
          : items;

        return new Response(JSON.stringify({
          submissions: filtered,
          cursor: list.list_complete ? null : list.cursor,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
        });
      } catch (e) {
        return json({ error: 'kv error', message: e.message }, 500);
      }
    }

    // ── PUT /feedback/submissions/:id — update a submission (e.g. add name) ──
    if (path.startsWith('/feedback/submissions/') && request.method === 'PUT') {
      const id = path.split('/feedback/submissions/')[1];
      if (!id) return json({ error: 'missing id' }, 400);
      try {
        const existing = await env.FEEDBACK_STORE.get(`sub:${id}`, 'json');
        if (!existing) return json({ error: 'not found' }, 404);
        const patch = await request.json();
        // Only allow safe fields to be patched
        if (patch.name) existing.submitterName = patch.name;
        await env.FEEDBACK_STORE.put(`sub:${id}`, JSON.stringify(existing));
        return json({ ok: true });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── GET /feedback/summary — retrieve structured summaries ──
    if (path === '/feedback/summary' && request.method === 'GET') {
      try {
        const url = new URL(request.url);
        const type = url.searchParams.get('type') || 'all'; // product | bugs | all
        const view = url.searchParams.get('view') || 'full'; // prompt | document | full

        const result = {};
        if (type === 'all' || type === 'product') {
          result.product = await env.FEEDBACK_STORE.get('summary:product', 'json') || { categories: [], updatedAt: null };
        }
        if (type === 'all' || type === 'bugs') {
          result.bugs = await env.FEEDBACK_STORE.get('summary:bugs', 'json') || { categories: [], updatedAt: null };
        }

        if (view === 'prompt') {
          // Compact format optimized for guide prompt injection
          let prompt = '';
          if (result.product && result.product.categories.length > 0) {
            prompt += 'FEEDBACK_SUMMARY_PRODUCT:\n';
            for (const cat of result.product.categories) {
              prompt += `[${cat.name}]\n`;
              for (const item of cat.items) {
                prompt += `- ${item.summary} (${item.evidenceIds.length} source${item.evidenceIds.length !== 1 ? 's' : ''})\n`;
              }
            }
          }
          if (result.bugs && result.bugs.categories.length > 0) {
            if (prompt) prompt += '\n';
            prompt += 'FEEDBACK_SUMMARY_BUGS:\n';
            for (const cat of result.bugs.categories) {
              prompt += `[${cat.name}]\n`;
              for (const item of cat.items) {
                prompt += `- ${item.summary} (${item.evidenceIds.length} source${item.evidenceIds.length !== 1 ? 's' : ''})\n`;
              }
            }
          }
          return new Response(prompt || '', {
            status: 200,
            headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...CORS },
          });
        }

        if (view === 'document') {
          // Enriched format for the admin document view — includes metadata
          const submissionList = await env.FEEDBACK_STORE.list({ prefix: 'sub:' });
          const allSubs = (await Promise.all(
            submissionList.keys.map(k => env.FEEDBACK_STORE.get(k.name, 'json'))
          )).filter(Boolean);
          const totalSubmissions = allSubs.filter(s => !s.deleted).length;
          return new Response(JSON.stringify({
            ...result,
            meta: { totalSubmissions, retrievedAt: new Date().toISOString() },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
          });
        }

        // full view — raw summary docs
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
        });
      } catch (e) {
        return json({ error: 'kv error', message: e.message }, 500);
      }
    }

    // ── POST /feedback/rebuild — rebuild summaries from raw submissions ──
    if (path === '/feedback/rebuild' && request.method === 'POST') {
      try {
        const { type } = await request.json().catch(() => ({ type: 'all' }));
        const tracks = type === 'all' ? ['product', 'bugs'] : [type === 'bug' ? 'bugs' : type];

        // Gather all submissions
        let allKeys = [];
        let cursor;
        do {
          const batch = await env.FEEDBACK_STORE.list({ prefix: 'sub:', cursor });
          allKeys = allKeys.concat(batch.keys);
          cursor = batch.list_complete ? null : batch.cursor;
        } while (cursor);

        const allSubmissions = (await Promise.all(
          allKeys.map(k => env.FEEDBACK_STORE.get(k.name, 'json'))
        )).filter(Boolean).filter(s => !s.deleted);

        for (const track of tracks) {
          const relevant = allSubmissions.filter(s => {
            if (track === 'bugs') return s.type === 'bug' || s.type === 'both';
            return s.type === 'product' || s.type === 'both';
          });
          await rebuildFeedbackSummary(env, track, relevant);
        }

        return json({ ok: true, rebuilt: tracks });
      } catch (e) {
        return json({ error: 'rebuild failed', message: e.message }, 500);
      }
    }

    // ── POST /feedback/admin-action — admin operations on structured summaries ──
    if (path === '/feedback/admin-action' && request.method === 'POST') {
      try {
        const { action, track, payload } = await request.json();
        if (!action || !track) return json({ error: 'missing action or track' }, 400);

        const summaryKey = `summary:${track}`;
        const summary = await env.FEEDBACK_STORE.get(summaryKey, 'json');
        if (!summary) return json({ error: 'summary not found' }, 404);

        if (action === 'delete_item') {
          const { categoryName, itemId } = payload || {};
          for (const cat of summary.categories) {
            if (cat.name === categoryName) {
              cat.items = cat.items.filter(i => i.id !== itemId);
            }
          }
          // Remove empty categories
          summary.categories = summary.categories.filter(c => c.items.length > 0);
          summary.updatedAt = new Date().toISOString();
          await env.FEEDBACK_STORE.put(summaryKey, JSON.stringify(summary));
          return json({ ok: true });
        }

        if (action === 'reclassify') {
          // Move an item from one track to the other
          const { categoryName, itemId, targetTrack } = payload || {};
          if (!targetTrack) return json({ error: 'missing targetTrack' }, 400);

          // Find and remove from source
          let movedItem = null;
          for (const cat of summary.categories) {
            const idx = cat.items.findIndex(i => i.id === itemId);
            if (idx !== -1) {
              movedItem = { ...cat.items[idx], sourceCategory: categoryName || cat.name };
              cat.items.splice(idx, 1);
              break;
            }
          }
          if (!movedItem) return json({ error: 'item not found' }, 404);

          // Clean empty categories
          summary.categories = summary.categories.filter(c => c.items.length > 0);
          summary.updatedAt = new Date().toISOString();
          await env.FEEDBACK_STORE.put(summaryKey, JSON.stringify(summary));

          // Add to target track
          const targetKey = `summary:${targetTrack}`;
          const targetSummary = await env.FEEDBACK_STORE.get(targetKey, 'json') || { categories: [], updatedAt: null };
          // Place in "Reclassified" category
          let targetCat = targetSummary.categories.find(c => c.name === movedItem.sourceCategory);
          if (!targetCat) {
            targetCat = { name: movedItem.sourceCategory, items: [] };
            targetSummary.categories.push(targetCat);
          }
          targetCat.items.push(movedItem);
          targetSummary.updatedAt = new Date().toISOString();
          await env.FEEDBACK_STORE.put(targetKey, JSON.stringify(targetSummary));
          return json({ ok: true });
        }

        return json({ error: 'unsupported action' }, 400);
      } catch (e) {
        return json({ error: 'admin action failed', message: e.message }, 500);
      }
    }

    // ── DELETE /feedback/submissions/:id — soft-delete a submission ───────────
    if (path.startsWith('/feedback/submissions/') && request.method === 'DELETE') {
      const id = path.split('/feedback/submissions/')[1];
      if (!id) return json({ error: 'missing id' }, 400);
      try {
        const existing = await env.FEEDBACK_STORE.get(`sub:${id}`, 'json');
        if (!existing) return json({ error: 'not found' }, 404);
        existing.deleted = true;
        existing.deletedAt = new Date().toISOString();
        await env.FEEDBACK_STORE.put(`sub:${id}`, JSON.stringify(existing));
        return json({ ok: true, softDeleted: true });
      } catch (e) {
        return json({ error: 'kv error' }, 500);
      }
    }

    // ── POST /feedback/migrate — migrate old flat feedback to new schema ──
    if (path === '/feedback/migrate' && request.method === 'POST') {
      try {
        // List all keys without the 'sub:' or 'summary:' prefix — those are old-format items
        const list = await env.FEEDBACK_STORE.list();
        const oldKeys = list.keys.filter(k =>
          !k.name.startsWith('sub:') && !k.name.startsWith('summary:')
        );

        if (oldKeys.length === 0) return json({ ok: true, migrated: 0, message: 'no old items found' });

        let migrated = 0;
        for (const key of oldKeys) {
          const old = await env.FEEDBACK_STORE.get(key.name, 'json');
          if (!old || old.migrated) continue; // skip already-migrated items

          const submission = {
            id: old.id || key.name,
            submittedAt: old.timestamp || new Date().toISOString(),
            submitterName: old.name || null,
            rawText: old.text || '',
            section: old.section || 'General',
            type: old.type || 'product', // default old items to product
            organizeStatus: 'pending',
          };
          await env.FEEDBACK_STORE.put(`sub:${submission.id}`, JSON.stringify(submission));
          // Soft-mark old key as migrated instead of deleting
          const oldData = { ...old, migrated: true, migratedAt: new Date().toISOString(), migratedTo: `sub:${submission.id}` };
          await env.FEEDBACK_STORE.put(key.name, JSON.stringify(oldData));
          migrated++;
        }

        return json({ ok: true, migrated });
      } catch (e) {
        return json({ error: 'migration failed', message: e.message }, 500);
      }
    }

    // ── POST /feedback/recover — list or restore soft-deleted submissions ──
    if (path === '/feedback/recover' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const restoreId = body.id;

        // List all sub: keys and find deleted ones
        let allKeys = [];
        let cursor;
        do {
          const batch = await env.FEEDBACK_STORE.list({ prefix: 'sub:', cursor });
          allKeys = allKeys.concat(batch.keys);
          cursor = batch.list_complete ? null : batch.cursor;
        } while (cursor);

        const allSubs = (await Promise.all(
          allKeys.map(k => env.FEEDBACK_STORE.get(k.name, 'json'))
        )).filter(Boolean);
        const deletedSubs = allSubs.filter(s => s.deleted);

        if (restoreId) {
          // Restore a specific submission
          const sub = deletedSubs.find(s => s.id === restoreId);
          if (!sub) return json({ error: 'not found or not deleted' }, 404);
          delete sub.deleted;
          delete sub.deletedAt;
          await env.FEEDBACK_STORE.put(`sub:${sub.id}`, JSON.stringify(sub));
          return json({ ok: true, restored: sub.id });
        }

        // List all deleted submissions
        return json({ deleted: deletedSubs, count: deletedSubs.length });
      } catch (e) {
        return json({ error: 'recovery failed', message: e.message }, 500);
      }
    }

    // ── POST /feedback/summary/rollback — restore previous summary version ──
    if (path === '/feedback/summary/rollback' && request.method === 'POST') {
      try {
        const url = new URL(request.url);
        const track = url.searchParams.get('track');
        if (!track || !['product', 'bugs'].includes(track)) {
          return json({ error: 'track param required (product or bugs)' }, 400);
        }

        const prevKey = `summary:${track}:prev`;
        const prev = await env.FEEDBACK_STORE.get(prevKey, 'json');
        if (!prev) return json({ error: 'no previous version found' }, 404);

        const currentKey = `summary:${track}`;
        const current = await env.FEEDBACK_STORE.get(currentKey, 'json');

        // Swap: current becomes prev, prev becomes current
        if (current) {
          await env.FEEDBACK_STORE.put(prevKey, JSON.stringify(current));
        }
        await env.FEEDBACK_STORE.put(currentKey, JSON.stringify(prev));

        return json({ ok: true, restoredFrom: prevKey, track });
      } catch (e) {
        return json({ error: 'rollback failed', message: e.message }, 500);
      }
    }

    // ── GET /feedback — legacy: return all submissions in old format ──
    if (path === '/feedback' && request.method === 'GET') {
      try {
        let allKeys = [];
        let cursor;
        do {
          const batch = await env.FEEDBACK_STORE.list({ prefix: 'sub:', cursor });
          allKeys = allKeys.concat(batch.keys);
          cursor = batch.list_complete ? null : batch.cursor;
        } while (cursor);

        const items = (await Promise.all(
          allKeys.map(k => env.FEEDBACK_STORE.get(k.name, 'json'))
        )).filter(Boolean).filter(s => !s.deleted).map(s => ({
          id: s.id,
          text: s.rawText,
          section: s.section,
          type: s.type,
          name: s.submitterName,
          timestamp: s.submittedAt,
        }));

        return new Response(JSON.stringify({ feedback: items }), {
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
