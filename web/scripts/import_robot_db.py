#!/usr/bin/env python3
"""Génère un fichier SQL d'import des recettes : base du robot (recettes.db) ou export JSONL du
catalogue (android/core/src/test/.../CatalogExport.kt, une recette par ligne).

Usage : python3 -I scripts/import_robot_db.py <recettes.db | catalogue.jsonl> <sortie.sql>
puis    npx wrangler d1 execute claudimix --remote --file <sortie.sql>

Les recettes déjà présentes ne sont pas écrasées (INSERT OR IGNORE) : les modifications faites
dans Claudimix sont gardées. Le fichier généré contient du contenu Lidl : ne jamais le commiter.
"""
import json, sqlite3, sys, time, unicodedata

def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()

# Même règle que primary_category.py : la catégorie la plus précise, les autres en tags.
PRIORITY = ["Aliments pour bébé", "Boissons", "Confitures & gelées", "Petit-déjeuner", "Sauces et dips", "Dessert",
            "Soupes & potées", "Salades", "Entrées", "Garnitures", "Plats principaux", "Dîner", "Recettes au four", "Snacks"]

def fix_category(r):
    cat, tags = r.get("category", ""), r.get("tags", [])
    known = [n for n in ([cat] if cat else []) + tags if n in PRIORITY]
    if known:
        best = min(known, key=PRIORITY.index)
        if best != cat:
            r["tags"] = [t for t in ([cat] if cat else []) + tags if t != best]
            r["category"] = best

def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

src, out = sys.argv[1], sys.argv[2]

def rows():
    if src.endswith(".jsonl"):
        with open(src, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    yield (line,)
    else:
        yield from sqlite3.connect(src).execute("SELECT json FROM recipes")

now = int(time.time() * 1000)
n = 0
with open(out, "w", encoding="utf-8") as f:
    for (raw,) in rows():
        r = json.loads(raw)
        if not r.get("id") or not r.get("title"):
            continue
        fix_category(r)
        ing = " ".join(i.get("name", "") for g in r.get("ingredients", []) for i in g.get("items", []))
        search = fold(" ".join([r["title"], r.get("category", ""), " ".join(r.get("tags", [])), ing]))
        devices = [d for d in r.get("devices", []) if isinstance(d, str)]
        uses = 1 if any(s.get("machine") for s in r.get("steps", [])) and (not devices or "MC2.0" in devices) else 0
        r.pop("favorite", None)
        vals = [r["id"], r["title"], search, r.get("category", ""), r.get("image"), int(r.get("totalMinutes") or 0),
                float(r.get("rating") or 0), int(r.get("ratingCount") or 0), uses, ",".join(devices), json.dumps(r, ensure_ascii=False), now + n]  # dates distinctes : curseur de synchro du robot
        f.write("INSERT OR IGNORE INTO recipes (id, title, search, category, image, total_minutes, rating, rating_count, uses_robot, devices, json, updated_at) VALUES ("
                + ", ".join(q(v) for v in vals) + ");\n")
        n += 1
print(f"{n} recettes -> {out}")
