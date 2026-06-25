# Arcade RL & Remote-Play Roadmap (Phase 2 design)

Status: **proposal for sign-off** — nothing here is built yet. Phase 1 (arcade
front page, cleanup, Gomoku difficulty fix) is done and live.

This doc turns the brainstorm — *"train your own RL, tune the punishments, play it
against other AI or a human, or run my agent against yours remotely"* — into a
concrete, phased plan built on what already exists in this repo.

---

## 0. What we already have (don't rebuild)

| Capability | Where | Notes |
|---|---|---|
| In-browser **DQN trainer** | `game/train.html` | 62→128→128→14 MLP, experience replay, target net, Adam. Trains the Escape Grid *hunter*. Runs entirely client-side, no backend. |
| **Reward function** | `train.html` (~L226–333) | Step penalty, proximity bonus, attack/kill rewards, escape/death penalties — **all hard-coded constants today.** |
| **Weight export / import** | `train.html` → `localStorage['hunter_rl_weights']` + `hunter_rl.json` download; `game.html` loads it | JSON schema: `{version,state_dim,action_dim,hidden,action_names,weights[],biases[]}`. |
| **Agent inference in a real game** | `game/game.html` | Hunter can be Dijkstra **or** the trained DQN. State encoder + forward pass + action masking already implemented. |
| **Remote multiplayer** | `game/gomoku.html` (~L728–847) | Firebase RTDB. Room codes, `games/{code}/moves` child-added sync, session counter. Player types: `human` / `ai` / `random`; `remoteMode` flag. No per-side "remote agent" type yet. |
| **Minimax Gomoku AI** | `gomoku.html` | Now with pattern-aware eval + forced blocks (Phase 1). The `RL ▷` difficulty slot is a reserved placeholder. |

So three of the four hard parts already exist: **a trainer, a weight format, and a
remote channel.** Phase 2 is mostly *exposing* and *connecting* them.

---

## Feature A — Reward / Hyperparameter Sandbox

**Goal:** let a visitor change the punishments and watch how the agent's behaviour
changes — the "make people train their RL" idea.

**Build (on top of `train.html`):**
1. Lift the hard-coded reward constants into a single `REWARDS` object and render a
   panel of sliders/number inputs for each (step penalty, proximity bonus,
   attack +, kill +, escape −, hunter-death −, invalid-move −).
2. Same for `HYPERPARAMS` (learning rate, gamma, ε-decay, batch size, target-sync
   freq, hidden size). Inputs with sane min/max.
3. **Presets** as a teaching tool: `Balanced`, `Aggressive` (big kill reward, small
   step penalty), `Cautious` (heavy death penalty), `Speedrunner` (heavy step
   penalty). One click loads a reward set so the behaviour change is obvious.
4. **Agent registry:** save a finished run under a name → `localStorage` list
   `arcade_agents` = `[{name, game, rewards, hyper, weights, winRate, episodes, ts}]`.
   Lets users keep several agents and pick one to play/duel.
5. Small "what this does" caption per slider so it's educational, not just knobs.

**Effort:** ~1 focused session. Net-new is only the UI + refactor of constants into
objects; the training loop already consumes them.

**Risk:** none structural. Keep the existing defaults as the `Balanced` preset so
current behaviour is preserved.

---

## Feature B — Agent Arena (local: agent vs AI / human / agent)

**Goal:** pit a trained agent against something.

- **Escape Grid** already supports human / AI / RL hunter — extend the picker so a
  *saved agent from the registry* can fill the hunter slot, and let participants be
  human/greedy. This is mostly wiring the registry into `game.html`'s existing
  weight loader.
- **Agent-vs-agent (local):** run two saved agents headless and animate the result
  — a "watch them duel" button. The headless env already exists in `train.html`.
- This is the stepping stone to the remote version below (same move loop, different
  transport).

**Effort:** small for Escape Grid; depends on Feature D for Gomoku.

---

## Feature C — Remote agent-vs-agent ("my agent vs yours")

This is the interesting one. The existing Gomoku Firebase channel already syncs
moves between two browsers by room code. Two layers, pick per appetite:

### C1 — Browser-to-browser agent duel (small)
Add a `remote-agent` option to each side. In `remoteMode`, instead of waiting for a
human click, the local side lets its **chosen agent** (minimax at a difficulty, or a
loaded RL agent) compute the move and pushes it via the existing `fbSendMove`. Net
effect: open a room on two machines, each picks an agent, and they play over the
wire. ~Half a day; it reuses 90% of the current remote code.

### C2 — Open agent protocol / bot API (bigger, the "I'll use my agent against you")
Document the room as a **machine protocol** so an *external program* (your CLI
agent, a script, my agent) can join by code and play — against a human, the minimax
AI, or another bot — without a browser.

Reference schema (already most of what gomoku writes):
```
games/{code}/meta   = { game:"gomoku", host, created, status }
games/{code}/state  = { board:[225], turn:1|2, winner:0|1|2, session }
games/{code}/moves  = push({ r, c, by, session })   # append-only move log
games/{code}/agents = { p1:"human|minimax:hard|bot", p2:... }   # who controls each side
```
Deliverables: a written protocol spec + a tiny reference client (Node, ~60 lines:
`join(code)`, `onYourTurn(cb)`, `play(r,c)`) so anyone can wire an agent to it. This
turns "remote mode" into a sandbox where **any** agent — RL, search, human, or an
LLM agent — can enter the same room. ~1–2 sessions.

> **Security note (do before any public bot API):** the Firebase web config in
> `gomoku.html` is public (normal for Firebase), but RTDB **security rules** are the
> real gate. Confirm rules scope writes to a room's own path and rate-limit, or a
> bot could scribble across all games. This is a prerequisite for C2, not optional.

---

## Feature D — Gomoku RL agent (fills the `RL ▷` slot + the "soon" card)

The natural home for the reward-sandbox idea, since Gomoku is simpler than Escape
Grid and self-play is clean.

- **Approach:** start with self-play TD/DQN over a compact board encoding, or a
  lightweight policy net. Reuse the Feature-A reward sandbox (here the "punishments"
  are e.g. penalty for allowing an open three, reward for making a four).
- **Plug-in point:** Gomoku's `getAIMove` already branches on player type; add an
  `rl` branch that runs the loaded policy, and enable the existing `RL ▷` button.
- **Then it composes:** a trained Gomoku agent can play the minimax AI (Feature B),
  a human, or a remote agent (Feature C) — and the remote duel becomes "my trained
  Gomoku RL vs your minimax / your bot."

**Effort:** the largest single piece. Gomoku self-play that's actually decent is
real ML work; scope it as its own milestone.

---

## Suggested sequencing

1. **A — Reward/hyperparameter sandbox** in `train.html` (fast, high "wow", educational).
2. **B — Registry → Escape Grid arena** (wire saved agents into the game; local duels).
3. **C1 — Browser-to-browser agent duel** in Gomoku (reuses remote code).
4. **C2 — Open bot protocol + reference client** (after confirming RTDB rules).
5. **D — Gomoku RL agent** (own milestone; unlocks RL in the remote arena).

Each step is independently shippable and visible on the arcade. Recommend doing
**A** first to validate the "tune the punishments" interaction before investing in D.

## Open questions for you
- Which game should host the flagship "train your own & duel" experience — Escape
  Grid (trainer already exists) or Gomoku (simpler, better for self-play)?
- For remote: is the goal friends-in-browsers (C1) or a real bot API you can drive
  from your own agent/CLI (C2)? That changes priority.
- Do you want trained agents to be **shareable** (export a code/URL so others load
  your agent), or local-only to start?
