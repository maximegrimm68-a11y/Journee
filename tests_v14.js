/* Journée — tests de non-régression V1.4 (Chrome sans interface, 412 × 915, fuseau Paris)
   usage : node tests_v12.js <dossier de l'app> */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split(/[?#]/)[0])); if (f.endsWith('/')) f += 'index.html'; try { r.setHeader('Content-Type', mime[path.extname(f)] || 'text/plain'); r.end(fs.readFileSync(f)); } catch (e) { r.statusCode = 404; r.end(); } }).listen(8776);
let pass = 0, fail = 0; const T = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'OK    ' : 'ÉCHEC ') + name + (info ? ' — ' + info : '')); };
const blocks = (p, k) => p.evaluate(k => day(k) ? day(k).b.map(x => `${slotClock(x.s, day(k).ds)}–${slotClock(x.e, day(k).ds)} ${x.c} ${x.i} ${x.n}`).join(' | ') : '', k);
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, timezoneId: 'Europe/Paris', locale: 'fr-FR', acceptDownloads: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-09T10:30:00+01:00') });   // lundi
  await p.goto('http://localhost:8776/index.html'); await p.waitForTimeout(300);
  const K = '2026-11-09';

  console.log('— Journée à 00:00 et modèles');
  T('Bascule par défaut à 00:00', await p.evaluate(() => DB.settings.ds === 0 && todayKey() === '2026-11-09'));
  T('Modèle du lundi proposé sur Maintenant', /Appliquer « Exemple semaine/.test(await p.textContent('#view')));
  await p.evaluate(K => A.applyTpl(K, DB.templates[0].id), K);
  const r1 = await p.evaluate(K => ({ n: day(K).b.length, g: gaps(day(K).b).map(g => g.s + '-' + g.e).join(','), e: energy(day(K).b), last: slotClock(72, 0), first: day(K).b[0] }), K);
  T('Modèle appliqué : 00:00–06:20 sommeil, trou 20:20–21:40, 32,5 créneaux', r1.n === 10 && r1.g === '61-65' && r1.e === 32.5 && r1.first.s === 0 && r1.first.e === 19 && r1.last === '24:00', `${r1.n} blocs, trou ${r1.g}, énergie ${r1.e}`);
  const wrap = await p.evaluate(() => { const S = { n: 'Sommeil', c: 'obligatoire', i: 0, t: 'aucune', z: 1 }; const t = { b: [{ ...S, m: 1300, d: 19 }, { ...S, m: 240, d: 7 }] }; const d = { b: [] }; for (const x of tplBlocks(t, 0)) paint(d, x); mergeAdj(d); return d.b.map(x => x.s + '-' + x.e).join(','); });
  T('Ancien modèle (journée à 04:00) : la nuit qui franchit minuit est reconstituée', wrap === '0-19,65-72', wrap);
  await p.evaluate(() => A.goDay('2026-11-14'));
  T('Pas de modèle proposé le samedi', !/Appliquer « /.test(await p.textContent('#view')));

  console.log('— Saisie : peinture et bornes partagées');
  await p.evaluate(K => { const x = day(K).b.find(z => z.n === 'Trajet'); A.openBlock(K, x.id); A.edMove('e', 2); }, K);
  const hint = await p.textContent('#sh');
  await p.evaluate(() => A.edSave());
  T('A4 allonger le trajet de 40 min recouvre le travail', /08:40–12:00 pro 1 Travail/.test(await blocks(p, K)) && /Recouvre : Travail standard 08:00–08:40/.test(hint));
  await p.evaluate(K => { const x = day(K).b.find(z => z.n === 'Trajet'); A.openBlock(K, x.id); A.edMove('e', -3); }, K);
  const hint2 = await p.textContent('#sh');
  await p.evaluate(() => A.edSave());
  T('Raccourcir le trajet : le travail collé suit la borne', /07:20–07:40 obligatoire 0.5 Trajet \| 07:40–12:00 pro 1 Travail/.test(await blocks(p, K)) && /commencera à 07:40/.test(hint2));
  await p.evaluate(K => { const x = day(K).b.find(z => z.n === 'Travail standard' && z.s === 23); A.openBlock(K, x.id); A.insertIn(); A.fkMove(4); A.place(DB.catalog.find(c => c.n === 'Réunion').id); }, K);
  T('Insérer une réunion dans le travail découpe le bloc', /07:40–09:00 pro 1 Travail standard \| 09:00–10:00 pro 2 Réunion \| 10:00–12:00 pro 1 Travail/.test(await blocks(p, K)));
  const sheetOpen = await p.evaluate(() => $('#sh').classList.contains('on'));
  T('Feuille fermée après insertion (hors bilan)', !sheetOpen);

  console.log('— Écart et niveau rapide');
  const before = await blocks(p, K);
  await p.evaluate(() => { A.tab('maintenant'); A.ecart(); A.closeSheet(); });
  T('A2 écart annulé : rien ne change', before === await blocks(p, K));
  await p.evaluate(() => { A.ecart(); UI.ed.x.c = 'nontemps'; UI.ed.x.i = .5; A.edMove('e', 2); A.edSave(); });
  T('Écart de 10:20 à 12:00 : avant et après conservés, le bloc suivant est raccourci si recouvert', /10:00–10:20 pro 1 Travail standard \| 10:20–12:00 nontemps 0.5/.test(await blocks(p, K)), (await blocks(p, K)).split(' | ').slice(4, 7).join(' | '));
  await p.evaluate(() => { A.ecart(); UI.ed.x.c = 'nontemps'; A.edMove('e', 3); A.edSave(); });
  T('Écart prolongé jusqu’à 12:20 : le repas est raccourci (peinture)', /10:20–12:20 nontemps 0.5\s*\| 12:20–13:00 obligatoire 0 Repas/.test(await blocks(p, K)), (await blocks(p, K)).split(' | ').slice(5, 8).join(' | '));
  await p.evaluate(K => { const d = day(K); d.b = d.b.filter(x => !(x.c === 'nontemps')); A.applyTpl(K, DB.templates[0].id); }, K);
  await p.evaluate(() => A.closeSheet());
  await p.evaluate(K => A.applyTpl(K, DB.templates[0].id), K); await p.evaluate(() => { if ($('#sh').classList.contains('on')) A.cfOk(); });
  const e0 = await p.evaluate(K => energy(day(K).b), K);
  await p.evaluate(() => { A.tab('maintenant'); });
  const quickBtns = await p.locator('#view .seg button').count();
  await p.evaluate(() => A.quick(2));
  T('Niveau rapide « pénible » à 10:30 : bloc coupé à 10:20, +5 créneaux', quickBtns === 6 && /08:00–10:20 pro 1 Travail standard \| 10:20–12:00 pro 2 Travail standard/.test(await blocks(p, K)) && await p.evaluate(K => energy(day(K).b), K) === e0 + 5);
  T('Batterie libellée « selon le plan »', /selon le plan et les écarts saisis/.test(await p.textContent('#view')));
  await p.click('#undo button');
  T('Niveau rapide annulable', await p.evaluate(K => energy(day(K).b), K) === e0);

  console.log('— Bilan pas à pas');
  await p.evaluate(K => { A.validate(K); }, K);
  await p.clock.setFixedTime(new Date('2026-11-09T21:30:00+01:00'));
  await p.evaluate(K => A.goBilan(K), K);
  const h0 = await p.textContent('#sh h3');
  await p.evaluate(() => A.nightSkip());
  const h1 = await p.textContent('#sh h3');
  await p.evaluate(() => { A.blOk(); A.blOk(); });              // sommeil, préparation
  await p.evaluate(() => { A.blFix(); UI.ed.x.i = 1; A.edSave(); });   // trajet corrigé
  const h2 = await p.textContent('#sh h3');
  await p.evaluate(() => A.blDefer());                           // travail du matin non fait
  const gapStep = await p.textContent('#sh');
  await p.evaluate(() => { A.blFill(); A.place(DB.catalog.find(c => c.n === 'Loisir').id); });
  const after = await p.textContent('#sh h3');
  await p.evaluate(() => A.blRest());                            // saute au créneau libre suivant
  const gap2 = await p.textContent('#sh');
  for (let i = 0; i < 40 && /Bilan ·/.test(await p.textContent('#sh h3')); i++) {
    if (/Libre ·/.test(await p.textContent('#sh'))) await p.evaluate(() => { A.blFill(); A.place(DB.catalog.find(c => c.n === 'Loisir').id); });
    else await p.evaluate(() => A.blRest());
  }
  await p.clock.setFixedTime(new Date('2026-11-09T21:32:15+01:00'));
  const fat = await p.textContent('#sh h3');
  await p.evaluate(K => A.closeOk(K, 3), K);
  const d9 = await p.evaluate(K => ({ clo: !!day(K).clo, bt: day(K).bt, gaps: gapSlots(day(K).b), back: DB.backlog.length, diff: day(K).b.filter(x => blockDiff(day(K), x)).length }), K);
  T('Bilan : commence par la nuit, puis le 1er bloc', /Bilan · nuit/.test(h0) && /Bilan · 1 \//.test(h1), h0 + ' → ' + h1);
  T('Bilan : après correction, passe au bloc suivant', /Bilan · 4 \//.test(h2), h2);
  T('Bilan : « Non fait » laisse un créneau libre à remplir', /Qu'as-tu fait sur ce créneau/.test(gapStep));
  T('Bilan : remplissage partiel, puis élément suivant', /Bilan ·/.test(after), after);
  T('Bilan : « Tout le reste conforme » mène au créneau libre suivant', /Libre · 3 h/.test(gap2));
  T('Bilan : un créneau libre ne peut pas être validé sans le remplir', await p.evaluate(() => { const c = UI.bl ? UI.bl.cur : -1; if (UI.bl) A.blOk(); return !UI.bl || UI.bl.cur === c; }));
  T('Bilan : se termine par la fatigue, journée clôturée sans trou', /fatigue ressentie/.test(fat) && d9.clo && d9.gaps === 0);
  T('Bilan chronométré et enregistré', d9.bt === 135, `${d9.bt} s`);
  T('Tâche non faite dans « À replacer », écarts marqués', d9.back === 1 && d9.diff >= 2, `${d9.back} à replacer, ${d9.diff} blocs ≠ plan`);
  await p.evaluate(() => { A.tab('stats'); });
  T('Stats : médiane de durée du bilan', /Durée du bilan.*2 min 15 s/.test(await p.textContent('#view')));

  console.log('— Clôture, modèles par jour, cibles tactiles');
  await p.evaluate(() => { const k = '2026-11-08'; A.applyTpl(k, DB.templates[0].id); day(k).b.find(x => x.n === 'Temps enfant').i = 3; save(); A.goDay(k); });
  T('A1 journée non validée au-dessus de la capacité : « Bilan et clôture » proposé', await p.locator('button:has-text("Bilan et clôture")').count() === 1, `${await p.evaluate(() => energy(day('2026-11-08').b))} / 33`);
  await p.evaluate(() => { DB.templates.push({ id: 'tw', n: 'Télétravail', wd: [], b: [] }); A.tplWd('tw', 0); });
  T('Un jour = un seul modèle', await p.evaluate(() => DB.templates[0].wd.join(',') === '1,2,3,4' && DB.templates[1].wd.join(',') === '0'));
  await p.evaluate(() => { A.tplWd('tw', 0); A.tplWd(DB.templates[0].id, 0); });
  await p.evaluate(() => A.goDay('2026-11-10'));
  const hs = await p.evaluate(() => ({ rows: Math.min(...[...document.querySelectorAll('#tl .blk,#tl .gap')].map(e => e.getBoundingClientRect().height)), sm: Math.min(...[...document.querySelectorAll('.btn.sm')].map(e => e.getBoundingClientRect().height)), arw: Math.min(...[...document.querySelectorAll('.arw')].map(e => e.getBoundingClientRect().height)) }));
  await p.evaluate(() => A.applyTpl('2026-11-10', DB.templates[0].id));
  const rows = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#tl .blk,#tl .gap')].map(e => e.getBoundingClientRect().height)));
  await p.evaluate(() => { const x = day('2026-11-10').b[0]; A.openBlock('2026-11-10', x.id); });
  const seg = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#sh .seg button, #sh .stp button')].map(e => e.getBoundingClientRect().height)));
  await p.evaluate(() => A.closeSheet());
  T('Cibles tactiles ≥ 44 px (blocs, boutons, sélecteurs)', rows >= 43.5 && hs.sm >= 43.5 && hs.arw >= 43.5 && seg >= 43.5, `blocs ${rows.toFixed(3)} · boutons ${hs.sm.toFixed(3)} · flèches ${hs.arw.toFixed(3)} · sélecteurs ${seg.toFixed(3)} px`);
  const tall = await p.evaluate(() => document.querySelector('#tl').getBoundingClientRect().height);
  T('Agenda compact', tall < 1400, `${tall.toFixed(0)} px pour 24 h`);

  console.log('— Fiabilité (V1.1)');
  const n0 = await p.evaluate(() => day('2026-11-10').b.length);
  await p.evaluate(() => { const x = day('2026-11-10').b.find(z => z.n === 'Repas'); A.openBlock('2026-11-10', x.id); A.edDel(); });
  const vis = await p.evaluate(() => getComputedStyle($('#undo')).visibility);
  await p.click('#undo button');
  T('Annulation 10 s après suppression', vis === 'visible' && await p.evaluate(() => day('2026-11-10').b.length) === n0);
  await p.clock.setFixedTime(new Date('2026-11-13T09:00:00+01:00'));
  await p.evaluate(() => { for (const k of ['2026-11-11', '2026-11-12']) { const d = day(k, true); d.b = [{ id: uid(), s: 0, e: 72, n: 'x', c: 'obligatoire', i: 0, t: 'aucune', z: 1 }]; } save(); A.tab('maintenant'); });
  T('A11 journées non clôturées signalées', /4 journées à clôturer/.test(await p.textContent('#view')), (await p.textContent('#view')).match(/\d journées? à clôturer/)?.[0]);
  fs.writeFileSync('/tmp/bad.json', JSON.stringify({ v: 1, settings: { cap: 33 }, days: { '2026-01-01': { b: [{ s: 0, e: 10, c: 'pro', i: 1 }, { s: 5, e: 12, c: 'pro', i: 1 }, { s: 20, e: 99, c: 'pro', i: 1 }] }, 'x': {} } }));
  await p.evaluate(() => A.tab('reglages'));
  await p.setInputFiles('input[type=file]', '/tmp/bad.json'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.click('#sh button:has-text("Restaurer")')]);
  T('A7 restauration contrôlée + sauvegarde avant', !!dl && await p.evaluate(() => Object.keys(DB.days).length === 1 && DB.days['2026-01-01'].b.length === 1));
  await p.click('#undo button');
  await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('journee.v1')); o.v = 3; localStorage.setItem('journee.v1', JSON.stringify(o)); });
  await p.reload(); await p.waitForTimeout(200);
  await p.evaluate(() => { try { A.setNt(10); } catch (e) { } });
  T('A6 format plus récent (v3) : lecture seule, rien n’est réécrit', /Lecture seule/.test(await p.textContent('#view')) && await p.evaluate(() => JSON.parse(localStorage.getItem('journee.v1')).v) === 3);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('journee.v1', '{cassé'); }); await p.reload(); await p.waitForTimeout(200);
  T('Données illisibles : copie conservée', await p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('journee.v1.illisible.'))));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('journee.v1', JSON.stringify({ v: 1, settings: { cap: 30, ds: 240 }, days: {}, templates: [{ n: 'Ancien', b: [{ m: 240, d: 7, n: 'S', c: 'obligatoire', i: 0 }] }] })); });
  await p.reload(); await p.waitForTimeout(200);
  T('Ancienne base v1 (bascule 04:00, modèles sans jours) chargée sans perte', await p.evaluate(() => DB.settings.cap === 30 && DB.settings.ds === 240 && DB.templates[0].wd.length === 0 && DB.catalog.length > 0));

  console.log('— V1.3 : format compact et migration');
  const v1 = { v: 1, settings: { cap: 33, ds: 0 }, days: {} };
  for (let i = 0; i < 40; i++) { const k = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10); v1.days[k] = { ds: 0, b: [{ id: 'a' + i, s: 0, e: 19, n: 'Sommeil', c: 'obligatoire', i: 0, t: 'aucune', z: 1 }, { id: 'b' + i, s: 19, e: 72, n: 'Travail', c: 'pro', i: 0.5, t: 'standard', z: 0 }], snap: null, val: null, clo: 1.79e12, fat: 3 }; }
  await p.evaluate(v1 => { localStorage.clear(); localStorage.setItem('journee.v1', JSON.stringify(v1)); }, v1);
  const s1 = JSON.stringify(v1).length;
  await p.reload(); await p.waitForTimeout(300);
  const mig = await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('journee.v1')); return { v: o.v, len: localStorage.getItem('journee.v1').length, bak: Object.keys(localStorage).filter(k => k.includes('avant-migration')).length, days: Object.keys(DB.days).length, b: DB.days['2026-09-01'].b.map(x => x.n + x.s + '-' + x.e + x.c + x.i).join('|') }; });
  T('Migration v1 → v2 : données intactes, copie v1 conservée', mig.v === 2 && mig.bak === 1 && mig.days === 40 && mig.b === 'Sommeil0-19obligatoire0|Travail19-72pro0.5', `${s1} → ${mig.len} caractères`);
  T('Migration annoncée', /format compact v2/.test(await p.textContent('#view')));
  await p.evaluate(() => A.noteOk());
  await p.evaluate(() => A.tab('reglages'));
  T('Copies de sécurité listées dans Réglages', /Copies de sécurité : 1/.test(await p.textContent('#view')));
  await p.evaluate(() => A.purgeCopies()); await p.click('#sh button:has-text("Supprimer")');
  T('Copies de sécurité supprimables', await p.evaluate(() => backupKeys().length === 0) && await p.evaluate(() => Object.keys(DB.days).length) === 40);
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.evaluate(() => A.exportJSON())]);
  let exported = null; if (dl2) { const f = '/tmp/save.json'; await dl2.saveAs(f); exported = JSON.parse(fs.readFileSync(f, 'utf8')); }
  T('Sauvegarde au format compact (repli téléchargement hors Android)', exported && exported.v === 2 && Array.isArray(exported.L) && dl2.suggestedFilename().endsWith('Sauvegarde.json'), dl2 ? dl2.suggestedFilename() : 'aucun');
  await p.evaluate(() => A.closeSheet());
  await p.evaluate(() => { DB.days = {}; save(); render(); });
  await p.setInputFiles('input[type=file]', '/tmp/save.json'); await p.waitForTimeout(300);
  await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.click('#sh button:has-text("Restaurer")')]);
  T('Restauration d’une sauvegarde compacte', await p.evaluate(() => Object.keys(DB.days).length) === 40);
  const vol = await p.evaluate(() => { const T = DB.templates[0]; let k = '2021-11-09'; for (let i = 0; i < 1826; i++) { const d = day(k, true); d.b = []; for (const x of tplBlocks(T, 0)) paint(d, x); d.snap = d.b.map(x => ({ ...x })); if (i % 2) d.b[4] = { ...d.b[4], i: 2 }; d.val = 1; d.clo = 1; d.fat = 3; k = addDays(k, 1); } const t0 = performance.now(); save(); return { len: USED, ms: performance.now() - t0 }; });
  T('5 ans de journées : stockage < 15 % du quota, écriture < 50 ms', vol.len < 0.75e6 && vol.ms < 50, `${(vol.len / 1e6).toFixed(2)} M car. (${Math.round(vol.len / 5e6 * 100)} %), ${vol.ms.toFixed(0)} ms`);

  console.log('— V1.3 : biais, fiabilité, échelle');
  await p.evaluate(() => { localStorage.clear(); DB = defaults(); DB.settings.first = false; save(); });
  await p.clock.setFixedTime(new Date('2026-11-09T10:30:00+01:00'));
  await p.evaluate(() => { const k = '2026-11-09'; A.applyTpl(k, DB.templates[0].id); A.validate(k); A.quick(2); A.goDay(k); });
  T('Journée : écart au plan affiché (+5 créneaux)', /écart au plan \+5 créneaux/.test(await p.textContent('#view')), (await p.textContent('#view')).match(/écart au plan[^·]*/)?.[0]);
  const mk = (corr) => p.evaluate(corr => { DB.days = {}; for (let i = 1; i <= 40; i++) { const k = addDays('2026-11-09', -i), f = 1 + (i % 5), e = corr ? 20 + f * 4 + (i % 3) : 30 + ((i * 7) % 11); const d = day(k, true); d.b = [{ id: uid(), s: 0, e: 19, n: 'S', c: 'obligatoire', i: 0, t: 'aucune', z: 1 }, { id: uid(), s: 19, e: 19 + e, n: 'T', c: 'pro', i: 1, t: 'aucune', z: 0 }, { id: uid(), s: 19 + e, e: 65 - (corr ? f : 0), n: 'L', c: 'perso', i: 0, t: 'aucune', z: 0 }, { id: uid(), s: 65 - (corr ? f : 0), e: 72, n: 'S', c: 'obligatoire', i: 0, t: 'aucune', z: 1 }]; d.snap = d.b.map(x => ({ ...x, i: x.i })); d.val = 1; d.clo = 1; d.fat = f; d.nc = 1; } save(); A.tab('stats'); }, corr);
  await mk(true); const st1 = await p.textContent('#view');
  T('Fiabilité : cotation corrélée → « lien démontré »', /Énergie consommée ↔ fatigue.*lien démontré/.test(st1), st1.match(/Énergie consommée ↔ fatigue[^S]*/)?.[0]);
  T('Fiabilité : sommeil plus court → fatigue plus forte détecté (r négatif)', /Sommeil de la nuit ↔ fatigue du jourr = −/.test(st1), st1.match(/Sommeil de la nuit[^S]*/)?.[0]);
  await p.evaluate(() => A.sShift(-1)); const st1b = await p.textContent('#view');
  T('Biais de planification affiché sur une semaine clôturée', /Biais d'énergie \(réel − plan\)0/.test(st1b) && /Temps changé de nature0 min\/j/.test(st1b), st1b.match(/Biais d'énergie[^J]*/)?.[0]);
  await mk(false); const st2 = await p.textContent('#view');
  T('Fiabilité : cotation sans lien → « non démontré » + conseil', /non démontré/.test(st2) && /revois les niveaux du catalogue/.test(st2));
  await p.evaluate(() => { A.tab('reglages'); });
  T('Échelle d’énergie dans Réglages (6 niveaux)', await p.locator('#view input[placeholder$="exemple réel"]').count() === 6);
  await p.evaluate(() => { A.setAnchor(3, 'Déménager des cartons 20 min'); });
  await p.reload(); await p.waitForTimeout(200);
  await p.evaluate(() => { A.applyTpl('2026-11-09', DB.templates[0].id); A.goDay('2026-11-09'); const x = day('2026-11-09').b.find(z => z.n === 'Travail standard'); A.openBlock('2026-11-09', x.id); A.edI(3); });
  const hint3 = await p.textContent('#sh');
  await p.evaluate(() => A.edI(2)); const hint2b = await p.textContent('#sh');
  await p.evaluate(() => A.edI(0)); const hint0 = await p.textContent('#sh');
  T('Repère du niveau affiché dans l’éditeur, persistant', /Repère 3 : Déménager des cartons/.test(hint3) && /Repère 2 : Appel de 20 min/.test(hint2b) && /Pas de repère pour le niveau 0/.test(hint0));
  await p.evaluate(() => A.closeSheet());
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  T('SW : version du cache = version de l’app', sw.includes('journee-' + await p.evaluate(() => APP_VERSION)));
  T('SW : seules les réponses valides en cache ; manifest.id', /res\.ok/.test(sw) && man.id === './');

  console.log('— V1.4');
  await p.evaluate(() => { localStorage.clear(); DB = defaults(); DB.settings.first = false; REV = 0; save(); });
  await p.clock.setFixedTime(new Date('2026-11-10T21:30:00+01:00'));
  // nuit : la veille (09/11) clôturée, bilan du 10/11
  await p.evaluate(() => { for (const k of ['2026-11-09', '2026-11-10']) { const d = day(k, true); for (const x of tplBlocks(DB.templates[0], 0)) paint(d, x); mergeAdj(d); const g = gaps(d.b)[0]; paint(d, { id: uid(), s: g.s, e: g.e, n: 'Loisir', c: 'perso', i: .5, t: 'aucune', z: 0 }); } const p = day('2026-11-09'); p.clo = 1; p.fat = 3; save(); A.goBilan('2026-11-10'); });
  const nightTxt = await p.textContent('#sh');
  T('Étape nuit pré-remplie depuis le modèle (21:40 la veille → 06:20)', /Bilan · nuit/.test(nightTxt) && await p.evaluate(() => UI.bl.night.c === -140 && UI.bl.night.l === 380), nightTxt.match(/Nuit : [^V]*/)?.[0]);
  T('Sélecteurs d’heure dans l’étape nuit', await p.locator('#sh select.tsel').count() === 2);
  await p.selectOption('#sh select.tsel >> nth=0', '-3'); await p.selectOption('#sh select.tsel >> nth=1', '18');
  const dur7 = /Nuit : 7 h/.test(await p.textContent('#sh'));
  await p.evaluate(() => A.nightOk());
  const nb = await p.evaluate(() => ({ P: day('2026-11-09').b.slice(-2).map(x => `${slotClock(x.s, 0)}–${slotClock(x.e, 0)} ${x.n}`).join(' | '), T: day('2026-11-10').b.slice(0, 2).map(x => `${slotClock(x.s, 0)}–${slotClock(x.e, 0)} ${x.n}`).join(' | '), nc: day('2026-11-10').nc, h: $('#sh h3').textContent }));
  T('Nuit validée : coucher 23:00, lever 06:00, voisins ajustés', dur7 && nb.P === '20:20–23:00 Loisir | 23:00–24:00 Sommeil' && nb.T === '00:00–06:00 Sommeil | 06:00–07:20 Préparation, petit-déjeuner' && nb.nc === 1 && /Bilan · 1 \//.test(nb.h), `${nb.P} / ${nb.T}`);
  await p.evaluate(() => { for (let i = 0; i < 30 && UI.bl && !UI.bl.night && /Bilan ·/.test($('#sh h3').textContent); i++) A.blRest(); });
  await p.evaluate(() => DB.backlog.push({ id: 'bk1', n: 'Facture EDF', c: 'obligatoire', i: 2, d: 1, t: 'aucune', z: 0, from: '2026-11-10' }));
  await p.evaluate(() => A.closeOk('2026-11-10', 3));
  T('Sommeil de la nuit confirmée compté (7 h)', await p.evaluate(() => sleepBefore(DB.days, '2026-11-10')) === 420);
  const prepTxt = await p.textContent('#sh');
  T('Après clôture : « Préparer » le lendemain proposé', /Préparer mer\. 11 nov\./.test(prepTxt) && /appliquer « Exemple semaine/.test(prepTxt) && /placer 1 tâche à replacer/.test(prepTxt));
  await p.click('#sh button:has-text("Préparer mer")');
  const d11 = await p.evaluate(() => ({ n: day('2026-11-11').b.length, edf: day('2026-11-11').b.some(x => x.n === 'Facture EDF'), back: DB.backlog.length, tab: UI.tab, dk: UI.dk }));
  T('Lendemain préparé : modèle appliqué, tâche placée, journée ouverte', d11.n >= 10 && d11.edf && d11.back === 0 && d11.tab === 'journee' && d11.dk === '2026-11-11', JSON.stringify(d11));
  // capacité jamais rétroactive
  const cap0 = await p.evaluate(() => capAt('2026-11-10'));
  await p.evaluate(() => A.applyCap(40));
  T('Capacité recalée après clôture : appliquée à partir du lendemain', cap0 === 33 && await p.evaluate(() => capAt('2026-11-10') === 33 && capAt('2026-11-11') === 40));
  await p.evaluate(() => A.tab('reglages'));
  T('Réglages : capacité future affichée', /33 aujourd'hui · 40 à partir du mer\. 11 nov\./.test(await p.textContent('#view')));
  // sélecteur d'heure dans l'éditeur
  await p.evaluate(() => { const x = day('2026-11-11').b.find(z => z.n === 'Trajet'); A.openBlock('2026-11-11', x.id); });
  T('Éditeur : 2 sélecteurs d’heure', await p.locator('#sh select.tsel').count() === 2);
  await p.selectOption('#sh select.tsel >> nth=1', '27');
  await p.evaluate(() => A.edSave());
  T('Fin choisie à 09:00 en un geste : le travail est raccourci', /07:20–09:00 obligatoire 0.5 Trajet \| 09:00–12:00 pro 1 Travail/.test(await blocks(p, '2026-11-11')));
  // deux fenêtres
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push('p2 ' + e.message));
  await p2.clock.install({ time: new Date('2026-11-10T21:40:00+01:00') });
  await p2.goto('http://localhost:8776/index.html'); await p2.waitForTimeout(300);
  await p.evaluate(() => { const d = day('2026-11-11'); d.b = d.b.filter(x => x.n !== 'Repas'); save(); render(); });
  await p2.waitForTimeout(300);
  T('Deux fenêtres : la seconde se met à jour toute seule', await p2.evaluate(() => !day('2026-11-11').b.some(x => x.n === 'Repas')));
  await p2.evaluate(() => { DB.templates.push({ id: 'w2', n: 'Ajout fenêtre 2', wd: [], b: [] }); save(); });
  await p.waitForTimeout(300);
  T('Deux fenêtres : aucune modification perdue', await p.evaluate(() => DB.templates.some(t => t.n === 'Ajout fenêtre 2') && !day('2026-11-11').b.some(x => x.n === 'Repas')));
  await p2.evaluate(() => { window.__noEvt = true; });
  await p.evaluate(() => localStorage.setItem('journee.v1.rev', '999'));   // écriture concurrente simulée
  await p2.waitForTimeout(200);
  await p2.evaluate(() => { REV = REV - 1; });                              // fenêtre 2 en retard d'une écriture
  const okSave = await p2.evaluate(() => { DB.settings.nt = 120; return save(); });
  const toast2 = await p2.textContent('#toast');
  T('Conflit d’écriture détecté : rechargement au lieu d’écraser', okSave === false && /autre fenêtre/.test(toast2) && await p2.evaluate(() => DB.settings.nt) !== 120);
  await p2.close();

  T('Aucune erreur JavaScript', errs.length === 0, errs.join(' | '));
  console.log(`\n${pass} OK / ${fail} échec(s)`);
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
