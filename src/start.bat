@echo off

rem *** Please make sure node can be accessed at this phase, so either do a path to node. (see Dos manuals)
rem *** or replace node by for example c:\path.to.where.node.is\node or if you wish to use JX replace node
rem *** with JX.
rem *** exemple: C:\JXCore\JX install..... etc

:loop
   cls
   node --nouse-idle-notification --expose-gc --always-compact --max-new-space-size=2048 --max-old-space-size=2048 index.js
   goto loop
