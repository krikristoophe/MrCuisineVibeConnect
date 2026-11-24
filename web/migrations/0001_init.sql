-- Claudimix : comptes, foyers, robots, recettes, semaine.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  household_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lunch_time TEXT NOT NULL DEFAULT '12:30',
  dinner_time TEXT NOT NULL DEFAULT '19:30',
  created_at INTEGER NOT NULL
);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Un robot appartient à un foyer. Le jeton n'est stocké que haché.
CREATE TABLE robots (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);
CREATE INDEX robots_household ON robots(household_id);

-- Appairage : le robot affiche le code, un membre du foyer le confirme.
CREATE TABLE pairings (
  code TEXT PRIMARY KEY,
  poll_token TEXT NOT NULL UNIQUE,
  household_id TEXT,
  robot_id TEXT,
  robot_token TEXT,
  expires_at INTEGER NOT NULL
);

-- Base de recettes commune à tous les foyers. json = format du robot (core/recipes).
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  search TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  image TEXT,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  uses_robot INTEGER NOT NULL DEFAULT 1,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX recipes_updated ON recipes(updated_at);
CREATE INDEX recipes_category ON recipes(category);

CREATE TABLE favorites (
  household_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, recipe_id)
);

CREATE TABLE cooked (
  household_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, recipe_id)
);

-- Repas de la semaine. leftover_of = « 2026-11-26:soir » quand ce créneau sert les restes d'un autre.
CREATE TABLE meals (
  household_id TEXT NOT NULL,
  day TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('midi', 'soir')),
  recipe_id TEXT NOT NULL,
  leftover_of TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, day, slot)
);

CREATE TABLE shopping_checks (
  household_id TEXT NOT NULL,
  week TEXT NOT NULL,
  item TEXT NOT NULL,
  PRIMARY KEY (household_id, week, item)
);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_user ON push_subscriptions(user_id);

-- Préférences de notification par utilisateur.
CREATE TABLE notify_prefs (
  user_id TEXT PRIMARY KEY,
  finished INTEGER NOT NULL DEFAULT 1,
  action INTEGER NOT NULL DEFAULT 1,
  meals INTEGER NOT NULL DEFAULT 0
);

-- Dernière notification par utilisateur : le service worker la lit (push sans contenu).
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, created_at);

-- Jetons personnels pour le serveur MCP (stockés hachés).
CREATE TABLE api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
