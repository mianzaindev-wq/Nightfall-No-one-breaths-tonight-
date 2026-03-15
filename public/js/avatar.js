// ═══════════════════════════════════════════════════════════════
// NIGHTFALL — Avatar / Character Generator
// Procedural character descriptions with public + hidden traits
// ═══════════════════════════════════════════════════════════════

// ── PERSONA NAMES (30+, shuffled per game, no duplicates) ────
const PERSONA_NAMES = [
  { name: 'The Rose',        icon: '🌹' },
  { name: 'The Raven',       icon: '🐦‍⬛' },
  { name: 'The Clockmaker',  icon: '⏱' },
  { name: 'The Alchemist',   icon: '⚗' },
  { name: 'The Lantern',     icon: '🏮' },
  { name: 'The Phantom',     icon: '👻' },
  { name: 'The Serpent',     icon: '🐍' },
  { name: 'The Moth',        icon: '🦋' },
  { name: 'The Bell',        icon: '🔔' },
  { name: 'The Thorn',       icon: '🌿' },
  { name: 'The Mirror',      icon: '🪞' },
  { name: 'The Ink',         icon: '🖋' },
  { name: 'The Ember',       icon: '🔥' },
  { name: 'The Mask',        icon: '🎭' },
  { name: 'The Key',         icon: '🗝' },
  { name: 'The Owl',         icon: '🦉' },
  { name: 'The Pearl',       icon: '🦪' },
  { name: 'The Crow',        icon: '🪶' },
  { name: 'The Frost',       icon: '❄' },
  { name: 'The Shadow',      icon: '🌑' },
  { name: 'The Willow',      icon: '🌳' },
  { name: 'The Spider',      icon: '🕷' },
  { name: 'The Compass',     icon: '🧭' },
  { name: 'The Storm',       icon: '⛈' },
  { name: 'The Viper',       icon: '🐉' },
  { name: 'The Chalice',     icon: '🏆' },
  { name: 'The Dagger',      icon: '🗡' },
  { name: 'The Candle',      icon: '🕯' },
  { name: 'The Scarecrow',   icon: '🧟' },
  { name: 'The Whisper',     icon: '💨' },
  { name: 'The Bone',        icon: '🦴' },
  { name: 'The Eclipse',     icon: '🌘' },
];

// ── PUBLIC TRAIT POOLS (everyone can see) ─────────────────────
const HAIR_STYLE = [
  'Curly and wild', 'Sleek and straight', 'Tightly braided', 'Slicked back',
  'Shaved close', 'Long and wavy', 'Messy bun', 'Dreadlocks',
  'Cropped short', 'Neatly parted', 'Windswept', 'Loose ponytail',
  'Tangled and unkempt', 'Pinned with clips', 'Hidden under a hood',
  'Flowing past shoulders', 'Twisted updo', 'Buzzed on one side',
  'Thick and coiled', 'Pixie-cut', 'Feathered layers',
];

const HAIR_COLOR = [
  'Jet black', 'Silver-grey', 'Auburn', 'Platinum blonde', 'Dark brown',
  'Copper red', 'Ash blonde', 'Midnight blue-black', 'Strawberry blonde',
  'Deep chestnut', 'Snow white', 'Honey gold', 'Raven black',
  'Dusty pink', 'Salt-and-pepper', 'Russet', 'Ink-dark',
  'Fiery orange', 'Mousy brown', 'Charcoal-streaked',
];

const OUTFIT = [
  'Long dark overcoat', 'Red silk dress', 'Torn leather jacket', 'White linen suit',
  'Hooded velvet cloak', 'Grey wool sweater', 'Black turtleneck', 'Embroidered waistcoat',
  'Flowing kimono-style robe', 'Patched denim jacket', 'Tailored blazer',
  'Stained apron over shirt', 'Fur-trimmed cape', 'Striped sailor shirt',
  'Military-style peacoat', 'Silk pajamas', 'Oversized trench coat',
  'Corset and blouse', 'Old tweed suit', 'Leather duster',
  'Layered shawls', 'Pinstripe vest',
];

const OUTFIT_COLOR = [
  'Midnight blue', 'Crimson', 'Charcoal grey', 'Forest green', 'Ivory',
  'Deep purple', 'Burnt sienna', 'Slate black', 'Burgundy', 'Olive drab',
  'Rose pink', 'Dusty lavender', 'Oxblood', 'Teal', 'Sand beige',
  'Copper', 'Indigo', 'Moss green', 'Amber', 'Pearl white',
];

const SHOES = [
  'Tall black boots', 'Red heels', 'Worn leather sandals', 'Polished oxford shoes',
  'Barefoot', 'Silver-buckled ankle boots', 'Mud-caked work boots', 'Velvet slippers',
  'Platform shoes', 'Laced-up riding boots', 'Pointed stilettos', 'Canvas sneakers',
  'Wooden clogs', 'Fur-lined moccasins', 'Steel-toed boots', 'Embroidered flats',
  'Knee-high suede boots', 'Woven espadrilles', 'Patent leather loafers',
  'Gladiator sandals', 'Cracked old boots',
];

const ACCESSORY = [
  'Gold pocket watch', 'Silver locket necklace', 'Feathered wide-brim hat', 'Round spectacles',
  'Embroidered silk scarf', 'Leather gloves', 'Beaded bracelet', 'Ornate cane',
  'Jeweled ring', 'Pearl earrings', 'Copper brooch', 'Worn satchel',
  'Tattered parasol', 'Bone-handled fan', 'Chain necklace with pendant', 'Monocle',
  'Fingerless gloves', 'Ruby-studded hairpin', 'Brass compass on chain',
  'Ivory cameo pin', 'Velvet choker', 'Wrist bandages',
];

// ── HIDDEN TRAIT POOLS (detective-only) ──────────────────────
const PERFUME = [
  'Sandalwood', 'Lavender', 'Tobacco smoke', 'Fresh rain on soil',
  'Burnt sugar', 'Cedarwood', 'Old leather', 'Jasmine',
  'Wet iron', 'Cloves and cinnamon', 'Sea salt', 'Bitter almonds',
  'Pine resin', 'Dried roses', 'Machine oil', 'Patchouli',
  'Faint decay', 'Honey and beeswax', 'Gunpowder', 'Smoked vanilla',
];

const MARK = [
  'Scar across left cheek', 'Ink-stained fingertips', 'Calloused rough hands',
  'Missing ring finger', 'Burn mark on wrist', 'Chipped front tooth',
  'Faded tattoo on neck', 'Crooked nose (broken before)', 'Pale, almost translucent skin',
  'Freckles across the nose', 'Deep-set dark circles', 'Bitten-down nails',
  'Split lip, recently healed', 'Nicotine-stained fingers', 'Small mole above lip',
  'Scratch marks on forearm', 'Disfigured ear', 'Dimpled chin',
  'Unusually long fingers', 'Weathered, sun-damaged skin',
];

const WALK_STYLE = [
  'Light-footed, almost silent', 'Heavy deliberate stomps', 'Slight limp on right side',
  'Glides like a shadow', 'Brisk nervous shuffle', 'Confident long strides',
  'Slow, measured pace', 'Hurried and hunched', 'Graceful and poised',
  'Uneven gait', 'Swaying side to side', 'Tiptoes frequently',
  'Drags one foot slightly', 'Military-precise march', 'Lazy slouching walk',
  'Quick darting movements', 'Bouncy energetic step', 'Cautious heel-to-toe',
];

const VOICE = [
  'Deep gravelly tone', 'Whispered rasp', 'Sharp and clipped', 'Warm honey voice',
  'High-pitched and breathy', 'Monotone and flat', 'Commanding baritone',
  'Soft-spoken mumble', 'Accented and musical', 'Croaky and dry',
  'Booming and loud', 'Silky smooth', 'Stuttering and hesitant',
  'Nasal and whiny', 'Melodic singsongy', 'Cold and precise',
  'Hoarse from screaming', 'Barely above a whisper',
];

const HABIT = [
  'Fidgets with a ring', 'Cracks knuckles', 'Taps fingers on surfaces',
  'Hums under breath', 'Bites lower lip', 'Adjusts collar constantly',
  'Picks at nails', 'Twirls hair', 'Clenches jaw when nervous',
  'Rubs hands together', 'Avoids eye contact', 'Stares unblinkingly',
  'Touches scar absently', 'Paces in circles', 'Crosses arms defensively',
  'Drums fingers rhythmically', 'Sniffs the air', 'Whistles tunelessly',
  'Counts things silently', 'Folds and unfolds hands',
];

const SECRET_ITEM = [
  'Bloodied handkerchief', 'Vial of unknown liquid', 'Torn love letter',
  'Rusted skeleton key', 'Lock of someone\'s hair', 'Cracked compass',
  'Faded photograph', 'Sharpened bone fragment', 'Coil of thin wire',
  'Stained playing card', 'Stolen jewel', 'Coded note on parchment',
  'Small knife wrapped in cloth', 'Bottle of sleeping powder', 'Broken pocket mirror',
  'Bundle of dried herbs', 'Wax-sealed envelope', 'Handful of teeth',
  'Glass eye', 'Single black glove',
];

// ── ALL POOLS ────────────────────────────────────────────────
const PUBLIC_POOLS = {
  hairStyle:    { label: '💇 Hair',      pool: HAIR_STYLE },
  hairColor:    { label: '🎨 Hair Color', pool: HAIR_COLOR },
  outfit:       { label: '👔 Outfit',     pool: OUTFIT },
  outfitColor:  { label: '🎨 Color',      pool: OUTFIT_COLOR },
  shoes:        { label: '👟 Shoes',      pool: SHOES },
  accessory:    { label: '💍 Accessory',  pool: ACCESSORY },
};

const HIDDEN_POOLS = {
  perfume:      { label: '🌸 Scent',     pool: PERFUME },
  mark:         { label: '🔖 Mark',      pool: MARK },
  walkStyle:    { label: '🚶 Walk',      pool: WALK_STYLE },
  voice:        { label: '🗣 Voice',     pool: VOICE },
  habit:        { label: '🤏 Habit',     pool: HABIT },
  secretItem:   { label: '🔒 Secret',    pool: SECRET_ITEM },
};

// ── Utility: pick random unique from pool ────────────────────
function pickUnique(pool, usedSet) {
  const avail = pool.filter(v => !usedSet.has(v));
  if (!avail.length) return pool[Math.floor(Math.random() * pool.length)];
  const picked = avail[Math.floor(Math.random() * avail.length)];
  usedSet.add(picked);
  return picked;
}

// ── Generate a single character ──────────────────────────────
function generateCharacter(usedTraits) {
  const pub = {};
  for (const [key, { pool }] of Object.entries(PUBLIC_POOLS)) {
    pub[key] = pickUnique(pool, usedTraits);
  }
  const hidden = {};
  for (const [key, { pool }] of Object.entries(HIDDEN_POOLS)) {
    hidden[key] = pickUnique(pool, usedTraits);
  }
  return { pub, hidden };
}

// ── Assign characters to all players ─────────────────────────
/**
 * @param {string[]} playerIds
 * @returns {{ personas: Map<string, {name, icon}>, characters: Map<string, {pub, hidden}> }}
 */
export function assignCharacters(playerIds) {
  // Shuffle persona names
  const shuffled = [...PERSONA_NAMES].sort(() => Math.random() - 0.5);
  const personas = new Map();
  const characters = new Map();
  const usedTraits = new Set();

  playerIds.forEach((id, i) => {
    personas.set(id, shuffled[i % shuffled.length]);
    characters.set(id, generateCharacter(usedTraits));
  });

  return { personas, characters };
}

// ── Get formatted public description ─────────────────────────
export function getPublicDesc(character) {
  const p = character.pub;
  return [
    { label: PUBLIC_POOLS.hairStyle.label,   value: p.hairStyle },
    { label: PUBLIC_POOLS.hairColor.label,    value: p.hairColor },
    { label: PUBLIC_POOLS.outfit.label,       value: p.outfit },
    { label: PUBLIC_POOLS.outfitColor.label,  value: p.outfitColor },
    { label: PUBLIC_POOLS.shoes.label,        value: p.shoes },
    { label: PUBLIC_POOLS.accessory.label,    value: p.accessory },
  ];
}

// ── Get formatted hidden description ─────────────────────────
export function getHiddenDesc(character) {
  const h = character.hidden;
  return [
    { label: HIDDEN_POOLS.perfume.label,    value: h.perfume },
    { label: HIDDEN_POOLS.mark.label,       value: h.mark },
    { label: HIDDEN_POOLS.walkStyle.label,  value: h.walkStyle },
    { label: HIDDEN_POOLS.voice.label,      value: h.voice },
    { label: HIDDEN_POOLS.habit.label,      value: h.habit },
    { label: HIDDEN_POOLS.secretItem.label, value: h.secretItem },
  ];
}

// ── Get a random public trait for clues ───────────────────────
export function getPublicTraitClue(character) {
  const p = character.pub;
  const traits = [
    `someone wearing ${p.outfit.toLowerCase()}`,
    `someone with ${p.hairStyle.toLowerCase()} ${p.hairColor.toLowerCase()} hair`,
    `someone in ${p.shoes.toLowerCase()}`,
    `someone wearing a ${p.accessory.toLowerCase()}`,
    `someone dressed in ${p.outfitColor.toLowerCase()}`,
  ];
  return traits[Math.floor(Math.random() * traits.length)];
}

// ── Get a random hidden trait for strong clues ────────────────
export function getHiddenTraitClue(character) {
  const h = character.hidden;
  const traits = [
    `the scent of ${h.perfume.toLowerCase()} lingered at the scene`,
    `footprints suggest ${h.walkStyle.toLowerCase().replace(/,.*/, '')}`,
    `a witness heard a ${h.voice.toLowerCase()} nearby`,
    `the attacker was ${h.habit.toLowerCase()}`,
    `found near the body: ${h.secretItem.toLowerCase()}`,
    `the attacker had ${h.mark.toLowerCase()}`,
  ];
  return traits[Math.floor(Math.random() * traits.length)];
}

// ── Serialize for network (only public + persona to non-detectives) ──
export function serializeForPlayer(personas, characters, playerId, isDetective) {
  // Everyone gets all public descriptions + persona names
  const data = {};
  personas.forEach((persona, id) => {
    data[id] = {
      persona,
      pub: characters.get(id).pub,
    };
    // Detectives get their OWN hidden traits
    if (id === playerId) {
      data[id].hidden = characters.get(id).hidden;
    }
  });
  return data;
}

export { PERSONA_NAMES, PUBLIC_POOLS, HIDDEN_POOLS };
