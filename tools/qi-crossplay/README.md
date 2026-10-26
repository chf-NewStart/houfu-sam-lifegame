# Qi cross-play: the web and the app at one Mahjong table

Both sides on the real relay (it only answers `Origin: https://lifegameproject.com`, which
these send):

- `mahjong-web.mjs` runs the page's own Mahjong online code (game/qi/online.js,
  mahjong-room.js, mahjong-keys.js) in Node: `node mahjong-web.mjs host` opens a table and
  plays seat 0 and the computers; `node mahjong-web.mjs join CODE` sits as a guest. It needs
  the cryptography the page loads from the CDN: `npm i @noble/curves@1.4.0
  @noble/ciphers@0.5.3 @noble/hashes@1.4.0` next to it.
- `main.swift` is a player built from the app's own sources (Qi/Engine/{Mahjong, MahjongAI,
  GoGame, Gomoku, Chess, ChessAI}.swift and Qi/Online/{QiRoom, OnlineSession,
  RelayConnection, JSONValue, MahjongRoom}.swift from the qi-ios repo):
  `swiftc -swift-version 5 -parse-as-library -O -o appcli *.swift`, then `./appcli host` or
  `./appcli join CODE`.

Each prints every hand's steps and result; the two logs must be identical. Tested 2026-10-26
both ways (web host + app guest, app host + web guest), two hands each.
