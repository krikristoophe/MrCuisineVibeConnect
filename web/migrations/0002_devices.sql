-- Robots compatibles (« MC2.0 » = Monsieur Cuisine Connect, « MC3.0 » = Smart), séparés par des virgules.
ALTER TABLE recipes ADD COLUMN devices TEXT NOT NULL DEFAULT '';
UPDATE recipes SET devices = COALESCE((SELECT group_concat(value) FROM json_each(recipes.json, '$.devices')), '');
-- « Au robot » = étapes avec réglages ET faisable sur le Connect.
UPDATE recipes SET uses_robot = 0 WHERE devices != '' AND devices NOT LIKE '%MC2.0%';
