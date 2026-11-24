export interface Env {
  DB: D1Database;
  ROBOT: DurableObjectNamespace;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_JWK: string;
  VAPID_SUBJECT: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  household_id: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: User } };
