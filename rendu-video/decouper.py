#!/usr/bin/env python3
"""Photos « papier découpé » : détoure le sujet (rembg, local, gratuit), ajoute un
contour blanc épais et une ombre portée, écrit un PNG transparent.

Usage : python3 decouper.py <dossier> photo1.jpg photo2.jpg ...
Écrit photo1.png, photo2.png… dans <dossier>. Une photo dont le détourage est
inutilisable (sujet introuvable ou toute l'image) est ignorée : la vidéo montre
alors une icône à la place. Code de sortie toujours 0 ; une ligne par photo.
"""
import os
import sys

from PIL import Image, ImageFilter

COTE_MAX = 700  # taille de la découpe, bordure comprise
BORDURE = 16


def part_du_plus_gros_morceau(masque):
    """Part du sujet tenue par son plus gros morceau d'un seul tenant (0 à 1).
    Un détourage raté laisse des débris éparpillés : cette part est alors faible."""
    petit = masque.copy()
    petit.thumbnail((160, 160))
    l, h = petit.size
    px = petit.load()
    vu = [[False] * h for _ in range(l)]
    total, plus_gros = 0, 0
    for x0 in range(l):
        for y0 in range(h):
            if vu[x0][y0] or px[x0, y0] < 128:
                continue
            pile, n = [(x0, y0)], 0
            vu[x0][y0] = True
            while pile:
                x, y = pile.pop()
                n += 1
                for a, b in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= a < l and 0 <= b < h and not vu[a][b] and px[a, b] >= 128:
                        vu[a][b] = True
                        pile.append((a, b))
            total += n
            plus_gros = max(plus_gros, n)
    return plus_gros / total if total else 0.0


def decouper(chemin_entree, chemin_sortie, session):
    from rembg import remove

    im = Image.open(chemin_entree).convert("RGB")
    im.thumbnail((1100, 1100))
    sujet = remove(im, session=session)  # RGBA
    alpha = sujet.split()[3]
    boite = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    if not boite:
        return "sujet introuvable"
    couverture = sum(alpha.histogram()[41:]) / (im.width * im.height)
    # Un sujet fin (une tour, une grue) occupe peu de place : seul « rien » ou « tout » est refusé.
    if couverture < 0.01 or couverture > 0.97:
        return f"détourage inutilisable (couverture {couverture:.0%})"
    # Sujet « fantôme » (à moitié transparent) : le modèle n'a pas su trancher.
    h = alpha.histogram()
    nette = sum(h[201:]) / max(1, sum(h[41:]))
    if nette < 0.7:
        return f"détourage flou ({nette:.0%} net)"
    part = part_du_plus_gros_morceau(alpha.point(lambda v: 255 if v > 40 else 0))
    if part < 0.8:
        return f"détourage en morceaux ({part:.0%} d'un seul tenant)"
    sujet = sujet.crop(boite)
    k = (COTE_MAX - 2 * (BORDURE + 20)) / max(sujet.size)
    sujet = sujet.resize((max(1, int(sujet.width * k)), max(1, int(sujet.height * k))), Image.LANCZOS)

    pad = BORDURE + 20
    toile = Image.new("RGBA", (sujet.width + 2 * pad, sujet.height + 2 * pad), (0, 0, 0, 0))
    toile.paste(sujet, (pad, pad), sujet)
    a = toile.split()[3].point(lambda v: 255 if v > 90 else 0)
    for _ in range(BORDURE // 4):  # contour qui épouse la silhouette
        a = a.filter(ImageFilter.MaxFilter(9))
    a = a.filter(ImageFilter.GaussianBlur(1.8)).point(lambda v: 255 if v > 110 else 0)
    # Comble les creux étroits (entre deux poteaux, sous une arche) : une découpe aux ciseaux.
    a = a.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))

    blanc = Image.new("RGBA", toile.size, (252, 252, 248, 255))
    blanc.putalpha(a)
    ombre = Image.new("RGBA", toile.size, (40, 25, 10, 0))
    ombre.putalpha(a.filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * 0.45)))
    sortie = Image.new("RGBA", toile.size, (0, 0, 0, 0))
    sortie.alpha_composite(ombre, (8, 12))
    sortie.alpha_composite(blanc)
    sortie.alpha_composite(toile)
    sortie.save(chemin_sortie)
    return None


def main():
    dossier, *photos = sys.argv[1:]
    if not photos:
        return
    from rembg import new_session

    session = new_session("u2net")
    for nom in photos:
        base = os.path.splitext(nom)[0]
        try:
            erreur = decouper(os.path.join(dossier, nom), os.path.join(dossier, base + ".png"), session)
        except Exception as e:  # photo illisible, mémoire…
            erreur = f"échec ({type(e).__name__}: {str(e)[:100]})"
        print(f"{nom} : {'ok' if erreur is None else 'ignorée, ' + erreur}", flush=True)


if __name__ == "__main__":
    main()
