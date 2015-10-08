#/bin/bash
if ! [ -x "$(command -v jx)" ]; then
  echo JXcore not installed, installing it now...
  curl http://jxcore.com/xil.sh | bash
  sleep 2
  clear
fi

if [ ! -d "node_modules" ]; then
  echo module files not found, installing them now...
  jx install querystring ws http fs sys mysql
  sleep 2
  clear
fi

while true
do
  # Insert your invocation below mt:4 multicore 4x
  jx index.js
  echo Server went off, waiting five sec then restarting it...
  sleep 5
  clear
  done
