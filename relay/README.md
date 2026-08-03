# gomoku relay

Remote play used to run on Firebase. Firebase is Google at both ends — the SDK
comes off `gstatic.com`, the database lives on `firebaseio.com` — and neither
host is reachable from mainland China, so a game with a friend there could not
connect at all. It did not even fail: it sat on "连接中…" forever.

This is the same job, on Cloudflare, which China can reach. One Durable Object
per room code holds that room's state; both players keep a WebSocket open to
it. The relay knows nothing about gomoku — a room is a flat map of key to JSON
value, and whoever writes a key, everyone in that room is told. That is the
whole contract the game already used, which is why nothing in the game had to
change to move onto it.

## Deploying it

You need a Cloudflare account. The free plan is enough: Durable Objects are
included on it, with roughly 3M requests a month, and this uses a handful per
move.

```sh
npm install -g wrangler     # or: npx wrangler ...
cd relay
wrangler login
wrangler deploy
```

`wrangler deploy` prints the address it went to, something like

```
https://gomoku-relay.YOURNAME.workers.dev
```

Check it with `curl https://gomoku-relay.YOURNAME.workers.dev/health` — it
should answer `gomoku relay: ok`.

## Turning it on

One line, in `game/gomoku.html`. Find:

```js
const RELAY = '';
```

and put the address in, as `wss://` rather than `https://`:

```js
const RELAY = 'wss://gomoku-relay.YOURNAME.workers.dev';
```

Empty means keep using Firebase. Set means every room goes through the relay
instead, everywhere, for everyone — there is no per-player switch and nothing
to explain to whoever you are playing.

Then lock it to your own pages, so the relay is not a free WebSocket service
for the internet. Uncomment the `ALLOW_ORIGINS` block in `wrangler.toml` and
`wrangler deploy` again. Unset means allow anything, which is only so that a
fresh deploy works before you have configured it.

## Cost

A room is two sockets and a few dozen small writes over a game. The object
hibernates between moves, so an idle room is not billed for sitting there, and
a room nobody has touched for six hours deletes itself. Two people playing
gomoku will not come close to the free limits.

## If you want Firebase back

Set `RELAY` to `''` again. The Firebase path was left in place rather than
deleted, so that is the whole revert.
