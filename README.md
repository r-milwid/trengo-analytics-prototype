# Trengo Analytics Prototype

A static, clickable prototype for the Analytics section in Trengo. No build step required — publish directly to GitHub Pages.

## Features

- **Five analytics sections**: Overview, Understand, Operate, Improve, Automate
- **Lazy-loading**: Section content only renders when scrolled into view (IntersectionObserver on sentinels below headers)
- **Hash routing**: Works on GitHub Pages with no server configuration
- **Lens toggle**: Switch between Support and Sales views
- **Role toggle**: Switch between Supervisor and Agent perspectives
- **Widget management**: Hide, add, and manage widgets per section with layout reflow
- **Interactive charts**: Chart.js-powered bar, line, doughnut charts with tooltips
- **Opportunities backlog**: Dismiss/Action with AI recommendation modal
- **Filters**: Date range, channel, and team filters with visible UI changes
- **Drill links**: Navigate from Overview insights into deeper sections
- **Expand/collapse**: Expandable details on list widgets
- **Drag/resize affordances**: Visual handles on widgets (non-functional, indicating future capability)

## Publishing to GitHub Pages

### Step-by-step (for non-technical users):

1. Go to [github.com](https://github.com) and sign in (or create an account)
2. Click the **+** icon in the top-right corner and select **New repository**
3. Name the repository (e.g., `trengo-analytics-prototype`)
4. Set it to **Public**
5. Click **Create repository**
6. On the next page, click **uploading an existing file**
7. Drag and drop all files from this project folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
8. Click **Commit changes**
9. Go to **Settings** (tab at the top of the repo)
10. In the left sidebar, click **Pages**
11. Under "Source", select **Deploy from a branch**
12. Under "Branch", select **main** and **/ (root)**
13. Click **Save**
14. Wait 1-2 minutes, then your site will be live at:
    `https://YOUR-USERNAME.github.io/trengo-analytics-prototype/`

## File Structure

```
index.html      — Main HTML structure
styles.css      — All styling (Inter font, Trengo-inspired design)
app.js          — Routing, widget rendering, charts, interactions
README.md       — This file
assets/         — (Optional) Place custom icons or logos here
```

## Assets Needed

The `assets/` folder is optional. The prototype uses:
- **Inter font** via Google Fonts CDN
- **Chart.js** via jsDelivr CDN
- **Inline SVGs** for all icons

If you want to add a custom Trengo logo, place it at `assets/logo.svg` and update the `.sidebar-logo` element in `index.html`.

## Assumptions

- Data is mocked with plausible values; randomized on each page load
- Widget hide/add state is not persisted across page refreshes
- Opportunity Dismiss/Action states are session-only
- Drag-and-drop and resize handles are visual affordances only (non-functional)
- The prototype defaults to the Analytics view on load
- Chart.js v4.4.7 is loaded from CDN (requires internet connection)
- Filter changes trigger a re-render with new random data to simulate responsiveness

## Technology

- **No build step** — vanilla HTML, CSS, JavaScript
- **Chart.js** for charts (CDN)
- **Inter** font (Google Fonts CDN)
