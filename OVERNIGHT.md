# Overnight build queue

Every morning at 6:00 the overnight builder picks the **topmost unchecked task**,
builds it on a branch, and opens a PR for review. One task per night — keep them
PR-sized. If the queue is empty, the builder just starts the usage window and exits.

Write tasks like you'd brief a contractor: what, where, and what "done" looks like.

## Queue

- [ ] Dilemma Lab (game/dilemma.html): add "share my strategy" — encode the
      player's rule list + name into a short code string (base64 or similar) with
      a copy button, and an import box that decodes a friend's code into the rule
      builder. Bilingual labels like the rest of the page. Bump the index link
      to ?v=b2.

## Done

<!-- The builder moves finished tasks here with date + branch. -->
