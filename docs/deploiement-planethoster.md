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

Vérifier auprès de PlanetHoster ces contraintes du jeu :

- connexions Socket.IO / WebSocket persistantes sur `/socket.io/` ;
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
  doit être `postgresql`.
- Ouvrir le jeu dans deux navigateurs, rejoindre avec deux joueurs et vérifier
  qu'ils se voient et peuvent se pousser.
- Dans l'onglet Réseau du navigateur, vérifier la connexion WebSocket
  `/socket.io/` et jouer plusieurs minutes sans déconnexion répétée.
- Créer un compte de test, modifier son apparence, puis arrêter et démarrer
  l'application dans N0C et vérifier que le compte et son apparence persistent.
- Faire bloquer `/metrics` sur l'URL publique, comme le fait le proxy Docker fourni.
  Vérifier aussi que `/.env` et `/package.json` ne renvoient jamais les fichiers
  privés du projet.

Si le site affiche une erreur 500/503, consulter les journaux de l'application
dans N0C. Vérifier d'abord la version Node, les dépendances, les valeurs de `.env`,
la connexion PostgreSQL et l'exécution des migrations. Une erreur WebSocket ou
des joueurs invisibles entre eux demande aussi de contrôler le proxy et le nombre
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

Cette préparation ne constitue pas un déploiement sur ton compte. Les réglages
Passenger, le HTTPS et les connexions WebSocket doivent être validés sur la cible.
Le lanceur a été vérifié localement avec PostgreSQL temporaire, le front compilé,
deux joueurs WebSocket et une session conservée après arrêt puis redémarrage.
Le démarrage via le lanceur à la racine a aussi été vérifié avec le chargeur Node.js
officiel de Passenger 6.0.26 et une requête `/health` sur sa socket Unix. Ce test
ne reproduit pas toute la configuration N0C/LiteSpeed du serveur cible.
Le lanceur de diagnostic a passé le même contrôle Passenger. Les essais de panne
vérifient aussi la journalisation d'un fichier manquant et d'un échec de démarrage,
le masquage des secrets de configuration et les permissions privées du journal.
