# Giving the relay a custom domain (for friends in mainland China)

The relay answers at `wss://lifegame-relay.houfuchen0702.workers.dev`. Addresses
on `*.workers.dev` are widely reported to be blocked in mainland China, so
online rooms (Plank Plank Plank!, Manilha) may not connect there. The fix is a
custom domain for the same Worker, for example `relay.houfu72.com`. Cloudflare
only attaches a Worker to a domain whose DNS it runs, and both of our domains
use IONOS DNS today (checked 2026-10-20: `dig NS houfu72.com` and
`dig NS lifegameproject.com` both answer `ns10xx.ui-dns.*`). So one domain's
nameservers have to move from IONOS to Cloudflare. Everything below is on
Cloudflare's **Free** plan; nothing here costs money. The domain stays
registered (and renewed) at IONOS; only who answers its DNS changes.

**Use houfu72.com, not lifegameproject.com**, and do it after Plank Constant
1.0 has cleared App Review. The App Store privacy and support links point at
lifegameproject.com; a DNS slip there during a review breaks them. A slip on
houfu72.com only takes the personal site down for a while.

## 1. Note what IONOS has now (5 min)

IONOS → **Domains & SSL** → houfu72.com → **DNS**. Write down (or screenshot)
every record. Expect the GitHub Pages ones:

- `A @ 185.199.108.153`, `.109.153`, `.110.153`, `.111.153`
- `CNAME www → <github user>.github.io` (if there is one)

and any **MX** / **TXT** records. If IONOS mail is used on houfu72.com, the MX
and its TXT (SPF) records must come along, or mail stops.

If **DNSSEC** is switched on for the domain at IONOS, switch it off now and
wait an hour before step 3.

## 2. Add the domain to Cloudflare (5 min)

1. dash.cloudflare.com (the same account the relay is deployed to) →
   **Add a domain** → `houfu72.com` → *Quick scan for DNS records* → Continue.
2. Pick the **Free** plan.
3. Compare the scanned records with step 1. Add anything missing. Set every
   imported record to **DNS only** (grey cloud), so the site keeps being served
   by GitHub Pages exactly as now (GitHub's own HTTPS certificate keeps working,
   and Phloem's iCloud web sign-in, whose CloudKit tokens are bound to the
   origin https://houfu72.com, sees the same origin as before).
4. Cloudflare shows two nameservers, like `ada.ns.cloudflare.com` and
   `bob.ns.cloudflare.com`. Keep that page open.

## 3. Point IONOS at Cloudflare (5 min, then waiting)

IONOS → **Domains & SSL** → houfu72.com → **Name servers** (sometimes under
the domain's ⋯ menu → *Edit name servers*) → **Use custom name servers** →
enter the two Cloudflare nameservers, remove the IONOS ones, save.

Cloudflare emails when the domain is **Active** (often within an hour, at most
a day). Check `https://houfu72.com` still loads.

## 4. Attach the relay (2 min)

Cloudflare → **Workers & Pages** → `lifegame-relay` → **Settings** →
**Domains & Routes** → **Add** → **Custom domain** → `relay.houfu72.com` → Add.
Cloudflare creates the DNS record and the certificate itself (a few minutes).

Check:

```sh
curl https://relay.houfu72.com/health      # → lifegame relay: ok
```

The old workers.dev address keeps working too, so nothing breaks in between.

Optional: so that later deploys from GitHub never drop it, add this to
`relay/wrangler.toml` (the Deploy relay workflow's token needs the zone's
*Workers Routes: Edit* permission for it; if the deploy then fails, remove
the line and keep the dashboard setting):

```toml
routes = [{ pattern = "relay.houfu72.com", custom_domain = true }]
```

## 5. Switch the games over (one commit)

- **Plank Plank Plank!** (web page and the Plank Constant app 1.1+): edit
  `game/relay.json` → `{"relay": "wss://relay.houfu72.com"}`. The page reads it
  on every visit; the app reads it at launch and caches it. Also change
  `DEFAULT_RELAY` in `game/plank-online.js` and `RelayConfig.defaultURL` in the
  app (PlankPilot/Remote/RelayConnection.swift) at the next app update; those
  are only fallbacks.
- **Manilha**: `game/truco-relay.json` (the app reads it) and `RELAY` in
  `game/truco.html`.
- The relay only accepts pages from `ALLOW_ORIGINS` in `relay/wrangler.toml`;
  the pages stay on lifegameproject.com, so nothing to change there.

Push main; GitHub Pages publishes it in a minute or two.

## 6. Test from China

Ask a friend there to open `https://relay.houfu72.com/health` (should say
`lifegame relay: ok`), then `https://lifegameproject.com/game/plank-duel.html`
and join a room you create. If the health page loads but the game page does
not, the problem is GitHub Pages (lifegameproject.com), not the relay.

## Undo

IONOS → Name servers → back to *IONOS name servers*. The relay keeps working on
workers.dev; put the old address back in the two JSON files.
