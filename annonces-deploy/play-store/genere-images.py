# Okazo : images de la fiche Google Play (19/11/2026).
#   python annonces-deploy/play-store/genere-images.py
# Produit dans annonces-deploy/play-store/fr-FR/ :
#   icon.png            512 x 512, carré plein (Google arrondit lui-même les coins)
#   featureGraphic.png  1024 x 500, bannière
#   phoneScreenshots/NN.png  1080 x 1920 : chaque capture de captures-brutes/ (NN-légende.png) posée sur fond bleu,
#                            légende en haut. Google refuse les images de plus de 2:1, or les captures du téléphone
#                            font 1080 x 2340 : elles sont réduites dans un cadre.
import os
import re
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
KABA = os.path.dirname(os.path.dirname(ICI))
SORTIE = os.path.join(ICI, "fr-FR")
FONTS = os.path.join(KABA, "mobile", "node_modules", "@expo-google-fonts", "outfit")
ICONE = os.path.join(KABA, "Maquettes", "okazo", "okazo-icone-arrondie-1024.png")

BLEU_CLAIR = (24, 110, 254)
BLEU_FONCE = (0, 32, 120)


def police(graisse, taille):
    return ImageFont.truetype(os.path.join(FONTS, graisse, f"Outfit_{graisse}.ttf"), taille)


def degrade(w, h):
    """Dégradé diagonal du bleu vif (haut gauche) au bleu marine (bas droite), comme l'icône."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w + y / h) / 2
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(BLEU_CLAIR, BLEU_FONCE))
    return img


def icone_carree(taille):
    """L'icône en carré plein : posée sur le même dégradé (plus de coins transparents), puis agrandie de 8 %
    pour couper le liseré clair du bord du logo provisoire (découpé dans la maquette)."""
    src = Image.open(ICONE).convert("RGBA")
    fond = degrade(1024, 1024).convert("RGBA")
    fond.alpha_composite(src)
    marge = round(1024 * 0.04)
    return fond.crop((marge, marge, 1024 - marge, 1024 - marge)).convert("RGB").resize((taille, taille), Image.LANCZOS)


def icone_pleine():
    return icone_carree(512)


def banniere():
    w, h = 1024, 500
    img = degrade(w, h).convert("RGBA")
    ico = icone_carree(300).convert("RGBA")
    coins = Image.new("L", (300, 300), 0)
    ImageDraw.Draw(coins).rounded_rectangle((0, 0, 299, 299), radius=66, fill=255)
    ico.putalpha(coins)
    ombre = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ombre.paste((0, 0, 30, 110), (90, 112, 390, 412), ico)
    img.alpha_composite(ombre.filter(ImageFilter.GaussianBlur(14)))
    img.alpha_composite(ico, (80, 100))
    d = ImageDraw.Draw(img)
    d.text((430, 120), "Okazo", font=police("800ExtraBold", 132), fill="white")
    d.text((436, 290), "Achetez · Vendez", font=police("600SemiBold", 44), fill="white")
    d.text((436, 348), "Près de chez vous", font=police("500Medium", 40), fill=(205, 222, 255))
    return img.convert("RGB")


def capture(chemin, legende):
    w, h = 1080, 1920
    img = degrade(w, h).convert("RGBA")
    d = ImageDraw.Draw(img)
    f = police("700Bold", 64)
    # Légende centrée ; si elle ne tient pas sur une ligne, deux lignes de longueur proche (jamais un mot seul)
    mots = legende.split()
    lignes = [legende]
    if d.textlength(legende, font=f) > w - 140:
        coupe = min(range(1, len(mots)), key=lambda i: abs(d.textlength(" ".join(mots[:i]), font=f) - d.textlength(" ".join(mots[i:]), font=f)))
        lignes = [" ".join(mots[:coupe]), " ".join(mots[coupe:])]
    y = 90
    for l in lignes:
        d.text(((w - d.textlength(l, font=f)) / 2, y), l, font=f, fill="white")
        y += 80
    ecran = Image.open(chemin).convert("RGB")
    hauteur = h - y - 60 - 40
    largeur = round(ecran.width * hauteur / ecran.height)
    ecran = ecran.resize((largeur, hauteur), Image.LANCZOS)
    x0, y0 = (w - largeur) // 2, y + 50
    masque = Image.new("L", ecran.size, 0)
    ImageDraw.Draw(masque).rounded_rectangle((0, 0, largeur - 1, hauteur - 1), radius=44, fill=255)
    ombre = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ombre.paste((0, 0, 30, 120), (x0 + 6, y0 + 14), masque)
    img.alpha_composite(ombre.filter(ImageFilter.GaussianBlur(18)))
    img.paste(ecran, (x0, y0), masque)
    return img.convert("RGB")


if __name__ == "__main__":
    os.makedirs(os.path.join(SORTIE, "phoneScreenshots"), exist_ok=True)
    icone_pleine().save(os.path.join(SORTIE, "icon.png"))
    banniere().save(os.path.join(SORTIE, "featureGraphic.png"))
    brutes = os.path.join(ICI, "captures-brutes")
    for ancien in os.listdir(os.path.join(SORTIE, "phoneScreenshots")):
        os.remove(os.path.join(SORTIE, "phoneScreenshots", ancien))
    for nom in sorted(os.listdir(brutes)):
        m = re.match(r"(\d+)-(.+)\.(png|jpe?g)$", nom)
        if m:
            capture(os.path.join(brutes, nom), m.group(2)).save(os.path.join(SORTIE, "phoneScreenshots", f"{m.group(1)}.png"))
    print("Images prêtes dans", SORTIE)
