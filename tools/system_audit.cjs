// SMC-ICM System Audit & Auto-Maintenance
// Scans entire project, reports issues, auto-fixes where safe

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// ═══════════════ AUDIT RULES ═══════════════
const AUDIT_CHECKS = [
  // ── Core Docs ────────────────────────────
  {
    id: "claude_tools_complete",
    category: "core-docs",
    severity: "high",
    check: () => {
      const claude = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
      const actualTools = fs.readdirSync(path.join(ROOT, "tools"))
        .filter(f => f.endsWith(".cjs") || f.endsWith(".py"))
        .map(f => f.replace(/\.(cjs|py)$/, ""));
      const missing = actualTools.filter(t => !claude.includes(t) && !["discord_bot","backtest","lesson_extractor","playbook_updater","performance_ledger","summarizer","archetype_engine","po3_fractal","priority2","priority34","ny_time","market_state"].includes(t));
      const ictMissing = ["ict_knowledge_ingest","ict_rag","ict_curriculum","ict_decision_validator","ict_continuous_learn"]
        .filter(t => !claude.includes(t.replace(/_/g, "")));
      return {
        pass: missing.length === 0 && ictMissing.length === 0,
        detail: `CLAUDE.md missing ${missing.length} tools + ${ictMissing.length} ICT tools`,
        fix: "Add ICT Knowledge Base section and update Available Tools list in CLAUDE.md",
        autoFix: false,
      };
    }
  },
  {
    id: "backtest_in_root",
    category: "core-docs",
    severity: "low",
    check: () => {
      const exists = fs.existsSync(path.join(ROOT, "CLAUDE_BACKTEST.md"));
      return { pass: !exists, detail: exists ? "CLAUDE_BACKTEST.md should be in _archive/" : "OK", fix: "Move to _archive/", autoFix: true };
    }
  },
  {
    id: "context_stage_list",
    category: "core-docs",
    severity: "medium",
    check: () => {
      const ctx = fs.readFileSync(path.join(ROOT, "CONTEXT.md"), "utf8");
      const stages = fs.readdirSync(path.join(ROOT, "stages")).filter(d => /^\d/.test(d)).sort();
      const missing = stages.filter(s => !ctx.includes(s));
      return { pass: missing.length === 0, detail: `CONTEXT.md missing stages: ${missing.join(", ")}`, fix: "Update CONTEXT.md stage list", autoFix: false };
    }
  },

  // ── Tools ────────────────────────────────
  {
    id: "draw_script_bloat",
    category: "tools",
    severity: "medium",
    check: () => {
      const drawDir = path.join(ROOT, "tools", "tv-mcp");
      if (!fs.existsSync(drawDir)) return { pass: true, detail: "No tv-mcp dir" };
      const scripts = fs.readdirSync(drawDir).filter(f => f.startsWith("draw_") && f.endsWith(".cjs"));
      const bloat = scripts.length > 5;
      return {
        pass: !bloat,
        detail: `${scripts.length} draw scripts — consolidate to 3 parameterized scripts`,
        fix: `Archive ${scripts.length - 3} redundant draw scripts. Keep: draw_setup.cjs (parameterized), draw_clear.cjs, draw_session.cjs`,
        autoFix: false,
        redundantScripts: scripts,
      };
    }
  },
  {
    id: "smc_engine_built",
    category: "tools",
    severity: "high",
    check: () => {
      const dist = path.join(ROOT, "tools", "smc-engine", "dist");
      const exists = fs.existsSync(dist);
      return { pass: exists, detail: exists ? "smc-engine is built" : "smc-engine needs build — run: cd tools/smc-engine && npx tsc", fix: "cd tools/smc-engine && npx tsc", autoFix: true };
    }
  },
  {
    id: "duplicate_tools",
    category: "tools",
    severity: "low",
    check: () => {
      const dupes = [
        { old: "lesson_extractor.cjs", new: "ict_continuous_learn.cjs", note: "ICT continuous learn replaces lesson extractor" },
        { old: "playbook_updater.cjs", new: "ict_continuous_learn.cjs", note: "ICT continuous learn includes playbook updates" },
      ];
      const stillExist = dupes.filter(d => fs.existsSync(path.join(ROOT, "tools", d.old)));
      return {
        pass: stillExist.length === 0,
        detail: `${stillExist.length} tools superseded by ICT tools: ${stillExist.map(d => d.old).join(", ")}`,
        fix: "Archive superseded tools to tools/_legacy/",
        autoFix: false,
      };
    }
  },

  // ── Config Files ─────────────────────────
  {
    id: "config_dxy_in_indices",
    category: "config",
    severity: "medium",
    check: () => {
      const rp = fs.readFileSync(path.join(ROOT, "tools", "run_pair.cjs"), "utf8");
      const hasDXY = rp.includes('"DXY"');
      return {
        pass: hasDXY,
        detail: hasDXY ? "DXY in INDICES" : "DXY missing from instrumentConfig INDICES array",
        fix: "Add DXY to INDICES array in run_pair.cjs if not present",
        autoFix: false,
      };
    }
  },
  {
    id: "preferred_pairs_current",
    category: "config",
    severity: "low",
    check: () => {
      const pp = path.join(ROOT, "_config", "preferred_pairs.md");
      if (!fs.existsSync(pp)) return { pass: false, detail: "preferred_pairs.md missing" };
      const content = fs.readFileSync(pp, "utf8");
      const hasNas100 = content.includes("NAS100");
      const hasDxy = content.includes("DXY");
      return {
        pass: hasNas100 && hasDxy,
        detail: `preferred_pairs.md: NAS100=${hasNas100}, DXY=${hasDxy}`,
        fix: "Add NAS100 and DXY to preferred pairs if traded",
        autoFix: false,
      };
    }
  },

  // ── Data / Outputs ───────────────────────
  {
    id: "stale_stage_outputs",
    category: "data",
    severity: "low",
    check: () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const staleFiles = [];
      function scanDir(dir) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fp = path.join(dir, entry.name);
          if (entry.isDirectory()) { scanDir(fp); }
          else if (entry.isFile() && (now - fs.statSync(fp).mtimeMs) > oneDay) {
            staleFiles.push(path.relative(ROOT, fp));
          }
        }
      }
      scanDir(path.join(ROOT, "stages"));
      return {
        pass: staleFiles.length < 20,
        detail: `${staleFiles.length} stage output files older than 1 day`,
        fix: "Archive old outputs to shared/archive/",
        autoFix: false,
        staleCount: staleFiles.length,
      };
    }
  },
  {
    id: "shared_orphan_files",
    category: "data",
    severity: "low",
    check: () => {
      const shared = path.join(ROOT, "shared");
      if (!fs.existsSync(shared)) return { pass: true };
      const orphans = fs.readdirSync(shared).filter(f => {
        return !/^\d{4}-\d{2}-\d{2}$/.test(f) && !["backtest","performance","summaries","archive"].includes(f);
      });
      return {
        pass: orphans.length === 0,
        detail: `${orphans.length} files outside date folders: ${orphans.join(", ")}`,
        fix: "Move orphan files into appropriate date folders",
        autoFix: false,
      };
    }
  },

  // ── ICT Knowledge Base ───────────────────
  {
    id: "rag_index_exists",
    category: "ict-kb",
    severity: "high",
    check: () => {
      const idx = path.join(ROOT, "references", "ict_knowledge", "rag", "rag_index.json");
      const exists = fs.existsSync(idx);
      return {
        pass: exists,
        detail: exists ? "RAG index ready" : "RAG index not built — run: node tools/ict_rag.cjs --build",
        fix: "node tools/ict_rag.cjs --build",
        autoFix: true,
      };
    }
  },
  {
    id: "curriculum_complete",
    category: "ict-kb",
    severity: "medium",
    check: () => {
      const learned = path.join(ROOT, "references", "ict_knowledge", "learned");
      const sessions = fs.existsSync(learned) ? fs.readdirSync(learned).filter(f => f.startsWith("session-")) : [];
      return {
        pass: sessions.length >= 4,
        detail: `${sessions.length}/4 curriculum sessions completed`,
        fix: "Run: node tools/ict_curriculum.cjs --run all",
        autoFix: false,
      };
    }
  },
  {
    id: "claude_ict_prompt_exists",
    category: "ict-kb",
    severity: "high",
    check: () => {
      const exists = fs.existsSync(path.join(ROOT, "CLAUDE_ICT_KNOWLEDGE.md"));
      return { pass: exists, detail: exists ? "CLAUDE_ICT_KNOWLEDGE.md present" : "Missing — run curriculum", fix: "node tools/ict_curriculum.cjs --run all", autoFix: false };
    }
  },

  // ── Structure ────────────────────────────
  {
    id: "stage_numbering_consistent",
    category: "structure",
    severity: "medium",
    check: () => {
      const stages = fs.readdirSync(path.join(ROOT, "stages")).filter(d => /^\d/.test(d)).sort();
      const issues = [];
      if (stages.includes("00b_council_vote") && !stages.includes("00a")) issues.push("00b exists without 00a");
      return {
        pass: issues.length === 0,
        detail: issues.length > 0 ? issues.join("; ") : `All ${stages.length} stages consistent`,
        fix: "Rename 00b_council_vote to 00_council_vote or create 00a counterpart",
        autoFix: false,
      };
    }
  },
  {
    id: "archive_exists",
    category: "structure",
    severity: "low",
    check: () => {
      const arch = path.join(ROOT, "_archive");
      const exists = fs.existsSync(arch);
      if (!exists) return { pass: false, detail: "_archive/ missing", fix: "mkdir _archive" };
      const files = fs.readdirSync(arch);
      return {
        pass: files.includes("USER_MANUAL.md") && files.includes("SYSTEM_MANUAL.md"),
        detail: `_archive has ${files.length} files: ${files.join(", ")}`,
        fix: "Move USER_MANUAL.md and SYSTEM_MANUAL.md to _archive/",
        autoFix: false,
      };
    }
  },
];

// ═══════════════ AUTO-FIX ENGINE ═══════════════
function autoFix(check) {
  if (!check.autoFix) return false;

  switch (check.id) {
    case "backtest_in_root": {
      const src = path.join(ROOT, "CLAUDE_BACKTEST.md");
      const dst = path.join(ROOT, "_archive", "CLAUDE_BACKTEST.md");
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.join(ROOT, "_archive"), { recursive: true });
        fs.renameSync(src, dst);
        return true;
      }
      return false;
    }
    case "smc_engine_built": {
      const { execSync } = require("child_process");
      try {
        execSync("npx tsc", { cwd: path.join(ROOT, "tools", "smc-engine"), stdio: "ignore", timeout: 30000 });
        return true;
      } catch (e) { return false; }
    }
    case "rag_index_exists": {
      const { execSync } = require("child_process");
      try {
        execSync(`node "${path.join(ROOT, "tools", "ict_rag.cjs")}" --build`, { stdio: "ignore", timeout: 30000 });
        return true;
      } catch (e) { return false; }
    }
  }
  return false;
}

// ═══════════════ REPORT GENERATOR ═══════════════
function generateReport(results) {
  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  let report = `# SMC-ICM System Audit Report
**Generated**: ${new Date().toISOString()}
**Project**: ${ROOT}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Checks | ${results.length} |
| Passed | ${results.filter(r => r.pass).length} |
| Failed | ${results.filter(r => !r.pass).length} |
| High Severity Issues | ${results.filter(r => !r.pass && r.severity === "high").length} |
| Medium Severity Issues | ${results.filter(r => !r.pass && r.severity === "medium").length} |
| Low Severity Issues | ${results.filter(r => !r.pass && r.severity === "low").length} |
| Auto-Fixable | ${results.filter(r => !r.pass && r.autoFix).length} |

---

## Findings by Category

`;

  for (const [cat, items] of Object.entries(byCategory)) {
    const failed = items.filter(i => !i.pass);
    if (failed.length === 0) continue;
    report += `### ${cat} (${failed.length} issues)\n\n`;
    for (const item of failed) {
      const icon = item.severity === "high" ? "🔴" : item.severity === "medium" ? "🟡" : "🔵";
      report += `#### ${icon} ${item.id}\n`;
      report += `- **Detail**: ${item.detail}\n`;
      report += `- **Fix**: ${item.fix}\n`;
      report += `- **Auto-fix**: ${item.autoFix ? "✅ Yes" : "❌ Manual"}\n\n`;
    }
  }

  report += `---

## Auto-Fix Results

`;

  return report;
}

// ═══════════════ MAIN ═══════════════
function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
System Audit & Auto-Maintenance
Usage:
  node tools/system_audit.cjs --audit        Run full system audit
  node tools/system_audit.cjs --fix          Run audit + auto-fix where safe
  node tools/system_audit.cjs --report       Generate markdown audit report
  node tools/system_audit.cjs --schedule     Set up automated maintenance schedule

Examples:
  node tools/system_audit.cjs --audit
  node tools/system_audit.cjs --fix
`);
    return;
  }

  // ── Audit ─────────────────────────────────────────
  if (mode === "--audit" || mode === "--fix" || mode === "--report") {
    console.log(`\n🔍 SMC-ICM System Audit`);
    console.log("═".repeat(60));

    const results = [];
    const autofixes = [];

    for (const check of AUDIT_CHECKS) {
      const result = { ...check, ...check.check() };
      results.push(result);
      const icon = result.pass ? "✅" : result.severity === "high" ? "🔴" : result.severity === "medium" ? "🟡" : "🔵";
      console.log(`${icon} ${result.id}: ${result.detail}`);

      if (!result.pass && mode === "--fix" && result.autoFix) {
        console.log(`   🔧 Auto-fixing...`);
        const fixed = autoFix(result);
        if (fixed) {
          autofixes.push(result.id);
          console.log(`   ✅ Fixed`);
        } else {
          console.log(`   ❌ Fix failed`);
        }
      }
    }

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n${"═".repeat(60)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (autofixes.length > 0) console.log(`Auto-fixed: ${autofixes.join(", ")}`);

    if (mode === "--report") {
      const report = generateReport(results);
      // Append auto-fix results
      let reportFull = report;
      if (autofixes.length > 0) {
        reportFull += `The following issues were auto-fixed:\n\n`;
        for (const id of autofixes) reportFull += `- ✅ ${id}\n`;
        reportFull += `\n`;
      }
      reportFull += `\n## Remaining Manual Fixes\n\n`;
      const manual = results.filter(r => !r.pass && !r.autoFix);
      if (manual.length === 0) {
        reportFull += `All issues resolved! 🎉\n`;
      } else {
        for (const m of manual) {
          reportFull += `- [ ] **${m.id}**: ${m.fix}\n`;
        }
      }

      const reportPath = path.join(ROOT, "shared", "AUDIT_REPORT.md");
      fs.writeFileSync(reportPath, reportFull);
      console.log(`\nReport saved: ${reportPath}`);
    }

    return;
  }

  // ── Schedule ──────────────────────────────────────
  if (mode === "--schedule") {
    console.log(`
🕐 Automated Maintenance Schedule
═══════════════════════════════════════

Daily (every session start):
  node tools/system_audit.cjs --audit    Quick health check
  node tools/ict_rag.cjs --stats         Verify RAG index

Weekly (Sunday evening):
  node tools/system_audit.cjs --fix      Audit + auto-fix
  node tools/ict_curriculum.cjs --prompt  Rebuild knowledge prompt
  node tools/ict_continuous_learn.cjs --dashboard  Review learning

Monthly:
  Archive stale stage outputs to shared/archive/
  Clean up draw scripts (keep 3 active)
  Rebuild smc-engine: cd tools/smc-engine && npx tsc
  Rebuild RAG index: node tools/ict_rag.cjs --build
  Run full curriculum: node tools/ict_curriculum.cjs --run all

To automate, add to .claude/settings.json hooks:
  "hooks": {
    "SessionStart": [
      { "command": "node tools/system_audit.cjs --audit" }
    ]
  }
`);
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

main();
