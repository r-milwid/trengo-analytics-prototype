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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const path = new URL(request.url).pathname;

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

    // ── POST / — chat proxy ───────────────────────────────────
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
