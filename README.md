# Journée

PWA personnelle de suivi du temps et de l'énergie par créneaux de 20 minutes.
Principes : F. Olicard, *Votre temps est infini* (2019) et *Ce livre vous fera gagner du temps* (2025).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure et styles |
| `model.js` | Modèle : constantes, calculs, format de données, statistiques. Aucun accès au DOM ni au stockage |
| `app.js` | Application : stockage, interface, actions |
| `sw.js` | Service worker : cache hors ligne |
| `manifest.json` | Installation sur l'écran d'accueil |
| `icon.svg`, `icon-192.png`, `icon-512.png` | Icônes |
| `tests/unit_model.js` | 22 tests unitaires du modèle, sous Node, sans navigateur |
| `tests/tests_v14.js` | 65 tests de bout en bout (Playwright + Chrome) |

Les données ne sont **pas** dans le dépôt : elles restent dans le stockage local du téléphone (clé `journee.v1`, format compact v2, environ 280 caractères par jour). Un dépôt public ne publie donc que le code.

## Mise en ligne (GitHub Pages)

1. Créer un dépôt public, par exemple `journee`.
2. Déposer les fichiers à la racine du dépôt.
3. Activer Pages : Settings → Pages → Build and deployment → Source « Deploy from a branch » → branche `main`, dossier `/ (root)` → Save.
4. L'adresse est `https://<utilisateur>.github.io/journee/`. Compter 1 à 2 min pour la première publication.
5. Sur le Pixel, ouvrir l'adresse dans Chrome, puis menu ⋮ → « Installer l'application » ou « Ajouter à l'écran d'accueil ».

## Publier une mise à jour

1. Incrémenter `APP_VERSION` dans `model.js`, par exemple `1.4.1` → `1.4.2`.
2. Mettre la **même** version dans `VERSION` de `sw.js` (`journee-1.4.2`). Tout nouveau fichier doit aussi être ajouté à la liste `FILES` de `sw.js`.
3. Pousser les fichiers. À l'ouverture suivante, l'app affiche « Nouvelle version installée → Recharger ».

Si la version n'est pas changée dans `sw.js`, le téléphone garde l'ancienne version en cache.

## Cohabitation avec d'autres apps sur la même adresse

Journée et Trier peuvent être servies depuis la même adresse `https://<utilisateur>.github.io`. Elles restent indépendantes :
- **Stockage** : Journée n'utilise que les clés `journee.v1*`, et Trier que `trier.v1*`.
- **Caches** : depuis la 1.4.1, le service worker ne supprime que les caches dont le nom commence par `journee-`. Avant, il effaçait aussi le cache de Trier, qui ne s'ouvrait plus hors ligne après une mise à jour de Journée.

## Données

- Plusieurs fenêtres ouvertes (l'app installée et un onglet Chrome, par exemple) : chaque enregistrement incrémente `journee.v1.rev`. Les autres fenêtres se rechargent toutes seules, et une écriture concurrente est refusée au lieu d'écraser les données.

- Sauvegarde : Réglages → « Sauvegarde JSON ».
  - Sur Android, le menu de partage s'ouvre (Drive, Gmail…) avec le fichier `AAAA-MM-JJ - Journee - Sauvegarde.txt`. Chrome n'autorise pas le partage d'un `.json` ; le contenu est le même.
  - Ailleurs, le fichier est téléchargé au format `.json`.
  - « Restaurer » accepte les deux formats. L'app rappelle la sauvegarde au bout de 7 jours.
- Export pour Power Query : Réglages → « Export CSV », une ligne par créneau, séparateur `;`.
- Import Infinity Time V10 : lu directement si l'ancienne app est servie depuis la même origine (`https://<utilisateur>.github.io`, quel que soit le dépôt). Sinon, il faut coller le contenu.
- Format de données v2 (`SCHEMA = 2`, compact). Les données v1 sont converties au premier lancement, et une copie de l'ancien format est conservée (Réglages → Données → Copies de sécurité).
  - Une version plus ancienne de l'app qui lit des données d'un format plus récent passe en lecture seule.
  - Les conversions de format se codent dans `migrate()` (`model.js`).

## Tests

```
node tests/unit_model.js          # modèle seul, aucune dépendance
npm i -D playwright
npx playwright install chromium
node tests/tests_v14.js .         # bout en bout
```

Le script lance un serveur local et Chrome sans interface, au format 412 × 915 et en heure de Paris.
