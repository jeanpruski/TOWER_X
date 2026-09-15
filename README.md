# TOWER X

**Une tour infinie. Un monde partagé. Toujours plus haut.**

Prototype jouable de la **Phase 1**, enrichi à la demande avec trois bonus, des bots compagnons, une garde-robe et cinq ambiances : platformer vertical multijoueur en navigateur, rendu pixel art original, serveur autoritaire et progression persistante.

## Jouer en local

Prérequis : **Node.js 22.12 ou supérieur** et npm. Dans ce dossier :

```bash
npm ci
npm run dev
```

Ouvrir **http://localhost:5173**, puis **Jouer en invité**. Le monde démarre sur le port 3001. Deux navigateurs, ou une fenêtre normale et une fenêtre privée, permettent de jouer à deux. Deux onglets partageant le même cookie représentent **le même mage** : la session la plus récente reprend le contrôle.

Le premier lancement ne nécessite pas PostgreSQL. Le mode développement écrit dans `.data/world.json`, par remplacement atomique. La clé de signature est créée dans `.data/session.key`. Ces fichiers sont locaux et ignorés par Git et Docker. Conservez-les pour retrouver le même monde et les identités invitées.

Les tests navigateur et de charge utilisent leurs propres mondes temporaires.

## Ce qui fonctionne

- Accueil responsive en français ; accès invité sans compte ; inscription et connexion email/mot de passe.
- Accueil actualisé : illustrations des mages, bots, bonus et pics ; section **Nouveautés** avec quatre aperçus animés et cinq décors au choix. Présentation des trois bonus, de la garde-robe et des pièces rares ; accès direct à la création de tenue et aux réglages. Les aperçus respectent la réduction des animations et cessent de tourner hors écran.
- Personnages personnalisables : **48 couleurs et 98 styles classiques** — 18 visages sans bec, 30 masques de peste, 30 chapeaux, 8 coiffures/accessoires de tête et 12 modèles de chaussures — plus **32 pièces rares** à collectionner, huit par catégorie. Tenue aléatoire pour les invités ; choix à l’inscription et modification à tout moment via **Garde-robe** pour les comptes. Apparence synchronisée dans le jeu, les avatars et les classements.
- **Choix du départ avant chaque entrée** : commencez à 0 m ou à votre camp sauvegardé, ou sélectionnez un joueur humain connecté pour arriver sur une plateforme stable près de lui. La liste affiche les apparences et hauteurs, avec actualisation toutes les 2,5 s. Cliquez sur **Commencer la partie** quand vous êtes prêt ; attendre ou fermer la fenêtre ne fait pas entrer votre personnage dans la tour.
- Profil, record personnel, dernier camp et collection persistants ; création d’un compte à partir de l’invité actuel en conservant ses trouvailles.
- **Cinq décors**, un changement tous les 100 m : ruines verdoyantes, forêt suspendue, cavernes de cristal, remparts de givre et sanctuaire astral. Palettes, végétation, cristaux, neige et ornements varient avec l’altitude.
- **20 architectures ordinaires conçues à la main et une brèche coopérative** : ponts brisés, piliers, balcons muraux, plateformes suspendues et terrasses. Hauteurs et largeurs variées, chemins facultatifs et raccourcis dorés ; assemblage déterministe à partir du seed du monde.
- **Navettes bleues, dalles friables et tremplins roses** : plateformes qui transportent les joueurs, sols qui cèdent après avertissement et grands rebonds sur les détours. Introduction progressive dès 20, 40 et 80 m, puis parcours de plus en plus exigeants avec la hauteur.
- Course, saut variable jusqu’à **78 pixels de haut** (environ 7,2 m, +75 % par rapport au premier prototype), coyote time, buffer de saut, glissade murale et wall-jump. Relâcher tôt conserve les petits sauts.
- Collisions entre joueurs, empilement, poussée avec cooldown, protection des camps et ghosting en cas de blocage prolongé.
- Animations de course, saut, chute, atterrissage et poussée ; pixels nets, poussière, geste du bras, cadre de portée, impact et son confirmés par le serveur. Le recul est franc même contre un bot qui arrive vers vous : il reste sonné pendant 0,42 s, avec des étoiles, sans pouvoir annuler le choc en sautant. Les appuis brefs sur saut/poussée sont mémorisés jusqu’au prochain tick.
- **Trois bonus** à ramasser automatiquement : plume (12 s de gravité réduite et saut amélioré), bottes (un super-saut), bulle (absorbe une poussée). Le bandeau en haut du cadre de jeu indique les bonus actifs, leur durée ou charge, et la recharge de poussée de 0,7 s. Cliquez sur un bonus pour lire son effet. Les textes restent nets au-dessus du filtre rétro ; les objets réapparaissent après 30 s.
- Jusqu’à **trois bots compagnons**, identifiés « BOT » et vêtus de noir avec masque ivoire, avec un compteur distinct des humains. Ils poursuivent leur ascension même si vous vous arrêtez, aident à faire la courte échelle et se tournent vers un humain à portée pour le pousser occasionnellement hors camp, avec 5 à 9 secondes de repos minimum selon la tentative. Ils suspendent leurs taquineries pendant l’entraide. Ils laissent les bonus aux humains et ne figurent pas dans les records persistants.
- **Passages à deux** à partir de 60 m, puis tous les 100 m : un écart de 88 px demande une courte échelle pour le saut normal. Le premier arrivé sur la plateforme haute déploie une passerelle pour son partenaire.
- Camps à **100 m** d’intervalle, retour au camp, chute physique dans les chunks inférieurs, reconnexion.
- Serveur à **30 Hz**, rendu Phaser à 60 FPS, prédiction locale et réconciliation ; interpolation des autres joueurs à 100 ms.
- Clavier reconfigurable, Gamepad API avec branchement à chaud, commandes tactiles d’appoint.
- Effets sonores uniquement, synthétisés localement avec volume réglable ; réduction des animations, écran légèrement bombé et scanlines rétro activés par défaut, désactivables séparément. Les anciennes préférences reçoivent ce duo une seule fois ; les choix suivants sont conservés.
- Noms, bonus, reliques et indications en texte net au-dessus du filtre rétro : fond sombre, 14 px sur grand écran et 12 px sur petit écran. Les étiquettes suivent les personnages sans déformer les lettres ; les noms se décalent en cas de regroupement.
- HUD : altitude actuelle, record, camp, frontière active, joueurs connectés et latence. Tableau des records et couronne du joueur actif le plus haut.
- Panneau en direct « Autour de vous » : les 5 joueurs devant et les 5 derrière, votre rang, leurs altitudes et l’écart vertical signé, même hors écran. Le compteur couvre tous les joueurs connectés au monde.
- PostgreSQL/Prisma, tests, métriques, Docker et reverse proxy HTTPS fournis.

Les autres mécaniques des Phases 2 et 3 — grab, autres power-ups, mécanismes sociaux, propriétés physiques spécifiques aux biomes et événements mondiaux — sont réservées à la suite.

Les trois premiers bonus apparaissent dans le premier tronçon ; les tronçons suivants en contiennent un chacun. Les passages ordinaires se franchissent sans bonus ; les brèches prévues pour deux demandent un partenaire humain ou bot avec le saut normal. Les effets disparaissent au retour au camp ; une reconnexion rapide retrouve l’état en cours. `BOT_COUNT=0..3` dans `.env` règle le nombre maximal de compagnons (3 par défaut) : les compagnons restent présents même quand d’autres humains arrivent, pour aider ceux qui restent en arrière. La tour vide ne simule aucun bot.

Le monde est désormais en **version 10** : les coffres tirent leur contenu parmi 32 rares, avec possibilité de doublon. Les emplacements déjà ouverts restent enregistrés. La géométrie reste celle de la version 8, avec une difficulté progressive. Au démarrage, les mondes plus anciens reçoivent aussi les tracés, ambiances, accessoires et pièges actuels. Les profils sans accessoires reçoivent un masque ivoire et un haut-de-forme. Le seed, les camps aux mêmes coordonnées, les records et les pièces acquises sont conservés. Les piliers et attaches sombres sous les plateformes sont du décor : seule leur surface supérieure claire porte les joueurs. Les surfaces sont dessinées devant les supports et restent opaques. Les dalles orange cassées indiquent « Dalle absente » jusqu’à leur retour. Les réceptions sur les bords sont vérifiées au moment où les pieds atteignent la plateforme, y compris quand elle bouge.

## Franchir les grandes brèches

À 60 m, 160 m, 260 m… le panneau **À DEUX** indique la zone d’entraide. Un personnage se place sur la marque claire, l’autre lui saute sur la tête. Relâchez puis appuyez de nouveau sur **Sauter** depuis ses épaules pour atteindre la passerelle haute.

Le premier qui atterrit en haut déroule automatiquement une marche intermédiaire. Elle reste déployée tant que quelqu’un se tient sur la plateforme haute, puis **8 secondes** après son départ : laissez le temps au partenaire de rejoindre le groupe.

Les bots noirs montent de façon autonome, se coordonnent entre eux et proposent leurs épaules. Ils peuvent redescendre pour aider un retardataire visible ; s’ils sont loin de tous les humains, ils rejoignent hors écran un joueur, en priorité près d’une brèche fermée. Ils conservent la même physique et les mêmes commandes que les joueurs. Avec `BOT_COUNT=0`, prévoyez un partenaire humain aux brèches ; certains bonus peuvent aussi permettre de les franchir.

## Une tour qui bouge

- **Dès 20 m : navettes bleues.** Leur rail montre la course ; rester dessus vous transporte. Le déplacement est horizontal, avec une oscillation de ±10 px au début, puis jusqu’à ±24 px plus haut (moins sur les appuis étroits), avec une période qui passe de 6 à 4 secondes. Observez le mouvement pour choisir votre saut.
- **Dès 40 m : dalles orange fissurées.** Le premier appui lance un avertissement de **1,2 s**, partagé entre tous les joueurs. Une barre se vide et des gravats tombent. La dalle cède, puis revient **5 s** après : repartez vite ou attendez son retour sur un autre palier.
- **Dès 80 m : tremplins roses.** Sur les chemins facultatifs, un atterrissage déclenche un rebond d’environ **133 px**, contre 78 px pour un saut normal. Dirigez-vous en l’air pour profiter du raccourci. Le tremplin ne consomme pas les bottes chargées.
- **Pics sur les corniches latérales**, à partir du tronçon de 40 m, puis dans les tronçons de 80 m, 140 m, 180 m… Les pointes ivoire, la base rouge et le panneau **⚠ Pics !** signalent les pièges. Touchez-les et vous revenez au dernier camp ; le record et les cosmétiques restent acquis. La bulle ne protège que des poussées. Les routes principales, camps et brèches coopératives gardent un passage sûr.

Les familles reviennent tous les 100 m. Les camps restent sûrs et les brèches à deux gardent leurs propres règles. Les bots suivent les navettes et attendent le retour d’un sol effondré. « Réduire les animations » diminue les particules ; les plateformes continuent leur mouvement de jeu.

## Difficulté progressive

Le parcours dépend de l’altitude actuelle et suit cinq paliers, indiqués près du compteur de hauteur :

| Hauteur | Palier | Parcours |
| --- | --- | --- |
| 0–99 m | Découverte | Appuis d’au moins 56 px, plateformes de repos supplémentaires ; sauts ordinaires de 48 px de haut au maximum. |
| 100–299 m | Ascension | Les appuis de repos disparaissent et les marches s’espacent ; plateformes encore généreuses. |
| 300–599 m | Agilité | Appuis plus fins, variations des hauteurs et navettes plus vives. |
| 600–999 m | Expert | Dalles fragiles supplémentaires et enchaînements plus précis. |
| À partir de 1 000 m | Vertige | Plateformes jusqu’à 24 px de large, montées jusqu’à 70 px et combinaison de navettes rapides et de dalles fragiles. |

Les paramètres plafonnent au palier Vertige pour garder les routes franchissables : les architectures continuent de varier plus haut. Les camps restent stables tous les 100 m. Les brèches coopératives conservent leur courte échelle de 88 px, avec une réception progressivement plus étroite et les bots pour aider. Les coffres rares gardent leurs emplacements et leur fréquence ; les records, camps et tenues sont conservés.

## Garde-robe et trouvailles

À l’inscription, choisissez la couleur et composez votre tenue dans les onglets **Visages**, **Masques**, **Coiffes** et **Chaussures**. Les visages proposent trois carnations, lunettes rondes ou de soleil, lunettes mécano, cache-œil, moustache, barbe, ninja, robot, squelette, citrouille, slime, cyclope, gobelin, chat et renard. Combinez-les aux chapeaux existants, aux boucles, à la tresse, à la crête punk, au casque audio, au bandeau, aux oreilles de lapin ou à la petite pousse ; **Tête nue** retire la coiffe. Le visage ou masque, la coiffe et les chaussures se choisissent indépendamment. Baskets, bottes hautes, souliers de lutin, sabots, sandales, pantoufles, solerets, chaussettes rayées, bottes à lacets, palmes et pattes de chat complètent les bottines. Les boutons **Tenue / Coiffe / Chaussures** permettent de colorer séparément chaque élément parmi 48 nuances ; les accessoires proposent aussi du cuir sombre. La couleur de coiffe peut revenir aux couleurs d’origine, assorties à la tenue pour les chapeaux en tissu. Les coiffes et chaussures rares conservent leur palette et leurs effets. En partie, le bouton **Garde-robe** ouvre le profil : choisissez vos pièces puis cliquez sur **Enregistrer**. La tenue est liée au compte et revient après connexion sur un autre appareil.

Les invités reçoivent un tirage indépendant parmi les pièces classiques et les 48 couleurs. Il est conservé tant que leur identité invitée reste disponible ; ils peuvent changer leur pseudo et ramasser les pièces rares. Créer un compte depuis ce profil conserve la progression et la collection, puis permet de s’équiper librement.

La garde-robe propose une recherche par nom et les filtres **Tout / Classiques / Rares**. Les aperçus des pièces rares verrouillées sont **floutés**, avec un cadenas net. Les noms restent lisibles. Le flou disparaît dès la découverte, même en invité ; l’équipement demande un compte.

Les coffres lumineux des chemins facultatifs se ramassent au contact. Il y en a **six fois moins** qu’à leur introduction : un coffre par tranche de 600 m, avec un emplacement déterministe qui varie selon le monde. Le premier se trouve dans un tronçon entre 400 et 580 m ; les tronçons contenant deux coffres successifs sont espacés de **420 à 780 m**. Chaque coffre tire une pièce parmi les 32 rares, à chances égales, **y compris celles déjà possédées** : une nouvelle découverte n’est pas garantie. Le jeu signale un doublon sans ajouter une seconde copie à la collection. Recharger la page ne change ni l’emplacement ni le contenu.

Chaque coffre s’ouvre **une seule fois par personnage**, même s’il contient un doublon, après une chute ou une reconnexion. Un autre joueur ne peut pas vous le prendre. L’inscription conserve les trouvailles et l’historique des coffres de l’invité. **Toutes les pièces déjà acquises restent dans la collection.** Les anciennes sauvegardes n’avaient pas d’historique des emplacements ouverts : cet historique commence avec la version 9, ce qui permet de revisiter une fois les anciens coffres sous ces nouvelles règles.

**32 rares répartis équitablement : 8 visages, 8 masques, 8 coiffes et 8 chaussures.**

| Pièce rare | Signature visible |
| --- | --- |
| Masque du lierre | Collerette de feuilles et lucioles vertes |
| Couronne sylvestre | Grands bois ramifiés et feuilles flottantes |
| Masque de cristal | Éventail de cristaux et éclats prismatiques |
| Couronne de givre | Hautes aiguilles de glace et flocons |
| Masque astral | Visage étoilé et anneau orbital violet |
| Panache du phénix | Ailes de feu et braises dorées |
| Visage du soleil | Rayons solaires et halo d’or |
| Diadème de l’éclipse | Lune suspendue et couronne orbitale |
| Oracle des abysses | Tentacules et perles bioluminescentes |
| Méduse céleste | Dôme translucide et filaments roses |
| Masque de l’orage | Ailettes électriques et arcs bleus |
| Heaume du dragon | Cornes géantes et ailes écarlates |
| Esprit de braise | Visage de feu et flammes latérales |
| Esprit du givre | Joues de glace et pointes givrées |
| Œil du néant | Grand œil violet dans une tête d’ombre |
| Dragon de jade | Cornes dorées et moustaches |
| Renard lunaire | Grandes oreilles blanches et marques lunaires |
| Idole d’or | Visage doré et yeux turquoise |
| Slime prismatique | Gelée arc-en-ciel et bulles irisées |
| Poupée de porcelaine | Joues roses, larmes d’or et dentelle |
| Masque d’obsidienne | Bec volcanique et fissures de lave |
| Scarabée royal | Élytres turquoise et antennes d’or |
| Couronne comète | Étoile suspendue et queue de comète |
| Mycélium enchanté | Grand champignon turquoise et spores |
| Foulées de comète | Bottes dorées et étoiles aux pieds |
| Patins de givre | Lames de glace et éclats bleus |
| Sabots de lave | Sabots fendus et braises rouges |
| Chaussons nuage | Nuages moelleux et volutes |
| Racines vivantes | Racines noueuses, feuilles et pollen |
| Grèves du néant | Armure violette et anneau d’ombre |
| Bottines de cristal | Pointes roses et éclats blancs |
| Sandales ailées | Ailes ivoire et attaches d’or |

Les silhouettes, auras et particules rares se voient sur tous les joueurs. Un losange doré reste visible près du personnage lorsque les pseudos sont masqués par la foule ; la mention **RARE** apparaît près du pseudo et dans « Autour de vous ». La réduction des animations conserve les ornements et fige l’aura.

Ces pièces changent l’apparence. Les cinq biomes conservent les mêmes règles de déplacement, y compris le givre.

## Commandes

| Action | Clavier par défaut | Manette standard |
| --- | --- | --- |
| Se déplacer | A / D ou ← / → | Stick gauche ou croix |
| Sauter | Espace, maintenir pour monter davantage | Bouton Sud |
| Pousser | E | Bouton Est ou Ouest |
| Menu | Échap | Start |
| Retour au camp | Bouton du HUD ou du menu | Menu |
| Retour au pied de la tour | Bouton dédié, puis confirmation | Menu, puis confirmation |
| Naviguer dans les menus | Tab / Maj + Tab, Entrée | Stick ou croix, Sud pour valider |
| Fermer un menu / annuler | Échap | Est ou Start |

Les réglages permettent de changer les touches. Les flèches restent disponibles. Dans les paramètres, la manette peut régler le volume par pas de 5 avec gauche / droite, activer les options avec le bouton Sud et revenir avec Est ou Start. La sélection est entourée et défile dans la fenêtre. Une touche de manette maintenue lors de la fermeture doit être relâchée avant de déclencher une action dans le jeu.

**Retour au pied de la tour** ouvre une confirmation, avec « Continuer l’ascension » sélectionné par défaut. Après validation, le personnage et son camp de retour passent à 0 m. Le record, les camps déjà visités, la tenue et la collection restent acquis ; les bonus temporaires disparaissent. Le retour habituel au dernier camp reste disponible séparément. Les poussées sont neutralisées à proximité immédiate des camps ; une protection de deux secondes accompagne l’arrivée ou le respawn.

## Monorepo

```text
apps/
  web/                 React, interface, Phaser, entrées, audio, client réseau
  game-server/         HTTP/auth, monde Socket.IO, simulation et observabilité
packages/
  shared/              Types, constantes, protocole versionné et validation Zod
  game-core/           Génération, physique commune et validateur headless
  db/                  Schéma/migration Prisma et adaptateurs de persistance
scripts/               Validation des chunks, charge, monde E2E, smoke test PostgreSQL
tests/                 Tests de physique, auth, réseau, persistance et navigateur
ops/                   Caddy et exemple de configuration de production
```

Les décisions et les limites sont détaillées dans [docs/architecture.md](docs/architecture.md). La procédure de validation est dans [docs/validation.md](docs/validation.md).

## PostgreSQL en développement

Créer une base vide PostgreSQL 16, copier `.env.example` en `.env`, puis renseigner :

```dotenv
DATABASE_URL=postgresql://tower:password@localhost:5432/tower?schema=public
```

```bash
npm run db:migrate
npm run dev
```

La CLI Prisma et le serveur lisent le `.env` à la racine. La génération du client est automatique après `npm ci`, ou disponible avec `npm run db:generate`. Le mode PostgreSQL est un **monde distinct** du mode fichier ; aucune migration implicite des sauvegardes locales n’est effectuée.

## Vérifications

```bash
npm run build           # TypeScript strict + build de production
npm test                # Tests unitaires et intégration HTTP/Socket.IO
npm run validate:chunks # 800 chunks solo et 200 traversées à deux
npm run test:e2e        # Parcours réels dans Chromium, bureau et mobile
npm run test:load       # 20 bots réseau, 30 secondes, monde temporaire
```

Si Chrome n’est pas présent sur macOS, ou sur Linux/CI :

```bash
npx playwright install chromium
```

Le test E2E réserve les ports **5181/3101, 5182/3102, 5184/3104 et 5185/3105**, dans quatre mondes temporaires sans toucher au monde local. Captures et traces se trouvent dans `test-results/`.

Pour varier la charge : `PLAYERS=5 DURATION=30 npm run test:load`. Le test accepte 1 à 20 bots et 5 à 300 secondes. Il échoue si la fréquence descend sous 27 Hz ou si le temps de tick au 95ᵉ percentile dépasse 33,3 ms.

## Debug

L’icône insecte sous le jeu affiche seed, chunk, colliders, tick, altitude et accusés de réception des entrées.

Pour se téléporter **uniquement en développement**, lancer avec `DEV_TOOLS=1` dans `.env`, entrer dans la tour, puis exécuter dans la console du navigateur :

```js
window.towerDebug.teleportToChunk(10)
```

Le helper envoie `devTeleport { v: 1, chunkIndex: 10 }` sur la session authentifiée. Il n’est pas exposé dans le bundle de production, et le serveur de production refuse aussi cette action. Utiliser un monde de test : les records y restent calculés par le serveur.

Observabilité locale :

- `http://localhost:3001/health` : processus, version, tick, joueurs et stockage.
- `http://localhost:3001/metrics` : joueurs, durée du tick, chunks actifs, mémoire, entrées rejetées.
- Journaux structurés Pino sur la sortie standard.
- RTT visible dans le HUD, mesuré par ping applicatif toutes les 2,5 secondes.

## Production : PlanetHoster The World

Voir le [guide de déploiement N0C](docs/deploiement-planethoster.md) pour le sous-domaine,
PostgreSQL et les commandes d'installation. Avec l'arborescence du guide, le fichier
de démarrage N0C est `project/app.cjs` ; la configuration est illustrée dans `ops/planethoster.env.example`.
La cible doit permettre les WebSockets et un seul processus de jeu persistant.

## Production : Docker + HTTPS

Les fichiers de déploiement sont prêts ; aucun hébergement public n’est provisionné par ce dépôt.

Sur un serveur disposant de Docker Compose, avec un domaine pointant vers son IP :

1. Copier `ops/production.env.example` vers `.env`.
2. Renseigner `DOMAIN`, un mot de passe PostgreSQL et une autre clé `SESSION_SECRET` de 32 caractères minimum. `openssl rand -hex 32` permet de générer chaque secret séparément.
3. Ouvrir les ports 80 et 443, puis lancer :

```bash
docker compose up -d --build
docker compose logs -f game
```

Caddy obtient le certificat TLS, transmet HTTP et WebSocket au jeu, et compresse les assets. Le jeu applique les migrations avant son démarrage. PostgreSQL utilise un volume nommé et n’expose pas de port public. `/metrics` est bloqué au niveau du proxy public ; il reste accessible depuis le réseau interne.

Le serveur refuse le démarrage de production sans PostgreSQL, clé de session et origine HTTPS. Cookies : HTTP-only, Secure en production, SameSite=Lax ; origines vérifiées, entrées validées, mots de passe Argon2id et rate limiting.

Un seul processus de monde doit écrire dans cette base. Pour utiliser PostgreSQL managé, remplacer `DATABASE_URL` du service `game` et retirer sa dépendance au service PostgreSQL local. Sauvegarder la base, conserver `SESSION_SECRET` entre déploiements et laisser le processus terminer proprement pour vidanger les écritures.

## Avant d’ouvrir la tour au public

Le code et les validations automatiques établissent un prototype fonctionnel. Il reste à faire un playtest humain à 1, 2, 5, 10 et 20 joueurs, essayer plusieurs manettes physiques et éprouver le réseau avec de la latence et des pertes réelles. Les instructions Docker doivent être exécutées sur la cible choisie pour valider TLS et le déploiement.

Le compte MVP n’a pas encore de vérification email ni de récupération de mot de passe. La progression est vidangée toutes les cinq secondes, aux camps, aux déconnexions et à l’arrêt propre ; un arrêt brutal peut perdre les dernières secondes non écrites. Voir les limites de persistance dans la documentation d’architecture.
