/* Journée — tests unitaires du modèle (sans navigateur) : node tests/unit_model.js */
const assert = require('node:assert/strict');
const path = require('node:path');
const M = require(path.join(__dirname, '..', 'model.js'));
let ok = 0, ko = 0;
const t = (name, fn) => { try { fn(); ok++; console.log('OK    ' + name); } catch (e) { ko++; console.log('ÉCHEC ' + name + ' — ' + e.message); } };
const B = (s, e, c = 'pro', i = 1, n = 'x', z = 0) => ({ id: M.uid(), s, e, c, i, n, t: 'aucune', z });
const sig = b => b.map(x => `${x.s}-${x.e}:${x.c}:${x.i}:${x.n}`).join(' ');

t('gaps : créneaux libres', () => assert.deepEqual(M.gaps([B(2, 5), B(10, 72)]), [{ s: 0, e: 2 }, { s: 5, e: 10 }]));
t('energy : coût = créneaux × niveau, borne « jusqu’à »', () => { const b = [B(0, 6, 'pro', 1), B(6, 9, 'pro', 2), B(9, 10, 'soi', -1)]; assert.equal(M.energy(b), 11); assert.equal(M.energy(b, 7), 8); });
t('paint : insertion au milieu découpe le bloc', () => { const d = { b: [B(0, 12, 'pro', 1, 'Travail')] }; M.paint(d, B(4, 6, 'pro', 2, 'Réunion')); assert.equal(sig(d.b), '0-4:pro:1:Travail 4-6:pro:2:Réunion 6-12:pro:1:Travail'); });
t('paint : un bloc qui en recouvre plusieurs les raccourcit', () => { const d = { b: [B(0, 3, 'obligatoire', 0, 'A'), B(3, 6, 'pro', 1, 'B'), B(6, 9, 'perso', 1, 'C')] }; M.paint(d, B(2, 7, 'nontemps', .5, 'X')); assert.equal(sig(d.b), '0-2:obligatoire:0:A 2-7:nontemps:0.5:X 7-9:perso:1:C'); });
t('tplBlocks : un bloc qui franchit 24:00 repart à 00:00', () => { const r = M.tplBlocks({ b: [{ m: 1300, d: 19, n: 'S', c: 'obligatoire', i: 0, t: 'aucune', z: 1 }] }, 0); assert.equal(r.map(x => x.s + '-' + x.e).join(','), '65-72,0-12'); });
t('mergeAdj : fusion des blocs contigus identiques', () => { const d = { b: [B(0, 5, 'obligatoire', 0, 'S', 1), B(5, 9, 'obligatoire', 0, 'S', 1), B(9, 10)] }; M.mergeAdj(d); assert.equal(sig(d.b), '0-9:obligatoire:0:S 9-10:pro:1:x'); });
t('pack / unpack : aller-retour sans perte (blocs, plan, statuts)', () => {
  const db = M.defaults(); const b = [B(0, 19, 'obligatoire', 0, 'Sommeil', 1), B(19, 40, 'pro', .5, 'Travail; "spécial"'), B(40, 72, 'soi', -1, '')];
  db.days['2026-11-09'] = { ds: 0, b, snap: b.map(x => ({ ...x })), val: 1.7e12, clo: 1.7e12, fat: 3, bt: 135 };
  db.days['2026-11-10'] = { ds: 240, b: [B(0, 72)], snap: [B(0, 36), B(36, 72, 'perso')], val: 1.7e12, clo: null, fat: null, bt: null };
  const txt = JSON.stringify(M.pack(db)), back = M.unpack(JSON.parse(txt));
  for (const k of Object.keys(db.days)) {
    assert.equal(sig(back.days[k].b), sig(db.days[k].b)); assert.equal(sig(back.days[k].snap), sig(db.days[k].snap));
    assert.equal(back.days[k].ds, db.days[k].ds); assert.equal(back.days[k].fat, db.days[k].fat); assert.equal(back.days[k].bt, db.days[k].bt); assert.equal(!!back.days[k].clo, !!db.days[k].clo);
  }
  assert.equal(JSON.parse(txt).days['2026-11-09'][6], 1, 'plan identique stocké comme 1');
});
t('pack : taille par journée type < 400 caractères', () => {
  const db = M.defaults(); const T = db.templates[0];
  for (let i = 0; i < 100; i++) { const d = { ds: 0, b: [], snap: null, val: 1.7e12, clo: 1.7e12, fat: 3, bt: 120 }; for (const x of M.tplBlocks(T, 0)) M.paint(d, x); d.snap = d.b.map(x => ({ ...x })); if (i % 2) { d.b[3] = { ...d.b[3], i: 2 }; } db.days[M.addDays('2026-01-01', i)] = d; }
  const per = (JSON.stringify(M.pack(db)).length - JSON.stringify(M.pack({ ...db, days: {} })).length) / 100;
  assert.ok(per < 400, per + ' car./jour');
  console.log('      → ' + per.toFixed(0) + ' caractères par journée (V1.2 : 1 905)');
});
t('normalize : rejette chevauchements et valeurs hors bornes', () => { const [n, bad] = M.normalize({ v: 1, settings: {}, days: { '2026-01-01': { b: [B(0, 10), B(5, 12), { s: 20, e: 99, c: 'pro', i: 1 }, { s: 30, e: 31, c: 'xx', i: 1 }, { s: 40, e: 41, c: 'pro', i: 7 }] } } }); assert.equal(n.days['2026-01-01'].b.length, 1); assert.equal(bad, 4); });
t('normalize : réglages et repères complétés', () => { const [n] = M.normalize({ v: 1, settings: { cap: 30, anchors: { '2': 'X' } }, days: {} }); assert.equal(n.settings.cap, 30); assert.equal(n.settings.anchors['2'], 'X'); assert.equal(n.settings.anchors['3'], ''); assert.equal(n.settings.ds, 0); });
t('migrate : v2 → forme mémoire, v1 inchangé', () => { const v1 = { v: 1, days: {} }; assert.equal(M.migrate(v1), v1); assert.equal(M.migrate({ v: 2, days: {}, L: [] }).v, 1); });
t('ranks : rangs moyens en cas d’égalité', () => assert.deepEqual(M.ranks([3, 1, 3, 2]), [3.5, 1, 3.5, 2]));
t('spearman : relation monotone = 1, inverse = −1', () => { assert.equal(M.spearman([1, 2, 3, 4], [10, 20, 30, 80]), 1); assert.equal(M.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1); });
t('rCrit : seuils de la table (n = 30 → 0,361 ; n = 100 → 0,197)', () => { assert.ok(Math.abs(M.rCrit(30) - 0.361) < 0.002); assert.ok(Math.abs(M.rCrit(100) - 0.197) < 0.002); });
t('planBias et natureChange', () => { const d = { b: [B(0, 6, 'pro', 2), B(6, 72, 'perso', 0)], snap: [B(0, 6, 'pro', 1), B(6, 72, 'pro', 0)] }; assert.equal(M.planBias(d), 6); assert.equal(M.natureChange(d), 66 * 20); });
t('sleepBefore : nuit confirmée uniquement, fin de veille + début du jour', () => { const S = (s, e) => B(s, e, 'obligatoire', 0, 'S', 1); const days = { '2026-11-08': { clo: 1, b: [B(0, 65), S(65, 72)] }, '2026-11-09': { clo: 1, nc: 1, b: [S(0, 19), B(19, 72)] } }; assert.equal(M.sleepBefore(days, '2026-11-09'), 520); days['2026-11-09'].nc = null; assert.equal(M.sleepBefore(days, '2026-11-09'), null); });
t('setNight : couché plus tard, levé plus tôt — les voisins suivent', () => { const S = (s, e) => B(s, e, 'obligatoire', 0, 'Sommeil', 1); const P = { b: [B(0, 61, 'perso', .5, 'Loisir'), S(61, 72)] }, T = { b: [S(0, 19), B(19, 22, 'obligatoire', .5, 'Prépa'), B(22, 72)] }; M.setNight(P, T, -60, 360); assert.equal(sig(P.b), '0-69:perso:0.5:Loisir 69-72:obligatoire:0:Sommeil'); assert.equal(sig(T.b), '0-18:obligatoire:0:Sommeil 18-22:obligatoire:0.5:Prépa 22-72:pro:1:x'); assert.equal(T.nc, 1); });
t('setNight : couché plus tôt, levé plus tard — le sommeil recouvre', () => { const S = (s, e) => B(s, e, 'obligatoire', 0, 'Sommeil', 1); const P = { b: [B(0, 65, 'perso', .5, 'Loisir'), S(65, 72)] }, T = { b: [S(0, 19), B(19, 22, 'obligatoire', .5, 'Prépa'), B(22, 72)] }; M.setNight(P, T, -180, 420); assert.equal(sig(P.b), '0-63:perso:0.5:Loisir 63-72:obligatoire:0:Sommeil'); assert.equal(sig(T.b), '0-21:obligatoire:0:Sommeil 21-22:obligatoire:0.5:Prépa 22-72:pro:1:x'); });
t('setNight : coucher après minuit — l’activité du soir continue sur le jour', () => { const S = (s, e) => B(s, e, 'obligatoire', 0, 'Sommeil', 1); const P = { b: [B(0, 65, 'perso', .5, 'Loisir'), S(65, 72)] }, T = { b: [S(0, 19), B(19, 72)] }; M.setNight(P, T, 40, 380); assert.equal(sig(P.b), '0-72:perso:0.5:Loisir'); assert.equal(sig(T.b), '0-2:perso:0.5:Loisir 2-19:obligatoire:0:Sommeil 19-72:pro:1:x'); const days = { a: { ...P, clo: 1 } }; assert.equal(M.sleepBefore({ '2026-11-08': { ...P, clo: 1 }, '2026-11-09': { ...T, clo: 1 } }, '2026-11-09'), 340); assert.deepEqual(M.nightOf(P, T), { c: 40, l: 380 }); });
t('nightOf : lecture des heures du modèle', () => { const S = (s, e) => B(s, e, 'obligatoire', 0, 'Sommeil', 1); assert.deepEqual(M.nightOf({ b: [B(0, 65), S(65, 72)] }, { b: [S(0, 19), B(19, 72)] }), { c: -140, l: 380 }); });
t('pack / unpack : nuit confirmée conservée', () => { const db = M.defaults(); db.days['2026-11-09'] = { ds: 0, b: [B(0, 72)], snap: null, val: null, clo: 1.7e12, fat: 3, bt: 60, nc: 1 }; const back = M.unpack(JSON.parse(JSON.stringify(M.pack(db)))); assert.equal(back.days['2026-11-09'].nc, 1); });
t('slotClock : 24:00 en fin de journée', () => assert.equal(M.slotClock(72, 0), '24:00'));
console.log(`\n${ok} OK / ${ko} échec(s)`); process.exit(ko ? 1 : 0);
