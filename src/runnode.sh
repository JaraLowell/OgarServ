#/bin/bash
clear
if [ ! -d "node_modules" ]; then
  echo module files not found, installing them now...
  npm install quad-node vector2-node ws http fs sys mysql xmlhttprequest punycode
  sleep 2
fi

while true; do
  clear
  node --nouse-idle-notification --expose-gc --always-compact index.js
  echo Server went off, waiting ten sec then restarting it...
  sleep 30
done
