# Journée

PWA personnelle de suivi du temps et de l'énergie par créneaux de 20 minutes, avec le tri des sollicitations (onglet Trier) et un agenda de la semaine.
Depuis la 1.5, Journée intègre l'ancienne app **Trier** : une seule app, une seule installation, des données communes.
Principes : F. Olicard, *Votre temps est infini* (2019) et *Ce livre vous fera gagner du temps* (2025).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure et styles |
| `model.js` | Modèle : constantes, calculs, format de données, statistiques. Aucun accès au DOM ni au stockage |
| `trier.js` | Onglet Trier : capture, tri, tâches, planification dans Journée, 32e jour, réglages de Trier |
| `app.js` | Application : stockage, interface, agenda de la semaine, actions |
| `sw.js` | Service worker : cache hors ligne |
| `manifest.json` | Installation sur l'écran d'accueil |
| `icon.svg`, `icon-192.png`, `icon-512.png` | Icônes |
| `tests/unit_model.js` | 32 tests unitaires du modèle, sous Node, sans navigateur |
| `tests/tests_v14.js` | 65 tests de bout en bout de Journée (non-régression, Playwright + Chrome) |
| `tests/tests_v15.js` | 46 tests de bout en bout de Trier intégré, de la planification et de la semaine |

Les données ne sont **pas** dans le dépôt : elles restent dans le stockage local du téléphone (clé `journee.v1`, format compact v3, environ 280 caractères par jour plus les tâches). Un dépôt public ne publie donc que le code.

## Mise en ligne (GitHub Pages)

1. Créer un dépôt public, par exemple `journee`.
2. Déposer les fichiers à la racine du dépôt.
3. Activer Pages : Settings → Pages → Build and deployment → Source « Deploy from a branch » → branche `main`, dossier `/ (root)` → Save.
4. L'adresse est `https://<utilisateur>.github.io/journee/`. Compter 1 à 2 min pour la première publication.
5. Sur le Pixel, ouvrir l'adresse dans Chrome, puis menu ⋮ → « Installer l'application » ou « Ajouter à l'écran d'accueil ».

## Publier une mise à jour

1. Incrémenter `APP_VERSION` dans `model.js`, par exemple `1.5.0` → `1.5.1`.
2. Mettre la **même** version dans `VERSION` de `sw.js` (`journee-1.5.1`). Tout nouveau fichier doit aussi être ajouté à la liste `FILES` de `sw.js`.
3. Pousser les fichiers. À l'ouverture suivante, l'app affiche « Nouvelle version installée → Recharger ».

Si la version n'est pas changée dans `sw.js`, le téléphone garde l'ancienne version en cache.

## Trier dans Journée (1.5)

- **Onglet Trier** : capture (Entrée), tri en un appui (« Fait en moins de 2 min » ou matrice Faire / Planifier / Déléguer / Oublier), « Petit rien → boîte », « Plus tard » ; listes À faire maintenant, À planifier, Prévu, Délégué, Boîte du 32e jour ; « Si tu n'en fais qu'une aujourd'hui ».
- **Planifier** (bouton calendrier d'une tâche) : un jour obligatoire, une heure facultative, durée, nature, énergie, avec l'énergie du jour avant → après.
  - Avec heure : un bloc est posé (il recouvre ce qui est déjà planifié). Une journée vide reçoit d'abord son modèle.
  - Sans heure : la tâche attend ce jour-là. « Préparer » (après la clôture de la veille) ou « Placer » (onglet Journée) la pose dans le premier créneau libre assez long.
- **Lien tâche ↔ bloc** : même journée, même libellé. À la clôture, une tâche dont le bloc est là est faite ; sinon elle revient dans « À planifier ». Supprimer, renommer ou recouvrir le bloc avant la clôture la renvoie aussi dans « À planifier ». « Non fait → reporter » au bilan fait de même.
- **Agenda de la semaine** : onglet Journée → « Semaine ». Toucher un créneau libre pour y poser une tâche, un bloc pour le modifier, un jour pour l'ouvrir.
- La mesure (énergie, capacité, fatigue, fiabilité) est inchangée.

### Reprise des données de l'app Trier séparée

- Si Trier était servie depuis la même adresse `https://<utilisateur>.github.io`, ses données (clé `trier.v1`) sont reprises **automatiquement, une fois**, au premier lancement de Journée 1.5. Rien n'est remplacé ; `trier.v1` reste intact.
- Sinon : Trier → Réglages → Sauvegarde, puis Journée → Réglages → « Importer Trier ». Seules les tâches absentes sont ajoutées.
- Ensuite, désinstaller l'app Trier et supprimer son dépôt.
- Les caches restent séparés : le service worker ne supprime que les caches `journee-*`.

## Données

- Plusieurs fenêtres ouvertes (l'app installée et un onglet Chrome, par exemple) : chaque enregistrement incrémente `journee.v1.rev`. Les autres fenêtres se rechargent toutes seules, et une écriture concurrente est refusée au lieu d'écraser les données.

- Sauvegarde : Réglages → « Sauvegarde JSON ».
  - Sur Android, le menu de partage s'ouvre (Drive, Gmail…) avec le fichier `AAAA-MM-JJ - Journee - Sauvegarde.txt`. Chrome n'autorise pas le partage d'un `.json` ; le contenu est le même.
  - Ailleurs, le fichier est téléchargé au format `.json`.
  - « Restaurer » accepte les deux formats. L'app rappelle la sauvegarde au bout de 7 jours.
- Export pour Power Query : Réglages → « Export CSV », une ligne par créneau, séparateur `;`.
- Import Infinity Time V10 : lu directement si l'ancienne app est servie depuis la même origine (`https://<utilisateur>.github.io`, quel que soit le dépôt). Sinon, il faut coller le contenu.
- Format de données v3 (`SCHEMA = 3`) = v2 compact + objet `tr` (tâches, boîte, filtres, valeur horaire, 32e jour). Les données v1 et v2 sont converties au premier lancement ; la file « À replacer » de la v2 devient des tâches « À planifier ». Une copie de l'ancien format est conservée (Réglages → Données → Copies de sécurité).
  - Une version plus ancienne de l'app qui lit des données d'un format plus récent passe en lecture seule.
  - Les conversions de format se codent dans `migrate()` (`model.js`).

## Tests

```
node tests/unit_model.js          # modèle seul, aucune dépendance
npm i -D playwright
npx playwright install chromium
node tests/tests_v14.js .         # bout en bout, Journée
node tests/tests_v15.js .         # bout en bout, Trier intégré et semaine
```

Le script lance un serveur local et Chrome sans interface, au format 412 × 915 et en heure de Paris.
