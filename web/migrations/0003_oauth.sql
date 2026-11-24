-- Connexion OAuth 2.1 des assistants IA au serveur MCP (enregistrement dynamique des clients, PKCE).
CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Jetons d'accès (1 h) et de renouvellement (90 jours), stockés hachés.
CREATE TABLE oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX oauth_tokens_user ON oauth_tokens(user_id);

-- Les jetons personnels ne servent plus.
DROP TABLE api_tokens;
