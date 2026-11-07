/* Iron & Fuel — UI layer. All coaching decisions come from engine.js. */
(function(){
'use strict';
const E = window.Engine, KEY = 'ironfuel.v1', TKEY = 'ironfuel.timer';
const $ = s => document.querySelector(s), view = $('#view');
const ic = (n, c) => `<svg class="i${c ? ' ' + c : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const now = () => Date.now();
E.setTZ(new Date().getTimezoneOffset());

/* ---------- persistence ---------- */
let S;
function load(){ try { const t = localStorage.getItem(KEY); if (t) return E.importJSON(t); } catch(e){ console.warn(e); } return E.newState(new Date().toISOString()); }
function save(){ try { localStorage.setItem(KEY, E.exportJSON(S)); } catch(e){ toast('Could not save. Export your data from Settings.'); } }
S = load(); S.today = S.today || {};
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => { S.meta.persisted = ok; });
// clock-change calibration: device offset changed since last open → start the 14-day window
(function(){ const off = new Date().getTimezoneOffset(); if (S.meta.tzOff != null && S.meta.tzOff !== off){ S.profile.clockShift = new Date().toISOString(); setTimeout(() => toast('Clock change detected. For 2 weeks, low sleep or energy alone won’t cut your loads.'), 600); } S.meta.tzOff = off; save(); })();

const ui = {tab: 'today', ck: null, ob: 0, open: {}, q: ''};
const today = () => E.dayKey(now());
const active = () => S.sessions.find(s => s.status === 'active');
const todayCk = () => (S.checkins || []).find(c => c.date === today());
const settings = () => E.settingsOf(S);
const lbl = l => l == null ? '' : (l === 0 ? 'BW' : l + ' lb');

/* ---------- toast / sheet ---------- */
let toastT;
function toast(msg){ let t = $('.toast'); if (!t){ t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role','status'); document.body.appendChild(t); } t.textContent = msg; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', 3200); }
function sheet(html){ const sh = $('#sheet'); sh.innerHTML = '<div class="grab"></div>' + html; sh.classList.add('on'); $('#scrim').classList.add('on'); }
function closeSheet(){ $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); }
const INFO = {
  effort:'Effort: 10 = no reps left, 9 = 1 left, 8 = 2 left, 7 = 3 left, 5–6 = easy. Rate once, after the last set.',
  light:'Green = full session. Yellow = −5% load, about 70% of the sets, no finisher. Red = rest or walk. Skipped volume is never made up.',
  basis:'Where the number comes from: your last time doing this lift (reps @ load · effort).',
  frac:'Fractional sets: a set counts 1 for the main muscle and 0.5 for each helper. Shaded band = your weekly target.',
  plates:'Plates per side of the bar (whole sleeve for landmine).'
};
const info = k => `<button class="info" data-act="info" data-k="${k}" aria-label="What is this?" data-tip="${esc(INFO[k].split('.')[0])}">${ic('info')}</button>`;

/* ---------- routing ---------- */
function setTab(t){ ui.tab = t; render(); window.scrollTo(0,0); }
function render(){
  const nav = $('#tabs');
  if (!S.meta.onboarded){ nav.style.display = 'none'; return renderOnboarding(); }
  nav.style.display = 'flex';
  nav.querySelectorAll('button').forEach(b => { b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'); b.classList.toggle('live', b.dataset.tab === 'train' && !!active()); });
  ({today: renderToday, train: renderTrain, progress: renderProgress, library: renderLibrary, settings: renderSettings})[ui.tab]();
}

/* ---------- TODAY ---------- */
function weekCount(){ const ws = E.weekStart(now()); return S.sessions.filter(s => (s.status === 'done' || s.status === 'reported') && s.ts >= ws).length; }
function currentPlan(){
  const ck = todayCk(), o = S.today.date === today() ? S.today : {};
  if (o.rest) return {color: ck ? ck.color : 'unknown', rest:true, why:'Rest day. Nothing is owed later.'};
  if (o.tpl){ const s = E.planFor(S, ck, now(), o.tpl, o.dose); const base = E.plan(S, ck, now()); return Object.assign({}, base, {session:s, color:s.color, why: o.dose === 'yellow' ? 'Trimmed to the yellow dose: −5% load, fewer sets, no finisher.' : 'You picked ' + s.name + '. Built from your history.'}); }
  return E.plan(S, ck, now());
}
function renderToday(){
  const d = new Date(), rv = E.review(S, now()), ck = todayCk(), act = active();
  const doneToday = S.sessions.find(s => s.date === today() && (s.status === 'done' || s.status === 'reported'));
  let h = `<div class="row"><div class="sp"><div class="sub">${d.toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'})}</div>
    <h1>Today<em>.</em></h1><div class="sub">${weekCount()} of ${S.profile.days} sessions this week · ${cap(S.profile.phase)} · block week ${rv.blockWeek} of 4</div></div>
    <button class="ib" data-act="tab" data-t="settings" aria-label="Profile and settings">${ic('set')}</button></div>`;
  if (S.deload && now() < Date.parse(S.deload.until)) h += `<div class="card" style="border-color:var(--yl)"><div class="row"><span class="chip yellow">Deload week</span><span class="sub">until ${new Date(S.deload.until).toLocaleDateString(undefined,{weekday:'short'})}</span></div><div style="margin-top:10px">${(S.deload.lines||[]).map(esc).join('<br>')}</div></div>`;
  if (act){ h += `<div class="card"><span class="chip brand">In progress</span><h3 style="margin-top:10px">${esc(act.name)}</h3><p class="sub">${logged(act)} sets logged</p><button class="btn" data-act="tab" data-t="train">Resume workout</button></div>`; }
  else if (doneToday){ h += `<div class="card"><span class="chip green">${ic('check')} Done</span><h3 style="margin-top:10px">${esc(doneToday.name)}</h3><p class="sub">${doneToday.status === 'reported' ? 'Marked done as reported.' : 'Logged.'} Recover well. Tomorrow is built fresh from today.</p></div>`; }
  else if (!ck && !S.today.skipCk) h += readinessCard();
  else h += planCard(currentPlan());
  h += weighCard() + `<button class="opt" data-act="tab" data-t="progress">${ic('prog')}<div class="sp"><b>Weekly review</b><div class="sub">${rv.deload.trigger ? 'Deload signals are up.' : (rv.gapDays != null && rv.gapDays > 7 ? 'No weigh-in for ' + rv.gapDays + ' days.' : 'On track.')}</div></div>${ic('chev')}</button>`;
  view.innerHTML = h;
}
function readinessCard(){
  const prev = (S.checkins||[]).slice(-1)[0], snap = v => v >= 7 ? 8 : v >= 4 ? 5 : 1;
  const c = ui.ck = ui.ck || {sleep:3, energy:7, fatigue:2, sore: prev && prev.sore ? {push:snap(prev.sore.push), pull:snap(prev.sore.pull), legs:snap(prev.sore.legs), core:snap(prev.sore.core)} : {push:1, pull:1, legs:1, core:1}, ill:false, hunger:5};
  const seg = (k, n0, n1) => `<div class="seg" role="group">${range(n0, n1).map(v => `<button data-act="ck" data-k="${k}" data-v="${v}" aria-pressed="${c[k] === v}">${v}</button>`).join('')}</div>`;
  const slider = (k, v, lab, path) => `<div class="q"><div class="lab">${lab}<b class="val num" id="v-${k}">${v}</b></div><input type="range" min="0" max="10" value="${v}" data-ck="${path || k}" data-out="v-${k}" aria-label="${lab.replace(/<[^>]+>/g, '')}"></div>`;
  return `<div class="card"><div class="row"><h3 class="sp">Readiness</h3><span class="sub">30 seconds</span>${info('light')}</div>
   <div class="q"><div class="lab">Sleep quality <span>1 awful · 5 great</span></div>${seg('sleep',1,5)}</div>
   ${slider('energy', c.energy, 'Energy <span class="sub">0–10</span>')}
   <div class="q"><div class="lab">Whole-body fatigue <span>1 fresh · 5 wrecked</span></div>${seg('fatigue',1,5)}</div>
   <h2 style="margin-top:20px">Soreness</h2>
   ${Object.keys(E.REGION_LABEL).map(r => `<div class="q"><div class="lab">${E.REGION_LABEL[r]}</div><div class="seg" role="group" aria-label="${E.REGION_LABEL[r]} soreness">${[[1,'Fine'],[5,'Sore'],[8,'Wrecked']].map(([v, t]) => `<button data-act="sore" data-r="${r}" data-v="${v}" aria-pressed="${c.sore[r] === v}">${t}</button>`).join('')}</div></div>`).join('')}
   ${S.profile.hunger ? slider('hunger', c.hunger, 'Hunger <span class="sub">optional</span>') : ''}
   <div class="toggle" style="margin-top:8px"><label for="ill"><b>Sharp joint pain or illness</b><div class="sub">Pain that changes how you move, fever, or sickness</div></label><span class="sw"><input id="ill" type="checkbox" data-ckb="ill" ${c.ill ? 'checked' : ''}><i></i></span></div>
   <button class="btn" data-act="submitCk" style="margin-top:14px">See today’s plan</button>
   <button class="btn ghost" data-act="skipCk" style="margin-top:8px;min-height:48px">Skip, just train</button></div>`;
}
function planCard(p){
  const color = p.color || 'unknown', label = {green:'Green', yellow:'Yellow', red:'Red', unknown:'Readiness unknown'}[color];
  let h = `<div class="card"><div class="light"><span class="dot ${color}"></span>${label}${info('light')}</div><div class="why">${esc(p.why)}</div>`;
  if (!p.session){ h += `<h3>Rest or walk</h3><p class="sub">Easy ${S.profile.walkMi || 1.5} mi walk or 10 min of mobility. Nothing is made up later.</p>
     <button class="btn ghost" data-act="adjust">Adjust</button>`; if (p.rest) h += `<button class="btn ghost" data-act="unrest" style="margin-top:8px">Undo rest day</button>`; return h + '</div>'; }
  const s = p.session;
  h += `<div class="row"><h3 class="sp">${esc(s.name)}</h3><span class="sub num">~${s.estMin} min</span></div>
    ${s.dose !== 'full' ? `<span class="chip ${s.dose === 'deload' ? 'yellow' : 'yellow'}" style="margin-top:6px">${s.dose === 'deload' ? 'Deload dose' : 'Trimmed dose'}</span>` : ''}<div style="margin-top:8px">`;
  let prevSS = null; s.ex.forEach(e => { const x = E.LIB[e.exId]; h += `<div class="exl${e.ss && e.ss !== prevSS ? ' ssstart' : ''}"><div class="rail ${e.ss ? 'ss' : ''}"></div><div class="sp">
     ${e.ss && e.ss !== prevSS ? `<div class="feat">Superset ${e.ss}</div>` : ''}${e.feature ? '<div class="feat">Featured</div>' : ''}<div class="n">${esc(x.name)}</div>
     <div class="t num">${e.sets.length} × ${e.sets[0].tr} @ ${lbl(e.sets[0].tl)} · E${e.tgtE[0]}–${e.tgtE[1]}</div>
     <div class="b">${esc(e.basis || 'First time: starting load')}</div></div></div>`; prevSS = e.ss; });
  if (s.finisher) h += `<div class="exl"><div class="rail ss"></div><div><div class="feat">Finisher</div><div class="n">${esc(s.finisher.name)}</div><div class="t">${s.finisher.rounds} rounds · ${s.finisher.items.join(' + ')}</div></div></div>`;
  h += `<div class="exl"><div class="rail"></div><div class="row sp">${ic('walk')}<div><div class="n">Post-workout walk</div><div class="t">${s.walk.mi} mi · ~${s.walk.min} min</div></div></div></div></div>
    <button class="btn" data-act="start" style="margin-top:12px">Start workout</button>
    <div class="row" style="margin-top:8px"><button class="btn ghost" data-act="adjust">Adjust</button>${color === 'unknown' ? '<button class="btn ghost" data-act="pickDose" data-tpl="' + s.tpl + '" data-dose="yellow">Use yellow dose</button>' : ''}</div></div>`;
  return h;
}
function weighCard(){
  const w = (S.weights||[]).find(x => x.date === today()), rv = E.review(S, now());
  return `<div class="card"><div class="row">${ic('scale')}<div class="sp"><b>Weigh-in</b><div class="sub">7-day average: ${rv.avg7 != null ? rv.avg7 + ' lb' : 'no data yet'}</div></div>
    <input class="num" id="wIn" inputmode="decimal" placeholder="${w ? w.lb : 'lb'}" value="${w ? w.lb : ''}" aria-label="Today's weight in pounds" style="width:96px;min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--s2);text-align:center;font-weight:800;font-size:18px">
    <button class="ib" data-act="weigh" aria-label="Save weight">${ic('check')}</button></div></div>`;
}

/* ---------- TRAIN ---------- */
function logged(s){ return s.ex.reduce((a, e) => a + e.sets.filter(x => x.ar != null).length, 0); }
function renderTrain(){
  const s = active();
  if (!s){ const open = S.sessions.filter(x => x.status === 'planned').slice(-3);
    view.innerHTML = `<h1>Train<em>.</em></h1><div class="empty">${ic('train')}<p>No workout running.</p><button class="btn" data-act="tab" data-t="today">Go to today’s plan</button></div>` +
      (open.length ? '<h2>Not logged</h2>' + open.map(x => `<button class="opt" data-act="reportId" data-id="${x.id}"><div class="sp"><b>${esc(x.name)}</b><div class="sub">${x.date} · I did this but didn’t log it</div></div>${ic('check')}</button>`).join('') : '');
    return; }
  const mins = Math.round((now() - (s.startedAt || s.ts)) / 60000);
  let h = `<div class="row"><div class="sp"><div class="sub">${mins} min · ${logged(s)} sets logged</div><h1 style="font-size:28px">${esc(s.name)}</h1></div><span class="chip ${s.color}">${s.color === 'unknown' ? 'Unknown' : s.color}</span></div>`;
  if (!S.meta.tips) h += `<div class="card"><div class="row"><b class="sp">How this works</b><button class="ib" data-act="tipsOff" aria-label="Dismiss tips">${ic('x')}</button></div>
    <div class="tip">${ic('check')}<div><b>Tap the check</b> to log a set at the target. Type a number first only if you did something different.</div></div>
    <div class="tip">${ic('gauge')}<div><b>Rate effort once</b>, after the last set. 8 means 2 reps were left in the tank.</div></div>
    <div class="tip">${ic('info')}<div><b>"Last:"</b> is your previous time. The coach moves the load from it.</div></div></div>`;
  let i = 0;
  while (i < s.ex.length){ const e = s.ex[i];
    if (e.ss && s.ex[i+1] && s.ex[i+1].ss === e.ss){ h += `<div class="ssgrp"><div class="ssl">Superset ${e.ss} · rest after the pair</div>${xcard(s, i)}${xcard(s, i+1)}</div>`; i += 2; }
    else { h += xcard(s, i); i++; } }
  if (s.finisher) h += `<div class="fin"><div class="feat">Finisher · counts toward volume</div><h3 style="margin:6px 0">${esc(s.finisher.name)}</h3><div class="sub">${s.finisher.rounds} rounds: ${s.finisher.items.map(esc).join(' → ')} · ${s.finisher.rest}s rest</div>
    <button class="btn ${s.finisher.done ? '' : 'ghost'}" data-act="fin" style="margin-top:12px">${s.finisher.done ? ic('check') + ' Finisher done' : 'Mark finisher done'}</button></div>`;
  h += `<div class="card"><div class="row">${ic('walk')}<b class="sp">Post-workout walk</b></div><div class="set" style="grid-template-columns:1fr 1fr;padding:10px 0 0">
    <div><input data-walk="ami" inputmode="decimal" placeholder="${s.walk.mi}" value="${s.walk.ami ?? ''}" aria-label="Miles walked"><div class="u">miles</div></div>
    <div><input data-walk="amin" inputmode="numeric" placeholder="${s.walk.min}" value="${s.walk.amin ?? ''}" aria-label="Minutes walked"><div class="u">minutes</div></div></div></div>
    <button class="btn" data-act="complete">Complete session</button>
    <button class="btn ghost" data-act="report" style="margin-top:8px;min-height:48px">I did it all but didn’t log everything</button>
    <button class="btn ghost" data-act="discard" style="margin-top:8px;min-height:44px;background:transparent;color:var(--tx3)">End without saving</button>`;
  view.innerHTML = h;
}
function xcard(s, i){
  const e = s.ex[i], x = E.LIB[e.exId], allDone = e.sets.every(z => z.ar != null);
  if (allDone && e.effort != null && !ui.open[i]) return `<div class="xc done" id="x${i}"><div class="collapsed" data-act="expand" data-e="${i}"><span class="ok">${ic('check')}</span><div class="sp"><b>${esc(x.name)}</b><div class="sub num">${e.sets.map(z => z.ar).join('/')} @ ${lbl(e.sets[0].al)} · E${e.effort}</div></div>${ic('chev')}</div></div>`;
  const plates = E.plateBreakdown(e.sets[0].tl, e.impl, S.equipment);
  let h = `<div class="xc" id="x${i}"><div class="hd"><div class="sp">${e.feature ? '<div class="feat">Featured</div>' : ''}<div class="nm">${esc(x.name)}</div></div></div>
   <div class="tg num">${e.sets.length} × ${e.sets[0].tr} @ ${lbl(e.sets[0].tl)} · target E${e.tgtE[0]}–${e.tgtE[1]}${plates && plates.length ? ` · <span title="${INFO.plates}">${plates.join(' + ')}/side</span>` : ''}</div>
   <div class="bs">${esc(e.basis || 'First time: starting load')} ${info('basis')}</div>`;
  if (ui.open['c' + i]) h += `<div class="cue">${esc(x.cue)} <a href="${x.video}" target="_blank" rel="noopener">Watch a demo</a></div>`;
  if (e.pinch) h += `<div class="pinch">${ic('shield')} Stop if you feel a pinch.</div>`;
  h += `<div class="sets"><div class="colhd"><span>Set</span><span>Reps</span><span>${e.impl === 'bodyweight' ? '+lb' : 'lb'}</span><span></span></div>`;
  e.warm.forEach((z, k) => h += setRow(i, k, z, 'W', true));
  e.sets.forEach((z, k) => h += setRow(i, k, z, k + 1, false));
  h += '</div>';
  if (allDone) h += `<div class="eff" id="eff${i}"><div class="lab"><span>How hard was the top set? ${info('effort')}</span><span class="sub">optional</span></div><div class="seg">${[10,9,8,7,6,5].map(v => `<button data-act="eff" data-e="${i}" data-v="${v}" aria-pressed="${e.effort === v}" aria-label="Effort ${v}">${v}<small>${{10:'max',9:'1 left',8:'2 left',7:'3 left',6:'easy',5:'easy'}[v]}</small></button>`).join('')}</div></div>`;
  h += `<div class="ovf"><button data-act="addSet" data-e="${i}" aria-label="Add a set">${ic('plus')}Set</button><button data-act="swap" data-e="${i}" aria-label="Swap exercise">${ic('swap')}Swap</button>
    <button data-act="cue" data-e="${i}" aria-label="How to">${ic('video')}How-to</button><button data-act="hurt" data-e="${i}" aria-label="This hurt">${ic('bolt')}${e.pain ? 'Noted' : 'Hurt'}</button></div></div>`;
  return h;
}
function setRow(i, k, z, label, warm){
  const lg = z.ar != null;
  return `<div class="set${lg ? ' logged' : ''}${warm ? ' warm' : ''}"><div class="k">${label}</div>
    <input inputmode="numeric" placeholder="${z.tr}" value="${lg ? z.ar : ''}" data-f="r" aria-label="Reps, target ${z.tr}">
    <input inputmode="decimal" placeholder="${z.tl === 0 ? 'BW' : z.tl}" value="${lg ? (z.al === 0 ? '' : z.al) : ''}" data-f="l" aria-label="Load, target ${lbl(z.tl)}">
    <button class="ck" data-act="log" data-e="${i}" data-s="${k}" data-w="${warm ? 1 : 0}" aria-label="${lg ? 'Undo set' : 'Log set'}">${ic('check')}</button></div>`;
}
function rerenderCard(i){ const s = active(), el = $('#x' + i); if (!s || !el) return render(); const t = document.createElement('div'); t.innerHTML = xcard(s, i); el.replaceWith(t.firstChild); }
function logSet(btn){
  const s = active(), i = +btn.dataset.e, k = +btn.dataset.s, warm = btn.dataset.w === '1', e = s.ex[i], arr = warm ? e.warm : e.sets, z = arr[k], row = btn.closest('.set');
  if (z.ar != null){ z.ar = null; z.al = null; save(); return rerenderCard(i); }
  const r = row.querySelector('[data-f=r]').value, l = row.querySelector('[data-f=l]').value;
  z.ar = r === '' ? z.tr : Math.max(0, +r); z.al = l === '' ? z.tl : Math.max(0, +l);
  if (!warm && z.al !== z.tl) arr.slice(k + 1).forEach(n => { if (n.ar == null) n.tl = z.al; }); // edited load propagates forward
  save(); rerenderCard(i);
  if (warm) return startRest(45, 'Next: ' + (k + 1 < e.warm.length ? 'ramp ' + (k + 2) : 'set 1'));
  const partner = e.ss ? s.ex.find((o, j) => j !== i && o.ss === e.ss) : null;
  if (partner && partner.sets[k] && partner.sets[k].ar == null) { toast('Now: ' + E.LIB[partner.exId].name); return; }
  const lastSet = e.sets.every(n => n.ar != null);
  startRest(e.rest, lastSet ? 'Next exercise' : 'Next: set ' + (k + 2));
  if (lastSet) setTimeout(() => { const ef = $('#eff' + i); if (ef) ef.scrollIntoView({behavior:'smooth', block:'center'}); }, 50);
}

/* ---------- rest timer (isolated: only its own text updates) ---------- */
const T = JSON.parse(localStorage.getItem(TKEY) || '{"end":0}'); let tIv = null, ac;
function startRest(sec, label){ T.end = now() + sec * 1000; T.label = label; T.fired = false; localStorage.setItem(TKEY, JSON.stringify(T)); if (!tIv) tIv = setInterval(tick, 250); tick(); }
function stopRest(){ T.end = 0; localStorage.setItem(TKEY, JSON.stringify(T)); clearInterval(tIv); tIv = null; $('#timer').className = ''; }
function beep(){ try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); [0, .18].forEach(d => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.25, ac.currentTime + d); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + d + .15); o.connect(g).connect(ac.destination); o.start(ac.currentTime + d); o.stop(ac.currentTime + d + .16); }); } catch(e){} if (navigator.vibrate) navigator.vibrate([120, 60, 120]); }
function tick(){
  const el = $('#timer'); if (!T.end){ el.className = ''; return; }
  const left = Math.ceil((T.end - now()) / 1000);
  if (left <= -15) return stopRest();
  el.className = 'on' + (left <= 0 ? ' zero' : '');
  $('#tt').textContent = left > 0 ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'Go';
  $('#tl').textContent = left > 0 ? (T.label || 'Rest') + (S.profile.cardio === 'walk' ? ' · walk it off' : '') : (T.label || 'Next set');
  if (left <= 0 && !T.fired){ T.fired = true; beep(); }
}
if (T.end > now()) tIv = setInterval(tick, 250);
document.addEventListener('visibilitychange', tick);

/* ---------- PROGRESS ---------- */
function renderProgress(){
  const rv = E.review(S, now());
  let h = `<h1>Progress<em>.</em></h1><div class="sub">Week ${rv.blockWeek} of 4${rv.mandatoryReview ? ' · review week' : ''}</div>
   <div class="row" style="margin-top:14px;gap:8px"><div class="stat"><div class="sub">Sessions</div><div class="big num">${rv.completed}<span class="sub">/${rv.planned}</span></div></div>
   <div class="stat"><div class="sub">7-day avg</div><div class="big num">${rv.avg7 ?? '—'}</div><div class="sub num">${rv.delta != null ? (rv.delta > 0 ? '+' : '') + rv.delta + ' lb vs last week' : 'need 2 weeks'}</div></div></div>
   <div class="row" style="margin-top:8px;gap:8px">${['green','yellow','red'].map(c => `<div class="stat"><div class="row"><span class="dot ${c}"></span><span class="big num">${rv.counts[c]}</span></div><div class="sub">${c} days</div></div>`).join('')}</div>
   <h2>Deload signals</h2><div class="card">${rv.deload.domains.map(d => `<div class="dom"><span class="dot ${d.abnormal ? 'red' : 'green'}" style="margin-top:4px"></span><div>${esc(d.line)}</div></div>`).join('')}
   <div class="sub" style="margin-top:8px">Any two of these three turn on a 5–7 day deload.</div></div>`;
  if (rv.notes.length) h += rv.notes.map(n => `<div class="tip">${ic('info')}<div>${esc(n)}</div></div>`).join('');
  if (rv.earnBackWeek) h += `<div class="tip">${ic('check')}<div>Earn-back: this week qualifies. Two weeks in a row adds 1–2 sets to one priority muscle.</div></div>`;
  h += `<h2>Weight</h2><div class="card">${weightChart()}</div>`;
  h += `<h2>Volume this week ${info('frac')}</h2><div class="card">${E.MUSCLES.map(m => { const v = rv.volume[m], [lo, hi] = rv.ranges[m], mx = 20;
     return `<div class="vrow"><span>${E.MUSCLE_LABEL[m]}</span><div class="bar"><b style="left:${lo/mx*100}%;width:${(hi-lo)/mx*100}%"></b><i style="width:${Math.min(100, v/mx*100)}%"></i></div><span class="num" style="text-align:right">${v}</span></div>`; }).join('')}</div>`;
  h += `<h2>Logbook</h2>` + logbook();
  const hist = S.sessions.slice(-8).reverse();
  h += `<h2>History</h2><div class="card">${hist.map(x => `<div class="li" ${x.status === 'planned' || x.status === 'active' ? `data-act="reportId" data-id="${x.id}"` : ''}><span class="dot ${x.color || 'unknown'}"></span><div class="sp"><div class="n">${esc(x.name)}</div><div class="sub">${x.date} · ${{done:'logged', reported:'done as reported', skipped:'skipped', active:'in progress, tap to mark done', planned:'tap to mark done'}[x.status]}</div></div></div>`).join('') || '<div class="sub">Nothing yet.</div>'}</div>`;
  view.innerHTML = h;
}
function weightChart(){
  const ws = (S.weights||[]).filter(w => w.ts > now() - 60 * E.D); if (ws.length < 2) return '<div class="sub">Weigh in daily. The 7-day average needs a few days of data.</div>';
  const W = 560, Hh = 150, t0 = now() - 60 * E.D, xs = t => (t - t0) / (60 * E.D) * W;
  const avg = ws.map(w => { const win = ws.filter(o => o.ts <= w.ts && o.ts > w.ts - 7 * E.D); return {ts:w.ts, v: win.reduce((a, b) => a + b.lb, 0) / win.length}; });
  const vals = ws.map(w => w.lb), lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1, ys = v => Hh - (v - lo) / (hi - lo) * Hh;
  let d = '', prev = null; avg.forEach(p => { d += (prev && p.ts - prev.ts > 3 * E.D ? 'M' : (d ? 'L' : 'M')) + xs(p.ts).toFixed(1) + ',' + ys(p.v).toFixed(1); prev = p; });
  return `<svg viewBox="-4 -8 ${W + 8} ${Hh + 28}" width="100%" role="img" aria-label="Weight, 7-day average, last 60 days">
    ${ws.map(w => `<circle cx="${xs(w.ts).toFixed(1)}" cy="${ys(w.lb).toFixed(1)}" r="3" fill="#8a817e"/>`).join('')}
    <path d="${d}" fill="none" stroke="#ff3d2e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="0" y="${Hh + 20}" fill="#8a817e" font-size="13">${hi.toFixed(0)}–${lo.toFixed(0)} lb · dots = weigh-ins · line = 7-day avg · gaps shown as gaps</text></svg>`;
}
function logbook(){
  const mains = [...new Set(S.sessions.flatMap(s => s.ex.filter(e => e.main).map(e => e.exId)))];
  if (!mains.length) return '<div class="card sub">Your main lifts show up here after the first session.</div>';
  return mains.map(id => { const ex = E.exposures(S, id, now() + 1, 6), x = E.LIB[id]; let best = 0;
    const rows = ex.slice().reverse().map(({s, e}) => { const w = e.sets.filter(z => z.ar != null || s.status === 'reported'), top = Math.max(...w.map(z => E.e1rm(z.ar ?? z.tr, z.al ?? z.tl))); const pr = top > best && best > 0; best = Math.max(best, top);
      return `<div class="li" style="cursor:default"><div class="sp"><div class="num">${w.map(z => z.ar ?? z.tr).join('/')} @ ${lbl(w[0] && (w[0].al ?? w[0].tl))}${e.effort ? ' · E' + e.effort : ''}</div><div class="sub">${s.date}${x.impl !== 'bodyweight' ? ' · e1RM ' + Math.round(top) : ''}</div></div>${pr ? `<span class="chip brand">${ic('star')} PR</span>` : ''}</div>`; }).reverse();
    return `<div class="card"><b>${esc(x.name)}</b>${rows.join('')}</div>`; }).join('');
}

/* ---------- LIBRARY ---------- */
function renderLibrary(){
  view.innerHTML = `<h1>Library<em>.</em></h1><input class="search" id="q" placeholder="Search exercises or muscles" value="${esc(ui.q)}" aria-label="Search"><div id="libList"></div>`;
  libList();
}
function libList(){
  const q = ui.q.toLowerCase(), list = Object.values(E.LIB).filter(x => !q || (x.name + ' ' + x.prim + ' ' + E.MUSCLE_LABEL[x.prim]).toLowerCase().includes(q)).sort((a, b) => a.prim.localeCompare(b.prim) || a.name.localeCompare(b.name));
  let last = '', h = '';
  list.forEach(x => { if (x.prim !== last){ h += `<h2>${E.MUSCLE_LABEL[x.prim]}</h2>`; last = x.prim; } const st = S.exState[x.id] || {}, ok = E.exAllowed(S, x.id);
    h += `<div class="li" data-act="ex" data-id="${x.id}"><div class="sp"><div class="n">${esc(x.name)}</div><div class="sub">${x.impl} · ${x.kind === 'c' ? 'compound' : x.kind === 'w' ? 'warm-up only' : 'isolation'}${!ok && !st.ban ? ' · hidden by equipment or limitation' : ''}</div></div>
     ${st.fav ? ic('star') : ''}${st.like ? ic('heart') : ''}${st.ban ? ic('ban') : ''}${ic('chev')}</div>`; });
  $('#libList').innerHTML = h || '<div class="empty">No match.</div>';
}
function exSheet(id){
  const x = E.LIB[id], st = S.exState[id] || {};
  sheet(`<h3>${esc(x.name)}</h3><p class="sub">${E.MUSCLE_LABEL[x.prim]} (1 set)${x.syn.length ? ' · ' + x.syn.map(m => E.MUSCLE_LABEL[m]).join(', ') + ' (½ set)' : ''} · ${x.rr[0]}–${x.rr[1]} reps</p>
   <p>${esc(x.cue)}</p><a class="btn ghost" href="${x.video}" target="_blank" rel="noopener" style="text-decoration:none">${ic('video')} Watch a demo</a>
   <div class="chips" style="margin-top:16px">${[['like','Like','heart'],['fav','Favorite','star'],['ban','Never program','ban']].map(([k, l, i]) => `<button data-act="exState" data-id="${id}" data-k="${k}" aria-pressed="${!!st[k]}">${ic(i)} ${l}</button>`).join('')}</div>
   <p class="disc" style="margin-top:16px">Favorites get featured in their session. Never program means it's never scheduled.</p>`);
}

/* ---------- SETTINGS ---------- */
const segs = p => p.split('.').map(k => k.replace(',', '.'));
function getPath(o, p){ return segs(p).reduce((a, k) => a == null ? a : a[k], o); }
function setPath(o, p, v){ const ks = segs(p); let c = o; ks.slice(0, -1).forEach(k => { if (c[k] == null || typeof c[k] !== 'object') c[k] = {}; c = c[k]; }); c[ks[ks.length - 1]] = v; }
function fld(path, label, hint, type){ const src = path.startsWith('settings.') ? {settings: settings()} : S, v = getPath(src, path);
  if (type === 'bool') return `<div class="f"><label for="f-${path}">${label}${hint ? `<small>${hint}</small>` : ''}</label><span class="sw"><input id="f-${path}" type="checkbox" data-bind="${path}" data-type="bool" ${v ? 'checked' : ''}><i></i></span></div>`;
  if (Array.isArray(type)) return `<div class="f"><label for="f-${path}">${label}${hint ? `<small>${hint}</small>` : ''}</label><select id="f-${path}" data-bind="${path}">${type.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
  return `<div class="f"><label for="f-${path}">${label}${hint ? `<small>${hint}</small>` : ''}</label><input id="f-${path}" data-bind="${path}" data-type="${type || 'num'}" inputmode="${type === 'text' ? 'text' : 'decimal'}" value="${esc(v ?? '')}"></div>`; }
function renderSettings(){
  const p = S.profile, eq = S.equipment;
  let h = `<h1>Settings<em>.</em></h1><div class="sub">Every number the coach uses lives here.</div>
  <h2>Profile</h2><div class="card">${fld('profile.name','Name','', 'text')}${fld('profile.exp','Experience','Sets starting volume',['beginner','intermediate','advanced'])}</div>
  <h2>Goals & phase</h2><div class="card">${fld('profile.phase','Phase','Cut ranges are tested. Maintain and gain are starting defaults.',['cut','maintain','gain'])}${fld('profile.weight','Current weight','lb')}${fld('profile.target','Target weight','lb')}
   ${fld('profile.days','Training days / week')}${fld('profile.sessionMin','Lifting time target','minutes')}${fld('profile.cutWeek','Week of this cut','More finishers allowed after week 3')}${fld('profile.trainWeekday','Weekday training time','', 'text')}${fld('profile.trainWeekend','Weekend training time','', 'text')}${fld('profile.hunger','Track hunger','Adds one slider to check-in','bool')}
   <div style="padding:12px 0"><b>Priority muscles</b><div class="sub" style="margin-bottom:8px">Kept at the top of their ranges</div><div class="chips">${E.MUSCLES.map(m => `<button data-act="prio" data-m="${m}" aria-pressed="${p.priority.includes(m)}">${E.MUSCLE_LABEL[m]}</button>`).join('')}</div></div></div>
  <h2>Equipment</h2><div class="card"><div class="chips" style="margin-bottom:10px">${['barbell','rack','bench','dumbbell','cable','pullup','landmine','curlbar','treadmill'].map(k => `<button data-act="eq" data-k="${k}" aria-pressed="${!!eq.has[k]}">${{pullup:'pull-up bar', curlbar:'curl bar'}[k] || k}</button>`).join('')}</div>
   ${fld('equipment.bar','Barbell weight','lb')}${fld('equipment.curlbar','Curl bar weight','lb')}
   ${['45','35','25','10','5','2.5'].map(d => fld('equipment.plates.' + d.replace('.', ','), d + ' lb plates', 'total count')).join('')}
   ${fld('equipment.db.min','Dumbbell min','lb')}${fld('equipment.db.max','Dumbbell max','lb')}${fld('equipment.db.step','Dumbbell step','lb')}${fld('equipment.cable.inc','Cable increment','lb per pin step')}${fld('equipment.cable.max','Cable stack max','lb')}
   <p class="disc">Every load the app programs is built from these plates and steps.</p></div>
  <h2>Program & rules</h2><div class="card">
   ${fld('settings.green.energyMin','Green: energy at least','')}${fld('settings.green.sleepMin','Green: sleep at least','')}${fld('settings.green.fatigueMax','Green: fatigue at most','')}${fld('settings.green.soreMax','Green: target soreness at most','')}
   ${fld('settings.red.energyMax','Red: energy at or below','')}${fld('settings.red.fatigueMin','Red: fatigue at or above','')}${fld('settings.red.soreMin','Red: soreness everywhere at or above','')}
   ${fld('settings.spacingGreenH','Recovery spacing','hours, green days')}${fld('settings.spacingYellowH','Recovery spacing','hours, yellow days')}
   ${fld('settings.yellow.loadPct','Yellow load change','%')}${fld('settings.yellow.volPct','Yellow volume','% of plan')}${fld('settings.sessionCapFrac','Per-session cap','fractional sets per muscle')}
   ${fld('settings.finishers.earlyPerWeek','Finishers / week, early cut','')}${fld('settings.finishers.laterPerWeek','Finishers / week, later','')}
   ${fld('settings.effort.addComp','Add load, compounds','%')}${fld('settings.effort.addIso','Add load, isolation','%')}${fld('settings.effort.hardComp','Drop when 2+ too hard, compounds','%')}
   ${fld('settings.rest.main','Rest, main lift','seconds')}${fld('settings.rest.comp','Rest, compounds','seconds')}${fld('settings.rest.iso','Rest, isolation','seconds')}${fld('settings.rest.pair','Rest after superset pair','seconds')}
   ${fld('settings.supersets','Supersets','Pair accessories','bool')}${fld('settings.earnBack','Earn-back','Volume can rise after 2 good weeks','bool')}
   <button class="btn ghost" data-act="resetRules" style="margin-top:10px">Reset rules to defaults</button></div>
  <h2>Preferences</h2><div class="card">${fld('profile.cardio','Cardio','Between sets and after',['walk','bike','rower','none'])}${fld('profile.walkMi','Post-workout walk','miles')}${fld('profile.walkMin','Post-workout walk','minutes')}
   <div style="padding:12px 0"><b>Never programmed</b><div class="chips" style="margin-top:8px">${Object.keys(S.exState).filter(k => S.exState[k].ban).map(k => `<button data-act="unban" data-id="${k}" aria-label="Allow ${esc(E.LIB[k].name)}">${ic('x')} ${esc(E.LIB[k].name)}</button>`).join('') || '<span class="sub">None</span>'}</div></div></div>
  <h2>Limitations & safety</h2><div class="card">${(S.limitations||[]).map(l => `<div class="li" style="cursor:default"><div class="sp"><div class="n">${esc(l.area)}</div><div class="sub">${esc(l.desc)}</div><div class="sub">Avoids: ${l.tags.map(t => PATTERNS[t] || t).join(', ')}</div></div><button class="ib" data-act="rmLim" data-id="${l.id}" aria-label="Remove">${ic('x')}</button></div>`).join('')}
   <button class="btn ghost" data-act="addLim">${ic('plus')} Add a limitation</button>
   <p class="disc">This app doesn't diagnose anything. It only skips the movements you choose. If pain persists, worsens, or limits loading, get it evaluated by a professional.</p>
   <button class="btn ghost" data-act="clock" style="min-height:48px">${ic('moon')} I just changed time zone or clocks</button></div>
  <h2>Notifications</h2><div class="card sub">Morning check-in, weigh-in, and review reminders come with the native iOS app. Web reminders on iPhone aren't reliable enough to trust.</div>
  <h2>Data</h2><div class="card"><p class="sub" style="margin-top:0">Stored on this device${S.meta.persisted ? ', protected from automatic cleanup' : ''}. Export often: it is your backup.</p>
   <button class="btn" data-act="exportJ">${ic('down')} Export everything (JSON)</button>
   <button class="btn ghost" data-act="exportC" style="margin-top:8px">${ic('down')} Export sets (CSV)</button>
   <label class="btn ghost" style="margin-top:8px">Import from export<input type="file" accept=".json,application/json" id="imp" hidden></label>
   <button class="btn ghost" data-act="demo" style="margin-top:8px">Load demo profile</button>
   <button class="btn ghost" data-act="wipe" style="margin-top:8px;color:var(--st)">Delete all data</button></div>
  <h2>About the protocol</h2><div class="card"><p style="margin-top:0"><b>Protocol v${E.PROTOCOL}.</b> Each morning, a 30-second check-in sets the day: green trains the most-due recovered session in full, yellow trims it, red rests. Missed work is never made up. You rate effort once per exercise, and that rating moves the next load, always to a weight your plates can make. Deloads come from your data (performance, readiness, effort drift), not the calendar.</p>
   <p class="disc">Iron & Fuel gives general fitness programming. It isn't medical advice and doesn't diagnose or treat anything. Talk to a qualified professional about pain, injury, or medical conditions before training.</p></div>`;
  view.innerHTML = h;
}
const PATTERNS = {'bent-over-extend':'Bent over, arm reaching forward', 'wide-curl':'Wide-grip curls', 'shoulder':'Loaded pressing (all)'};

/* ---------- ONBOARDING ---------- */
const OB_EX = ['bench','squat','pullup','preacher','hkr','ccurl','pushdown','rdl','lmhack','bridge','superman','bbrow'];
function renderOnboarding(){
  const st = ui.ob, p = S.profile, eq = S.equipment, prog = n => `<div class="prog">${range(1,5).map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  const nav = (back) => `<div class="row" style="margin-top:20px">${back ? '<button class="btn ghost" data-act="obBack" style="width:auto">Back</button>' : ''}<button class="btn" data-act="obNext">Continue</button></div>`;
  let h = '';
  if (st === 0) h = `<div class="ob"><h1 style="font-size:52px">Iron<br><em>&</em> Fuel</h1><p class="sub" style="font-size:18px">A coach that knows your gym, your history, and how you slept.</p>
    <div class="pt">${ic('gauge')}<div><b>Days set by readiness</b><div class="sub">A 30-second check-in decides: full session, trimmed, or rest.</div></div></div>
    <div class="pt">${ic('train')}<div><b>Loads steered by effort</b><div class="sub">Rate each exercise once. The next load moves, and it's always one your plates can make.</div></div></div>
    <div class="pt">${ic('prog')}<div><b>Deloads from your data</b><div class="sub">Not the calendar. When two of three warning signs show up, you back off.</div></div></div>
    <button class="btn" data-act="obNext" style="margin-top:20px">Set up my gym</button><button class="btn ghost" data-act="demo" style="margin-top:8px">Explore with a demo lifter</button>
    <p class="disc" style="margin-top:16px">Your data stays on this device. No account needed.</p></div>`;
  if (st === 1) h = `${prog(1)}<h1>You<em>.</em></h1><div class="card">${fld('profile.name','First name','', 'text')}${fld('profile.exp','Lifting experience','',['beginner','intermediate','advanced'])}${fld('profile.weight','Current weight','lb')}</div>${nav(1)}`;
  if (st === 2) h = `${prog(2)}<h1>Goal<em>.</em></h1><div class="card">${fld('profile.phase','Phase','',['cut','maintain','gain'])}${fld('profile.target','Target weight','lb')}${fld('profile.days','Training days / week','4–5 is the sweet spot')}${fld('profile.sessionMin','Lifting minutes per session','')}</div>
    <div class="card"><b>Priority muscles</b><div class="chips" style="margin-top:10px">${E.MUSCLES.map(m => `<button data-act="prio" data-m="${m}" aria-pressed="${p.priority.includes(m)}">${E.MUSCLE_LABEL[m]}</button>`).join('')}</div></div>${nav(1)}`;
  if (st === 3) h = `${prog(3)}<h1>Your gym<em>.</em></h1><p class="sub">Starts as a typical home gym. Tap to match yours.</p><div class="card"><div class="chips">${['barbell','rack','bench','dumbbell','cable','pullup','landmine','curlbar','treadmill'].map(k => `<button data-act="eq" data-k="${k}" aria-pressed="${!!eq.has[k]}">${{pullup:'pull-up bar', curlbar:'curl bar'}[k] || k}</button>`).join('')}</div></div>
    <div class="card">${['45','25','10','5','2.5'].map(d => fld('equipment.plates.' + d.replace('.', ','), d + ' lb plates', 'total count')).join('')}${fld('equipment.db.min','Dumbbells from','lb')}${fld('equipment.db.max','Dumbbells to','lb')}${fld('equipment.cable.inc','Cable steps','lb')}</div>${nav(1)}`;
  if (st === 4) h = `${prog(4)}<h1>Anything to avoid<em>?</em></h1><p class="sub">Optional. Pick movements that bother you and the coach works around them.</p><div class="card"><div class="chips">${Object.keys(PATTERNS).map(t => `<button data-act="obLim" data-t="${t}" aria-pressed="${(S.limitations||[]).some(l => l.tags.includes(t))}">${PATTERNS[t]}</button>`).join('')}</div>
    <p class="disc" style="margin-top:14px">This isn't a diagnosis. If pain persists, worsens, or limits loading, get it evaluated by a professional.</p></div>${nav(1)}`;
  if (st === 5) h = `${prog(5)}<h1>Likes & nevers<em>.</em></h1><p class="sub">Tap to cycle: neutral → like → never.</p><div class="card">${OB_EX.map(id => { const s0 = S.exState[id] || {}, v = s0.ban ? 'Never' : s0.like ? 'Like' : '—';
    return `<div class="li" data-act="obEx" data-id="${id}"><div class="sp n">${esc(E.LIB[id].name)}</div><span class="chip ${s0.ban ? 'red' : s0.like ? 'green' : ''}">${v}</span></div>`; }).join('')}</div>
    <div class="row" style="margin-top:20px"><button class="btn ghost" data-act="obBack" style="width:auto">Back</button><button class="btn" data-act="obDone">Build my first day</button></div>`;
  view.innerHTML = h;
}

/* ---------- actions ---------- */
function cap(s){ return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function range(a, b){ return Array.from({length: b - a + 1}, (_, i) => a + i); }
function download(name, text, type){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function startSession(){
  const p = currentPlan(); if (!p.session) return;
  const s = JSON.parse(JSON.stringify(p.session)); s.status = 'active'; s.startedAt = now(); s.ts = now();
  S.sessions = S.sessions.filter(x => !(x.status === 'planned' && x.date === today())); S.sessions.push(s);
  if (!todayCk()) S.today.skipCk = true; save(); ui.open = {}; setTab('train');
}
function submitCheckin(){
  const c = Object.assign({}, ui.ck, {date: today(), ts: now()}); const p = E.plan(S, c, now()); c.color = p.color;
  S.checkins = (S.checkins||[]).filter(x => x.date !== c.date).concat(c);
  const dl = E.deloadCheck(S, now()); if (dl.trigger && !(S.deload && now() < Date.parse(S.deload.until))){ S.deload = {start: new Date(now() - 1000).toISOString(), until: new Date(now() + 6 * E.D).toISOString(), lines: dl.domains.filter(d => d.abnormal).map(d => d.line)}; toast('Deload week started. Here’s why.'); }
  ui.ck = null; save(); render();
}
function completeSession(reported){
  const s = active(); if (!s) return; s.endedAt = now();
  reported ? E.markReported(s) : E.complete(s); save(); stopRest();
  const f = E.sessionFrac(s), prs = s.ex.filter(e => { const x = E.LIB[e.exId]; if (x.impl === 'bodyweight') return false; const prev = E.exposures(S, e.exId, s.ts, 8);
    const best = Math.max(0, ...prev.map(({e: pe, s: ps}) => Math.max(...pe.sets.filter(z => z.ar != null || ps.status === 'reported').map(z => E.e1rm(z.ar ?? z.tr, z.al ?? z.tl)))));
    const top = Math.max(0, ...e.sets.filter(z => z.ar != null).map(z => E.e1rm(z.ar, z.al))); return best > 0 && top > best; });
  const mins = Math.round((s.endedAt - (s.startedAt || s.ts)) / 60000);
  sheet(`<span class="chip green">${ic('check')} ${reported ? 'Done as reported' : 'Session logged'}</span><h3 style="margin:12px 0 4px">${esc(s.name)}</h3><p class="sub">${mins} min · ${logged(s)} sets logged${reported ? ' · unlogged sets count at target' : ''}</p>
   ${prs.length ? `<div class="tip">${ic('star')}<div><b>New best:</b> ${prs.map(e => esc(E.LIB[e.exId].name)).join(', ')}</div></div>` : ''}
   <h2>Volume, fractional sets</h2>${E.MUSCLES.filter(m => f[m]).map(m => `<div class="vrow"><span>${E.MUSCLE_LABEL[m]}</span><div class="bar"><i style="width:${Math.min(100, f[m] / 10 * 100)}%"></i></div><span class="num">${f[m]}</span></div>`).join('')}
   <button class="btn" data-act="closeDone" style="margin-top:16px">Done</button>`);
}
function addLimSheet(){
  ui.lim = {tags: []};
  sheet(`<h3>Add a limitation</h3><p class="sub">In your own words. The coach only uses the movements you tick.</p>
   <input class="search" id="limArea" placeholder="Body area, e.g. Left shoulder" style="margin:10px 0"><textarea id="limDesc" placeholder="What provokes it?"></textarea>
   <div class="chips" style="margin:12px 0">${Object.keys(PATTERNS).map(t => `<button data-act="limTag" data-t="${t}" aria-pressed="false">${PATTERNS[t]}</button>`).join('')}</div>
   <button class="btn" data-act="saveLim">Save</button><p class="disc">If pain persists, worsens, or limits loading, get it evaluated by a professional.</p>`);
}
function swapSheet(i){
  const s = active(), e = s.ex[i], x = E.LIB[e.exId], used = new Set(s.ex.map(z => z.exId));
  const alts = Object.values(E.LIB).filter(o => o.prim === x.prim && o.kind !== 'w' && !used.has(o.id) && E.exAllowed(S, o.id));
  sheet(`<h3>Swap ${esc(x.name)}</h3><p class="sub">Same muscle, safe for your setup.</p>${alts.map(o => `<button class="opt" data-act="doSwap" data-e="${i}" data-id="${o.id}"><div class="sp"><b>${esc(o.name)}</b><div class="sub">${o.impl}</div></div>${ic('swap')}</button>`).join('') || '<p class="sub">No alternatives available.</p>'}`);
}
function adjustSheet(){
  const ck = todayCk(), p = E.plan(S, ck, now());
  const opts = [p.session ? {tpl:p.session.tpl, name:p.session.name} : null].concat(p.options || []).filter(Boolean);
  sheet(`<h3>Adjust today</h3><p class="sub">No penalty for any of these. Missed volume isn't owed later.</p>
   ${opts.map(o => `<button class="opt" data-act="pickDose" data-tpl="${o.tpl}" data-dose="full"><div class="sp"><b>${esc(o.name)}</b><div class="sub">Full dose${o.sore != null ? ' · soreness ' + o.sore + '/10' : ''}</div></div>${ic('chev')}</button>
     <button class="opt" data-act="pickDose" data-tpl="${o.tpl}" data-dose="yellow"><div class="sp"><b>${esc(o.name)}, trimmed</b><div class="sub">−5% load, fewer sets, no finisher</div></div>${ic('chev')}</button>`).join('')}
   <button class="opt" data-act="rest"><div class="sp"><b>Rest day</b><div class="sub">Walk or mobility. Nothing is owed.</div></div>${ic('moon')}</button>
   ${ck ? '<button class="opt" data-act="redoCk"><div class="sp"><b>Redo check-in</b></div>' + ic('edit') + '</button>' : ''}`);
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act],[data-tab]'); if (!b) return;
  if (b.dataset.tab) return setTab(b.dataset.tab);
  const a = b.dataset.act, s = active(), i = +b.dataset.e;
  switch (a){
    case 'tab': closeSheet(); return setTab(b.dataset.t);
    case 'close': return closeSheet();
    case 'info': return sheet(`<p style="font-size:17px">${esc(INFO[b.dataset.k])}</p><button class="btn ghost" data-act="close">Got it</button>`);
    case 'ck': ui.ck[b.dataset.k] = +b.dataset.v; b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); return;
    case 'sore': ui.ck.sore[b.dataset.r] = +b.dataset.v; b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); return;
    case 'submitCk': return submitCheckin();
    case 'skipCk': S.today = {date: today(), skipCk: true}; save(); return render();
    case 'redoCk': closeSheet(); S.checkins = S.checkins.filter(c => c.date !== today()); S.today = {}; save(); return render();
    case 'start': return startSession();
    case 'adjust': return adjustSheet();
    case 'pickDose': closeSheet(); S.today = Object.assign({}, S.today.date === today() ? S.today : {}, {date: today(), tpl: b.dataset.tpl, dose: b.dataset.dose, rest: false}); save(); return render();
    case 'rest': closeSheet(); S.today = {date: today(), rest: true, skipCk: true}; save(); return render();
    case 'unrest': S.today = {}; save(); return render();
    case 'weigh': { const v = parseFloat($('#wIn').value); if (!(v > 50 && v < 700)) return toast('Enter your weight in lb.'); S.weights = (S.weights||[]).filter(w => w.date !== today()).concat({date: today(), ts: now(), lb: v}).sort((x, y) => x.ts - y.ts); save(); toast('Saved. 7-day average updated.'); return render(); }
    case 'log': return logSet(b);
    case 'eff': { const e = s.ex[i], v = +b.dataset.v; e.effort = e.effort === v ? null : v; save(); ui.open[i] = false; return rerenderCard(i); }
    case 'expand': ui.open[i] = true; return rerenderCard(i);
    case 'cue': ui.open['c' + i] = !ui.open['c' + i]; return rerenderCard(i);
    case 'addSet': { const e = s.ex[i], l = e.sets[e.sets.length - 1]; e.sets.push({tr: l.tr, tl: l.al ?? l.tl, ar: null, al: null}); save(); return rerenderCard(i); }
    case 'hurt': { const e = s.ex[i]; if (e.pain){ const k = S.painFlags.map(p => p.exId + p.ts).lastIndexOf(e.exId + e.painTs); if (k >= 0) S.painFlags.splice(k, 1); e.pain = false; save(); rerenderCard(i); return toast('Pain flag removed.'); }
      const out = E.flagPain(S, e.exId, now()); e.painTs = S.painFlags[S.painFlags.length - 1].ts; e.pain = true; save(); rerenderCard(i);
      return toast(out.patternBanned ? 'Third flag on this movement type. It’s paused. Review it in Settings.' : out.swapped ? 'Second flag. This lift gets swapped from now on.' : 'Noted. If it hurts again, it gets swapped.'); }
    case 'swap': if (s.ex[i].sets.some(z => z.ar != null)) return toast('Sets are already logged here. Undo them to swap.'); return swapSheet(i);
    case 'doSwap': { const e = s.ex[i], id = b.dataset.id, x = E.LIB[id], p = E.prescribe(S, id, now(), S.equipment);
      Object.assign(e, {exId: id, kind: x.kind, impl: x.impl, rr: x.rr, tgtE: x.kind === 'c' ? [7,8] : [8,9], basis: p.basis, why: p.why, warm: [], effort: null, pain: false, sets: e.sets.map(() => ({tr: p.reps, tl: p.load, ar: null, al: null}))});
      save(); closeSheet(); return rerenderCard(i); }
    case 'fin': s.finisher.done = !s.finisher.done; save(); return render();
    case 'complete': { const n = logged(s); if (!n) return sheet(`<h3>Nothing logged yet</h3><p class="sub">If you did the workout, mark it done as reported. Unlogged sets count at target.</p><button class="btn" data-act="reportGo">Mark done as reported</button><button class="btn ghost" data-act="close" style="margin-top:8px">Keep training</button>`); const left = s.ex.reduce((x, e) => x + e.sets.filter(z => z.ar == null).length, 0); if (left) return sheet(`<h3>${left} set${left > 1 ? 's' : ''} not logged</h3><p class="sub">Did you do them?</p><button class="btn" data-act="reportGo">I did them, count at target</button><button class="btn ghost" data-act="completeGo" style="margin-top:8px">I skipped them</button><button class="btn ghost" data-act="close" style="margin-top:8px">Keep training</button>`); return completeSession(false); }
    case 'completeGo': closeSheet(); return completeSession(false);
    case 'report': return sheet(`<h3>Mark done as reported?</h3><p class="sub">Your word beats the log. Sets you didn't log count as done at their targets, and the next plan builds from that.</p><button class="btn" data-act="reportGo">Yes, I did it</button><button class="btn ghost" data-act="close" style="margin-top:8px">Cancel</button>`);
    case 'reportGo': closeSheet(); return completeSession(true);
    case 'reportId': { const x = S.sessions.find(z => z.id === b.dataset.id); if (!x) return; E.markReported(x); save(); toast('Marked done as reported.'); return render(); }
    case 'discard': return sheet(`<h3>End without saving?</h3><p class="sub">This session is skipped and won't be made up later.</p><button class="btn" data-act="discardGo" style="background:var(--st)">End and skip</button><button class="btn ghost" data-act="close" style="margin-top:8px">Keep training</button>`);
    case 'discardGo': s.status = 'skipped'; save(); stopRest(); closeSheet(); return setTab('today');
    case 'closeDone': closeSheet(); return setTab('today');
    case 't30': T.end += 30000; localStorage.setItem(TKEY, JSON.stringify(T)); return tick();
    case 'tskip': return stopRest();
    case 'tipsOff': S.meta.tips = true; save(); return render();
    case 'ex': return exSheet(b.dataset.id);
    case 'exState': { const id = b.dataset.id, k = b.dataset.k, st = S.exState[id] = S.exState[id] || {}; st[k] = !st[k]; if (k === 'ban' && st.ban){ st.like = false; st.fav = false; } if ((k === 'like' || k === 'fav') && st[k]) st.ban = false; save(); exSheet(id); if (ui.tab === 'library') libList(); return; }
    case 'unban': S.exState[b.dataset.id].ban = false; save(); return render();
    case 'prio': { const m = b.dataset.m, pr = S.profile.priority; S.profile.priority = pr.includes(m) ? pr.filter(x => x !== m) : pr.concat(m); save(); return render(); }
    case 'eq': S.equipment.has[b.dataset.k] = !S.equipment.has[b.dataset.k]; save(); return render();
    case 'resetRules': S.settings = {}; save(); toast('Rules reset to Protocol v3 defaults.'); return render();
    case 'addLim': return addLimSheet();
    case 'limTag': { const t = b.dataset.t, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); ui.lim.tags = on ? ui.lim.tags.concat(t) : ui.lim.tags.filter(x => x !== t); return; }
    case 'saveLim': { const area = $('#limArea').value.trim() || 'Limitation'; S.limitations.push({id: 'l' + now(), area, desc: $('#limDesc').value.trim(), tags: ui.lim.tags}); save(); closeSheet(); return render(); }
    case 'rmLim': S.limitations = S.limitations.filter(l => l.id !== b.dataset.id); save(); return render();
    case 'clock': S.profile.clockShift = new Date().toISOString(); save(); return toast('Got it. For 14 days, low sleep or energy alone won’t cut your loads.');
    case 'exportJ': return download('iron-fuel-' + today() + '.json', E.exportJSON(S), 'application/json');
    case 'exportC': return download('iron-fuel-sets-' + today() + '.csv', E.exportCSV(S), 'text/csv');
    case 'demo': S = E.demoState(now()); S.meta.tzOff = new Date().getTimezoneOffset(); S.today = {}; save(); closeSheet(); ui.tab = 'today'; toast('Demo lifter loaded: 2 weeks of history.'); return render();
    case 'wipe': return sheet(`<h3>Delete all data?</h3><p class="sub">This removes every session, check-in, and weigh-in from this device. Export first if you want a backup.</p><button class="btn" data-act="wipeGo" style="background:var(--st)">Delete everything</button><button class="btn ghost" data-act="close" style="margin-top:8px">Cancel</button>`);
    case 'wipeGo': localStorage.removeItem(KEY); localStorage.removeItem(TKEY); S = E.newState(new Date().toISOString()); S.today = {}; ui.ob = 0; closeSheet(); return render();
    case 'obNext': ui.ob++; return render();
    case 'obBack': ui.ob = Math.max(0, ui.ob - 1); return render();
    case 'obLim': { const t = b.dataset.t, has = S.limitations.find(l => l.tags.includes(t)); if (has) S.limitations = S.limitations.filter(l => l !== has); else S.limitations.push({id: 'l' + t, area: PATTERNS[t], desc: 'Picked during setup', tags: [t]}); save(); return render(); }
    case 'obEx': { const id = b.dataset.id, st = S.exState[id] = S.exState[id] || {}; if (st.ban){ st.ban = false; } else if (st.like){ st.like = false; st.ban = true; } else st.like = true; save(); return render(); }
    case 'obDone': S.meta.onboarded = true; S.meta.created = new Date().toISOString(); save(); ui.tab = 'today'; return render();
  }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'q'){ ui.q = t.value; return libList(); }
  if (t.dataset.ck){ const v = +t.value; if (t.dataset.ck.startsWith('sore.')) ui.ck.sore[t.dataset.ck.slice(5)] = v; else ui.ck[t.dataset.ck] = v; const o = document.getElementById(t.dataset.out); if (o) o.textContent = v; }
  if (t.dataset.walk){ const s = active(); if (s){ s.walk[t.dataset.walk] = t.value === '' ? null : +t.value; save(); } }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.ckb) ui.ck[t.dataset.ckb] = t.checked;
  if (t.dataset.f){ const row = t.closest('.set'), btn = row && row.querySelector('.ck'), s = active(); if (s && btn && row.classList.contains('logged')){ const e = s.ex[+btn.dataset.e], z = (btn.dataset.w === '1' ? e.warm : e.sets)[+btn.dataset.s]; const v = t.value === '' ? null : +t.value;
    if (t.dataset.f === 'r') z.ar = v ?? z.tr; else z.al = v ?? z.tl; save(); toast('Set updated'); } }
  if (t.dataset.bind){ const path = t.dataset.bind, typ = t.dataset.type; let v = typ === 'bool' ? t.checked : (t.tagName === 'SELECT' || typ === 'text') ? t.value : (t.value === '' ? null : +t.value);
    if (typ === 'num' && v != null && !isFinite(v)) return toast('Enter a number.');
    if (path.startsWith('settings.')) setPath(S, path, v); else setPath(S, path, v); save(); if (S.meta.onboarded) toast('Saved'); }
  if (t.id === 'imp' && t.files[0]){ t.files[0].text().then(txt => { try { S = E.importJSON(txt); S.today = S.today || {}; save(); toast('Imported. History restored.'); render(); } catch(e){ toast('That file isn’t an Iron & Fuel export.'); } }); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
})();
