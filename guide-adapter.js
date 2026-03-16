/**
 * guide-adapter.js — postMessage bridge for Sidecar
 *
 * Drop-in replacement for the window.* guide bridge functions that were
 * previously defined by the guide IIFE in app.js. When the prototype runs
 * inside the Guide's iframe, these functions translate calls into postMessage
 * events that the Guide host page listens for.
 *
 * When the prototype runs standalone (not in an iframe), the functions
 * exist but are harmless no-ops — postMessages go to window itself and
 * are silently ignored.
 *
 * Include this script BEFORE admin-assistant.js and BEFORE the guide IIFE
 * (or its removal point). The guide IIFE, if still present, will overwrite
 * these with its own implementations — that's fine and intentional.
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

  // ── Event tracking ─────────────────────────────────────────
  if (typeof window.sendEvent !== 'function') {
    window.sendEvent = function (label) {
      if (isInIframe) {
        window.parent.postMessage({
          type: 'prototype:event',
          label: label
        }, '*');
      }
    };
  }

  // ── Bug reporting ──────────────────────────────────────────
  if (typeof window.reportPrototypeBug !== 'function') {
    window.reportPrototypeBug = function (payload) {
      if (isInIframe) {
        window.parent.postMessage({
          type: 'prototype:bug-report',
          payload: payload
        }, '*');
      }
      return Promise.resolve({ ok: true });
    };
  }

  // ── Feedback submission ──────────────────────────────────────
  // Corrections and other feedback from the prototype's admin assistant
  // are routed through SideCar's feedback API via postMessage.
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
  // Reports whether the prototype exposes the _prototypeGuideAPI for SideCar
  // to control settings and admin functions via postMessage.
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
      // Delay slightly to let the prototype's API register
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

      // Legacy: keep old message for backward compat
      case 'guide:set-anchors-nav-user':
        if (api) api.setToggle('anchorsNavUser', !!e.data.checked);
        break;

      case 'guide:action':
        if (api && e.data.actionId) api.triggerAction(e.data.actionId);
        break;
    }
  });
})();
