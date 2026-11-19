<div align="center">

<a href="https://tickdone.pages.dev"><img src="public/favicon.svg" width="88" height="88" alt="Logo de TickDone"></a>

<h1>TickDone</h1>

<p><b>Planifiez votre journée, concentrez-vous sur l'essentiel et gardez de bonnes habitudes, directement dans votre navigateur.</b></p>

<p>
  <a href="https://github.com/suica/tickdone/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/suica/tickdone/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="LICENSE"><img alt="Licence MIT" src="https://img.shields.io/badge/licence-MIT-4772fa?style=flat-square"></a>
  <a href="https://tickdone.pages.dev"><img alt="Démo en ligne" src="https://img.shields.io/badge/démo-tickdone.pages.dev-4772fa?style=flat-square"></a>
  <a href="#-langues"><img alt="10 langues" src="https://img.shields.io/badge/i18n-10_langues-7c5cff?style=flat-square"></a>
  <a href="#-contribuer"><img alt="PR bienvenues" src="https://img.shields.io/badge/PR-bienvenues-2fbf71?style=flat-square"></a>
</p>

<p>
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <b>Français</b> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a> ·
  <a href="README.ru.md">Русский</a>
</p>

<a href="https://tickdone.pages.dev"><img src="docs/hero/hero.fr.png" width="100%" alt="Illustration de TickDone sur un ordinateur portable et un téléphone : listes de tâches, détails d'une tâche et calendrier du mois"></a>

<p>
  <a href="https://tickdone.pages.dev"><b>Ouvrir l'application</b></a> ·
  <a href="#-fonctionnalités"><b>Fonctionnalités</b></a> ·
  <a href="#-démarrage-rapide"><b>Démarrage rapide</b></a> ·
  <a href="#️-feuille-de-route"><b>Feuille de route</b></a> ·
  <a href="#-contribuer"><b>Contribuer</b></a>
</p>

</div>

TickDone est une liste de tâches et un outil de gestion du temps, gratuit et open source, qui fonctionne dans votre navigateur. Notez vos tâches comme elles vous viennent, placez-les dans le calendrier, classez-les selon leur urgence et leur importance, avancez avec un minuteur de concentration et tenez vos habitudes, le tout au même endroit.

> [!NOTE]
> **Vos données restent chez vous.** Tout est enregistré dans le stockage local de votre navigateur : pas de compte, pas d'inscription, et vos tâches ne quittent jamais votre appareil. Seule l'adresse d'un calendrier auquel vous vous abonnez passe par le serveur de TickDone : un petit proxy le récupère pour vous sans rien conserver. Vous pouvez exporter une sauvegarde à tout moment depuis les Réglages.

## ✨ Fonctionnalités

- ✅ **Tâches et listes** : Aujourd'hui, Demain, 7 prochains jours et Boîte de réception, ainsi que Terminées, Abandonnées et Corbeille ; vos propres listes, dossiers et étiquettes ; sous-tâches, notes, priorités, dates et heures d'échéance, rappels et règles de répétition ; épinglage et menu contextuel sur chaque tâche.
- ⚡ **Ajout rapide intelligent** : tapez `call mom tomorrow 3pm !high #family ~Personal` et TickDone définit la date, l'heure, la priorité, l'étiquette et la liste, en surlignant chaque élément pendant la saisie. Il comprend aussi le chinois.
- 🗂️ **Vues liste et kanban**, avec regroupement et tri.
- 📏 **Vue chronologique** des listes : les tâches sont des barres sur leurs jours (un losange pour un seul jour), groupées par section, avec une ligne d’aujourd’hui et un zoom jour, semaine ou mois. Faites glisser une barre pour la déplacer, ses extrémités pour changer le début et la fin, et les tâches sans date depuis le panneau Sans date ; tout peut être annulé. Sur téléphone, la liste s’affiche à la place.
- 🗄️ **Listes archivées** : archivez une liste terminée depuis son menu. Elle passe dans la section repliée « Listes archivées », ses tâches quittent les listes intelligentes, le calendrier, la matrice et la recherche, et elle s’ouvre en lecture seule jusqu’à ce que vous la désarchiviez.
- 🔎 **Filtres enregistrés** : combinez listes, étiquettes, priorités, dates (en retard, aujourd’hui, cette semaine, une période personnalisée…), mots-clés et tâches terminées en une liste intelligente à vous, avec son nom, son icône et sa couleur dans la barre latérale.
- 📝 **Markdown dans les notes** : titres, gras, italique, barré, code, liens, listes, citations et listes de contrôle à cocher directement dans la note ; tapez `**gras**`, `# ` ou `- [ ] ` et la mise en forme s’applique pendant la saisie, la note restant enregistrée en Markdown.
- 🔁 **Règles de répétition** : tous les N jours, semaines, mois ou ans ; jours de la semaine choisis ; le jour N, le dernier jour ou le N-ième/dernier jour de semaine du mois ; une date chaque année ; jours ouvrés uniquement. Fin après N fois ou à une date, calcul depuis l’échéance ou l’achèvement, occurrence à ignorer, et « every 2 weeks » reconnu dans l’ajout rapide.
- 📅 **Calendrier** avec vues mois, semaine, jour et liste. Faites glisser une tâche vers un autre jour ou une autre heure, ou tirez le bord inférieur d'un bloc pour changer sa durée.
- 🗓️ **Planifier dans le calendrier** : un panneau « Sans date » à côté des vues semaine et jour (une feuille en bas de l'écran sur téléphone) liste les tâches ouvertes qui n'ont pas encore de date, filtrées par liste. Faites-en glisser une sur un jour ou une heure pour la planifier, ou remettez une tâche sur le panneau pour retirer sa date, avec annulation depuis le message. La vue agenda montre les jours à venir dans une seule liste défilante, avec vos tâches et les événements de vos calendriers abonnés.
- 🔔 **Abonnements à des calendriers** : abonnez-vous à tout calendrier qui publie une adresse iCal (.ics ou webcal://), comme ceux du travail, de l’école, de l’équipe ou des jours fériés, et voyez ses événements dans le calendrier, en lecture seule et dans leur propre couleur. Ils se mettent à jour d’eux-mêmes et restent disponibles hors ligne.
- 🧭 **Matrice d'Eisenhower** : classez les tâches selon leur urgence et leur importance, et faites-les glisser d'un quadrant à l'autre pour changer leur priorité.
- 🍅 **Minuteur de concentration** avec modes Pomodoro et chronomètre, et un historique des sessions passées.
- 🔥 **Suivi des habitudes** avec validations, séries et statistiques.
- 📊 **Statistiques** : tâches terminées par jour, semaine ou mois, taux de réalisation, tâches en retard, répartition par liste, priorité et étiquette, et votre série ; temps de concentration par jour, sessions, temps par tâche et par liste, et votre meilleur moment de la journée ; taux de validation et séries de vos habitudes. Choisissez une semaine, un mois, une année, les 30 derniers jours ou votre propre période, et survolez ou touchez un graphique pour le détail.
- 🔍 **Recherche** dans les tâches, les étiquettes et les listes.
- ↩️ **Annulation** depuis la notification après avoir terminé, supprimé ou déplacé une tâche.
- ⌨️ **Raccourcis clavier**.
- 🎨 **Thèmes et couleurs d’accent** : clair, sombre ou comme le système, et huit couleurs d’accent pour les boutons, les cases, la sélection et les contours de focus. Les changements s’appliquent tout de suite, avec un aperçu dans les Réglages, et l’écran de démarrage et l’icône de l’onglet suivent.
- ⏰ **Rappels** : à l'heure du rappel d'une tâche, TickDone affiche une carte pour la terminer, la reporter (5 min, 15 min, 1 heure, demain) ou l'ouvrir, et une notification système si vous l'autorisez. TickDone n'a pas de serveur : les rappels se déclenchent tant qu'il est ouvert dans un onglet, ou installé et en cours d'exécution ; ceux arrivés pendant qu'il était fermé s'affichent à la prochaine ouverture.
- 📲 **Installez-le comme une application** : ajoutez TickDone à l'écran d'accueil ou au Dock depuis Paramètres → À propos ; il s'ouvre hors ligne après la première visite. Quand une nouvelle version sort, un message propose de recharger.
- 💾 **Sauvegarde et restauration** : exportez tout dans un fichier JSON et réimportez-le.
- 🚀 **Rapide avec des milliers de tâches** : les longues listes et les résultats de recherche n'affichent que les lignes visibles, si bien qu'une liste de 5 000 tâches défile, change et réagit aussi vite qu'une courte, avec le glisser-déposer, le clavier, la sélection multiple et l'animation de fin qui marchent comme avant. Les modifications sont enregistrées en arrière-plan.
- ♿ **Accessible** : tout se fait au clavier, avec un indicateur de focus visible et un lien d'accès direct au contenu ; les boîtes de dialogue, menus et panneaux gardent le focus et le rendent à la fermeture ; les lecteurs d'écran disposent de régions, de titres, de boutons et de cases nommés, et chaque notification est annoncée. Les tâches montent et descendent avec Alt+↑ / Alt+↓ ou depuis leur menu, en alternative au glisser-déposer. Le texte respecte le contraste WCAG AA en clair comme en sombre, et les modes à contraste élevé et la réduction des animations sont pris en compte. Une vérification automatique passe sur chaque écran.

## 📸 Captures d'écran

<table>
  <tr>
    <td colspan="2"><img src="docs/screenshots/fr/desktop-tasks.png" alt="Tâches"></td>
  </tr>
  <tr>
    <th>Calendrier</th>
    <th>Matrice</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/fr/desktop-calendar.png" alt="Calendrier"></td>
    <td><img src="docs/screenshots/fr/desktop-matrix.png" alt="Matrice"></td>
  </tr>
  <tr>
    <th>Concentration</th>
    <th>Habitudes</th>
  </tr>
  <tr>
    <td><img src="docs/screenshots/fr/desktop-focus.png" alt="Concentration"></td>
    <td><img src="docs/screenshots/fr/desktop-habits.png" alt="Habitudes"></td>
  </tr>
</table>

<table>
  <tr>
    <td><img src="docs/screenshots/fr/phone-tasks.png" alt="sur mobile : Tâches"></td>
    <td><img src="docs/screenshots/fr/phone-calendar.png" alt="sur mobile : Calendrier"></td>
    <td><img src="docs/screenshots/fr/phone-matrix.png" alt="sur mobile : Matrice"></td>
    <td><img src="docs/screenshots/fr/phone-focus.png" alt="sur mobile : Concentration"></td>
    <td><img src="docs/screenshots/fr/phone-habits.png" alt="sur mobile : Habitudes"></td>
  </tr>
</table>

## 🚀 Démarrage rapide

**En ligne :** ouvrez [tickdone.pages.dev](https://tickdone.pages.dev). Rien à installer.

**En local** (Node.js 24 requis) :

```sh
git clone https://github.com/suica/tickdone.git
cd tickdone
npm install
npm run dev        # http://localhost:5173
```

## ⌨️ Raccourcis clavier

| Touche | Action |
|---|---|
| `N` | Nouvelle tâche |
| `Ctrl/⌘ F` | Rechercher |
| `Alt 1`–`Alt 6` | Changer de module |
| `Ctrl/⌘ Z` | Annuler, tant que la notification d'annulation est affichée |
| `Esc` | Effacer la sélection ou fermer les détails de la tâche |
| `↑` `↓` / `J` `K` | Tâche précédente / suivante de la liste |
| `Shift ↑` `Shift ↓` | Étendre la sélection |
| `Ctrl/⌘ Click` | Ajouter une tâche à la sélection ou l’en retirer |
| `Shift Click` | Sélectionner une plage de tâches |
| `Ctrl/⌘ A` | Sélectionner toutes les tâches de la liste |
| `Enter` | Modifier le titre |
| `Space` / `Ctrl/⌘ Enter` | Terminer ou rouvrir |
| `1` `2` `3` `4` | Priorité : haute, moyenne, basse, aucune |
| `T` / `M` / `W` | Date : aujourd’hui, demain, la semaine prochaine |
| `D` / `Shift D` | Choisir une date / effacer la date |
| `Delete` / `Backspace` | Mettre à la corbeille (annulable depuis la notification) |
| `?` | Afficher tous les raccourcis |

## 🌍 Langues

Ce README existe en 10 langues : English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português (Brasil) et Русский. Toute l'interface est traduite dans ces 10 langues. TickDone suit la langue de votre navigateur, et vous pouvez en changer à tout moment dans les Réglages. L'ajout rapide comprend les dates écrites en anglais ou en chinois, et les mots de priorité dans les 10 langues.

Une traduction vous semble maladroite ? L'anglais fait foi : corrigez le texte dans `src/i18n/` ou dans `README.<locale>.md` et ouvrez une pull request.

## 🗺️ Feuille de route

Chaque élément renvoie vers son issue. Les éléments cochés sont déjà en ligne sur [tickdone.pages.dev](https://tickdone.pages.dev).

- [x] Tâches, listes, étiquettes, ajout rapide, calendrier, matrice d'Eisenhower, minuteur de concentration et suivi des habitudes
- [x] CI avec tests unitaires et de bout en bout ([#7](https://github.com/suica/tickdone/issues/7))
- [x] Open source : README en 10 langues, licence MIT, règles du projet ([#10](https://github.com/suica/tickdone/issues/10))
- [x] Mises en page pour téléphones, tablettes et grands écrans ([#8](https://github.com/suica/tickdone/issues/8))
- [x] Glisser-déposer partout ([#9](https://github.com/suica/tickdone/issues/9))
- [x] Animations ([#3](https://github.com/suica/tickdone/issues/3))
- [x] Lien GitHub et section « À propos » dans l'app ([#4](https://github.com/suica/tickdone/issues/4))
- [x] Interface en 10 langues ([#14](https://github.com/suica/tickdone/issues/14))
- [x] Finitions de l'interface, écran par écran ([#11](https://github.com/suica/tickdone/issues/11))
- [x] Sélection multiple et modification groupée ([#15](https://github.com/suica/tickdone/issues/15))
- [x] Navigation au clavier dans les listes de tâches ([#16](https://github.com/suica/tickdone/issues/16))
- [x] Notifications de rappel ([#17](https://github.com/suica/tickdone/issues/17))
- [x] Installation comme application et utilisation hors ligne ([#18](https://github.com/suica/tickdone/issues/18))
- [x] Filtres enregistrés ([#19](https://github.com/suica/tickdone/issues/19))
- [x] Statistiques des tâches, du minuteur de concentration et du suivi des habitudes ([#20](https://github.com/suica/tickdone/issues/20))
- [x] Markdown dans les notes des tâches ([#21](https://github.com/suica/tickdone/issues/21))
- [x] Vue chronologique ([#22](https://github.com/suica/tickdone/issues/22))
- [x] Plus de règles de répétition ([#23](https://github.com/suica/tickdone/issues/23))
- [x] Archivage des listes ([#24](https://github.com/suica/tickdone/issues/24))
- [ ] Plus de règles de répétition ([#23](https://github.com/suica/tickdone/issues/23))
- [x] Archivage des listes ([#24](https://github.com/suica/tickdone/issues/24))
- [x] Accessibilité ([#25](https://github.com/suica/tickdone/issues/25))
- [x] Rapide même avec des milliers de tâches ([#26](https://github.com/suica/tickdone/issues/26))
- [x] Thèmes et couleurs d'accentuation ([#27](https://github.com/suica/tickdone/issues/27))
- [x] Calendrier : planifier les tâches sans date, vue agenda ([#28](https://github.com/suica/tickdone/issues/28))
- [x] Abonnements à des calendriers ([#51](https://github.com/suica/tickdone/issues/51))

## 🧰 Technologies

| Partie | Réalisée avec |
|---|---|
| ⚛️ Interface | React 19 et TypeScript |
| 📆 Dates | date-fns, la seule dépendance d'exécution en dehors de React |
| ⚡ Build | Vite |
| 💾 Stockage | `localStorage` dans le navigateur, sans backend |
| 🧪 Tests | Vitest (unitaires) et Playwright (de bout en bout) |
| 🧹 Lint | oxlint |
| ☁️ Hébergement | Cloudflare Pages |

## 🛠️ Développement

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

- 🖼️ La bannière et les captures des README sont générées à partir d'un build de production : `npm run build`, puis `node scripts/promo/render.mjs` (les options sont décrites en tête du [script](scripts/promo/render.mjs)).
- 🗺️ `node scripts/roadmap.mjs done <issue>` coche un élément de la feuille de route dans tous les README.

## 🚢 Déploiement

Le site en ligne est hébergé sur Cloudflare Pages :

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## 🤝 Contribuer

Les issues et les pull requests sont les bienvenues ! Avant de commencer, lisez [AGENTS.md](AGENTS.md) : il réunit les règles du projet, pour les personnes comme pour les agents de programmation.

- 💬 chaque changement part d'une issue et arrive par une pull request qui la mentionne ;
- 🌐 l'anglais est la langue de travail, et chaque texte visible par l'utilisateur est traduit dans les 10 langues ;
- 📐 les écrans fonctionnent à toutes les largeurs, d'un téléphone de 360 px à un écran de 2560 px, avec des conventions communes pour les animations et le glisser-déposer ;
- ✅ la CI (lint, vérification des types et build, tests unitaires et de bout en bout) doit être au vert avant toute fusion.

Si TickDone vous aide à avancer, une ⭐ sur GitHub aide d'autres personnes à le découvrir.

## 📄 Licence

[MIT](LICENSE) © 2026 suica
