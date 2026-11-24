#!/usr/bin/env python3
"""Catégorie principale d'une recette : le site Monsieur Cuisine donne souvent plusieurs catégories
(« Plats principaux » puis « Dessert » pour un riz au lait) et l'import gardait la première. On garde
la plus précise ; les autres restent dans les tags.

Usage : python3 -I scripts/primary_category.py <export.json de wrangler (id, category, tags)> <sortie.sql>
"""
import json, sys, time

# Du plus précis au plus général. Ce qui n'est pas listé (cuisine du monde, végétarien…) reste un tag.
PRIORITY = ["Aliments pour bébé", "Boissons", "Confitures & gelées", "Petit-déjeuner", "Sauces et dips", "Dessert",
            "Soupes & potées", "Salades", "Entrées", "Garnitures", "Plats principaux", "Dîner", "Recettes au four", "Snacks"]

def primary(category, tags):
    names = [category] + tags if category else list(tags)
    known = [n for n in names if n in PRIORITY]
    return min(known, key=PRIORITY.index) if known else category

rows = json.load(open(sys.argv[1]))[0]["results"]
now = int(time.time() * 1000)
n = 0
with open(sys.argv[2], "w", encoding="utf-8") as f:
    for r in rows:
        tags = json.loads(r["tags"] or "[]")
        best = primary(r["category"], tags)
        if best == r["category"]:
            continue
        new_tags = [t for t in ([r["category"]] if r["category"] else []) + tags if t != best]
        q = lambda s: "'" + s.replace("'", "''") + "'"
        f.write(f"UPDATE recipes SET category = {q(best)}, json = json_set(json, '$.category', {q(best)}, '$.tags', json({q(json.dumps(new_tags, ensure_ascii=False))})), updated_at = {now + n} WHERE id = {q(r['id'])};\n")
        n += 1
print(f"{n} recettes changent de catégorie")
