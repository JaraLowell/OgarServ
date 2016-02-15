@echo off

rem *** Please make sure node can be accessed at this phase, so either do a path to node. (see Dos manuals)
rem *** or replace node by for example c:\path.to.where.node.is\node or if you wish to use JX replace node
rem *** with JX.
rem *** exemple: C:\JXCore\JX install..... etc

:loop
   cls
   npm install ws http fs sys mysql url underscore
   npm install -g n
   node index.js
   goto loop
