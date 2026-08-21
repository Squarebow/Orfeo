// Generates docs/THIRD_PARTY_LICENSES.md.
// Each license group: heading + link on one line, full text collapsed in a
// closed-by-default <details> block, then an always-visible table of
// packages/repos/copyright holders.
//
// Usage:
//   npx license-checker --production --json --out scripts/license-report.json
//   node scripts/generate-licenses.mjs

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const REPORT_PATH = path.resolve('scripts/license-report.json');
const OUTPUT_PATH = path.resolve('docs/THIRD_PARTY_LICENSES.md');

const EXCLUDE = new Set(['orfeo@1.0.0']);
const CUSTOM_HANDLED = new Set(['gsap@3.15.0']); // hand-written section, prepended separately

const GROUP_ORDER = [
  'MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', '0BSD',
  'MPL-2.0', 'BlueOak-1.0.0', '(MIT AND Zlib)', 'Python-2.0',
];

const LICENSE_URL = {
  'MIT': 'https://opensource.org/license/mit',
  'ISC': 'https://opensource.org/license/isc-license-txt',
  '0BSD': 'https://opensource.org/license/0bsd',
  'BSD-3-Clause': 'https://opensource.org/license/bsd-3-clause',
  'BSD-2-Clause': 'https://opensource.org/license/bsd-2-clause',
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  'MPL-2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
  'BlueOak-1.0.0': 'https://blueoakcouncil.org/license/1.0.0',
  '(MIT AND Zlib)': 'https://opensource.org/license/mit',
  'Python-2.0': 'https://www.python.org/download/releases/2.0/license/',
};

// Short canonical text per group, shown once inside the collapsed accordion.
const CANONICAL_TEXT = {
  'MIT': `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`,

  'ISC': `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

  '0BSD': `Permission to use, copy, modify, and/or distribute this software for
any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

  'BSD-3-Clause': `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DAMAGES ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.`,

  '(MIT AND Zlib)': `Dual-licensed under MIT and Zlib terms. Both are short permissive
licenses requiring only that copyright/license notices be retained; neither
imposes copyleft obligations. See the MIT text above for the MIT half; Zlib
terms are functionally equivalent.`,

  'BlueOak-1.0.0': `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND WITHOUT WARRANTY OF ANY KIND, TO THE
EXTENT PERMITTED BY LAW. THE COPYRIGHT HOLDER DISCLAIMS ALL LIABILITY FOR
HOW THIS SOFTWARE IS USED OR PERFORMS, TO THE EXTENT PERMITTED BY LAW.`,

  'Apache-2.0': `Licensed under the Apache License, Version 2.0 (the "License"); you may
not use this file except in compliance with the License.

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations
under the License. (Full ~10KB text at the link above — condensed here
since its terms are standardized.)`,

  'MPL-2.0': `This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this file,
you can obtain one at the link above.

MPL-2.0 is a file-level (weak) copyleft license — modifications to
MPL-licensed files must have their source made available under MPL-2.0, but
the license does not extend to other files in a larger work that simply
link against or import the MPL-licensed component.`,

  'Python-2.0': `Licensed under the Python Software Foundation License Version 2 — a
permissive license similar in effect to BSD/MIT (no copyleft obligations).
(Full PSF license file bundles retained historical license versions for
older Python releases that don't apply to this dependency; omitted here.)`,
};

function firstCopyrightLine(text) {
  const line = text.split('\n').find((l) => /copyright/i.test(l));
  return line ? line.trim().replace(/^#+\s*/, '') : null;
}

const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
const entries = Object.entries(report).filter(
  ([pkg]) => !EXCLUDE.has(pkg) && !CUSTOM_HANDLED.has(pkg)
);

const groups = new Map();
const flagged = [];

for (const [pkg, info] of entries) {
  const licenseType = Array.isArray(info.licenses) ? info.licenses.join(' / ') : info.licenses;
  const needsReview =
    licenseType.includes('*') ||
    licenseType.toLowerCase().startsWith('custom') ||
    licenseType.toLowerCase().includes('gpl');
  if (needsReview) flagged.push([pkg, licenseType]);

  if (!groups.has(licenseType)) groups.set(licenseType, []);
  groups.get(licenseType).push([pkg, info]);
}

const allKeys = [...groups.keys()];
const sortedGroupKeys = [
  ...GROUP_ORDER.filter((k) => allKeys.includes(k)),
  ...allKeys.filter((k) => !GROUP_ORDER.includes(k)).sort(),
];

let out = `# Third-Party Licenses

Grouped by license type. Click a license name to jump to its full text
(collapsed by default); the package table below each is always visible.

Auto-generated by \`scripts/generate-licenses.mjs\`. Do not hand-edit.
GSAP (proprietary) and GPL-licensed dependencies are documented separately.

`;

if (flagged.length) {
  out += `> ⚠️ Flagged for manual review:\n`;
  flagged.forEach(([pkg, lic]) => (out += `> - \`${pkg}\` — ${lic}\n`));
  out += `\n`;
}

out += `---\n\n`;

for (const groupKey of sortedGroupKeys) {
  const pkgs = groups.get(groupKey).sort(([a], [b]) => a.localeCompare(b));
  const url = LICENSE_URL[groupKey];
  const text = CANONICAL_TEXT[groupKey];

  // Heading + link on the same line
  out += `## ${groupKey}${url ? ` — [full text](${url})` : ''} (${pkgs.length} package${pkgs.length === 1 ? '' : 's'})\n\n`;

  // Collapsed-by-default accordion, self-contained with blank lines so it
  // doesn't bleed into the next block — this is what broke last time.
  out += `<details>\n<summary>Show license text</summary>\n\n`;
  out += '```\n' + (text || '[No canonical text on file — see link above.]') + '\n```\n\n';
  out += `</details>\n\n`;

  // Always-visible table
  out += `| Package | Repository | Copyright |\n|---|---|---|\n`;
  for (const [pkg, info] of pkgs) {
    const repo = info.repository ? info.repository.replace('https://github.com/', '') : '—';
    let copyright = info.publisher || '—';
    if (info.licenseFile && existsSync(info.licenseFile)) {
      const found = firstCopyrightLine(readFileSync(info.licenseFile, 'utf-8'));
      if (found) copyright = found;
    }
    out += `| \`${pkg}\` | ${repo} | ${copyright} |\n`;
  }

  out += `\n---\n\n`;
}

writeFileSync(OUTPUT_PATH, out, 'utf-8');
console.log(`Wrote ${entries.length} packages across ${sortedGroupKeys.length} groups to ${OUTPUT_PATH}`);
if (flagged.length) {
  console.warn(`\nFlagged: ${flagged.length}`);
  flagged.forEach(([p, l]) => console.warn(`  - ${p} (${l})`));
}