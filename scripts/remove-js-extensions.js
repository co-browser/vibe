#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all TypeScript files
const files = glob.sync('**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  cwd: process.cwd(),
  absolute: true
});

console.log(`Found ${files.length} TypeScript files to process`);

let totalChanges = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const originalContent = content;
  
  // Replace import statements with .js extension
  content = content.replace(
    /from\s+["']([^"']+)\.js["']/g,
    'from "$1"'
  );
  
  // Replace dynamic imports with .js extension
  content = content.replace(
    /import\(["']([^"']+)\.js["']\)/g,
    'import("$1")'
  );
  
  // Replace require statements with .js extension (if any)
  content = content.replace(
    /require\(["']([^"']+)\.js["']\)/g,
    'require("$1")'
  );
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✅ Updated: ${path.relative(process.cwd(), file)}`);
    totalChanges++;
  }
});

console.log(`\nCompleted! Updated ${totalChanges} files.`);