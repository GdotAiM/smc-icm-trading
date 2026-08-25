# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-08-25

### Added
- **ICT Alert Service** — New Discord premium bot for daily briefings
  - `tools/discord_premium.cjs`: Watches agent output, formats Discord embeds
  - `tests/discord_premium.test.cjs`: 6 passing tests for parsing/formatting
  - `data/subscribers.csv`: Manual billing tracker template
- Design docs for ICT Alert Service at `docs/designs/ict-alert-service-hybrid-design.md`

### Configuration
- Add `DISCORD_PREMIUM_CHANNEL`, `PREMIUM_ROLE_ID`, `PREMIUM_ENABLED` to `.env`
- Run with `DRY_RUN=1` for local testing without Discord

