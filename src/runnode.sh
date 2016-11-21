#/bin/bash
clear
if [ ! -d "node_modules" ]; then
  echo module files not found, installing them now...
  npm install ws http fs sys mysql url underscore quad-node vector2-node xmlhttprequest
  sleep 2
fi

while true; do
  clear
  node --nouse-idle-notification --expose-gc --always-compact --max-new-space-size=2048 --max-old-space-size=2048 index.js
  echo Server went off, waiting ten sec then restarting it...
  sleep 30
done
