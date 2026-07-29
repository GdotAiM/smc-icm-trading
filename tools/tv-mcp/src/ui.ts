/**
 * TradingView Desktop — UI Automation Tools
 *
 * Click elements, open panels, toggle fullscreen, switch layouts,
 * keyboard shortcuts, mouse operations, element finding, and
 * custom JavaScript evaluation.
 */

import { z } from "zod";
import { evaluate, evaluateAsync, safeString, KNOWN_PATHS } from "./core/connection.js";
import { getClient } from "./core/connection.js";
import type { ToolDef } from "./index.js";

export const uiTools: ToolDef[] = [
  {
    name: "tv_ui_click",
    description: "Click a UI element by aria-label, data-name, text content, or class-contains selector.",
    parameters: z.object({
      by: z.enum(["aria-label", "data-name", "text", "class-contains"]).describe("Selector strategy"),
      value: z.string().describe("Selector value to match"),
    }),
    execute: async ({ by, value }: { by: string; value: string }) => {
      const result = await evaluate(`
        (function() {
          var by = ${JSON.stringify(by)};
          var value = ${JSON.stringify(value)};
          var el = null;
          if (by === 'aria-label') {
            el = document.querySelector('[aria-label="' + value.replace(/"/g, '\\\\"') + '"]');
            if (!el) el = document.querySelector('[aria-label*="' + value.replace(/"/g, '\\\\"') + '"]');
          } else if (by === 'data-name') el = document.querySelector('[data-name="' + value.replace(/"/g, '\\\\"') + '"]');
          else if (by === 'text') {
            var candidates = document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"]');
            for (var i = 0; i < candidates.length; i++) {
              var text = candidates[i].textContent.trim();
              if (text === value || text.toLowerCase() === value.toLowerCase()) { el = candidates[i]; break; }
            }
          } else if (by === 'class-contains') el = document.querySelector('[class*="' + value.replace(/"/g, '\\\\"') + '"]');
          if (!el) return { found: false };
          el.click();
          return { found: true, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().substring(0, 80), aria_label: el.getAttribute('aria-label') || null, data_name: el.getAttribute('data-name') || null };
        })()
      `);
      if (!result?.found) throw new Error(`Element not found: ${by}="${value}"`);
      return { success: true, clicked: result };
    },
  },
  {
    name: "tv_ui_open_panel",
    description: "Open or close a TradingView panel. Panels: pine-editor, strategy-tester (bottom panels); watchlist, alerts, trading (right side panels). Actions: open, close, toggle.",
    parameters: z.object({
      panel: z.enum(["pine-editor", "strategy-tester", "watchlist", "alerts", "trading"]).describe("Panel name"),
      action: z.enum(["open", "close", "toggle"]).optional().describe("Action (default: toggle)"),
    }),
    execute: async ({ panel, action }: { panel: string; action?: string }) => {
      const act = action || "toggle";
      const isBottom = panel === "pine-editor" || panel === "strategy-tester";
      if (isBottom) {
        const widgetName = panel === "pine-editor" ? "pine-editor" : "backtesting";
        const result = await evaluate(`
          (function() {
            var bwb = window.TradingView && window.TradingView.bottomWidgetBar;
            if (!bwb) return { error: 'bottomWidgetBar not available' };
            var widgetName = ${safeString(widgetName)};
            var action = ${safeString(act)};
            var bottomArea = document.querySelector('[class*="layout__area--bottom"]');
            var isOpen = !!(bottomArea && bottomArea.offsetHeight > 50);
            var performed = 'none';
            if (action === 'open' || (action === 'toggle' && !isOpen)) {
              if (typeof bwb.showWidget === 'function') bwb.showWidget(widgetName);
              performed = 'opened';
            } else if (action === 'close' || (action === 'toggle' && isOpen)) {
              if (typeof bwb.hideWidget === 'function') bwb.hideWidget(widgetName);
              else if (typeof bwb.close === 'function') bwb.close();
              performed = 'closed';
            }
            return { was_open: isOpen, performed: performed };
          })()
        `);
        if (result?.error) throw new Error(result.error);
        return { success: true, panel, action: act, was_open: result?.was_open, performed: result?.performed };
      }
      // Right-side panels
      const sel: Record<string, { dataNames: string[]; ariaLabels: string[] }> = {
        watchlist: { dataNames: ["base-watchlist-widget-button", "base"], ariaLabels: ["Watchlist", "Watchlist, details, and news"] },
        alerts: { dataNames: ["alerts-button", "alerts"], ariaLabels: ["Alerts"] },
        trading: { dataNames: ["trading-button"], ariaLabels: ["Trading Panel"] },
      };
      const s = sel[panel];
      const result = await evaluate(`
        (function() {
          var s = ${JSON.stringify(s)};
          var action = ${safeString(act)};
          var btn = null;
          for (var d = 0; d < s.dataNames.length && !btn; d++) btn = document.querySelector('[data-name="' + s.dataNames[d] + '"]');
          for (var a = 0; a < s.ariaLabels.length && !btn; a++) btn = document.querySelector('[aria-label="' + s.ariaLabels[a] + '"]');
          if (!btn) return { error: 'Button not found for panel: ' + ${safeString(panel)} };
          var isActive = btn.getAttribute('aria-pressed') === 'true' || btn.classList.contains('isActive');
          var rightArea = document.querySelector('[class*="layout__area--right"]');
          var sidebarOpen = !!(rightArea && rightArea.offsetWidth > 50);
          var isOpen = isActive && sidebarOpen;
          if (action === 'open' && !isOpen) { btn.click(); return { performed: 'opened' }; }
          else if (action === 'close' && isOpen) { btn.click(); return { performed: 'closed' }; }
          else if (action === 'toggle') { btn.click(); return { performed: isOpen ? 'closed' : 'opened' }; }
          return { performed: isOpen ? 'already_open' : 'already_closed' };
        })()
      `);
      if (result?.error) throw new Error(result.error);
      return { success: true, panel, action: act, performed: result?.performed };
    },
  },
  {
    name: "tv_ui_fullscreen",
    description: "Toggle fullscreen mode on the TradingView chart.",
    parameters: z.object({}),
    execute: async () => {
      const result = await evaluate(`(function() { var btn = document.querySelector('[data-name="header-toolbar-fullscreen"]'); if (!btn) return {found: false}; btn.click(); return {found: true}; })()`);
      if (!result?.found) throw new Error("Fullscreen button not found");
      return { success: true, action: "fullscreen_toggled" };
    },
  },
  {
    name: "tv_ui_keyboard",
    description: "Send a keyboard shortcut to the TradingView page. E.g. key='s', modifiers=['ctrl'] for Ctrl+S.",
    parameters: z.object({
      key: z.string().describe("Key to press (e.g. 's', 'Enter', 'Escape', 'ArrowUp')"),
      modifiers: z.array(z.enum(["alt", "ctrl", "meta", "shift"])).optional().describe("Modifier keys to hold"),
    }),
    execute: async ({ key, modifiers }: { key: string; modifiers?: string[] }) => {
      const client = await getClient();
      if (!client) throw new Error("CDP client not available");
      let mod = 0;
      if (modifiers) {
        if (modifiers.includes("alt")) mod |= 1;
        if (modifiers.includes("ctrl")) mod |= 2;
        if (modifiers.includes("meta")) mod |= 4;
        if (modifiers.includes("shift")) mod |= 8;
      }
      const keyMap: Record<string, { code: string; vk: number }> = {
        Enter: { code: "Enter", vk: 13 }, Escape: { code: "Escape", vk: 27 }, Tab: { code: "Tab", vk: 9 },
        Backspace: { code: "Backspace", vk: 8 }, Delete: { code: "Delete", vk: 46 },
        ArrowUp: { code: "ArrowUp", vk: 38 }, ArrowDown: { code: "ArrowDown", vk: 40 },
        ArrowLeft: { code: "ArrowLeft", vk: 37 }, ArrowRight: { code: "ArrowRight", vk: 39 },
        Space: { code: "Space", vk: 32 }, Home: { code: "Home", vk: 36 }, End: { code: "End", vk: 35 },
        PageUp: { code: "PageUp", vk: 33 }, PageDown: { code: "PageDown", vk: 34 },
      };
      const mapped = keyMap[key] || { code: "Key" + key.toUpperCase(), vk: key.toUpperCase().charCodeAt(0) };
      await client.Input.dispatchKeyEvent({ type: "keyDown", modifiers: mod, key, code: mapped.code, windowsVirtualKeyCode: mapped.vk });
      await client.Input.dispatchKeyEvent({ type: "keyUp", key, code: mapped.code });
      return { success: true, key, modifiers: modifiers || [] };
    },
  },
  {
    name: "tv_ui_type_text",
    description: "Type text into the currently focused input field.",
    parameters: z.object({ text: z.string().describe("Text to type") }),
    execute: async ({ text }: { text: string }) => {
      const client = await getClient();
      if (!client) throw new Error("CDP client not available");
      await client.Input.insertText({ text });
      return { success: true, typed: text.substring(0, 100), length: text.length };
    },
  },
  {
    name: "tv_ui_hover",
    description: "Hover the mouse over a UI element by selector.",
    parameters: z.object({
      by: z.enum(["aria-label", "data-name", "text", "class-contains"]).describe("Selector strategy"),
      value: z.string().describe("Selector value"),
    }),
    execute: async ({ by, value }: { by: string; value: string }) => {
      const coords = await evaluate(`
        (function() {
          var by = ${JSON.stringify(by)};
          var value = ${JSON.stringify(value)};
          var el = null;
          if (by === 'aria-label') { el = document.querySelector('[aria-label="' + value.replace(/"/g, '\\\\"') + '"]'); if (!el) el = document.querySelector('[aria-label*="' + value.replace(/"/g, '\\\\"') + '"]'); }
          else if (by === 'data-name') el = document.querySelector('[data-name="' + value.replace(/"/g, '\\\\"') + '"]');
          else if (by === 'text') {
            var candidates = document.querySelectorAll('button, a, [role="button"], span, div');
            for (var i = 0; i < candidates.length; i++) { if (candidates[i].textContent.trim() === value) { el = candidates[i]; break; } }
          } else if (by === 'class-contains') el = document.querySelector('[class*="' + value.replace(/"/g, '\\\\"') + '"]');
          if (!el) return null;
          var r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.tagName.toLowerCase() };
        })()
      `);
      if (!coords) throw new Error("Element not found");
      const client = await getClient();
      if (!client) throw new Error("CDP client not available");
      await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: coords.x, y: coords.y });
      return { success: true, hovered: { by, value, tag: coords.tag, x: coords.x, y: coords.y } };
    },
  },
  {
    name: "tv_ui_scroll",
    description: "Scroll the chart area in a direction.",
    parameters: z.object({
      direction: z.enum(["up", "down", "left", "right"]).describe("Scroll direction"),
      amount: z.number().optional().describe("Pixels to scroll (default 300)"),
    }),
    execute: async ({ direction, amount }: { direction: string; amount?: number }) => {
      const px = amount || 300;
      const client = await getClient();
      if (!client) throw new Error("CDP client not available");
      const center = await evaluate(`(function() { var el = document.querySelector('[data-name="pane-canvas"]') || document.querySelector('[class*="chart-container"]') || document.querySelector('canvas'); if (!el) return { x: window.innerWidth/2, y: window.innerHeight/2 }; var r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`);
      let deltaX = 0, deltaY = 0;
      if (direction === "up") deltaY = -px; else if (direction === "down") deltaY = px;
      else if (direction === "left") deltaX = -px; else if (direction === "right") deltaX = px;
      await client.Input.dispatchMouseEvent({ type: "mouseWheel", x: center.x, y: center.y, deltaX, deltaY });
      return { success: true, direction, amount: px };
    },
  },
  {
    name: "tv_ui_mouse_click",
    description: "Click at specific viewport coordinates. Useful for clicking on the chart canvas at known positions.",
    parameters: z.object({
      x: z.number().describe("X coordinate (viewport relative)"),
      y: z.number().describe("Y coordinate (viewport relative)"),
      double_click: z.boolean().optional().describe("Whether to double-click"),
    }),
    execute: async ({ x, y, double_click }: { x: number; y: number; double_click?: boolean }) => {
      const client = await getClient();
      if (!client) throw new Error("CDP client not available");
      await client.Input.dispatchMouseEvent({ type: "mouseMoved", x, y });
      await client.Input.dispatchMouseEvent({ type: "mousePressed", x, y, button: "left", buttons: 0, clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: "mouseReleased", x, y, button: "left" });
      if (double_click) {
        await new Promise(r => setTimeout(r, 50));
        await client.Input.dispatchMouseEvent({ type: "mousePressed", x, y, button: "left", buttons: 0, clickCount: 2 });
        await client.Input.dispatchMouseEvent({ type: "mouseReleased", x, y, button: "left" });
      }
      return { success: true, x, y, double_click: !!double_click };
    },
  },
  {
    name: "tv_ui_find_element",
    description: "Find UI elements by CSS selector, aria-label, or text content. Returns position and attributes.",
    parameters: z.object({
      query: z.string().describe("Search query or CSS selector"),
      strategy: z.enum(["text", "css", "aria-label"]).optional().describe("Search strategy (default: text contains)"),
    }),
    execute: async ({ query, strategy }: { query: string; strategy?: string }) => {
      const strat = strategy || "text";
      const results = await evaluate(`
        (function() {
          var query = ${JSON.stringify(query)};
          var strategy = ${JSON.stringify(strat)};
          var results = [];
          if (strategy === 'css') {
            var els = document.querySelectorAll(query);
            for (var i = 0; i < Math.min(els.length, 20); i++) {
              var r = els[i].getBoundingClientRect();
              results.push({ tag: els[i].tagName.toLowerCase(), text: (els[i].textContent||'').trim().substring(0, 80), aria_label: els[i].getAttribute('aria-label'), data_name: els[i].getAttribute('data-name'), x: r.x, y: r.y, width: r.width, height: r.height, visible: els[i].offsetParent !== null });
            }
          } else if (strategy === 'aria-label') {
            var els = document.querySelectorAll('[aria-label*="' + query.replace(/"/g, '\\\\"') + '"]');
            for (var i = 0; i < Math.min(els.length, 20); i++) {
              var r = els[i].getBoundingClientRect();
              results.push({ tag: els[i].tagName.toLowerCase(), text: (els[i].textContent||'').trim().substring(0, 80), aria_label: els[i].getAttribute('aria-label'), data_name: els[i].getAttribute('data-name'), x: r.x, y: r.y, width: r.width, height: r.height, visible: els[i].offsetParent !== null });
            }
          } else {
            var all = document.querySelectorAll('button, a, [role="button"], span, div, input, select');
            for (var i = 0; i < all.length; i++) {
              var text = all[i].textContent.trim();
              if (text.toLowerCase().indexOf(query.toLowerCase()) !== -1 && text.length < 200) {
                var r = all[i].getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  results.push({ tag: all[i].tagName.toLowerCase(), text: text.substring(0, 80), aria_label: all[i].getAttribute('aria-label'), data_name: all[i].getAttribute('data-name'), x: r.x, y: r.y, width: r.width, height: r.height, visible: all[i].offsetParent !== null });
                  if (results.length >= 20) break;
                }
              }
            }
          }
          return results;
        })()
      `);
      return { query, strategy: strat, count: results?.length || 0, elements: results || [] };
    },
  },
  {
    name: "tv_ui_evaluate",
    description: "Execute arbitrary JavaScript in the TradingView page context and return the result. Use with caution.",
    parameters: z.object({
      expression: z.string().describe("JavaScript expression to evaluate"),
    }),
    execute: async ({ expression }: { expression: string }) => {
      const result = await evaluate(expression);
      return { result };
    },
  },
  {
    name: "tv_ui_layout_list",
    description: "List saved chart layouts via the internal API.",
    parameters: z.object({}),
    execute: async () => {
      const layouts = await evaluateAsync(`
        new Promise(function(resolve) {
          try {
            window.TradingViewApi.getSavedCharts(function(charts) {
              if (!charts || !Array.isArray(charts)) { resolve([]); return; }
              resolve(charts.map(function(c) { return { id: c.id || c.chartId, name: c.name || c.title, symbol: c.symbol, resolution: c.resolution, modified: c.timestamp || c.modified }; }));
            });
            setTimeout(function() { resolve([]); }, 5000);
          } catch(e) { resolve([]); }
        })
      `);
      return { layout_count: layouts?.length || 0, layouts: layouts || [] };
    },
  },
  {
    name: "tv_ui_layout_switch",
    description: "Switch to a saved layout by name or ID.",
    parameters: z.object({ name: z.string().describe("Layout name or ID to load") }),
    execute: async ({ name }: { name: string }) => {
      const result = await evaluateAsync(`
        new Promise(function(resolve) {
          var target = ${safeString(name)};
          if (/^\\d+$/.test(target)) { window.TradingViewApi.loadChartFromServer(target); resolve({success: true, method: 'loadChartFromServer', id: target}); return; }
          window.TradingViewApi.getSavedCharts(function(charts) {
            if (!charts || !Array.isArray(charts)) { resolve({success: false, error: 'getSavedCharts returned no data'}); return; }
            var match = null;
            for (var i = 0; i < charts.length; i++) { var cn = charts[i].name || charts[i].title || ''; if (cn === target || cn.toLowerCase() === target.toLowerCase()) { match = charts[i]; break; } }
            if (!match) { for (var j = 0; j < charts.length; j++) { var cn2 = (charts[j].name || charts[j].title || '').toLowerCase(); if (cn2.indexOf(target.toLowerCase()) !== -1) { match = charts[j]; break; } } }
            if (!match) { resolve({success: false, error: 'Layout "' + target + '" not found.'}); return; }
            window.TradingViewApi.loadChartFromServer(match.id || match.chartId);
            resolve({success: true, id: match.id || match.chartId, name: match.name || match.title});
          });
          setTimeout(function() { resolve({success: false, error: 'getSavedCharts timed out'}); }, 5000);
        })
      `);
      if (!result?.success) throw new Error(result?.error || "Layout switch failed");
      return { success: true, layout: result.name || name, layout_id: result.id };
    },
  },
];
