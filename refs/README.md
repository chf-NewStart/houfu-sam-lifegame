# Glyph Run — reference shelf (PDFs kept local, not deployed)

The 13 books in this folder are curated from the full ~140-book paleography
library (`~/Downloads/古文字与甲骨文、金文/`; cloud copy:
https://drive.google.com/drive/folders/1gDSByDgg8Eut-GSWBmRsOIUP5CQYNMbD).
The PDFs are **gitignored** — this repo deploys to a public GH Pages site and
book scans must never be published (copyright + GitHub's 100MB file limit;
《字源》 alone is 137MB). Only this index is committed. If you clone fresh,
re-copy the PDFs from the library folder or the Drive link.

These are scans without text layers — read them as page images
(the Read tool renders PDF pages). zdic.net 字源字形 stays the quick online
lookup; these books are the tie-breaker and depth source.

## Exact glyph shapes (source of truth for in-game glyphs)

- **甲骨文汉字对应表.pdf** — the oracle↔汉字 correspondence table used for
  b23's exact oracle glyphs (feeds tools/extract_glyphs.py → oracle-glyphs.json).
- **徐中舒《汉语古文字字形表》** — per-character form tables across
  甲骨(with dig citations)/金文(vessel names)/说文古文·籀文/篆.
  THE reference for the four-era strip (甲骨→金文→篆→隸/楷). Verified layout:
  one character per column, eras as rows, source cited under every form.
- **陈婷珠《甲骨文字形表》** — standardized oracle-bone shape tables, compact.
- **高明、涂白奎《古文字类编 增订本》** — cross-era form compendium; fallback
  when 徐中舒 lacks a character.
- **说文解字(小篆检字版)** — small-seal lookup for 篆-era forms.

## Character origin & evolution (flavor text, family chains, new content)

- **李学勤《字源》** — authoritative per-character evolution with forms +
  explanation. Best single source when adding a glyph family
  (like 象→像→豫→為, 隹→鳥→鳴→鳳).
- **左民安《细说汉字：1000个汉字的起源与演变》** — accessible origin stories;
  good for in-game lore/toast text.
- **姬克喜《甲骨文图解：汉字溯源》** — illustrated pictorial origins,
  game-friendly visual style.

## Meaning accuracy (what a glyph actually meant in oracle usage)

- **徐中舒《甲骨文字典》** — scholarly oracle-bone dictionary.
- **马如森《殷墟甲骨文实用字典》** — practical, quicker lookups.

## The user's Drive `target/` picks (radicals & narrative)

- **董莲池《说文部首形义通释》** — 540 radicals, form+meaning explained.
- **王彤伟《说文解字五百四十部疏讲》** — lecture-style 540-radical walkthrough.
- **（瑞典）林西莉《汉字王国》** — narrative pictorial history; the tone model
  for in-game lore.

## Also in the big library if ever needed (not copied here)

- 李宗焜《甲骨文字編》上/中/下+索引 — exhaustive oracle variant compendium.
- 容庚《金文编》 — the bronze-inscription equivalent for deeper 金文 work.
- 谷衍奎《汉字源流字典》 — another per-character source-and-flow dictionary.
