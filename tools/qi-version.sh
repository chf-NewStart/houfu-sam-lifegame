#!/bin/sh
# Qi on the web: gives every Qi module a new ?v= so the service worker (stale-while-
# revalidate for assets) and browser caches fetch the new files. Bump on each Qi release,
# along with CACHE in sw.js.   usage: sh tools/qi-version.sh 2
set -e
v="$1"
[ -n "$v" ] || { echo "usage: $0 N" >&2; exit 1; }
cd "$(dirname "$0")/.."
for f in game/qi.html game/qi/*.js sw.js; do
  # Only the Qi files' own versions (go-engine.js keeps its own).
  perl -pi -e 's{(?<!\.)((?:qi/|\./)[a-z0-9-]+\.(?:js|css))\?v=\d+}{$1?v='"$v"'}g; s{^(\s*'"'"'/game/qi/[^'"'"']+)\?v=\d+}{$1?v='"$v"'}' "$f"
done
grep -ho '?v=[0-9]*' game/qi/*.js game/qi.html | sort | uniq -c
