# TOWER X

- Respecter la Phase 1 du cahier des charges ; ne pas commencer les Phases 2/3 sans instruction de l’utilisateur.
- TypeScript strict. La simulation commune vit dans `packages/game-core` ; aucun gameplay autoritaire dans React.
- Le serveur décide des positions, camps, records et interactions. Les clients n’envoient que des actions versionnées.
- Les routes ordinaires restent traversables en solo. À la demande de l’utilisateur, les passages signalés coopératifs demandent deux personnages ; valider la courte échelle et le passage du partenaire, avec aide des bots. Après modification de génération/physique : `npm run validate:chunks` et `npm test`.
- L’interface est en français, les graphismes pixel art sont originaux et dessinés dans `apps/web/src/game/art.ts`.
- Contrôles finaux : `npm run build`, `npm test`, et les tests E2E pertinents. Les tests réseau ouvrent des ports locaux.
- Les sauvegardes `.data/` et les secrets `.env` ne sont jamais des fixtures. Utiliser les mondes temporaires des scripts de test.
- Documenter les limites mesurées ; ne pas assimiler des bots réseau à un playtest humain.
