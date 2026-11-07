# Iron & Fuel (web MVP)

Adaptive home-gym coach built from the Protocol v3 handoff. Each day comes from a 30-second readiness check-in, one effort rating per exercise steers the next load, and deloads trigger from your data, not the calendar.

**Use it:** open https://tryyentaai.github.io/other/iron-fuel/ in Safari › Share › Add to Home Screen. Works offline after the first load.

- `engine.js`: the deterministic rules engine (no network, no LLM). Every §4 threshold is a per-user setting.
- `app.js`: UI (Today · Train · Progress · Library · Settings + onboarding).
- `tests/accept.js`: the handoff's §12 acceptance tests. Run `node tests/accept.js $(pwd)/engine.js`.

Data stays on the device (localStorage, persistent-storage requested). Export JSON/CSV from Settings › Data.

Not medical advice. The app gives general fitness programming and doesn't diagnose or treat anything.
