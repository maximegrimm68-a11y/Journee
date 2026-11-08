'use strict';
/* Journée 1.5 — onglet Trier : capture, tri en un appui, tâches, planification dans Journée, 32e jour.
   Chargé après model.js et avant app.js ; les actions (TA) sont ajoutées à A par app.js. */

const qChip = q => q ? `<span class="chip" style="background:${QUAD[q].color}">${QUAD[q].code}</span>` : '';
const fmtEur = x => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: x < 100 ? 2 : 0 }).format(x);
const dayOf = ms => ymd(new Date(ms));
const d32State = () => { const t = todayKey(), h0 = DB.tr.d32.h, isDay = t === lastDay(t); return { t, h0, isDay, started: isDay && new Date().getHours() >= h0 }; };
const dsOf = k => { const d = day(k); return d ? d.ds : DB.settings.ds; };
const nowSlot = k => Math.min(NS - 1, Math.floor(nowRel(dsOf(k)) / SLOT));

/* Une seule alerte de suivi à la fois : échéance dépassée > relance > 32e jour (la sauvegarde est rappelée sur Maintenant) */
function taskAlert(link) {
  const T = DB.tr, t = todayKey(), S = d32State(), pl = (n, a, b) => n > 1 ? b : a, go = link ? ` tap" onclick="A.tab('trier')` : '';
  const late = T.items.filter(x => (x.st === 'todo' || x.st === 'placed') && x.dl && x.dl < t).length;
  if (late) return `<div class="card warn${go}"><b>${late} ${pl(late, 'échéance dépassée', 'échéances dépassées')}</b></div>`;
  const due = T.items.filter(x => x.st === 'delegated' && x.rd && x.rd <= t).length;
  if (due) return `<div class="card warn${go}"><b>${due} ${pl(due, 'délégation à relancer', 'délégations à relancer')}</b></div>`;
  const nbox = T.box.filter(x => !x.done).length;
  if (S.isDay && nbox) return `<div class="card warn${go}"><b>32e jour aujourd'hui</b><div class="small mu">à partir de ${pad(S.h0)}:00 · ${nbox} ${pl(nbox, 'petit rien', 'petits riens')} dans la boîte</div></div>`;
  return '';
}
/* Ligne de rappel sur l'écran Maintenant */
function trierNow() {
  const T = DB.tr, inbox = T.items.filter(x => x.st === 'inbox').length, q1 = T.items.filter(isQ1).length, a = taskAlert(true);
  if (a) return a;
  if (!inbox && !q1) return '';
  return `<div class="card tap row sp" onclick="A.tab('trier')"><span class="small">${[inbox ? `<b>${inbox}</b> à trier` : '', q1 ? `<b>${q1}</b> à faire maintenant` : ''].filter(Boolean).join(' · ')}</span><span class="small mu">Trier ›</span></div>`;
}
function itMeta(x) {
  const t = todayKey(), parts = [];
  if (x.st === 'placed') parts.push(`<span class="${x.pd === t ? 'c-ok' : ''}">${fmtDay(x.pd)} · ${slotClock(x.ps, dsOf(x.pd))}</span>`);
  else if (x.pd) parts.push(`${fmtDay(x.pd)} · sans heure`);
  if (x.d && x.st !== 'placed') parts.push(dur(x.d));
  if (x.pl) parts.push('temps perso');
  if (x.dl) parts.push(`<span class="${x.dl < t ? 'c-bad' : x.dl === t ? 'c-warn' : ''}">échéance ${fmtDay(x.dl)}</span>`);
  if (x.from && !x.pd) parts.push(`${x.og === 'bilan' ? 'reporté' : 'non fait'} le ${fmtDay(x.from)}`);
  return parts.join(' · ') || `noté le ${fmtDay(dayOf(x.at))}`;
}
const calIc = '<svg class="ic" viewBox="0 0 24 24" style="width:20px;height:20px"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
const itRow = x => `<div class="li tap" onclick="A.itemSheet('${x.id}')">${x.q ? qChip(x.q) : x.c ? catChip(x.c) : ''}<div class="n"><b>${esc(x.n)}</b><span class="xs mu">${itMeta(x)}</span></div>
  ${x.st === 'todo' ? `<button class="btn sm" onclick="event.stopPropagation();A.plan('${x.id}')" aria-label="Planifier">${calIc}</button>` : ''}<button class="btn sm" onclick="event.stopPropagation();A.done('${x.id}')" aria-label="Fait">✓</button></div>`;

function vTri() {
  const T = DB.tr, t = todayKey(), S = d32State(); let h = taskAlert(false);
  if (!T.items.length && !T.box.length) h += `<div class="card"><h2>Trier</h2><ol class="steps small">
    <li>Note toute sollicitation dès qu'elle arrive.</li>
    <li>Moins de 2 min : fais-la tout de suite. Sinon, range-la d'un appui dans la matrice.</li>
    <li>Planifie les tâches dans Journée : un jour, avec ou sans heure. Sans heure, « Préparer » la place dans un créneau libre.</li>
    <li>Les « il faudrait que… » vont dans la boîte, tirée le dernier jour du mois.</li></ol></div>`;
  const open = T.box.filter(x => !x.done), cur = T.d32.cur ? T.box.find(x => x.id === T.d32.cur && !x.done) : null;
  if (S.started && (cur || open.length)) h += `<div class="card"><h2>32e jour</h2>${cur ? `<p><b>${esc(cur.n)}</b></p><div class="grid2 mt"><button class="btn pri" onclick="A.d32Done()">Terminé</button><button class="btn" onclick="A.d32Back()">Remettre</button></div>`
    : `<button class="btn pri full" onclick="A.draw()">Tirer un petit rien au hasard</button><p class="xs mu mt">${open.length} dans la boîte · un seul à la fois.</p>`}</div>`;
  const act = sortTodo(T.items.filter(x => x.st === 'todo' || x.st === 'placed')), f = T.focus ? T.items.find(x => x.id === T.focus) : null;
  if (act.length) h += `<div class="card"><h2>Si tu n'en fais qu'une aujourd'hui</h2>${f ? `<div class="row">${qChip(f.q)}<b style="flex:1">${esc(f.n)}</b></div><div class="grid2 mt"><button class="btn pri" onclick="A.focusDone()">Faite</button><button class="btn" onclick="A.focusPick()">Changer</button></div>`
    : `<button class="btn full" onclick="A.focusPick()">Choisir la seule tâche du jour</button>`}</div>`;
  h += `<div class="card"><div class="row"><input type="text" id="cap" placeholder="Nouvelle sollicitation, tâche, idée…" enterkeyhint="done" onkeydown="if(event.key==='Enter')A.capture()"><button class="btn pri" onclick="A.capture()">Ajouter</button></div></div>`;
  const inbox = T.items.filter(x => x.st === 'inbox');
  if (inbox.length) h += `<div class="card"><h2>À trier · ${inbox.length}</h2>${inbox.map(x => `<div class="li tap" onclick="A.triage('${x.id}')"><div class="n"><b>${esc(x.n)}</b><span class="xs mu">noté le ${fmtDay(dayOf(x.at))}</span></div><span class="small mu">Trier</span></div>`).join('')}</div>`;
  const q1 = sortTodo(T.items.filter(isQ1)), tp = T.items.filter(toPlan).sort((a, b) => (a.dl || '9').localeCompare(b.dl || '9') || a.at - b.at);
  h += `<div class="card"><h2>À faire maintenant · ${q1.length}</h2>${q1.map(itRow).join('') || '<p class="small mu">Rien d’urgent et important.</p>'}</div>`;
  h += `<div class="card"><h2>À planifier · ${tp.length}</h2>${tp.map(itRow).join('') || '<p class="small mu">Rien à planifier.</p>'}${tp.length ? '<p class="xs mu mt">Bouton calendrier : choisir un jour, avec ou sans heure. Ou depuis l’agenda de la semaine (onglet Journée).</p>' : ''}</div>`;
  const pv = T.items.filter(planned).sort((a, b) => a.pd.localeCompare(b.pd) || (a.ps ?? 99) - (b.ps ?? 99)), pvT = pv.filter(x => x.pd === t).length;
  if (pv.length) h += `<details class="card"${pvT ? ' open' : ''}><summary><span>Prévu · ${pv.length}</span>${pvT ? `<span class="tag ok">${pvT} aujourd'hui</span>` : ''}</summary>${pv.map(itRow).join('')}</details>`;
  const del = T.items.filter(x => x.st === 'delegated').sort((a, b) => (a.rd || '9').localeCompare(b.rd || '9')), due = del.filter(x => x.rd && x.rd <= t).length;
  if (del.length) h += `<details class="card"${due ? ' open' : ''}><summary><span>Délégué · ${del.length}</span>${due ? `<span class="tag warn">${due} à relancer</span>` : ''}</summary>${del.map(x => `<div class="li tap" onclick="A.delegSheet('${x.id}')">${qChip('q3')}<div class="n"><b>${esc(x.n)}</b><span class="xs ${x.rd && x.rd <= t ? 'c-warn' : 'mu'}">${x.who ? 'à ' + esc(x.who) : 'délégué'}${x.rd ? ' · relance ' + fmtDay(x.rd) : ''}</span></div></div>`).join('')}</details>`;
  h += `<details class="card"><summary><span>Boîte du 32e jour · ${open.length}</span><span class="xs mu">${S.isDay ? `aujourd'hui ${pad(S.h0)}:00` : fmtDay(lastDay(t))}</span></summary>
    ${open.map(x => `<div class="li"><div class="n"><b>${esc(x.n)}</b><span class="xs mu">noté le ${fmtDay(dayOf(x.at))}</span></div><button class="btn sm" onclick="A.boxDel('${x.id}')">Retirer</button></div>`).join('') || '<p class="small mu">Vide. Au tri, « Petit rien → boîte ».</p>'}
    <p class="xs mu mt">Tirage le dernier jour du mois, à partir de ${pad(S.h0)}:00. Faits ce mois-ci : ${T.box.filter(x => x.done && dayOf(x.done).slice(0, 7) === t.slice(0, 7)).length}.</p></details>`;
  const m = t.slice(0, 7), Mo = T.items.filter(x => x.st !== 'inbox' && x.og === 'tri' && dayOf(x.at).slice(0, 7) === m), n = Mo.length, n2 = Mo.filter(x => x.h2).length;
  const Q = { q1: 0, q2: 0, q3: 0, q4: 0 }; Mo.forEach(x => { if (x.q) Q[x.q]++; });
  if (n) h += `<p class="xs mu center month">Ce mois : ${n} triée${n > 1 ? 's' : ''} · ${Math.round(n2 / n * 100)} % en moins de 2 min · ${Object.keys(QUAD).map(q => `${QUAD[q].code} ${Q[q]}`).join(' / ')}${Q.q1 > Q.q2 ? ' · <span class="c-warn">l’urgent domine</span>' : ''}</p>`;
  return h;
}
const filterHint = () => { const F = DB.tr.filters, s = L => L.map(z => esc(z.n)).join(' → '); return [F.pro.length ? s(F.pro) : '', F.perso.length ? 'perso : ' + s(F.perso) : ''].filter(Boolean).join(' · '); };
function sheetTriage() {
  const G = UI.tg, x = DB.tr.items.find(z => z.id === G.id); if (!x) return A.closeSheet();
  let h = `<div class="row sp" style="align-items:flex-start"><h3 style="margin:0;flex:1">${esc(x.n)}</h3>${G.step === 'deleg' ? `<button class="btn sm" onclick="A.tgBack()">‹ Retour</button>` : ''}</div>`;
  if (G.step === 'deleg') {
    h += `<div class="row mt">${qChip('q3')}<b>Déléguer entièrement</b></div>
      <label class="l">À qui (facultatif)</label><input type="text" value="${esc(G.who)}" oninput="UI.tg.who=this.value" placeholder="Nom">
      <label class="l">Relance le</label><input type="date" value="${G.rd}" onchange="UI.tg.rd=this.value">
      <button class="btn pri full mt2" onclick="A.tgDeleg()">Déléguer</button><button class="btn full mt" onclick="A.tgQ('q1')">Personne à qui déléguer : je le fais (Q1)</button>`;
  } else {
    const f = filterHint();
    h += `<button class="btn pri full mt" onclick="A.tgTwo()">Fait en moins de 2 min</button>
      <p class="xs mu mt">Sinon, ne le commence pas : range-le.</p>
      <div class="mx mt">${Object.keys(QUAD).map(q => `<button class="${q}" style="border-left-color:${QUAD[q].color}" onclick="A.tgQ('${q}')"><b>${QUAD[q].verb}</b><small>${QUAD[q].label}</small></button>`).join('')}</div>
      ${f ? `<p class="xs mu mt">Important = passe tes filtres : ${f}.</p>` : ''}
      <div class="grid2 mt2"><button class="btn" onclick="A.tgBox()">Petit rien → boîte</button><button class="btn" onclick="A.closeSheet()">Plus tard</button></div>`;
  }
  sheet(h);
}
function sheetItem() {
  const E = UI.it, x = DB.tr.items.find(z => z.id === E.id); if (!x) return A.closeSheet();
  sheet(`<div class="row">${x.q ? qChip(x.q) : x.c ? catChip(x.c) : ''}<h3 style="margin:0;flex:1">${esc(x.n)}</h3></div><p class="small mu mt">${x.q ? QUAD[x.q].label : 'Reporté du bilan'}${x.pl ? ' · temps perso' : ''} · ${itMeta(x)}</p>
    <label class="l">Échéance</label><input type="date" value="${E.dl}" onchange="UI.it.dl=this.value">
    ${x.st === 'placed' ? `<div class="grid2 mt2"><button class="btn" onclick="A.closeSheet();A.goDay('${x.pd}')">Voir la journée</button><button class="btn" onclick="A.unplan('${x.id}')">Retirer du planning</button></div>`
      : `<button class="btn full mt2" onclick="A.plan('${x.id}')">${x.pd ? 'Changer le jour ou l’heure' : 'Planifier dans Journée'}</button>`}
    <button class="btn pri full mt" onclick="A.done('${x.id}')">Fait</button>
    <div class="grid2 mt"><button class="btn" onclick="A.itSave()">Enregistrer</button><button class="btn" onclick="A.itRetriage()">Trier à nouveau</button></div>
    <button class="btn bad full mt" onclick="A.itDel()">Supprimer</button>`);
}
function sheetFocus() {
  const L = sortTodo(DB.tr.items.filter(x => x.st === 'todo' || x.st === 'placed'));
  sheet(`<h3>La seule tâche du jour</h3><p class="small mu">Si tu ne pouvais en faire qu'une seule aujourd'hui, laquelle ?</p>${L.map(x => `<div class="li tap" onclick="A.focusSet('${x.id}')">${qChip(x.q)}<div class="n"><b>${esc(x.n)}</b><span class="xs mu">${itMeta(x)}</span></div></div>`).join('')}`);
}

/* ---------- planifier une tâche dans Journée : un jour obligatoire, une heure facultative ---------- */
/* Simulation sur une copie : énergie du jour avant / après, modèle appliqué d'abord si la journée est vide */
function planPreview(P) {
  const d = day(P.k), cap = capAt(P.k), withTpl = (!d || !d.b.length) && !(d && d.val) && !!tplFor(P.k);
  const ds = d && d.b.length ? d.ds : DB.settings.ds;
  const cp = { ds, b: d ? d.b.map(z => ({ ...z })) : [] };
  if (withTpl) { cp.b = []; for (const z of tplBlocks(tplFor(P.k), ds)) paint(cp, z); mergeAdj(cp); }
  const before = energy(cp.b), x = { ...taskBlock({ n: '', c: P.c, i: P.i, d: P.d }, P.s ?? 0) };
  const over = P.s == null ? [] : cp.b.filter(z => z.s < x.e && z.e > x.s);
  if (P.s != null) paint(cp, x);
  return { cap, before, after: P.s == null ? before + P.d * P.i : energy(cp.b), withTpl, over, ds, val: !!(d && d.val), x };
}
function sheetPlan() {
  const P = UI.pl, x = DB.tr.items.find(z => z.id === P.id); if (!x) return A.closeSheet();
  const t = todayKey(), days = [...Array(7)].map((_, i) => addDays(t, i)), V = planPreview(P), st = status(day(P.k));
  const lbl = z => esc(z.n || CATS[z.c].label);
  let opts = `<option value=""${P.s == null ? ' selected' : ''}>Sans heure</option>`;
  const sm = slotMap(day(P.k) ? day(P.k).b : []);
  for (let v = 0; v < NS; v++) opts += `<option value="${v}"${P.s === v ? ' selected' : ''}>${slotClock(v, V.ds)}${sm[v] ? ' · ' + lbl(sm[v]) : ' · libre'}</option>`;
  sheet(`<h3>Planifier · ${esc(x.n)}</h3>
    <label class="l">Jour</label><div class="seg days">${days.map(k => `<button class="${P.k === k ? 'on' : ''}" onclick="A.plK('${k}')">${fmtDay(k).split(' ')[0]}<small>${keyToDate(k).getDate()}</small></button>`).join('')}</div>
    <input type="date" class="mt" value="${P.k}" min="${t}" onchange="A.plK(this.value)">
    <label class="l">Heure (facultative)</label><select class="num" onchange="A.plS(this.value)">${opts}</select>
    <p class="xs mu mt">${P.s == null ? 'Sans heure : la tâche attend ce jour-là ; « Préparer » ou « Placer » (onglet Journée) la pose dans le premier créneau libre assez long.' : V.over.length ? `<span class="c-warn">Recouvre : ${V.over.map(z => `${lbl(z)} ${slotClock(Math.max(z.s, V.x.s), V.ds)}–${slotClock(Math.min(z.e, V.x.e), V.ds)}`).join(' · ')}.</span>` : `Créneau libre : ${slotClock(V.x.s, V.ds)}–${slotClock(V.x.e, V.ds)}.`}</p>
    <label class="l">Durée</label><div class="stp"><button onclick="A.plD(-1)">−</button><span class="v num">${dur(P.d)}</span><button onclick="A.plD(1)">+</button></div>
    <label class="l">Nature du temps</label>${segCats(P.c, 'A.plC')}
    <label class="l">Énergie par créneau · coût <span class="num" style="color:var(--tx)">${costStr({ s: 0, e: P.d, i: P.i })}</span></label>${segLevels(P.i, 'A.plI')}
    <div class="row sp mt2"><span class="small">Énergie planifiée · ${fmtDay(P.k)}</span><b class="num ${V.after > V.cap ? 'c-bad' : ''}">${fmtE(V.before)} → ${fmtE(V.after)} / ${V.cap}</b></div>
    ${V.withTpl && P.s != null ? `<p class="xs mu mt">Journée vide : le modèle « ${esc(tplFor(P.k).n)} » est appliqué d'abord.</p>` : ''}
    ${V.val && P.s != null ? `<p class="xs c-warn mt">Plan déjà validé : ce bloc comptera comme un écart au plan.</p>` : ''}
    ${st === 'clos' ? `<p class="small c-bad mt">Journée clôturée : choisis un autre jour.</p>` : ''}
    <button class="btn pri full mt2" onclick="A.planOk()" ${st === 'clos' ? 'disabled' : ''}>Planifier</button>`);
}
/* Créneau touché dans l'agenda de la semaine : choisir la tâche à y poser */
function sheetWkPick(k, s) {
  const T = DB.tr, ds = dsOf(k), L = [...sortTodo(T.items.filter(isQ1)), ...T.items.filter(x => x.st === 'todo' && x.pd === k), ...T.items.filter(toPlan)];
  const g = gaps(day(k) ? day(k).b : []).find(z => z.s <= s && z.e > s);
  sheet(`<h3>${cap1(fmtDay(k, true))} · ${slotClock(s, ds)}</h3>
    ${L.length ? `<label class="l">Tâche à poser ici</label>${L.map(x => `<div class="li tap" onclick="A.plan('${x.id}','${k}',${s})">${x.q ? qChip(x.q) : x.c ? catChip(x.c) : ''}<div class="n"><b>${esc(x.n)}</b><span class="xs mu">${itMeta(x)}</span></div></div>`).join('')}` : '<p class="small mu">Aucune tâche à planifier. Capture-les dans l’onglet Trier.</p>'}
    <div class="grid2 mt2"><button class="btn" onclick="A.fill('${k}',${s},${g ? g.e : Math.min(NS, s + 3)})">Bloc du catalogue</button><button class="btn" onclick="A.closeSheet();A.goDay('${k}')">Ouvrir la journée</button></div>`);
}

/* ---------- réglages de Trier (dans Réglages) ---------- */
function vSetTrier() {
  const T = DB.tr, set = UI.fset || 'pro', F = T.filters[set];
  let h = `<div class="card"><div class="row sp"><h2 style="margin:0">Trier · filtres</h2><div class="seg" style="width:170px">${[['pro', 'Pro'], ['perso', 'Perso']].map(([k, l]) => `<button class="${set === k ? 'on' : ''}" onclick="A.fset('${k}')">${l}</button>`).join('')}</div></div>
    ${F.length ? F.map((f, i) => `<div class="li tap" onclick="A.filterEdit('${set}','${f.id}')"><span class="chip" style="background:var(--s2);color:var(--tx)">${i + 1}</span><div class="n"><b>${esc(f.n)}</b><span class="xs ${f.e ? 'c-bad' : 'c-warn'}">${f.e ? 'Éliminatoire' : 'À réfléchir'}</span></div></div>`).join('')
      : `<p class="small mu mt">${set === 'perso' ? 'Aucun filtre personnel. Construis-les sur le modèle des filtres pro, du plus éliminatoire au moins éliminatoire.' : 'Aucun filtre.'}</p>`}
    <button class="btn sm mt" onclick="A.filterEdit('${set}',null)">Ajouter un filtre</button>
    <p class="xs mu mt">Rappelés au tri pour juger « important ». Un « non » sur un filtre éliminatoire écarte, sur un filtre « à réfléchir » fait hésiter.</p></div>`;
  const V = T.vh, vh = hourValue(V), pm = num(UI.calc || '');
  h += `<div class="card"><h2>Valeur de ton heure</h2><div class="row sp"><span>Une heure vaut</span><b class="num">${vh == null ? '—' : fmtEur(vh)}</b></div>
    ${vh ? `<label class="lab">Payer pour gagner du temps : minutes gagnées</label><input type="text" inputmode="decimal" value="${esc(UI.calc || '')}" placeholder="min" onchange="A.calc(this.value)">${pm ? `<p class="small mt">Ça vaut jusqu'à <b>${fmtEur(worthMax(pm, vh))}</b>.</p>` : ''}` : ''}
    <details class="sub"${vh ? '' : ' open'}><summary>${vh ? 'Modifier les 4 montants' : 'Renseigne les 4 montants'}</summary>
    ${[['a', 'Somme pour accepter d’attendre 1 h au téléphone sans rien faire'], ['b', 'Prix que tu paierais pour déléguer 1 h de tâche simple et répétitive'], ['c', 'Ton revenu horaire réel, tous revenus, trajets inclus'], ['d', 'Ce que tu voudrais gagner par heure pour être satisfait']].map(([k, l]) => `<label class="lab">${l}</label><input type="text" inputmode="decimal" value="${V[k] == null ? '' : String(V[k]).replace('.', ',')}" placeholder="€" onchange="A.vhSet('${k}', this.value)">`).join('')}
    <p class="xs mu mt">Moyenne des 4 montants. Méthode reprise d'une fiche de lecture : énoncés exacts à vérifier dans le livre (ch. 3).</p></details></div>`;
  const S = d32State();
  h += `<div class="card"><h2>32e jour</h2><div class="row sp"><span class="small">Prochain : ${cap1(fmtDay(lastDay(S.t), true))}, début</span>${stepper(S.h0, 9, 18, 'A.d32H', 'A.d32Hset', v => pad(v) + ':00')}</div></div>`;
  return h;
}

/* ---------- actions ---------- */
const TA = {
  capture() {
    const el = $('#cap'), n = (el && el.value || '').trim(); if (!n) return toast('Écris d’abord la sollicitation');
    const x = newTask(n); DB.tr.items.push(x); save();   // pas d'annulation ici : le tri qui suit l'est
    render(); A.triage(x.id);
  },
  triage(id) { UI.tg = { id, step: 'mx', who: '', rd: addDays(todayKey(), RELANCE_J) }; sheetTriage(); },
  tgBack() { UI.tg.step = 'mx'; sheetTriage(); },
  tgEnd(label, fields) {
    const G = UI.tg, x = DB.tr.items.find(z => z.id === G.id); if (!x) return A.closeSheet();
    undoable(label, () => { Object.assign(x, fields, { end: fields.st === 'todo' ? null : Date.now() }); if (fields.st === 'box') DB.tr.box.push({ id: uid(), n: x.n, at: Date.now(), done: null }); save(); });
    A.closeSheet(); render();
  },
  tgTwo() { A.tgEnd('Fait en moins de 2 min', { st: 'done', h2: 1, q: null }); },
  tgQ(q) {
    if (q === 'q3') { UI.tg.step = 'deleg'; return sheetTriage(); }
    if (q === 'q4') return A.tgEnd('Oublié', { st: 'dropped', q });
    A.tgEnd(q === 'q1' ? 'À faire maintenant' : 'À planifier', { st: 'todo', q });
  },
  tgDeleg() { const G = UI.tg, who = (G.who || '').trim(); A.tgEnd(who ? `Délégué à ${who}` : 'Délégué', { st: 'delegated', q: 'q3', who, rd: G.rd || '' }); },
  tgBox() { A.tgEnd('Dans la boîte du 32e jour', { st: 'box', q: 'q4' }); },
  /* tâches */
  itemSheet(id) { const x = DB.tr.items.find(z => z.id === id); if (!x) return; UI.it = { id, dl: x.dl }; sheetItem(); },
  itSave() { const E = UI.it, x = DB.tr.items.find(z => z.id === E.id); undoable('Tâche modifiée', () => { x.dl = E.dl || ''; save(); }); A.closeSheet(); render(); },
  itRetriage() { const id = UI.it.id, x = DB.tr.items.find(z => z.id === id); undoable('À trier à nouveau', () => { A._unpost(x); Object.assign(x, { st: 'inbox', pd: '', ps: null }); if (DB.tr.focus === id) DB.tr.focus = null; save(); }); A.closeSheet(); render(); A.triage(id); },
  itDel() { const id = UI.it.id, x = DB.tr.items.find(z => z.id === id); undoable('Tâche supprimée', () => { A._unpost(x); DB.tr.items = DB.tr.items.filter(z => z.id !== id); if (DB.tr.focus === id) DB.tr.focus = null; save(); }); A.closeSheet(); render(); },
  done(id) { const x = DB.tr.items.find(z => z.id === id); if (!x) return; undoable('Tâche terminée', () => { x.st = 'done'; x.end = Date.now(); if (DB.tr.focus === id) DB.tr.focus = null; save(); }); A.closeSheet(); render(); },
  /* retire le bloc d'une tâche posée dans une journée non clôturée (même libellé, même heure) */
  _unpost(x) {
    if (!x || x.st !== 'placed') return; const d = day(x.pd); if (!d || d.clo) return;
    const b = d.b.find(z => z.n === x.n && z.s === x.ps) || d.b.find(z => z.n === x.n); if (b) d.b = d.b.filter(z => z !== b);
  },
  unplan(id) { const x = DB.tr.items.find(z => z.id === id); undoable('Retiré du planning', () => { A._unpost(x); backToPlan(x, ''); x.from = ''; save(); }); A.closeSheet(); render(); },
  focusPick() { sheetFocus(); },
  focusSet(id) { DB.tr.focus = id; save(); A.closeSheet(); render(); },
  focusDone() { const id = DB.tr.focus; A.done(id); if (DB.tr.items.some(x => x.st === 'todo' || x.st === 'placed')) sheetFocus(); },   // on la fait, puis on recommence
  /* planifier */
  plan(id, k, s) {
    const x = DB.tr.items.find(z => z.id === id); if (!x) return;
    const t = todayKey(), kk = k || (x.pd && x.pd >= t ? x.pd : t);
    const s0 = s != null ? s : x.st === 'placed' && x.pd === kk ? x.ps : (!k && isQ1(x) && kk === t ? nowSlot(t) : null);
    UI.pl = { id, k: kk, s: s0, d: x.d || TASK_D, c: x.c || 'perso', i: x.i ?? 1 }; sheetPlan();
  },
  plK(k) { if (!isDate(k)) return; if (k < todayKey()) return toast('Choisis aujourd’hui ou un jour à venir'); UI.pl.k = k; sheetPlan(); },
  plS(v) { UI.pl.s = v === '' ? null : Number(v); sheetPlan(); },
  plD(n) { UI.pl.d = clamp(UI.pl.d + n, 1, NS); sheetPlan(); },
  plC(c) { UI.pl.c = c; sheetPlan(); },
  plI(v) { UI.pl.i = v; sheetPlan(); },
  planOk() {
    const P = UI.pl, x = DB.tr.items.find(z => z.id === P.id); if (!x) return A.closeSheet();
    if (status(day(P.k)) === 'clos') return toast('Journée clôturée');
    const lab = `${cap1(fmtDay(P.k))}${P.s != null ? ' à ' + slotClock(P.s, planPreview(P).ds) : ' · sans heure'}`;
    undoable('Planifié : ' + lab, () => {
      A._unpost(x);
      Object.assign(x, { c: P.c, i: P.i, d: P.d, pd: P.k, from: '' });
      if (P.s == null) { x.st = 'todo'; x.ps = null; }
      else {
        const d = day(P.k, true), t = tplFor(P.k);
        if (!d.b.length && !d.val && t) { d.ds = DB.settings.ds; for (const z of tplBlocks(t, d.ds)) paint(d, z); mergeAdj(d); }
        paint(d, taskBlock(x, P.s)); x.st = 'placed'; x.ps = P.s;
      }
      save();
    });
    UI.pl = null; A.closeSheet(); render();
  },
  /* place une tâche dans le premier créneau libre assez long du jour k (sinon ouvre la feuille Planifier) */
  placeTask(k, id) {
    const x = DB.tr.items.find(z => z.id === id); if (!x) return;
    if (!x.d || !x.c || x.i == null) return A.plan(id, k);
    // journée vide : le modèle du jour d'abord ; sans modèle, un « créneau libre » serait minuit → on demande l'heure
    const d0 = day(k), t = tplFor(k), empty = !d0 || !d0.b.length;
    if (empty && !(t && !(d0 && d0.val))) { toast('Journée vide : choisis l’heure'); return A.plan(id, k); }
    const cp = empty ? { ds: DB.settings.ds, b: [] } : { ds: d0.ds, b: d0.b };
    if (empty) { for (const z of tplBlocks(t, cp.ds)) paint(cp, z); mergeAdj(cp); }
    const lo = k === todayKey() ? nowSlot(k) : 0, g = gaps(cp.b).find(z => z.e - Math.max(z.s, lo) >= x.d);
    if (!g) return A.plan(id, k);
    const s = Math.max(g.s, lo);
    undoable(`Placé à ${slotClock(s, cp.ds)}`, () => { const dd = day(k, true); if (empty) { dd.ds = cp.ds; dd.b = cp.b; } paint(dd, taskBlock(x, s)); Object.assign(x, { st: 'placed', pd: k, ps: s, from: '' }); save(); });
    toast(`Placé à ${slotClock(s, dsOf(k))}`); A.closeSheet(); render();
  },
  wkTap(k, ev) {
    const col = ev.currentTarget, y = ev.clientY - col.getBoundingClientRect().top, s = clamp(Math.floor(y / WKPX), 0, NS - 1);
    const d = day(k), st = status(d);
    if (k < todayKey() || st === 'clos') return A.goDay(k);
    const b = d && slotMap(d.b)[s];
    if (b) { A.goDay(k); return A.openBlock(k, b.id); }
    sheetWkPick(k, s);
  },
  /* délégation */
  delegSheet(id) {
    const x = DB.tr.items.find(z => z.id === id); if (!x) return; UI.dg = { id, rd: x.rd };
    sheet(`<h3>${esc(x.n)}</h3><p class="small mu">${x.who ? 'Délégué à ' + esc(x.who) : 'Délégué'} le ${fmtDay(dayOf(x.end || x.at))}</p>
      <label class="l">Relance le</label><input type="date" value="${x.rd}" onchange="UI.dg.rd=this.value">
      <button class="btn pri full mt2" onclick="A.delegDone()">Fait par la personne</button><div class="grid2 mt"><button class="btn" onclick="A.delegSave()">Enregistrer la relance</button><button class="btn" onclick="A.delegBack()">Je le reprends</button></div>`);
  },
  delegSave() { const x = DB.tr.items.find(z => z.id === UI.dg.id); undoable('Relance enregistrée', () => { x.rd = UI.dg.rd || ''; save(); }); A.closeSheet(); render(); },
  delegDone() { const x = DB.tr.items.find(z => z.id === UI.dg.id); undoable('Délégation terminée', () => { x.st = 'done'; x.end = Date.now(); save(); }); A.closeSheet(); render(); },
  delegBack() { const x = DB.tr.items.find(z => z.id === UI.dg.id); undoable('À trier à nouveau', () => { x.st = 'inbox'; save(); }); A.closeSheet(); render(); A.triage(x.id); },
  /* 32e jour */
  d32H(n) { DB.tr.d32.h = clamp(DB.tr.d32.h + n, 9, 18); save(); render(); },
  d32Hset(v) { DB.tr.d32.h = clamp(v, 9, 18); save(); render(); },
  draw() { if (DB.tr.d32.cur) return; const x = drawBox(DB.tr.box); if (!x) return; DB.tr.d32.cur = x.id; save(); render(); },
  d32Done() { const T = DB.tr, x = T.box.find(z => z.id === T.d32.cur); undoable('Petit rien terminé', () => { if (x) x.done = Date.now(); T.d32.cur = null; save(); }); render(); },
  d32Back() { DB.tr.d32.cur = null; save(); render(); },
  boxDel(id) { undoable('Retiré de la boîte', () => { DB.tr.box = DB.tr.box.filter(z => z.id !== id); if (DB.tr.d32.cur === id) DB.tr.d32.cur = null; save(); }); render(); },
  /* réglages */
  fset(k) { UI.fset = k; render(); },
  filterEdit(set, id) {
    const F = DB.tr.filters[set], f = id ? F.find(z => z.id === id) : null, i = f ? F.indexOf(f) : -1;
    UI.fe = { set, id, n: f ? f.n : '', e: f ? f.e : (F.length < 2 ? 1 : 0) };
    sheet(`<h3>${f ? 'Filtre ' + (i + 1) : 'Nouveau filtre'} · ${set}</h3><label class="l">Intitulé</label><input type="text" value="${esc(UI.fe.n)}" oninput="UI.fe.n=this.value" placeholder="Ex. Rentabilité">
      <label class="l">Effet d'un « non »</label><div class="seg"><button class="${UI.fe.e ? 'on' : ''}" onclick="UI.fe.e=1;this.classList.add('on');this.nextElementSibling.classList.remove('on')">Éliminatoire</button><button class="${UI.fe.e ? '' : 'on'}" onclick="UI.fe.e=0;this.classList.add('on');this.previousElementSibling.classList.remove('on')">À réfléchir</button></div>
      <button class="btn pri full mt2" onclick="A.filterSave()">Enregistrer</button>
      ${f ? `<div class="grid2 mt"><button class="btn" onclick="A.filterMove(-1)" ${i === 0 ? 'disabled' : ''}>Monter</button><button class="btn" onclick="A.filterMove(1)" ${i === F.length - 1 ? 'disabled' : ''}>Descendre</button></div><button class="btn bad full mt" onclick="A.filterDel()">Supprimer</button>` : ''}`);
  },
  filterSave() {
    const E = UI.fe, n = (E.n || '').trim(); if (!n) return toast('Donne un intitulé');
    undoable('Filtre enregistré', () => { const F = DB.tr.filters[E.set]; if (E.id) Object.assign(F.find(z => z.id === E.id), { n, e: E.e }); else F.push({ id: uid(), n, e: E.e }); save(); });
    A.closeSheet(); render();
  },
  filterMove(dir) {
    const E = UI.fe, F = DB.tr.filters[E.set], i = F.findIndex(z => z.id === E.id), j = i + dir; if (j < 0 || j >= F.length) return;
    undoable('Ordre des filtres modifié', () => { [F[i], F[j]] = [F[j], F[i]]; save(); }); A.closeSheet(); render();
  },
  filterDel() { const E = UI.fe; undoable('Filtre supprimé', () => { DB.tr.filters[E.set] = DB.tr.filters[E.set].filter(z => z.id !== E.id); save(); }); A.closeSheet(); render(); },
  vhSet(k, v) { DB.tr.vh[k] = v === '' ? null : num(v); save(); render(); },
  calc(v) { UI.calc = v; render(); },
  /* import de l'app Trier séparée : sauvegarde (.json / .txt) */
  trImportFile(inp) {
    const f = inp.files[0]; if (!f) return;
    f.text().then(t => {
      const o = JSON.parse(t); if (!o || !o.tr || o.days) throw 0;
      const [src] = normTr(o.tr);
      confirmDlg(`Ajouter ${src.items.length} tâche(s) et ${src.box.length} petit(s) rien(s) de Trier ? Rien n'est remplacé.`, 'Ajouter', () => {
        let r; undoable('Données de Trier ajoutées', () => { r = mergeTrier(DB.tr, o); DB.tr.imp = Date.now(); save(); }); render();
        toast(`${r.items} tâche(s), ${r.box} petit(s) rien(s) ajoutés`);
      });
    }).catch(() => toast('Sauvegarde Trier non reconnue'));
    inp.value = '';
  }
};
/* Import automatique, une fois, des données de l'app Trier séparée (même adresse github.io : même stockage) */
function autoImportTrier() {
  if (READONLY || DB.tr.imp) return;
  const raw = lsGet('trier.v1'); if (!raw) return;
  let o = null; try { o = JSON.parse(raw); } catch (e) { return; }
  if (!o || !o.tr) return;
  const r = mergeTrier(DB.tr, o); DB.tr.imp = Date.now();
  if (save()) LOAD_NOTE = (LOAD_NOTE ? LOAD_NOTE + ' ' : '') + `Données de l'app Trier reprises : ${r.items} tâche(s), ${r.box} petit(s) rien(s). Elles restent aussi dans Trier, qui peut être désinstallée.`;
}
