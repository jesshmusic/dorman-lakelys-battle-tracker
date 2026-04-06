# Changelog

All notable changes to this project will be documented in this file.

## [1.0.2] - 2026-04-06

### Changed
- Foundry VTT v14 compatibility verified. Bumped `compatibility.verified` to `14`. **Minimum Foundry version bumped to `14`** — earlier versions of this module remain available for v13 users from the GitHub releases page; this version is v14-only by design. No source changes were required — the existing ApplicationV2, DialogV2, and `getSceneControlButtons` patterns are unchanged in v14.

## [1.0.1] - 2026-03-27

### Other
- Initial release of Dorman Lakely's Battle Tracker v1.0.0


## [1.0.0] - 2026-03-27

### Added
- Initial release
- Dual faction morale HP pools with configurable max HP
- Advance Battle Round with opposed dice rolls (1d20, 3d6, 2d10, 1d12, 4d6)
- Foundry Roll integration with dice sounds and dice log
- GM morale shift buttons (+/- 1, 2, 5)
- Named roll modifiers per faction
- Configurable ambient damage range
- Narrative event tables (customizable per battle)
- Threshold events at 75%, 50%, 25% morale with editable text
- Victory chat card when a faction reaches 0 HP
- Player-facing tug-of-war HUD (hidden from primary GM)
- Draggable HUD with saved position per user
- Battle preset save/load/delete system
- Edit Battle dialog for mid-battle configuration changes
- Instructions/Help popup
- XSS prevention for user-controlled text
- Multi-client sync via socket events
