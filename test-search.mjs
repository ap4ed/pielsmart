import { readFileSync } from 'fs';

import { execSync } from 'child_process';

// Extract article data from built index.html (same source as the browser uses)
const html = readFileSync('dist/index.html', 'utf8');
const raw = execSync(`python3 -c "
import re, json, sys
html = open('dist/index.html').read()
m = re.search(r'const articlesJson\\\\s*=\\\\s*(\\\".*?\\\");', html, re.DOTALL)
if m:
    print(json.dumps(json.loads(json.loads(m.group(1)))))
"`, { encoding: 'utf8' }).trim();
const articles = JSON.parse(raw);

// Exact same search logic as Header.astro + index.astro
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STOP = new Set('el la los las un una unos unas de del en con para por sin a al me mi mis yo tu te su necesito quiero busco tengo hay es son ser usar utilizar cual cuales como que donde muy mas tanto poco mucho algo mejor mejores bueno buena buenos buenas buen hacer quitar poner aplicar conseguir comprar recomiendas recomienda recomiendo recomiendan probaste probar quito quitas tienes tienen pongo pones ponerse debo deberia tipo tipos clase clases sirve sirven sirva dime cual cuales necesitas necesita quieres quiere viene vienen'.split(' '));

function search(q) {
  if (!q || q.trim().length < 2) return [];
  const terms = normalize(q.trim()).split(/\s+/).filter(t => t.length > 1 && !STOP.has(t));
  if (terms.length === 0) return [];
  const scored = articles.map(a => {
    const hay = normalize(a.title + ' ' + a.description + ' ' + a.pillar + ' ' + (a.keyword || '') + ' ' + (a.tags || ''));
    const matches = terms.filter(t => hay.includes(t)).length;
    return { a, matches };
  }).filter(({ matches }) => matches > 0);
  scored.sort((x, y) => y.matches - x.matches);
  return scored.map(({ a }) => a).slice(0, 5);
}

const queries = [
  // Skincare
  ['que tipo de serum', ['acido hialuronico', 'retinol', 'coreanas']],
  ['serum para la cara', ['acido hialuronico', 'retinol']],
  ['acido hialuronico', ['acido hialuronico']],
  ['para que sirve el retinol', ['retinol']],
  ['crema hidratante', ['crema hidratante']],
  ['crema para cara seca', ['crema hidratante']],
  ['cerave', ['crema hidratante']],
  ['cremas coreanas', ['coreanas']],
  ['kbeauty', ['coreanas']],
  ['cosrx', ['coreanas']],
  ['manchas en la cara', ['retinol']],
  ['antiedad', ['retinol', 'acido hialuronico']],
  ['piel seca', ['acido hialuronico', 'crema hidratante']],
  ['ampolla facial', ['acido hialuronico']],
  ['neutrogena', ['crema hidratante']],

  // Maquillaje
  ['base de maquillaje', ['base']],
  ['base para piel grasa', ['base']],
  ['maybelline', ['base', 'mascaras']],
  ['corrector ojeras', ['correctores']],
  ['sombras de ojos', ['sombras']],
  ['maquillaje sencillo', ['maquillaje sencillo']],
  ['maquillaje paso a paso', ['maquillaje sencillo']],
  ['catrina maquillaje', ['catrina']],
  ['cejas perfectas', ['cejas']],
  ['lapiz de cejas', ['cejas']],
  ['mascara de pestanas', ['mascaras']],
  ['rimel', ['mascaras']],
  ['como maquillarme', ['maquillaje sencillo']],
  ['maquillaje halloween', ['catrina']],
  ['nars foundation', ['base']],

  // Cabello
  ['shampoo', ['shampoo']],
  ['mejor shampoo', ['shampoo']],
  ['shampoo para cabello graso', ['shampoo']],
  ['shampoo kerastase', ['shampoo']],
  ['shampoo sin sulfatos', ['shampoo']],

  // Perfumes
  ['perfume mujer', ['perfumes para mujer']],
  ['perfume hombre', ['perfumes para hombre']],
  ['perfume arabe', ['arabes']],
  ['mejor perfume regalo', ['perfumes para mujer', 'perfumes para hombre']],
  ['fragancias orientales', ['arabes']],
  ['oud', ['arabes']],
  ['perfume barato', ['perfumes para mujer', 'perfumes para hombre']],

  // Uñas
  ['unas acrilico', ['acrilico']],
  ['unas gel', ['gel']],
  ['unas semipermanentes', ['semipermanentes']],
  ['modelos de unas', ['modelos']],
  ['unas 2025', ['modelos']],
  ['kit unas gel', ['gel']],

  // Dispositivos
  ['secadora de pelo', ['secadoras']],
  ['plancha de cabello', ['secadoras']],
  ['dyson', ['secadoras']],
  ['herramientas cabello', ['secadoras']],

  // Conversational / edge cases
  ['quiero un perfume para mi mama', ['perfumes para mujer']],
  ['me salen granos', ['acido hialuronico', 'retinol']],
  ['como quitar manchas', ['retinol']],
  ['regalo para ella', ['perfumes para mujer']],
  ['piel opaca', ['acido hialuronico', 'retinol']],
];

console.log(`Testing ${queries.length} queries against ${articles.length} articles\n`);
console.log('='.repeat(70));

let passed = 0, failed = 0, noResults = 0;
const failures = [];

for (const [q, expectedKeywords] of queries) {
  const results = search(q);
  const titles = results.map(r => r.title.toLowerCase());
  const found = expectedKeywords.some(kw => titles.some(t => t.includes(kw)));

  if (results.length === 0) {
    noResults++;
    failures.push({ q, results: [], expected: expectedKeywords, status: 'NO RESULTS' });
    console.log(`❌ NO RESULTS  "${q}"`);
  } else if (found) {
    passed++;
    console.log(`✅ "${q}" → ${results[0].title}`);
  } else {
    failed++;
    failures.push({ q, results: titles, expected: expectedKeywords, status: 'WRONG' });
    console.log(`⚠️  WRONG      "${q}" → got: ${titles[0]}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`\nResults: ✅ ${passed} passed | ❌ ${noResults} no results | ⚠️  ${failed} wrong`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  "${f.query}" [${f.status}] expected: ${f.expected.join('|')}`);
    if (f.results.length) console.log(`    got: ${f.results.join(', ')}`);
  }
}
