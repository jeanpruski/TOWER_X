# Validation du prototype

Vérifications effectuées le 15 septembre 2026, sur macOS arm64 avec Node.js 22.19.0.

## Résultats

| Vérification | Résultat |
| --- | --- |
| Installation propre `npm ci` | Réussie ; audit npm : aucune vulnérabilité signalée |
| TypeScript strict et bundle Vite de production | Réussis |
| Tests Vitest | 94 tests passés dans 14 fichiers : physique, génération, coopération, protocole, auth, persistance, garde-robe, reliques et doublons, biomes, camps, retour au départ, classement, bonus, recul des compagnons, migration, placement du texte et pics |
| Validateur headless | 21/21 architectures, 800 chunks ordinaires en solo et 200 brèches franchies à deux, 4 100 départs supplémentaires répartis sur les périodes des navettes, 516 679 ticks simulés avec toute la géométrie |
| Tests navigateur Chromium | Difficulté progressive : 10 parcours pertinents réussis, dont les cinq paliers avec entrées réelles, la coopération, les mécanismes, le coffre rare et les étiquettes. Correction des plateformes : 7 parcours pertinents réussis (coopération, lisibilité du texte, navette/dalle à deux navigateurs, tremplin, réglages rétro, pics, visibilité sous les piliers). Personnalisation : 7 parcours pertinents réussis (accueil, coffre rare, catalogue, sauvegarde et visibilité à deux navigateurs, cinq biomes, chaussures/teintes et ancien parcours de modification du profil). |
| PostgreSQL 16 réel | Migration initiale, lecture/écriture, réouverture, sessions révoquées et passage du monde de version 1 à 10 avec conservation des camps/records, accessoires, chaussures, couleurs indépendantes, collection rare et historique des coffres dans le JSON du profil |
| Serveur en configuration production | Bundle compilé, assets, CSP, cookie Secure/HttpOnly et stockage PostgreSQL vérifiés |
| Rendu | Garde-robe, rare débloqué, cinq décors, plateformes à mécanismes et étiquettes nettes inspectés, avec scanlines et fish-eye activés ; vues bureau/mobile sans débordement horizontal |

Les commandes exactes figurent dans le README et dans `.github/workflows/ci.yml`.

## Choix du départ et arrivée auprès d’un joueur

L’écran de départ affiche le camp sauvegardé (ou 0 m pour un nouveau profil), les autres humains connectés, leurs apparences et leurs hauteurs. La lecture de cette liste ne crée aucun corps et ne change pas le nombre de joueurs dans la tour. Le serveur exclut les bots, le profil courant et les déconnectés. Les tests HTTP contrôlent également l’authentification et les seuls champs publics retournés.

Les tests Socket.IO vérifient la cible sélectionnée plutôt que le joueur le plus haut, les coordonnées recalculées au moment du départ, le camp enregistré et la conservation du record déjà atteint et des rares. Un départ sauvegardé explicite reprend le camp malgré un corps récemment déconnecté plus haut. Une reconnexion sans nouveau choix retrouve encore ce corps pendant dix secondes. Un second `join` sur une connexion active ne téléporte pas. Une cible absente ou identique au joueur est refusée avant création du corps, puis la même connexion peut demander son camp. Les coordonnées injectées et un identifiant de bot sont refusés par le schéma. L’arrivée près d’un joueur en l’air au-dessus de pics se fait sur un sol stable, avec protection et sans reprendre sa vitesse de chute.

Les quatre parcours de `start-choice.spec.ts` passent sur les exécutions ciblées : attente sans entrée en jeu, liste actualisée avec deux autres navigateurs, arrivée près du joueur choisi passé de 100 à 200 m, départ à 0 m malgré une tour peuplée et reprise du camp de 100 m après validation. Une déconnexion retire la cible et bloque la confirmation ; si elle survient après le dernier rafraîchissement, le refus serveur rouvre le choix. La Gamepad API simulée permet de sélectionner le camp et de commencer ; maintenir Sud ne provoque aucun saut avant relâchement. Cela ne remplace pas un essai sur plusieurs manettes physiques.

Le build, les 94 tests Vitest et sept parcours de régression supplémentaires passent : jeu à deux navigateurs, inscription/connexion, réglages à la manette, accueil et trois parcours de garde-robe. Cela porte les contrôles navigateur pertinents à onze sur les exécutions ciblées.

Les captures `start-choice-desktop.png` et `start-choice-mobile.png`, conservées dans `/tmp/tower-start-review`, ont été inspectées, avec une liste lisible et aucun débordement à 390 px. Les contrôles utilisent des profils et des sauvegardes temporaires. Le placement sur une plateforme voisine peut donner une hauteur légèrement inférieure à celle affichée si la cible saute ou se trouve sur un mécanisme.

## Largeur de personnalisation et aperçus des chaussures

La fenêtre de création de tenue et de profil passe de 560 à 960 px sur ordinateur. La grille adapte son nombre de colonnes à la largeur disponible ; le mobile utilise trois colonnes avec des marges réduites. Les noms passent de 9 à 11 px et les statuts de 6 à 8 px. Le rendu des vignettes de chaussures utilise directement les mêmes formes de pieds et auras que le jeu, sans dessiner la robe, le visage ou la coiffe. Changer de visage ne modifie plus ces vignettes.

Le build et les 90 tests Vitest passent. Trois parcours Chrome existants passent : catalogue complet avec flou, personnalisation classique et persistance, découverte des chaussures/visages rares et affichage chez un autre joueur. L’inspection du site local confirme une fenêtre de 960 px sur ordinateur et aucun débordement à 360, 390, 768 et 1440 px. Captures inspectées : `shoes-desktop.png` et `shoes-mobile.png` dans `/tmp/tower-wardrobe-layout`.

## Rares dans les quatre catégories et aperçus floutés — version 10

Le catalogue contient 98 classiques et 32 rares : huit visages, huit masques, huit coiffes et huit paires de chaussures. Les contrôles vérifient les identifiants uniques, le refus de chaque rare sans son déblocage et sa conservation une fois acquis. Le serveur refuse les visages et chaussures rares verrouillés à l’inscription comme à la modification du profil, puis accepte les pièces réellement collectées. Les invités tirent toujours leurs chaussures parmi les douze classiques.

Les tests de densité parcourent 9 600 chunks sur cinq seeds : 64 coffres par seed, un par tranche de 30 chunks, avec répétitions possibles et les mêmes limites d’espacement. Les 160 coffres des tests de collecte sont accessibles depuis la route sans bonus ni contact avec les pics. Le pilote essaie aussi des sauts relâchés tôt : le coffre du chunk 389 du seed 0xffffffff demande un petit saut latéral pour éviter la corniche piégée située au-dessus. La géométrie et le validateur restent inchangés : 516 679 ticks réussis.

Huit parcours Chrome pertinents passent sur les exécutions ciblées de `wardrobe.spec.ts` et `homepage.spec.ts`. Les quatre catégories montrent huit aperçus floutés, des cadenas et des noms nets ; les classiques gardent leurs vignettes nettes. Un invité ramasse les Foulées de comète au chunk 142 puis l’Esprit de braise au chunk 2125 du seed 42, avec les commandes normales après transport vers ces tronçons de test. Les aperçus deviennent nets immédiatement, bien que l’équipement reste réservé au compte. La conversion en compte conserve les deux trouvailles ; un autre navigateur reçoit les chaussures seules et leur badge RARE, puis le visage rare. Le rechargement conserve l’ensemble. Le parcours du masque du lierre utilise maintenant les chunks 2150 et 2909 pour la découverte puis le doublon ; la collection reste à 1/32 et le coffre ouvert ne revient pas.

La planche `rare-contact-sheet.png` présente les 32 silhouettes dans les deux directions. Les lectures de pixels confirment leur distinction et la conservation de la palette des chaussures rares malgré une couleur personnalisée. Les captures `rare-shoes-unlocked-mobile.png` et `rare-shoes-observed.png` ont été inspectées : étoiles aux pieds et badge visibles, verrouillages lisibles et aucun débordement à 390 px. Les tests de catalogue et de personnalisation classiques restent réussis. Cette inspection ne mesure pas la reconnaissance spontanée de chaque pièce par des joueurs.

Une base PostgreSQL 16 éphémère conserve l’Esprit de braise, les Foulées de comète, l’ancien masque du lierre dans la collection et les tranches ouvertes, à la réouverture puis lors de la mise à niveau en version 10. Le bundle de production, ses assets, la CSP et le cookie sécurisé passent le contrôle. Les migrations fichier des versions 1, 6, 7, 8 et 9 conservent aussi les anciennes pièces et l’historique. Aucun compte réel n’est utilisé comme fixture.

## Paramètres à la manette, retour au départ et bandeau intégré

Les 12 parcours navigateur pertinents passent sur des exécutions ciblées : réglages à la manette, confirmation du retour, branchement/débranchement de manette, bonus, poussée, coopération, étiquettes, navette/dalle, tremplin, rétro, pics et coffre rare. TypeScript et le bundle de production sont compilés avec succès.

Les tests physiques reproduisent une cible qui arrive vers l’attaquant et tente de contre-braquer ou de sauter pendant le choc. Dans les deux directions, elle recule de plus de 60 px en onze ticks, tombe de sa corniche sans consommer ses bottes, puis reprend sa navigation sur un appui inférieur. Le test du monde confirme le même effet sur un vrai `BotBrain`, reçu via Socket.IO par l’humain, avec plus de 50 px de recul en dix ticks. Les protections de camp, bulles et limites de fréquence restent couvertes. Le validateur traverse toutes ses routes en 516 679 ticks après cette modification de physique.

Le test serveur refuse un retour au départ contenant des champs falsifiés, puis accepte l’action versionnée : corps et camp à zéro, bonus effacés, record, camps visités, tenue et historique des rares conservés après réouverture du stockage et reconnexion. Dans Chrome, la confirmation sélectionne « Continuer l’ascension » par défaut. La touche Est annule et le bouton Sud valide après navigation ; le maintien de ce dernier ne provoque pas un saut au retour. Le personnage reprend à 0 m après rechargement.

La Gamepad API simulée permet de parcourir les réglages au stick et à la croix, modifier le volume, basculer CRT et courbure, annuler une attente de remappage clavier et fermer avec Start. Les préférences sont vérifiées sur l’API du compte. Le scénario attend que le rendu ait effectivement détecté la manette avant sa première pression brève. Ces contrôles ne remplacent pas un essai sur plusieurs manettes physiques.

Le ramassage d’une plume par les commandes ordinaires active le compteur dans le bandeau, qui reste entièrement dans le cadre et au-dessus de la zone des plateformes. L’explication s’ouvre au clic sur mobile ; le retour au camp efface le bonus. Le parcours de poussée affiche un coup confirmé, la recharge puis une tentative dans le vide. Captures inspectées sur ordinateur et à 390 px : `controller-settings.png`, `companions-bonuses-mobile.png`, `push-impact.png` et `return-base-confirmation-mobile.png`. Le pilote de collecte relâche le saut tôt pour atteindre la plume du premier appui ; un saut complet peut passer au-dessus grâce aux appuis de repos.

Le nouveau cadre a également été contrôlé avec les noms longs, la foule et le fish-eye désactivé : des positions supplémentaires au-dessus de chaque épaule permettent de conserver les noms sans recouvrir les appuis. Le scénario du tremplin utilise lui aussi un saut relâché pour rejoindre son appui préparatoire, avant le rebond réel. La coopération reste franchissable avec le bot et les commandes normales.

## Tirage des rares avec doublons — version 9

Les emplacements et la densité restent identiques : 24 coffres sur 720 chunks pour chacun des cinq seeds du test de génération. Le contenu se tire dans les douze pièces sans exclure celles déjà obtenues. Les douze premiers coffres présentent des répétitions sur chacun de ces seeds ; régénérer un chunk redonne le même contenu. Le validateur de terrain conserve ses 516 224 ticks réussis, et les 60 coffres des tests de collecte restent accessibles sans bonus ni contact avec les pics.

Le scénario HTTP/Socket.IO ouvre deux coffres différents contenant la même pièce : le second reste visible malgré la pièce possédée, affiche un effet marqué comme doublon, puis disparaît uniquement pour son propriétaire. La collection contient toujours une seule pièce. Revenir au coffre ne produit pas un autre effet ; un autre joueur peut encore l’ouvrir. L’historique persiste après inscription, réouverture du stockage fichier et reconnexion ; il n’est ni exposé par le profil public ni modifiable par la route de personnalisation. Les migrations des versions 1, 6, 7 et 8 conservent les pièces et l’historique existant. Un ancien profil sans historique reçoit une liste vide, permettant une première ouverture sous les nouvelles règles.

Dans Chrome, l’invité ramasse réellement le masque du lierre au chunk 626 du seed 42, le conserve à l’inscription et le montre à un second navigateur. Il ramasse ensuite un doublon au chunk 1284 : le message « Doublon » apparaît, la collection reste à 1/12 et le coffre reste absent après rechargement. Les déplacements et sauts de ramassage passent par les commandes normales ; le helper de développement sert uniquement à rejoindre les tronçons éloignés. Le parcours passe sans erreur JavaScript ni débordement horizontal à 390 px. Capture mobile du message inspectée : `rare-duplicate-mobile.png`. Le scénario de l’accueil actualisé passe également. Les 84 tests Vitest et le build de production sont réussis.

Une base PostgreSQL 16 éphémère confirme la réouverture du profil avec sa collection et ses trois tranches ouvertes, puis leur conservation lors de la mise à niveau en version 9. Le serveur en configuration production sert le bundle et ses assets et conserve les contrôles CSP, cookie et stockage. La base et les sauvegardes de test sont supprimées après le contrôle ; aucun compte réel ne sert de fixture.

## Difficulté progressive — version 8

Les cinq paliers sont vérifiés à leurs frontières (0, 100, 300, 600 et 1 000 m). Sur 24 seeds, la largeur moyenne des appuis diminue à chaque palier ; les vingt architectures sont comparées entre Ascension, Agilité, Expert et Vertige. Les montées ordinaires du début restent sous 48 px grâce aux appuis de repos. Les passages éloignés sont également testés jusqu’au chunk 10 000 : la difficulté plafonne pour préserver la traversabilité.

Le validateur conserve ses 800 parcours solo et 200 brèches franchies à deux, et ajoute 4 100 départs de navettes répartis sur toute leur période par pas de 15 ticks. Un déplacement de ±24 px sur un pilier étroit échouait à certaines phases ; l’amplitude réelle est donc bornée aussi par la demi-largeur de la plateforme +6 px. Les 516 224 ticks du contrôle final passent. Les duos montent dix chunks consécutifs depuis les chunks 0, 25 et 45, couvrant les transitions vers Expert et Vertige, sans bonus ni réinitialisation de position pendant l’ascension. Les collections et les trois champs de personnalisation sont préservés lors des tests de migration fichier des versions 1, 6 et 7 vers 8.

Dans Chrome, un personnage traverse une salle de chaque palier avec de vraies entrées de déplacement/saut. Le test contrôle le niveau envoyé dans le chunk, les cinq barres du panneau, le retour à Découverte après redescente et l’absence de débordement à 390 px. Captures inspectées : `difficulty-1.png`, `difficulty-5.png` et `difficulty-mobile.png`. Les contrôles de coopération avec bot, accueil, transport sur navette, dalle absente en réseau, tremplin, pics, rétro et surfaces opaques passent également. Les scénarios visant une réception précise relâchent maintenant le saut tôt : un saut complet peut sauter un appui supplémentaire du début. Le test des pics utilise la corniche du chunk 12 ; celle du chunk 2 se trouve désormais plus haut dans l’écran à cause des nouveaux appuis, tout en restant présente dès ce tronçon.

Les plateformes du début pouvaient laisser trop peu de place aux noms longs en mode mobile sans courbure. Deux positions diagonales supplémentaires permettent de les placer au-dessus des épaules sans couvrir les appuis ; le scénario de noms longs, foule, redimensionnement et reconnexion passe, ainsi que le compte à rebours des dalles. Le ramassage du coffre rare et la conservation à l’inscription passent aussi sur la géométrie Vertige.

Ces contrôles mesurent l’accessibilité mécanique. La courbe de difficulté ressentie et son rythme restent à éprouver avec des joueurs humains.

## Chaussures et couleurs indépendantes

Douze chaussures distinctes sont dessinées dans les deux directions, à l’arrêt, en course et en saut. La planche `shoe-contact-sheet.png` et les captures `shoes-colors-mobile.png` / `shoes-mobile.png` ont été inspectées. La palette comprend 48 couleurs ; la tenue, la coiffe et les chaussures se colorent séparément. Le test de pixels vérifie que les chaussures ne recolorent pas le visage, qu’une teinte de coiffe préserve la robe et les pieds, que les 37 coiffes classiques visibles réagissent à la teinte et que le phénix conserve sa signature rare. Le canevas de contrôle utilise `willReadFrequently` pour éviter les écarts d’arrondi liés au changement automatique du backend de lecture de Chrome.

Le parcours navigateur inscrit un personnage à lunettes avec boucles, robe rouge, cheveux mauves et baskets bleues. Un second navigateur reçoit cette tenue, puis voit le passage au robot, au casque bleu et aux palmes jaunes. La reconnexion restitue les choix. Le serveur teste aussi le retour à `hatColor: null`, les restrictions des invités et les palettes validées. Les anciens profils des mondes 1, 6 et 7 reçoivent des bottines sombres sans perte de camp ou de record. Une base PostgreSQL 16 isolée a confirmé l’écriture, la réouverture et la conservation des trois nouveaux champs à travers la mise à niveau du monde. Les rares existants et leur fréquence sont conservés.

## Parcours navigateur

### Plateformes visibles et réceptions sur les bords

Deux défauts reproduits : un personnage en chute diagonale depuis (143, 84), à 108 px/s horizontalement et −340 px/s verticalement, traversait une plateforme située à (100, 80), de largeur 40, malgré un recouvrement des pieds lors du franchissement de sa surface ; dans le chunk 22 du seed 42, le pilier `22:4` recouvrait une partie de la plateforme `22:3` dessinée plus tôt.

Trois tests physiques supplémentaires vérifient les bords gauche/droit, les arrivées latérales trop tardives, les sauts par-dessous, les dalles désactivées et le contact avec une navette suivi du transport. Les 74 tests Vitest passent. Le validateur traverse 800 chunks ordinaires et 200 brèches à deux sur cinq seeds, en 110 526 ticks. Le test de rendu compare les pixels de la surface avec et sans le pilier superposé dans les cinq palettes, vérifie la place réservée aux plateformes dans le placement des étiquettes et l’indication « Dalle absente ». Un quatrième test couvre le compte à rebours mobile lorsque des plateformes occupent la place au-dessus du trou. Les sept scénarios navigateur pertinents passent ; les trois concernant directement le texte et les plateformes ont été relancés après ce dernier ajustement. Le compte à rebours est lisible sans troncature sur bureau et à 390 px. Captures inspectées : `moving-platform-retro.png`, `crumbling-gap-mobile.png` et `platform-surfaces-visible.png`. La géométrie reste en version 7.

### Visages et coiffes

Les 26 ajouts sont visibles dans la garde-robe et sur l’accueil. Les six scénarios pertinents passent, ainsi que les 70 tests Vitest et la compilation de production. Captures inspectées : `new-cosmetics-sheet.png`, `new-faces-desktop.png` et `new-faces-mobile.png`. Pour observer un changement de tenue, le second navigateur est placé au même camp dans le monde temporaire : une arrivée invitée peut se faire au camp précédent, hors de la zone de rendu du premier joueur. Aucun compte réel ni terrain de jeu n’a servi de fixture.

### Accueil actualisé

La section « Nouveautés » présente quatre aperçus de mécanismes, les cinq décors et les trois bonus. Le scénario dédié vérifie les changements d’onglet au clavier et à la souris, les cinq rendus distincts, les compteurs de cosmétiques issus du catalogue, l’ouverture de la création de tenue, les réglages et l’entrée en invité depuis le mobile. La réduction des animations fige effectivement le canvas d’aperçu. Le menu mobile se referme après sélection d’une ancre. Aucun débordement horizontal aux largeurs 360, 390, 768, 1 024 et 1 440 px.

Les trois parcours retenus pour cette modification passent : accueil/réglages, inscription et modification de profil, puis nouveautés interactives. Captures inspectées : `site-updated-desktop.png`, `site-discovery-desktop.png`, `site-wardrobe-desktop.png`, `site-discovery-mobile.png` et `site-updated-mobile.png`. Les animations sont des illustrations de présentation ; les essais de la simulation restent décrits séparément ci-dessous.

### Parcours du jeu

1. Accueil, ouverture des réglages, changement de touche, conservation après rechargement, largeur mobile sans débordement.
2. Deux contextes navigateur distincts rejoignent la même tour, se voient, sautent, reviennent au camp et conservent leur record après reconnexion.
3. Choix du masque et du chapeau à l’inscription ; garde-robe en partie, changement du pseudonyme, de la robe, du masque et du chapeau, pièces verrouillées, déconnexion puis reconnexion à la tenue sauvegardée ; contrôle du rendu mobile.
4. Branchement à chaud d’une Gamepad API simulée, saut avec le bouton Sud, ouverture du menu avec Start, débranchement et reprise au clavier après respawn.
5. Onze joueurs réels du serveur de test, placés à différentes hauteurs : cinq devant, cinq derrière, rang et écarts vérifiés même hors de la zone de rendu ; compteur et classement mis à jour au départ d’un joueur. Le scénario utilise la téléportation de développement dans un monde temporaire.
6. Un invité et trois compagnons : identification BOT, tenues noires et masques ivoire vérifiés dans le snapshot, compteur humain distinct, bots qui montent, ramassage réel d’une plume via les entrées de déplacement et de saut, affichage du bonus et suppression au retour au camp, mobile sans débordement.
7. Deux clients proches hors camp : un appui bref sur E produit une poussée confirmée, le HUD indique la recharge, puis une tentative dans le vide donne un message distinct. Ce test a révélé et vérifie la correction des appuis perdus entre deux ticks de simulation.

8. Un invité ouvre sa garde-robe aléatoire et verrouillée, puis rejoint le tronçon 626 du seed 42, où se trouve le masque du lierre, par le helper de développement. Des entrées réelles de déplacement/saut permettent ensuite de ramasser le coffre sur un balcon facultatif. Le test vérifie la notification, la conservation après retour au camp, la conversion du même invité en compte, l’équipement du masque du lierre et sa persistance après rechargement. Un second navigateur rejoint ensuite la partie : il reçoit le masque rare équipé et affiche le badge ◆ RARE du propriétaire. Le même joueur trouve ensuite un doublon au chunk 1284 et conserve sa collection à 1/12 après reconnexion. Captures bureau/mobile `rare-observed-desktop.png`, `rare-observed-mobile.png` et `rare-duplicate-mobile.png`.
9. Arrivée aux cinq altitudes de changement d’ambiance via le helper de développement : noms, identifiants de biome et captures distinctes des ruines, forêt, cavernes, givre et sanctuaire astral.
10. Un bot progresse pendant que l’humain reste immobile au départ. Le scénario place ensuite l’humain près d’une brèche dans un monde temporaire. Le bot rejoint le repère ; des événements clavier ordinaires permettent de sauter sur ses épaules, de repartir depuis sa tête et de déployer la passerelle. Les deux partenaires franchissent le passage. Captures `test-results/cooperation-shoulders.png`, `cooperation-bridge.png` et `cooperation-mobile.png`, sans débordement mobile.

11. Catalogue de 48 couleurs, 18 visages sans bec, 36 masques, 44 coiffes et 12 chaussures : toutes les vignettes sont dessinées et distinctes dans chaque catégorie. Les filtres des masques/coiffes affichent respectivement 30/38 classiques ou 6 rares verrouillés. La recherche « beguin » trouve « Béguin », la sélection et la navigation au clavier fonctionnent. La planche `new-cosmetics-sheet.png` présente les 26 ajouts dans les deux directions et en poussée ; le scénario vérifie aussi l’absence de pixels de bec sur les nouveaux visages à tête nue. Le rendu mobile est capturé.

12. Un joueur atteint une navette par le clavier, cesse toute commande et est transporté sans glisser : déplacement de plus de 4 px et variation de sa position relative à la plateforme inférieure à 3 px. Deux navigateurs observent ensuite le même `breakTick` pour une dalle foulée au clavier ; elle disparaît, le joueur tombe, puis le sol revient cinq secondes plus tard. Vues bureau/mobile sans débordement.
13. Le joueur rejoint le tremplin facultatif du tronçon 4 avec les commandes normales. Le rebond automatique est observé dans `Body.spring`, dépasse 115 px au-dessus du tremplin dans le navigateur et ne requiert aucun bonus.
14. Une ancienne préférence locale avec CRT et fish-eye désactivés reçoit une fois le nouveau défaut actif. Le volume personnalisé reste à 22 %. Les deux effets peuvent ensuite être désactivés, ce choix et son marqueur sont enregistrés sur le profil et survivent au rechargement.

Les tests serveur vérifient aussi la limite de cinq voisins sur chaque côté avec treize joueurs, les égalités de hauteur, les dépassements, les chutes et les déconnexions. Les altitudes sont calculées sans perdre un mètre aux frontières exactes des chunks (par exemple 240 m). Les cinq tirages de couleur de tenue/masque/chapeau/chaussures/couleur des chaussures sont testés avec une source aléatoire contrôlée et une réouverture du stockage.

La manette est simulée par l’API du navigateur : cela vérifie les actions et le branchement à chaud, sans certifier l’ergonomie d’un périphérique physique.

Les tests supplémentaires simulent les trois cerveaux de bot sur quatre seeds pendant 900 ticks sans téléportation, leur ascension indépendante d’un joueur immobile, le maintien des trois compagnons même avec quatre humains et leur absence du stockage des profils. Les bonus sont vérifiés sur 300 chunks : contact sur une plateforme sûre, saut et expiration de plume, consommation des bottes, absorption d’une poussée par la bulle, attribution unique d’un pickup partagé et réapparition après 30 secondes.

Le contrôle du terrain couvre les hauteurs/largeurs variées et plateformes facultatives, puis dix chunks consécutifs traversés par deux personnages sans bonus ni réinitialisation sur trois seeds. Le saut maintenu est mesuré entre 77 et 80 px, avec un petit saut distinct au relâchement. Une sauvegarde version 1 est mise à jour en conservant son seed, son record et ses camps ; un personnage de retour retrouve un sol sûr aux mêmes coordonnées.

La garde-robe fait aussi l’objet de tests HTTP et Socket.IO : restrictions invité, sélection initiale, changements en direct, refus de pièces rares verrouillées ou de collections falsifiées, normalisation d’anciens profils, réouverture et connexion. Deux joueurs récupèrent indépendamment le même coffre ; son absence est vérifiée dans le snapshot du propriétaire uniquement, et une collecte répétée ne duplique pas l’objet. Le passage d’invité à compte conserve la collection et permet d’équiper la trouvaille.

Avec navettes, dalles et tremplins actifs, sur 1 800 chunks issus de cinq seeds, les 60 coffres sont contrôlés : chaque coffre est atteint depuis une plateforme de la route obligatoire avec la physique normale, sans bonus ni contact avec les pics. Les cycles des décors, les emplacements des reliques et la stabilité de leur contenu sont contrôlés. Ces simulations vérifient l’accessibilité mécanique, sans remplacer l’essai du parcours par des joueurs.

## Catalogue et prestige des rares

Le catalogue comprend désormais 98 styles classiques, 32 rares et 48 couleurs ; les mesures historiques ci-dessous précèdent cette extension. Les nouveaux visages/coiffes passent les validations HTTP, sont synchronisés par Socket.IO et persistent après reconnexion. Un scénario navigateur crée un compte Lunettes rondes + Boucles, vérifie cette tenue depuis un second navigateur, passe à Robot + Casque audio et retrouve cette tenue après déconnexion/reconnexion. Le test de tirage invité contrôle aussi Slime + Petite pousse et la réouverture du stockage fichier. Les nouveaux rares de l’orage et de la méduse sont refusés sans déblocage ; les anciennes collections restent acquises en fichier et en PostgreSQL.

Sur cinq seeds et 3 600 chunks, le test de densité vérifie exactement un coffre par tranche de 30 chunks, le premier à partir du chunk 20, un espacement de 21 à 39 chunks, des emplacements différents selon le monde et la stabilité après régénération. Depuis la version 9, les contenus peuvent se répéter avant d’obtenir les douze pièces. Le test de contact personnel couvre aussi les joueurs éloignés du départ.

Lors de l’extension de la garde-robe, des planches de contrôle ont permis d’inspecter toutes les silhouettes rendues par le véritable dessin `mage`, sur fond sombre. Les ornements rares agrandis, les auras, le losange persistant près du corps et la mention RARE permettent plusieurs indices visuels. La capture depuis un autre navigateur vérifie leur présence dans une partie réelle. La reconnaissance spontanée par des joueurs reste à éprouver en playtest.

Un ancien scénario de coopération pouvait recevoir un snapshot émis avant le franchissement : il attend maintenant un tick postérieur au passage avant de vérifier la passerelle. La suite complète passe avec cette attente explicite.

## Navettes, dalles et tremplins

Les tests physiques transportent deux personnages immobiles pendant un cycle complet de navette et vérifient le saut de sortie. Le compte à rebours d’une dalle ne redémarre pas avec des appuis répétés : le joueur tombe après 36 ticks, le sol revient 150 ticks plus tard et les états se purgent au déchargement. Le tremplin atteint entre 130 et 140 px sans consommer une paire de bottes déjà acquise. Trois phases de départ supplémentaires sont testées sur 200 tronçons mobiles issus de cinq seeds, en plus de la validation des 1 000 chunks et de l’ascension continue en duo.

Les cerveaux des bots et les tests d’accès aux coffres utilisent maintenant la géométrie projetée et les compteurs de dalles. Le mouvement des navettes, les avertissements et le rebond sont contrôlés dans Chromium ; captures `moving-platform-retro.png`, `crumbling-warning.png`, `crumbling-gap.png`, `spring-bounce.png` et `mechanisms-mobile.png`.

Les tests de mécanismes disposent d’un quatrième monde temporaire : les créations d’invités de la suite entière atteignaient la limite d’authentification du premier monde. La limite du jeu est conservée. La suite complète de 14 parcours passe avec cette isolation.

## Pics sur les corniches

La version 7 ajoute des corniches piégées dès le tronçon de 40 m. Sur cinq seeds et 1 000 chunks, 400 corniches sont présentes, sans pièges dans les camps, les premiers tronçons ou les brèches coopératives. Le validateur reste à 800 ascensions solo et 200 franchissements à deux, en 110 526 ticks. Les tests de collecte confirment aussi l’accès aux 60 coffres rares sans contact avec les pics.

Les tests de collision contrôlent une chute sur les pointes et les limites du rectangle sur les deux murs. Un test du serveur vérifie la protection d’arrivée, le retour au dernier camp après son expiration malgré une bulle, l’effacement des bonus temporaires et la conservation du record et de la collection rare. Les sauvegardes de version 1 et 6 passent en version 7 avec conservation des profils, du seed et des camps ; cette nouvelle vérification utilise le stockage fichier temporaire. La mesure PostgreSQL ci-dessus reste celle du passage de version 1 à 6.

Dans Chromium, le personnage rejoint la première dalle par les commandes normales puis effectue un saut court sur la corniche piégée. Le retour au camp, le message explicite et la conservation du record sont vérifiés. Un saut maintenu permet de rejoindre la corniche sûre au-dessus, ce qui laisse un contournement. Captures : `spikes-desktop.png`, `spikes-mobile.png`, `spikes-return-to-camp.png`. Les trois autres parcours de mécanismes passent ; le scénario de pics a été repris séparément après correction de la durée du saut de test.

## Brèches coopératives et bots autonomes

Les 200 brèches issues de cinq seeds sont franchies par les deux personnages avec les commandes normales et sans bonus. L’écart de 88 px dépasse le saut normal ; l’appui sur les épaules réduit la montée suivante à 73 px. Un test contrôle l’empilement stable pendant six secondes puis le saut depuis cet appui. La passerelle ne s’ouvre qu’après un atterrissage réel en haut et disparaît huit secondes après le départ du dernier occupant.

Un test du monde autoritaire place un humain sur le palier inférieur et un bot au-dessus. Le bot redescend physiquement, propose ses épaules, puis les deux passent : le déplacement du bot est borné à chaque tick pour exclure une téléportation. Le snapshot reçu contient la géométrie de la passerelle ouverte. Un autre test laisse l’humain sans aucune entrée pendant 400 ticks et mesure plus de 200 ticks de déplacement vertical du bot, qui dépasse 400 px d’altitude.

Ces vérifications couvrent les deux variantes symétriques et le passage du second partenaire ; elles ne mesurent pas encore la facilité avec laquelle un nouveau joueur comprend la courte échelle.

## Bots noirs et poussées occasionnelles

Les scénarios présentent plusieurs rencontres à gauche et à droite sur 900 ticks pour chaque bot : retournement par entrée normale, poussée confirmée et espacement d’au moins 150 ticks entre les coups. Camps, arrivée protégée, stun, cooldown et cibles hors portée empêchent la tentative sans supprimer l’occasion future. Un test du monde autoritaire vérifie qu’un cerveau de bot produit le paquet d’impact envoyé à l’humain, avec recul physique ou absorption par bulle. La couleur noire est présente dans les corps et les classements et refusée dans la personnalisation humaine. Les captures bureau/mobile confirment les silhouettes sombres et leurs contours lisibles. Les bots suspendent leurs poussées dans les passages coopératifs.

## Effet écran bombé

Le shader conserve la légère déformation de la zone de jeu avec un HUD droit. Le scénario navigateur dédié vérifie désormais l’activation conjointe des scanlines et du fish-eye, la migration des anciennes préférences, la désactivation sans quitter la partie et la conservation de ce choix côté serveur après rechargement. Les captures des mécanismes utilisent le duo rétro actif ; le rendu Canvas de secours conserve les scanlines mais reste plat sans WebGL.

## Lisibilité des étiquettes

Les noms, bonus, reliques, panneaux coopératifs et messages d’action sont maintenant affichés en HTML au-dessus du canvas et des scanlines. Trois tests vérifient l’inversion de la déformation jusque dans les coins, l’absence de chevauchement sur petit écran et la priorité des avertissements. Le scénario Chromium contrôle les caractères à 14 px sur ordinateur et 12 px sur mobile, le contraste indépendant du filtre, les limites du cadre et l’espacement des textes avec neuf humains connectés. Il contrôle aussi la désactivation/réactivation du fish-eye et la sortie puis le retour dans la tour.

Les parcours de mécanismes et de reliques vérifient les nouvelles étiquettes « Ça craque ! », le compte à rebours de reconstruction, « Relique rare » et le nom marqué « ◆ RARE » vu par un autre navigateur. Captures : `readable-labels-desktop.png`, `readable-labels-mobile.png`, `readable-labels-crowd.png`, `readable-labels-crowd-mobile.png`, ainsi que les vues existantes des mécanismes et reliques.

Sur un petit écran, tous les noms d’une foule serrée ne tiennent pas simultanément : le placement masque les étiquettes excédentaires en gardant leur taille, et les joueurs restent identifiables dans le panneau latéral. Les textes très longs peuvent être abrégés avec des points de suspension. Ces vérifications automatisées et l’inspection des captures ne remplacent pas un playtest humain de la lisibilité en mouvement.

## Mesure réseau à 20 joueurs

Commande : `PLAYERS=20 DURATION=30 npm run test:load`.

Monde éphémère en mode fichier, transport WebSocket local, vingt clients de charge qui envoient des entrées de jeu et tentent de monter avec le pilote adapté aux architectures, à la coopération et aux mécanismes projetés au tick serveur. Trois compagnons automatiques sont également présents, soit 23 personnages simulés au total. Les métriques sont émises par le serveur qui simule réellement les joueurs. Cette mesure inclut les navettes, compteurs de dalles, tremplins, tracés coopératifs, passerelles temporaires, catalogue étendu, pickups, reliques personnalisées, bonus et effets de poussée.

| Mesure | Valeur observée |
| --- | ---: |
| Joueurs connectés simultanément | 20 |
| Compagnons automatiques supplémentaires | 3 |
| Durée mesurée | 30 s |
| Fréquence effective | 30 Hz |
| Durée du tick, 95ᵉ percentile | 1,49 ms |
| Tick maximal | 9,00 ms |
| RTT, 95ᵉ percentile | 1,99 ms |
| Chunks actifs à la fin | 11 |
| Frontière active à la fin | 165 m |
| Entrées rejetées | 0 |

Ces valeurs décrivent ce test sur cette machine. Elles ne prédisent pas la latence Internet, une charge de plusieurs heures ou le comportement d’une grosse base PostgreSQL.

## Corrections réseau du 16 septembre 2026

Le test `tests/e2e/network.spec.ts` effectue cinq sauts dans Chrome, sur un monde
temporaire sans bots, avec 75 ms de délai par sens et 40 ms de jitter périodique.
Il couvre WebSocket ainsi que son échec réel suivi du repli HTTP polling.
Les messages WebSocket conservent leur ordre ; les requêtes HTTP sont retardées
avant transmission et après réception. Les relevés sont joints au rapport Playwright.

| Maximum observé pendant le scénario | HTTP avant correction | HTTP corrigé | WebSocket corrigé |
| --- | ---: | ---: | ---: |
| Commandes non confirmées | 30 | 19–23 | 11 |
| Âge du dernier snapshot reçu | 672 ms | 239–390 ms | 132–140 ms |
| Écart physique à réconcilier | 42,2 px | 21,9–35,9 px | 9,7–19,5 px |

Les plages représentent les passages observés, pas des percentiles ni une mesure
du ping chez PlanetHoster. Les tests vérifient aussi l'absence de correction dépassant
le seuil de téléportation pendant ces sauts, ainsi que leur hauteur effective.
La simulation distante reste autoritaire : le lissage ne modifie pas les collisions.

La suite contient 100 tests unitaires/intégration, dont les reprises après trou de
séquence, les sauts brefs dans un lot de commandes, l'attente des plateformes à
l'arrivée, les snapshots anciens, le retour au camp et les timeouts de ping.
La compilation et la validation des 800 chunks solo, 200 chunks coopératifs et
4 100 phases de navettes passent. Les scénarios navigateur couvrent aussi deux
joueurs, la reconnexion, les comptes, les compagnons, les poussées, les mécanismes
et le choix du départ. Les scénarios de transport utilisent un monde séparé pour
ne pas épuiser les quotas d'authentification des autres fixtures ; les deux visiteurs
quittent explicitement la tour avant la fermeture de leurs contextes HTTP.

Le WebSocket public reste défectueux au contrôle du proxy ; un playtest humain
sur l'hébergement après déploiement et intervention du support reste nécessaire.

## Points encore à éprouver

- Playtests humains à 1, 2, 5, 10 et 20+ : rythme, timing des navettes, délai des dalles, lisibilité des tremplins, compréhension des courtes échelles, disponibilité des aides pour plusieurs retardataires, wall-jump, poussée, frustration et lisibilité des foules.
- Manettes physiques, différents navigateurs et claviers AZERTY/QWERTY. Les touches utilisent les codes physiques et sont reconfigurables.
- Réseau réel : 80–200 ms de latence, jitter, pertes et coupures prolongées. Ajuster ensuite le buffer d’interpolation.
- Charge longue et persistance : le repository en mémoire convient au prototype, pas encore à des millions de profils.
- Déploiement Docker/Caddy sur la cible et validation du certificat HTTPS. Docker n’était pas disponible sur la machine de réalisation ; aucun déploiement public n’a été effectué.

## Lecture des résultats

Le validateur vérifie les sauts ordinaires en solo et les brèches à deux ; il ne juge pas le fun. Les tests de charge montrent que la simulation reste dans son budget dans les conditions mesurées ; ils ne remplacent pas un groupe de joueurs. Les bonus, compagnons, garde-robe, décors et passages coopératifs ont été ajoutés à la demande, mais la suite de la Phase 2 doit encore s’appuyer sur ces retours.
