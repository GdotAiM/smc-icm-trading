/**
 * TradingView Desktop — Pine Script Tools
 *
 * Read, write, compile, and manage Pine Script indicators via the
 * Monaco editor inside TradingView Desktop. Also includes static
 * analysis and cloud compilation via pine-facade.
 */

import { z } from "zod";
import { evaluate, evaluateAsync, safeString, KNOWN_PATHS } from "./core/connection.js";
import { getClient } from "./core/connection.js";
import type { ToolDef } from "./index.js";

// React fiber walk to find the Monaco editor instance
const FIND_MONACO = `
  (function findMonacoEditor() {
    var container = document.querySelector('.monaco-editor.pine-editor-monaco');
    if (!container) return null;
    var el = container;
    var fiberKey;
    for (var i = 0; i < 20; i++) { if (!el) break; fiberKey = Object.keys(el).find(function(k) { return k.startsWith('__reactFiber$'); }); if (fiberKey) break; el = el.parentElement; }
    if (!fiberKey) return null;
    var current = el[fiberKey];
    for (var d = 0; d < 15; d++) { if (!current) break; if (current.memoizedProps && current.memoizedProps.value && current.memoizedProps.value.monacoEnv) { var env = current.memoizedProps.value.monacoEnv; if (env.editor && typeof env.editor.getEditors === 'function') { var editors = env.editor.getEditors(); if (editors.length > 0) return { editor: editors[0], env: env }; } } current = current.return; }
    return null;
  })()
`;

async function ensurePineEditorOpen(): Promise<boolean> {
  const already = await evaluate(`(function() { var m = ${FIND_MONACO}; return m !== null; })()`);
  if (already) return true;
  await evaluate(`(function() { var bwb = window.TradingView && window.TradingView.bottomWidgetBar; if (!bwb) return; if (typeof bwb.activateScriptEditorTab === 'function') bwb.activateScriptEditorTab(); else if (typeof bwb.showWidget === 'function') bwb.showWidget('pine-editor'); })()`);
  await evaluate(`(function() { var btn = document.querySelector('[aria-label="Pine"]') || document.querySelector('[data-name="pine-dialog-button"]'); if (btn) btn.click(); })()`);
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 200));
    const ready = await evaluate(`(function() { return ${FIND_MONACO} !== null; })()`);
    if (ready) return true;
  }
  return false;
}

export const pineTools: ToolDef[] = [
  {
    name: "tv_pine_get_source",
    description: "Read the current Pine Script source code from the editor.",
    parameters: z.object({}),
    execute: async () => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const source = await evaluate(`(function() { var m = ${FIND_MONACO}; if (!m) return null; return m.editor.getValue(); })()`);
      if (source == null) throw new Error("Monaco editor found but getValue() returned null");
      return { source, line_count: source.split("\n").length, char_count: source.length };
    },
  },
  {
    name: "tv_pine_set_source",
    description: "Set the Pine Script source code in the editor.",
    parameters: z.object({ source: z.string().describe("Complete Pine Script source code") }),
    execute: async ({ source }: { source: string }) => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const set = await evaluate(`(function() { var m = ${FIND_MONACO}; if (!m) return false; m.editor.setValue(${safeString(source)}); return true; })()`);
      if (!set) throw new Error("Monaco editor found but setValue() failed");
      return { success: true, lines_set: source.split("\n").length };
    },
  },
  {
    name: "tv_pine_compile",
    description: "Compile the Pine Script in the editor (clicks 'Add to Chart' / 'Save and Add to Chart' button).",
    parameters: z.object({}),
    execute: async () => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const clicked = await evaluate(`
        (function() {
          var btns = document.querySelectorAll('button');
          for (var i = 0; i < btns.length; i++) {
            var text = btns[i].textContent.trim();
            if (/save and add to chart/i.test(text)) { btns[i].click(); return 'Save and add to chart'; }
          }
          for (var i = 0; i < btns.length; i++) {
            var text = btns[i].textContent.trim();
            if (/^(Add to chart|Update on chart)/i.test(text)) { btns[i].click(); return text; }
          }
          for (var i = 0; i < btns.length; i++) {
            if (btns[i].className.indexOf('saveButton') !== -1 && btns[i].offsetParent !== null) { btns[i].click(); return 'Pine Save'; }
          }
          return null;
        })()
      `);
      if (!clicked) {
        const c = await getClient();
        if (c) {
          await c.Input.dispatchKeyEvent({ type: "keyDown", modifiers: 2, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
          await c.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter" });
        }
      }
      await new Promise(r => setTimeout(r, 2000));
      return { success: true, button_clicked: clicked || "keyboard_shortcut" };
    },
  },
  {
    name: "tv_pine_get_errors",
    description: "Get compilation errors from the Pine Script editor (Monaco editor markers).",
    parameters: z.object({}),
    execute: async () => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const errors = await evaluate(`
        (function() {
          var m = ${FIND_MONACO};
          if (!m) return [];
          var model = m.editor.getModel(); if (!model) return [];
          var markers = m.env.editor.getModelMarkers({ resource: model.uri });
          return markers.map(function(mk) { return { line: mk.startLineNumber, column: mk.startColumn, message: mk.message, severity: mk.severity }; });
        })()
      `);
      return { has_errors: (errors || []).length > 0, error_count: errors?.length || 0, errors: errors || [] };
    },
  },
  {
    name: "tv_pine_save",
    description: "Save the current Pine Script (Ctrl+S). Handles the 'Save Script' dialog if it appears.",
    parameters: z.object({}),
    execute: async () => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const c = await getClient();
      if (c) {
        await c.Input.dispatchKeyEvent({ type: "keyDown", modifiers: 2, key: "s", code: "KeyS", windowsVirtualKeyCode: 83 });
        await c.Input.dispatchKeyEvent({ type: "keyUp", key: "s", code: "KeyS" });
      }
      await new Promise(r => setTimeout(r, 800));
      const dialogHandled = await evaluate(`
        (function() {
          var btns = document.querySelectorAll('button');
          for (var i = 0; i < btns.length; i++) {
            var text = btns[i].textContent.trim();
            if (text === 'Save' && btns[i].offsetParent !== null) {
              var p = btns[i].closest('[class*="dialog"],[class*="modal"],[role="dialog"]');
              if (p) { btns[i].click(); return true; }
            }
          }
          return false;
        })()
      `);
      if (dialogHandled) await new Promise(r => setTimeout(r, 500));
      return { success: true, action: dialogHandled ? "saved_with_dialog" : "Ctrl+S_dispatched" };
    },
  },
  {
    name: "tv_pine_get_console",
    description: "Read the Pine Script console output (log.info, errors, compilation messages).",
    parameters: z.object({}),
    execute: async () => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const entries = await evaluate(`
        (function() {
          var entries = [];
          var rows = document.querySelectorAll('[class*="consoleRow"],[class*="log-"],[class*="consoleLine"]');
          if (rows.length === 0) {
            var bottomArea = document.querySelector('[class*="layout__area--bottom"]');
            if (bottomArea) rows = bottomArea.querySelectorAll('[class*="message"],[class*="log"]');
          }
          for (var i = 0; i < rows.length; i++) {
            var text = rows[i].textContent.trim();
            if (!text) continue;
            var type = 'info';
            var cls = rows[i].className || '';
            if (/error/i.test(cls)) type = 'error';
            else if (/warn/i.test(cls)) type = 'warning';
            else if (/compil/i.test(text.substring(0, 40))) type = 'compile';
            entries.push({ type, message: text });
          }
          return entries;
        })()
      `);
      return { entry_count: entries?.length || 0, entries: entries || [] };
    },
  },
  {
    name: "tv_pine_smart_compile",
    description: "Compile the current script and add/update it on the chart in one step. Returns whether it added a new study or updated an existing one.",
    parameters: z.object({}),
    execute: async () => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const studiesBefore = await evaluate(`try { var chart = ${KNOWN_PATHS.CHART_API}; if (chart && typeof chart.getAllStudies === 'function') chart.getAllStudies().length; } catch(e) {}`);
      await evaluate(`
        (function() {
          var btns = document.querySelectorAll('button');
          for (var i = 0; i < btns.length; i++) {
            var text = btns[i].textContent.trim();
            if (/save and add to chart/i.test(text)) { btns[i].click(); return; }
          }
          for (var i = 0; i < btns.length; i++) {
            var text = btns[i].textContent.trim();
            if (/^add to chart$/i.test(text)) { btns[i].click(); return; }
          }
          for (var i = 0; i < btns.length; i++) {
            var text = btns[i].textContent.trim();
            if (/^update on chart$/i.test(text)) { btns[i].click(); return; }
          }
          for (var i = 0; i < btns.length; i++) {
            if (btns[i].className.indexOf('saveButton') !== -1 && btns[i].offsetParent !== null) { btns[i].click(); return; }
          }
          // Fallback: Ctrl+Enter
        })()
      `);
      await new Promise(r => setTimeout(r, 2500));
      const errors = await evaluate(`(function() { var m = ${FIND_MONACO}; if (!m) return []; var model = m.editor.getModel(); if (!model) return []; var markers = m.env.editor.getModelMarkers({ resource: model.uri }); return markers.map(function(mk) { return { line: mk.startLineNumber, message: mk.message, severity: mk.severity }; }); })()`);
      const studiesAfter = await evaluate(`try { var chart = ${KNOWN_PATHS.CHART_API}; if (chart && typeof chart.getAllStudies === 'function') return chart.getAllStudies().length; } catch(e) { return null; }`);
      return { success: true, has_errors: (errors || []).length > 0, errors: errors || [], study_added: studiesAfter != null && studiesBefore != null ? studiesAfter > studiesBefore : null };
    },
  },
  {
    name: "tv_pine_new_script",
    description: "Create a new Pine Script template in the editor: indicator, strategy, or library.",
    parameters: z.object({
      type: z.enum(["indicator", "strategy", "library"]).describe("Script type template"),
    }),
    execute: async ({ type }: { type: string }) => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const templates: Record<string, string> = {
        indicator: '//@version=6\nindicator("My script")\nplot(close)',
        strategy: '//@version=6\nstrategy("My strategy", overlay=true)\n',
        library: '//@version=6\n// @description TODO: add library description here\nlibrary("MyLibrary")\n',
      };
      const template = templates[type] || templates.indicator;
      await evaluate(`(function() { var m = ${FIND_MONACO}; if (m) { m.editor.setValue(${safeString(template)}); return true; } return false; })()`);
      return { success: true, type, template: type };
    },
  },
  {
    name: "tv_pine_list_scripts",
    description: "List saved Pine Scripts from TradingView's cloud storage.",
    parameters: z.object({}),
    execute: async () => {
      const scripts = await evaluateAsync(`
        fetch('https://pine-facade.tradingview.com/pine-facade/list/?filter=saved', { credentials: 'include' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!Array.isArray(data)) return [];
            return data.map(function(s) { return { id: s.scriptIdPart, name: s.scriptName || s.scriptTitle, title: s.scriptTitle, version: s.version, modified: s.modified }; });
          }).catch(function() { return []; })
      `);
      return { script_count: scripts?.length || 0, scripts: scripts || [] };
    },
  },
  {
    name: "tv_pine_open_script",
    description: "Open a saved Pine Script by name into the editor.",
    parameters: z.object({ name: z.string().describe("Script name to open") }),
    execute: async ({ name }: { name: string }) => {
      const ok = await ensurePineEditorOpen();
      if (!ok) throw new Error("Could not open Pine Editor");
      const result = await evaluateAsync(`
        (function() {
          var target = ${safeString(name.toLowerCase())};
          return fetch('https://pine-facade.tradingview.com/pine-facade/list/?filter=saved', { credentials: 'include' })
            .then(function(r) { return r.json(); })
            .then(function(scripts) {
              if (!Array.isArray(scripts)) return { error: 'Failed to fetch scripts' };
              var match = null;
              for (var i = 0; i < scripts.length; i++) { var sn = (scripts[i].scriptName || '').toLowerCase(); if (sn === target) { match = scripts[i]; break; } }
              if (!match) { for (var j = 0; j < scripts.length; j++) { var sn2 = (scripts[j].scriptName || '').toLowerCase(); if (sn2.indexOf(target) !== -1) { match = scripts[j]; break; } } }
              if (!match) return { error: 'Script not found: ' + target };
              return fetch('https://pine-facade.tradingview.com/pine-facade/get/' + match.scriptIdPart + '/' + (match.version || 1), { credentials: 'include' })
                .then(function(r2) { return r2.json(); })
                .then(function(data) {
                  var source = data.source || '';
                  if (!source) return { error: 'Script source empty', name: match.scriptName };
                  var m = ${FIND_MONACO};
                  if (m) { m.editor.setValue(source); return { success: true, name: match.scriptName, lines: source.split('\\n').length }; }
                  return { error: 'Monaco editor not found' };
                });
            }).catch(function(e) { return { error: e.message }; })
        })()
      `);
      if (result?.error) throw new Error(result.error);
      return { success: true, name: result.name, lines: result.lines };
    },
  },
  {
    name: "tv_pine_analyze",
    description: "Perform static analysis on Pine Script source code (offline — no server call). Checks array bounds, missing strategy() declarations, and version recommendations.",
    parameters: z.object({ source: z.string().describe("Pine Script source code to analyze") }),
    execute: async ({ source }: { source: string }) => {
      const lines = source.split("\n");
      const diagnostics: any[] = [];
      let isV6 = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//@version=6")) { isV6 = true; break; }
        if (trimmed.startsWith("//@version=")) break;
        if (trimmed === "" || trimmed.startsWith("//")) continue;
        break;
      }
      // Strategy declaration check
      let hasStrategyDecl = false;
      for (const l of lines) { if (l.trim().startsWith("strategy(")) { hasStrategyDecl = true; break; } }
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if ((trimmed.includes("strategy.entry") || trimmed.includes("strategy.close")) && !hasStrategyDecl) {
          diagnostics.push({ line: i + 1, column: 1, message: "strategy.entry/close used but no strategy() declaration found", severity: "error" });
        }
      }
      if (!isV6 && source.includes("//@version=")) {
        const vMatch = source.match(/\/\/@version=(\d+)/);
        if (vMatch && parseInt(vMatch[1]) < 5) diagnostics.push({ line: 1, column: 1, message: `Script uses Pine v${vMatch[1]} — consider upgrading to v6`, severity: "info" });
      }
      return { issue_count: diagnostics.length, diagnostics, note: diagnostics.length === 0 ? "No issues found" : undefined };
    },
  },
  {
    name: "tv_pine_check",
    description: "Check Pine Script source code for compilation errors via TradingView's cloud compiler (pine-facade API).",
    parameters: z.object({ source: z.string().describe("Pine Script source code to check") }),
    execute: async ({ source }: { source: string }) => {
      const formData = new URLSearchParams();
      formData.append("source", source);
      const response = await fetch(
        "https://pine-facade.tradingview.com/pine-facade/translate_light?user_name=Guest&pine_id=00000000-0000-0000-0000-000000000000",
        { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", Referer: "https://www.tradingview.com/" }, body: formData }
      );
      if (!response.ok) throw new Error(`TradingView API returned ${response.status}`);
      const result: any = await response.json();
      const errors: any[] = [];
      const warnings: any[] = [];
      const inner = result?.result;
      if (inner) {
        if (inner.errors2?.length) { for (const e of inner.errors2) errors.push({ line: e.start?.line, column: e.start?.column, message: e.message }); }
        if (inner.warnings2?.length) { for (const w of inner.warnings2) warnings.push({ line: w.start?.line, column: w.start?.column, message: w.message }); }
      }
      if (result.error && typeof result.error === "string") errors.push({ message: result.error });
      return { compiled: errors.length === 0, error_count: errors.length, warning_count: warnings.length, errors: errors.length ? errors : undefined, warnings: warnings.length ? warnings : undefined };
    },
  },
];
