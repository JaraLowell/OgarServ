#/bin/bash
clear

if ! [ -x "$(command -v jx)" ]; then
  echo JXcore not installed, installing it now...
  curl https://raw.githubusercontent.com/jxcore/jxcore/master/tools/jx_install.sh | bash
  sleep 2
fi

if [ ! -d "node_modules" ]; then
  echo module files not found, installing them now...
  jx install ws http fs sys mysql url underscore vector2-node
  sleep 2
fi

while true
do
  # Insert your invocation
  clear
  jx --nouse-idle-notification --expose-gc --always-compact --max-new-space-size=2048 --max-old-space-size=2048 index.js
  echo Server went off, waiting ten sec then restarting it...
  sleep 10
done
