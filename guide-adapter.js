/**
 * guide-adapter.js — Enhanced postMessage bridge for SideCar
 *
 * Drop-in replacement for the window.* guide bridge functions that were
 * previously defined by the guide IIFE in app.js. When the prototype runs
 * inside the Guide's iframe, these functions translate calls into postMessage
 * events that the Guide host page listens for.
 *
 * Enhancements over the original adapter:
 *   - Element selector overlay mode (guide:enter-select-mode / guide:exit-select-mode)
 *   - Rich event payloads (backward-compatible with simple string labels)
 *   - Automatic event tracking (clicks, navigation, hovers, input changes)
 *
 * When the prototype runs standalone (not in an iframe), the functions
 * exist but are harmless no-ops.
 *
 * Include this script BEFORE admin-assistant.js and BEFORE the guide IIFE
 * (or its removal point).
 */
(function () {
  'use strict';

  var isInIframe = window.parent !== window;

  // Expose iframe state globally so the prototype can detect standalone mode
  window._guideIsEmbedded = isInIframe;

  // ── Standalone mode: fresh start ─────────────────────────
  // When loaded outside the guide, clear all session state so the prototype
  // always starts with onboarding. The guide preserves state across reloads
  // via its own session management, but standalone users get a clean slate.
  if (!isInIframe) {
    [
      'trengo_onboarding_done',
      'trengo_easy_setup_done',
      'trengo_onboarding_personal',
      'trengo_ai_setup_mode',
      'trengo_assistant_compact',
      'trengo_assistant_meta',
      'trengo_feature_flags',
      'trengo_anchors_nav_user',
      'trengo_dashboard_config'
    ].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
  }

  // ── CSS Selector Builder ─────────────────────────────────
  // Builds a simple CSS selector path for a given element.
  // Handles elements without className, without id, with empty strings.
  function buildCssSelector(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    var current = el;
    while (current && current !== document.body && parts.length < 4) {
      var tag = current.tagName.toLowerCase();
      if (current.id) { parts.unshift('#' + current.id); break; }
      if (current.className && typeof current.className === 'string') {
        var cls = current.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) tag += '.' + cls;
      }
      parts.unshift(tag);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // ── Panel state ────────────────────────────────────────────
  var _panelState = 'chat';

  if (typeof window.setPanelState !== 'function') {
    window.setPanelState = function (state) {
      _panelState = state;
      document.body.dataset.panel = state;
      if (isInIframe) {
        window.parent.postMessage({
          type: 'prototype:set-panel-state',
          state: state
        }, '*');
      }
    };
  }

  if (typeof window.getGuidePanelState !== 'function') {
    window.getGuidePanelState = function () {
      return _panelState;
    };
  }

  if (typeof window.setGuideOnboardingState !== 'function') {
    window.setGuideOnboardingState = function (active) {
      var state = active ? 'bar' : 'chat';
      _panelState = state;
      document.body.dataset.panel = state;
      if (isInIframe) {
        window.parent.postMessage({
          type: 'prototype:set-guide-onboarding',
          active: active
        }, '*');
      }
    };
  }

  // ── Enhanced Event Tracking ──────────────────────────────
  // Accepts either a simple string label (backward compat) or a rich
  // event object with label, eventType, element, and detail fields.
  if (typeof window.sendEvent !== 'function') {
    window.sendEvent = function (labelOrObj) {
      if (!isInIframe) return;
      var msg;
      if (typeof labelOrObj === 'string') {
        // Backward compat: simple label
        msg = { type: 'prototype:event', label: labelOrObj };
      } else {
        // Rich event
        msg = {
          type: 'prototype:event',
          label: labelOrObj.label || '',
          eventType: labelOrObj.eventType || 'event',
          element: labelOrObj.element || null,
          detail: labelOrObj.detail || labelOrObj.label || ''
        };
      }
      window.parent.postMessage(msg, '*');
    };
  }

  // ── Feedback submission ──────────────────────────────────────
  if (typeof window.storeFeedback !== 'function') {
    window.storeFeedback = function (feedbackObj) {
      if (isInIframe) {
        window.parent.postMessage({
          type: 'prototype:feedback-submission',
          payload: feedbackObj
        }, '*');
      }
      return Promise.resolve({ ok: true });
    };
  }

  // ── Capability reporting ───────────────────────────────────
  function reportCapabilities() {
    if (!isInIframe) return;
    var api = window._prototypeGuideAPI || null;
    window.parent.postMessage({
      type: 'prototype:capabilities',
      hasAdmin: !!(api && typeof api.getAdminData === 'function'),
      hasSettings: !!(api && typeof api.getSettingsData === 'function')
    }, '*');
  }

  if (isInIframe) {
    function initCapabilities() {
      setTimeout(reportCapabilities, 1000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCapabilities);
    } else {
      initCapabilities();
    }
  }

  // ── Helper: get the prototype's guide API ──────────────────
  function getAPI() {
    return window._prototypeGuideAPI || null;
  }

  // ── Element Selector Mode ──────────────────────────────────
  var _selectorActive = false;
  var _selectorOverlay = null;
  var _selectorHighlight = null;
  var _selectorCurrentEl = null;
  var _selectorKeyHandler = null;

  function activateElementSelector() {
    if (_selectorActive) return;
    _selectorActive = true;

    var overlay = document.createElement('div');
    overlay.id = '__guide-selector-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;cursor:crosshair;background:transparent;';

    var highlight = document.createElement('div');
    highlight.id = '__guide-selector-highlight';
    highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;border:2px solid #3b82f6;background:rgba(59,130,246,0.08);border-radius:3px;transition:all 0.1s ease;display:none;';

    document.body.appendChild(highlight);
    document.body.appendChild(overlay);
    _selectorOverlay = overlay;
    _selectorHighlight = highlight;

    overlay.addEventListener('mousemove', function (e) {
      overlay.style.pointerEvents = 'none';
      highlight.style.pointerEvents = 'none';
      var el = null;
      // Use elementsFromPoint for deeper detection
      if (typeof document.elementsFromPoint === 'function') {
        var stack = document.elementsFromPoint(e.clientX, e.clientY);
        for (var i = 0; i < stack.length; i++) {
          if (stack[i] !== overlay && stack[i] !== highlight && stack[i] !== document.documentElement && stack[i] !== document.body) {
            el = stack[i];
            break;
          }
        }
      }
      if (!el) {
        el = document.elementFromPoint(e.clientX, e.clientY);
      }
      overlay.style.pointerEvents = 'auto';
      highlight.style.pointerEvents = '';

      if (el && el !== overlay && el !== highlight) {
        var rect = el.getBoundingClientRect();
        highlight.style.top = rect.top + 'px';
        highlight.style.left = rect.left + 'px';
        highlight.style.width = rect.width + 'px';
        highlight.style.height = rect.height + 'px';
        highlight.style.display = 'block';
        _selectorCurrentEl = el;
      }
    });

    overlay.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var el = _selectorCurrentEl;
      if (!el) return;

      var rect = el.getBoundingClientRect();
      var data = {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 100),
        cssSelector: buildCssSelector(el),
        boundingBox: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        classes: el.className || '',
        id: el.id || '',
        parentContext: el.parentElement ? (el.parentElement.textContent || '').trim().slice(0, 150) : '',
        nearbyText: (el.textContent || '').trim().slice(0, 100) || (el.parentElement ? (el.parentElement.textContent || '').trim().slice(0, 100) : ''),
        viewportPosition: {
          xPercent: Math.round((e.clientX / window.innerWidth) * 100),
          yPercent: Math.round((e.clientY / window.innerHeight) * 100)
        }
      };

      window.parent.postMessage({ type: 'prototype:element-selected', element: data }, '*');
      deactivateElementSelector();
    });

    _selectorKeyHandler = function (e) {
      if (e.key === 'Escape') {
        deactivateElementSelector();
      }
    };
    document.addEventListener('keydown', _selectorKeyHandler);
  }

  function deactivateElementSelector() {
    if (!_selectorActive) return;
    _selectorActive = false;

    if (_selectorOverlay && _selectorOverlay.parentNode) {
      _selectorOverlay.parentNode.removeChild(_selectorOverlay);
    }
    if (_selectorHighlight && _selectorHighlight.parentNode) {
      _selectorHighlight.parentNode.removeChild(_selectorHighlight);
    }
    if (_selectorKeyHandler) {
      document.removeEventListener('keydown', _selectorKeyHandler);
    }

    _selectorOverlay = null;
    _selectorHighlight = null;
    _selectorCurrentEl = null;
    _selectorKeyHandler = null;
  }

  // ── Automatic Event Tracking (iframe only) ─────────────────
  if (isInIframe) {
    // Click tracking — broad capture for ALL clicks in the prototype.
    // Every click is logged so the AI has full context of what the user did.
    document.addEventListener('click', function (e) {
      // First, try to find a semantic interactive element
      var el = e.target.closest('button, a, [role="button"], input[type="submit"], [data-action]');
      if (!el) {
        // Walk up from the click target to find the most meaningful container
        el = e.target;
        var attempts = 0;
        while (el && el !== document.body && attempts < 5) {
          var text = (el.textContent || '').trim();
          var hasIdentity = el.id || (el.className && typeof el.className === 'string' && el.className.trim());
          // Accept element if it has identity OR meaningful text
          if (hasIdentity || (text.length > 2 && text.length < 200)) break;
          if (el.parentElement && el.parentElement !== document.body) {
            el = el.parentElement;
          } else {
            break;
          }
          attempts++;
        }
        // Skip only if we ended up on body itself
        if (!el || el === document.body) return;
      }

      // Build a descriptive label from whatever info is available
      var text = (el.textContent || '').trim().slice(0, 50);
      var ariaLabel = el.getAttribute('aria-label') || '';
      var title = el.getAttribute('title') || '';
      var displayLabel = text || ariaLabel || title || el.tagName.toLowerCase();
      // For icon-only elements (SVG, img), include the parent's text for context
      if (!text && el.parentElement && el.parentElement !== document.body) {
        var parentText = (el.parentElement.textContent || '').trim().slice(0, 50);
        if (parentText) displayLabel = parentText + ' (icon)';
      }

      window.sendEvent({
        label: 'Click: ' + displayLabel,
        eventType: 'click',
        element: { tag: el.tagName.toLowerCase(), text: displayLabel, selector: buildCssSelector(el) },
        detail: 'Clicked ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : '') + (displayLabel !== el.tagName.toLowerCase() ? ' "' + displayLabel + '"' : '')
      });
    }, true);

    // Navigation tracking — route/hash changes
    window.addEventListener('popstate', function () {
      window.sendEvent({ label: 'Navigate: ' + location.pathname + location.hash, eventType: 'navigate', detail: 'Navigated to ' + location.pathname + location.hash });
    });
    window.addEventListener('hashchange', function () {
      window.sendEvent({ label: 'Navigate: ' + location.hash, eventType: 'navigate', detail: 'Hash changed to ' + location.hash });
    });

    // Send initial page view so the guide always knows the current screen
    window.parent.postMessage({
      type: 'prototype:current-view',
      url: location.pathname + location.hash,
      title: document.title || ''
    }, '*');

    // Observe title changes — many SPAs update the title when navigating
    // between onboarding steps, settings, etc. without changing the URL.
    var _lastReportedTitle = document.title || '';
    if (typeof MutationObserver === 'function') {
      var titleEl = document.querySelector('title');
      if (titleEl) {
        new MutationObserver(function () {
          var newTitle = document.title || '';
          if (newTitle !== _lastReportedTitle) {
            _lastReportedTitle = newTitle;
            window.parent.postMessage({
              type: 'prototype:current-view',
              url: location.pathname + location.hash,
              title: newTitle
            }, '*');
          }
        }).observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
    }

    // Hover tracking on data elements — debounced
    var _hoverTimeout = null;
    var _lastHoverSelector = '';
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tooltip], [title], .chart-point, .chart-bar, [data-value]');
      if (!el) return;
      var sel = buildCssSelector(el);
      if (sel === _lastHoverSelector) return;
      _lastHoverSelector = sel;
      clearTimeout(_hoverTimeout);
      _hoverTimeout = setTimeout(function () {
        window.sendEvent({
          label: 'Hover: ' + (el.getAttribute('data-tooltip') || el.getAttribute('title') || el.textContent || '').trim().slice(0, 50),
          eventType: 'hover_data',
          element: { tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 50), selector: sel },
          detail: 'Hovered on ' + sel
        });
      }, 500);
    }, true);

    // Input/form change tracking
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el.matches('select, input[type="checkbox"], input[type="radio"]')) return;
      window.sendEvent({
        label: 'Setting: ' + (el.name || el.id || el.tagName) + ' = ' + el.value,
        eventType: 'setting_change',
        element: { tag: el.tagName.toLowerCase(), text: el.name || el.id || '', selector: buildCssSelector(el) },
        detail: 'Changed ' + (el.name || el.id || 'input') + ' to ' + String(el.value).slice(0, 50)
      });
    }, true);

    // Drag/resize tracking — captures mousedown on resize handles, drag handles,
    // and similar interactive zones that don't fire click events.
    var _dragStart = null;
    document.addEventListener('mousedown', function (e) {
      var el = e.target.closest('[class*="resize"], [class*="drag"], [class*="handle"], [class*="grip"], [data-resize], [data-drag]');
      if (!el) return;
      _dragStart = { el: el, x: e.clientX, y: e.clientY, time: Date.now() };
    }, true);

    document.addEventListener('mouseup', function () {
      if (!_dragStart) return;
      var ds = _dragStart;
      _dragStart = null;
      var elapsed = Date.now() - ds.time;
      // Only log if they actually dragged (moved > 5px or held > 200ms)
      if (elapsed < 200 && Math.abs(ds.x - event.clientX) < 5 && Math.abs(ds.y - event.clientY) < 5) return;
      var el = ds.el;
      var label = 'Resized/dragged ' + (el.getAttribute('aria-label') || el.className || el.tagName.toLowerCase());
      window.sendEvent({
        label: label,
        eventType: 'click',
        element: { tag: el.tagName.toLowerCase(), text: label, selector: buildCssSelector(el) },
        detail: label
      });
    }, true);
  }

  // ── Incoming messages from guide host ──────────────────────
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data.type !== 'string') return;

    var api = getAPI();

    switch (e.data.type) {
      case 'guide:panel-state':
        _panelState = e.data.state;
        document.body.dataset.panel = e.data.state;
        break;

      case 'guide:ping':
        if (isInIframe) {
          var pingApi = window._prototypeGuideAPI || null;
          window.parent.postMessage({
            type: 'prototype:pong',
            capabilities: {
              hasAdmin: !!(pingApi && typeof pingApi.getAdminData === 'function'),
              hasSettings: !!(pingApi && typeof pingApi.getSettingsData === 'function')
            }
          }, '*');
        }
        break;

      // ── Settings & Admin data requests ──────────────────────
      case 'guide:request-settings':
        if (isInIframe && api) {
          window.parent.postMessage({
            type: 'prototype:settings-data',
            data: api.getSettingsData()
          }, '*');
        }
        break;

      case 'guide:request-admin':
        if (isInIframe && api) {
          window.parent.postMessage({
            type: 'prototype:admin-data',
            data: api.getAdminData()
          }, '*');
        }
        break;

      // ── Setting change messages ─────────────────────────────
      case 'guide:set-role':
        if (api && e.data.role) api.setRole(e.data.role);
        break;

      case 'guide:set-flag':
        if (api && e.data.flagId !== undefined) api.setFlag(e.data.flagId, e.data.value);
        break;

      case 'guide:set-toggle':
        if (api && e.data.key) api.setToggle(e.data.key, !!e.data.checked);
        break;

      case 'guide:set-slider':
        if (api && api.setSlider && e.data.key != null) api.setSlider(e.data.key, e.data.value);
        break;

      // Legacy: keep old message for backward compat
      case 'guide:set-anchors-nav-user':
        if (api) api.setToggle('anchorsNavUser', !!e.data.checked);
        break;

      case 'guide:action':
        if (api && e.data.actionId) api.triggerAction(e.data.actionId);
        break;

      // ── Fresh view context on demand ────────────────────────
      case 'guide:request-current-view':
        window.parent.postMessage({
          type: 'prototype:current-view',
          url: location.pathname + location.hash,
          title: document.title || ''
        }, '*');
        break;

      // ── Element Selector Mode ──────────────────────────────
      case 'guide:enter-select-mode':
        activateElementSelector();
        break;

      case 'guide:exit-select-mode':
        deactivateElementSelector();
        break;
    }
  });
})();
