/**
 * TradingView Desktop — Drawing Tools
 *
 * Create, list, inspect, and remove chart drawings using TradingView's
 * internal createShape/createMultipointShape API — reliable on both
 * web and Desktop versions.
 *
 * Available shapes:
 *   horizontal_line, trend_line, fib_retracement, rectangle, ray,
 *   vert_line, text, polyline, arrow, circle, ellipse, path,
 *   anchored_text, price_note, note, brush, pattern, sign,
 *   pitchfork, gann_fan, gann_square, cyclical_lines, date_range,
 *   risk_reward, prediction, signal, and many more.
 */

import { z } from "zod";
import { evaluate, safeString, requireFinite, KNOWN_PATHS } from "./core/connection.js";
import type { ToolDef } from "./index.js";

const CHART_API = KNOWN_PATHS.CHART_API;

export const drawingTools: ToolDef[] = [
  // ── tv_draw_shape ────────────────────────────────────────────────────────
  {
    name: "tv_draw_shape",
    description: "Draw a shape on the TradingView chart at specified time/price points. Supports single-point shapes (horizontal_line, text, arrow, etc.) and two-point shapes (trend_line, fib_retracement, rectangle, ray, etc.). Returns the new shape entity_id.",
    parameters: z.object({
      shape: z.string().describe("Shape type: horizontal_line, trend_line, fib_retracement, rectangle, ray, vert_line, text, polyline, arrow, circle, ellipse, pitchfork, gann_fan, signal, risk_reward, prediction, date_range, and many more."),
      time: z.number().describe("Time of the first point as Unix timestamp (seconds)"),
      price: z.number().describe("Price of the first point"),
      time2: z.number().optional().describe("Time of the second point (for two-point shapes like trend_line, fib_retracement)"),
      price2: z.number().optional().describe("Price of the second point (for two-point shapes)"),
      text: z.string().optional().describe("Label/text displayed on the shape"),
      color: z.string().optional().describe("Hex color, e.g. #22c55e for green, #ef4444 for red"),
      width: z.number().optional().describe("Line width in pixels (1-5)"),
      style: z.string().optional().describe("Line style: solid, dotted, dashed"),
    }),
    execute: async (args: any) => {
      const { shape, time, price, time2, price2, text, color, width, style } = args;
      const t = requireFinite(time, "time");
      const p = requireFinite(price, "price");

      const overrides: Record<string, any> = {};
      if (color) overrides.color = color;
      if (width) overrides.width = width;
      if (style) overrides.linestyle = style;
      const overridesStr = JSON.stringify(overrides);
      const textStr = text ? safeString(text) : '""';

      // Snapshot before creating
      const before = await evaluate(`${CHART_API}.getAllShapes().map(function(s) { return s.id; })`);

      if (time2 != null && price2 != null) {
        const t2 = requireFinite(time2, "time2");
        const p2 = requireFinite(price2, "price2");
        await evaluate(`
          ${CHART_API}.createMultipointShape(
            [{ time: ${t}, price: ${p} }, { time: ${t2}, price: ${p2} }],
            { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
          )
        `);
      } else {
        await evaluate(`
          ${CHART_API}.createShape(
            { time: ${t}, price: ${p} },
            { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
          )
        `);
      }

      await new Promise(r => setTimeout(r, 200));
      const after = await evaluate(`${CHART_API}.getAllShapes().map(function(s) { return s.id; })`);
      const newId = (after || []).find((id: string) => !(before || []).includes(id)) || null;
      return { success: true, shape, entity_id: newId };
    },
  },

  // ── tv_draw_list ─────────────────────────────────────────────────────────
  {
    name: "tv_draw_list",
    description: "List all drawings/shapes currently on the TradingView chart.",
    parameters: z.object({}),
    execute: async () => {
      const shapes = await evaluate(`
        (function() {
          var api = ${CHART_API};
          var all = api.getAllShapes();
          return all.map(function(s) { return { id: s.id, name: s.name }; });
        })()
      `);
      return { count: (shapes || []).length, shapes: shapes || [] };
    },
  },

  // ── tv_draw_get_properties ───────────────────────────────────────────────
  {
    name: "tv_draw_get_properties",
    description: "Get detailed properties of a specific drawing by entity_id. Returns points, properties, visibility, lock state.",
    parameters: z.object({
      entity_id: z.string().describe("Entity ID of the drawing (from tv_draw_list)"),
    }),
    execute: async ({ entity_id }: { entity_id: string }) => {
      const result = await evaluate(`
        (function() {
          var api = ${CHART_API};
          var eid = ${safeString(entity_id)};
          var shape = api.getShapeById(eid);
          if (!shape) return { error: 'Shape not found: ' + eid };
          var props = {};
          try { var pts = shape.getPoints(); if (pts) props.points = pts; } catch(e) {}
          try { var ovr = shape.getProperties(); if (ovr) props.properties = ovr; } catch(e) {}
          try { props.visible = shape.isVisible(); } catch(e) {}
          try { props.locked = shape.isLocked(); } catch(e) {}
          try { props.selectable = shape.isSelectionEnabled(); } catch(e) {}
          return props;
        })()
      `);
      if (result?.error) throw new Error(result.error);
      return { success: true, entity_id, ...result };
    },
  },

  // ── tv_draw_remove ───────────────────────────────────────────────────────
  {
    name: "tv_draw_remove",
    description: "Remove a specific drawing by entity_id.",
    parameters: z.object({
      entity_id: z.string().describe("Entity ID of the drawing to remove (from tv_draw_list)"),
    }),
    execute: async ({ entity_id }: { entity_id: string }) => {
      const result = await evaluate(`
        (function() {
          var api = ${CHART_API};
          var eid = ${safeString(entity_id)};
          var before = api.getAllShapes();
          var found = false;
          for (var i = 0; i < before.length; i++) { if (before[i].id === eid) { found = true; break; } }
          if (!found) return { removed: false, error: 'Shape not found: ' + eid };
          api.removeEntity(eid);
          return { removed: true, entity_id: eid };
        })()
      `);
      if (result?.error) throw new Error(result.error);
      return { success: true, entity_id, removed: result?.removed };
    },
  },

  // ── tv_draw_clear_all ────────────────────────────────────────────────────
  {
    name: "tv_draw_clear_all",
    description: "Remove ALL drawings/shapes from the TradingView chart. Use with caution.",
    parameters: z.object({}),
    execute: async () => {
      await evaluate(`${CHART_API}.removeAllShapes()`);
      return { success: true, action: "all_shapes_removed" };
    },
  },
];
