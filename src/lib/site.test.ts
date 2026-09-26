import { describe, expect, it } from "vitest";
import { estAdressePrivee, lirePage, normaliserLien } from "./site";

describe("estAdressePrivee", () => {
  it("bloque les adresses internes", () => {
    for (const ip of ["127.0.0.1", "10.2.3.4", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(estAdressePrivee(ip)).toBe(true);
    }
  });
  it("laisse passer les adresses publiques", () => {
    expect(estAdressePrivee("76.76.21.21")).toBe(false);
    expect(estAdressePrivee("2606:4700::1111")).toBe(false);
  });
});

describe("normaliserLien", () => {
  it("ajoute https:// et retire l'ancre", () => {
    expect(normaliserLien("monsite.fr/produit#avis").toString()).toBe("https://monsite.fr/produit");
  });
  it("refuse localhost et les protocoles exotiques", () => {
    expect(() => normaliserLien("http://localhost:3000")).toThrow();
    expect(() => normaliserLien("file:///etc/passwd")).toThrow();
  });
});

describe("lirePage", () => {
  const html = `<html><head><title>Plomberie Martin &amp; Fils</title>
    <meta name="description" content="Dépannage 7j/7 à Lyon"><script>var x=1</script><style>.a{}</style></head>
    <body><nav><a href="/a-propos">À propos</a><a href="/tarifs">Tarifs</a><a href="https://autre.fr/services">x</a><a href="/blog">Blog</a></nav>
    <h1>Votre plombier à Lyon</h1><p>Intervention en 1 h.</p><p>Intervention en 1 h.</p></body></html>`;
  const page = lirePage(html, new URL("https://martin.fr/"));

  it("extrait titre, description et texte sans scripts ni doublons", () => {
    expect(page.titre).toBe("Plomberie Martin & Fils");
    expect(page.description).toBe("Dépannage 7j/7 à Lyon");
    expect(page.texte).toContain("Votre plombier à Lyon");
    expect(page.texte).not.toContain("var x");
    expect(page.texte.match(/Intervention en 1 h\./g)).toHaveLength(1);
  });

  it("ne garde que les pages utiles du même site", () => {
    expect(page.liens).toEqual(["https://martin.fr/a-propos", "https://martin.fr/tarifs"]);
  });
});
