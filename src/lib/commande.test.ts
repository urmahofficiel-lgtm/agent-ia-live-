import { describe, expect, it } from "vitest";
import { datePrevue, lirePlan } from "./commande";
import { lireReponseOverpass, requeteOverpass } from "./osm";

describe("lirePlan", () => {
  it("extrait le tableau JSON même entouré de texte", () => {
    const plan = lirePlan(
      'Voici :\n```json\n[{"type":"publication","plateforme":"linkedin","titre":"Post 1","consigne":"x","dans_jours":1,"heure":9}]\n```',
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ type: "publication", plateforme: "linkedin", dans_jours: 1, heure: 9 });
  });

  it("neutralise une plateforme inconnue et un type inconnu (devient une publication)", () => {
    const [t] = lirePlan('[{"type":"danse","plateforme":"myspace","titre":"A"}]');
    expect(t.type).toBe("publication"); // l'agent ne traite que des publications
    expect(t.plateforme).toBeNull();
  });

  it("renvoie une liste vide si la réponse n'est pas du JSON", () => {
    expect(lirePlan("désolé, je ne peux pas")).toEqual([]);
  });
});

describe("datePrevue", () => {
  const maintenant = new Date(2026, 8, 26, 14, 30);
  it("aujourd'hui à une heure passée = tout de suite", () => {
    expect(datePrevue({ type: "publication", titre: "a", consigne: "", dans_jours: 0, heure: 9 }, maintenant)).toBeNull();
  });
  it("dans 2 jours à 10 h", () => {
    const d = datePrevue({ type: "publication", titre: "a", consigne: "", dans_jours: 2, heure: 10 }, maintenant)!;
    expect(d.getDate()).toBe(28);
    expect(d.getHours()).toBe(10);
  });
});

describe("osm", () => {
  it("construit une requête avec la ville échappée", () => {
    const q = requeteOverpass("plombier", 'Saint-"Étienne', 50);
    expect(q).toContain('["craft"="plumber"]');
    expect(q).toContain('Saint-\\"Étienne');
  });

  it("lit les résultats, y compris enveloppés dans du HTML, sans doublons", () => {
    const json = JSON.stringify({
      elements: [
        { type: "node", id: 1, tags: { name: "Dupont Plomberie", phone: "+33 1", "addr:city": "Lyon" } },
        { type: "node", id: 2, tags: { name: "dupont plomberie" } },
        { type: "node", id: 3, tags: { craft: "plumber" } },
      ],
    });
    const r = lireReponseOverpass(`<html><body><p>${json}</p></body></html>`);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nom: "Dupont Plomberie", telephone: "+33 1", adresse: "Lyon", osm_id: "node/1" });
  });

  it("signale un délai dépassé au lieu de répondre « aucun résultat »", () => {
    const panne = JSON.stringify({ elements: [], remark: "runtime error: Query timed out in \"query\" at line 3 after 26 seconds." });
    expect(() => lireReponseOverpass(panne)).toThrow(/saturé/);
    expect(lireReponseOverpass(JSON.stringify({ elements: [] }))).toEqual([]);
  });
});
