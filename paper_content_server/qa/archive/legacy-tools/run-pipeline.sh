#!/bin/bash
set -e

echo "Applying AST fixes..."
node fix-ast-ext7.js
node fix-inject-ext7.js

echo "Resetting repo..."
git reset --hard

echo "Running setup..."
node setup-p0-fixes.js

echo "Extracting AST..."
node ast-extract.js

echo "Injecting runtime..."
node inject-runtime.js

echo "Applying patches..."
node fix-rootdir.js
node patch3.js
node patch4.js
node fix-deploy.js

echo "Fixing tests..."
node fix-tests.js
node fix-tests2.js
node fix-tests3.js
node fix-tests4.js
node patch-rotation-test.js
node fix-tmp.js

echo "Fixing pure-logic..."
node fix-pure-logic-final.js
node fix-pure-logic-category.js
node fix-timezone-final.js

echo "Running tests..."
npm run photo:safety-test
npm run rotation:test
npm run storyboard-source:test
npm run coherence:test
npm run schedule:test

echo "All tests passed successfully!"
