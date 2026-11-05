# skill-groups

Plugin OpenCode qui permet de regrouper des skills en **groupes nommés**, puis d'**activer un sous-ensemble** de groupes et de skills pour chaque dépôt (projet). Les skills non autorisés pour le dépôt courant sont masqués.

## Emplacement

Stocké dans `.opencode/plugins/skill-groups/` (plugin local chargé automatiquement).

## Concepts

- **Groupe** : un ensemble nommé de skills (`{ id, name, skills }`).
- **Dépôt (repo)** : une sélection par projet composée de groupes activés et de skills individuels activés.
- **Configuration** : stockée via le storage du plugin, partagée entre dépôts (la sélection est par dépôt).

Si aucune sélection (aucun groupe ni skill individuel) n'est définie pour un dépôt, **tous les skills restent disponibles** (comportement par défaut). Dès qu'une sélection existe, seuls les skills autorisés (union des skills des groupes activés + skills individuels) sont conservés.

## Usage

Ouvrir le menu :

- Commande slash : `/skill-groups`
- Palette de commandes : "Skill groups"

Le menu propose deux actions :

### 1. Gérer les groupes

- **Créer un groupe** : saisir un nom ; un identifiant est généré automatiquement.
- **Renommer un groupe** : choisir un groupe, saisir le nouveau nom.
- **Éditer les skills d'un groupe** : choisir un groupe, puis toggler les skills disponibles (✓ = inclus). Terminer avec "Terminé".
- **Supprimer un groupe** : choisir un groupe et confirmer.

### 2. Activer pour un dépôt

1. Choisir un dépôt (projet).
2. **Phase 1 — groupes** : toggler les groupes à activer pour ce dépôt ("Suivant: skills individuels" pour passer).
3. **Phase 2 — skills individuels** : toggler des skills supplémentaires un par un ("Terminé" pour finir).

Les changements sont enregistrés à chaque action et appliqués immédiatement (rechargement des skills).

## Architecture

- `index.ts` : backend. Charge la configuration, enregistre un transform sur les skills (`ctx.skill.transform`) qui filtre selon la sélection du dépôt courant, expose le RPC `getConfig`/`saveConfig`, recharge les skills sur événements.
- `tui.tsx` : interface TUI (menus, dialogues, keymap).
- `rpc.ts` : définition du contrat RPC et de l'événement `updated`.
- `types.ts` : types `SkillGroup`, `RepoConfig`, `StoreData`.

## Dépannage

- Si les skills ne se filtrent pas, vérifier qu'une sélection existe pour le dépôt courant (sinon tous restent actifs).
- En cas d'erreur RPC, le plugin ignore l'enregistrement et continue sans transform dynamique ; relancer OpenCode.
- Les logs d'erreur sont affichés via des toasts dans l'interface.