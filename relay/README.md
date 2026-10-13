# lifegame relay

Online rooms for the arcade, on Cloudflare. Remote play used to run on
Firebase, which is Google at both ends — the SDK comes off `gstatic.com`, the
database lives on `firebaseio.com` — and neither host is reachable from
mainland China, so a game with a friend there could not connect at all. It did
not even fail: it sat on "连接中…" forever.

One Durable Object per room code holds that room's state; every player keeps a
WebSocket open to it. The relay knows nothing about any game — a room is a flat
map of key to JSON value, and whoever writes a key, everyone in that room is
told. On top of that it keeps presence: a socket may name itself with `?id=…`,
and the room tells everyone which ids are connected.

Who uses it:

- **Manilha** (`game/truco.html` in the browser, and the Manilha iOS app,
  `chf-NewStart/manilha-ios`). Both speak the room contract in
  `game/truco-online.js`, so the same room can be played from both, with
  either one hosting. Rooms are `wss://…/room/<7-letter code>`.
- **gomoku** can use it too: set `RELAY` in `game/gomoku.html` (empty means
  it keeps using Firebase).

## Messages

Client → room:

| message | |
|---|---|
| `{"t":"set","p":key,"v":value}` | write a key (`null` deletes it); keys ≤ 64 chars, values ≤ 64 KB, room ≤ 256 KB |
| `{"t":"ping"}` | keep-alive, answered `{"t":"pong"}` by the runtime without waking the room |
| `{"t":"who"}` | ask who is connected |

Room → client:

| message | |
|---|---|
| `{"t":"init","d":{…},"who":[ids]}` | on connect: the whole map and who is here |
| `{"t":"u","p":key,"v":value}` | a key changed — sent to the writer too, so everyone sees the same order |
| `{"t":"who","ids":[ids]}` | someone arrived or left (also the answer to `who`) |

A socket that has not pinged for 45 s is treated as gone and closed (a phone
that went to sleep does not always say goodbye). A room nobody has written to
for six hours deletes itself.

## Deploying it

You need a Cloudflare account; the free plan is enough. Either:

**From GitHub** (like Monet studio): add a `CLOUDFLARE_API_TOKEN` repository
secret to this repo (Cloudflare → My Profile → API Tokens → Create Token →
"Edit Cloudflare Workers"), then run the *Deploy relay* workflow (Actions tab).
It redeploys by itself whenever `relay/` changes on main.

**From this Mac:**

```sh
cd relay
npx wrangler@4 login
npx wrangler@4 deploy
```

Either way it lands at `https://lifegame-relay.<your-subdomain>.workers.dev`
(for this account: `houfuchen0702`). Check it with
`curl https://lifegame-relay.houfuchen0702.workers.dev/health` — it should
answer `lifegame relay: ok`.

The address is written into `game/truco.html` (`RELAY`), into the Manilha app
(`RelayConfig.defaultURL`), and into `game/truco-relay.json`, which the app
reads on launch — so moving the relay later (say, to a custom domain) only
needs this file changed, not an app update.

Then lock it to your own pages, so the relay is not a free WebSocket service
for the internet: uncomment the `ALLOW_ORIGINS` block in `wrangler.toml` and
deploy again. The Manilha app sends `Origin: https://lifegameproject.com`.

## Mainland China

Cloudflare itself is reachable from China, but `*.workers.dev` addresses are
widely reported to be blocked there. For friends in China, give the Worker a
custom domain (e.g. `relay.lifegameproject.com`): that needs the domain's DNS
on Cloudflare (free plan), then Workers → lifegame-relay → Settings → Domains.
Update `game/truco-relay.json` and `RELAY` in `game/truco.html` to the new
`wss://` address. Test from China before relying on it.

## Trying it locally

```sh
cd relay && npx wrangler@4 dev --port 8787          # the relay, on this Mac
python3 -m http.server 8000                          # the site, from the repo root
open "http://127.0.0.1:8000/game/truco.html?relay=ws://127.0.0.1:8787"
RELAY_URL=ws://127.0.0.1:8787 node --test tests/relay-live.test.mjs
```

On localhost only, `?relay=` points the page at the local relay and
`&autoplay=1` lets the computer play the page's seat. The iOS app takes
`-relay ws://127.0.0.1:8787` (DEBUG builds).

## Cost

Free-plan limits (per day): 100,000 Worker requests, 100,000 Durable Object
requests (WebSocket messages count 20 to 1), 100,000 storage rows written.
A Manilha match is a few hundred writes (one per move, each about two rows),
so the free plan covers on the order of a hundred matches a day. On the free
plan nothing is billed: past a limit, requests simply fail until the next day.
Idle rooms hibernate and cost nothing.
