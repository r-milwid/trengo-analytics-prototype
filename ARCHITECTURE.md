# Architecture

## Tech Stack
- Vanilla JS (no framework), HTML5, CSS3 with custom properties
- Chart.js 4.4.7 for visualizations
- Cloudflare Workers + KV for config persistence and onboarding chat
- Deployed: GitHub Pages (internal) / Cloudflare Pages (customer)
- SideCar integration via postMessage bridge (guide-adapter.js)

## Directory Structure
```
index.html              Single-page HTML shell
app.js                  Main application logic (~5600 lines, global state)
admin-assistant.js      AI onboarding assistant (Sonnet-powered)
widget-catalog.js       Static widget/section/team definitions
dashboard-config.js     Config serialization and Cloudflare KV sync
profile.js              Runtime profile detection (internal vs customer)
guide-adapter.js        postMessage bridge for SideCar companion panel
guide_context.md        AI context file for SideCar (identity, domain, details, settings, admin)
styles.css              Complete styling (~2400 lines)
assets/icons/           SVG icon assets
chatbot-proxy/
  worker.js             Cloudflare Worker: /config, /profile, /onboarding/chat, /extract-url, /analytics/query
  wrangler.toml         KV bindings: DASHBOARD_CONFIG, CUSTOMER_PROFILES
```

## Data Flow
1. Page load → profile.js detects environment → app.js bootstraps global `state`
2. Config sync → dashboard-config.js calls Worker `/config/{userId}` via PROXY_URL
3. UI changes → `DashboardConfig.notifyChanged()` → debounced save to KV (1500ms)
4. Conflict (409) → server config reapplied, UI re-renders
5. Widget render → section mounts → `renderWidget()` per visible widget

## SideCar Integration
- `guide-adapter.js` bridges communication between prototype and SideCar via postMessage
- `guide_context.md` provides AI context (parsed by SideCar on registration)
- `_prototypeGuideAPI` exposes settings/admin control surface (setRole, setFlag, triggerAction)
- When standalone (no SideCar), adapter functions are harmless no-ops

## Widget System
- Each widget: `id`, `title`, `type` (kpi/bar-chart/table/list/etc), `vis` (always/default/hidden)
- Visibility layers (in order): base vis → role+lens state overrides → team usecases (feature flag) → channel filters → individual hide/add state
- `getEffectiveVisibility(w)` resolves all layers
- Widgets keyed by section: overview, understand, operate, improve, automate

## Sections & Navigation
- Tab mode (default): only active section renders
- Anchors mode (feature flag): IntersectionObserver lazy-mounts visible sections
- Each tab owns widgets via `state.tabWidgets[tabId]`
- Drag-to-reorder and resize within sections

## Config Persistence
- Optimistic concurrency with revision numbers
- On 409 conflict: server state wins, local edits lost
- Config shape validated server-side (tabs, widgets, lens, role)

## Feature Flags
- LocalStorage-based: `anchors-nav`, `onboarding-transition`
- Controlled via SideCar admin overlay

## Key Patterns
- Global event delegation for nav, filters, drawers
- Mock data generated client-side (rand, randF, pickTrend, paletteCycle)
- Chart.js instances tracked in `state.charts[widgetId]`, destroyed on unmount
- Onboarding overlay: independent step-through, completion persisted in localStorage
- AI onboarding assistant: Sonnet-powered setup flow via admin-assistant.js
