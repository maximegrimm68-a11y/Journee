'use strict';
/* Journée — application : stockage, interface et actions. Charge model.js avant ce fichier. */
/* ---------- utilitaires ---------- */
const $ = s => document.querySelector(s);

/* ---------- stockage ---------- */
const QUOTA = 5e6;            // ≈ 5 millions de caractères par origine (mesuré sur Chrome)
let STORAGE_OK = true, READONLY = null, LOAD_NOTE = '', USED = 0, MIGRATED = null, REV = 0, RELOADS = 0;
const REV_KEY = KEY + '.rev';   // compteur d'écritures partagé entre les fenêtres ouvertes
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { STORAGE_OK = false; return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
/* Lecture : ne jamais écraser ce qu'on ne comprend pas.
   - format plus récent que SCHEMA  → lecture seule, rien n'est réécrit
   - contenu illisible              → copie de côté (clé .illisible.<date>), départ sur une base neuve */
function readDB() {
  REV = Number(lsGet(REV_KEY)) || 0;
  const raw = lsGet(KEY); if (!raw) return null; USED = raw.length;
  let o = null; try { o = JSON.parse(raw); } catch (e) { }
  if (!o || typeof o !== 'object' || !Number.isInteger(o.v)) {
    lsSet(KEY + '.illisible.' + Date.now(), raw);
    LOAD_NOTE = 'Données illisibles mises de côté (copie conservée sur le téléphone). Restaure ta dernière sauvegarde.';
    return null;
  }
  if (o.v > SCHEMA) { READONLY = o.v; return o; }
  if (o.v < SCHEMA) { lsSet(KEY + '.v' + o.v + '.avant-migration', raw); MIGRATED = { from: o.v, size: raw.length }; }
  return o;
}
function save() {
  if (READONLY) return false;
  const disk = Number(lsGet(REV_KEY)) || 0;
  if (disk !== REV) { reloadFromDisk('Données modifiées dans une autre fenêtre : rechargées. Ta dernière action n’a pas été enregistrée, refais-la.'); return false; }
  const txt = JSON.stringify(pack(DB));
  if (lsSet(KEY, txt)) { REV = disk + 1; lsSet(REV_KEY, String(REV)); STORAGE_OK = true; USED = txt.length; return true; }
  STORAGE_OK = false; toast('Échec d’enregistrement : exporte tes données'); return false;
}

let DB = readDB();
if (READONLY) { /* format plus récent : on n'y touche pas */ }
else if (!DB) DB = defaults();
else {
  const [n, bad] = normalize(migrate(DB));
  if (bad) { lsSet(KEY + '.avant-reparation.' + Date.now(), lsGet(KEY) || ''); LOAD_NOTE = `${bad} élément(s) invalide(s) écarté(s) au chargement (copie d'origine conservée).`; }
  DB = n;
  if (MIGRATED && save()) LOAD_NOTE = `Données converties au format compact v${SCHEMA} : ${(MIGRATED.size / 1e3).toFixed(0)} k → ${(USED / 1e3).toFixed(0)} k caractères. Une copie de l'ancien format reste sur le téléphone (Réglages → Données).`;
}

/* Recharge depuis le stockage (autre fenêtre) ; ferme l'édition en cours et oublie l'annulation */
function reloadFromDisk(msg) {
  const o = readDB(); RELOADS++;
  if (!READONLY && o) DB = normalize(migrate(o))[0];
  UNDO = null; const u = document.querySelector('#undo'); if (u) u.classList.remove('on');
  if (document.querySelector('#sh.on')) A.closeSheet();
  render(); if (msg) toast(msg);
}

/* ---------- modèle ---------- */
function todayKey() { const n = new Date(); return ymd(new Date(n.getTime() - DB.settings.ds * 60000)); }
function day(k, create) {
  let d = DB.days[k];
  if (!d && create) d = DB.days[k] = { ds: DB.settings.ds, b: [], snap: null, val: null, clo: null, fat: null };
  return d || null;
}
function anchorOf(v) { return v === 1 ? DB.settings.etalon : DB.settings.anchors[String(v)] || ''; }
function backupKeys() { try { return Object.keys(localStorage).filter(k => k.startsWith(KEY + '.') && k !== REV_KEY); } catch (e) { return []; } }
function capAt(k) { let v = DB.settings.cap; const L = [...DB.capLog].sort((a, b) => a.d < b.d ? -1 : 1); for (const c of L) if (c.d <= k) v = c.v; return v; }
function tplFor(k) { const wd = (keyToDate(k).getDay() + 6) % 7; return DB.templates.find(t => (t.wd || []).includes(wd)) || null; }

/* ---------- annulation (10 s) ---------- */
let UNDO = null;
function undoable(label, fn) {
  const before = JSON.stringify(DB), r0 = RELOADS; fn();
  if (RELOADS !== r0) return;          // conflit avec une autre fenêtre : rien à annuler
  UNDO = before; const e = $('#undo');
  e.innerHTML = `<span>${esc(label)}</span><button onclick="A.undo()">Annuler</button>`; e.classList.add('on');
  clearTimeout(undoable._t); undoable._t = setTimeout(() => { e.classList.remove('on'); UNDO = null; }, 10000);
}

/* ---------- interface : état ---------- */
const UI = { tab: 'maintenant', dk: null, sMode: 'semaine', sA: null, ed: null, ce: null, txt: '', scroll: true };

function render() {
  const t = UI.tab;
  if (READONLY) {
    $('#title').textContent = 'Journée';
    $('#view').innerHTML = `<div class="alert"><b>Lecture seule</b><p class="mt">Les données ont été enregistrées par une version plus récente de Journée (format v${READONLY}). Cette version (${APP_VERSION}) ne les modifie pas.</p>
      <div class="row mt wrap"><button class="btn pri" onclick="location.reload()">Recharger</button><button class="btn" onclick="A.exportRaw()">Exporter les données</button></div></div>`;
    return;
  }
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('#title').textContent = { maintenant: 'Maintenant', journee: 'Journée', stats: 'Statistiques', reglages: 'Réglages' }[t];
  $('#hsub').textContent = fmtDay(todayKey());
  let html;
  try { html = alerts() + (t === 'maintenant' ? vNow() : t === 'journee' ? vDay() : t === 'stats' ? vStats() : vSet()); }
  catch (e) {
    html = `<div class="alert"><b>Erreur d'affichage</b><p class="small mt">${esc(e.message)}</p><p class="small mu mt">Tes données ne sont pas modifiées.</p><button class="btn mt" onclick="A.exportRaw()">Exporter les données</button></div>`;
  }
  $('#view').innerHTML = html;
  if (t === 'journee' && UI.scroll) { UI.scroll = false; scrollToNow(); }
}
/* Alertes visibles sur tous les écrans */
function alerts() {
  let h = '';
  if (UI.update) h += `<div class="alert info row sp"><span><b>Nouvelle version installée</b></span><button class="btn sm pri" onclick="location.reload()">Recharger</button></div>`;
  if (!STORAGE_OK) h += `<div class="alert"><b>Enregistrement impossible.</b> Les modifications seront perdues à la fermeture. <button class="btn sm mt" onclick="A.exportJSON()">Exporter maintenant</button></div>`;
  else if (USED > QUOTA * .8) h += `<div class="alert"><b>Stockage à ${Math.round(USED / QUOTA * 100)} %.</b> Exporte une sauvegarde ; au-delà de 100 %, plus rien ne s'enregistre.</div>`;
  if (LOAD_NOTE) h += `<div class="alert info row sp"><span class="small">${esc(LOAD_NOTE)}</span><button class="btn sm" onclick="A.noteOk()">OK</button></div>`;
  return h;
}
function scrollToNow() {
  const n = document.querySelector('#tl .now');
  if (n) window.scrollTo(0, Math.max(0, n.getBoundingClientRect().top + window.scrollY - 260));
}

/* ---------- vues ---------- */
function battery(rem, cap) {
  const cols = cap > 45 ? 4 : 3, f = clamp(Math.floor(rem + 1e-9), 0, cap), r = rem / cap;
  const cls = rem < 0 || r < .2 ? 'bad' : r < .5 ? 'warn' : 'ok';
  let h = `<div class="bat ${cls}" style="grid-template-columns:repeat(${cols},1fr)">`;
  const n = Math.ceil(cap / cols) * cols;
  for (let i = 0; i < n; i++) { const idx = n - 1 - i; h += `<div class="cell${idx < f ? ' f' : ''}"${idx >= cap ? ' style="visibility:hidden"' : ''}></div>`; }
  return h + '</div>';
}
function gauge(val, cap, mark) {
  const p = clamp(val / cap, 0, 1) * 100, col = val > cap ? 'var(--bad)' : val > cap * .9 ? 'var(--warn)' : 'var(--ok)';
  return `<div class="gauge"><i style="width:${p}%;background:${col}"></i>${mark != null ? `<b style="left:calc(${clamp(mark / cap, 0, 1) * 100}% - 1px)"></b>` : ''}</div>`;
}
function catChip(c) { return `<span class="chip" style="background:${CATS[c].color}">${CATS[c].code}</span>`; }

function openDays(before) { return Object.keys(DB.days).filter(x => x < before && DB.days[x].b.length && !DB.days[x].clo).sort(); }
function banners(k) {
  let h = '';
  const open = openDays(k);
  if (open.length) h += `<div class="card warn"><div class="row sp"><b>${open.length} journée${open.length > 1 ? 's' : ''} à clôturer</b><span class="xs mu">hors stats tant que non clôturée${open.length > 1 ? 's' : ''}</span></div>
    <div class="row wrap mt">${open.slice(-6).reverse().map(x => `<button class="btn sm" onclick="A.goBilan('${x}')">${fmtDay(x)}</button>`).join('')}${open.length > 6 ? `<span class="xs mu">+ ${open.length - 6} plus ancienne(s)</span>` : ''}</div></div>`;
  const nd = Object.keys(DB.days).length;
  if (nd) {
    const age = DB.lastExport ? Math.floor((Date.now() - DB.lastExport) / 864e5) : null;
    if (age === null || age >= 7) h += `<div class="card warn row sp"><div><b>Sauvegarde</b><div class="small mu">${age === null ? 'Jamais exportée' : `Dernier export il y a ${age} j`}</div></div><button class="btn sm" onclick="A.exportJSON()">Exporter</button></div>`;
  }
  return h;
}

function vNow() {
  const k = todayKey(), d = day(k), cap = capAt(k);
  let h = banners(k);
  if (DB.settings.first) h += `<div class="card"><h2>Démarrage</h2><ol class="steps small">
    <li><b>Réglages</b> : écris ta tâche étalon (20 min neutres, peu exigeantes = 1 créneau d'énergie) et affecte tes modèles aux jours de la semaine.</li>
    <li><b>Journée</b> : applique le modèle, adapte les blocs, valide le plan.</li>
    <li><b>Le soir</b> : « Bilan et clôture », bloc par bloc, puis ta fatigue.</li></ol>
    <button class="btn sm mt" onclick="A.firstDone()">Compris</button></div>`;
  if (!d || !d.b.length) {
    const t = tplFor(k);
    return h + `<div class="card center">${battery(cap, cap)}<div class="big num c-ok">${cap}</div><div class="mu up mt">capacité du jour</div>
      <p class="small mu mt">Aucun bloc planifié aujourd'hui.</p>
      ${t ? `<button class="btn pri full mt" onclick="A.applyTpl('${k}','${t.id}')">Appliquer « ${esc(t.n)} »</button>` : ''}
      <button class="btn ${t ? '' : 'pri'} full mt" onclick="A.goDay('${k}')">Planifier la journée</button></div>`;
  }
  const nr = nowRel(d.ds), ns = Math.min(NS - 1, Math.floor(nr / SLOT)), frac = (nr - ns * SLOT) / SLOT;
  const sm = slotMap(d.b), cur = sm[ns];
  const used = energy(d.b, ns) + (cur ? cur.i * frac : 0), rem = cap - used, endRem = cap - energy(d.b);
  const col = rem < 0 || rem / cap < .2 ? 'c-bad' : rem / cap < .5 ? 'c-warn' : 'c-ok';
  h += `<div class="card center"><div class="big num ${col}">${fmtE(rem)}</div><div class="mu up mt">créneaux d'énergie restants</div><div class="xs mu">${d.clo ? 'journée clôturée' : 'selon le plan et les écarts saisis'}</div>
    ${battery(rem, cap)}<div class="small mu">Fin de journée prévue : <b class="num" style="color:var(--tx)">${fmtE(endRem)}</b> / ${cap}</div></div>`;
  if (cur) {
    const p = PAUSES[cur.t]; let pz = '';
    if (p && p.every) {
      const el = nr - cur.s * SLOT, nx = cur.s * SLOT + Math.ceil((el + .01) / p.every) * p.every;
      pz = nx < cur.e * SLOT ? `Prochaine pause <b>${clock(d.ds + nx)}</b> · ${p.len} min` : 'Pas d’autre pause dans ce bloc';
    }
    h += `<div class="card"><h2>En cours</h2><div class="row">${catChip(cur.c)}<b style="flex:1">${esc(cur.n || CATS[cur.c].label)}</b><span class="num small">${costStr(cur)}</span></div>
      <div class="small mu mt">${slotClock(cur.s, d.ds)}–${slotClock(cur.e, d.ds)} · niveau ${levelOf(cur.i).label.toLowerCase()}${pz ? ' · ' + pz : ''}</div>
      ${d.clo ? '' : `<span class="lab">Niveau à partir de maintenant</span>${segLevels(cur.i, 'A.quick')}`}
      <div class="row mt"><button class="btn" onclick="A.ecart()" ${d.clo ? 'disabled' : ''}>Écart maintenant</button><button class="btn" onclick="A.goDay('${k}')">Voir la journée</button></div></div>`;
  } else {
    h += `<div class="card"><h2>En cours</h2><p class="small mu">Créneau libre.</p><button class="btn mt" onclick="A.ecart()" ${d.clo ? 'disabled' : ''}>Remplir depuis maintenant</button></div>`;
  }
  const nx = d.b.filter(x => x.s > ns).sort((a, b) => a.s - b.s).slice(0, 4);
  if (nx.length) h += `<div class="card"><h2>Ensuite</h2>${nx.map(x => `<div class="li">${catChip(x.c)}<div class="n"><b>${esc(x.n || CATS[x.c].label)}</b><span class="xs mu num">${slotClock(x.s, d.ds)}–${slotClock(x.e, d.ds)}</span></div><span class="num small">${costStr(x)}</span></div>`).join('')}</div>`;
  return h;
}

function vDay() {
  const k = UI.dk || todayKey(); UI.dk = k;
  const d = day(k), st = status(d), cap = capAt(k), ds = d ? d.ds : DB.settings.ds, b = d ? d.b : [], past = k <= todayKey();
  const lab = { vide: ['Vide', ''], brouillon: ['Brouillon', 'warn'], valide: ['Plan validé', 'ok'], clos: ['Clôturée', ''] }[st];
  let h = `<div class="dnav"><button class="arw" onclick="A.shift(-1)">‹</button><div class="t"><b>${cap1(fmtDay(k, true))}</b><span class="tag ${lab[1]}">${lab[0]}</span>${k === todayKey() ? ' <span class="tag">Aujourd’hui</span>' : ''}</div><button class="arw" onclick="A.shift(1)">›</button></div>`;
  const real = energy(b), plan = d && d.snap ? energy(d.snap) : real, un = gapSlots(b);
  h += `<div class="card">`;
  if (st === 'vide' || st === 'brouillon') {
    h += `<div class="row sp"><span class="small">Énergie planifiée</span><b class="num ${plan > cap ? 'c-bad' : ''}">${fmtE(plan)} / ${cap}</b></div>${gauge(plan, cap)}`;
    if (plan > cap) h += `<p class="small c-bad mt">Dépassement de ${fmtE(plan - cap)} créneaux : reporte, délègue ou allège avant de valider.</p>`;
  } else {
    h += `<div class="row sp"><span class="small">Réel <span class="mu">· plan ${fmtE(plan)}</span></span><b class="num ${real > cap ? 'c-bad' : ''}">${fmtE(real)} / ${cap}</b></div>${gauge(real, cap, plan)}`;
  }
  h += `<div class="small mu mt">Non attribué : <b>${un ? dur(un) : 'aucun'}</b>${d && d.snap ? (() => { const bi = planBias(d); return ` · écart au plan <b class="num">${bi > 0 ? '+' : ''}${fmtE(bi)}</b> créneau${Math.abs(bi) > 1 ? 'x' : ''}`; })() : ''}</div>`;
  if (st === 'vide' || st === 'brouillon') {
    const t = tplFor(k);
    if (!b.length && t) h += `<button class="btn pri full mt" onclick="A.applyTpl('${k}','${t.id}')">Appliquer « ${esc(t.n)} » · ${WD[(keyToDate(k).getDay() + 6) % 7]}</button>`;
    h += `<div class="grid2 mt"><button class="btn" onclick="A.tplMenu('${k}')">Modèle</button><button class="btn ${b.length ? 'pri' : ''}" onclick="A.validate('${k}')" ${b.length ? '' : 'disabled'}>Valider le plan</button></div>`;
    if (b.length && past) h += `<button class="btn full mt" onclick="A.bilan('${k}')">Bilan et clôture</button>`;
  } else if (st === 'valide') {
    h += `<div class="grid2 mt"><button class="btn" onclick="A.unvalidate('${k}')">Modifier le plan</button>${past ? `<button class="btn pri" onclick="A.bilan('${k}')">Bilan et clôture</button>` : `<button class="btn" disabled>Bilan le jour J</button>`}</div>`;
  } else {
    h += `<div class="row sp mt"><span class="small">Fatigue <b>${d.fat}/5</b> · ${FATIGUE[d.fat - 1].toLowerCase()}${d.bt ? ` · bilan ${fmtSec(d.bt)}` : ''}</span><button class="btn sm" onclick="A.reopen('${k}')">Rouvrir</button></div>`;
  }
  h += `<div class="row wrap mt">${st !== 'clos' ? `<button class="btn sm" onclick="A.insert('${k}')">Ajouter un bloc</button>` : ''}${b.length ? `<button class="btn sm" onclick="A.saveTpl('${k}')">Enregistrer comme modèle</button>` : ''}${st === 'brouillon' ? `<button class="btn sm bad" onclick="A.clearDay('${k}')">Vider</button>` : ''}</div>`;
  h += `</div>`;
  if (st !== 'clos' && DB.backlog.length) {
    h += `<div class="card"><h2>À replacer · ${DB.backlog.length}</h2>${DB.backlog.map(x => `<div class="li tap" onclick="A.placeBacklog('${k}','${x.id}')">${catChip(x.c)}<div class="n"><b>${esc(x.n)}</b><span class="xs mu">${dur(x.d)}${x.from ? ' · reporté du ' + fmtDay(x.from) : ''}</span></div><span class="small mu">Placer</span></div>`).join('')}</div>`;
  }
  if (st !== 'clos' && b.length) h += `<p class="xs mu" style="margin:0 2px 6px">Touche un bloc pour le modifier : l'allonger raccourcit le voisin, le raccourcir allonge le voisin collé.${d && d.snap ? ' Pointillés orange = différent du plan.' : ''}</p>`;
  return h + timeline(k, d, ds, st === 'clos');
}

const rowH = n => Math.max(44, n * 16);
function timeline(k, d, ds, ro) {
  const b = d ? d.b : [], items = [...b.map(x => ({ ...x, blk: 1 })), ...gaps(b)].sort((a, z) => a.s - z.s);
  const nr = k === todayKey() ? nowRel(ds) : null;
  let h = `<div class="ag" id="tl">`;
  for (const it of items) {
    const n = it.e - it.s, H = rowH(n);
    h += `<div class="agr" style="height:${H}px"><div class="agt num">${slotClock(it.s, ds)}</div>`;
    if (it.blk) {
      const c = CATS[it.c];
      h += `<div class="blk${blockDiff(d, it) ? ' diff' : ''}" style="border-left-color:${c.color};background:${tint(c.color)}" ${ro ? '' : `onclick="A.openBlock('${k}','${it.id}')"`}>${catChip(it.c)}<span class="bn">${esc(it.n || c.label)}</span><span class="bt num">${slotClock(it.s, ds)}–${slotClock(it.e, ds)}</span><span class="bc num">${costStr(it)}</span></div>`;
    } else {
      h += `<div class="gap" ${ro ? '' : `onclick="A.fill('${k}',${it.s},${it.e})"`}>Libre · ${dur(n)}<span class="num" style="margin-left:auto">${slotClock(it.s, ds)}–${slotClock(it.e, ds)}</span></div>`;
    }
    if (nr != null && nr >= it.s * SLOT && nr < it.e * SLOT) h += `<div class="now" style="top:${((nr - it.s * SLOT) / (n * SLOT) * H).toFixed(1)}px"></div>`;
    h += `</div>`;
  }
  return h + `<div class="agr" style="height:18px"><div class="agt num">${slotClock(NS, ds)}</div></div></div>`;
}

/* ---------- statistiques ---------- */
function rangeKeys() {
  const a = UI.sA || todayKey();
  if (UI.sMode === 'semaine') { const wd = (keyToDate(a).getDay() + 6) % 7, s = addDays(a, -wd); return [...Array(7)].map((_, i) => addDays(s, i)); }
  const dt = keyToDate(a), n = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  return [...Array(n)].map((_, i) => ymd(new Date(dt.getFullYear(), dt.getMonth(), i + 1)));
}
function dayStats(k) {
  const d = day(k);
  if (d && d.clo) {
    const m = { pro: 0, perso: 0, soi: 0, obligatoire: 0, nontemps: 0 }; let sleep = 0;
    for (const x of d.b) { const mn = (x.e - x.s) * SLOT; if (x.z) sleep += mn; else m[x.c] += mn; }
    return { k, grid: true, m, sleep, e: energy(d.b), cap: capAt(k), bias: planBias(d), nat: natureChange(d), fat: d.fat, bt: d.bt };
  }
  const L = DB.legacy[k];
  if (L) return { k, grid: false, m: { pro: 0, perso: 0, soi: 0, obligatoire: 0, nontemps: 0, ...L }, sleep: 0 };
  return null;
}
function vStats() {
  const keys = rangeKeys(), S = keys.map(dayStats), G = S.filter(x => x && x.grid), Lg = S.filter(x => x && !x.grid), all = S.filter(Boolean);
  const per = cap1(UI.sMode === 'semaine' ? `${fmtDay(keys[0])} – ${fmtDay(keys[keys.length - 1])}` : new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(keyToDate(keys[0])));
  let h = `<div class="seg" style="margin-bottom:10px"><button class="${UI.sMode === 'semaine' ? 'on' : ''}" onclick="A.sMode('semaine')">Semaine</button><button class="${UI.sMode === 'mois' ? 'on' : ''}" onclick="A.sMode('mois')">Mois</button></div>
    <div class="dnav"><button class="arw" onclick="A.sShift(-1)">‹</button><div class="t"><b>${per}</b><span class="xs mu">${G.length} jour(s) clôturé(s)${Lg.length ? ` · ${Lg.length} jour(s) Infinity Time` : ''}${(() => { const u = keys.filter(k => DB.days[k] && DB.days[k].b.length && !DB.days[k].clo).length; return u ? ` · <span class="c-warn">${u} non clôturé(s)</span>` : ''; })()}</span></div><button class="arw" onclick="A.sShift(1)">›</button></div>`;
  const tg = DB.settings.nt;
  if (!all.length) h += `<div class="card"><p class="small mu">Aucune journée clôturée sur la période. Les statistiques ne comptent que les journées clôturées, pour ne mélanger ni plans ni journées incomplètes.</p></div>`;
  else {
  // répartition
  const tot = { pro: 0, perso: 0, soi: 0, obligatoire: 0, nontemps: 0 }; let sleep = 0;
  for (const s of all) { for (const c of CAT_ORDER) tot[c] += s.m[c] || 0; sleep += s.sleep; }
  const awake = CAT_ORDER.reduce((a, c) => a + tot[c], 0) || 1;
  h += `<div class="card"><h2>Temps éveillé</h2><div class="bar">${CAT_ORDER.map(c => `<div style="width:${tot[c] / awake * 100}%;background:${CATS[c].color}"></div>`).join('')}</div>
    <table class="mt">${CAT_ORDER.map(c => `<tr><td>${catChip(c)} ${CATS[c].label}</td><td class="r num">${fmtH(tot[c] / all.length)}/j</td><td class="r num mu" style="width:56px">${Math.round(tot[c] / awake * 100)} %</td></tr>`).join('')}</table>
    ${G.length ? `<div class="xs mu mt">Sommeil moyen : <b>${fmtH(G.reduce((a, s) => a + s.sleep, 0) / G.length)}</b> (hors pourcentages)${Lg.length ? ' · historique Infinity Time : sommeil inclus dans Obligatoire' : ''}</div>` : ''}</div>`;
  // non-temps
  const ntd = tot.nontemps / all.length;
  h += `<div class="card"><h2>Non-temps</h2><div class="row sp"><span class="small">Moyenne par jour</span><b class="num ${ntd > tg ? 'c-bad' : 'c-ok'}">${fmtH(ntd)}</b></div>${gauge(ntd, tg * 2, tg)}
    <div class="xs mu mt">Cible ${fmtH(tg)}/j (repère de l'auteur : 5 à 8 h par semaine) · total ${fmtH(tot.nontemps)}</div></div>`;
  if (G.length) {
    // énergie
    const W = 320, H = 120, n = keys.length, bw = W / n, mx = Math.max(...G.map(s => Math.max(s.e, s.cap)), 1) * 1.1;
    let svg = `<svg viewBox="0 0 ${W} ${H + 16}" style="width:100%;height:auto">`;
    keys.forEach((k, i) => {
      const s = S[i]; const x = i * bw;
      if (s && s.grid) {
        const bh = Math.max(0, s.e) / mx * H, ch = s.cap / mx * H;
        svg += `<rect x="${x + bw * .18}" y="${H - bh}" width="${bw * .64}" height="${bh}" rx="2" fill="${s.e > s.cap ? '#F0605D' : '#34C48E'}"/><line x1="${x + 1}" x2="${x + bw - 1}" y1="${H - ch}" y2="${H - ch}" stroke="#E7EBF3" stroke-width="1.5"/>`;
      }
      if (n <= 7 || (i + 1) % 5 === 0 || i === 0) svg += `<text x="${x + bw / 2}" y="${H + 13}" font-size="10" fill="#8D99B3" text-anchor="middle">${n <= 7 ? fmtDay(k).slice(0, 3) : keyToDate(k).getDate()}</text>`;
    });
    svg += `</svg>`;
    const em = G.reduce((a, s) => a + s.e, 0) / G.length, over = G.filter(s => s.e > s.cap).length;
    h += `<div class="card"><h2>Énergie consommée</h2>${svg}<div class="xs mu">Barre = consommé · trait = capacité</div>
      <table class="mt"><tr><td>Moyenne par jour</td><td class="r num"><b>${fmtE(em)}</b></td></tr><tr><td>Jours au-dessus de la capacité</td><td class="r num"><b class="${over ? 'c-bad' : ''}">${over} / ${G.length}</b></td></tr></table></div>`;
    // plan vs réel : biais de planification
    const V = G.filter(s => s.bias != null), bias = V.map(s => s.bias), mb = mean(bias), sb = sd(bias);
    const bt = G.map(s => s.bt).filter(Number.isFinite), mbt = median(bt);
    h += `<div class="card"><h2>Plan / réel</h2><table>
      <tr><td>Jours avec plan validé</td><td class="r num">${V.length} / ${G.length}</td></tr>
      <tr><td>Biais d'énergie (réel − plan)</td><td class="r num"><b class="${mb > 0 ? 'c-warn' : ''}">${mb == null ? '—' : (mb > 0 ? '+' : '') + fmtE(mb)}</b>${sb != null ? ` <span class="mu">± ${fmtE(sb)}</span>` : ''}</td></tr>
      <tr><td>Jours où le réel dépasse le plan</td><td class="r num">${V.length ? Math.round(V.filter(s => s.bias > 0).length / V.length * 100) + ' %' : '—'}</td></tr>
      <tr><td>Temps changé de nature</td><td class="r num">${V.length ? fmtH(mean(V.map(s => s.nat))) + '/j' : '—'}</td></tr>
      <tr><td>Fatigue moyenne</td><td class="r num">${fmtE(G.reduce((a, s) => a + s.fat, 0) / G.length)} / 5</td></tr>
      <tr><td>Durée du bilan, médiane <span class="mu">(cible 3 min)</span></td><td class="r num"><b class="${mbt != null && mbt > 180 ? 'c-warn' : ''}">${mbt == null ? '—' : fmtSec(Math.round(mbt))}</b> <span class="mu">· ${bt.length}</span></td></tr></table>
      ${mb != null && V.length >= 5 ? `<p class="xs mu mt">${mb > 0 ? `Tu sous-estimes tes journées de ${fmtE(mb)} créneau(x) en moyenne : planifie d'autant moins.` : mb < 0 ? `Tes journées coûtent en moyenne ${fmtE(-mb)} créneau(x) de moins que prévu.` : 'Plan et réel concordent en moyenne.'}</p>` : ''}</div>`;
  }
  }
  // calibrage et fiabilité : indépendants de la période affichée
  h += `<p class="xs mu" style="margin:4px 2px 8px">Les deux cartes suivantes portent sur les derniers jours, quelle que soit la période choisie.</p>`;
  const t = todayKey(), last = [...Array(28)].map((_, i) => addDays(t, -i)).map(dayStats).filter(s => s && s.grid && s.fat === 3);
  const med = median(last.map(s => s.e)), cap = DB.settings.cap;
  // fiabilité de la cotation : 90 derniers jours clôturés, corrélations de rang
  const D90 = [...Array(90)].map((_, i) => addDays(t, -i)).map(k => ({ k, s: dayStats(k) })).filter(o => o.s && o.s.grid);
  const rFE = spearman(D90.map(o => o.s.e), D90.map(o => o.s.fat)), nFE = D90.length;
  const SL = D90.map(o => ({ n: sleepBefore(DB.days, o.k), f: o.s.fat })).filter(o => o.n != null);
  const rSF = spearman(SL.map(o => o.n), SL.map(o => o.f)), nSF = SL.length;
  const verdict = (r, n, sign) => {
    if (n < 30) return `<span class="mu">${n} / 30 jours</span>`;
    if (r == null) return '<span class="mu">pas de variation</span>';
    const rc = rCrit(n), ok = Math.abs(r) >= rc;
    return ok && Math.sign(r) === sign ? '<span class="c-ok">lien démontré</span>' : ok ? '<span class="c-warn">sens inattendu</span>' : '<span class="c-warn">non démontré</span>';
  };
  const fr = r => r == null ? '—' : (r < 0 ? '−' : '') + Math.abs(r).toFixed(2).replace('.', ',');
  h += `<div class="card"><h2>Fiabilité de la cotation</h2><p class="xs mu" style="margin-bottom:6px">90 derniers jours clôturés · corrélation de rang de Spearman · seuil 5 %</p><table>
    <tr><td>Énergie consommée ↔ fatigue</td><td class="r num">r = ${fr(rFE)} · n = ${nFE}</td></tr><tr><td colspan="2" class="r small" style="border-top:0;padding-top:0">${verdict(rFE, nFE, 1)}</td></tr>
    <tr><td>Sommeil de la nuit ↔ fatigue du jour</td><td class="r num">r = ${fr(rSF)} · n = ${nSF}</td></tr><tr><td colspan="2" class="r small" style="border-top:0;padding-top:0">${verdict(rSF, nSF, -1)}</td></tr></table>
    ${nFE >= 30 ? `<p class="xs mu mt">Seuil de signification pour n = ${nFE} : |r| ≥ ${rCrit(nFE).toFixed(2).replace('.', ',')}.</p>` : `<p class="xs mu mt">Verdict à partir de 30 journées clôturées.</p>`}
    ${nFE >= 30 && rFE != null && !(rFE >= rCrit(nFE)) ? `<p class="small c-warn mt">La cotation ne suit pas ta fatigue : revois les niveaux du catalogue avec l'échelle d'énergie (Réglages) avant de recaler la capacité.</p>` : ''}</div>`;
  h += `<div class="card"><h2>Calibrage de la capacité</h2><p class="small">Jours « fatigue normale » (3/5) sur 28 jours : <b>${last.length}</b> · médiane consommée : <b>${med == null ? '—' : fmtE(med)}</b></p>
    ${last.length >= 5 ? `<div class="row sp mt"><span class="small">Capacité actuelle ${cap} → proposée <b>${Math.round(med)}</b></span>${Math.round(med) !== cap ? `<button class="btn sm pri" onclick="A.applyCap(${Math.round(med)})">Appliquer</button>` : '<span class="tag ok">Calée</span>'}</div>` : `<p class="xs mu mt">Il faut au moins 5 jours notés 3/5 pour proposer une valeur.</p>`}</div>`;
  if (UI.sMode === 'mois') {
    const off = (keyToDate(keys[0]).getDay() + 6) % 7;
    h += `<div class="card"><h2>Calendrier</h2><div class="cal">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<div class="mu">${x}</div>`).join('')}${'<div></div>'.repeat(off)}${keys.map((k, i) => {
      const s = S[i]; let bg = '#1B2440', fg = 'var(--mu)';
      if (s) { fg = '#0B1020'; bg = (s.m.nontemps || 0) > tg ? '#F0605D' : s.grid && s.e > s.cap ? '#E8A93F' : '#34C48E'; }
      return `<div style="background:${bg};color:${fg}">${keyToDate(k).getDate()}</div>`;
    }).join('')}</div><div class="xs mu mt">Rouge : non-temps au-dessus de la cible · orange : énergie au-dessus de la capacité · vert : les deux tenus</div></div>`;
  }
  return h;
}

/* ---------- réglages ---------- */
function vSet() {
  const s = DB.settings, used = (() => { try { return (localStorage.getItem(KEY) || '').length; } catch (e) { return 0; } })();
  let h = `<div class="card"><h2>Paramètres</h2>
    <div class="row sp"><div><b>Capacité</b><div class="xs mu">${(() => { const t = todayKey(), f = DB.capLog.filter(c => c.d > t).sort((a, b) => a.d < b.d ? -1 : 1)[0]; return f ? `${capAt(t)} aujourd'hui · ${f.v} à partir du ${fmtDay(f.d)}` : "créneaux d'énergie par jour"; })()}</div></div><div class="stp"><button onclick="A.setCap(-1)">−</button><span class="v num">${s.cap}</span><button onclick="A.setCap(1)">+</button></div></div>
    <div class="row sp mt"><div><b>Cible non-temps</b><div class="xs mu">par jour</div></div><div class="stp"><button onclick="A.setNt(-10)">−</button><span class="v num">${fmtH(s.nt)}</span><button onclick="A.setNt(10)">+</button></div></div>
    <div class="row sp mt"><div><b>Bascule de journée</b><div class="xs mu">s'applique aux nouvelles journées</div></div><select style="width:110px" onchange="A.setDs(this.value)">${[0, 1, 2, 3, 4, 5, 6].map(x => `<option value="${x * 60}"${s.ds === x * 60 ? ' selected' : ''}>${pad(x)}:00</option>`).join('')}</select></div>
</div>`;
  h += `<div class="card"><h2>Échelle d'énergie</h2><p class="xs mu">Un exemple réel par niveau, pour coter de la même façon d'une semaine à l'autre. Le niveau 1 est la tâche étalon : 20 min neutres et peu exigeantes.</p>
    ${LEVELS.map(l => `<div class="row mt"><span class="chip" style="background:var(--s2);color:var(--tx);min-width:44px;min-height:44px">${l.code}</span><input type="text" value="${esc(l.v === 1 ? s.etalon : s.anchors[String(l.v)] || '')}" placeholder="${l.label} : exemple réel" onchange="A.setAnchor(${l.v}, this.value)"></div>`).join('')}</div>`;
  h += `<div class="card"><div class="row sp"><h2 style="margin:0">Catalogue</h2><button class="btn sm" onclick="A.catEdit(null)">Ajouter</button></div><div class="mt">${CAT_ORDER.map(c => DB.catalog.filter(x => x.c === c).map(x => `<div class="li tap" onclick="A.catEdit('${x.id}')">${catChip(x.c)}<div class="n"><b>${esc(x.n)}</b><span class="xs mu">${dur(x.d)} · niveau ${levelOf(x.i).code}${x.z ? ' · sommeil' : ''}${x.t !== 'aucune' ? ' · pauses ' + PAUSES[x.t].label.split(' ·')[0].toLowerCase() : ''}</span></div><span class="num small">${costStr({ s: 0, e: x.d, i: x.i })}</span></div>`).join('')).join('')}</div></div>`;
  h += `<div class="card"><h2>Modèles de journée</h2><p class="xs mu" style="margin-bottom:6px">Jours où le modèle est proposé automatiquement (un jour = un seul modèle).</p>${DB.templates.length ? DB.templates.map(t => `<div class="li wrap"><div class="n"><b>${esc(t.n)}</b><span class="xs mu">${t.b.length} blocs · ${fmtE(t.b.reduce((a, x) => a + x.d * x.i, 0))} créneaux d'énergie</span></div><button class="btn sm bad" onclick="A.delTpl('${t.id}')">Supprimer</button>
    <div class="wdrow">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, w) => `<button class="wd${(t.wd || []).includes(w) ? ' on' : ''}" onclick="A.tplWd('${t.id}',${w})" aria-label="${WD[w]}">${l}</button>`).join('')}</div></div>`).join('') : '<p class="small mu">Aucun. Crée-en un depuis une journée : « Enregistrer comme modèle ».</p>'}</div>`;
  h += `<div class="card"><h2>Données</h2>
    <div class="grid2"><button class="btn" onclick="A.exportJSON()">Sauvegarde JSON</button><button class="btn" onclick="A.exportCSV()">Export CSV</button>
    <label class="btn center" style="display:block">Restaurer<input type="file" accept=".json,.txt,application/json,text/plain" style="display:none" onchange="A.importFile(this)"></label><button class="btn" onclick="A.importIT()">Importer Infinity Time</button></div>
    <div class="xs mu mt">${Object.keys(DB.days).length} journée(s) · ${Object.keys(DB.legacy).length} jour(s) historiques · stockage ${(used / 1e6).toFixed(2)} M car. sur ≈ 5 (${Math.round(used / QUOTA * 100)} %) · dernier export : ${DB.lastExport ? new Date(DB.lastExport).toLocaleDateString('fr-FR') : 'jamais'}</div>
    ${(() => { const ks = backupKeys(), sz = ks.reduce((a, k) => a + (lsGet(k) || '').length, 0); return ks.length ? `<div class="row sp mt"><span class="xs mu">Copies de sécurité : ${ks.length} (${(sz / 1e6).toFixed(2)} M car.)</span><button class="btn sm" onclick="A.purgeCopies()">Supprimer</button></div>` : ''; })()}
    <div class="xs mu">Stockage persistant : ${UI.persist === true ? '<span class="c-ok">accordé</span>' : UI.persist === false ? '<span class="c-warn">non accordé (installer l’app sur l’écran d’accueil aide Chrome à l’accorder)</span>' : 'inconnu'}</div></div>`;
  h += `<div class="card"><h2>Règles appliquées</h2><table class="small">
    <tr><td>Créneau de 20 min, tâche étalon = 1, capacité 33 pour 11 h actives</td><td class="r mu">Livre 2025</td></tr>
    <tr><td>5 natures du temps, grille de pauses</td><td class="r mu">Livre 2019</td></tr>
    <tr><td>Plan au-dessus de la capacité : reporter ou alléger</td><td class="r mu">Livre 2025</td></tr>
    <tr><td>Niveaux 0, ½, 3 et Recharge (−1 par créneau)</td><td class="r c-warn">Hypothèse</td></tr>
    <tr><td>Capacité recalée sur la médiane des jours 3/5</td><td class="r c-warn">Hypothèse</td></tr>
    <tr><td>Cible non-temps 60 min/j</td><td class="r c-warn">Hypothèse</td></tr>
    <tr><td>Bilan cible 3 min</td><td class="r c-warn">Hypothèse</td></tr>
    <tr><td>Fiabilité : corrélation de rang, seuil 5 %, au moins 30 jours</td><td class="r mu">Convention</td></tr>
    <tr><td>Analyse du sommeil : nuits confirmées au bilan uniquement</td><td class="r mu">Règle</td></tr>
    <tr><td>Capacité modifiée : jamais rétroactive sur une journée clôturée</td><td class="r mu">Règle</td></tr></table>
    <div class="row sp mt"><span class="xs mu">Version ${APP_VERSION}</span><button class="btn sm bad" onclick="A.reset()">Tout effacer</button></div></div>`;
  return h;
}

/* ---------- feuilles ---------- */
function sheet(html) { $('#sh').innerHTML = html; $('#sh').classList.add('on'); $('#ov').classList.add('on'); }
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => e.classList.remove('on'), 2200); }
function confirmDlg(txt, ok, fn, bad) { UI.cf = fn; sheet(`<h3>${txt}</h3><div class="grid2 mt2"><button class="btn" onclick="A.closeSheet()">Annuler</button><button class="btn ${bad ? 'bad' : 'pri'}" onclick="A.cfOk()">${ok}</button></div>`); }
function segCats(sel, fn) { return `<div class="seg">${CAT_ORDER.map(c => `<button class="${sel === c ? 'on' : ''}" style="background:${tint(CATS[c].color, sel === c ? .5 : .14)}" onclick="${fn}('${c}')">${CATS[c].code}<small>${CATS[c].label.split(' ')[0]}</small></button>`).join('')}</div>`; }
function segLevels(sel, fn) { return `<div class="seg">${LEVELS.map(l => `<button class="${sel === l.v ? 'on' : ''}" onclick="${fn}(${l.v})">${l.code}<small>${l.label}</small></button>`).join('')}</div>`; }
function selPause(sel, fn) { return `<select onchange="${fn}(this.value)">${Object.entries(PAUSES).map(([k, p]) => `<option value="${k}"${sel === k ? ' selected' : ''}>${p.label}</option>`).join('')}</select>`; }

function anchorHint(v) { const a = anchorOf(v); return `<p class="xs ${a ? 'mu' : 'c-warn'} mt">${a ? `Repère ${levelOf(v).code} : ${esc(a)}` : `Pas de repère pour le niveau ${levelOf(v).code} : ajoute un exemple réel dans Réglages → Échelle d'énergie.`}</p>`; }
/* Liste déroulante d'heures (pas de 20 min) */
function tsel(cur, from, to, fn, fmt) { let o = ''; for (let v = from; v <= to; v++) o += `<option value="${v}"${v === cur ? ' selected' : ''}>${fmt(v)}</option>`; return `<select class="tsel num" onchange="${fn}(Number(this.value))">${o}</select>`; }
function stepper(cur, from, to, fnStep, fnSet, fmt) { return `<div class="stp"><button onclick="${fnStep}(-1)">−</button>${tsel(cur, from, to, fnSet, fmt)}<button onclick="${fnStep}(1)">+</button></div>`; }
function sheetEd() {
  const E = UI.ed, x = E.x, d = day(E.k), ds = d ? d.ds : DB.settings.ds, validated = d && d.val;
  const lbl = z => esc(z.n || CATS[z.c].label);
  const over = d ? d.b.filter(z => z.id !== x.id && z.s < x.e && z.e > x.s && !(E.split && z.id === E.split.id)) : [];
  let follow = '';
  if (!E.isNew && E.o && d) {
    if (x.e < E.o.e) { const nb = d.b.find(z => z.id !== x.id && z.s === E.o.e); if (nb) follow += `« ${lbl(nb)} » commencera à ${slotClock(x.e, ds)}. `; }
    if (x.s > E.o.s) { const pb = d.b.find(z => z.id !== x.id && z.e === E.o.s); if (pb) follow += `« ${lbl(pb)} » finira à ${slotClock(x.s, ds)}. `; }
  }
  sheet(`<h3>${E.split ? 'Écart' : E.isNew ? 'Nouveau bloc' : 'Bloc'} · <span class="num">${slotClock(x.s, ds)}–${slotClock(x.e, ds)}</span> <span class="mu num">(${dur(x.e - x.s)})</span></h3>
    <label class="l">Libellé</label><input type="text" id="edn" value="${esc(x.n)}" placeholder="${CATS[x.c].label}" oninput="UI.ed.x.n=this.value">
    <label class="l">Nature du temps</label>${segCats(x.c, 'A.edC')}
    <label class="l">Énergie par créneau · coût du bloc <span class="num" style="color:var(--tx)">${costStr(x)}</span></label>${segLevels(x.i, 'A.edI')}${anchorHint(x.i)}
    <label class="l">Horaires</label>
    <div class="row sp"><span class="small">Début</span>${stepper(x.s, E.lo, x.e - 1, "A.edMoveS", "A.edSetS", s => slotClock(s, ds))}</div>
    <div class="row sp mt"><span class="small">Fin</span>${stepper(x.e, x.s + 1, E.hi, "A.edMoveE", "A.edSetE", s => slotClock(s, ds))}</div>
    ${over.length ? `<p class="xs c-warn mt">Recouvre : ${over.map(z => `${lbl(z)} ${slotClock(Math.max(z.s, x.s), ds)}–${slotClock(Math.min(z.e, x.e), ds)}`).join(' · ')}. Raccourci ou découpé à l'enregistrement.</p>` : ''}
    ${follow ? `<p class="xs mu mt">${follow}</p>` : ''}
    <label class="l">Pauses</label>${selPause(x.t, 'A.edT')}
    <label class="row small mt"><input type="checkbox" ${x.z ? 'checked' : ''} onchange="UI.ed.x.z=this.checked?1:0"> Sommeil (exclu des pourcentages du temps éveillé)</label>
    ${E.split ? `<p class="xs mu mt">Avant et après l'écart, le bloc « ${esc(E.split.n || CATS[E.split.c].label)} » est conservé. Rien n'est modifié tant que tu n'enregistres pas.</p>` : ''}
    <button class="btn pri full mt2" onclick="A.edSave()">Enregistrer</button>
    ${E.isNew ? '' : `<div class="grid2 mt"><button class="btn" onclick="A.edSplit()" ${x.e - x.s < 2 ? 'disabled' : ''}>Diviser</button><button class="btn" onclick="A.insertIn()">Insérer dedans…</button>
    <button class="btn" onclick="A.edDefer()">${validated ? 'Non fait → reporter' : 'Reporter'}</button><button class="btn" onclick="A.edToCat()">Au catalogue</button></div>
    <button class="btn bad full mt" onclick="A.edDel()">Supprimer</button>`}`);
}
function sheetFill() {
  const F = UI.fk, d = day(F.k), ds = d ? d.ds : DB.settings.ds, room = F.e - F.s;
  const row = (x, fn) => `<div class="li tap" onclick="${fn}">${catChip(x.c)}<div class="n"><b>${esc(x.n)}</b><span class="xs mu">${dur(Math.min(x.d, room))}${x.d > room ? ' (tronqué)' : ''}</span></div><span class="num small">${costStr({ s: 0, e: Math.min(x.d, room), i: x.i })}</span></div>`;
  let h = `<h3>${F.ins ? 'Insérer' : 'Remplir'} · <span class="num">${slotClock(F.s, ds)}–${slotClock(F.e, ds)}</span></h3>`;
  if (F.lo < F.e - 1) h += `<div class="row sp"><span class="small">Début</span>${stepper(F.s, F.lo, F.e - 1, 'A.fkMove', 'A.fkSet', s => slotClock(s, ds))}</div>`;
  if (F.ins) h += `<p class="xs mu mt">Le bloc choisi recouvre ce qui est déjà planifié sur sa durée.</p>`;
  if (DB.backlog.length) h += `<label class="l">À replacer</label>${DB.backlog.map(x => row(x, `A.placeB('${x.id}')`)).join('')}`;
  h += `<label class="l">Catalogue</label>${CAT_ORDER.map(c => DB.catalog.filter(x => x.c === c).map(x => row(x, `A.place('${x.id}')`)).join('')).join('')}
    <button class="btn full mt" onclick="A.custom()">Bloc personnalisé</button>`;
  sheet(h);
}
/* Bilan pas à pas : un élément (bloc ou créneau libre) à la fois, dans l'ordre */
function nightStep() {
  const B = UI.bl, N = B.night, lab = m => m < 0 ? clock(1440 + m) + ' la veille' : clock(m);
  const cLo = (N.hasP ? -720 : 0) / SLOT, cHi = Math.min(240, N.l - SLOT) / SLOT, lLo = Math.max(SLOT, N.c + SLOT) / SLOT;
  sheet(`<div class="night"><div class="row sp"><h3 style="margin:0">Bilan · nuit</h3><span class="xs mu num">${fmtSec(Math.round((Date.now() - B.t0) / 1000))}</span></div>
    <p class="small mu mt">Heures réelles de coucher et de lever : sans elles, l'analyse sommeil ↔ fatigue ne voit que le modèle.</p>
    <div class="row sp mt2"><span class="small">Coucher</span>${stepper(N.c / SLOT, cLo, cHi, 'A.nC', 'A.nCset', v => lab(v * SLOT))}</div>
    <div class="row sp mt"><span class="small">Lever</span>${stepper(N.l / SLOT, lLo, 36, 'A.nL', 'A.nLset', v => clock(v * SLOT))}</div>
    <p class="small mt">Nuit : <b class="num">${fmtH(N.l - N.c)}</b></p>
    <button class="btn pri full mt2" onclick="A.nightOk()">Valider la nuit</button>
    <div class="grid2 mt"><button class="btn" onclick="A.nightSkip()">Passer</button><button class="btn" onclick="A.closeSheet()">Quitter le bilan</button></div></div>`);
}
function bilanStep() {
  const B = UI.bl, d = day(B.k); if (!d) return A.closeSheet();
  if (B.night) return nightStep();
  const items = [...d.b.map(x => ({ ...x, blk: 1 })), ...gaps(d.b)].sort((a, z) => a.s - z.s);
  const idx = items.findIndex(it => it.s >= B.cur);
  if (idx < 0) { const g = gaps(d.b)[0]; if (g) { B.cur = g.s; return bilanStep(); } return A.closeDay(B.k); }
  const it = B.it = items[idx], ds = d.ds;
  let h = `<div class="row sp"><h3 style="margin:0">Bilan · ${idx + 1} / ${items.length}</h3><span class="xs mu num">${fmtSec(Math.round((Date.now() - B.t0) / 1000))}</span></div>
    <div class="gauge" style="margin:10px 0 14px"><i style="width:${Math.round(idx / items.length * 100)}%;background:var(--ac)"></i></div>`;
  if (it.blk) {
    const c = CATS[it.c]; let plan = '';
    if (d.snap) {
      const pl = d.snap.filter(z => z.s < it.e && z.e > it.s);
      plan = blockDiff(d, it) ? `<p class="small c-warn mt">Prévu : ${pl.length ? pl.map(z => `${CATS[z.c].code} ${esc(z.n || CATS[z.c].label)} ${slotClock(Math.max(z.s, it.s), ds)}–${slotClock(Math.min(z.e, it.e), ds)}`).join(' · ') : 'rien'}</p>` : `<p class="small c-ok mt">Identique au plan validé</p>`;
    }
    h += `<div class="blk" style="height:56px;flex:none;border-left-color:${c.color};background:${tint(c.color)};cursor:default">${catChip(it.c)}<span class="bn">${esc(it.n || c.label)}</span><span class="bt num">${slotClock(it.s, ds)}–${slotClock(it.e, ds)}</span><span class="bc num">${costStr(it)}</span></div>${plan}
      <button class="btn pri full mt2" onclick="A.blOk()">Conforme</button>
      <div class="grid2 mt"><button class="btn" onclick="A.blFix()">Corriger</button><button class="btn" onclick="A.blReplace()">Remplacer par…</button>
      <button class="btn" onclick="A.blDefer()">Non fait → reporter</button><button class="btn" onclick="A.blRest()">Tout le reste conforme</button></div>`;
  } else {
    h += `<div class="gap" style="height:56px;flex:none;cursor:default">Libre · ${dur(it.e - it.s)}<span class="num" style="margin-left:auto">${slotClock(it.s, ds)}–${slotClock(it.e, ds)}</span></div>
      <p class="small mu mt">Qu'as-tu fait sur ce créneau ?</p><button class="btn pri full mt" onclick="A.blFill()">Remplir</button>`;
  }
  sheet(h + `<button class="btn full mt" onclick="A.closeSheet()">Quitter le bilan</button>`);
}
/* Après une modification faite depuis une feuille : retour au bilan s'il est en cours */
function done(k, end) {
  if (UI.bl && UI.bl.k === k) { if (end != null) UI.bl.cur = end; render(); bilanStep(); }
  else { A.closeSheet(); render(); }
}
function sheetCat() {
  const x = UI.ce.x;
  sheet(`<h3>${UI.ce.isNew ? 'Nouvelle tâche' : 'Tâche du catalogue'}</h3>
    <label class="l">Libellé</label><input type="text" value="${esc(x.n)}" oninput="UI.ce.x.n=this.value">
    <label class="l">Nature du temps</label>${segCats(x.c, 'A.ceC')}
    <label class="l">Énergie par créneau · coût <span class="num" style="color:var(--tx)">${costStr({ s: 0, e: x.d, i: x.i })}</span></label>${segLevels(x.i, 'A.ceI')}${anchorHint(x.i)}
    <label class="l">Durée par défaut</label><div class="stp"><button onclick="A.ceD(-1)">−</button><span class="v num">${dur(x.d)}</span><button onclick="A.ceD(1)">+</button></div>
    <label class="l">Pauses</label>${selPause(x.t, 'A.ceT')}
    <label class="row small mt"><input type="checkbox" ${x.z ? 'checked' : ''} onchange="UI.ce.x.z=this.checked?1:0"> Sommeil</label>
    <p class="xs mu mt">Modifier une tâche ne change pas les journées déjà saisies : chaque bloc garde sa propre copie.</p>
    <button class="btn pri full mt" onclick="A.ceSave()">Enregistrer</button>${UI.ce.isNew ? '' : `<button class="btn bad full mt" onclick="A.ceDel()">Supprimer du catalogue</button>`}`);
}

/* ---------- export ---------- */
function download(name, text, mime) {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return true; } catch (e) { return false; }
}
/* Partage de fichier (Android : Drive, Gmail…). Chrome n'autorise pas .json au partage : la sauvegarde part en .txt */
function shareFile(name, text, mime) {
  try {
    const f = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [f] }))
      return navigator.share({ files: [f], title: name }).then(() => 'ok', e => e && e.name === 'AbortError' ? 'abort' : 'ko');
  } catch (e) { }
  return Promise.resolve('ko');
}
function exportFile(name, text, mime, noMark, shareName, shareMime) {
  UI.txt = text;
  const mark = () => { if (!READONLY && !noMark) { DB.lastExport = Date.now(); save(); } };
  return shareFile(shareName || name, text, shareMime || mime).then(r => {
    if (r === 'ok') { mark(); render(); toast('Fichier partagé'); return; }
    if (r === 'abort') return;
    download(name, text, mime); mark();
    sheet(`<h3>Export</h3><p class="small mu">Fichier « ${esc(name)} » téléchargé si le navigateur l'autorise. Sinon, copie le contenu ci-dessous et colle-le dans un fichier portant ce nom.</p>
      <textarea id="extxt" rows="8" readonly class="mt">${esc(text.length > 300000 ? text.slice(0, 300000) + '\n…' : text)}</textarea>
      <div class="grid2 mt"><button class="btn" onclick="A.closeSheet()">Fermer</button><button class="btn pri" onclick="A.copy()">Copier</button></div>`);
    render();
  });
}
function csvCell(v) { v = String(v ?? ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

/* ---------- actions ---------- */
const A = {
  tab(t) { UI.tab = t; if (t === 'journee') { UI.scroll = true; } try { history.replaceState(null, '', '#' + t); } catch (e) { location.hash = t; } window.scrollTo(0, 0); render(); },
  goDay(k) { UI.dk = k; A.tab('journee'); },
  goBilan(k) { A.goDay(k); A.bilan(k); },
  shift(n) { UI.dk = addDays(UI.dk || todayKey(), n); UI.scroll = true; render(); },
  firstDone() { DB.settings.first = false; save(); render(); },
  closeSheet() { $('#sh').classList.remove('on'); $('#ov').classList.remove('on'); UI.ed = null; UI.ce = null; UI.bl = null; },
  undo() { if (!UNDO) return; DB = JSON.parse(UNDO); UNDO = null; save(); $('#undo').classList.remove('on'); A.closeSheet(); render(); toast('Action annulée'); },
  noteOk() { LOAD_NOTE = ''; render(); },
  exportRaw() { const n = `${ymd(new Date())} - Journee - Donnees brutes`; exportFile(n + '.json', lsGet(KEY) || JSON.stringify(DB), 'application/json', true, n + '.txt', 'text/plain'); },
  cfOk() { const f = UI.cf; UI.cf = null; A.closeSheet(); f && f(); },
  copy() { const ta = $('#extxt'); const t = UI.txt; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copié')).catch(() => { if (ta) { ta.focus(); ta.select(); } toast('Sélectionné : copie avec le menu du téléphone'); }); },

  /* blocs */
  openBlock(k, id) {
    const d = day(k); if (!d || d.clo) return; const x = d.b.find(z => z.id === id); if (!x) return;
    UI.ed = { k, isNew: false, o: { s: x.s, e: x.e }, x: { ...x }, lo: 0, hi: NS };
    sheetEd();
  },
  insert(k) {
    const d = day(k), ds = d ? d.ds : DB.settings.ds; let s = 0;
    if (k === todayKey()) s = Math.min(NS - 1, Math.floor(nowRel(ds) / SLOT)); else if (d) { const g = gaps(d.b)[0]; s = g ? g.s : 0; }
    A.fill(k, s, NS, 0);
  },
  insertIn() { const E = UI.ed; A.fill(E.k, E.x.s, E.x.e, E.x.s); },
  fill(k, s, e, lo) { UI.fk = { k, s, e, lo: lo == null ? s : lo, ins: lo != null }; sheetFill(); },
  fkMove(n) { const F = UI.fk; F.s = clamp(F.s + n, F.lo, F.e - 1); sheetFill(); },
  place(cid) {
    const F = UI.fk, x = DB.catalog.find(z => z.id === cid), b = { id: uid(), s: F.s, e: Math.min(F.e, F.s + x.d), n: x.n, c: x.c, i: x.i, t: x.t, z: x.z };
    undoable('Bloc ajouté', () => { paint(day(F.k, true), b); save(); }); done(F.k, b.e);
  },
  placeB(bid) {
    const F = UI.fk, x = DB.backlog.find(z => z.id === bid); if (!x) return;
    const b = { id: uid(), s: F.s, e: Math.min(F.e, F.s + x.d), n: x.n, c: x.c, i: x.i, t: x.t, z: x.z };
    undoable('Bloc replacé', () => { paint(day(F.k, true), b); DB.backlog = DB.backlog.filter(z => z.id !== bid); save(); }); done(F.k, b.e);
  },
  placeBacklog(k, bid) {
    const d = day(k, true), x = DB.backlog.find(z => z.id === bid), g = gaps(d.b);
    const t = g.find(z => z.e - z.s >= x.d) || g[0];
    if (!t) return toast('Aucun créneau libre ce jour-là');
    UI.fk = { k, s: t.s, e: t.e, lo: t.s }; A.placeB(bid); toast(`Placé à ${slotClock(t.s, d.ds)}`);
  },
  custom() { const F = UI.fk; UI.ed = { k: F.k, isNew: true, lo: 0, hi: NS, x: { id: uid(), s: F.s, e: Math.min(F.e, F.s + 3), n: '', c: 'perso', i: 1, t: 'aucune', z: 0 } }; sheetEd(); },
  edC(c) { UI.ed.x.c = c; sheetEd(); },
  edI(v) { UI.ed.x.i = v; sheetEd(); },
  edT(t) { UI.ed.x.t = t; },
  edMoveS(n) { A.edMove('s', n); }, edMoveE(n) { A.edMove('e', n); },
  edSetS(v) { const x = UI.ed.x; x.s = clamp(v, UI.ed.lo, x.e - 1); sheetEd(); },
  edSetE(v) { const x = UI.ed.x; x.e = clamp(v, x.s + 1, UI.ed.hi); sheetEd(); },
  fkSet(v) { const F = UI.fk; F.s = clamp(v, F.lo, F.e - 1); sheetFill(); },
  edMove(f, n) { const E = UI.ed, x = E.x; if (f === 's') x.s = clamp(x.s + n, E.lo, x.e - 1); else x.e = clamp(x.e + n, x.s + 1, E.hi); sheetEd(); },
  edSave() {
    const E = UI.ed, x = { ...E.x, n: (E.x.n || '').trim() }; delete x.blk;
    undoable(E.split ? 'Écart enregistré' : E.isNew ? 'Bloc ajouté' : 'Bloc modifié', () => {
      const d = day(E.k, true);
      if (!E.isNew && E.o) {
        // bornes partagées : quand un bloc raccourcit, le voisin collé suit la borne
        if (x.e < E.o.e) { const nb = d.b.find(z => z.id !== x.id && z.s === E.o.e); if (nb) nb.s = x.e; }
        if (x.s > E.o.s) { const pb = d.b.find(z => z.id !== x.id && z.e === E.o.s); if (pb) pb.e = x.s; }
      }
      paint(d, x); save();   // quand il s'allonge, il recouvre le voisin
    });
    done(E.k, x.e);
  },
  edSplit() {
    const E = UI.ed, d = day(E.k), x = E.x;
    const m = Math.floor((x.s + x.e) / 2), y = { ...x, id: uid(), s: m };
    undoable('Bloc divisé', () => { const z = d.b.find(q => q.id === E.x.id); Object.assign(z, E.x, { n: (E.x.n || '').trim(), e: m }); d.b.push(y); sortB(d); save(); });
    render(); A.openBlock(E.k, y.id);
  },
  edDefer() {
    const E = UI.ed, d = day(E.k), x = E.x;
    undoable('Reporté dans « À replacer »', () => { DB.backlog.push({ id: uid(), n: x.n || CATS[x.c].label, c: x.c, i: x.i, t: x.t, z: x.z, d: x.e - x.s, from: E.k }); d.b = d.b.filter(z => z.id !== x.id); save(); });
    done(E.k, null);
  },
  edToCat() { const x = UI.ed.x; DB.catalog.push({ id: uid(), n: (x.n || CATS[x.c].label).trim(), c: x.c, i: x.i, d: x.e - x.s, t: x.t, z: x.z }); save(); toast('Ajouté au catalogue'); },
  edDel() { const E = UI.ed, d = day(E.k); undoable('Bloc supprimé', () => { d.b = d.b.filter(z => z.id !== E.x.id); save(); }); done(E.k, null); },
  ecart() {
    const k = todayKey(), d = day(k, true), ns = Math.min(NS - 1, Math.floor(nowRel(d.ds) / SLOT)), cur = slotMap(d.b)[ns];
    UI.dk = k;
    if (cur) {
      // rien n'est modifié avant « Enregistrer » ; l'écart part du créneau en cours, 1 h par défaut
      UI.ed = { k, isNew: true, split: { id: cur.id, n: cur.n, c: cur.c }, lo: 0, hi: NS, x: { ...cur, id: uid(), n: '', s: ns, e: Math.min(cur.e, ns + 3) } };
      sheetEd();
    } else { const g = gaps(d.b).find(z => z.s <= ns && z.e > ns); UI.fk = { k, s: ns, e: g.e, lo: ns }; A.custom(); }
  },
  quick(v) {
    const k = todayKey(), d = day(k); if (!d || d.clo) return;
    const ns = Math.min(NS - 1, Math.floor(nowRel(d.ds) / SLOT)), cur = slotMap(d.b)[ns];
    if (!cur || cur.i === v) return;
    undoable(`Niveau ${levelOf(v).label.toLowerCase()} de ${slotClock(ns, d.ds)} à ${slotClock(cur.e, d.ds)}`, () => { paint(d, { ...cur, id: uid(), s: ns, i: v }); save(); });
    render();
  },

  /* journée */
  tplMenu(k) {
    if (!DB.templates.length) return toast('Aucun modèle : crée-en un depuis une journée');
    sheet(`<h3>Appliquer un modèle</h3>${DB.templates.map(t => `<div class="li tap" onclick="A.applyTpl('${k}','${t.id}')"><div class="n"><b>${esc(t.n)}</b><span class="xs mu">${t.b.length} blocs · ${fmtE(t.b.reduce((a, x) => a + x.d * x.i, 0))} créneaux d'énergie</span></div><span class="small mu">Appliquer</span></div>`).join('')}`);
  },
  applyTpl(k, tid) {
    const go = () => { const t = DB.templates.find(z => z.id === tid), d = day(k, true); d.ds = DB.settings.ds; d.b = []; for (const x of tplBlocks(t, d.ds)) paint(d, x); mergeAdj(d); save(); };
    const run = () => { undoable('Modèle appliqué', go); A.closeSheet(); render(); };
    const d = day(k); if (d && d.b.length) confirmDlg(`Remplacer les ${d.b.length} blocs existants ?`, 'Remplacer', run, true); else run();
  },
  saveTpl(k) { UI.tk = k; sheet(`<h3>Enregistrer comme modèle</h3><input type="text" id="tpn" placeholder="Ex. Semaine bureau"><button class="btn pri full mt" onclick="A.saveTplOk()">Enregistrer</button>`); setTimeout(() => $('#tpn') && $('#tpn').focus(), 200); },
  saveTplOk() {
    const n = ($('#tpn').value || '').trim(); if (!n) return toast('Donne un nom');
    const d = day(UI.tk); DB.templates.push({ id: uid(), n, wd: [], b: d.b.map(x => ({ m: (d.ds + x.s * SLOT) % 1440, d: x.e - x.s, n: x.n, c: x.c, i: x.i, t: x.t, z: x.z })) });
    save(); A.closeSheet(); toast('Modèle enregistré : affecte-lui des jours dans Réglages');
  },
  tplWd(tid, w) {
    const t = DB.templates.find(z => z.id === tid), had = (t.wd || []).includes(w);
    for (const z of DB.templates) z.wd = (z.wd || []).filter(q => q !== w);
    if (!had) t.wd.push(w);
    save(); render();
  },
  delTpl(id) { undoable('Modèle supprimé', () => { DB.templates = DB.templates.filter(t => t.id !== id); save(); }); render(); },
  clearDay(k) { undoable('Journée vidée', () => { delete DB.days[k]; save(); }); render(); },
  validate(k) {
    const d = day(k), cap = capAt(k), p = energy(d.b);
    if (p > cap) return sheet(`<h3>Plan au-dessus de la capacité</h3><p class="small">${fmtE(p)} créneaux planifiés pour ${cap} disponibles : <b class="c-bad">${fmtE(p - cap)} de trop</b>.</p><p class="small mu mt">Touche des blocs pour les reporter, les supprimer (délégués) ou baisser leur niveau, puis valide à nouveau.</p><button class="btn full mt2" onclick="A.closeSheet()">Compris</button>`);
    d.snap = d.b.map(x => ({ ...x })); d.val = Date.now(); save(); render(); toast('Plan validé');
  },
  unvalidate(k) { undoable('Plan repassé en brouillon', () => { const d = day(k); d.snap = null; d.val = null; save(); }); render(); },
  closeDay(k) {
    const d = day(k), un = gapSlots(d.b);
    if (un) return toast(`Attribue d'abord ${dur(un)} non attribué(s)`);
    sheet(`<h3>Clôturer · fatigue ressentie</h3>${FATIGUE.map((f, i) => `<button class="btn full mt" style="text-align:left" onclick="A.closeOk('${k}',${i + 1})"><b>${i + 1}</b> · ${f}</button>`).join('')}<p class="xs mu mt">La note 3 (fatigue normale) sert au calibrage de ta capacité.</p>`);
  },
  closeOk(k, f) {
    const d = day(k); d.fat = f; d.clo = Date.now();
    if (UI.bl && UI.bl.k === k) d.bt = Math.round((Date.now() - UI.bl.t0) / 1000);
    if (!save()) return;
    UI.bl = null; render();
    const msg = d.bt ? `Journée clôturée · bilan en ${fmtSec(d.bt)}` : 'Journée clôturée';
    const nk = addDays(k, 1), nd = day(nk), t = tplFor(nk), empty = !nd || !nd.b.length, nb = DB.backlog.length;
    if (nk <= addDays(todayKey(), 1) && (empty && t || nb)) {
      const what = [empty && t ? `appliquer « ${esc(t.n)} »` : '', nb ? `placer ${nb} tâche${nb > 1 ? 's' : ''} à replacer` : ''].filter(Boolean).join(' et ');
      sheet(`<h3>${msg}</h3><p class="small">Préparer ${fmtDay(nk, true)} : ${what}.</p>
        <button class="btn pri full mt2" onclick="A.prep('${nk}')">Préparer ${fmtDay(nk)}</button>
        <div class="grid2 mt"><button class="btn" onclick="A.closeSheet();A.goDay('${nk}')">Ouvrir sans préparer</button><button class="btn" onclick="A.closeSheet()">Plus tard</button></div>`);
    } else { A.closeSheet(); toast(msg); }
  },
  prep(nk) {
    let placed = 0, left = 0;
    undoable('Lendemain préparé', () => {
      const d = day(nk, true), t = tplFor(nk);
      if (!d.b.length && t) { d.ds = DB.settings.ds; for (const x of tplBlocks(t, d.ds)) paint(d, x); mergeAdj(d); }
      const keep = [];
      for (const x of DB.backlog) {
        const g = gaps(d.b).find(z => z.e - z.s >= x.d);
        if (g) { paint(d, { id: uid(), s: g.s, e: g.s + x.d, n: x.n, c: x.c, i: x.i, t: x.t, z: x.z }); placed++; } else { keep.push(x); left++; }
      }
      DB.backlog = keep; save();
    });
    A.closeSheet(); UI.dk = nk; A.tab('journee');
    toast(`${cap1(fmtDay(nk))} préparé${placed ? ` · ${placed} tâche(s) placée(s)` : ''}${left ? ` · ${left} sans créneau libre` : ''}`);
  },
  reopen(k) { undoable('Journée rouverte', () => { const d = day(k); d.clo = null; save(); }); render(); },

  /* bilan pas à pas */
  bilan(k) {
    const d = day(k); if (!d || !d.b.length) return;
    UI.bl = { k, cur: 0, t0: Date.now() };
    const P = day(addDays(k, -1)), hasP = !!(P && P.b.length);
    if (d.ds === 0 && (!hasP || P.ds === 0)) { const n = nightOf(hasP ? P : null, d); if (n.l != null) UI.bl.night = { c: n.c ?? 0, l: n.l, hasP }; }
    bilanStep();
  },
  nC(n) { const N = UI.bl.night; N.c = clamp(N.c + n * SLOT, N.hasP ? -720 : 0, Math.min(240, N.l - SLOT)); nightStep(); },
  nL(n) { const N = UI.bl.night; N.l = clamp(N.l + n * SLOT, Math.max(SLOT, N.c + SLOT), 720); nightStep(); },
  nCset(v) { const N = UI.bl.night; N.c = clamp(v * SLOT, N.hasP ? -720 : 0, Math.min(240, N.l - SLOT)); nightStep(); },
  nLset(v) { const N = UI.bl.night; N.l = clamp(v * SLOT, Math.max(SLOT, N.c + SLOT), 720); nightStep(); },
  nightOk() {
    const B = UI.bl, N = B.night, d = day(B.k), P = day(addDays(B.k, -1));
    undoable('Nuit enregistrée', () => { setNight(N.hasP ? P : null, d, N.c, N.l); save(); });
    if (!UI.bl) return;                  // rechargé depuis une autre fenêtre
    B.night = null; render(); bilanStep();
  },
  nightSkip() { UI.bl.night = null; bilanStep(); },
  blOk() { if (!UI.bl.it.blk) return; UI.bl.cur = UI.bl.it.e; bilanStep(); },
  blFix() { A.openBlock(UI.bl.k, UI.bl.it.id); },
  blReplace() { const B = UI.bl; A.fill(B.k, B.it.s, B.it.e, B.it.s); },
  blDefer() { const B = UI.bl; UI.ed = { k: B.k, isNew: false, x: { ...B.it } }; A.edDefer(); },
  blFill() { const B = UI.bl; A.fill(B.k, B.it.s, B.it.e); },
  blRest() { const B = UI.bl, g = gaps(day(B.k).b).find(z => z.s >= B.cur); B.cur = g ? g.s : NS; bilanStep(); },

  /* stats */
  sMode(m) { UI.sMode = m; render(); },
  sShift(n) { const a = UI.sA || todayKey(); if (UI.sMode === 'semaine') UI.sA = addDays(a, 7 * n); else { const d = keyToDate(a); UI.sA = ymd(new Date(d.getFullYear(), d.getMonth() + n, 1)); } render(); },
  applyCap(v) { const f = A.setCapTo(v); toast(f === todayKey() ? `Capacité ${v} dès aujourd'hui` : `Capacité ${v} à partir de demain`); },

  /* réglages */
  setCapTo(v) {
    // jamais rétroactif : une journée clôturée garde sa capacité
    v = clamp(v, 6, 150); const t = todayKey(), td = day(t), from = td && td.clo ? addDays(t, 1) : t;
    DB.settings.cap = v; DB.capLog = DB.capLog.filter(c => c.d < from); DB.capLog.push({ d: from, v }); save(); render(); return from;
  },
  setCap(n) { A.setCapTo(DB.settings.cap + n); },
  setNt(n) { DB.settings.nt = clamp(DB.settings.nt + n, 0, 600); save(); render(); },
  setDs(v) { DB.settings.ds = Number(v); save(); render(); toast('Appliqué aux nouvelles journées'); },
  setEtalon(v) { DB.settings.etalon = v.trim(); save(); },
  catEdit(id) { const x = id ? DB.catalog.find(z => z.id === id) : { id: uid(), n: '', c: 'pro', i: 1, d: 3, t: 'aucune', z: 0 }; UI.ce = { isNew: !id, x: { ...x } }; sheetCat(); },
  ceC(c) { UI.ce.x.c = c; sheetCat(); }, ceI(v) { UI.ce.x.i = v; sheetCat(); }, ceT(t) { UI.ce.x.t = t; },
  ceD(n) { UI.ce.x.d = clamp(UI.ce.x.d + n, 1, NS); sheetCat(); },
  ceSave() { const x = { ...UI.ce.x, n: (UI.ce.x.n || '').trim() }; if (!x.n) return toast('Donne un libellé'); if (UI.ce.isNew) DB.catalog.push(x); else DB.catalog[DB.catalog.findIndex(z => z.id === x.id)] = x; save(); A.closeSheet(); render(); },
  ceDel() { const id = UI.ce.x.id; undoable('Tâche supprimée du catalogue', () => { DB.catalog = DB.catalog.filter(z => z.id !== id); save(); }); A.closeSheet(); render(); },
  exportJSON() { const n = `${ymd(new Date())} - Journee - Sauvegarde`; exportFile(n + '.json', JSON.stringify(pack(DB)), 'application/json', false, n + '.txt', 'text/plain'); },
  setAnchor(v, t) { t = String(t || '').trim(); if (v === 1) DB.settings.etalon = t; else DB.settings.anchors[String(v)] = t; save(); },
  purgeCopies() { const ks = backupKeys(); confirmDlg(`Supprimer ${ks.length} copie(s) de sécurité du téléphone ? Tes données actuelles ne sont pas touchées.`, 'Supprimer', () => { for (const k of ks) { try { localStorage.removeItem(k); } catch (e) { } } render(); toast('Copies supprimées'); }, true); },
  exportCSV() {
    const rows = [['date', 'creneau', 'heure', 'plan_nature', 'plan_niveau', 'plan_libelle', 'reel_nature', 'reel_niveau', 'reel_libelle', 'sommeil', 'fatigue', 'statut', 'capacite']];
    for (const k of Object.keys(DB.days).sort()) {
      const d = DB.days[k], pm = d.snap ? slotMap(d.snap) : null, rm = slotMap(d.b), cap = capAt(k);
      for (let s = 0; s < NS; s++) { const p = pm && pm[s], r = rm[s]; rows.push([k, s, slotClock(s, d.ds), p ? p.c : '', p ? String(p.i).replace('.', ',') : '', p ? p.n : '', r ? r.c : '', r ? String(r.i).replace('.', ',') : '', r ? r.n : '', r && r.z ? 1 : 0, d.fat ?? '', status(d), cap]); }
    }
    exportFile(`${ymd(new Date())} - Journee - Export creneaux.csv`, '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv');
  },
  importFile(inp) {
    const f = inp.files[0]; if (!f) return;
    f.text().then(t => {
      const o = JSON.parse(t);
      if (!o || typeof o !== 'object' || !Number.isInteger(o.v) || !o.days || !o.settings) throw 0;
      if (o.v > SCHEMA) return toast(`Sauvegarde d'une version plus récente (format v${o.v}) : mets l'app à jour`);
      const [n, bad] = normalize(migrate(o));
      confirmDlg(`Remplacer toutes les données par cette sauvegarde ? ${Object.keys(n.days).length} journée(s)${bad ? `, ${bad} élément(s) invalide(s) écarté(s)` : ''}. Tes données actuelles sont d'abord téléchargées.`, 'Restaurer', () => {
        download(`${ymd(new Date())} - Journee - Avant restauration.json`, JSON.stringify(pack(DB)), 'application/json');
        undoable('Sauvegarde restaurée', () => { DB = n; save(); }); render();
      }, true);
    }).catch(() => toast('Fichier non reconnu'));
    inp.value = '';
  },
  importIT() {
    let raw = null; try { raw = localStorage.getItem(IT_KEY); } catch (e) { }
    if (raw) return A.itConvert(raw);
    sheet(`<h3>Importer Infinity Time</h3><p class="small mu">Aucune donnée Infinity Time trouvée à cette adresse. Colle ici le contenu de la clé « ${IT_KEY} » (tableau JSON).</p><textarea id="itxt" rows="6" class="mt"></textarea><button class="btn pri full mt" onclick="A.itConvert($('#itxt').value)">Importer</button>`);
  },
  itConvert(raw) {
    let arr; try { arr = JSON.parse(raw); if (!Array.isArray(arr)) throw 0; } catch (e) { return toast('Contenu non reconnu'); }
    const L = {}; let n = 0;
    for (const a of arr) { if (!a || !a.date || !CATS[a.category] || !(a.duration > 0)) continue; (L[a.date] = L[a.date] || {})[a.category] = (L[a.date][a.category] || 0) + a.duration; n++; }
    confirmDlg(`${n} entrées sur ${Object.keys(L).length} jours. Les importer comme historique (stats uniquement, sans grille) ?`, 'Importer', () => { undoable('Historique importé', () => { DB.legacy = L; save(); }); render(); });
  },
  reset() { sheet(`<h3>Tout effacer</h3><p class="small mu">Écris EFFACER pour confirmer. Exporte d'abord une sauvegarde.</p><input type="text" id="rst" class="mt"><button class="btn bad full mt" onclick="A.resetOk()">Effacer définitivement</button>`); },
  resetOk() { if ($('#rst').value.trim() !== 'EFFACER') return toast('Écris EFFACER'); undoable('Données effacées', () => { DB = defaults(); save(); }); A.closeSheet(); render(); }
};

/* ---------- démarrage ---------- */
const h0 = (location.hash || '').slice(1);
if (['maintenant', 'journee', 'stats', 'reglages'].includes(h0)) UI.tab = h0;
window.addEventListener('storage', e => { if (e.key === REV_KEY && e.newValue !== String(REV)) reloadFromDisk('Données mises à jour depuis une autre fenêtre'); });
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t !== UI.tab && ['maintenant', 'journee', 'stats', 'reglages'].includes(t)) A.tab(t); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#sh').classList.contains('on')) render(); });
setInterval(() => { if (UI.tab === 'maintenant' && !$('#sh').classList.contains('on')) render(); }, 60000);
render();
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).then(p => { UI.persist = p; }).catch(() => { }); } catch (e) { }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => { }); });
  }).catch(() => { });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) { UI.update = true; if (!$('#sh').classList.contains('on')) render(); } });
}
