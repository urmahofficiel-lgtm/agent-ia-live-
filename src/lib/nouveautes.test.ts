import { describe, expect, it } from "vitest";
import { consigneNouveaute, lirePage, pagesFonctionnalites, publicationsNouveaute } from "./nouveautes";

describe("annonce des nouveautés", () => {
  it("ne garde que les pages de fonctionnalités du site", () => {
    const xml = `<urlset>
      <url><loc>https://www.btp-ecosystem.com/</loc></url>
      <url><loc>https://www.btp-ecosystem.com/fonctionnalites/devis-ia</loc></url>
      <url><loc> https://btp-ecosystem.com/fonctionnalites/connecteur-ia/ </loc></url>
      <url><loc>https://www.btp-ecosystem.com/fonctionnalites/devis-ia</loc></url>
      <url><loc>https://autre.fr/fonctionnalites/x</loc></url>
      <url><loc>https://www.btp-ecosystem.com/fonctionnalites/a/b</loc></url>
    </urlset>`;
    expect(pagesFonctionnalites(xml)).toEqual([
      "https://www.btp-ecosystem.com/fonctionnalites/devis-ia",
      "https://www.btp-ecosystem.com/fonctionnalites/connecteur-ia",
    ]);
  });

  it("lit le titre, la description et le texte principal", () => {
    const html = `<title>Connecteur IA&nbsp;: ChatGPT | BTP Ecosystem</title>
      <meta name="description" content="Branchez ChatGPT, Claude ou Le Chat.">
      <nav>Menu</nav><main><h1>Votre IA, <span>branchée sur vos chantiers</span></h1>
      <script>var x = 1;</script><p>${"Le connecteur relie votre assistant à votre compte. ".repeat(6)}</p></main>`;
    const p = lirePage("https://www.btp-ecosystem.com/fonctionnalites/connecteur-ia", html);
    expect(p?.titre).toBe("Votre IA, branchée sur vos chantiers");
    expect(p?.description).toBe("Branchez ChatGPT, Claude ou Le Chat.");
    expect(p?.contenu).not.toContain("var x");
    expect(p?.contenu).not.toContain("Menu");
    expect(lirePage("u", "<main><h1>Vide</h1></main>")).toBeNull();
  });

  it("rédige d'après la page seulement, avec le bon lien", () => {
    const p = { url: "https://www.btp-ecosystem.com/fonctionnalites/x", titre: "X", description: "d", contenu: "c" };
    expect(consigneNouveaute(p, "linkedin")).toContain("fonctionnalites/x?utm_source=linkedin");
    expect(consigneNouveaute(p, "tiktok")).toContain("lien en bio");
    expect(consigneNouveaute(p, "tiktok")).toContain("UNIQUEMENT");
  });

  it("planifie TikTok et Instagram le lendemain, LinkedIn le mardi ou jeudi suivant", () => {
    const p = { url: "https://www.btp-ecosystem.com/fonctionnalites/x", titre: "X", description: "d", contenu: "c" };
    // Vendredi 6 novembre 2026, 20 h à Paris.
    const l = publicationsNouveaute(p, new Date("2026-11-06T19:00:00Z"));
    expect(l.map((x) => [x.plateforme, x.planifiee_pour, x.carrousel])).toEqual([
      ["tiktok", "2026-11-07T11:10:00.000Z", true],
      ["instagram", "2026-11-07T11:20:00.000Z", true],
      ["linkedin", "2026-11-10T07:40:00.000Z", false],
    ]);
    expect(l[0].titre).toBe("Nouveau : X");
  });
});
