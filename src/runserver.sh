#/bin/bash
clear

if ! [ -x "$(command -v jx)" ]; then
  echo JXcore not installed, installing it now...
  curl http://jxcore.com/xil.sh | bash
  sleep 2
  clear
fi

if [ ! -d "node_modules" ]; then
  echo module files not found, installing them now...
  jx install ws http fs sys mysql url underscore
  sleep 2
  clear
fi

while true
do
  # Insert your invocation
  jx --nouse-idle-notification --expose-gc index.js
  echo Server went off, waiting ten sec then restarting it...
  sleep 10
  done
