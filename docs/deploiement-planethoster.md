# Déployer TOWER X sur PlanetHoster The World (N0C)

Le serveur Node.js fournit le site compilé, les comptes et le multijoueur sur
le même sous-domaine. Les sauvegardes de production vont dans PostgreSQL.
Cette procédure utilise `towerx-start.cjs` à la racine de l'application N0C.
Ce petit lanceur charge `project/app.cjs`, qui démarre le jeu dans le même processus.

## 1. Préparer l'hébergement

Dans N0C, ouvrir **Langages → Node.js**. Il faut une version **22.12 ou supérieure**.
Le sous-domaine doit être rattaché à ce compte d'hébergement et disposer d'un
certificat HTTPS valide. Le jeu sera accessible à sa racine, par exemple
`https://tower.example.com/`.

Le support PlanetHoster confirme que N0C ne permet pas WebSocket et recommande
Socket.IO sans WebSocket. Le jeu utilise donc HTTP long-polling sur cette cible.
Vérifier auprès de PlanetHoster les autres contraintes du jeu :

- requêtes HTTP long-polling Socket.IO sur `/socket.io/`, sans cache ni mise en tampon du proxy ;
- **un seul processus de jeu** pour cette base de données ;
- maintien du processus après la première visite, même sans joueurs ;
- arrêt propre avant remplacement lors d'une mise à jour.

Les limites de processus dépendent de leur configuration Passenger. Ne pas
ajouter des directives Passenger au hasard dans `.htaccess` : certaines sont
réservées au serveur ou à l'édition Enterprise. Plusieurs processus sépareraient
les joueurs dans des mondes différents et écriraient dans les mêmes sauvegardes.
La présence de Node.js dans l'offre ne valide pas à elle seule ces réglages.

## 2. Transférer le projet

Se connecter en SSH avec l'hôte, le port et l'utilisateur indiqués dans N0C.
Cloner le dépôt dans un dossier privé du compte, en dehors de `public_html` :

```bash
mkdir -p ~/tower-x
cd ~/tower-x
git clone https://github.com/jeanpruski/TOWER_X.git project
cp project/ops/towerx-start.cjs ./towerx-start.cjs
```

Le dépôt doit contenir `app.cjs`, `ops/towerx-start.cjs` et `ops/planethoster.env.example`.
Pour un dépôt privé, utiliser l'accès GitHub du serveur.
On peut aussi transférer le projet par SFTP, sans `.env`, `.data`, `.git`,
`node_modules` ni les dossiers `dist` du Mac.

La racine de l'application N0C sera `tower-x`, et le dépôt sera dans
`tower-x/project`. Ce sous-dossier permet à npm de gérer les dépendances du
monorepo sans remplacer le lien `node_modules` que N0C peut créer dans son propre
répertoire d'application.

L'arborescence attendue est :

```text
tower-x/                   ← répertoire d'application N0C
├── towerx-start.cjs        ← fichier de démarrage N0C
└── project/               ← dépôt Git
    ├── app.cjs
    ├── .env               ← configuration privée du jeu
    └── package.json
```

Copier le lanceur avant de le sélectionner dans N0C. Si le répertoire de ton
application porte un autre nom, comme `towerx-api`, utiliser ce nom à la place
de `tower-x` dans les chemins du guide.

## 3. Déclarer l'application

Dans **Langages → Node.js → Créer**, utiliser :

| Champ | Valeur |
| --- | --- |
| Version Node.js | 22, au minimum 22.12 |
| Répertoire d'application | `tower-x` (le dossier parent du dépôt) |
| Domaine | Le sous-domaine créé |
| Chemin de l'URL | `/` |
| Fichier de démarrage | `towerx-start.cjs` |
| Mode | Production |

Arrêter l'application pendant sa préparation. Conserver la racine de l'application
privée : le serveur Express ne publie que `project/apps/web/dist`. Si le panneau demande
une racine de documents publics, utiliser un dossier public distinct de la racine
du dépôt ; ne jamais publier le dossier contenant `.env` et les sources.

Copier la commande d'activation de l'environnement affichée dans l'édition de
l'application et l'exécuter dans le terminal SSH. Puis :

```bash
cd ~/tower-x/project
node --version
```

## 4. Créer PostgreSQL et la configuration

Dans la rubrique des bases PostgreSQL de N0C, créer une base et son utilisateur,
avec les droits nécessaires sur cette base. Relever l'hôte, le port et les noms
complets attribués par le panneau. TOWER X utilise **PostgreSQL**, pas MariaDB.

Pour cette première installation :

```bash
cp -n ops/planethoster.env.example .env
chmod 600 .env
openssl rand -hex 32
nano .env
```

Dans `.env`, renseigner :

- `PUBLIC_ORIGIN` : l'adresse HTTPS exacte, sans `/` final ;
- `DATABASE_URL` : les coordonnées PostgreSQL, avec le mot de passe encodé pour
  une URL s'il contient des caractères spéciaux ; respecter aussi le réglage TLS
  demandé par l'hébergeur ;
- `SESSION_SECRET` : la chaîne aléatoire générée ci-dessus.

Conserver cette clé lors des mises à jour. La base démarre avec un nouveau monde ;
les sauvegardes locales du Mac ne sont pas importées automatiquement.

## 5. Installer et démarrer

Toujours dans l'environnement Node.js de l'application, à la racine du projet :

```bash
npm ci --include=dev
npm run build
npm run db:migrate
```

`--include=dev` installe aussi TypeScript, Vite et Prisma, nécessaires à ces étapes.
Exécuter l'installation dans `tower-x/project`, où se trouve `package.json`, et
non dans le dossier parent géré par N0C. Installer sur le serveur, sans copier
les dépendances du Mac ni utiliser le bouton d'installation npm du dossier parent.

Dans N0C, cliquer **Démarrer**. `towerx-start.cjs` charge `project/app.cjs`, qui lit
`project/.env` et lance le serveur TypeScript dans le processus géré par Passenger. Le serveur fournit aussi le
front compilé. Les migrations sont appliquées par la commande précédente.
Ne pas lancer en plus `npm start`, PM2 ou `npm run dev` pour cette même base.
Passenger gère le port public : aucun accès public à `:3001` n'est nécessaire.

## 6. Vérifier avant de partager l'adresse

- Ouvrir `https://TON-SOUS-DOMAINE/health` : `status` doit être `ok` et `storage`
  doit être `postgresql`, avec `socketTransport: "polling"`.
- Ouvrir le jeu dans deux navigateurs, rejoindre avec deux joueurs et vérifier
  qu'ils se voient et peuvent se pousser.
- Dans l'onglet Réseau du navigateur, vérifier les requêtes GET/POST
  `/socket.io/?EIO=4&transport=polling…` et l'absence de tentative WebSocket
  sur `/socket.io/`. Jouer plusieurs minutes, puis couper/rétablir le réseau
  pour vérifier la reconnexion.
- Créer un compte de test, modifier son apparence, puis arrêter et démarrer
  l'application dans N0C et vérifier que le compte et son apparence persistent.
- Faire bloquer `/metrics` sur l'URL publique, comme le fait le proxy Docker fourni.
  Vérifier aussi que `/.env` et `/package.json` ne renvoient jamais les fichiers
  privés du projet.

Si le site affiche une erreur 500/503, consulter les journaux de l'application
dans N0C. Vérifier d'abord la version Node, les dépendances, les valeurs de `.env`,
la connexion PostgreSQL et l'exécution des migrations. Des erreurs HTTP polling ou
des joueurs invisibles entre eux demandent aussi de contrôler le proxy et le nombre
de processus avec PlanetHoster.

Si toutes les adresses affichent « It works! NodeJS », c'est la page de démonstration
de l'hébergeur. Vérifier que le fichier `towerx-start.cjs` dans le répertoire
d'application contient bien `require('./project/app.cjs');`, que N0C a enregistré
ce nom comme fichier de démarrage, et que l'application utilise la racine `/`
du bon sous-domaine. Enregistrer puis arrêter et démarrer l'application.

### Erreur Passenger sans journal accessible

Si le jeu démarre en SSH mais Passenger affiche une erreur de démarrage, arrêter
l'application dans N0C et installer temporairement le lanceur de diagnostic :

```bash
cd ~/tower-x/project
git pull --ff-only origin master
cp ops/towerx-diagnostic.cjs ../towerx-start.cjs
```

Garder `towerx-start.cjs` comme fichier de démarrage dans N0C. Démarrer
l'application, ouvrir `/health`, puis lire le journal dans le terminal :

```bash
tail -n 80 ~/tower-x/towerx-startup.log
```

Ce fichier privé indique le lancement, la version Node et les erreurs JavaScript.
Le lanceur masque `DATABASE_URL` et `SESSION_SECRET` dans le journal ; il ne publie
pas de page de diagnostic. Si aucun fichier n'apparaît, le lanceur n'a pas été
exécuté ou le journal n'a pas pu être écrit : consulter les journaux Passenger de
l'hébergeur et vérifier le fichier de démarrage réellement utilisé.

Après résolution, arrêter l'application, restaurer le lanceur normal avec
`cp ops/towerx-start.cjs ../towerx-start.cjs` depuis le dépôt, puis redémarrer.

### Prisma : moteur OpenSSL manquant sous Passenger

Sur la cible N0C observée, la génération dans le terminal SSH a sélectionné
`debian-openssl-1.0.x`, tandis que Passenger a demandé `debian-openssl-1.1.x`.
Le schéma inclut donc `binaryTargets = ["native", "debian-openssl-1.1.x"]` :
Prisma conserve le moteur détecté lors de l'installation et ajoute celui demandé
par Passenger.

Après récupération de cette correction, arrêter l'application dans N0C, activer
son environnement Node.js dans le terminal, puis exécuter :

```bash
cd ~/tower-x/project
git pull --ff-only origin master
npm run db:generate
```

Cette modification concerne le client Prisma et ne nécessite aucune migration
de la base ni recompilation du front. Démarrer l'application dans N0C puis vérifier
`/health`. Si un affichage temporaire des erreurs détaillées a été activé dans
le `.htaccess` public, restaurer sa configuration de production après le diagnostic.

### Socket.IO sans WebSocket sur N0C

Réponse du support transmise le 16 septembre 2026 : WebSocket n'est pas disponible
sur N0C. Leur [exemple Socket.IO](https://github.com/PlanetHoster/socket.io-exemple)
illustre l'usage de Socket.IO sur cet hébergement. Le jeu utilise déjà Socket.IO 4 ;
aucune nouvelle bibliothèque ni migration de sauvegardes n'est nécessaire.

Le client ouvre désormais HTTP en premier. Avec `SOCKET_IO_TRANSPORT=polling`,
le serveur limite les transports à `['polling']` et désactive les upgrades :
le navigateur ne tente pas WebSocket, même lors d'une reconnexion.
Ce mode est le défaut du lanceur N0C `app.cjs` et figure dans
`ops/planethoster.env.example`. Pour le fixer explicitement dans une installation
existante, ajouter à `project/.env` sans remplacer les autres valeurs :

```dotenv
SOCKET_IO_TRANSPORT=polling
```

Si cette variable existe aussi dans le panneau N0C, y mettre `polling` : les
variables du panneau ont priorité sur `.env`. Transférer le code mis à jour,
exécuter `npm run build` dans `project` avec l'environnement Node N0C activé,
puis redémarrer l'application et recharger la page du jeu.
La recompilation est nécessaire pour remplacer l'ancien client qui essayait
WebSocket en premier. Un changement ultérieur de la seule variable demande
uniquement un redémarrage du serveur.

Vérifier `socketTransport: "polling"` dans `/health` et `polling` dans le debug
du jeu. Sur un autre hébergement compatible WebSocket, `SOCKET_IO_TRANSPORT=auto`
permet HTTP puis une montée vers WebSocket ; c'est le défaut de `npm start`.

L'ancien contrôle public montrait un `101 Switching Protocols` avec
`Connection: Keep-Alive` et aucun paquet Engine.IO pendant quatre secondes.
L'annonce du support remplace la demande précédente de réparation de ce tunnel.
La connexion HTTP directe évite l'attente d'une tentative WebSocket vouée à
l'échec ; elle ne garantit pas un ping plus faible pendant une partie qui utilisait
déjà HTTP. Les files bornées, snapshots récents et lissage existants restent actifs.
Mesurer le ping et la fluidité sur N0C après déploiement ; les tests locaux ne
reproduisent pas le proxy, sa charge ou le trajet Internet.

## Nombre de compagnons

Le défaut est désormais un seul bot pour le monde. Pour une installation existante,
remplacer `BOT_COUNT=3` par `BOT_COUNT=1` dans `project/.env`, puis redémarrer
l'application dans N0C. Cette configuration fonctionne aussi avec la version
précédente : aucune compilation ni migration n'est nécessaire pour changer le nombre.
Si `BOT_COUNT` est défini dans les variables d'environnement de N0C, modifier aussi
cette valeur : elle a priorité sur le fichier `.env`. Une fois dans la tour, le
panneau de proximité doit indiquer « + 1 BOT COMPAGNON ».

## Mises à jour

Sauvegarder PostgreSQL et arrêter l'application dans N0C, puis dans son
environnement SSH :

```bash
cd ~/tower-x/project
git pull --ff-only origin master
cp ops/towerx-start.cjs ../towerx-start.cjs
npm ci --include=dev
npm run build
npm run db:migrate
```

Démarrer l'application dans N0C après réussite des commandes. Conserver `.env`.
Ne pas forcer un `git pull` en cas de conflit : examiner les fichiers concernés.

## Documentation officielle et limites

- [Applications Node.js dans N0C](https://kb.n0c.com/knowledge-base/gestion-des-applications-node-js/)
- [Bases de données dans N0C](https://kb.n0c.com/article-categories/bases-de-donnees/)
- [The World : Node.js et PostgreSQL](https://www.planethoster.com/en/World-Hosting)
- [Port géré par Passenger](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html)
- [Réglages des processus Passenger](https://www.phusionpassenger.com/docs/references/config_reference/apache/)
- [Cibles binaires du client Prisma 6](https://docs.prisma.io/docs/orm/v6/reference/prisma-schema-reference#binarytargets-options)
- [Transports du client Socket.IO](https://socket.io/docs/v4/client-options/#transports)
- [Transports et upgrades du serveur Socket.IO](https://socket.io/docs/v4/server-options/#transports)
- [Exemple PlanetHoster](https://github.com/PlanetHoster/socket.io-exemple)

Cette préparation ne constitue pas un déploiement sur ton compte. Les réglages
Passenger, le HTTPS et HTTP long-polling doivent être validés sur la cible.
Le lanceur a été vérifié localement avec PostgreSQL temporaire, le front compilé,
deux joueurs WebSocket et une session conservée après arrêt puis redémarrage
avant le passage au mode HTTP uniquement.
Le démarrage via le lanceur à la racine a aussi été vérifié avec le chargeur Node.js
officiel de Passenger 6.0.26 et une requête `/health` sur sa socket Unix. Ce test
ne reproduit pas toute la configuration N0C/LiteSpeed du serveur cible.
Le lanceur de diagnostic a passé le même contrôle Passenger. Les essais de panne
vérifient aussi la journalisation d'un fichier manquant et d'un échec de démarrage,
le masquage des secrets de configuration et les permissions privées du journal.
