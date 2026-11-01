import type { RNG } from "./rng";
import type { SpeciesId } from "./types";

const GOBLIN = [
  "Grub", "Gobbo", "Pickles", "Snagg", "Nib", "Crumb", "Fidget", "Wartle", "Skrib", "Gizzard",
  "Pock", "Rummage", "Twitch", "Snuffle", "Grimble", "Nackle", "Boggle", "Sprocket", "Gnash", "Tizzy",
  "Muddle", "Fleck", "Scrump", "Wiggins", "Blodge", "Nobbler", "Squib", "Pinch", "Dribble", "Zook",
];
const TROLLKIN = [
  "Wobble", "Bruk", "Mossback", "Thud", "Lumpkin", "Grondle", "Hobb", "Oakfist", "Boulder", "Tumble",
  "Grumm", "Stonk", "Durg", "Knuckle", "Hefty", "Barnaby", "Clod", "Rumble", "Toff", "Mungo",
  "Brickle", "Snorri", "Bulge", "Gorm", "Plonk", "Stumpy", "Wallop", "Bodge", "Clunk", "Trundle",
];
const MUSHROOM = [
  "Sir Mush", "Lord Fungus", "Puffle", "Spora", "Morel", "Truffle", "Capsley", "Lady Gill", "Shii", "Button",
  "Portobella", "Chanterelle", "Toadstool", "Fizzlecap", "Dewdrop", "Myco", "Umber", "Fairy Ring", "Puffball", "Ink Cap",
  "Mildew", "Velvet", "Saffron", "Bolete", "Lichen", "Dapple", "Mossie", "Pip", "Glimmer", "Spindle",
];
const SUFFIXES = ["the Lesser", "Junior", "II", "the Bold", "the Damp", "III", "the Unwise", "of the Lake", "the Loud", "Again"];

const BOAR = ["Tusker", "Bristle", "Hamlet", "Snorter", "Mudbelly", "Chomp", "Rooter", "Grunt", "Truffle-hog", "Porkchop", "Stampy", "Bacon"];
export function generateName(rng: RNG, species: SpeciesId, taken: Set<string>): string {
  const pool = species === "goblin" ? GOBLIN : species === "trollkin" ? TROLLKIN : species === "boar" ? BOAR : MUSHROOM;
  for (let i = 0; i < 12; i++) {
    const n = rng.pick(pool);
    if (!taken.has(n)) return n;
  }
  for (let i = 0; i < 20; i++) {
    const n = `${rng.pick(pool)} ${rng.pick(SUFFIXES)}`;
    if (!taken.has(n)) return n;
  }
  return `${rng.pick(pool)} #${rng.int(2, 99)}`;
}

const ISLAND_A = ["Mossy", "Hollow", "Drift", "Ember", "Thistle", "Cloud", "Fern", "Wisp", "Glimmer", "Bramble", "Dusk", "Sky"];
const ISLAND_B = ["Reach", "Holm", "Perch", "Crag", "Hold", "Rest", "Spire", "Knoll", "Haven", "Shelf", "Fall", "Isle"];

export function generateIslandName(rng: RNG): string {
  return `${rng.pick(ISLAND_A)} ${rng.pick(ISLAND_B)}`;
}

const DISCOVERY_NAMES: Record<string, string[]> = {
  cave: ["the Whispering Cave", "a Damp Hollow", "the Echo Grotto", "a Forgotten Burrow"],
  glowplant: ["a Glowing Bloom", "the Lantern Fern", "a Moonpetal", "a Pulsing Lily"],
  ruins: ["Overgrown Ruins", "a Toppled Statue", "the Old Watchtower", "a Sunken Archway"],
  shrine: ["a Tiny Shrine", "the Pebble Altar", "an Offering Stone", "a Hidden Totem"],
  crystalVein: ["a Crystal Vein", "the Humming Shard", "a Singing Geode", "a Prism Cluster"],
};

export function discoveryName(rng: RNG, kind: string): string {
  return rng.pick(DISCOVERY_NAMES[kind] ?? ["something odd"]);
}
