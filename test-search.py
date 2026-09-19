import re, json, unicodedata

# Extract articles from built index.html
html = open('dist/index.html').read()
m = re.search(r'const articlesJson\s*=\s*(".*?");', html, re.DOTALL)
articles = json.loads(json.loads(m.group(1)))
print(f"Loaded {len(articles)} articles\n")

# Same stop words as Header.astro
STOP = set('el la los las un una unos unas de del en con para por sin a al me mi mis yo tu te su necesito quiero busco tengo hay es son ser usar utilizar cual cuales como que donde muy mas tanto poco mucho algo mejor mejores bueno buena buenos buenas buen hacer quitar poner aplicar conseguir comprar recomiendas recomienda recomiendo recomiendan probaste probar quito quitas tienes tienen pongo pones ponerse debo deberia tipo tipos clase clases sirve sirven sirva dime cual cuales necesitas necesita quieres quiere viene vienen'.split())

def normalize(s):
    s = s.lower()
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def search(q):
    terms = [t for t in normalize(q.strip()).split() if len(t) > 1 and t not in STOP]
    if not terms:
        return []
    scored = []
    for a in articles:
        hay = normalize(a['title'] + ' ' + a['description'] + ' ' + a['pillar'] + ' ' + a.get('keyword','') + ' ' + a.get('tags',''))
        matches = sum(1 for t in terms if t in hay)
        if matches > 0:
            scored.append((matches, a))
    scored.sort(key=lambda x: -x[0])
    return [a for _, a in scored[:5]]

# (query, list of keywords that should appear in at least one result title/pillar/keyword)
queries = [
    # --- Skincare ---
    ("que tipo de serum",               ["acido hialuronico", "retinol", "coreana"]),
    ("serum para la cara",              ["acido hialuronico", "retinol"]),
    ("acido hialuronico",               ["acido hialuronico"]),
    ("para que sirve el retinol",       ["retinol"]),
    ("crema hidratante cara",           ["crema hidratante"]),
    ("crema para piel seca",            ["crema hidratante", "acido hialuronico"]),
    ("cerave",                          ["crema hidratante"]),
    ("cetaphil",                        ["crema hidratante"]),
    ("la roche posay",                  ["crema hidratante"]),
    ("cremas coreanas",                 ["coreana"]),
    ("kbeauty k-beauty",                ["coreana"]),
    ("cosrx snail",                     ["coreana"]),
    ("manchas en la cara",              ["retinol"]),
    ("antiedad arrugas",                ["retinol", "acido hialuronico"]),
    ("piel opaca sin brillo",           ["acido hialuronico", "retinol"]),
    ("ampolla serum hialuronico",       ["acido hialuronico"]),
    ("laneige",                         ["coreana"]),
    ("innisfree",                       ["coreana"]),

    # --- Maquillaje ---
    ("base de maquillaje",              ["base"]),
    ("base para piel grasa",            ["base"]),
    ("maybelline superstay",            ["base", "mascara"]),
    ("nars foundation",                 ["base"]),
    ("corrector de ojeras",             ["corrector"]),
    ("sombras de ojos",                 ["sombra"]),
    ("maquillaje sencillo",             ["maquillaje sencillo"]),
    ("maquillaje paso a paso",          ["maquillaje sencillo"]),
    ("maquillaje catrina halloween",    ["catrina"]),
    ("cejas perfectas definidas",       ["ceja"]),
    ("lapiz pomada ceja",               ["ceja"]),
    ("mascara de pestanas rimel",       ["mascara", "pesta"]),
    ("como maquillarme para diario",    ["maquillaje sencillo"]),
    ("charlotte tilbury",               ["base"]),
    ("anastasia brow",                  ["ceja"]),

    # --- Cabello ---
    ("shampoo para cabello",            ["shampoo"]),
    ("mejor shampoo cabello graso",     ["shampoo"]),
    ("shampoo sin sulfatos",            ["shampoo"]),
    ("kerastase shampoo",               ["shampoo"]),
    ("head shoulders",                  ["shampoo"]),

    # --- Perfumes ---
    ("perfume para mujer",              ["mujer"]),
    ("perfume para hombre",             ["hombre"]),
    ("perfumes arabes oud",             ["arabe"]),
    ("fragancias orientales",           ["arabe"]),
    ("regalo perfume mama",             ["mujer"]),
    ("carolina herrera",                ["mujer", "hombre"]),
    ("perfume barato bueno",            ["mujer", "hombre"]),

    # --- Uñas ---
    ("unas acrilico en casa",           ["acrilico"]),
    ("unas gel kit",                    ["gel", "unas gel"]),
    ("unas semipermanentes esmalte",    ["semipermanente"]),
    ("modelos de unas 2025",            ["modelos", "unas"]),
    ("diseños de unas bonitas",         ["modelos", "unas"]),

    # --- Dispositivos ---
    ("secadora de pelo profesional",    ["secadora", "plancha"]),
    ("plancha de cabello",              ["plancha", "secadora"]),
    ("herramientas cabello calor",      ["secadora", "plancha"]),
    ("dyson airwrap",                   ["secadora", "plancha"]),

    # --- Conversational ---
    ("quiero un perfume para regalar",  ["mujer", "hombre", "arabe"]),
    ("me salen granos acne",            ["acido hialuronico", "retinol"]),
    ("como quitar manchas oscuras",     ["retinol"]),
    ("regalo para ella belleza",        ["mujer", "base", "sombra"]),
    ("que me pongo en la cara",         ["crema hidratante", "acido hialuronico"]),
]

print(f"{'QUERY':<42} {'TOP RESULT':<35} STATUS")
print("="*90)

passed = failed = no_results = 0
failures = []

for q, expected_kws in queries:
    results = search(q)
    if not results:
        no_results += 1
        failures.append((q, "NO RESULTS", expected_kws, []))
        print(f"❌ {q:<42} {'—':<35} NO RESULTS")
        continue

    top = results[0]
    haystack = (top['title'] + top['pillar'] + top.get('keyword','') + top.get('tags','')).lower()
    norm_hay = normalize(haystack)
    found = any(normalize(kw) in norm_hay for kw in expected_kws)

    if found:
        passed += 1
        short = top['title'][:33] + ('…' if len(top['title'])>33 else '')
        print(f"✅ {q:<42} {short:<35}")
    else:
        failed += 1
        short = top['title'][:33] + ('…' if len(top['title'])>33 else '')
        failures.append((q, "WRONG RESULT", expected_kws, [r['title'] for r in results]))
        print(f"⚠️  {q:<42} {short:<35} WRONG")

print("="*90)
print(f"\n✅ {passed} passed  |  ❌ {no_results} no results  |  ⚠️  {failed} wrong  |  Total: {len(queries)}")

if failures:
    print("\nFailed queries:")
    for q, status, exp, got in failures:
        print(f"  [{status}] \"{q}\"")
        print(f"    Expected one of: {exp}")
        if got:
            print(f"    Got: {got[:3]}")
