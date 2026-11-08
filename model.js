'use strict';
/* Journée — modèle : constantes, calculs et format de données. Aucun accès au DOM ni au stockage. */
/* =====================================================================
   JOURNÉE — v1.4.0
   Fusion de « Ma Pile » (batterie) et « Infinity Time » (natures du temps)
   Règles issues de F. Olicard :
   - créneau de 20 min, tâche étalon = 1 créneau d'énergie, capacité de
     l'auteur 33 (journée de 11 h) — « Ce livre vous fera gagner du temps »
   - 5 natures du temps, grille de pauses — « Votre temps est infini »
   Hypothèses à calibrer : niveaux 0, ½, 3 et Recharge (−1) ;
   recalibrage de la capacité sur la médiane des jours « fatigue 3/5 ».
   ===================================================================== */
const APP_VERSION = '1.4.0', SCHEMA = 2, SLOT = 20, NS = 72, PX = 18, KEY = 'journee.v1', IT_KEY = 'infinity_data_v10';
const CATS = {
  pro:         { code: 'PRO', label: 'Professionnel', color: '#5B95FF' },
  perso:       { code: 'PER', label: 'Personnel',     color: '#34C48E' },
  soi:         { code: 'SOI', label: 'Pour soi',      color: '#E8A93F' },
  obligatoire: { code: 'OBL', label: 'Obligatoire',   color: '#97A2B6' },
  nontemps:    { code: 'NT',  label: 'Non-temps',     color: '#F0605D' }
};
const CAT_ORDER = ['pro', 'perso', 'soi', 'obligatoire', 'nontemps'];
const LEVELS = [
  { v: -1,  code: 'R', label: 'Recharge' },
  { v: 0,   code: '0', label: 'Nul' },
  { v: 0.5, code: '½', label: 'Léger' },
  { v: 1,   code: '1', label: 'Étalon' },
  { v: 2,   code: '2', label: 'Pénible' },
  { v: 3,   code: '3', label: 'Lourd' }
];
const PAUSES = {
  aucune:        { label: 'Aucune' },
  standard:      { every: 120, len: 10, label: 'Standard · 10 min toutes les 2 h' },
  physique:      { every: 120, len: 15, label: 'Physique · 15 min toutes les 2 h' },
  creative:      { every: 60,  len: 5,  label: 'Créative · 5 min toutes les heures' },
  apprentissage: { every: 20,  len: 5,  label: 'Apprentissage · 5 min toutes les 20 min' }
};
const FATIGUE = ['Très en forme', 'En forme', 'Fatigue normale', 'Fatigué', 'Épuisé'];
const pad = n => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const keyToDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return ymd(d); };
const clock = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const slotClock = (s, ds) => s === NS && ds === 0 ? '24:00' : clock(ds + s * SLOT);
const tm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmtE = x => { const r = Math.round(x * 2) / 2; return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',').replace('-', '−'); };
const fmtH = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? (m ? `${h} h ${pad(m)}` : `${h} h`) : `${m} min`; };
const dur = n => fmtH(n * SLOT);
const fmtSec = x => x < 60 ? `${x} s` : `${Math.floor(x / 60)} min ${pad(x % 60)} s`;
const WD = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const tint = (hex, a = .16) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const fmtDay = (k, long) => new Intl.DateTimeFormat('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' }).format(keyToDate(k));
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const levelOf = v => LEVELS.find(l => l.v === v) || LEVELS[3];
const costStr = x => { const c = (x.e - x.s) * x.i; return c > 0 ? '−' + fmtE(c) : c < 0 ? '+' + fmtE(-c) : '0'; };
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
/* Conversions de format vers la forme en mémoire (v1 = forme riche, v2 = forme compacte sur disque) */
function migrate(o) { return o && o.v === 2 ? unpack(o) : o; }

/* ---------- format compact v2 ----------
   Jour : [ds, validé (min epoch), clôturé (min epoch), fatigue, durée bilan (s), blocs, plan, nuit confirmée]
   Bloc : 7 entiers à plat — début, fin, nature, niveau × 2, pause, sommeil, n° de libellé
   Plan : 0 = aucun, 1 = identique au réel, sinon blocs au même format
   Libellés : dictionnaire commun L                                               */
const PK = Object.keys(PAUSES);
function packBlocks(b, L, M) {
  const a = [];
  for (const x of b) {
    let li = M.get(x.n); if (li == null) { li = L.length; L.push(x.n); M.set(x.n, li); }
    a.push(x.s, x.e, CAT_ORDER.indexOf(x.c), Math.round(x.i * 2), PK.indexOf(x.t), x.z ? 1 : 0, li);
  }
  return a;
}
function sameBlocks(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x.s !== y.s || x.e !== y.e || x.c !== y.c || x.i !== y.i || x.t !== y.t || x.z !== y.z || x.n !== y.n) return false; }
  return true;
}
function pack(db) {
  const L = [], M = new Map(), days = {};
  for (const [k, d] of Object.entries(db.days)) {
    const b = [...d.b].sort((x, y) => x.s - y.s), sn = d.snap ? [...d.snap].sort((x, y) => x.s - y.s) : null;
    days[k] = [d.ds, d.val ? Math.round(d.val / 6e4) : 0, d.clo ? Math.round(d.clo / 6e4) : 0, d.fat || 0, d.bt || 0,
      packBlocks(b, L, M), sn == null ? 0 : sameBlocks(sn, b) ? 1 : packBlocks(sn, L, M), d.nc ? 1 : 0];
  }
  return { v: 2, settings: db.settings, capLog: db.capLog, catalog: db.catalog, templates: db.templates, backlog: db.backlog, legacy: db.legacy, lastExport: db.lastExport, L, days };
}
function unpackBlocks(a, L) {
  const b = []; if (!Array.isArray(a)) return b;
  for (let i = 0; i + 6 < a.length; i += 7) b.push({ id: uid(), s: a[i], e: a[i + 1], c: CAT_ORDER[a[i + 2]], i: a[i + 3] / 2, t: PK[a[i + 4]] || 'aucune', z: a[i + 5] ? 1 : 0, n: String(L[a[i + 6]] ?? '') });
  return b;
}
function unpack(o) {
  const L = Array.isArray(o.L) ? o.L : [], days = {};
  for (const [k, r] of Object.entries(o.days && typeof o.days === 'object' ? o.days : {})) {
    if (!Array.isArray(r)) { days[k] = r; continue; }          // laissé tel quel : la normalisation le rejettera
    const b = unpackBlocks(r[5], L);
    days[k] = { ds: r[0], val: r[1] ? r[1] * 6e4 : null, clo: r[2] ? r[2] * 6e4 : null, fat: r[3] || null, bt: r[4] || null, nc: r[7] === 1 ? 1 : null, b,
      snap: r[6] === 1 ? b.map(x => ({ ...x, id: uid() })) : Array.isArray(r[6]) ? unpackBlocks(r[6], L) : null };
  }
  const { L: _, ...rest } = o;
  return { ...rest, v: 1, days };
}

/* ---------- statistiques ---------- */
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
function ranks(a) {
  const ix = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = new Array(a.length);
  for (let i = 0; i < ix.length;) { let j = i; while (j + 1 < ix.length && ix[j + 1][0] === ix[i][0]) j++; for (let k = i; k <= j; k++) r[ix[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
/* Corrélation de rang de Spearman (adaptée à une note ordinale comme la fatigue 1–5) */
const spearman = (x, y) => pearson(ranks(x), ranks(y));
/* Seuil de |r| significatif à 5 % bilatéral pour n paires (t de Student, développement de Cornish-Fisher) */
function rCrit(n) {
  const df = n - 2; if (df < 1) return null;
  const z = 1.959964, t = z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
  return t / Math.sqrt(t * t + df);
}
/* Écart réel − plan en énergie (null sans plan validé) */
function planBias(d) { return d && d.snap ? energy(d.b) - energy(d.snap) : null; }
/* Minutes dont la nature a changé par rapport au plan */
function natureChange(d) {
  if (!d || !d.snap) return null;
  const p = slotMap(d.snap), r = slotMap(d.b); let n = 0;
  for (let k = 0; k < NS; k++) if ((p[k] && p[k].c) !== (r[k] && r[k].c)) n++;
  return n * SLOT;
}
/* ---------- nuit ----------
   La nuit qui précède la journée T = sommeil en fin de veille P + sommeil en début de T.
   Le sommeil de T est la première suite de blocs « sommeil » commençant avant 04:00,
   éventuellement précédée de blocs éveillés (coucher après minuit).                     */
const SLEEP = { n: 'Sommeil', c: 'obligatoire', i: 0, t: 'aucune', z: 1 };
const sortedB = b => [...b].sort((x, y) => x.s - y.s);
function morningRun(b) {
  const tb = sortedB(b); let i = 0;
  while (i < tb.length && !tb[i].z && tb[i].e <= 12) i++;
  if (!(i < tb.length && tb[i].z && tb[i].s <= 12)) return null;
  const rs = tb[i].s; let re = rs;
  for (; i < tb.length && tb[i].z && tb[i].s === re; i++) re = tb[i].e;
  return { s: rs, e: re };
}
function eveningStart(b) { let ps = NS; for (const x of sortedB(b).reverse()) { if (x.e !== ps || !x.z) break; ps = x.s; } return ps; }
/* Heures actuelles de la nuit, en minutes par rapport à 00:00 du jour T (coucher négatif = la veille) */
function nightOf(P, T) {
  const run = morningRun(T.b), ps = P ? eveningStart(P.b) : NS;
  return { c: ps < NS ? (ps - NS) * SLOT : run ? run.s * SLOT : null, l: run ? run.e * SLOT : null };
}
/* Réécrit la nuit : coucher c ∈ [−720, 240], lever l ∈ [20, 720], l > c. Les voisins suivent les bornes. */
function setNight(P, T, c, l) {
  const pr = T.b.find(x => x.z) || (P && P.b.find(x => x.z)) || SLEEP;
  const sp = { n: pr.n || 'Sommeil', c: pr.c, i: pr.i, t: pr.t, z: 1 };
  const lastAwake = P ? sortedB(P.b).filter(x => !x.z).pop() : null;
  if (P) {
    const s0 = c < 0 ? NS + c / SLOT : NS, ps = eveningStart(P.b);
    const before = P.b.find(x => !x.z && x.e === ps);
    P.b = P.b.filter(x => !(x.z && x.s >= ps));
    if (s0 > ps && before) before.e = s0;                       // couché plus tard : l'activité du soir se prolonge
    if (s0 < NS) paint(P, { id: uid(), ...sp, s: s0, e: NS });   // couché plus tôt : le sommeil la recouvre
    sortB(P);
  }
  const cs = c > 0 ? c / SLOT : 0, le = l / SLOT, run = morningRun(T.b) || { s: 0, e: 0 };
  const next = T.b.find(x => !x.z && x.s === run.e);
  T.b = T.b.filter(x => !(x.z && x.s >= run.s && x.e <= run.e));
  if (le < run.e && next) next.s = le;                           // levé plus tôt : la suite démarre plus tôt
  paint(T, { id: uid(), ...sp, s: cs, e: le });                  // levé plus tard : le sommeil recouvre la suite
  if (cs > 0) paint(T, { id: uid(), ...(lastAwake ? { n: lastAwake.n, c: lastAwake.c, i: lastAwake.i, t: lastAwake.t } : { n: '', c: 'perso', i: 0.5, t: 'aucune' }), z: 0, s: 0, e: cs });
  T.nc = 1;
}
/* Sommeil de la nuit qui précède k, uniquement si la nuit a été confirmée au bilan */
function sleepBefore(days, k) {
  const cur = days[k], prev = days[addDays(k, -1)];
  if (!cur || !cur.clo || !cur.nc) return null;
  const run = morningRun(cur.b); if (!run) return null;
  let m = (run.e - run.s) * SLOT;
  if (run.s === 0) { if (!prev) return null; m += (NS - eveningStart(prev.b)) * SLOT; }
  return m;
}
/* Normalisation : complète les champs manquants, écarte ce qui est invalide, compte les rejets */
const LV = LEVELS.map(l => l.v);
const okLvl = i => LV.includes(i);
function nBlock(x) {
  if (!x || !Number.isInteger(x.s) || !Number.isInteger(x.e) || x.s < 0 || x.e > NS || x.s >= x.e || !CATS[x.c] || !okLvl(x.i)) return null;
  return { id: typeof x.id === 'string' && x.id ? x.id : uid(), s: x.s, e: x.e, n: String(x.n ?? ''), c: x.c, i: x.i, t: PAUSES[x.t] ? x.t : 'aucune', z: x.z ? 1 : 0 };
}
function nItem(x) {
  if (!x || !CATS[x.c] || !okLvl(x.i) || !Number.isInteger(x.d) || x.d < 1 || x.d > NS) return null;
  return { id: typeof x.id === 'string' && x.id ? x.id : uid(), n: String(x.n ?? ''), c: x.c, i: x.i, d: x.d, t: PAUSES[x.t] ? x.t : 'aucune', z: x.z ? 1 : 0 };
}
function normalize(o) {
  const D = defaults(); let bad = 0;
  const keep = (arr, f) => { const out = []; for (const x of (Array.isArray(arr) ? arr : [])) { const y = f(x); if (y) out.push(y); else bad++; } return out; };
  const blocks = arr => { const b = keep(arr, nBlock).sort((a, z) => a.s - z.s), out = []; for (const x of b) { if (out.length && x.s < out[out.length - 1].e) { bad++; continue; } out.push(x); } return out; };
  const st = o.settings && typeof o.settings === 'object' ? o.settings : {};
  const settings = {
    cap: Number.isInteger(st.cap) ? clamp(st.cap, 6, 150) : D.settings.cap,
    ds: [0, 60, 120, 180, 240, 300, 360].includes(st.ds) ? st.ds : D.settings.ds,
    etalon: typeof st.etalon === 'string' ? st.etalon : '',
    nt: Number.isFinite(st.nt) ? clamp(Math.round(st.nt), 0, 600) : D.settings.nt,
    first: st.first !== false,
    anchors: Object.fromEntries(Object.keys(DEF_ANCHORS).map(k => [k, st.anchors && typeof st.anchors[k] === 'string' ? st.anchors[k] : DEF_ANCHORS[k]]))
  };
  const n = {
    v: SCHEMA, settings,
    capLog: (Array.isArray(o.capLog) ? o.capLog : []).filter(c => c && typeof c.d === 'string' && Number.isFinite(c.v)),
    catalog: Array.isArray(o.catalog) ? keep(o.catalog, nItem) : D.catalog,
    templates: Array.isArray(o.templates) ? keep(o.templates, t => t && Array.isArray(t.b) ? { id: t.id || uid(), n: String(t.n || 'Modèle'), wd: Array.isArray(t.wd) ? [...new Set(t.wd.filter(w => Number.isInteger(w) && w >= 0 && w <= 6))] : [], b: keep(t.b, x => Number.isInteger(x && x.m) && x.m >= 0 && x.m < 1440 && x.m % SLOT === 0 && nItem(x) ? { ...nItem(x), m: x.m } : null).map(({ id, ...r }) => r) } : null) : D.templates,
    days: {},
    backlog: keep(o.backlog, x => { const y = nItem(x); return y ? { ...y, from: typeof x.from === 'string' ? x.from : '' } : null; }),
    legacy: o.legacy && typeof o.legacy === 'object' && !Array.isArray(o.legacy) ? o.legacy : {},
    lastExport: Number.isFinite(o.lastExport) ? o.lastExport : null
  };
  if (!n.capLog.length) n.capLog = [{ d: '0000-00-00', v: settings.cap }];
  for (const [k, dy] of Object.entries(o.days && typeof o.days === 'object' ? o.days : {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !dy || !Array.isArray(dy.b)) { bad++; continue; }
    const fat = [1, 2, 3, 4, 5].includes(dy.fat) ? dy.fat : null;
    n.days[k] = { ds: [0, 60, 120, 180, 240, 300, 360].includes(dy.ds) ? dy.ds : settings.ds, b: blocks(dy.b), snap: Array.isArray(dy.snap) ? blocks(dy.snap) : null,
      val: dy.val && Array.isArray(dy.snap) ? dy.val : null, clo: dy.clo && fat ? dy.clo : null, fat, bt: Number.isFinite(dy.bt) ? dy.bt : null, nc: dy.nc ? 1 : null };
  }
  return [n, bad];
}

/* Repères de l'échelle d'énergie (le niveau 1 est la tâche étalon, réglée à part) */
const DEF_ANCHORS = { '-1': '', '0': '', '0.5': '', '2': "Appel de 20 min à un organisme officiel (exemple de l'auteur)", '3': '' };
function defaults() {
  const cat = [
    ['Sommeil', 'obligatoire', 0, 24, 'aucune', 1],
    ['Sieste', 'soi', -1, 1, 'aucune', 0],
    ['Méditation', 'soi', -1, 1, 'aucune', 0],
    ['Tâche étalon', 'obligatoire', 1, 1, 'aucune', 0],
    ['Préparation, petit-déjeuner', 'obligatoire', 0.5, 3, 'aucune', 0],
    ['Trajet', 'obligatoire', 0.5, 2, 'aucune', 0],
    ['Repas', 'obligatoire', 0, 3, 'aucune', 0],
    ['Travail standard', 'pro', 1, 6, 'standard', 0],
    ['Réunion', 'pro', 2, 3, 'standard', 0],
    ['Travail exigeant', 'pro', 3, 6, 'creative', 0],
    ['Temps enfant', 'perso', 1, 3, 'aucune', 0],
    ['Loisir', 'perso', 0.5, 3, 'aucune', 0],
    ['Sport', 'soi', 2, 3, 'physique', 0],
    ['Lecture, apprentissage', 'soi', 1, 3, 'apprentissage', 0],
    ['Écran sans but', 'nontemps', 0.5, 1, 'aucune', 0]
  ].map(([n, c, i, d, t, z]) => ({ id: uid(), n, c, i, d, t, z }));
  const C = n => cat.find(x => x.n === n);
  const T = [['00:00', '06:20', 'Sommeil'], ['06:20', '07:20', 'Préparation, petit-déjeuner'], ['07:20', '08:00', 'Trajet'],
    ['08:00', '12:00', 'Travail standard'], ['12:00', '13:00', 'Repas'], ['13:00', '16:40', 'Travail standard'],
    ['16:40', '17:20', 'Trajet'], ['17:20', '19:20', 'Temps enfant'], ['19:20', '20:20', 'Repas'], ['21:40', '24:00', 'Sommeil']];
  const tpl = { id: uid(), n: 'Exemple semaine (à adapter)', wd: [0, 1, 2, 3, 4], b: T.map(([a, z, n]) => { const c = C(n); return { m: tm(a), d: (((tm(z) - tm(a)) + 1440) % 1440) / SLOT, n: c.n, c: c.c, i: c.i, t: c.t, z: c.z }; }) };
  return { v: 1, settings: { cap: 33, ds: 0, etalon: '', anchors: { ...DEF_ANCHORS }, nt: 60, first: true }, capLog: [{ d: '0000-00-00', v: 33 }],
    catalog: cat, templates: [tpl], days: {}, backlog: [], legacy: {}, lastExport: null };
}
function nowRel(ds) { const n = new Date(); const m = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; return ((m - ds) + 1440) % 1440; }
const sortB = d => d.b.sort((a, b) => a.s - b.s);
function gaps(b) {
  const g = []; let c = 0;
  for (const x of [...b].sort((a, z) => a.s - z.s)) { if (x.s > c) g.push({ s: c, e: x.s }); c = Math.max(c, x.e); }
  if (c < NS) g.push({ s: c, e: NS });
  return g;
}
const gapSlots = b => gaps(b).reduce((a, g) => a + g.e - g.s, 0);
function energy(b, upto = NS) { let t = 0; for (const x of b) { const e = Math.min(x.e, upto); if (e > x.s) t += (e - x.s) * x.i; } return t; }
function slotMap(b) { const a = new Array(NS).fill(null); for (const x of b) for (let k = x.s; k < x.e; k++) a[k] = x; return a; }
function status(d) { return !d || !d.b.length && !d.val ? 'vide' : d.clo ? 'clos' : d.val ? 'valide' : 'brouillon'; }
function conformity(d) {
  if (!d || !d.snap) return null;
  const sm = slotMap(d.snap), rm = slotMap(d.b); let same = 0;
  for (let k = 0; k < NS; k++) { const a = sm[k], b = rm[k]; if ((!a && !b) || (a && b && a.c === b.c && a.i === b.i)) same++; }
  return same / NS;
}
function blockDiff(d, x) {
  if (!d || !d.snap) return false;
  const sm = slotMap(d.snap);
  for (let k = x.s; k < x.e; k++) { const a = sm[k]; if (!a || a.c !== x.c || a.i !== x.i) return true; }
  return false;
}

/* Peinture : le bloc x occupe [x.s, x.e) ; ce qu'il recouvre est raccourci ou découpé */
function paint(d, x) {
  const out = [];
  for (const z of d.b) {
    if (z.id === x.id) continue;
    if (z.e <= x.s || z.s >= x.e) { out.push(z); continue; }
    if (z.s < x.s) out.push({ ...z, e: x.s });
    if (z.e > x.e) out.push({ ...z, id: z.s < x.s ? uid() : z.id, s: x.e });
  }
  out.push(x); d.b = out; sortB(d);
}
/* Fusion des blocs contigus identiques (après application d'un modèle) */
function mergeAdj(d) {
  sortB(d); const out = [];
  for (const x of d.b) { const p = out[out.length - 1]; if (p && p.e === x.s && p.n === x.n && p.c === x.c && p.i === x.i && p.t === x.t && p.z === x.z) p.e = x.e; else out.push({ ...x }); }
  d.b = out;
}
/* Blocs d'un modèle pour une journée commençant à ds ; un bloc qui dépasse la fin repart au début */
function tplBlocks(t, ds) {
  const out = [];
  for (const x of t.b) {
    const s = ((((x.m - ds) % 1440) + 1440) % 1440) / SLOT; if (!Number.isInteger(s)) continue;
    const base = { n: x.n, c: x.c, i: x.i, t: x.t, z: x.z }, e = s + x.d;
    out.push({ ...base, id: uid(), s, e: Math.min(NS, e) });
    if (e > NS) out.push({ ...base, id: uid(), s: 0, e: Math.min(s, e - NS) });
  }
  return out;
}

/* Export pour les tests unitaires sous Node (ignoré dans le navigateur) */
if (typeof module === 'object' && module.exports) module.exports = { SLEEP, morningRun, eveningStart, nightOf, setNight, PK, DEF_ANCHORS, packBlocks, sameBlocks, pack, unpackBlocks, unpack, mean, sd, pearson, ranks, spearman, rCrit, planBias, natureChange, sleepBefore, APP_VERSION, SCHEMA, SLOT, NS, PX, KEY, IT_KEY, CATS, CAT_ORDER, LEVELS, PAUSES, FATIGUE, pad, uid, esc, clamp, ymd, keyToDate, addDays, clock, slotClock, tm, fmtE, fmtH, dur, fmtSec, WD, tint, fmtDay, cap1, levelOf, costStr, median, migrate, LV, okLvl, nBlock, nItem, normalize, defaults, nowRel, sortB, gaps, gapSlots, energy, slotMap, status, conformity, blockDiff, paint, mergeAdj, tplBlocks };
