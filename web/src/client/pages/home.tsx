import type { Me } from "../app";

export function Home({ me }: { me: Me }) {
  return (
    <main class="page narrow">
      <p class="muted">Bonjour {me.user.name}</p>
      <h1>{me.household.name}</h1>
      <div class="panel pad stack">
        <p>Vous êtes connecté. L'application complète arrive : accueil, semaine, recettes et favoris.</p>
        <p class="muted">{me.robots.length ? `Robot relié : ${me.robots.map((r) => r.name).join(", ")}` : "Aucun robot relié pour l'instant."}</p>
      </div>
    </main>
  );
}
