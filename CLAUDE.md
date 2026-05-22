# CLAUDE.md — Touché Coulé

Règles de travail pour Claude Code sur ce projet. À lire en début de chaque session.

---

## Architecture du projet

Fichiers HTML statiques hébergés sur **GitHub Pages** (`seboss44120.github.io/touche-coule-ppa/`).
Aucun build, aucun bundler. Modification = commit + push = mise en production immédiate.

| Fichier | Rôle | PWA |
|---|---|---|
| `inscription.html` | Inscription joueurs aux tournois | Non |
| `tournoi-jeu.html` | Interface de jeu joueur | Oui — `manifest-joueur.json` |
| `capitaine.html` | Soumission de score capitaine | Oui — `manifest-joueur.json` |
| `admin.html` | Administration tournois | Oui — `manifest-admin.json` |
| `tournoi-capitaine-inscription.html` | Inscription capitaine | Non |

Backend : **Supabase** (DB + auth par token `?p=`). Emails : **EmailJS**.

---

## 0. Méthodologie obligatoire avant tout changement

Ces règles s'appliquent **sans exception**, quelle que soit l'urgence ou la simplicité apparente du sujet.

### 0a. Lire avant d'écrire

Avant de modifier quoi que ce soit :
1. **Lire l'intégralité du code concerné** — pas seulement la zone visible du symptôme.
2. **Lire les fichiers connexes** — un fix dans `tournoi-jeu.html` peut casser `capitaine.html` ; un script inline peut neutraliser une balise HTML plus haut.
3. **Tracer le chemin complet** de la fonctionnalité touchée, de bout en bout (ex : token → URL → script inline → manifest → installation PWA).

> Ce projet a subi des régressions parce que du code existant (ex : retrait du manifest pour iOS) n'avait pas été lu avant d'apporter des corrections adjacentes. Ne jamais supposer — lire.

### 0b. Diagnostiquer avant d'implémenter

- Identifier la **root cause** (cause racine) avant de proposer ou d'écrire la moindre correction.
- Ne jamais corriger un symptôme sans comprendre pourquoi il apparaît.
- Si la root cause n'est pas certaine, le dire explicitement : *"Je vois X, j'étudie Y avant de conclure."*
- Ne pas implémenter plusieurs hypothèses en cascade — chaque hypothèse non confirmée crée du bruit et potentiellement de nouvelles régressions.

### 0c. Vérifier l'impact croisé

Avant tout commit, se poser systématiquement ces questions :
- **Ce changement affecte-t-il un autre navigateur ou OS ?** (ex : fix iOS → impact Android ?)
- **Ce changement affecte-t-il une autre page ?** (ex : modification `tournoi-jeu.html` → `capitaine.html` ?)
- **Ce changement affecte-t-il le comportement hors-ligne ou en cache ?** (PWA, localStorage, manifest)
- **Ce changement interagit-il avec du code déjà en place ?** (scripts inline, meta tags, ordre de chargement)

### 0d. Tester avant de pousser

- Toute correction doit être vérifiée **avant** le commit, pas après.
- Pour les sujets PWA/mobile : si le test sur device physique n'est pas possible, le signaler **explicitement** avec les risques résiduels identifiés.
- Ne jamais pousser en production en espérant que ça fonctionne.

### 0e. Un problème = un commit

- Isoler chaque correction dans son propre commit avec un message décrivant la root cause, pas le symptôme.
- Ne pas grouper une correction fonctionnelle avec une correction PWA dans le même commit.

### 0f. Vérifier le déploiement avant de déboguer — règle absolue

**Avant tout test sur mobile ou signalement de régression**, vérifier que le code déployé correspond bien aux derniers commits locaux :

```powershell
git log --oneline origin/main..HEAD
# → doit retourner VIDE (aucun commit local non poussé)
# Si non vide : git push origin main AVANT de tester quoi que ce soit
```

> Cette règle existe parce qu'une journée entière de debug a été passée sur un "problème" qui n'en était pas un : les corrections étaient correctes mais n'avaient pas été poussées. GitHub Pages servait l'ancien code. Tout test sur du code non déployé est un faux problème par définition.

**Séquence obligatoire à chaque fin de session :**
1. `git log --oneline origin/main..HEAD` → vide ?
2. Si non : `git push origin main`
3. Attendre 1-2 min (délai GitHub Pages)
4. Alors seulement : tester sur mobile

---

## 1. Invariants PWA — vérifier AVANT tout commit sur un fichier HTML

Toute modification d'un fichier HTML lié à une PWA peut déclencher une re-vérification
du manifest par l'OS mobile, même si les balises PWA n'ont pas été touchées.
Un bug latent dans le PWA devient alors visible.

### Checklist PWA (run after every HTML edit)

```powershell
# Lancer depuis la racine du projet
# 1. Aucune apple-touch-icon ne doit pointer vers un SVG
Select-String -Path "*.html" -Pattern "apple-touch-icon.*\.svg"
# → doit retourner VIDE

# 2. Tous les fichiers avec manifest ont les 5 meta tags PWA
Select-String -Path "*.html" -Pattern "rel=""manifest"""  | Select-Object -ExpandProperty Path | ForEach-Object {
  $f = $_
  $content = Get-Content $f -Raw
  @("mobile-web-app-capable","apple-mobile-web-app-capable","apple-mobile-web-app-status-bar-style","apple-mobile-web-app-title","theme-color") | ForEach-Object {
    if ($content -notmatch $_) { Write-Warning "MANQUANT dans $f : $_" }
  }
}
# → doit retourner AUCUN warning
```

### Structure PWA requise dans chaque fichier HTML avec manifest

```html
<!-- PWA -->
<link rel="manifest" href="./manifest-*.json">
<link rel="apple-touch-icon" sizes="192x192" href="./icon-*-192.png">  <!-- PNG obligatoire, jamais SVG -->
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="TC ...">
<meta name="theme-color" content="#...">
<!-- /PWA -->
```

**Ne jamais modifier le bloc `<!-- PWA -->...<!-- /PWA -->` sans valider la checklist ci-dessus.**

---

## 2. Protocole de non-régression avant toute mise en production

Exécuter systématiquement avant chaque `git push`, dans l'ordre.

### 2a. Vérifications statiques (automatiques)

```powershell
# Clés Supabase : aucun token d'exemple ou expiré ne doit traîner
Select-String -Path "*.html" -Pattern "eyJ" | Select-Object Filename, LineNumber, Line

# EmailJS initialisé sur toutes les pages qui envoient des emails
Select-String -Path "admin.html","inscription.html" -Pattern "emailjs\.init"

# Aucune référence à l'ancienne Edge Function email
Select-String -Path "*.html" -Pattern "functions/v1/send-"
# → doit retourner VIDE (tout est migré vers EmailJS)
```

### 2b. Matrice de tests fonctionnels

Pour chaque fichier modifié, vérifier les scénarios ci-dessous.
Si un scénario ne peut pas être testé (mobile physique requis), **le signaler explicitement**.

#### `inscription.html`
- [ ] Chargement sans erreur console
- [ ] Connexion avec un token joueur valide (`?p=TOKEN`)
- [ ] Affichage des tournois disponibles
- [ ] Inscription à un tournoi → confirmation visible
- [ ] Email d'inscription reçu (EmailJS)

#### `tournoi-jeu.html`
- [ ] Chargement avec token valide (`?p=TOKEN`)
- [ ] Chargement sans token → message d'erreur clair (pas un crash)
- [ ] Navigation entre les onglets match
- [ ] Soumission d'un tir
- [ ] Notifications toast "à ton tour" fonctionnelles

#### `capitaine.html`
- [ ] Chargement et authentification
- [ ] Soumission du score

#### `admin.html`
- [ ] Connexion admin
- [ ] Affichage de la liste des tournois
- [ ] Promotion d'un joueur depuis la liste d'attente → email envoyé (EmailJS)
- [ ] Lancement d'un tournoi

### 2c. Vérification PWA (à faire après tout push qui touche un fichier HTML)

**Sur Android (Chrome) :**
- [ ] Supprimer l'ancienne icône de l'écran d'accueil
- [ ] Vider le cache Chrome pour le site (`chrome://settings/siteData`)
- [ ] Rouvrir la page → Chrome propose le bandeau d'installation PWA
- [ ] Installer → icône sans encadré blanc, ouverture sans barre de navigateur

**Sur iOS (Safari) :**
- [ ] Supprimer l'ancienne icône de l'écran d'accueil
- [ ] Ouvrir la page **avec le token dans l'URL** (`?p=TOKEN`) pour `tournoi-jeu.html`
- [ ] Partager → Ajouter à l'écran d'accueil
- [ ] Vérifier que l'icône est correcte (pas un carré blanc)
- [ ] Lancer depuis l'écran d'accueil → pas de barre Safari, pas d'erreur token

---

## 3. Règle sur les actions manuelles attendues

**À chaque fin de session**, Claude doit indiquer explicitement si des actions manuelles
sont nécessaires après le déploiement. Format standard :

```
⚠️ Actions manuelles requises après ce push :

CACHE / HARD REFRESH
- PC (Chrome) : Ctrl+Shift+R sur chaque page modifiée
- PC (Firefox) : Ctrl+Shift+R

PWA MOBILE (si un fichier HTML avec manifest a été modifié)
- Android : supprimer l'icône + vider le cache Chrome du site + réinstaller
- iOS : supprimer l'icône + rouvrir avec token dans l'URL + Partager → Ajouter à l'écran d'accueil

SUPABASE
- Si migration SQL : vérifier dans le Dashboard que la migration est appliquée
- Si nouvelle Edge Function : vérifier le déploiement dans Functions

Aucune action requise si : modification uniquement de style CSS inline, de texte visible,
ou de logique JS sans impact sur le chargement initial.
```

---

## 4. Règles générales de développement

- **Pas de modification croisée** : ne jamais modifier la logique de jeu en même temps qu'une correction de bug UI. Séparer en commits distincts.
- **Supabase API key** : utiliser uniquement la clé `anon` publique. Ne jamais commiter une clé `service_role`.
- **EmailJS** : la clé publique `nLjqyO0hdwGhLtiYs` est publique par nature (frontend). Pas de secret à protéger.
- **Tokens joueur** (`?p=TOKEN`) : ne jamais loguer ni afficher un token en clair dans une alerte ou un console.log visible en production.
- **GitHub Pages** : le site est entièrement statique. Toute logique serveur passe par Supabase (DB) ou EmailJS. Pas de backend propre.
