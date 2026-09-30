import { describe, expect, it, vi } from "vitest";
import { traiterMessage } from "./mcp.server";

const appelFactice = () => vi.fn(async () => [{ reseau: "facebook" }]) as never;

describe("serveur MCP", () => {
  it("répond à initialize avec la version demandée si elle est connue", async () => {
    const r = await traiterMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, appelFactice());
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } } });
  });

  it("liste les outils sans exposer les schémas internes", async () => {
    const r = (await traiterMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, appelFactice())) as { result: { tools: object[] } };
    expect(r.result.tools.length).toBe(5);
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
});
