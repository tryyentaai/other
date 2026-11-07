// Acceptance tests (handoff §12) against the pure engine. Run: node tests/accept.js <path-to-engine.js>
const E = require(process.argv[2]);
const assert = require('assert');
const NOW = Date.UTC(2026, 10, 9, 10, 0); // Mon 2026-11-09 05:00 ET
let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, '\n  ', e.message); process.exitCode = 1; } };
const ck = (o) => Object.assign({date:E.dayKey(NOW), ts:NOW, sleep:4, energy:8, fatigue:2, sore:{push:1, pull:1, legs:1, core:1}, ill:false, hunger:5}, o);
const logAll = (s, eff) => { s.ex.forEach(e => { e.sets.forEach(x => { x.ar = x.tr; x.al = x.tl; }); e.effort = eff; }); s.status = 'done'; return s; };

t('1. Pull hard 24h ago + soreness 6 → never Pull', () => {
  const st = E.demoState(NOW); const pull = E.planFor(st, ck(), NOW - 24*E.H, 'pull', 'full'); st.sessions.push(logAll(pull, 8));
  for (const sore of [0, 6]) for (const energy of [8, 5]) { const p = E.plan(st, ck({sore:{push:1, pull:sore, legs:1, core:1}, energy}), NOW);
    assert(!p.session || p.session.tpl !== 'pull', 'Pull selected'); assert(!p.session || p.session.tpl !== 'arms', 'Arms (biceps 24h) selected'); }
  const y = E.plan(st, ck({energy:5}), NOW); assert.strictEqual(y.color, 'yellow');
});

t('2. Every generated load is constructible and on-increment', () => {
  const st = E.demoState(NOW); const eq = st.equipment; let n = 0;
  for (let d = 0; d < 21; d++) { const ts = NOW + d*E.D; const p = E.plan(st, ck({ts, date:E.dayKey(ts)}), ts); if (!p.session) continue;
    p.session.ex.forEach(e => e.warm.concat(e.sets).forEach(x => { n++; assert(E.isLoadable(x.tl, e.impl, eq), e.exId + ' ' + x.tl + ' not loadable');
      if (e.impl === 'cable') assert.strictEqual(x.tl % 10, 0); }));
    st.sessions.push(logAll(p.session, 8 + d % 3)); }
  assert(n > 100, 'too few loads checked: ' + n);
});

t('3. Skipped session is never re-served; next day computed fresh', () => {
  const st = E.demoState(NOW); const p = E.plan(st, ck(), NOW); p.session.status = 'skipped'; st.sessions.push(p.session);
  const next = E.plan(st, ck({ts:NOW + E.D}), NOW + E.D); assert.notStrictEqual(next.session.id, p.session.id);
  const setsA = p.session.ex.reduce((a, e) => a + e.sets.length, 0), setsB = next.session.ex.reduce((a, e) => a + e.sets.length, 0);
  if (next.session.tpl === p.session.tpl) assert(setsB <= setsA, 'make-up volume added');
  assert(E.sessionFrac(p.session).back === 0, 'skipped volume counted');
});

t('4. Mark done as reported closes a partial session and feeds exposure + basis', () => {
  const st = E.demoState(NOW); const p = E.plan(st, ck(), NOW).session; const e0 = p.ex[0]; e0.sets[0].ar = e0.sets[0].tr; e0.sets[0].al = e0.sets[0].tl;
  E.markReported(p); st.sessions.push(p); assert.strictEqual(p.status, 'reported');
  const f = E.sessionFrac(p); const prim = E.LIB[p.ex[1].exId].prim; assert(f[prim] >= p.ex[1].sets.length, 'unlogged sets not counted');
  const pr = E.prescribe(st, p.ex[1].exId, NOW + 3*E.D, st.equipment); assert(/reported/.test(pr.basis), 'basis missing reported exposure: ' + pr.basis);
});

t('5. E9 at top-of-range adds load; ≥2 harder drops; ≤6 changes nothing', () => {
  const mk = (exId, reps, load, effort) => { const st = E.demoState(NOW); st.sessions = []; const x = E.LIB[exId];
    st.sessions.push({id:'x', date:'2026-11-01', ts:NOW - 5*E.D, tpl:'push', status:'done', dose:'full', ex:[{exId, slot:0, main:true, sets:[0,1,2].map(() => ({tr:reps, tl:load, ar:reps, al:load})), warm:[], effort}]});
    return E.prescribe(st, exId, NOW, st.equipment); };
  const up = mk('bench', 8, 205, 9); assert(up.load > 205, 'no add: ' + up.load); assert(E.isLoadable(up.load, 'barbell', E.demoState(NOW).equipment));
  const iso = mk('preacher', 12, 55, 9); assert(iso.load > 55);
  const hard = mk('bench', 6, 205, 10); assert(hard.load < 205 && hard.load >= 190, 'drop: ' + hard.load);
  const a = mk('bench', 7, 205, 6), b = mk('bench', 7, 205, null), c = mk('bench', 7, 205, 5); assert.deepStrictEqual([a.load, a.reps], [b.load, b.reps]); assert.deepStrictEqual([c.load, c.reps], [b.load, b.reps]);
  const cab = mk('pushdown', 15, 50, 8); assert.strictEqual(cab.load % 10, 0); // 10-lb step on 50 = 20% jump → reps first
});

t('6. Two of three deload domains abnormal → deload dose + one sentence per domain', () => {
  const st = E.demoState(NOW); const ts0 = NOW - 6*E.D;
  // red days ×3 + effort drift on 2 lifts at the same load/reps
  for (let i = 0; i < 3; i++) st.checkins.push({date:E.dayKey(ts0 + i*E.D), ts:ts0 + i*E.D, sleep:1, energy:2, fatigue:5, sore:{push:3, pull:3, legs:3, core:2}, color:'red'});
  ['bench', 'squat'].forEach((id, k) => [8, 10].forEach((eff, j) => st.sessions.push({id:'d' + k + j, date:'x', ts:NOW - (9 - j*5)*E.D + k*E.H, tpl:'push', status:'done', dose:'full',
    ex:[{exId:id, main:true, slot:0, warm:[], sets:[{tr:6, tl:200, ar:6, al:200}], effort:eff}]})));
  st.sessions.sort((a, b) => a.ts - b.ts);
  const r = E.deloadCheck(st, NOW); assert(r.trigger, JSON.stringify(r.domains)); assert.strictEqual(r.domains.length, 3); r.domains.forEach(d => assert(/\.$/.test(d.line)));
  st.deload = {start:new Date(NOW - E.H).toISOString(), until:new Date(NOW + 6*E.D).toISOString()};
  const p = E.plan(st, ck(), NOW); assert.strictEqual(p.session.dose, 'deload'); assert(!p.session.finisher); p.session.ex.forEach(e => assert(e.tgtE[1] <= 6));
});

t('7. Sessions load with targets and zero actuals', () => {
  const st = E.demoState(NOW); const p = E.plan(st, ck(), NOW).session;
  p.ex.forEach(e => e.warm.concat(e.sets).forEach(x => { assert(x.tr > 0 || e.impl === 'bodyweight'); assert.strictEqual(x.ar, null); assert.strictEqual(x.al, null); }));
  p.ex.forEach(e => assert.strictEqual(e.effort, null));
});

t('8. Export → wipe → import is byte-identical', () => {
  const st = E.demoState(NOW); const a = E.exportJSON(st); const b = E.exportJSON(E.importJSON(a)); assert.strictEqual(a, b); assert(E.exportCSV(st).split('\n').length > 50);
});

t('9. Deterministic + offline (no globals touched, identical output)', () => {
  const a = JSON.stringify(E.plan(E.demoState(NOW), ck(), NOW)), b = JSON.stringify(E.plan(E.demoState(NOW), ck(), NOW)); assert.strictEqual(a, b);
});

t('10. Red rules: illness, fatigue 5, soreness 7+ everywhere', () => {
  const st = E.demoState(NOW);
  assert.strictEqual(E.plan(st, ck({ill:true}), NOW).color, 'red');
  assert.strictEqual(E.plan(st, ck({fatigue:5}), NOW).color, 'red');
  assert.strictEqual(E.plan(st, ck({sore:{push:7, pull:8, legs:9, core:7}}), NOW).color, 'red');
  st.profile.clockShift = new Date(NOW - 3*E.D).toISOString();
  assert.notStrictEqual(E.plan(st, ck({energy:3, sleep:1}), NOW).color, 'red', 'clock change: low energy alone forced red');
});

t('11. Bans + limitations never programmed; two-strike swap', () => {
  const st = E.demoState(NOW); const seen = new Set();
  for (let d = 0; d < 14; d++) { const ts = NOW + d*E.D, p = E.plan(st, ck({ts}), ts); if (!p.session) continue; p.session.ex.forEach(e => seen.add(e.exId)); st.sessions.push(logAll(p.session, 8)); }
  ['lmhack', 'bridge', 'superman', 'bbrow', 'wcurl'].forEach(id => assert(!seen.has(id), id + ' programmed'));
  assert(seen.has('preacher'), 'favorite not featured');
  E.flagPain(st, 'crow', NOW); E.flagPain(st, 'crow', NOW); assert(!E.exAllowed(st, 'crow'), 'two-strike failed');
});

t('12. Weekly review flags weigh-in gaps and never invents a trend', () => {
  const st = E.demoState(NOW); st.weights = st.weights.filter(w => w.ts < NOW - 10*E.D);
  const r = E.review(st, NOW); assert(r.gapDays > 7); assert(r.avg7 === null); assert(/No weigh-in for/.test(r.notes.join(' ')));
});
console.log(pass + ' passed');
