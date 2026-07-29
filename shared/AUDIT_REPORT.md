# SMC-ICM System Audit Report
**Generated**: 2026-07-27T16:48:57.399Z
**Project**: C:\Users\cash\smc-icm-trading

---

## Summary

| Metric | Value |
|--------|-------|
| Total Checks | 15 |
| Passed | 6 |
| Failed | 9 |
| High Severity Issues | 1 |
| Medium Severity Issues | 3 |
| Low Severity Issues | 5 |
| Auto-Fixable | 1 |

---

## Findings by Category

### core-docs (3 issues)

#### 🔴 claude_tools_complete
- **Detail**: CLAUDE.md missing 9 tools + 5 ICT tools
- **Fix**: Add ICT Knowledge Base section and update Available Tools list in CLAUDE.md
- **Auto-fix**: ❌ Manual

#### 🔵 backtest_in_root
- **Detail**: CLAUDE_BACKTEST.md should be in _archive/
- **Fix**: Move to _archive/
- **Auto-fix**: ✅ Yes

#### 🟡 context_stage_list
- **Detail**: CONTEXT.md missing stages: 00_macro_context, 00b_council_vote, 05b_micro_confirmation
- **Fix**: Update CONTEXT.md stage list
- **Auto-fix**: ❌ Manual

### tools (2 issues)

#### 🟡 draw_script_bloat
- **Detail**: 27 draw scripts — consolidate to 3 parameterized scripts
- **Fix**: Archive 24 redundant draw scripts. Keep: draw_setup.cjs (parameterized), draw_clear.cjs, draw_session.cjs
- **Auto-fix**: ❌ Manual

#### 🔵 duplicate_tools
- **Detail**: 2 tools superseded by ICT tools: lesson_extractor.cjs, playbook_updater.cjs
- **Fix**: Archive superseded tools to tools/_legacy/
- **Auto-fix**: ❌ Manual

### config (1 issues)

#### 🔵 preferred_pairs_current
- **Detail**: preferred_pairs.md: NAS100=false, DXY=false
- **Fix**: Add NAS100 and DXY to preferred pairs if traded
- **Auto-fix**: ❌ Manual

### data (2 issues)

#### 🔵 stale_stage_outputs
- **Detail**: 26 stage output files older than 1 day
- **Fix**: Archive old outputs to shared/archive/
- **Auto-fix**: ❌ Manual

#### 🔵 shared_orphan_files
- **Detail**: 2 files outside date folders: trade_log.json, WEEKLY_BRIEFING_2026-07-27.md
- **Fix**: Move orphan files into appropriate date folders
- **Auto-fix**: ❌ Manual

### structure (1 issues)

#### 🟡 stage_numbering_consistent
- **Detail**: 00b exists without 00a
- **Fix**: Rename 00b_council_vote to 00_council_vote or create 00a counterpart
- **Auto-fix**: ❌ Manual

---

## Auto-Fix Results


## Remaining Manual Fixes

- [ ] **claude_tools_complete**: Add ICT Knowledge Base section and update Available Tools list in CLAUDE.md
- [ ] **context_stage_list**: Update CONTEXT.md stage list
- [ ] **draw_script_bloat**: Archive 24 redundant draw scripts. Keep: draw_setup.cjs (parameterized), draw_clear.cjs, draw_session.cjs
- [ ] **duplicate_tools**: Archive superseded tools to tools/_legacy/
- [ ] **preferred_pairs_current**: Add NAS100 and DXY to preferred pairs if traded
- [ ] **stale_stage_outputs**: Archive old outputs to shared/archive/
- [ ] **shared_orphan_files**: Move orphan files into appropriate date folders
- [ ] **stage_numbering_consistent**: Rename 00b_council_vote to 00_council_vote or create 00a counterpart
