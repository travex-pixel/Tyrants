# Little Tyrants

**Small worlds. Big egos.**

A multiplayer browser sandbox god-game. You are an ancient, mischievous Overlord holding a living miniature civilisation in your hands: goblins, trollkins and mushroom folk gather, build, gossip, steal, fight and faint on a floating island, while three AI Overlords (The Hoarder, The Wildkeeper and The Architect) grow their own settlements on neighbouring isles. Pick creatures up, throw them in the lake, bless them, smite them, reshape the land, and invite your friends to ruin it with you.

Built with Next.js 16 (App Router), React Three Fiber, a standalone TypeScript simulation engine, Zustand, IndexedDB saves and Supabase Realtime for multiplayer. Deploys to Vercel.

---

## Play it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

That's it. **Solo World, Creative Sandbox and Challenges need no configuration at all.** Only "Play with Friends" needs the two Supabase values described below.

Other scripts:

| command | what it does |
| --- | --- |
| `npm run build` / `npm start` | production build and server |
| `npm test` | simulation + multiplayer unit tests (Vitest, headless, no browser) |
| `npm run typecheck` | strict TypeScript check |
| `npm run smoke` | Playwright browser playthrough (needs `npm start` running on :3000) |

---

## What's in the game

**Modes**

- **Solo World** – you versus three AI Overlords on neighbouring islands. Easy / Normal / Hard changes how they think (planning speed, parallel construction, raid aggression), never their resources.
- **Play with Friends** – 2–4 players in one world via a room code or invite link. *Shared Sandbox* (one civilisation together) or *Rival Overlords* (each player gets their own settlement on the same island). AI Overlords optional.
- **Creative Sandbox** – every power unlocked, instant building, no rivals, huge stockpile.
- **Challenges** – 100 Goblins, No Trees, The Giant, Peaceful Kingdom, The Great Disaster, The Last Campfire, Rivalry.

**Creatures** share one simulation with species modifiers: Goblins (fast, greedy, steal), Trollkins (strong, loyal, build fast, eat lots), Mushroom Folk (farmers, curious). Each has a name, 2–3 personality traits that change real decisions, needs (hunger, energy, social, happiness, health), skills that level with use (woodcutting, construction, farming, exploration, gathering), relationships, and an event memory with decay. They grab their own food, nap at night, chat, prank, steal, hold grudges, celebrate completed buildings and discover hidden places.

**Economy**: wood, stone and food physically exist as trees, rocks, berry bushes and crops. Creatures walk (grid A* with path caching), chop, carry to a campfire/storage, haul loose items, deliver reserved materials to construction sites and build. Buildings: Campfire, Storage Hut, Lumber Camp, Farm, Small House, Workshop, Totem.

**Powers**: Grab/Throw (flick to launch; lakes splash; the edge of the world returns them on a cloud), Spawn, Lightning (scares, hurts, burns trees into loose wood), Bless, Terraform (hold to raise, right-click/Lower to dig), plus unlockable Giant, Clone and Storm bought with Essence from discoveries and achievements.

**AI Overlords** use the same creature/task/economy systems (no free resources, no instant buildings) with a strategic layer: personality build orders, need-driven job priorities, real food-surplus population growth, trade offers, raids (the Hoarder lands a goblin raider on your coast – dunk it to foil the raid), and a memory of what you've done to them that shifts relations.

**Progression**: Chronicle (world history, only real events), 18 achievements, Essence, power unlocks, bounded offline progression with a returning-player briefing, local saves (IndexedDB) with autosave.

---

## Controls

| | Desktop | Touch |
| --- | --- | --- |
| Pan | drag / WASD / arrows | one-finger drag |
| Zoom | wheel / `-` `+` | pinch |
| Rotate | right-drag / `Q` `E` | two-finger twist |
| Select / use power | click | tap |
| Grab & throw | drag a creature, flick to release | same |
| Send selected creature | right-click ground | "Send" then tap |
| Powers | `1`–`8` | power bar |
| Build / Chronicle / Follow / Home / Pause | `B` `C` `F` `H` `Space` | icons |

---

## Multiplayer setup (Supabase, ~5 minutes)

Multiplayer uses Supabase Realtime (broadcast + presence) and one Postgres table for room snapshots. No accounts: players are guests with a chosen name.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/migrations/0001_rooms.sql`](supabase/migrations/0001_rooms.sql).
3. Copy **Project URL** and **anon public key** from *Project Settings → API*.
4. Put them in `.env.local` (locally) or in Vercel's environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app   # optional, for invite links
```

5. Restart / redeploy. "Play with Friends" switches on automatically when both values are present. Without them the button explains what's missing and everything else still works.

See `.env.example` for the full list. Never commit `.env.local`.

### How multiplayer works (and its honest limits)

- **Host-authoritative.** The player who creates the room runs the simulation in their browser. Other players send commands (spawn, grab, throw, place, …); the host validates and applies them, broadcasts a compact delta 5×/s and a full compressed snapshot every 8 s. Clients interpolate.
- **Reconnection.** A client that drops gets a fresh snapshot on return. The host writes the world to Postgres every 30 s and on leaving, so a room can be rejoined later by code even when nobody is online (the first to arrive becomes host from the stored snapshot).
- **Host migration.** If the host disconnects, the longest-connected remaining player automatically takes over from their latest copy of the world. You may lose up to a few seconds of simulation.
- **Trust model.** This is a casual sandbox for friends: the host's browser is trusted, and anyone with a 6-character room code can read/update that room (RLS allows it; see the migration). There is no anti-cheat and no private rooms beyond the secrecy of the code. The networking layer is behind a `Transport` interface (`src/net/transport.ts`) so a dedicated authoritative server can replace the host-in-browser model later.
- **Scale.** Tested for 2–4 players and up to ~160 creatures. Supabase's free tier limits Realtime messages/sec; deltas are tiny, snapshots are gzip+base64 chunks.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel: *Add New Project → Import*, framework preset **Next.js** (auto-detected). No custom build settings needed (`next build`).
3. Add the environment variables above (only needed for multiplayer).
4. Deploy. The production build is fully static for `/` and the `/join/[code]` route is a tiny server redirect.

Checklist before you ship:

- [ ] `npm run build` passes locally
- [ ] `npm test` passes
- [ ] Supabase migration applied, env vars set in Vercel (optional)
- [ ] Open the deployed URL on a phone: the intro should play and you should be able to throw a goblin within seconds

---

## Architecture

```
app/                    Next.js App Router (page, layout, /join/[code])
src/sim/                Standalone simulation engine (no React, no DOM; unit-tested)
  world.ts              world creation, islands, factions, spawning
  terrain.ts / nav.ts   procedural floating islands, grid A* with cache
  creature.ts           needs, personality, state machine, work, social, physics
  tasks.ts              demand-driven task generation / selection / assignment
  powers.ts             all player commands (validated, host-applied)
  overlords.ts          AI Overlord strategy, diplomacy, raids, memory
  engine.ts             fixed 10 Hz step, command queue, ambient stories
  snapshot.ts           full snapshots + compact deltas; offline.ts bounded catch-up
  challenges.ts         scenario framework
src/render/             React Three Fiber: terrain, instanced vegetation & creatures,
                        buildings, effects, sky/day-night, camera, input/picking
src/ui/                 HUD, panels, menus, intro, briefing (Tailwind v4 design system)
src/game/session.ts     GameSession: solo / host / client lifecycle, autosave, migration
src/net/                Transport interface, Supabase implementation, in-memory test bus
src/persistence/        IndexedDB saves, settings, guest identity
src/audio/              Procedural WebAudio soundscape (no asset files needed)
supabase/migrations/    rooms table + RLS
scripts/smoke.mjs       Playwright playthrough
tests/                  Vitest suites
```

Design rules that the code follows:

- The renderer never mutates the world; every change is a `Command` through `GameSession.dispatch`, which is what makes solo and multiplayer identical.
- Simulation runs at a fixed 10 Hz independent of frame rate; rendering smooths between steps.
- Vegetation, creatures (16 body-part instanced meshes for up to 220 creatures), items and particles are instanced; React re-renders only on a 4 Hz UI tick.
- No external art assets: every model is procedural so the build never blocks on licensing. Replace any geometry in `src/render/*` with GLB assets later if you want.

---

## Art direction

"A handcrafted miniature kingdom floating in a golden-hour sky." Everything is procedural and lives in `src/render/`:

- **Lighting** (`Sky.tsx`, `Post.tsx`): warm directional sun with soft PCF shadows, a sky/ground hemisphere fill, peach distance fog, a shader-noise *sea of clouds* beneath the archipelago, and (High quality only) a light bloom + film grade + vignette pass built from three's bundled `EffectComposer`.
- **Terrain** (`Terrain.tsx`): vertex-painted moss/meadow patches, damp shoreline dirt, rock on slopes, worn dirt paths that follow the real settlement layout (campfire → buildings) and a baked contact shadow under trees; cliffs are stratified terracotta/sandstone ledges with a mossy overhanging lip; water has depth-shaded teal, shoreline foam and a sun glint; waterfalls spill off the lowest rim.
- **Vegetation** (`Vegetation.tsx`): four tree silhouettes (oak lobes, layered pine, tiered broadleaf, blossom ornamental) chosen per tree with grove-level tint variation, clustered by noise into groves and clearings; ground cover of tufts, poppies/bluebells, mushrooms at tree feet, pebbles on shores, fallen logs, house gardens, hanging roots and floating rock shards under the rim.
- **Creatures** (`Creatures.tsx`): one instanced rig (23 body parts) with species body plans — hunched big-eared goblins with oversized hands and loincloths, broad blue-grey trollkins with tusks and a stony back, cream mushroom folk with spotted caps — expressive brows/pupils driven by mood, and a runic selection ring.
- **UI** (`app/globals.css`): parchment panels in oak frames with bronze trims, a wooden resource bar and island plaque, carved-stone power tokens that gild when active, and a leather-spined field-journal creature panel. Layout is unchanged.

## Known limitations

- Only the Verdant biome is fully dressed; Ember/Crystal/Frost islands use the biome palette (colours, canopy, crystals) on the same generator.
- Creatures never die, they faint and recover; this is deliberate for a toy, and it is what keeps offline progression safe.
- Host-in-browser multiplayer is for friends, not for strangers (see trust model above).
- The 100 Goblins challenge is CPU-heavy on older phones; use Low quality.

## Deploy preview assets

The link preview you see when the Vercel URL is shared (Open Graph / Twitter card), the favicon, the Apple touch icon, the PWA manifest icons and the loading-screen backdrop are all generated **from the game itself**, so they always match the current art:

```bash
npm start                  # production server on :3000
npm run preview-assets     # writes app/opengraph-image.jpg, app/twitter-image.jpg, app/icon.png, app/apple-icon.png, public/preview/*
```

Next.js picks the `app/*-image.jpg` and `app/icon.png` files up automatically (file-based metadata). `metadataBase` is derived from `NEXT_PUBLIC_SITE_URL`, falling back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, so the card URLs are absolute on every deployment without extra configuration. Re-run the script whenever you change the look and commit the results.
