/**
 * TradingView Desktop — Indicator Tools
 *
 * Add, remove, and inspect indicators/studies on the chart.
 */

import { z } from "zod";
import { evaluate, safeString, KNOWN_PATHS } from "./core/connection.js";
import type { ToolDef } from "./index.js";

const CHART_API = KNOWN_PATHS.CHART_API;

export const indicatorTools: ToolDef[] = [
  {
    name: "tv_indicator_add",
    description: "Add an indicator/study to the TradingView chart by name (e.g. 'Moving Average', 'RSI', 'MACD', 'Bollinger Bands', 'Ichimoku Cloud'). Returns the new study's entity_id.",
    parameters: z.object({
      indicator: z.string().describe("Indicator name, e.g. 'Moving Average', 'RSI', 'MACD', 'Bollinger Bands'"),
      inputs: z.record(z.any()).optional().describe("Optional input overrides as { inputId: value } pairs"),
    }),
    execute: async ({ indicator, inputs }: { indicator: string; inputs?: Record<string, any> }) => {
      const before = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
      await evaluate(`${CHART_API}.createStudy(${safeString(indicator)}, false, false, [])`);
      await new Promise(r => setTimeout(r, 1500));
      const after = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
      const newIds = (after || []).filter((id: string) => !(before || []).includes(id));
      const entityId = newIds[0] || null;

      let appliedInputs;
      if (entityId && inputs && Object.keys(inputs).length) {
        const result = await evaluate(`
          (function() {
            var chart = ${CHART_API};
            var study = chart.getStudyById(${safeString(entityId)});
            if (!study || typeof study.getInputValues !== 'function') return { error: 'inputs unsupported' };
            var current = study.getInputValues();
            var overrides = ${JSON.stringify(inputs)};
            var applied = {}, unknown = [];
            for (var k in overrides) {
              var found = false;
              for (var j = 0; j < current.length; j++) { if (current[j].id === k) { current[j].value = overrides[k]; applied[k] = overrides[k]; found = true; break; } }
              if (!found) unknown.push(k);
            }
            study.setInputValues(current);
            var after2 = study.getInputValues();
            var confirmed = {};
            for (var m = 0; m < after2.length; m++) { if (applied.hasOwnProperty(after2[m].id)) confirmed[after2[m].id] = after2[m].value; }
            return { confirmed, unknown };
          })()
        `);
        if (result?.error) appliedInputs = { error: result.error };
        else appliedInputs = { applied: result?.confirmed || {}, ...(result?.unknown?.length && { unknown_inputs: result.unknown }) };
      }
      return { success: newIds.length > 0, action: "add", indicator, entity_id: entityId, ...(appliedInputs && { inputs: appliedInputs }) };
    },
  },
  {
    name: "tv_indicator_remove",
    description: "Remove an indicator/study from the chart by entity_id (found via tv_chart_get_state or tv_data_get_indicator_values).",
    parameters: z.object({
      entity_id: z.string().describe("Entity ID of the indicator to remove (from tv_chart_get_state or tv_data_get_indicator_values)"),
    }),
    execute: async ({ entity_id }: { entity_id: string }) => {
      await evaluate(`${CHART_API}.removeEntity(${safeString(entity_id)})`);
      return { success: true, action: "remove", entity_id };
    },
  },
  {
    name: "tv_indicator_get",
    description: "Get detailed information about a specific indicator by entity_id: visibility, inputs, current values.",
    parameters: z.object({
      entity_id: z.string().describe("Entity ID of the indicator (from tv_chart_get_state)"),
    }),
    execute: async ({ entity_id }: { entity_id: string }) => {
      const data = await evaluate(`
        (function() {
          var chart = ${CHART_API};
          var study = chart.getStudyById(${safeString(entity_id)});
          if (!study) return { error: 'Study not found: ' + ${safeString(entity_id)} };
          var result = { name: null, visible: null };
          try { var name = study.name || study.title; if (name) result.name = name; } catch(e) {}
          try { result.visible = study.isVisible(); } catch(e) {}
          try { var inputs = study.getInputValues(); if (Array.isArray(inputs)) result.inputs = inputs.filter(function(i) { return i.value !== undefined; }); } catch(e) {}
          return result;
        })()
      `);
      if (data?.error) throw new Error(data.error);
      return { success: true, entity_id, ...data };
    },
  },
];
