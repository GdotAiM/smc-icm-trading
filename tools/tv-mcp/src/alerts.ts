/**
 * TradingView Desktop — Alert Tools
 *
 * Create, list, and delete alerts via TradingView's pricealerts REST API
 * using the Desktop app's authenticated session.
 */

import { z } from "zod";
import { evaluate, evaluateAsync, safeString, requireFinite, KNOWN_PATHS } from "./core/connection.js";
import type { ToolDef } from "./index.js";

const CONDITION_MAP: Record<string, string> = {
  crossing: "cross", cross: "cross",
  greater_than: "greater", greater: "greater", above: "greater", ">": "greater",
  less_than: "less", less: "less", below: "less", "<": "less",
};

export const alertTools: ToolDef[] = [
  {
    name: "tv_alert_create",
    description: "Create a price alert on TradingView. Defaults to a crossing alert at the specified price level.",
    parameters: z.object({
      price: z.number().describe("Price level to trigger the alert on"),
      condition: z.enum(["crossing", "greater_than", "less_than", "above", "below", "cross", "greater", "less"]).optional().describe("Trigger condition (default: crossing)"),
      message: z.string().optional().describe("Optional alert message"),
    }),
    execute: async ({ price, condition, message }: { price: number; condition?: string; message?: string }) => {
      const p = requireFinite(price, "price");
      const condType = CONDITION_MAP[String(condition || "crossing").trim().toLowerCase()] || "cross";
      const result = await evaluate(`
        (function() {
          try {
            var ms = ${KNOWN_PATHS.CHART_API}._chartWidget.model().mainSeries();
            var sym = (ms.proSymbol && ms.proSymbol()) || (ms.symbol && ms.symbol());
            if (!sym) return { error: 'Could not read chart symbol' };
            var price = ${JSON.stringify(p)};
            var condType = ${safeString(condType)};
            var msg = ${safeString(message || '')};
            if (!msg) { var verb = condType === 'greater' ? 'above' : (condType === 'less' ? 'below' : 'crossing'); msg = sym.split(':').pop() + ' ' + verb + ' ' + price; }
            var cond = { type: condType, frequency: 'on_first_fire', series: [{ type: 'barset' }, { type: 'value', value: price }], resolution: '1' };
            var payload = {
              conditions: [cond], symbol: '={"symbol":"' + sym + '"}', resolution: '1', message: msg,
              sound_file: 'alert/fired', sound_duration: 0, popup: true, auto_deactivate: true,
              email: false, sms_over_email: false, mobile_push: true, web_hook: null, name: null,
              expiration: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), active: true, ignore_warnings: true
            };
            var x = new XMLHttpRequest();
            x.open('POST', 'https://pricealerts.tradingview.com/create_alert', false);
            x.withCredentials = true; x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
            x.send(JSON.stringify({ payload }));
            var data = {}; try { data = JSON.parse(x.responseText); } catch(e) {}
            if (data.s === 'ok') return { success: true, symbol: sym, price: price, condition: condType, message: msg, alert_id: (data.r && data.r.alert_id) || null };
            return { success: false, error: (data.err && data.err.code) || data.errmsg || ('HTTP ' + x.status) };
          } catch(e) { return { success: false, error: e.message }; }
        })()
      `);
      return result ?? { success: false, error: "Alert creation failed" };
    },
  },
  {
    name: "tv_alert_list",
    description: "List all active alerts from TradingView's alert service.",
    parameters: z.object({}),
    execute: async () => {
      const result = await evaluateAsync(`
        fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected' };
            return { alerts: data.r.map(function(a) {
              var sym = ''; try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
              return { alert_id: a.alert_id, symbol: sym, type: a.type, message: a.message, active: a.active, condition: a.condition, resolution: a.resolution, created: a.create_time, last_fired: a.last_fire_time, expiration: a.expiration };
            })};
          }).catch(function(e) { return { alerts: [], error: e.message }; })
      `);
      return { alert_count: result?.alerts?.length || 0, alerts: result?.alerts || [], error: result?.error };
    },
  },
  {
    name: "tv_alert_delete",
    description: "Delete one or more alerts by alert_id, or delete ALL alerts.",
    parameters: z.object({
      alert_id: z.string().optional().describe("Single alert ID to delete"),
      alert_ids: z.array(z.string()).optional().describe("Array of alert IDs to delete"),
      delete_all: z.boolean().optional().describe("Set true to delete ALL alerts"),
    }),
    execute: async ({ alert_id, alert_ids, delete_all }: { alert_id?: string; alert_ids?: string[]; delete_all?: boolean }) => {
      let ids: string[] = [];
      if (alert_ids) ids = ids.concat(alert_ids);
      if (alert_id) ids.push(alert_id);
      if (delete_all) {
        const listed = await evaluateAsync(`
          fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' }).then(r => r.json())
            .then(d => Array.isArray(d.r) ? d.r.map((a:any) => a.alert_id) : [])
        `);
        ids = listed || [];
      }
      if (!ids.length) throw new Error(delete_all ? "No alerts to delete." : "Provide alert_id, alert_ids, or delete_all.");
      const result = await evaluate(`
        (function() {
          var x = new XMLHttpRequest();
          x.open('POST', 'https://pricealerts.tradingview.com/delete_alerts', false);
          x.withCredentials = true; x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
          x.send(JSON.stringify({ payload: { alert_ids: ${JSON.stringify(ids)} } }));
          var data = {}; try { data = JSON.parse(x.responseText); } catch(e) {}
          return data.s === 'ok';
        })()
      `);
      return { success: result === true, deleted_count: ids.length, alert_ids: ids };
    },
  },
];
