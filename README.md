# Emberfall: The Emberwild Saga

A party-based fantasy role-playing game that runs entirely in the browser, in the
style of the late-1980s "gold box" computer RPGs: first-person exploration of
towns and dungeons, an overland wilderness map, and turn-based tactical combat
using second-edition tabletop rules.

There is nothing to install and nothing to build. The whole game is one HTML
page, one stylesheet and a handful of plain JavaScript files, with no
dependencies. All artwork (textures, sprites, portraits, maps) is drawn by code
at start-up, so the repository contains no image or sound files.

## Playing

Open `index.html` in a modern browser. That is all.

To play from another device (a tablet or phone on the same network), serve the
folder with any static web server, for example:

```sh
python3 -m http.server 8000
```

and browse to `http://<your-computer>:8000/`.

Games are saved in the browser's local storage, so saves belong to one browser
on one device and to the address the game was loaded from.

## The game

You lead a company of up to six adventurers through four linked adventures.
Each has its own home town, dungeons, commissions and final enemy, and they can
be played alone or in order with the same company.

| Code | Adventure | Levels | Difficulty | Length |
| --- | --- | --- | --- | --- |
| E0 | The Cellars of Thornwick | 1–2 | Easy | About an hour |
| E1 | The Hollow Vaults | 1–3 | Standard | Several hours |
| E2 | Barrow of the Iron King | 3–5 | Hard | Two to three hours |
| E3 | The Witch-Queen of Ravenmoor | 5–7 | Deadly | Three hours or more |

What is in it:

- **Character creation** with races, classes, ability scores and alignments, or
  a ready-made company to start at once.
- **First-person exploration** of towns and dungeons in a textured 3D view, with
  shops, temples, inns, training halls, locked doors, secret doors, traps and
  treasure.
- **Overland travel** across the Emberwild, where terrain, time of day and
  fatigue affect travel and encounters.
- **Tactical combat** on an isometric field: initiative, movement, melee and
  missile attacks, spells, backstabs, turning undead, morale and fleeing.
- **Second-edition rules**: THAC0 and descending armor class, five saving-throw
  categories, class experience tables, spell memorization and rest.
- **Quest journal** of commissions and dated notes, a **bestiary** that fills in
  as you meet and fight creatures, and a **full map** of each area.
- **Dropped items stay in the world** as loot on the ground.
- **Touch support**: an optional on-screen movement pad, icon command bar and
  layouts for tablets and phones in either orientation.

## Controls

| Key | Action |
| --- | --- |
| `W` `S` / `↑` `↓` | Move forward / back |
| `A` `D` / `←` `→` | Turn left / right |
| `Q` `E` | Sidestep (in the wilds: move diagonally, with `Z` `C`) |
| `F` | Search for secret doors |
| `R` | Make camp |
| `P` | Show or hide the party list |
| `1`–`6` | Open a character sheet |
| `M` | Full map |
| `J` | Journal |
| `B` | Bestiary |
| `Esc` | Menu (save, load, help, touch controls) |
| `Enter` | Visit the place you are standing on (overland) |

In combat, click a highlighted square to move and an enemy to attack; `Space`
ends the turn and `Q` lets the computer fight for you. The in-game **How to
Play** page (in the menu) covers the rules in more detail.

On a touch screen, tap the ✥ button at the top left of the view to place the
movement pad on the right, the left, both sides, or turn it off.

## Project layout

```
index.html        the page and the order the scripts load in
css/style.css     all styling, including tablet and phone layouts
js/rules.js       game rules: abilities, classes, saving throws, spell slots, experience
js/data.js        items, spells, monsters and the first adventure's maps
js/modules.js     the adventure modules: maps, quests, encounters, extra monsters
js/figures.js     procedurally drawn character and monster figures
js/view3d.js      the first-person raycasting renderer, textures and minimap
js/ui.js          dialogs, command bar, party list, character sheets, shops
js/combat.js      tactical combat
js/overland.js    wilderness map, travel and encounters
js/campaign.js    moving a company between adventures
js/journal.js     quest journal
js/map.js         full-page map and minimap markers
js/bestiary.js    bestiary and encounter portraits
js/navpad.js      on-screen movement pad
js/game.js        game state, saving, exploration and input
```

The code is plain JavaScript loaded with ordinary `<script>` tags; there is no
build step, bundler or package manager. Edit a file and reload the page.

## Browser support

A recent version of Chrome, Edge, Firefox or Safari (including iPadOS and iOS
Safari 16 or later). The layout uses CSS container queries and `:has()`.

## Licence and credits

Released under the [MIT License](LICENSE).

This is an unofficial, non-commercial fan project. The setting, characters,
adventures, text and artwork are original. It is not affiliated with or
endorsed by the owners of any tabletop or computer role-playing game it takes
inspiration from.
