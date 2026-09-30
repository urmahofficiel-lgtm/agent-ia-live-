import { describe, expect, it, vi } from "vitest";
import { traiterMessage } from "./mcp.server";

vi.mock("./prospection.server", () => ({
  chercherEntreprises: vi.fn(async () => [{ nom: "Boulangerie Martin", email: null, telephone: "04 78 00 00 00", site: null, adresse: null, osm_id: "node/1" }]),
  redigerMessageProspect: vi.fn(async () => ({ genre: "premier", canal: "message", objet: "", texte: "Bonjour…\n\nRépondez STOP pour ne plus être contacté." })),
}));

const ID = "7c0e0c3e-8a3b-4b8e-9d7a-2f6b1c1d2e3f";
const appeler = (name: string, args: object, appel: unknown) =>
  traiterMessage({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }, appel as never);

const appelFactice = () => vi.fn(async () => [{ reseau: "facebook" }]) as never;

describe("serveur MCP", () => {
  it("répond à initialize avec la version demandée si elle est connue", async () => {
    const r = await traiterMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, appelFactice());
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } } });
  });

  it("liste les outils sans exposer les schémas internes", async () => {
    const r = (await traiterMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, appelFactice())) as { result: { tools: object[] } };
    expect(r.result.tools.length).toBe(11);
    expect(r.result.tools.every((o) => (o as { name: string }).name.startsWith("agent_"))).toBe(true);
    expect(r.result.tools[0]).not.toHaveProperty("executer");
  });

  it("refuse des paramètres invalides avec un message clair", async () => {
    const r = await traiterMessage(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "agent_creer_publication", arguments: { sujet: "Promo", reseaux: ["myspace"] } } },
      appelFactice(),
    );
    expect(r).toMatchObject({ result: { isError: true } });
  });

  it("transmet les bons paramètres à la base", async () => {
    const appel = vi.fn(async () => [{ id: "x", reseau: "facebook" }]);
    await traiterMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "agent_creer_publication", arguments: { sujet: "Nos chantiers de la semaine", reseaux: ["facebook", "facebook"] } } },
      appel as never,
    );
    expect(appel).toHaveBeenCalledWith("mcp_creer_publication", expect.objectContaining({ p_reseaux: ["facebook"], p_valider: false }));
  });

  it("ignore les notifications", async () => {
    expect(await traiterMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, appelFactice())).toBeNull();
  });

  it("prospects : refuse une catégorie, un statut ou un identifiant invalides", async () => {
    const appel = vi.fn();
    expect(await appeler("agent_chercher_prospects", { categorie: "licorne", ville: "Lyon" }, appel)).toMatchObject({ result: { isError: true } });
    expect(await appeler("agent_marquer_prospect", { id: ID, statut: "envoye" }, appel)).toMatchObject({ result: { isError: true } });
    expect(await appeler("agent_rediger_message_prospect", { id: "123" }, appel)).toMatchObject({ result: { isError: true } });
    expect(await appeler("agent_prospects", { filtre: "tous" }, appel)).toMatchObject({ result: { isError: true } });
    expect(appel).not.toHaveBeenCalled();
  });

  it("prospects : la recherche passe par OpenStreetMap puis la base", async () => {
    const appel = vi.fn(async () => ({ trouves: 1, ajoutes: 1 }));
    await appeler("agent_chercher_prospects", { categorie: "boulangerie", ville: " Lyon " }, appel);
    expect(appel).toHaveBeenCalledWith(
      "mcp_ajouter_prospects",
      expect.objectContaining({ p_categorie: "Boulangeries", p_ville: "Lyon", p_liste: [expect.objectContaining({ osm_id: "node/1" })] }),
    );
  });

  it("prospects : la rédaction enregistre un brouillon et renvoie des liens, sans rien envoyer", async () => {
    const appel = vi.fn(async (fonction: string) =>
      fonction === "mcp_prospect_a_rediger"
        ? { id: ID, nom: "Boulangerie Martin", email: null, telephone: "04 78 00 00 00", genre: "premier" }
        : {},
    );
    const r = (await appeler("agent_rediger_message_prospect", { id: ID }, appel)) as { result: { structuredContent: { envoyer_avec: { type: string }[] } } };
    expect(appel).toHaveBeenCalledWith("mcp_enregistrer_brouillon_prospect", expect.objectContaining({ p_id: ID }));
    expect(r.result.structuredContent.envoyer_avec.map((l) => l.type)).toContain("whatsapp");
  });

  it("prospects : marquer transmet le statut et la note", async () => {
    const appel = vi.fn(async () => ({ id: ID, statut: "contacte" }));
    await appeler("agent_marquer_prospect", { id: ID, statut: "contacte" }, appel);
    expect(appel).toHaveBeenCalledWith("mcp_marquer_prospect", { p_id: ID, p_statut: "contacte", p_contenu: null });
  });

  it("statistiques : lecture seule, période bornée", async () => {
    const appel = vi.fn(async () => ({ periode_jours: 30, apprentissage: null, par_reseau: [], publications: [] }));
    const liste = (await traiterMessage({ jsonrpc: "2.0", id: 5, method: "tools/list" }, appelFactice())) as {
      result: { tools: { name: string; annotations: { readOnlyHint?: boolean } }[] };
    };
    expect(liste.result.tools.find((o) => o.name === "agent_statistiques")?.annotations.readOnlyHint).toBe(true);
    await appeler("agent_statistiques", {}, appel);
    expect(appel).toHaveBeenCalledWith("mcp_statistiques", { p_jours: 30 });
    expect(await appeler("agent_statistiques", { jours: 365 }, appel)).toMatchObject({ result: { isError: true } });
    expect(appel).toHaveBeenCalledTimes(1);
  });

  it("pilote : sans paramètre, lit les réglages sans rien changer", async () => {
    const appel = vi.fn(async () => ({ actif: false }));
    await appeler("agent_pilote", {}, appel);
    expect(appel).toHaveBeenCalledWith("mcp_pilote", { p_actif: null, p_rythme: null, p_creneaux: null });
  });

  it("pilote : transmet l'activation, le rythme et des créneaux triés", async () => {
    const appel = vi.fn(async () => ({ actif: true }));
    await appeler("agent_pilote", { actif: true, rythme: { linkedin: 1, tiktok: 3 }, creneaux: ["18:30", "08:30", "08:30"] }, appel);
    expect(appel).toHaveBeenCalledWith("mcp_pilote", { p_actif: true, p_rythme: { linkedin: 1, tiktok: 3 }, p_creneaux: ["08:30", "18:30"] });
  });

  it("pilote : refuse un rythme hors limites, un réseau non pilotable ou une heure invalide", async () => {
    const appel = vi.fn();
    expect(await appeler("agent_pilote", { rythme: { facebook: 6 } }, appel)).toMatchObject({ result: { isError: true } });
    expect(await appeler("agent_pilote", { rythme: { gmail: 2 } }, appel)).toMatchObject({ result: { isError: true } });
    expect(await appeler("agent_pilote", { rythme: { facebook_profil: 2 } }, appel)).toMatchObject({ result: { isError: true } });
    expect(await appeler("agent_pilote", { creneaux: ["25:00"] }, appel)).toMatchObject({ result: { isError: true } });
    expect(await appeler("agent_pilote", { creneaux: [] }, appel)).toMatchObject({ result: { isError: true } });
    expect(appel).not.toHaveBeenCalled();
  });
});
