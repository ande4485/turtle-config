#!/bin/sh
cd ~/projects/Projets_turtle/test_firebase
firebase emulators:start --only functions,firestore --import=./datasForTest --export-on-exit