/* Iron & Fuel — Protocol v3 rules engine.
   Pure and deterministic: plan(state, checkin, now) depends only on its inputs.
   No network, no LLM, no clock reads (now is passed in). */
(function (root) {
'use strict';
const PROTOCOL = '3.0';
const H = 3600e3, D = 24 * H;

/* ---------- muscles & regions ---------- */
const MUSCLES = ['chest','back','quads','hams','delts','biceps','triceps','abs','calves','forearms'];
const MUSCLE_LABEL = {chest:'Chest',back:'Back',quads:'Quads',hams:'Hams/Glutes',delts:'Side+Rear Delts',biceps:'Biceps',triceps:'Triceps',abs:'Abs',calves:'Calves',forearms:'Forearms'};
const REGION = {chest:'push',delts:'push',triceps:'push',back:'pull',biceps:'pull',forearms:'pull',quads:'legs',hams:'legs',calves:'legs',abs:'core'};
const REGION_LABEL = {push:'Chest · shoulders · triceps',pull:'Back · biceps · forearms',legs:'Legs',core:'Core'};

/* ---------- defaults (every threshold is a per-user setting) ---------- */
const DEFAULT_SETTINGS = {
  green:{energyMin:7, sleepMin:3, fatigueMax:2, soreMax:3},
  red:{energyMax:3, fatigueMin:5, soreMin:7},
  spacingGreenH:48, spacingYellowH:72, hardFracSets:4, maxHardRow:2,
  yellow:{loadPct:-5, volPct:70},
  deloadDose:{volPct:50, loadPct:70, effortMax:6},
  sessionCapFrac:10, weeklyCeiling:90,
  finishers:{earlyPerWeek:1, laterPerWeek:2, earlyWeeks:3},
  effort:{steerMin:7, addComp:2.5, addIso:5, repeatDrop:2.5, hardComp:5, hardIso:7.5},
  ranges:{ // fractional sets / week, cut phase [P]
    cut:{chest:[6,10],back:[8,12],quads:[6,10],hams:[6,10],delts:[8,12],biceps:[10,14],triceps:[10,14],abs:[6,10],calves:[6,10],forearms:[4,8]},
    maintain:{chest:[8,12],back:[10,14],quads:[8,12],hams:[8,12],delts:[10,14],biceps:[12,16],triceps:[12,16],abs:[8,12],calves:[8,12],forearms:[6,10]},
    gain:{chest:[10,16],back:[10,16],quads:[10,16],hams:[10,16],delts:[12,18],biceps:[14,20],triceps:[14,20],abs:[10,14],calves:[10,14],forearms:[8,12]}
  },
  rest:{main:150, comp:90, iso:60, pair:75},
  supersets:true, earnBack:true,
  deloadSens:{perfPct:5, repsDrop:2, redDays:3, soreH:96, driftPts:1.5},
  clockDays:14
};

/* ---------- exercise library (data) ---------- */
// [id, name, primary, synergists, pattern, implement, kind c/i/w, repRange, startLoad, tags, cue]
const L = [
 ['bench','Barbell bench press','chest',['triceps','delts'],'hpress','barbell','c',[6,8],185,['shoulder'],'Shoulder blades pinned, bar to lower chest, press up and back.'],
 ['cgbench','Close-grip bench press','triceps',['chest'],'hpress','barbell','c',[6,10],155,['shoulder'],'Hands shoulder-width, elbows tucked, touch low chest.'],
 ['lmpress','Half-kneeling landmine press','chest',['delts','triceps'],'apress','landmine','c',[8,12],45,['shoulder'],'Neutral grip, ribs down, press up and out along the arc.'],
 ['cpress','Cable chest press','chest',['triceps','delts'],'hpress','cable','c',[10,12],60,['shoulder'],'Staggered stance, press to lockout, slow return.'],
 ['pushup','Deficit push-up','chest',['triceps','delts'],'hpress','bodyweight','c',[12,20],0,[],'Hands on plates, chest below hands, rigid plank.'],
 ['cfly','Cable fly','chest',[],'fly','cable','i',[12,15],20,['shoulder'],'Soft elbows, hug a tree, squeeze 1 s.'],
 ['lat','DB lateral raise','delts',[],'raise','dumbbell','i',[12,20],15,[],'Lead with elbows, stop at shoulder height.'],
 ['clat','Cable lateral raise','delts',[],'raise','cable','i',[12,15],10,[],'Handle behind hip, sweep out, 1 s pause up top.'],
 ['facepull','Face pull (V-bar)','delts',['back'],'rear','cable','i',[12,20],40,[],'Pull to eyes, elbows high, rotate out.'],
 ['crfly','Cable reverse fly','delts',['back'],'rear','cable','i',[12,15],20,[],'Arms crossed, sweep wide, squeeze rear delts.'],
 ['pushdown','Cable pushdown (V-bar)','triceps',[],'ext','cable','i',[10,15],50,[],'Elbows pinned, full lockout, 1 s squeeze.'],
 ['ohext','Cable overhead extension','triceps',[],'ext','cable','i',[10,15],40,['shoulder'],'Face away, elbows by ears, deep stretch.'],
 ['skull','EZ-bar skull crusher','triceps',[],'ext','curlbar','i',[8,12],55,[],'Lower to forehead, elbows still, press up.'],
 ['calf','Standing barbell calf raise','calves',[],'calf','barbell','i',[10,15],135,[],'Full stretch, 1–2 s pause at the bottom, rise high.'],
 ['calfsl','Single-leg DB calf raise','calves',[],'calf','dumbbell','i',[10,15],20,[],'On a plate edge, full stretch, pause at bottom.'],
 ['pullup','Neutral-grip pull-up','back',['biceps','forearms'],'vpull','bodyweight','c',[6,10],0,[],'Dead stop at the bottom, chest to bar.'],
 ['pullupp','Pronated pull-up','back',['biceps'],'vpull','bodyweight','c',[5,8],0,[],'Shoulder-width grip, drive elbows to ribs.'],
 ['kpulldown','Kneeling cable pulldown','back',['biceps'],'vpull','cable','c',[10,12],100,[],'Kneel tall, pull elbows down to ribs.'],
 ['crow','Seated cable row','back',['biceps','delts'],'row','cable','c',[8,12],120,[],'Tall torso, row to belly, pause 1 s.'],
 ['lmrow','Landmine row (upright torso)','back',['biceps','forearms'],'row','landmine','c',[8,12],70,[],'Torso near 45°, V-bar to belly, no jerk.'],
 ['dbrow','Supported one-arm DB row','back',['biceps'],'row','dumbbell','c',[12,15],20,[],'Hand on rack, row to hip, slow lower.'],
 ['bbrow','Barbell bent-over row','back',['biceps','delts'],'row','barbell','c',[6,10],155,['bent-over-extend'],'Hinge to 45°, row to belly.'],
 ['preacher','Preacher curl (EZ bar)','biceps',['forearms'],'curl','curlbar','i',[8,12],55,[],'Armpits on pad, full stretch, no bounce.'],
 ['ccurl','Thick-grip cable curl','biceps',['forearms'],'curl','cable','i',[10,15],40,[],'Elbows still, squeeze hard up top.'],
 ['nccurl','Narrow-grip EZ curl','biceps',['forearms'],'curl','curlbar','i',[8,12],55,[],'Hands inside shoulders, no swing.'],
 ['hammer','DB hammer curl','biceps',['forearms'],'curl','dumbbell','i',[10,15],20,[],'Neutral grip, curl across the body.'],
 ['wcurl','Wide-grip barbell curl','biceps',['forearms'],'curl','barbell','i',[8,12],65,['wide-curl'],'Wide grip, elbows still.'],
 ['revcurl','Reverse EZ curl','forearms',['biceps'],'curl','curlbar','i',[12,15],35,[],'Overhand grip, slow 3 s lower.'],
 ['wristcurl','DB wrist curl','forearms',[],'wrist','dumbbell','i',[15,20],20,[],'Forearms on thighs, full roll-down.'],
 ['creverse','Thick-grip cable reverse curl','forearms',['biceps'],'curl','cable','i',[12,15],30,[],'Overhand on thick D handles, slow lower.'],
 ['deadhang','Dead hang','forearms',[],'hang','bodyweight','w',[20,40],0,[],'Warm-up / grip only. Not counted as volume.'],
 ['squat','Back squat','quads',['hams'],'squat','barbell','c',[5,8],225,[],'Brace, sit between the hips, drive up.'],
 ['lmfs','Landmine front squat','quads',['hams'],'squat','landmine','c',[8,12],70,[],'Sleeve at chest, sit tall, knees forward.'],
 ['splitsq','DB split squat','quads',['hams'],'lunge','dumbbell','c',[8,12],20,[],'Long stance, back knee to the floor, front-foot drive.'],
 ['lmhack','Landmine hack squat','quads',['hams'],'squat','landmine','c',[8,12],70,[],'Banned by default for the reference user.'],
 ['rdl','Barbell RDL','hams',['back'],'hinge','barbell','c',[6,10],185,[],'Push hips back, bar on thighs, flat back.'],
 ['lmrdl','Landmine RDL','hams',['back'],'hinge','landmine','c',[8,12],70,[],'Hips back, sleeve close, squeeze glutes at the top.'],
 ['dbrdl','DB RDL (tempo)','hams',['back'],'hinge','dumbbell','c',[12,15],20,[],'3 s lower, deep hamstring stretch.'],
 ['pullthru','Cable pull-through','hams',[],'hinge','cable','i',[12,15],60,[],'Face away, hinge, snap the hips through.'],
 ['bridge','Glute bridge','hams',[],'bridge','bodyweight','i',[12,20],0,[],'Low-tension, banned by default.'],
 ['superman','Superman','back',[],'ext','bodyweight','i',[12,20],0,[],'Low-tension, banned by default.'],
 ['ccrunch','Kneeling cable crunch','abs',[],'flexion','cable','i',[10,15],80,[],'Curl ribs to hips. Hips stay still.'],
 ['hkr','Hanging knee raise','abs',['forearms'],'flexion','bodyweight','i',[10,15],0,[],'Tilt the pelvis up. No swing.'],
 ['lmrot','Landmine rotation','abs',[],'rotation','landmine','i',[10,12],25,[],'Arms long, rotate from the trunk.']
];
const LIB = {};
L.forEach(r => LIB[r[0]] = {id:r[0],name:r[1],prim:r[2],syn:r[3],pattern:r[4],impl:r[5],kind:r[6],rr:r[7],start:r[8],tags:r[9],cue:r[10],
  video:'https://www.youtube.com/results?search_query=' + encodeURIComponent(r[1] + ' form')});
const IMPL_NEEDS = {barbell:'barbell',landmine:'landmine',dumbbell:'dumbbell',cable:'cable',curlbar:'curlbar',bodyweight:null};

/* ---------- session templates (editable data) ---------- */
const TEMPLATES = [
 {id:'push',name:'Push',prime:['chest','triceps','delts'],slots:[
   {main:1,sets:3,opts:['bench','cgbench']},
   {sets:3,ss:'A',opts:['lmpress','cpress','pushup']},{sets:3,ss:'A',opts:['lat','clat']},
   {sets:3,ss:'B',opts:['pushdown','ohext','skull']},{sets:2,ss:'B',opts:['cfly','pushup']},
   {sets:3,opts:['calf','calfsl']}]},
 {id:'pull',name:'Pull',prime:['back','biceps'],slots:[
   {main:1,sets:4,opts:['pullup','pullupp']},
   {sets:3,ss:'A',opts:['crow','lmrow','dbrow','bbrow','kpulldown']},{sets:3,ss:'A',opts:['facepull','crfly']},
   {sets:3,ss:'B',opts:['ccurl','hammer','nccurl']},{sets:2,ss:'B',opts:['hkr']},
   {sets:2,opts:['revcurl','creverse','wristcurl']}]},
 {id:'legs',name:'Legs',prime:['quads','hams','calves'],slots:[
   {main:1,sets:4,opts:['squat','lmfs']},
   {sets:4,opts:['calf','calfsl']},
   {sets:3,opts:['rdl','lmrdl','dbrdl']},
   {sets:3,ss:'A',opts:['lmfs','splitsq','lmhack']},{sets:2,ss:'A',opts:['pullthru','dbrdl']}]},
 {id:'arms',name:'Arms + Delts + Abs',prime:['biceps','triceps','abs'],slots:[
   {main:1,sets:4,opts:['preacher','nccurl'],feature:1},
   {sets:3,ss:'A',opts:['pushdown','ohext','skull']},{sets:3,ss:'A',opts:['ccurl','hammer','nccurl']},
   {sets:3,ss:'B',opts:['clat','lat']},{sets:3,ss:'B',opts:['ccrunch']},
   {sets:2,opts:['revcurl','creverse','wristcurl']}]},
 {id:'full',name:'Full Body',prime:['quads','back','chest'],greenOnly:1,slots:[
   {main:1,sets:3,opts:['lmfs','squat']},
   {sets:3,ss:'A',opts:['crow','lmrow']},{sets:3,ss:'A',opts:['cpress','lmpress']},
   {sets:2,ss:'B',opts:['ccurl','hammer']},{sets:2,ss:'B',opts:['pushdown','skull']},
   {sets:2,opts:['hkr','ccrunch']}]}
];
const FINISHERS = {
  push:{name:'Triceps burnout',rounds:2,items:['Pushdown × 15','Deficit push-up × max−2'],rest:45,frac:{triceps:2,chest:1}},
  pull:{name:'Biceps ladder',rounds:2,items:['Cable curl × 12','Hammer curl × 12'],rest:45,frac:{biceps:2,forearms:1}},
  legs:{name:'Calf + core',rounds:2,items:['Single-leg calf × 12 / side','Hanging knee raise × 10'],rest:45,frac:{calves:1,abs:1}},
  arms:{name:'Arm 21s',rounds:2,items:['EZ curl 21s','Pushdown × 15'],rest:60,frac:{biceps:2,triceps:2}},
  full:{name:'Core closer',rounds:2,items:['Cable crunch × 15','Knee raise × 10'],rest:45,frac:{abs:2}}
};

/* ---------- small utils ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
let TZ = 0; // minutes, = Date#getTimezoneOffset(); a setting, so outputs stay deterministic
const setTZ = m => { TZ = m || 0; };
const dayKey = ts => new Date(ts - TZ*60000).toISOString().slice(0,10);
const r1 = x => Math.round(x * 10) / 10;
function hash(s){ let h = 2166136261; for (const c of s){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function deepMerge(base, over){ const o = clone(base); for (const k in (over||{})) { if (over[k] && typeof over[k]==='object' && !Array.isArray(over[k]) && o[k] && typeof o[k]==='object') o[k] = deepMerge(o[k], over[k]); else o[k] = over[k]; } return o; }
function settingsOf(state){ return deepMerge(DEFAULT_SETTINGS, state.settings || {}); }
function done(s){ return s.status === 'done' || s.status === 'reported'; }

/* ---------- loadable weights (§3 rule 6) ---------- */
function plateTotals(plates, maxPerSide){ // achievable per-side sums using pairs
  let sums = new Set([0]);
  Object.keys(plates).forEach(d => { const w = +d, n = Math.floor(plates[d] / (maxPerSide ? 1 : 2));
    const next = new Set(); sums.forEach(s => { for (let k = 0; k <= n; k++) next.add(r1(s + k*w)); }); sums = next; });
  return [...sums].sort((a,b) => a-b);
}
function loadOptions(impl, eq){
  if (impl === 'barbell') return plateTotals(eq.plates).map(s => r1((eq.bar||45) + 2*s));
  if (impl === 'curlbar') return plateTotals(eq.plates).map(s => r1((eq.curlbar||25) + 2*s));
  if (impl === 'landmine') return plateTotals(eq.plates, true); // single sleeve
  if (impl === 'dumbbell'){ const o = [], d = eq.db || {min:2.5,max:20,step:2.5}; for (let w = d.min; w <= d.max + 1e-9; w += d.step) o.push(r1(w)); return o; }
  if (impl === 'cable'){ const o = [], c = eq.cable || {inc:10,max:200}; for (let w = c.inc; w <= c.max; w += c.inc) o.push(w); return o; }
  return [0];
}
function roundLoad(target, impl, eq, dir, from){ // dir: +1 progress, -1 regress, 0 nearest
  const opts = loadOptions(impl, eq); if (opts.length === 1) return opts[0];
  let best = opts[0]; for (const o of opts) if (Math.abs(o - target) < Math.abs(best - target)) best = o;
  if (dir > 0 && from != null && best <= from) best = opts.find(o => o > from) ?? opts[opts.length-1];
  if (dir < 0 && from != null && best >= from) best = [...opts].reverse().find(o => o < from) ?? opts[0];
  return best;
}
function plateBreakdown(load, impl, eq){ // greedy per-side plates for barbell/curl bar, whole sleeve for landmine
  if (!['barbell','curlbar','landmine'].includes(impl)) return null;
  const base = impl === 'barbell' ? (eq.bar||45) : impl === 'curlbar' ? (eq.curlbar||25) : 0;
  let side = impl === 'landmine' ? load : (load - base) / 2; if (side < 0) return null;
  const out = [], avail = Object.assign({}, eq.plates); Object.keys(avail).map(Number).sort((a,b) => b-a).forEach(d => {
    let n = impl === 'landmine' ? avail[d] : Math.floor(avail[d] / 2); while (n > 0 && side >= d - 1e-9){ out.push(d); side = r1(side - d); n--; } });
  return Math.abs(side) < 1e-6 ? out : null;
}
function isLoadable(load, impl, eq){ return impl === 'bodyweight' ? load === 0 : loadOptions(impl, eq).includes(r1(load)); }

/* ---------- history queries ---------- */
function workSets(ex, status){ // sets that count (reported: unlogged sets count at target)
  return (ex.sets||[]).filter(s => s.ar != null || status === 'reported').map(s => ({reps: s.ar ?? s.tr, load: s.al ?? s.tl, reported: s.ar == null}));
}
function sessionFrac(s){
  const f = {}; MUSCLES.forEach(m => f[m] = 0); if (!done(s)) return f;
  (s.ex||[]).forEach(e => { const L0 = LIB[e.exId]; if (!L0 || L0.kind === 'w') return; const n = workSets(e, s.status).length;
    f[L0.prim] += n; L0.syn.forEach(m => f[m] += 0.5*n); });
  if (s.finisher && s.finisher.done) Object.entries(s.finisher.frac).forEach(([m,v]) => f[m] += v);
  return f;
}
function lastHard(state, now){
  const S = settingsOf(state), out = {};
  state.sessions.filter(done).forEach(s => { if (s.ts > now || s.dose === 'deload') return;
    const f = sessionFrac(s), tpl = (state.templates || TEMPLATES).find(t => t.id === s.tpl);
    MUSCLES.forEach(m => { if (f[m] >= S.hardFracSets || (tpl && tpl.prime.includes(m) && f[m] > 0)) out[m] = Math.max(out[m]||0, s.ts); }); });
  return out;
}
function weekStart(now){ const d = new Date(now - TZ*60000); const wd = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - wd*D + TZ*60000; }
function weekFrac(state, now){
  const ws = weekStart(now), f = {}; MUSCLES.forEach(m => f[m] = 0);
  state.sessions.filter(s => done(s) && s.ts >= ws && s.ts < now).forEach(s => { const g = sessionFrac(s); MUSCLES.forEach(m => f[m] += g[m]); });
  return f;
}
function lastExposure(state, exId, before){
  for (let i = state.sessions.length - 1; i >= 0; i--){ const s = state.sessions[i];
    if (!done(s) || s.ts >= before) continue; const e = s.ex.find(x => x.exId === exId);
    if (e && workSets(e, s.status).length) return {s, e, prev: null}; }
  return null;
}
function exposures(state, exId, before, n){
  const out = []; for (let i = state.sessions.length - 1; i >= 0 && out.length < n; i--){ const s = state.sessions[i];
    if (!done(s) || s.ts >= before) continue; const e = s.ex.find(x => x.exId === exId); if (e && workSets(e, s.status).length) out.push({s, e}); }
  return out;
}

/* ---------- filters: equipment, bans, limitations, pain strikes ---------- */
function exAllowed(state, id){
  const x = LIB[id]; if (!x) return false; const st = (state.exState||{})[id] || {};
  if (st.ban) return false;
  const need = IMPL_NEEDS[x.impl]; const has = (state.equipment||{}).has || {};
  if (need && !has[need]) return false;
  if (x.pattern === 'vpull' && x.impl === 'bodyweight' && !has.pullup) return false;
  if (x.id === 'hkr' && !has.pullup) return false;
  const lim = state.limitations || []; for (const l of lim) if ((l.tags||[]).some(t => x.tags.includes(t))) return false;
  const strikes = (state.painFlags||[]).filter(p => p.exId === id).length; if (strikes >= 2) return false;
  return true;
}
function patternStrikes(state){ const c = {}; (state.painFlags||[]).forEach(p => { const x = LIB[p.exId]; if (x) c[x.pattern] = (c[x.pattern]||0) + 1; }); return c; }

/* ---------- readiness (§4.1) ---------- */
function inClockWindow(state, now){ const c = state.profile && state.profile.clockShift; if (!c) return false; const S = settingsOf(state); return now - Date.parse(c) < S.clockDays * D && now >= Date.parse(c); }
function globalColor(state, ck, now){
  const S = settingsOf(state);
  if (!ck) return {color:'unknown', why:'No check-in yet.'};
  if (ck.ill) return {color:'red', why:'Pain or illness flagged.'};
  const clock = inClockWindow(state, now);
  if (ck.fatigue >= S.red.fatigueMin) return {color:'red', why:'Fatigue is ' + ck.fatigue + '/5.'};
  if (!clock && ck.energy <= S.red.energyMax) return {color:'red', why:'Energy is ' + ck.energy + '/10.'};
  const y = [];
  if (!clock && ck.energy < S.green.energyMin) y.push('energy ' + ck.energy + '/10');
  if (!clock && ck.sleep < S.green.sleepMin) y.push('sleep ' + ck.sleep + '/5');
  if (ck.fatigue > S.green.fatigueMax) y.push('fatigue ' + ck.fatigue + '/5');
  return y.length ? {color:'yellow', why:y.join(', '), clock} : {color:'green', why:'', clock};
}
function soreFor(tpl, ck){ if (!ck || !ck.sore) return 0; return Math.max(0, ...tpl.prime.map(m => ck.sore[REGION[m]] || 0)); }

/* ---------- session selection (§4.2) ---------- */
function candidates(state, ck, now, color){
  const S = settingsOf(state), tpls = state.templates || TEMPLATES, lh = lastHard(state, now);
  const spacing = (color === 'yellow' ? S.spacingYellowH : S.spacingGreenH) * H;
  return tpls.map((t, i) => {
    const last = Math.max(0, ...state.sessions.filter(s => done(s) && s.tpl === t.id && s.ts < now).map(s => s.ts));
    const recov = t.prime.every(m => !lh[m] || now - lh[m] >= spacing);
    const notRecov = t.prime.filter(m => lh[m] && now - lh[m] < spacing).map(m => ({m, h: Math.round((now - lh[m]) / H)}));
    return {t, i, dueH: last ? (now - last) / H : 1e6, recov, notRecov, sore: soreFor(t, ck), lastTs: last};
  }).sort((a,b) => b.dueH - a.dueH || a.i - b.i);
}
function hardDaysInRow(state, now){
  let n = 0; for (let k = 1; k <= 3; k++){ const day = dayKey(now - k*D);
    if (state.sessions.some(s => done(s) && dayKey(s.ts) === day && s.dose !== 'deload' && s.dose !== 'yellow')) n++; else break; }
  return n;
}

/* ---------- deload triggers (§4.6) ---------- */
function e1rm(reps, load){ return load * (1 + reps / 30); }
function deloadCheck(state, now){
  const S = settingsOf(state), ds = S.deloadSens, since = now - 14*D, mains = new Set();
  state.sessions.filter(s => done(s) && s.ts >= since && s.ts < now).forEach(s => s.ex.filter(e => e.main).forEach(e => mains.add(e.exId)));
  // 1. performance
  let perfDown = []; mains.forEach(id => { const ex = exposures(state, id, now, 4); if (ex.length < 2) return;
    const set1 = x => { const w = workSets(x.e, x.s.status)[0]; return w ? (LIB[id].impl === 'bodyweight' ? w.reps : e1rm(w.reps, w.load)) : 0; };
    const latest = ex[0], prior = ex.slice(1), best = Math.max(...prior.map(set1)); if (latest.s.ts < since) return;
    const l1 = workSets(latest.e, latest.s.status)[0], sameLoad = prior.find(p => { const w = workSets(p.e, p.s.status)[0]; return w && l1 && w.load === l1.load; });
    const repsDrop = sameLoad && l1 ? workSets(sameLoad.e, sameLoad.s.status)[0].reps - l1.reps : 0;
    if (best > 0 && (set1(latest) <= best * (1 - ds.perfPct/100) || repsDrop >= ds.repsDrop)) perfDown.push(LIB[id].name); });
  const perf = perfDown.length >= 2;
  // 2. readiness
  const ck7 = (state.checkins||[]).filter(c => c.ts >= now - 7*D && c.ts < now), reds = ck7.filter(c => c.color === 'red').length;
  let soreLong = null; const ck5 = (state.checkins||[]).filter(c => c.ts >= now - 6*D && c.ts <= now);
  if (ck5.length >= 3 && ck5[ck5.length-1].ts - ck5[0].ts >= ds.soreH * H) ['push','pull','legs','core'].forEach(r => { if (ck5.every(c => (c.sore||{})[r] >= 5)) soreLong = REGION_LABEL[r]; });
  const ready = reds >= ds.redDays || !!soreLong;
  // 3. effort drift
  let drift = []; const seen = {}; state.sessions.filter(s => done(s) && s.ts >= since && s.ts < now).forEach(s => s.ex.forEach(e => {
    if (e.effort == null) return; const w = workSets(e, s.status)[0]; if (!w) return; const k = e.exId + '@' + w.load + 'x' + w.reps;
    if (seen[k] != null && e.effort - seen[k] >= ds.driftPts) drift.push(LIB[e.exId].name); if (seen[k] == null) seen[k] = e.effort; }));
  drift = [...new Set(drift)]; const eff = drift.length >= 2;
  const domains = [
    {key:'performance', abnormal:perf, line: perf ? 'Performance: set-1 output is down on ' + perfDown.slice(0,2).join(' and ') + '.' : 'Performance: main lifts holding.'},
    {key:'readiness', abnormal:ready, line: ready ? (reds >= ds.redDays ? 'Readiness: ' + reds + ' red days this week.' : 'Readiness: ' + soreLong + ' soreness has lasted over 4 days.') : 'Readiness: recovering normally (' + reds + ' red days).'},
    {key:'effort', abnormal:eff, line: eff ? 'Effort drift: the same work costs more on ' + drift.slice(0,2).join(' and ') + '.' : 'Effort: no drift.'}];
  return {trigger: domains.filter(d => d.abnormal).length >= 2, domains};
}
function deloadActive(state, now){ return state.deload && state.deload.until && now < Date.parse(state.deload.until) && now >= Date.parse(state.deload.start); }

/* ---------- load prescription (§4.4–4.5) ---------- */
function prescribe(state, exId, now, eq){
  const S = settingsOf(state), x = LIB[exId], comp = x.kind === 'c', tgtHi = 8, E = S.effort;
  const last = exposures(state, exId, now, 2);
  if (!last.length) return {load: roundLoad(x.start, x.impl, eq, 0), reps: x.rr[0] + 1 > x.rr[1] ? x.rr[0] : x.rr[0] + 1, basis: null, why:'Starting load. Rate it after your last set and the coach takes over.'};
  const {s, e} = last[0], ws = workSets(e, s.status), load = ws[0].load, eff = e.effort != null && e.effort >= E.steerMin ? e.effort : null;
  const basis = 'Last: ' + ws.map(w => w.reps).join('/') + (x.impl === 'bodyweight' ? ' @ BW' : ' @ ' + load) + (e.effort != null ? ' · E' + e.effort : '') + (s.status === 'reported' ? ' · reported' : '');
  const allTop = ws.every(w => w.reps >= x.rr[1]), diff = eff != null ? eff - tgtHi : null;
  const bw = x.impl === 'bodyweight';
  if (diff != null && diff >= 2){
    const pct = comp ? E.hardComp : E.hardIso;
    return bw ? {load:0, reps: Math.max(x.rr[0], Math.min(...ws.map(w => w.reps)) - 2), basis, why:'Rated E' + eff + ': trimming reps.'}
      : {load: roundLoad(load * (1 - pct/100), x.impl, eq, -1, load), reps: x.rr[0], basis, why:'Rated E' + eff + ', 2+ harder than target: −' + pct + '%.'};
  }
  if (allTop){
    if (bw) return {load:0, reps: x.rr[1], basis, why:'Top of range. Add a rep, or add load if you use a belt.'};
    const pct = comp ? E.addComp : E.addIso, next = roundLoad(load * (1 + pct/100), x.impl, eq, +1, load), minReps = Math.min(...ws.map(w => w.reps));
    // big equipment jump (e.g. 10-lb cable step on a light load): earn it with extra reps first
    if (load > 0 && (next - load) / load > 0.10 && minReps < x.rr[1] + 2) return {load, reps: minReps + 1, basis, why:'Next step is +' + r1(next - load) + ' lb, a big jump. Add reps first, then load.'};
    return {load: next, reps: x.rr[0], basis, why:'Top of range' + (eff ? ' at E' + eff : '') + ': load up.'};
  }
  if (diff === 1){
    const p = last[1], pw = p && workSets(p.e, p.s.status)[0], prevHard = p && p.e.effort != null && p.e.effort - tgtHi === 1 && pw && pw.load === load;
    if (prevHard && !bw) return {load: roundLoad(load * (1 - E.repeatDrop/100), x.impl, eq, -1, load), reps: x.rr[0], basis, why:'E9 twice at this load: −' + E.repeatDrop + '%.'};
    return {load, reps: Math.min(...ws.map(w => w.reps)), basis, why:'Rated E9: repeat the load.'};
  }
  return {load, reps: Math.min(x.rr[1], Math.min(...ws.map(w => w.reps)) + 1), basis, why:'Same load, one more rep.'};
}
function ramps(load, impl, eq, first){
  if (impl !== 'barbell' && impl !== 'landmine') return [];
  const plan = first ? [[0.4,5],[0.6,4],[0.75,3],[0.88,1]] : [[0.7,3]];
  const out = []; plan.forEach(([p, r]) => { const l = roundLoad(load * p, impl, eq, 0); if (l < load && !out.some(o => o.load === l)) out.push({reps:r, load:l}); });
  return out;
}

/* ---------- build a session ---------- */
function build(state, tpl, dose, now){
  const S = settingsOf(state), eq = state.equipment, prof = state.profile || {}, phase = prof.phase || 'cut';
  const ranges = S.ranges[phase] || S.ranges.cut, prio = prof.priority || ['biceps','triceps','abs'], wf = weekFrac(state, now);
  const prevSame = [...state.sessions].reverse().find(s => s.tpl === tpl.id && s.ts < now && s.status !== 'planned');
  const sessFrac = {}; MUSCLES.forEach(m => sessFrac[m] = 0);
  const used = new Set(), ex = []; let barbellRamped = 0;
  tpl.slots.forEach((slot, si) => {
    let opts = slot.opts.filter(id => exAllowed(state, id) && !used.has(id));
    if (!opts.length){ // like-for-like substitute: same primary muscle, any allowed exercise
      const prim = LIB[slot.opts[0]].prim; opts = Object.keys(LIB).filter(id => LIB[id].prim === prim && LIB[id].kind !== 'w' && exAllowed(state, id) && !used.has(id)); }
    if (!opts.length) return;
    const fav = opts.find(id => ((state.exState||{})[id]||{}).fav), liked = opts.filter(id => ((state.exState||{})[id]||{}).like);
    let pick;
    if (slot.main) pick = fav || opts[0];
    else { const prevPick = prevSame && (prevSame.ex.find(e => e.slot === si)||{}).exId; const pool = (liked.length ? liked.concat(opts.filter(o => !liked.includes(o))) : opts);
      pick = pool.find(o => o !== prevPick) || pool[0]; }
    used.add(pick); const x = LIB[pick];
    let sets = slot.sets;
    const isPrio = prio.includes(x.prim);
    if (isPrio && !slot.main && wf[x.prim] + sessFrac[x.prim] + sets + 1 <= ranges[x.prim][1]) sets += 1;
    if (!isPrio && wf[x.prim] + sessFrac[x.prim] + sets > ranges[x.prim][1]) sets = Math.max(2, ranges[x.prim][1] - Math.ceil(wf[x.prim] + sessFrac[x.prim]));
    while (sets > 1 && sessFrac[x.prim] + sets > S.sessionCapFrac) sets--;
    let tgtE = x.kind === 'c' ? [7,8] : [8,9];
    const p = prescribe(state, pick, now, eq); let load = p.load, why = p.why, repCut = 0;
    if (dose === 'yellow'){ sets = Math.max(slot.main ? 2 : 1, Math.round(sets * S.yellow.volPct / 100)); if (load){ const dn = roundLoad(load * (1 + S.yellow.loadPct/100), x.impl, eq, -1, load); if ((load - dn) / load <= 0.075) load = dn; else { repCut = 2; } } tgtE = tgtE.map(v => v - 1); why = repCut ? 'Yellow day: same load (the next step down is too big), 2 fewer reps, fewer sets.' : 'Yellow day: −5% load, fewer sets.'; }
    if (dose === 'deload'){ sets = Math.max(1, Math.round(sets * S.deloadDose.volPct / 100)); if (load) load = roundLoad(load * S.deloadDose.loadPct / 100, x.impl, eq, -1, load); tgtE = [5, S.deloadDose.effortMax]; why = 'Deload: lighter, crisp reps.'; }
    sessFrac[x.prim] += sets; x.syn.forEach(m => sessFrac[m] += 0.5*sets);
    const warm = (x.kind === 'c' && barbellRamped < 2 && (x.impl === 'barbell' || (slot.main && x.impl === 'landmine'))) ? ramps(load, x.impl, eq, barbellRamped++ === 0) : [];
    const shoulder = x.tags.includes('shoulder') && (state.limitations||[]).some(l => /shoulder/i.test(l.area||''));
    ex.push({exId:pick, slot:si, main:!!slot.main, feature:!!(slot.feature || fav === pick), ss: S.supersets ? (slot.ss||null) : null, kind:x.kind, impl:x.impl, rr:x.rr, tgtE,
      warm: warm.map(w => ({tr:w.reps, tl:w.load, ar:null, al:null})), sets: Array.from({length: sets}, () => ({tr:Math.max(1, p.reps - repCut), tl:load, ar:null, al:null})),
      effort:null, basis:p.basis, why, pinch: shoulder,
      rest: slot.ss ? S.rest.pair : (slot.main ? S.rest.main : (x.kind === 'c' ? S.rest.comp : S.rest.iso))});
  });
  return {ex, frac: sessFrac};
}
function finisherFor(state, tpl, now, color, dose){
  if (color !== 'green' || dose !== 'full') return null;
  const S = settingsOf(state), ws = weekStart(now), wk = state.sessions.filter(s => done(s) && s.ts >= ws && s.finisher && s.finisher.done);
  const cutWeek = (state.profile && state.profile.cutWeek) || 1, allow = cutWeek <= S.finishers.earlyWeeks ? S.finishers.earlyPerWeek : S.finishers.laterPerWeek;
  if (wk.length >= allow) return null;
  const y = dayKey(now - D); if (state.sessions.some(s => done(s) && dayKey(s.ts) === y && s.finisher && s.finisher.done)) return null;
  const f = FINISHERS[tpl.id]; return f ? Object.assign(clone(f), {done:false}) : null;
}

/* ---------- the daily plan (§4.1 order) ---------- */
function plan(state, ck, now){
  const S = settingsOf(state), g = globalColor(state, ck, now), deload = deloadActive(state, now);
  const base = {protocolVersion:PROTOCOL, date:dayKey(now), checkin: ck ? clone(ck) : null};
  if (g.color === 'red') return Object.assign(base, {color:'red', why:g.why + ' Rest, walk, or mobility today. Nothing is owed later.', session:null, options:[]});
  const color0 = g.color === 'unknown' ? 'green' : g.color;
  let cands = candidates(state, ck, now, color0 === 'yellow' ? 'yellow' : 'green');
  if (ck && cands.every(c => c.sore >= S.red.soreMin)) return Object.assign(base, {color:'red', why:'Soreness is 7+ for every session.', session:null, options:[]});
  let pool = cands.filter(c => c.recov && c.sore < S.red.soreMin);
  let color = color0, why;
  const greenPool = pool.filter(c => c.sore <= S.green.soreMax && !(c.t.greenOnly && color !== 'green'));
  let pick;
  if (color === 'green' && greenPool.length){ pick = greenPool[0]; }
  else {
    if (color === 'green'){ color = 'yellow'; cands = candidates(state, ck, now, 'yellow'); pool = cands.filter(c => c.recov && c.sore < S.red.soreMin); }
    let yp = pool.filter(c => !c.t.greenOnly).sort((a,b) => a.sore - b.sore || b.dueH - a.dueH);
    if (!yp.length){ cands = candidates(state, ck, now, 'green'); pool = cands.filter(c => c.recov && c.sore < S.red.soreMin);
      yp = pool.filter(c => !c.t.greenOnly).sort((a,b) => a.sore - b.sore || b.dueH - a.dueH); } // nothing at 72 h: least-fatigued at 48 h, still yellow dose
    pick = yp[0];
  }
  if (!pick){ const blocker = cands[0]; return Object.assign(base, {color:'red', why:'Nothing is recovered yet' + (blocker && blocker.notRecov[0] ? ': ' + MUSCLE_LABEL[blocker.notRecov[0].m] + ' was hit ' + blocker.notRecov[0].h + ' h ago.' : '.') + ' Walk or rest.', session:null, options:[]}); }
  const hardRow = hardDaysInRow(state, now);
  let dose = deload ? 'deload' : (color === 'yellow' ? 'yellow' : 'full');
  if (hardRow >= S.maxHardRow && dose === 'full'){ dose = 'yellow'; }
  const last = pick.lastTs ? Math.round((now - pick.lastTs) / D) : null;
  why = pick.t.name + ' is most due' + (last != null ? ' (last done ' + last + ' day' + (last === 1 ? '' : 's') + ' ago)' : '') + (ck ? '; soreness there is ' + pick.sore + '/10.' : '.');
  if (color === 'yellow' && g.why) why = 'Yellow: ' + g.why + '. ' + why;
  if (hardRow >= S.maxHardRow) why += ' Two hard days in a row, so today is trimmed.';
  if (g.clock) why += ' Clock change: low sleep/energy alone isn’t cutting loads.';
  if (deload) why = 'Deload week. ' + why;
  if (!ck) why = 'Readiness unknown. Serving the full plan. ' + why;
  const b = build(state, pick.t, dose, now), fin = finisherFor(state, pick.t, now, color, dose);
  const id = 's' + hash(base.date + pick.t.id + dose + state.sessions.length);
  const session = {id, date:base.date, ts:now, tpl:pick.t.id, name:pick.t.name, color: ck ? color : 'unknown', dose, status:'planned', protocolVersion:PROTOCOL,
    ex:b.ex, finisher:fin, walk:{mi:(state.profile||{}).walkMi || 1.5, min:(state.profile||{}).walkMin || 28, ami:null, amin:null}, estMin: estimate(b.ex)};
  const options = pool.filter(c => c.t.id !== pick.t.id && !(c.t.greenOnly && color !== 'green')).map(c => ({tpl:c.t.id, name:c.t.name, sore:c.sore}));
  return Object.assign(base, {color: ck ? color : 'unknown', why, session, options, frac:b.frac});
}
function planFor(state, ck, now, tplId, dose){ // user "Adjust": swap session or trim
  const tpl = (state.templates || TEMPLATES).find(t => t.id === tplId), b = build(state, tpl, dose, now);
  const p = plan(state, ck, now); const color = dose === 'yellow' ? 'yellow' : (p.color === 'red' ? 'yellow' : p.color);
  return {id:'s' + hash(dayKey(now) + tplId + dose + state.sessions.length), date:dayKey(now), ts:now, tpl:tplId, name:tpl.name, color, dose, status:'planned', protocolVersion:PROTOCOL,
    ex:b.ex, finisher: finisherFor(state, tpl, now, color, dose), walk:{mi:(state.profile||{}).walkMi || 1.5, min:(state.profile||{}).walkMin || 28, ami:null, amin:null}, estMin: estimate(b.ex)};
}
function estimate(ex){ let sec = 300; ex.forEach(e => { sec += e.warm.length * 60 + e.sets.length * (40 + (e.ss ? e.rest/2 : e.rest)); }); return Math.round(sec / 60) + 10; }

/* ---------- weekly review (§4.7) ---------- */
function avgWeight(ws, from, to){ const v = ws.filter(w => w.ts >= from && w.ts < to).map(w => w.lb); return v.length ? r1(v.reduce((a,b) => a+b, 0) / v.length) : null; }
function review(state, now){
  const S = settingsOf(state), ws = (state.weights||[]), last = ws.length ? ws[ws.length-1] : null;
  const gapDays = last ? Math.floor((now - last.ts) / D) : null;
  const a7 = avgWeight(ws, now - 7*D, now + 1), p7 = avgWeight(ws, now - 14*D, now - 7*D);
  const ck = (state.checkins||[]).filter(c => c.ts >= now - 7*D && c.ts <= now), cnt = {green:0, yellow:0, red:0}; ck.forEach(c => cnt[c.color] != null && cnt[c.color]++);
  const wkS = state.sessions.filter(s => s.ts >= now - 7*D && s.ts <= now), completed = wkS.filter(done).length;
  const hunger = ck.filter(c => c.hunger != null).map(c => c.hunger), avgH = hunger.length ? r1(hunger.reduce((a,b) => a+b, 0) / hunger.length) : null;
  const dl = deloadCheck(state, now), notes = [];
  if (gapDays == null) notes.push('No weigh-ins yet. The trend needs one every morning.');
  else if (gapDays > 7) notes.push('No weigh-in for ' + gapDays + ' days, so there is no weight trend. Log one tomorrow morning.');
  if (a7 != null && p7 != null && a7 <= p7) notes.push('If you feel bigger or puffy 2–5 days after a session while the 7-day average is flat or down, that’s fluid and inflammation from training, not fat. No change to food or volume.');
  const green = ck.length ? cnt.green / ck.length : 0, earn = S.earnBack && ck.length >= 4 && green >= 0.6 && !dl.domains[0].abnormal && (avgH == null || avgH <= 7);
  const wk = Math.floor((now - Date.parse((state.meta||{}).created || new Date(now).toISOString())) / (7*D)) + 1;
  return {avg7:a7, prev7:p7, delta: a7 != null && p7 != null ? r1(a7 - p7) : null, gapDays, counts:cnt, completed, planned:(state.profile||{}).days || 5, hunger:avgH,
    deload:dl, notes, earnBackWeek:earn, blockWeek: ((wk - 1) % 4) + 1, mandatoryReview: wk % 4 === 0, volume: weekFrac(state, now + 1), ranges: (S.ranges[(state.profile||{}).phase || 'cut'])};
}

/* ---------- logging helpers ---------- */
function markReported(session){ session.status = 'reported'; return session; }
function complete(session){ session.status = 'done'; return session; }
function flagPain(state, exId, ts){ state.painFlags = state.painFlags || []; state.painFlags.push({exId, ts});
  const x = LIB[exId], strikes = patternStrikes(state)[x.pattern] || 0, out = {swapped: state.painFlags.filter(p => p.exId === exId).length >= 2, patternBanned:false};
  if (strikes >= 3){ state.limitations = state.limitations || []; if (!state.limitations.some(l => l.auto && l.tags.includes('pattern:' + x.pattern))){
    state.limitations.push({id:'auto-' + x.pattern, area:'Auto: ' + x.pattern, desc:'Auto-banned after 3 pain flags. Review in Settings.', tags:['pattern:' + x.pattern], auto:true}); }
    Object.values(LIB).forEach(e => { if (e.pattern === x.pattern && !e.tags.includes('pattern:' + x.pattern)) e.tags.push('pattern:' + x.pattern); }); out.patternBanned = true; }
  return out;
}
// re-attach pattern tags for auto-banned patterns after a reload
function hydrate(state){ (state.limitations||[]).filter(l => l.auto).forEach(l => l.tags.forEach(t => { const p = t.replace('pattern:',''); Object.values(LIB).forEach(e => { if (e.pattern === p && !e.tags.includes(t)) e.tags.push(t); }); })); return state; }

/* ---------- starting state & demo ---------- */
function newState(nowIso){
  return {v:1, protocolVersion:PROTOCOL, meta:{created:nowIso, onboarded:false},
    profile:{name:'', units:'lb', exp:'intermediate', phase:'cut', weight:null, target:null, days:5, sessionMin:60, priority:['biceps','triceps','abs'], hunger:true, cardio:'walk', walkMi:1.5, walkMin:28, trainWeekday:'05:00', trainWeekend:'07:00', clockShift:null, cutWeek:1},
    equipment:{has:{barbell:true, rack:true, bench:true, dumbbell:true, cable:true, pullup:true, landmine:false, curlbar:true, treadmill:true}, plates:{45:2, 25:2, 10:2, 5:2, 2.5:2}, bar:45, curlbar:25, db:{min:5, max:50, step:5}, cable:{inc:10, max:200}},
    settings:{}, exState:{}, limitations:[], painFlags:[], sessions:[], checkins:[], weights:[], deload:null};
}
function demoState(now){
  const st = newState(new Date(now - 15*D).toISOString());
  st.meta.onboarded = true; st.meta.demo = true;
  Object.assign(st.profile, {name:'Ryan', exp:'advanced', weight:224, target:220, days:5, priority:['biceps','triceps','abs'], cutWeek:6});
  st.equipment = {has:{barbell:true, rack:true, bench:true, dumbbell:true, cable:true, pullup:true, landmine:true, curlbar:true, treadmill:true}, plates:{45:4, 25:2, 10:2, 5:4, 2.5:4}, bar:45, curlbar:25, db:{min:2.5, max:20, step:2.5}, cable:{inc:10, max:200}};
  st.exState = {lmhack:{ban:true}, bridge:{ban:true}, superman:{ban:true}, preacher:{fav:true, like:true}, pullup:{like:true}, hkr:{like:true}, bench:{like:true}, squat:{like:true}, ccurl:{like:true}, pushdown:{like:true}};
  st.limitations = [{id:'l1', area:'Left shoulder', desc:'Top-front into upper bicep. Bending over with the arm reaching forward, and wide-grip curls.', tags:['bent-over-extend','wide-curl']}];
  // two weeks of history, played through the engine so it is internally consistent
  const order = [0,1,2,4,5,7,8,9,11,12]; let w = 226.4;
  for (let d = 14; d >= 1; d--){ const ts = now - d*D; w -= 0.17; st.weights.push({date:dayKey(ts), ts, lb:r1(w + ((d*7)%5 - 2)/10)}); }
  order.forEach((k, idx) => { const ts = now - (14 - k)*D - 2*H;
    const ck = {date:dayKey(ts), ts, sleep: 3 + (idx%2), energy: 7 + (idx%3 === 0 ? 1 : 0), fatigue: idx%4 === 3 ? 3 : 2, sore:{push:2, pull:2, legs:2, core:1}, ill:false, hunger:5 + idx%3};
    const p = plan(st, ck, ts); ck.color = p.color; st.checkins.push(ck); if (!p.session) return;
    const s = p.session; s.ex.forEach((e, ei) => { e.warm.forEach(x => { x.ar = x.tr; x.al = x.tl; }); e.sets.forEach((x, si) => { x.ar = Math.max(1, x.tr + (si === 0 ? 1 : 0) - (si === e.sets.length-1 && ei%2 ? 1 : 0)); x.al = x.tl; }); e.effort = 8 + ((idx + ei) % 3 === 0 ? 1 : 0); });
    if (s.finisher) s.finisher.done = true; s.walk.ami = 1.5; s.walk.amin = 28; s.status = idx === 6 ? 'reported' : 'done'; st.sessions.push(s); });
  return st;
}

/* ---------- export / import ---------- */
function exportJSON(state){ return JSON.stringify(state); }
function importJSON(text){ const s = JSON.parse(text); if (!s || s.v !== 1 || !Array.isArray(s.sessions)) throw new Error('Not an Iron & Fuel export'); return hydrate(s); }
function exportCSV(state){
  const rows = [['date','session','status','exercise','set','warmup','target_reps','target_load','actual_reps','actual_load','effort','protocol']];
  state.sessions.forEach(s => s.ex.forEach(e => { e.warm.concat(e.sets).forEach((x, i) => { const w = i < e.warm.length;
    rows.push([s.date, s.name, s.status, LIB[e.exId].name, w ? 'W' + (i+1) : i - e.warm.length + 1, w ? 1 : 0, x.tr, x.tl, x.ar ?? '', x.al ?? '', w ? '' : (e.effort ?? ''), s.protocolVersion]); }); }));
  return rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g,'""') + '"' : v).join(',')).join('\n');
}

const api = {PROTOCOL, MUSCLES, MUSCLE_LABEL, REGION, REGION_LABEL, DEFAULT_SETTINGS, LIB, TEMPLATES, FINISHERS,
  plan, planFor, review, plateBreakdown, exposures, e1rm, deloadCheck, prescribe, roundLoad, isLoadable, loadOptions, exAllowed, sessionFrac, weekFrac, lastHard, globalColor,
  markReported, complete, flagPain, hydrate, newState, demoState, exportJSON, importJSON, exportCSV, settingsOf, dayKey, setTZ, weekStart, D, H};
if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
