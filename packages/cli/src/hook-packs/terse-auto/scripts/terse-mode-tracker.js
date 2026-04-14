#!/usr/bin/env node
// terse-auto — UserPromptSubmit hook
// Tracks /terse mode switches and deactivation via flag file

const fs = require('fs');
const path = require('path');
const os = require('os');

const flagPath = path.join(os.homedir(), '.soleri', '.terse-active');

let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Match /terse commands
    if (prompt.startsWith('/terse')) {
      const parts = prompt.split(/\s+/);
      const arg = parts[1] || '';

      let level = null;
      if (arg === 'lite') level = 'lite';
      else if (arg === 'ultra') level = 'ultra';
      else level = 'full';

      fs.mkdirSync(path.dirname(flagPath), { recursive: true });
      fs.writeFileSync(flagPath, level);
    }

    // Detect deactivation
    if (/\b(stop terse|normal mode|verbose)\b/i.test(prompt)) {
      try {
        fs.unlinkSync(flagPath);
      } catch (_e) {}
    }
  } catch (_e) {
    // Silent fail
  }
});
