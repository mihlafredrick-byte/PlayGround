# Iron & Eagles — Waterloo, 1815

A playable, top-down 2D Napoleonic Wars strategy game. Take command of the French **Armée du Nord** at Waterloo: manoeuvre line infantry, light troops, artillery, cuirassiers and the Old Guard, break the Allied line, and take the crossroads at **La Haye Sainte**.

Built with plain HTML, CSS and ES modules on a Canvas 2D renderer. No build step or dependencies.

## Play

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or serve the folder with any static web server (the game uses ES modules, so opening `index.html` directly from `file://` will not work).

## Command

| Action | Desktop | Touch |
| --- | --- | --- |
| Select a regiment | Left click a unit or card, drag a box for several | Tap a unit or card |
| March | Right click the field | Select, then tap the field |
| Attack | Right click an enemy regiment | Select, then tap an enemy |
| Set facing | Right-drag from a unit | — |
| Pan / zoom | WASD or middle-drag / mouse wheel | One-finger drag / pinch |
| Form line or column | `F` or the panel button | Panel button |
| Hold fire | `H` | Panel button |
| Bayonet charge | `C` | Panel button |
| Pause / game speed | `Space` / buttons in the top bar | Pause button |
| Select regiments 1–6 | `1`–`6` | Roster cards |
| Centre on the crossroads | `M` | — |

## Features

- **Real-time tactical combat** with formation movement, volley fire, reload cycles, artillery bombardment, cavalry charges, melee and morale routs.
- **Animated soldiers** drawn from pre-rendered sprite sheets: march, aim, fire, reload and melee poses for French and Allied troops.
- **Ragdoll physics** for casualties, with persistent corpses, blood decals and drifting musket smoke.
- **Objective play**: clear the farm, take La Haye Sainte, then hold the crossroads while the Allied centre breaks.
- **Responsive HUD** with unit cards, selection panel, army morale, minimap, field orders, pause, speed and help.
- **Procedural battlefield**: fields, orchards, hedgerows, roads, the farm and its garden, trees and ambient audio.

## Structure

```
index.html          shell, HUD markup, overlays
css/style.css       HUD, parchment/brass styling and responsive layout
js/main.js          game loop, camera, input, AI, objectives, effects, HUD
js/units.js         soldiers, regiments, sprites, formations, combat
js/ragdoll.js       Verlet ragdoll physics and corpse rendering
js/terrain.js       procedural map and farm objective zone
js/audio.js         WebAudio ambient, muskets, cannon, drums and bugles
js/utils.js         math, noise, geometry and colour helpers
```

## Tips

- Concentrate several regiments on one battalion at a time; spread attacks let the Allies volley each regiment in turn.
- Keep the battery behind the line and let it work the farm before you close.
- Infantry dress at volley range. A **Bayonets** charge closes the distance quickly, but a broken formation will not survive the melee.
- Watch morale, not just numbers. Flanked regiments and battered battalions break early; once a regiment routs it cannot be controlled again.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/mihlafredrick-byte/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/mihlafredrick-byte/PlayGround)

- 🎮 [Open the project](https://omgithub.com/mihlafredrick-byte/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=mihlafredrick-byte%2FPlayGround).
- 💻 [Explore the source](https://github.com/mihlafredrick-byte/PlayGround).
- 🛠️ [Check build runs](https://github.com/mihlafredrick-byte/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/mihlafredrick-byte/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/mihlafredrick-byte).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
