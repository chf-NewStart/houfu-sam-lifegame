#!/bin/bash
# Inline engine.js into page.html → out/game/tomato.html (and a copy into the site when PUBLISH=1)
set -e
cd "$(dirname "$0")"
mkdir -p out/game
python3 - <<'EOF'
eng = open('engine.js').read()
eng = eng[:eng.index("if (typeof module !== 'undefined')")].rstrip() + "\n"
page = open('page.html').read()
assert '/*__ENGINE__*/' in page
open('out/game/tomato.html', 'w').write(page.replace('/*__ENGINE__*/', eng))
EOF
cp ../../game/brand-favicon.png out/game/ 2>/dev/null || true
if [ "$PUBLISH" = 1 ]; then cp out/game/tomato.html ../../game/tomato.html; echo "copied into the site"; fi
wc -l out/game/tomato.html
