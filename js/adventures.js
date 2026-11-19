'use strict';
/* ============================================================
   Generated adventures: ten for each band of levels (1-4, 5-8,
   9-12, 13-16, 17-20): four small, three medium, two large and
   one huge. Each is assembled once, when the game loads, from a
   theme (who the enemy is), a seed (so it is the same every
   time) and a size: a home town, one to five dungeon levels,
   set battles drawn from the bestiary by level, named villains,
   commissions, and treasure from the treasure tables.
   The result is ordinary MODULES / MAPS / QUESTS data, played
   by the same code as the hand-written adventures.
   ============================================================ */
const ADVENTURES = (() => {
  /* a small seeded generator, so every adventure comes out the same each time */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pk = (R, a) => a[Math.floor(R() * a.length)];
  const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
  const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  /* ---------------- themes: who the enemy is ----------------
     tex: [wall, floor, ceiling, battlefield]. mons: the rank and file. bosses: leaders, weakest first. */
  const THEMES = {
    undead: { tex: [['crypt', 'cryptfloor', 'vault', 'crypt'], ['barrow', 'dirt', 'barrow', 'barrow']], places: ['Crypt', 'Barrow', 'Catacombs', 'Ossuary', 'Mausoleum', 'Tombs'], adj: ['Silent', 'Sunless', 'Weeping', 'Hollow'],
      titles: ['the Unburied', 'the Pale', 'the Bone-Lord', 'of the Long Night', 'the Hollow King', 'Grave-Warden'], trouble: 'graves stand open and the dead walk the lanes after dark',
      entrance: 'A stair of worn stone leads down beneath the old burial ground. The air that rises from it is cold and smells of dust and old incense.',
      mons: ['skeleton', 'zombie', 'ghoul', 'cultist', 'adept', 'ghast', 'shadow', 'wight', 'wraith', 'mummy', 'spectre', 'vampire', 'ghost'], bosses: ['ghast', 'wight', 'wraith', 'mummy', 'spectre', 'banshee', 'vampire', 'ghost', 'lich'] },
    goblinoid: { tex: [['dungeon', 'flag', 'vault', 'dungeon'], ['cave', 'cavefloor', 'cave', 'cave']], places: ['Warren', 'Hold', 'Delve', 'Stockade', 'Burrows'], adj: ['Broken', 'Red', 'Howling', 'Smoking'],
      titles: ['Skullsplitter', 'the Red Hand', 'Ironjaw', 'the Flayer', 'Many-Scars', 'Warlord'], trouble: 'raiders burn the outlying farms and carry off folk and cattle',
      entrance: 'A crude stockade of sharpened logs guards a cleft in the hillside. Beyond it a tunnel slopes down, lit by guttering torches and loud with harsh voices.',
      mons: ['kobold', 'goblin', 'slinger', 'orc', 'hobgoblin', 'gnoll', 'wolf', 'bugbear', 'worg', 'hyena', 'ogre', 'troll'], bosses: ['bugbear', 'ogre', 'ogreMage', 'troll', 'ettin'] },
    bandits: { tex: [['keep', 'keepfloor', 'vault', 'keep'], ['dungeon', 'flag', 'vault', 'dungeon']], places: ['Keep', 'Hideout', 'Redoubt', 'Tower', 'Vaults'], adj: ['Robbers\'', 'Black', 'Fallen', 'Crooked'],
      titles: ['the Knife', 'Black-Hand', 'the Usurer', 'One-Eye', 'the Faceless', 'Gallows-Cheat'], trouble: 'the roads are closed by robbers who answer to a hidden master',
      entrance: 'The old toll-keep on the ridge was abandoned a generation ago. Now smoke rises from its chimneys again, and a cellar door stands newly barred.',
      mons: ['thug', 'bandit', 'archer', 'wildDog', 'berserker', 'nomad', 'warDog', 'caveman', 'ogre', 'captain'], bosses: ['captain', 'ogre', 'wererat', 'doppelganger', 'ogreMage'] },
    vermin: { tex: [['cave', 'cavefloor', 'cave', 'cave'], ['mine', 'cavefloor', 'cave', 'cave']], places: ['Hive', 'Nest', 'Burrows', 'Tunnels', 'Hollows'], adj: ['Chittering', 'Crawling', 'Webbed', 'Seething'],
      titles: ['the Brood-Mother', 'the Devourer', 'Queen of the Hive', 'the Many-Legged'], trouble: 'livestock vanish in the night and the ground is riddled with fresh burrows',
      entrance: 'The earth has fallen in beside the mill, leaving a ragged hole a horse could walk into. The walls are smooth, as if chewed, and something clicks in the dark below.',
      mons: ['rat', 'centipede', 'fireBeetle', 'spider', 'giantAnt', 'stirge', 'spiderHuge', 'giantAntWarrior', 'beetleBombardier', 'giantWasp', 'beetleBoring', 'crawler', 'giantScorpion', 'spiderGiant', 'beetleStag', 'spiderPhase', 'ankheg', 'beetleRhino'],
      bosses: ['spiderGiant', 'ankheg', 'giantScorpion', 'spiderPhase', 'beetleRhino', 'purpleWorm'] },
    swamp: { tex: [['ruin', 'dirt', 'cave', 'swamp'], ['cave', 'cavefloor', 'cave', 'swamp']], places: ['Sunken Temple', 'Mire', 'Drowned Halls', 'Fen-Hold', 'Marsh Caves'], adj: ['Sunken', 'Rotting', 'Drowned', 'Black'],
      titles: ['the Scaled King', 'Fen-Mother', 'the Drowner', 'of the Black Water', 'Mire-Lord'], trouble: 'the marsh has crept up to the walls and scaled things come out of it at night',
      entrance: 'A causeway of slick stones runs out into the fen and ends at a half-drowned arch. Steps lead down under the black water\'s edge into echoing dark.',
      mons: ['giantFrog', 'giantToad', 'lizardman', 'troglodyte', 'crocodile', 'snakePoison', 'giantLizard', 'snakeConstrictor', 'hydra', 'giantCrocodile', 'shamblingMound', 'basilisk', 'willowisp', 'hydraGreat', 'catoblepas'],
      bosses: ['giantCrocodile', 'hydra', 'basilisk', 'nagaSpirit', 'catoblepas', 'dragonBlack', 'hydraGreat'] },
    beasts: { tex: [['cave', 'cavefloor', 'cave', 'cave'], ['ruin', 'dirt', 'cave', 'cave']], places: ['Lost Valley', 'Dens', 'Hunting Grounds', 'Caverns', 'Gorge'], adj: ['Savage', 'Lost', 'Bloodied', 'Roaring'],
      titles: ['the Man-Eater', 'Old Scar', 'the Great Beast', 'the Ravager', 'King of the Valley'], trouble: 'hunters do not come home, and what is found of them is not much',
      entrance: 'Past the last farm the track climbs into a gorge thick with bones. A cave mouth opens in the cliff, rank with the smell of a predator\'s den.',
      mons: ['jackal', 'wildDog', 'wolf', 'wildBoar', 'bearBlack', 'mountainLion', 'leopard', 'direWolf', 'lion', 'bearBrown', 'tiger', 'owlbear', 'bearCave', 'giantBoar', 'sabreTooth', 'rhinoceros', 'pteranodon', 'elephant', 'mammoth', 'triceratops', 'stegosaurus'],
      bosses: ['owlbear', 'bearCave', 'sabreTooth', 'griffon', 'mammoth', 'tyrannosaurus', 'roc'] },
    lycanthrope: { tex: [['dungeon', 'flag', 'vault', 'dungeon'], ['ruin', 'dirt', 'cave', 'dungeon']], places: ['Lodge', 'Den', 'Old Manor', 'Kennels', 'Moon-Hall'], adj: ['Moonlit', 'Howling', 'Cursed', 'Bloody'],
      titles: ['the Moon-Cursed', 'Pack-Father', 'the Grey Lord', 'of the Red Moon', 'Skin-Changer'], trouble: 'something that walks as a man by day hunts the streets when the moon is full',
      entrance: 'The manor on the hill has been shuttered for years, yet its dogs still howl. A cellar grating has been torn out from the inside, and the claw marks on the stone are fresh.',
      mons: ['wolf', 'wererat', 'direWolf', 'worg', 'werewolf', 'jackalwere', 'wereboar', 'weretiger', 'werebear'], bosses: ['werewolf', 'wereboar', 'weretiger', 'werebear'] },
    fungus: { tex: [['cave', 'cavefloor', 'cave', 'cave'], ['mine', 'cavefloor', 'cave', 'cave']], places: ['Rot-Caves', 'Fungus Grotto', 'Weeping Caverns', 'Slime Pits'], adj: ['Dripping', 'Glowing', 'Rotting', 'Weeping'],
      titles: ['the Devouring', 'the Unformed', 'That Which Creeps', 'the Great Rot'], trouble: 'wells have turned foul and a grey rot spreads through the cellars',
      entrance: 'Under the old well-house a crack has opened into natural caverns. The walls gleam wetly, pale caps of fungus glow in the dark, and the smell would turn a stomach of iron.',
      mons: ['giantFrog', 'violetFungus', 'giantToad', 'grayOoze', 'gelatinousCube', 'slitheringTracker', 'ochreJelly', 'shamblingMound', 'blackPudding', 'giantSlug'], bosses: ['gelatinousCube', 'ochreJelly', 'shamblingMound', 'blackPudding', 'giantSlug'] },
    giants: { tex: [['keep', 'keepfloor', 'vault', 'keep'], ['cave', 'cavefloor', 'cave', 'cave']], places: ['Steading', 'Hall', 'Rift', 'Stronghold', 'High Seat'], adj: ['Thundering', 'Cloud-Wrapped', 'Great', 'Cold'],
      titles: ['the Jarl', 'Stone-Breaker', 'the High King', 'Thunder-Voice', 'World-Shaker', 'the Thane'], trouble: 'boulders fall on the walls from a mile away and whole herds are taken as tribute',
      entrance: 'A stair cut for legs twice the length of a man\'s climbs to a gate of iron-bound timber. From within come voices like rockfalls, and the reek of a great hearth.',
      mons: ['ogre', 'direWolf', 'worg', 'hellhound', 'winterWolf', 'troll', 'ogreMage', 'bearCave', 'ettin', 'giantHill', 'giantStone', 'giantFrost', 'giantFire', 'giantCloud'],
      bosses: ['ettin', 'giantHill', 'giantStone', 'giantFrost', 'giantFire', 'giantCloud', 'giantStorm', 'titan'] },
    dragon: { tex: [['cave', 'cavefloor', 'cave', 'pit'], ['ruin', 'dirt', 'cave', 'pit']], places: ['Lair', 'Burning Caves', 'Wyrm-Hold', 'Scorched Halls', 'Hoard-Vaults'], adj: ['Burning', 'Scorched', 'Smouldering', 'Glittering'],
      titles: ['the Devourer', 'Ash-Wing', 'the Ancient', 'Flame of the North', 'the Night-Wyrm', 'Gold-Hoarder'], trouble: 'a vast shadow crosses the moon, and by morning a village is ash',
      entrance: 'The mountainside is burned black and nothing grows. A cavern gapes in the scorched rock, wide enough for something very large to come and go.',
      mons: ['kobold', 'lizardman', 'troglodyte', 'giantLizard', 'hydra', 'wyvern', 'minotaurLizard', 'salamander', 'dragonne', 'fireLizard', 'dragonWhite', 'dragonBlack', 'hydraGreat', 'dragonGreen'],
      bosses: ['wyvern', 'dragonWhite', 'dragonBlack', 'dragonGreen', 'dragonBlue', 'dragonRed', 'dragonRedGreat'] },
    demons: { tex: [['crypt', 'cryptfloor', 'vault', 'sanctum'], ['dungeon', 'flag', 'vault', 'sanctum']], places: ['Fane', 'Black Temple', 'Abyssal Gate', 'Shrine', 'Pit'], adj: ['Black', 'Screaming', 'Profane', 'Blood-Stained'],
      titles: ['the Defiler', 'Lord of the Pit', 'the Whisperer', 'Flesh-Render', 'of the Burning Eye'], trouble: 'a hidden cult has opened a door that should have stayed shut',
      entrance: 'Behind a false wall in the chandler\'s cellar, steps descend to a door carved with signs that hurt the eye. It is not quite closed, and the candles nearby burn blue.',
      mons: ['cultist', 'adept', 'manes', 'quasit', 'gargoyle', 'hellhound', 'succubus', 'nightmare', 'demon1', 'nightHag', 'demon2', 'demon3', 'demon4'], bosses: ['adept', 'succubus', 'demon1', 'demon2', 'demon3', 'demon4', 'demon5', 'demon6'] },
    devils: { tex: [['keep', 'keepfloor', 'vault', 'sanctum'], ['dungeon', 'flag', 'vault', 'sanctum']], places: ['Iron Citadel', 'Court', 'Infernal Vaults', 'Brazen Halls', 'Furnace'], adj: ['Iron', 'Brazen', 'Burning', 'Merciless'],
      titles: ['the Contract-Holder', 'Duke of Chains', 'the Iron Judge', 'Lord of the Ninth Gate', 'the Tormentor'], trouble: 'the town\'s great men have signed something in blood, and the debt has come due',
      entrance: 'The magistrate\'s vault has a second door that appears in no plan. Heat breathes from beneath it, and with it the sound of chains and a patient, reasonable voice.',
      mons: ['lemure', 'imp', 'hellhound', 'erinyes', 'devilBarbed', 'nightmare', 'devilBone', 'devilHorned', 'devilIce'], bosses: ['erinyes', 'devilBarbed', 'devilBone', 'devilHorned', 'devilIce', 'pitFiend'] },
    underdark: { tex: [['cave', 'cavefloor', 'cave', 'cave'], ['mine', 'cavefloor', 'cave', 'pit']], places: ['Deeps', 'Lightless Halls', 'Under-Roads', 'Abyss', 'Black Galleries'], adj: ['Lightless', 'Bottomless', 'Whispering', 'Sunless'],
      titles: ['the Mind-Lord', 'the Eye Tyrant', 'the Unblinking', 'That Which Waits Below', 'the Brain-Eater'], trouble: 'miners broke through into something vast, and now folk wake with other voices in their heads',
      entrance: 'At the bottom of the deepest shaft the rock simply ends, and a road of fitted stone runs on into darkness, built by no hand that ever saw the sun.',
      mons: ['troglodyte', 'piercer', 'crawler', 'gelatinousCube', 'rustMonster', 'grayOoze', 'ochreJelly', 'otyugh', 'umberHulk', 'intellectDevourer', 'xorn', 'blackPudding', 'lurkerAbove', 'roper', 'neoOtyugh', 'trapper', 'mindFlayer', 'purpleWorm'],
      bosses: ['umberHulk', 'roper', 'mindFlayer', 'purpleWorm', 'beholder'] },
    wizard: { tex: [['dungeon', 'flag', 'vault', 'sanctum'], ['keep', 'keepfloor', 'vault', 'sanctum']], places: ['Tower', 'Laboratory', 'Vaults', 'Sanctum', 'Orrery'], adj: ['Shuttered', 'Silent', 'Forbidden', 'Thousand-Eyed'],
      titles: ['the Unseen', 'Master of Wards', 'the Deathless', 'the Illusionist', 'of the Sealed Tower'], trouble: 'the recluse in the tower has stopped answering letters, and the tower\'s guardians have started walking',
      entrance: 'The tower door stands open for the first time in living memory. Inside, a stair descends where no stair should fit, lit by lamps that burn without oil.',
      mons: ['homunculus', 'gargoyle', 'doppelganger', 'mimic', 'golemFlesh', 'invisibleStalker', 'golemClay', 'elementalEarth', 'golemStone', 'elementalAir', 'golemIron'], bosses: ['ravenWitch', 'lamia', 'rakshasa', 'nagaSpirit', 'golemIron', 'lich'] },
    elemental: { tex: [['cave', 'cavefloor', 'cave', 'pit'], ['keep', 'keepfloor', 'vault', 'pit']], places: ['Forge', 'Nexus', 'Burning Deeps', 'Brass Gate', 'Crucible'], adj: ['Burning', 'Molten', 'Howling', 'Brazen'],
      titles: ['the Burning Sultan', 'Lord of Embers', 'the Brass Vizier', 'Flame-Tyrant'], trouble: 'the hot springs boil, the forge-fires will not go out, and ash falls like snow',
      entrance: 'The old volcano\'s flank has split, and inside the rift a gate of hot brass stands ajar. The air beyond shimmers, and things move in it that are made of flame.',
      mons: ['hellhound', 'fireLizard', 'salamander', 'xorn', 'invisibleStalker', 'elementalEarth', 'elementalFire', 'elementalAir', 'elementalWater', 'djinni'], bosses: ['salamander', 'efreeti', 'elementalFire', 'giantFire'] },
    menagerie: { tex: [['ruin', 'dirt', 'cave', 'dungeon'], ['dungeon', 'flag', 'vault', 'dungeon']], places: ['Garden', 'Labyrinth', 'Menagerie', 'Ruined Palace', 'Statue-Court'], adj: ['Stone', 'Overgrown', 'Silent', 'Forgotten'],
      titles: ['the Statue-Maker', 'Lady of Serpents', 'the Riddler', 'Keeper of the Maze', 'the Collector'], trouble: 'travellers turn up in the hills as statues, every one with the same look of surprise',
      entrance: 'Among the ruins of a pleasure-palace stands a garden of remarkably lifelike statues. A stair between two of them, both caught mid-scream, leads down.',
      mons: ['harpy', 'cockatrice', 'hippogriff', 'minotaur', 'peryton', 'leucrotta', 'owlbear', 'displacerBeast', 'manticore', 'griffon', 'basilisk', 'medusa', 'gorgon', 'chimera', 'sphinxHieraco'],
      bosses: ['minotaur', 'medusa', 'manticore', 'gorgon', 'chimera', 'lamia', 'sphinxHieraco', 'nagaSpirit'] },
    frozen: { tex: [['cave', 'cavefloor', 'cave', 'cave'], ['keep', 'keepfloor', 'vault', 'keep']], places: ['Ice Caves', 'Glacier-Hold', 'Frozen Halls', 'Winter Gate', 'Rime-Deeps'], adj: ['Frozen', 'Howling', 'White', 'Winter'],
      titles: ['the Winter King', 'Rime-Beard', 'the White Death', 'of the Endless Snow', 'Frost-Father'], trouble: 'winter has not ended this year, and the wolves that come down from the ice can talk',
      entrance: 'A tongue of blue ice has pushed down the valley to the very edge of the fields. In its face a tunnel has been cut, and a wind blows out of it that never stops.',
      mons: ['wolf', 'direWolf', 'yeti', 'winterWolf', 'bearCave', 'mammoth', 'remorhaz', 'giantFrost', 'dragonWhite'], bosses: ['yeti', 'winterWolf', 'remorhaz', 'dragonWhite', 'giantFrost'] },
  };

  /* the fifty adventures: [theme, size] for each band of levels. S small, M medium, L large, H huge */
  const PLAN = [
    { lo: 1, hi: 4, list: [['vermin', 'S'], ['fungus', 'S'], ['beasts', 'S'], ['bandits', 'S'], ['goblinoid', 'M'], ['swamp', 'M'], ['lycanthrope', 'M'], ['undead', 'L'], ['goblinoid', 'L'], ['undead', 'H']] },
    { lo: 5, hi: 8, list: [['vermin', 'S'], ['beasts', 'S'], ['menagerie', 'S'], ['wizard', 'S'], ['lycanthrope', 'M'], ['swamp', 'M'], ['frozen', 'M'], ['giants', 'L'], ['demons', 'L'], ['dragon', 'H']] },
    { lo: 9, hi: 12, list: [['beasts', 'S'], ['swamp', 'S'], ['elemental', 'S'], ['menagerie', 'S'], ['underdark', 'M'], ['devils', 'M'], ['giants', 'M'], ['undead', 'L'], ['dragon', 'L'], ['demons', 'H']] },
    { lo: 13, hi: 16, list: [['beasts', 'S'], ['elemental', 'S'], ['menagerie', 'S'], ['frozen', 'S'], ['wizard', 'M'], ['underdark', 'M'], ['demons', 'M'], ['giants', 'L'], ['devils', 'L'], ['dragon', 'H']] },
    { lo: 17, hi: 20, list: [['giants', 'S'], ['underdark', 'S'], ['dragon', 'S'], ['wizard', 'S'], ['demons', 'M'], ['devils', 'M'], ['undead', 'M'], ['giants', 'L'], ['dragon', 'L'], ['undead', 'H']] },
  ];
  const SIZES = {
    S: { name: 'Small', levels: 1, length: 'About an hour', diff: [2, 2, 3] },
    M: { name: 'Medium', levels: 2, length: 'Two hours or so', diff: [2, 3, 3] },
    L: { name: 'Large', levels: 3, length: 'Three to four hours', diff: [3, 3, 4] },
    H: { name: 'Huge', levels: 5, length: 'A long campaign: six hours or more', diff: [4] },
  };

  /* ---------------- names ---------------- */
  const TOWN_A = ['Oak', 'Stone', 'Raven', 'Ash', 'Wolf', 'Iron', 'Green', 'Black', 'High', 'Mist', 'Thorn', 'Frost', 'Red', 'Elder', 'Salt', 'Wind', 'Gold', 'Marsh', 'Crow', 'Deep', 'Grey', 'Briar', 'Hart', 'Fal', 'Dun', 'Amber', 'Silver', 'Storm', 'Kings', 'Wester'];
  const TOWN_B = ['ford', 'haven', 'wick', 'dale', 'mere', 'hold', 'gate', 'stead', 'bridge', 'watch', 'fell', 'crest', 'moor', 'reach', 'hollow', 'march', 'well', 'by', 'ton', 'cross'];
  const NAME_A = ['Kaz', 'Mor', 'Vel', 'Thra', 'Ul', 'Gor', 'Sha', 'Nyx', 'Dra', 'Zul', 'Bel', 'Ix', 'Har', 'Vor', 'Ske', 'Mal', 'Az', 'Kor', 'Ny', 'Oth', 'Ur', 'Gra', 'Sar', 'Xan', 'Hesk', 'Ob', 'Yr'];
  const NAME_B = ['gath', 'reth', 'oth', 'mir', 'ax', 'ul', 'ra', 'eth', 'gar', 'ys', 'ane', 'uk', 'azar', 'ion', 'ok', 'esh', 'una', 'ith', 'rak', 'oon'];
  const FOLK_A = ['Aldous', 'Brenna', 'Corwin', 'Dalla', 'Edric', 'Ferra', 'Garth', 'Hilde', 'Ivo', 'Jessa', 'Kell', 'Lyssa', 'Marek', 'Nessa', 'Osric', 'Petra', 'Quill', 'Rowan', 'Sigrun', 'Tobin', 'Una', 'Varro', 'Wynn', 'Yorick'];
  const FOLK_B = ['Ashdown', 'Blackwood', 'Carrow', 'Dunmere', 'Eastlake', 'Fairwind', 'Greyfell', 'Harrow', 'Ironwood', 'Kettle', 'Longstride', 'Marsh', 'Northgate', 'Oakenshaw', 'Pike', 'Redfern', 'Stonehill', 'Thorne', 'Underhill', 'Vance'];
  const RANKS = ['Reeve', 'Burgomaster', 'Lady', 'Lord', 'Warden', 'Magistrate', 'Captain', 'Abbot', 'Elder', 'Castellan'];
  const INNS = ['The Wandering Stag', 'The Bell and Candle', 'The Last Lantern', 'The Sleeping Giant', 'The Three Crowns', 'The Broken Wheel', 'The Silver Trout', 'The Green Dragon', 'The Hanged Crow', 'The Pilgrim\'s Rest', 'The Red Lion', 'The Mended Drum'];
  const TAVERNS = ['The Rusty Flagon', 'The Laughing Ogre', 'The Blind Piper', 'The Gilded Goose', 'The Cracked Bell', 'The Anchor', 'The Hole in the Wall', 'The Leaky Boot'];
  const LEVEL_NAMES = ['Upper Halls', 'Lower Halls', 'The Deeps', 'The Black Stair', 'The Heart'];
  const lvlName = j => (j < 2 ? 'the ' : '') + LEVEL_NAMES[j].toLowerCase();
  const SIDE_ITEMS = [['a signet ring', 'Signet Ring of %T', 'The seal of %T was on the hand of a messenger who never arrived. Without it no charter can be sealed.'],
    ['the surveyor\'s map case', 'Surveyor\'s Map Case', 'Our surveyor went down there to chart the place and did not come back. His maps would be worth a great deal to us.'],
    ['a temple chalice', 'Stolen Temple Chalice', 'The chalice was taken from the altar. The priests say the shrine cannot be reconsecrated without it.'],
    ['a ledger of names', 'Ledger of the Missing', 'There is a book in which they wrote down everyone they took. The families deserve to know.'],
    ['an heirloom sword', 'Heirloom Sword of %T', 'My grandfather\'s sword went down there on a braver man than me. It should hang in the hall again.'],
    ['the old charter', 'Founding Charter of %T', 'The town\'s founding charter was hidden below in the last war and never recovered. It proves our rights to the land.'],
    ['a healer\'s satchel', 'Healer\'s Satchel', 'Sister Maren went to tend the wounded and was lost. Her satchel holds the only copy of her remedies.'],
    ['a carved horn', 'Watchman\'s Horn', 'The horn that calls the watch was carried off as a trophy. The town sleeps badly without it.']];
  const CLUTTER = ['broken crates', 'heaped bones', 'rotting sacks', 'toppled pillars', 'old campfires', 'gnawed carcasses', 'rusted chains', 'fallen masonry', 'smashed barrels', 'a cold forge'];
  const CHESTS = ['An iron-bound chest stands against the wall, its lock crusted with age.', 'Under a loose flagstone someone has hidden a strongbox.', 'A coffer of dark wood sits in a niche, half covered by a rotted tapestry.',
    'Among the litter lies a locked casket of beaten copper.', 'A heavy chest, chained to a ring in the floor.', 'Behind a stack of rubble a brass-cornered trunk catches the light.', 'A stone coffer with its lid slightly askew.'];

  /* ---------------- how dangerous a monster is ---------------- */
  /* the great villains count for more than their Hit Dice, so that they close only the adventures of the highest levels */
  const HEAVY = { dragonRedGreat: 26, titan: 28, lich: 24, pitFiend: 22, beholder: 20, demon6: 19, dragonRed: 17, dragonGold: 18, demon5: 16, giantStorm: 23, vampire: 14, mindFlayer: 14 };
  function weight(id) {
    const m = MONSTERS[id];
    if (HEAVY[m.base || id]) return HEAVY[m.base || id];
    let n = 0;
    for (const k of ['poison', 'paralyze', 'drain', 'breath', 'gaze', 'spells', 'regen', 'hitBy', 'petrify']) if (m[k]) n++;
    if (m.mr >= 50) n++;
    return Math.max(0.4, m.hd) * (1 + 0.12 * n) * (m.atk.length >= 4 ? 1.15 : 1);
  }
  /* the Hit Dice of opposition a company of level L should meet in one ordinary fight */
  const budget = L => (L <= 8 ? 2.4 * L : 19.2 + 1.7 * (L - 8));
  /* a group of monsters for a company of level L; k scales the size of the fight */
  function group(R, pool, L, k) {
    let cand = pool.filter(id => { const w = weight(id); return w >= Math.min(0.3 * L, 6) && w <= Math.max(1.3, 1.15 * L); });
    if (!cand.length) cand = pool.slice().sort((a, b) => Math.abs(weight(a) - 0.7 * L) - Math.abs(weight(b) - 0.7 * L)).slice(0, 2);
    const B = budget(L) * k, out = [], a = pk(R, cand), two = cand.length > 1 && R() < 0.4, b = two ? pk(R, cand.filter(x => x !== a)) : null;
    const count = (id, share) => clampN(Math.round(share / weight(id)), 1, weight(id) > 8 ? 4 : 8);
    out.push([a, count(a, two ? B * 0.6 : B)]);
    if (b) out.push([b, count(b, B * 0.4)]);
    return out;
  }
  function bossFor(theme, target, used) {
    const list = theme.bosses.filter(id => MONSTERS[id] && !used.includes(id));
    const ok = list.filter(id => weight(id) <= target * 1.15);
    return ok.length ? ok.reduce((a, b) => (weight(b) > weight(a) ? b : a)) : list.reduce((a, b) => (weight(b) < weight(a) ? b : a));
  }
  const maxHp = hp => { const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(String(hp)); return m ? String(+m[1] * +m[2] + (m[3] ? +m[3] : 0)) : String(hp); };

  /* ---------------- a dungeon level ----------------
     Twelve slots in a 4 x 3 grid; most hold a room. A spanning tree of corridors joins them, with a few loops.
     Returns { g (rows of characters), rooms (nearest the way in first) }. */
  function level(R) {
    const W = 25, H = 19, g = Array.from({ length: H }, () => Array(W).fill('#')), nodes = [], inRoom = new Set();
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
      const has = R() < 0.84, n = { i, j, has };
      if (has) {
        n.w = ri(R, 3, 5); n.h = ri(R, 3, 5); n.x0 = 1 + i * 6 + ri(R, 0, 5 - n.w); n.y0 = 1 + j * 6 + ri(R, 0, 5 - n.h);
        n.cx = n.x0 + (n.w >> 1); n.cy = n.y0 + (n.h >> 1);
        for (let y = n.y0; y < n.y0 + n.h; y++) for (let x = n.x0; x < n.x0 + n.w; x++) { g[y][x] = '.'; inRoom.add(y * W + x); }
      } else { n.cx = 3 + i * 6; n.cy = 3 + j * 6; }
      nodes.push(n);
    }
    const at = (i, j) => nodes[j * 4 + i];
    const carve = (x, y) => { if (g[y][x] === '#') g[y][x] = '.'; };
    function join(a, b) {
      if (a.j === b.j) { const bx = 6 * Math.max(a.i, b.i); for (let x = Math.min(a.cx, bx); x <= Math.max(a.cx, bx); x++) carve(x, a.cy); for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) carve(bx, y); for (let x = Math.min(b.cx, bx); x <= Math.max(b.cx, bx); x++) carve(x, b.cy); }
      else { const by = 6 * Math.max(a.j, b.j); for (let y = Math.min(a.cy, by); y <= Math.max(a.cy, by); y++) carve(a.cx, y); for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) carve(x, by); for (let y = Math.min(b.cy, by); y <= Math.max(b.cy, by); y++) carve(b.cx, y); }
    }
    const seen = new Set([0]), stack = [nodes[0]];
    while (stack.length) {
      const n = stack[stack.length - 1], nb = D4.map(([dx, dy]) => [n.i + dx, n.j + dy]).filter(([i, j]) => i >= 0 && j >= 0 && i < 4 && j < 3 && !seen.has(j * 4 + i));
      if (!nb.length) { stack.pop(); continue; }
      const [i, j] = pk(R, nb); seen.add(j * 4 + i); join(n, at(i, j)); stack.push(at(i, j));
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { if (i < 3 && R() < 0.16) join(at(i, j), at(i + 1, j)); if (j < 2 && R() < 0.16) join(at(i, j), at(i, j + 1)); }
    // fill in corridors that lead nowhere
    for (let again = true; again;) { again = false; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && !inRoom.has(y * W + x) && D4.filter(([dx, dy]) => g[y + dy][x + dx] !== '#').length <= 1) { g[y][x] = '#'; again = true; } }
    // doors where a corridor meets a room wall squarely
    const rooms = nodes.filter(n => n.has);
    for (const r of rooms) for (let y = r.y0 - 1; y <= r.y0 + r.h; y++) for (let x = r.x0 - 1; x <= r.x0 + r.w; x++) {
      const onX = x === r.x0 - 1 || x === r.x0 + r.w, onY = y === r.y0 - 1 || y === r.y0 + r.h;
      if (onX === onY || g[y][x] !== '.' || inRoom.has(y * W + x) || x < 1 || y < 1 || x > W - 2 || y > H - 2) continue;
      const tight = onX ? g[y - 1][x] === '#' && g[y + 1][x] === '#' : g[y][x - 1] === '#' && g[y][x + 1] === '#';
      if (tight && R() < 0.6) g[y][x] = 'D';
    }
    // order the rooms by how far they are from the first
    const dist = new Map([[rooms[0].cy * W + rooms[0].cx, 0]]), q = [[rooms[0].cx, rooms[0].cy]];
    while (q.length) { const [x, y] = q.shift(), d = dist.get(y * W + x); for (const [dx, dy] of D4) { const nx = x + dx, ny = y + dy; if (g[ny][nx] !== '#' && !dist.has(ny * W + nx)) { dist.set(ny * W + nx, d + 1); q.push([nx, ny]); } } }
    for (const r of rooms) r.d = dist.has(r.cy * W + r.cx) ? dist.get(r.cy * W + r.cx) : -1;
    if (rooms.length < 7 || rooms.some(r => r.d < 0)) return null;
    rooms.sort((a, b) => a.d - b.d);
    return { g, rooms };
  }
  /* a free corner of a room, and a floor square next to a given square */
  function corner(g, r, taken) {
    for (const [x, y] of [[r.x0, r.y0], [r.x0 + r.w - 1, r.y0 + r.h - 1], [r.x0 + r.w - 1, r.y0], [r.x0, r.y0 + r.h - 1]]) if (g[y][x] === '.' && !taken.has(x + ',' + y)) { taken.add(x + ',' + y); return [x, y]; }
    return null;
  }
  function beside(g, x, y) { for (let d = 0; d < 4; d++) { const nx = x + D4[d][0], ny = y + D4[d][1]; if (g[ny] && g[ny][nx] === '.') return { x: nx, y: ny, dir: d }; } return null; }

  /* ---------------- starting gear above the levels the hand-written adventures cover ---------------- */
  KITS[9] = {
    F: { eq: { weapon: 'longsword2', armor: 'plate1', shield: 'shield2' }, inv: ['potExtra', 'potExtra'] }, P: { eq: { weapon: 'longsword2', armor: 'plate1', shield: 'shield1' }, inv: ['potExtra', 'potExtra'] },
    C: { eq: { weapon: 'mace2', armor: 'plate1', shield: 'shield1' }, inv: ['potExtra', 'potExtra'] }, R: { eq: { weapon: 'longsword2', armor: 'studded2', ranged: 'longbow1' }, inv: ['potExtra'] },
    T: { eq: { weapon: 'shortsword2', armor: 'leather2', ring: 'ringProt' }, inv: ['potExtra'] }, M: { eq: { weapon: 'staff2', armor: 'bracers5', ring: 'ringProt2' }, inv: ['potExtra', 'wandMissile#12'] },
  };
  KITS[13] = {
    F: { eq: { weapon: 'longsword3', armor: 'plate2', shield: 'shield3', cloak: 'cloakProt1' }, inv: ['potExtra', 'potExtra', 'potSpeed'] }, P: { eq: { weapon: 'longsword3', armor: 'plate2', shield: 'shield2', cloak: 'cloakProt1' }, inv: ['potExtra', 'potExtra'] },
    C: { eq: { weapon: 'mace3', armor: 'plate2', shield: 'shield2', cloak: 'cloakProt1' }, inv: ['potExtra', 'potExtra', 'staffCuring#8'] }, R: { eq: { weapon: 'longsword3', armor: 'studded3', ranged: 'longbow2', ring: 'ringProt2' }, inv: ['potExtra', 'potExtra'] },
    T: { eq: { weapon: 'shortsword3', armor: 'leather3', ring: 'ringProt2', cloak: 'cloakProt1' }, inv: ['potExtra', 'potInvis'] }, M: { eq: { weapon: 'staff2', armor: 'bracers4', ring: 'ringProt2', cloak: 'cloakProt2' }, inv: ['potExtra', 'wandFire#10'] },
  };
  KITS[17] = {
    F: { eq: { weapon: 'longsword4', armor: 'plate3', shield: 'shield4', cloak: 'cloakProt2', gloves: 'gauntletsOgre' }, inv: ['potExtra', 'potExtra', 'potSpeed'] },
    P: { eq: { weapon: 'longsword4', armor: 'plate3', shield: 'shield3', cloak: 'cloakProt2' }, inv: ['potExtra', 'potExtra', 'potSpeed'] },
    C: { eq: { weapon: 'mace3', armor: 'plate3', shield: 'shield3', cloak: 'cloakProt2' }, inv: ['potExtra', 'potExtra', 'staffCuring#10'] },
    R: { eq: { weapon: 'longsword4', armor: 'studded3', ranged: 'longbow3', ring: 'ringProt3', cloak: 'cloakProt2' }, inv: ['potExtra', 'potExtra'] },
    T: { eq: { weapon: 'shortsword3', armor: 'leather4', ring: 'ringProt3', cloak: 'cloakProt2' }, inv: ['potExtra', 'potInvis', 'potInvis'] },
    M: { eq: { weapon: 'staff3', armor: 'bracers2', ring: 'ringProt3', cloak: 'cloakProt3' }, inv: ['potExtra', 'potExtra', 'staffPower#12'] },
  };
  /* what the shops of a town stock, by band of levels. A town of band n sells the magic of treasure level n - 1 and
     below, so the deepest finds stay finds; the rarest things (weight under 4 on the treasure tables) are never for sale,
     nor is a rod that would sell six resurrections at a cut price. Arms and armor come from the two newest levels only:
     once +2 blades are on the rack, +1 ones are not worth the space. */
  const silver = ['silverDagger', 'silverMace', 'silverSword', 'silverBow', 'silverSling'];
  const forSale = (cats, lvl, from) => cats.flatMap(c => TREASURE[c]).filter(([id, w, l]) => l <= lvl && l >= (from || 0) && w >= 4 && ITEMS[id] && ITEMS[id].t !== 'k' && id !== 'rodResurrection').map(([id]) => id);
  // devices are sold fully charged; a single-use one (a javelin) is sold as itself
  const charged = id => { const m = /^(\d+)d(\d+)\+?(\d+)?$/.exec(ITEMS[id].charges); return m ? id + '#' + (+m[1] * +m[2] + +(m[3] || 0)) : id; };
  const byCost = ids => [...new Set(ids)].sort((a, b) => item(a).cost - item(b).cost);
  const SPELL_TOP = [1, 3, 5, 7, 9]; // the highest level of spell scroll each band's apothecary keeps; it stocks the four levels below that too
  for (let t = 1; t <= 5; t++) {
    const L = t - 1, top = SPELL_TOP[L];
    SHOPS['adv' + t] = SHOPS.armory.concat(silver, byCost(forSale(['weapon', 'sword', 'armor', 'ring', 'misc'], L, L - 1)));
    const scrolls = Object.keys(SPELLS).filter(id => SPELLS[id].l <= top && SPELLS[id].l > top - 4 && (!SPELLS[id].explore || id === 'knock'))
      .sort((a, b) => SPELLS[b].c.localeCompare(SPELLS[a].c) || SPELLS[a].l - SPELLS[b].l).map(id => 'scroll:' + id);
    SHOPS['advApo' + t] = byCost(['potHeal', 'potExtra', 'antidote'].concat(forSale(['potion', 'scroll'], L).filter(id => id !== '@scroll')))
      .concat(byCost(forSale(['device'], L).map(charged)), scrolls);
  }

  /* ---------------- one adventure ---------------- */
  const usedTowns = new Set(Object.keys(MODULES).map(k => MODULES[k].names.town)), usedTitles = new Set();
  function build(tier, band, idx, themeKey, sizeKey) {
    const id = 'adv' + (tier + 1) + '_' + (idx + 1), code = 'T' + (tier + 1) + '-' + String(idx + 1).padStart(2, '0');
    const R = rng(7919 * (tier + 1) + 104729 * (idx + 1) + themeKey.length * 31);
    const T = THEMES[themeKey], Z = SIZES[sizeKey], lo = band.lo, hi = band.hi, D = Z.levels, tex = pk(R, T.tex);
    const pool = T.mons.filter(m => MONSTERS[m]);
    let town; do { town = pk(R, TOWN_A) + pk(R, TOWN_B); } while (usedTowns.has(town)); usedTowns.add(town);
    const giver = pk(R, RANKS) + ' ' + pk(R, FOLK_A) + ' ' + pk(R, FOLK_B), trainer = pk(R, ['Swordmaster', 'Sergeant', 'Old', 'Master', 'Dame']) + ' ' + pk(R, FOLK_A);
    const place = pk(R, T.places), villain = pk(R, NAME_A) + pk(R, NAME_B), vTitle = pk(R, T.titles), vName = villain + ' ' + vTitle;
    let dungeon = pk(R, ['The ' + place + ' of ' + villain, 'The ' + pk(R, T.adj) + ' ' + place, villain + '\'s ' + place]);
    while (usedTitles.has(dungeon)) dungeon = 'The ' + pk(R, T.adj) + ' ' + place + ' of ' + villain;
    usedTitles.add(dungeon);
    const village = tier === 0 && D === 1, tmpl = MAPS[village ? 'thornwick' : 'cold_town'];
    const townId = id + '_town', lvlIds = Array.from({ length: D }, (_, j) => id + '_l' + (j + 1));
    // how much of the band an adventure spans: a small one suits a company new to the band, a huge one runs from its bottom to its top
    const span = { S: [0, 0.34], M: [0, 0.67], L: [0.25, 1], H: [0, 1] }[sizeKey], la = Math.round(lo + (hi - lo) * span[0]), lb = Math.round(lo + (hi - lo) * span[1]);
    const levelOf = j => (D === 1 ? Math.floor((la + lb) / 2) : clampN(Math.round(la + (lb - la) * j / (D - 1)), la, lb));

    // the villains: one for the bottom of the dungeon, and a lieutenant on each level above it that carries a commission
    const usedBoss = [], bossIds = [];
    const questLevels = D === 1 ? [0] : D === 2 ? [0, 1] : D === 3 ? [0, 1, 2] : [1, 2, 3, 4];
    // the master is chosen first, so that no lieutenant outranks it
    const masterBase = bossFor(T, levelOf(D - 1) * 1.5 + 1.5, []);
    usedBoss.push(masterBase);
    const mkBoss = (j, last) => {
      const L = levelOf(j), base = last ? masterBase : bossFor(T, Math.min(L * 1.3 + 0.5, weight(masterBase) * 0.85), usedBoss), B = MONSTERS[base];
      usedBoss.push(base);
      const name = last ? vName : pk(R, NAME_A) + pk(R, NAME_B) + ' ' + pk(R, ['the Lieutenant', 'the Gate-Keeper', 'the Butcher', 'the Herald', 'the Hound', 'the Left Hand', 'the Watcher']);
      const bid = id + '_b' + j;
      MONSTERS[bid] = Object.assign({}, B, { name, hp: maxHp(B.hp), leader: true, ml: Math.max(B.ml, 16), xp: B.xp * 2, tags: B.tags.slice(), atk: B.atk.slice(), base,
        lore: (last ? 'The master of ' + lc(dungeon) + ': ' : 'A captain in ' + lc(dungeon) + ': ') + lc(B.name).replace(/^(a|an|the) /, '') + ' of unusual size and cunning. ' + (B.lore || '') });
      if (B.spells) MONSTERS[bid].spells = B.spells.slice();
      return bid;
    };

    // dungeon levels
    const maps = {}, quests = [], sides = [], goals = {};
    const nSides = D >= 5 ? 2 : 1, sideLevel = k => (k === 0 ? Math.min(D - 1, D >= 3 ? 1 : 0) : Math.min(D - 1, 3));
    const sidePicks = []; while (sidePicks.length < nSides) { const s = pk(R, SIDE_ITEMS); if (!sidePicks.includes(s)) sidePicks.push(s); }
    const lv = [];
    for (let j = 0; j < D; j++) { let L = null; for (let tries = 0; tries < 40 && !L; tries++) L = level(R); lv.push(L); }
    for (let j = 0; j < D; j++) {
      const { g, rooms } = lv[j], L = levelOf(j), taken = new Set(), ev = {}, letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
      const put = (x, y, e) => { const ch = letters.shift(); if (!ch) return; g[y][x] = ch; taken.add(x + ',' + y); ev[ch] = e; };
      const first = rooms[0], last = rooms[rooms.length - 1], isLast = j === D - 1, qi = questLevels.indexOf(j);
      const up = corner(g, first, taken); g[up[1]][up[0]] = '<';
      put(first.cx, first.cy, { type: 'text', text: j === 0 ? T.entrance.replace(/^[^.]*\. /, '') + ' You stand at the threshold of ' + lc(dungeon) + '.' : 'The stair opens on ' + lvlName(j) + ' of ' + lc(dungeon) + '. ' + pk(R, ['The air is colder here.', 'Old blood stains the stones.', 'Somewhere ahead, something is breathing.', 'The dark seems to lean in.', 'Your lamps burn low and blue.']) });
      // the level's leader waits in the farthest room
      if (qi >= 0) {
        const bid = mkBoss(j, isLast), qid = id + '_q' + qi, B = MONSTERS[bid];
        bossIds.push(bid);
        put(last.cx, last.cy, { type: 'enc', mons: [[bid, 1]].concat(group(R, pool, L, isLast ? 0.55 : 0.4)), quest: qid,
          text: isLast ? B.name + ' rises from a throne of ' + pk(R, ['bone', 'black iron', 'heaped plunder', 'broken shields', 'living shadow']) + '. "' + pk(R, ['So the town sends its heroes at last.', 'You have come a long way to die.', 'I wondered who was killing my servants.', 'Kneel, and it will be quick.', 'More statues for my hall.']) + '"'
            : B.name + ' bars the way down, with ' + pk(R, ['a bodyguard at each shoulder', 'the pick of the garrison', 'servants who will not run']) + '. "' + pk(R, ['None pass.', 'The master is not to be disturbed.', 'Turn back, little ones.', 'Fresh meat!']) + '"' });
        const hoard = Treasure.roll(R, L, isLast ? 'hoard' : 'cache'), hc = corner(g, last, taken);
        if (hc) put(hc[0], hc[1], { type: 'chest', gold: hoard.gold, items: hoard.items, text: isLast ? 'The hoard of ' + villain + ': everything taken from ' + town + ' and a great deal that was here long before.' : 'The war-chest of the level\'s captain, kept close and well guarded.' });
        const B0 = MONSTERS[B.base];
        quests.push(qid);
        QUESTS[qid] = { name: isLast ? pk(R, ['The End of ', 'The Fall of ', 'Death to ']) + villain : pk(R, ['Break the Gate: ', 'First Blood: ', 'The Way Down: ', 'Cut Off the Hand: ']) + B.name.split(' ')[0],
          gold: Math.round(120 * Math.pow(L, 1.5) * (isLast ? 1.6 : 1) / 10) * 10, xp: Math.round((CLASSES.F.xp[Math.min(19, L)] - CLASSES.F.xp[Math.min(19, L) - 1]) * (isLast ? 0.45 : 0.3) / 50) * 50,
          lead: giver + pk(R, [' spreads a rough map across the table.', ' pours two cups and pushes one toward you.', ' speaks quietly, so the servants will not hear.', ' looks older than at your last meeting.']),
          offer: isLast ? 'At the bottom of it all sits ' + vName + ', ' + lc(B0.name).replace(/^(a|an|the) /, 'a ') + ' and the cause of every grief we have. While that creature lives, ' + town + ' has no future. End it.'
            : 'They are led on ' + lvlName(j) + ' by one called ' + B.name + '. Kill that one and the rest lose their nerve, and the way deeper lies open.',
          done: isLast ? 'It is done, then. I did not truly believe it could be. ' + town + ' is in your debt for as long as there is a ' + town + '.' : B.name + ' dead! That is the first good news in a season. Take this, and rest. There is worse below.' };
        goals[qid] = 'Kill ' + B.name + ' on ' + (D === 1 ? 'the far side of ' + lc(dungeon) : lvlName(j) + ' of ' + lc(dungeon)) + '.';
      }
      if (!isLast) { const dn = corner(g, last, taken); g[dn[1]][dn[0]] = '>'; }
      // set battles and treasure in the rooms between
      const mid = rooms.slice(1, qi >= 0 ? -1 : rooms.length);
      let encs = 0, chests = 0;
      mid.forEach((r, k) => {
        const depth = L + (k > mid.length / 2 && L < hi ? 0.5 : 0), wantEnc = R() < 0.78 || encs < Math.min(4, k), wantChest = R() < 0.42 || (k >= mid.length - 2 && chests < 2);
        if (wantEnc) {
          const mons = group(R, pool, depth, 0.85 + R() * 0.4), who = mons.map(([m]) => 'the ' + lc(MONSTERS[m].name)).join(' and ');
          put(r.cx, r.cy, { type: 'enc', mons, text: pk(R, ['Among ' + pk(R, CLUTTER) + ' lairs ' + who + '.', 'You are not alone. Out of the dark: ' + who + '!', 'A guard post, and it is manned: ' + who + '.', 'The stink should have warned you. This is the den of ' + who + '.', 'Something moves at the edge of the light. It is ' + who + '.']) });
          encs++;
        }
        if (wantChest) {
          const c = corner(g, r, taken); if (!c) return;
          const loot = Treasure.roll(R, L, wantEnc && R() < 0.5 ? 'cache' : 'chest'), e = { type: 'chest', gold: loot.gold, items: loot.items, text: pk(R, CHESTS) };
          if (R() < 0.25) e.trap = { dmg: Math.max(1, Math.round(L / 2)) + 'd6', text: pk(R, ['A scything blade swings out of the lid!', 'A needle jabs from the lock, and it burns!', 'Flame gouts from the keyhole!', 'A cloud of choking dust bursts from the hinges!']) };
          put(c[0], c[1], e); chests++;
        }
      });
      // something the town wants brought back
      for (let k = 0; k < nSides; k++) if (sideLevel(k) === j) {
        const r = mid[Math.min(mid.length - 1, Math.floor(mid.length * (0.4 + 0.3 * k)))], c = corner(g, r, taken), s = sidePicks[k], qid = id + '_s' + k, iid = id + '_i' + k;
        if (!c) continue;
        ITEMS[iid] = { name: s[1].replace('%T', town), t: 'q', cost: 0 };
        const loot = Treasure.roll(R, L, 'chest');
        put(c[0], c[1], { type: 'chest', gold: loot.gold, items: [iid].concat(loot.items), quest: qid, text: 'Tucked out of sight, as if someone meant to come back for it: ' + s[0] + ', and a little more besides.' });
        sides.push(qid);
        QUESTS[qid] = { name: s[1].replace('%T', town).replace(/^(Stolen|Founding) /, ''), side: true, needItem: iid, gold: Math.round(40 * Math.pow(L, 1.4) / 10) * 10, xp: Math.round((CLASSES.F.xp[Math.min(19, L)] - CLASSES.F.xp[Math.min(19, L) - 1]) * 0.1 / 50) * 50,
          lead: giver + ' hesitates, then goes on.', offer: s[2].replace(/%T/g, town) + ' If you come across it down there, bring it back.', done: 'You found it! I had given it up for lost. This is little enough thanks, but take it.' };
        goals[qid] = 'Find ' + s[0] + ' somewhere on ' + (D === 1 ? 'the way through ' : lvlName(j) + ' of ') + lc(dungeon) + ' and bring it back.';
      }
      const wand = pool.filter(m => weight(m) <= Math.max(1.2, L * 0.6)).slice(-4);
      maps[lvlIds[j]] = { name: D === 1 ? dungeon : dungeon + ': ' + LEVEL_NAMES[j], wall: tex[0], floor: tex[1], ceil: tex[2], arena: tex[3],
        wander: { chance: 0.03, table: (wand.length ? wand : pool.slice(0, 2)).map(m => [m, clampN(Math.round(budget(L) * 0.5 / weight(m)), 1, 6) > 1 ? '1d' + clampN(Math.round(budget(L) * 0.5 / weight(m)), 2, 6) : 1]) },
        ev, _g: g, stairs: {} };
    }
    // stairs between the levels and the town
    const find = (g, ch) => { for (let y = 0; y < g.length; y++) { const x = g[y].indexOf(ch); if (x >= 0) return [x, y]; } return null; };
    const townStair = village ? { x: 9, y: 3, dir: 2 } : { x: 11, y: 2, dir: 2 };
    for (let j = 0; j < D; j++) {
      const m = maps[lvlIds[j]], g = m._g;
      if (j === 0) m.stairs['<'] = Object.assign({ map: townId }, townStair);
      else { const [x, y] = find(maps[lvlIds[j - 1]]._g, '>'); m.stairs['<'] = Object.assign({ map: lvlIds[j - 1] }, beside(maps[lvlIds[j - 1]]._g, x, y)); }
      if (j < D - 1) { const [x, y] = find(maps[lvlIds[j + 1]]._g, '<'); m.stairs['>'] = Object.assign({ map: lvlIds[j + 1] }, beside(maps[lvlIds[j + 1]]._g, x, y)); }
    }
    const [ux, uy] = find(maps[lvlIds[0]]._g, '<');
    for (const k in maps) { maps[k].grid = maps[k]._g.map(r => r.join('')); delete maps[k]._g; MAPS[k] = maps[k]; }
    MAPS[townId] = { name: town, outdoor: true, facades: true, wall: tmpl.wall, floor: tmpl.floor, safe: true, grid: tmpl.grid.slice(), start: Object.assign({}, tmpl.start), locs: Object.assign({}, tmpl.locs),
      stairs: { '>': Object.assign({ map: lvlIds[0] }, beside(MAPS[lvlIds[0]].grid.map(r => r.split('')), ux, uy)) }, ev: { a: { type: 'text', text: T.entrance } } };
    for (const q in goals) QUESTS[q].goal = goals[q];

    // what the tavern knows
    const seenMons = [...new Set(lvlIds.flatMap(k => Object.values(MAPS[k].ev).filter(e => e.type === 'enc').flatMap(e => e.mons.map(([m]) => MONSTERS[m].base || m))))];
    const tips = [];
    for (const m of seenMons) {
      const M = MONSTERS[m], n = lc(M.name);
      if (M.hitBy) tips.push('"Ordinary steel will not bite ' + (/^the /.test(n) ? n : 'the ' + n) + '. Bring ' + (M.hitBy === 'silver' ? 'silver or an enchanted blade' : 'enchanted weapons') + '."');
      if (M.regen) tips.push('"The ' + n + ' heals as fast as you cut it. Do not let up, and finish it quickly."');
      if (M.gaze) tips.push('"Whatever you do, do not look the ' + n + ' in the eye."');
      if (M.breath) tips.push('"Spread out when you face the ' + n + '. Its breath catches everyone standing together."');
      if (M.drain) tips.push('"The touch of the ' + n + ' takes more than blood. Men come back from it less than they were."');
      if (M.poison) tips.push('"Carry antivenom. The ' + n + ' is venomous."');
      if (M.paralyze) tips.push('"One touch from the ' + n + ' and you cannot move a finger."');
      if (M.mr) tips.push('"Spells slide off the ' + n + ' like rain off slate. Trust your swords."');
      if (M.petrify) tips.push('"The ' + n + '\'s touch turns flesh to stone."');
    }
    const rumors = [...new Set(tips)].slice(0, 6).concat([
      '"They call the place ' + lc(dungeon) + '. Nobody who went down for the reward has collected it."',
      '"' + villain + '? Do not say that name so loud. ' + pk(R, ['The walls repeat things here.', 'My brother said it, and look what became of him.', 'It hears.', 'Drink your ale and talk of the weather.']) + '"',
      '"' + giver.split(' ').slice(0, 2).join(' ') + ' pays honestly, I will say that. Ask at the hall."']);
    const needs = seenMons.some(m => MONSTERS[m].hitBy === 'magic') ? ' Some of what waits there can only be harmed by enchanted weapons.' : seenMons.some(m => MONSTERS[m].hitBy) ? ' Some of what waits there can only be harmed by silver or enchanted weapons.' : '';
    const three = seenMons.slice().sort((a, b) => weight(b) - weight(a)).slice(0, 3).map(m => lc(MONSTERS[m].name)).join(', ');
    const names = { town, inn: pk(R, INNS), temple: pk(R, ['Temple of the Dawn', 'Shrine of the Wayfarer', 'Chapel of the Seven Lamps', 'The Old Abbey']), hall: pk(R, ['The Moot Hall', town + ' Guildhall', 'The Warden\'s House', 'The High Hall']),
      training: pk(R, ['The Drill Yard', 'The Proving Ground', 'The Old Barracks']), giver, trainer };
    if (village) names.store = pk(R, FOLK_B) + '\'s General Goods';
    else Object.assign(names, { armory: pk(R, FOLK_B) + '\'s Forge', tavern: pk(R, TAVERNS), apothecary: pk(R, ['The Mortar and Pestle', 'The Green Bottle', 'Mother ' + pk(R, FOLK_A) + '\'s Remedies']) });
    const title = pk(R, [dungeon, dungeon, 'The ' + pk(R, ['Shadow', 'Curse', 'Siege', 'Doom', 'Terror', 'Bane']) + ' of ' + town, villain + ' ' + vTitle]);
    MODULES[id] = {
      code, name: title, lvl: lo, levels: [la, lb], diff: pk(R, Z.diff), size: Z.name, length: Z.length, generated: true, tier,
      hub: townId, maps: [townId].concat(lvlIds), gold: Math.round(40 * Math.pow(lo, 1.5) / 10) * 10, next: null, shops: village ? {} : { armory: 'adv' + (tier + 1), apothecary: 'advApo' + (tier + 1) },
      quests, side: sides, final: quests[quests.length - 1], rumors, names,
      blurb: 'In ' + town + ', ' + T.trouble + '. The trail leads to ' + lc(dungeon) + (D > 1 ? ', ' + D + ' levels deep' : '') + ', where ' + vName + ' holds court. Expect ' + three + '.' + needs,
      intro: town + ' was a quiet place until this year. Now ' + T.trouble + '.\n' + T.entrance + '\n' + giver + ' has sent for anyone with a sword and the nerve to use it. The name the frightened use is ' + vName + '.',
      hint: 'Call at ' + lc(names.hall).replace(/^the /, 'the ') + ' for work' + (village ? ' and the general store for supplies' : ', the forge for arms and the apothecary for potions') + '. The way into ' + lc(dungeon) + ' is at the north end of ' + town + '.',
      victory: town + ' rings its bells until the ropes fray. ' + villain + ' is gone, ' + lc(dungeon) + ' is silent, and your company\'s names are cut into the lintel of the hall.',
      lose: 'Your company does not come back from ' + lc(dungeon) + '. In ' + town + ' they stop lighting the gate-lamps, and wait.',
    };
    return id;
  }

  /* ---------------- build them all ---------------- */
  const tiers = PLAN.map((band, t) => {
    const order = band.list.map(([theme, size], i) => build(t, band, i, theme, size));
    order.forEach((id, i) => { MODULES[id].next = order[i + 1] || null; });
    return { name: 'Levels ' + band.lo + '–' + band.hi, sub: 'Ten adventures for companies of levels ' + band.lo + ' to ' + band.hi + ': four small, three medium, two large and one huge. Play them in any order.', order };
  });
  tiers.forEach((t, i) => { if (tiers[i + 1]) MODULES[t.order[t.order.length - 1]].next = tiers[i + 1].order[0]; });
  return tiers;
})();
/* every set of adventures the chooser offers: the hand-written saga, then the five bands */
const CAMPAIGNS = [{ name: CAMPAIGN.name, sub: CAMPAIGN.name + ': four hand-written adventures that may be played alone or in order with the same company.', order: CAMPAIGN.order }].concat(ADVENTURES);
function campaignOf(mid) { return CAMPAIGNS.find(c => c.order.includes(mid)) || CAMPAIGNS[0]; }
