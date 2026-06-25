# Arcade RL & Remote-Play Roadmap (Phase 2)

Status: **Milestone 1 shipped** ✅ (the Gomoku RL trainer + reward sandbox is live at
`game/gomoku_rl.html`, and trained agents plug into Gomoku's `RL ▷` slot). Sharing
(M3) shipped too — agents export a `GRL1…` code. Phase 1 (arcade front page + GAME
LIFE branding, cleanup, Gomoku difficulty fix) is done and live.

**What shipped (M1 + M3):** self-play Monte-Carlo value learning over pattern
features; a reward/punishment sandbox (sliders + Balanced/Aggressive/Defensive/
Win-only presets); a live learning curve + an interpretable "what it learned to
value" weight panel; export to JSON / shareable code / localStorage; and a working
`RL ▷` opponent in `gomoku.html` (loads from a code or a local training session,
with getCandidates giving it a win/block safety net). Validated end-to-end: the agent
teaches itself to attack and defend, and the trainer→game pipeline round-trips.

**Still open:** M2's "your RL vs the minimax AI in one game" (Gomoku difficulty is
currently global, so a single game can't pit RL against minimax — needs per-side
opponent selection) and M4 (remote friends-in-browser polish + agent-vs-agent).

## Decisions (from the brainstorm)

1. **Flagship trainer = Gomoku**, not Escape Grid. The Escape Grid DQN never
   converged to a decent hunter, so its RL toggle + train page are hidden for now
   (kept in the code as `display:none`, not deleted — see `game/game.html`). The
   in-browser DQN in `game/train.html` stays as **reusable reference** for the
   Gomoku build.
2. **Remote = friends-in-browser (C1).** First goal: you and Jane open a room code
   and play. *Later*, the same channel hosts **agent-vs-agent** — each side loads a
   trained agent and they duel. A real external bot API (C2) is **deferred**.
3. **Agents are shareable** — export a short code / URL so someone else can load and
   play your trained agent.

---

## 0. What we already have (don't rebuild)

| Capability | Where | Reuse for Gomoku? |
|---|---|---|
| In-browser **DQN** (MLP, replay, target net, Adam) | `game/train.html` | ✅ Reference implementation to port to a Gomoku net. |
| **Weight export/import** (`localStorage` + JSON download, browser forward-pass) | `train.html` + `game.html` | ✅ Same serialization format works; reuse the schema. |
| **Tunable rewards pattern** (currently hard-coded constants) | `train.html` ~L226–333 | ✅ Lift into sliders for the Gomoku reward sandbox. |
| **Remote multiplayer** (Firebase RTDB, room codes, move sync, sessions) | `game/gomoku.html` ~L728–847 | ✅ This IS C1 — already mostly working. |
| **Minimax Gomoku AI** (pattern-aware eval + forced blocks) | `gomoku.html` | ✅ The benchmark opponent to train/measure the RL agent against. |
| Reserved **`RL ▷`** difficulty slot | `gomoku.html` | ✅ Where the trained agent plugs in. |
| **RTDB security rules** scoped to `/games/{code}` | Firebase console (verified) | ✅ Correct baseline for C1; tighten further only if C2 ever happens. |

The trainer, the weight format, and the remote channel all already exist — Phase 2
is mostly *building the Gomoku agent* and *connecting* the rest.

---

## Milestone 1 — Gomoku RL agent + reward/punishment sandbox  *(the flagship)*

The "train your own & duel" experience, on Gomoku.

- **Agent:** self-play training in the browser. Start simple — a value/policy net
  over a compact board encoding (or tabular-ish features + the existing minimax as a
  bootstrapping opponent), porting the `train.html` DQN scaffolding. Gomoku self-play
  is far cleaner to get working than the Escape Grid hunter was.
- **Reward/punishment sandbox** (the "tune the punishments" idea): sliders for the
  shaping rewards — e.g. reward for making an open three / four, penalty for allowing
  the opponent an open three, win/loss terminal values, per-move cost. Presets like
  `Aggressive` (reward own threats) vs `Defensive` (penalise opponent threats) so the
  behaviour change is visible and teachable.
- **Live training UI:** reuse `train.html`'s chart + log (win-rate vs the minimax AI
  over episodes), then **export weights** in the existing JSON format.
- **Plug-in point:** enable the reserved `RL ▷` slot in `gomoku.html` — add an `rl`
  branch in `getAIMove` that runs the loaded policy.

**Output:** a player can train an agent, watch it improve, and immediately play it.

## Milestone 2 — Play your agent (local)

Wire the trained agent in as an opponent type in Gomoku: **you vs your agent**, and
**your agent vs the minimax AI** (great for measuring how good your reward tuning is).
The board already supports AI-vs-AI with pause — mostly a player-type addition.

## Milestone 3 — Shareable agents

- **Export:** serialise the trained weights + reward settings to a short **code or
  URL** (compact base64/JSON; tiny nets fit easily). 
- **Import:** paste a code / open a `?agent=…` link to load and play someone else's
  agent. Keep a small local "my agents" list (named, in `localStorage`).
- This is what lets you and Jane swap agents, and later pit them against each other.

## Milestone 4 — Remote friends-in-browser (C1) + agent duels

- **C1 (priority):** you + Jane open a room code and play. This already exists in
  `gomoku.html`'s Firebase layer — the work is polish: clearer create/join flow,
  reconnect handling, showing whose turn it is, a rematch button.
- **Agent-vs-agent over the wire (later):** add a "let my agent play" toggle in a
  room — instead of waiting for your click, your loaded agent computes the move and
  pushes it through the same `fbSendMove`. Combined with Milestone 3, that's *your
  trained agent vs Jane's*, watched live in both browsers.

## Deferred — external bot API (C2)

A documented room protocol + reference client so an outside program (CLI / LLM agent)
can join by code. Not needed for the friends-in-browser goal; revisit later. Would
require tightening the RTDB rules beyond today's baseline first.

---

## Suggested build order
1. **M1** — Gomoku self-play agent + reward sandbox (the headline feature).
2. **M2** — play it locally (vs you, vs minimax).
3. **M3** — shareable agent codes/URLs.
4. **M4** — polish C1 remote, then agent-vs-agent over it.

M1 is the big one (real ML work); M2–M4 are mostly wiring onto things that already
exist. Recommend shipping M1 first to validate the "tune the punishments" loop before
investing in sharing/remote.
