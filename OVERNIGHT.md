# Overnight build queue

Every morning at 6:00 the overnight builder picks the **topmost unchecked task**,
builds it on a branch, and opens a PR for review. One task per night — keep them
PR-sized. If the queue is empty, the builder just starts the usage window and exits.

Write tasks like you'd brief a contractor: what, where, and what "done" looks like.

## Queue

## Done

<!-- The builder moves finished tasks here with date + branch. -->

- [x] Dilemma Lab (game/dilemma.html): add "share my strategy" — encode the
      player's rule list + name into a short code string (base64 or similar) with
      a copy button, and an import box that decodes a friend's code into the rule
      builder. Bilingual labels like the rest of the page. Bump the index link
      to ?v=b2. (built and open as PR #3, branch `overnight/dilemma-share-strategy`,
      since 2026-07-18; re-verified clean/mergeable on 2026-09-02, -04, -05, -06 and
      -07 — it only needs a human merge-or-close decision. Checking it off here so
      the queue stops re-selecting it every night; if PR #3 is closed without
      merging instead, move this back to Queue.)
