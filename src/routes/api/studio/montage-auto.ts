import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { demanderIA, genererImage } from "@/lib/ia.server";
import { lireSite } from "@/lib/site.server";
import { voixOff } from "@/lib/voix.server";
import { tonVoix } from "@/lib/marches";
import { photo } from "@/lib/pexels.server";
import { clientMoteur } from "@/lib/supabase-serveur";
import { monterMontage, preparerMedias } from "@/lib/montage.server";
import { genererClipIA, moteursDisponibles } from "@/lib/video-ia.server";
import { MODELES, appliquerModele, consignePlan, dureesScenes, lirePlan, type Modele, type PlanMontage } from "@/lib/montage";

// Montage complet sans intervention (moteur, secret requis) : plan écrit par
// l'IA à partir d'un lien, vraies vidéos IA (Wan 2.2) pour les scènes clés,
// voix off, sous-titres, effets, puis dépôt de la vidéo dans le dossier de
// l'utilisateur. Sert aux essais et aux vidéos de démonstration.
const entree = z.object({
  user: z.string().uuid(),
  lien: z.string().url(),
  sujet: z.string().max(300).optional(),
  contexte: z.string().max(8000).nullable().optional(),
  modele: z.enum(MODELES.map((m) => m.id) as [Modele, ...Modele[]]).default("viral"),
  ia: z.number().int().min(0).max(3).default(2),
  duree: z.number().int().min(15).max(45).default(25),
  // Plan déjà écrit (sinon l'IA l'écrit d'après le lien).
  plan: z.unknown().optional(),
});

export const Route = createFileRoute("/api/studio/montage-auto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const attendu = process.env.AGENT_TICK_SECRET ?? "";
        const secret = request.headers.get("x-agent-secret") ?? "";
        if (!attendu || secret !== attendu) return new Response("Non autorisé", { status: 401 });
        const debut = Date.now();
        const journal: string[] = [];
        const note = (m: string) => journal.push(`${Math.round((Date.now() - debut) / 1000)} s · ${m}`);
        try {
          const e = entree.parse(await request.json());

          // 1. Plan de montage écrit par l'IA d'après le site.
          const site = e.plan ? null : await lireSite(e.lien).catch(() => null);
          const extrait = (site?.pages ?? []).map((p) => [p.titre, p.description, p.texte].filter(Boolean).join("\n")).join("\n---\n").slice(0, 4000);
          let plan: PlanMontage | null = e.plan ? lirePlan(e.plan) : null;
          for (let essai = 0; essai < 2 && !plan; essai++) {
            try {
              plan = lirePlan(
                await demanderIA(consignePlan({ lien: e.lien, sujet: e.sujet, extrait }, e.contexte ?? null, e.duree), {
                  systeme: "Tu es monteur vidéo expert des réseaux sociaux. Tu réponds uniquement en JSON valide.",
                  maxTokens: 3000,
                  delaiTotal: 50_000,
                }),
              );
            } catch (x) {
              note(`plan, essai ${essai + 1} : ${x instanceof Error ? x.message : x}`);
            }
          }
          if (!plan) return Response.json({ ok: false, erreur: "plan illisible", journal });
          plan = appliquerModele(plan, e.modele);
          note(`plan : ${plan.scenes.length} scènes, modèle ${e.modele}`);

          // 2. Voix off et durées.
          const voix = await voixOff(plan.scenes.map((s) => s.phrase).join(" "), tonVoix(null, true), plan.voix).catch(() => null);
          const d = dureesScenes(plan.scenes, voix?.duree);
          note(voix ? `voix ${voix.duree.toFixed(1)} s` : "voix indisponible : sans voix");

          // 3. Scènes clés en vraie vidéo IA (celles choisies par l'IA, sinon
          // l'accroche puis le milieu), en même temps que les autres médias.
          const wan = moteursDisponibles().some((m) => m.id === "wan");
          const choisies = plan.scenes.flatMap((s, i) => (s.source === "ia_video" ? [i] : []));
          for (const i of [0, Math.floor(plan.scenes.length / 2)]) if (!choisies.includes(i)) choisies.push(i);
          const cles = wan ? choisies.slice(0, e.ia) : [];
          const clips = new Map<number, Buffer>();
          const p = plan;
          const [medias] = await Promise.all([
            preparerMedias(p.scenes, d, [], debut + 170_000, note),
            (async () => {
              for (const i of cles) {
                if (Date.now() - debut > 150_000) break;
                const s = p.scenes[i];
                try {
                  const image =
                    (s.recherche ? await photo(s.recherche, "portrait").catch(() => null) : null) ??
                    Buffer.from((await genererImage(`${s.prompt || s.recherche}. Vertical 9:16 composition, realistic photo, no text.`, "tiktok")).base64, "base64");
                  clips.set(i, await genererClipIA("wan", image, s.mouvement || s.prompt || s.recherche, Math.min(5, d[i]), 110_000));
                  note(`vidéo IA Wan pour la scène ${i + 1}`);
                } catch (x) {
                  note(`vidéo IA scène ${i + 1} impossible : ${x instanceof Error ? x.message : x}`);
                }
              }
            })(),
          ]);
          for (const [i, clip] of clips) {
            medias[i] = { clip };
            // Un clip IA dure 5 s au plus : un léger ralenti couvre une scène plus longue.
            plan.scenes[i] = { ...plan.scenes[i], source: "ia_video", vitesse: d[i] > 5 ? 0.75 : 1 };
          }

          // 4. Montage et dépôt dans le dossier de l'utilisateur.
          const mp4 = await monterMontage(plan, medias, d, voix);
          note(`montage ${(mp4.length / 1e6).toFixed(1)} Mo`);
          const sb = clientMoteur();
          const { data: ticket, error } = await sb.rpc("agent_depot_video", { p_secret: secret, p_user: e.user });
          if (error || !ticket) throw new Error("Dépôt de la vidéo refusé.");
          const chemin = `${e.user}/auto-${ticket as string}/studio-${e.modele}-${Date.now()}.mp4`;
          const { error: errDepot } = await sb.storage.from("videos").upload(chemin, mp4, { contentType: "video/mp4" });
          if (errDepot) throw new Error(`Enregistrement impossible : ${errDepot.message}`);
          const video_url = sb.storage.from("videos").getPublicUrl(chemin).data.publicUrl;
          return Response.json({ ok: true, video_url, plan, clips_ia: clips.size, secondes: Math.round((Date.now() - debut) / 1000), journal });
        } catch (x) {
          return Response.json({ ok: false, erreur: x instanceof Error ? x.message : String(x), journal, secondes: Math.round((Date.now() - debut) / 1000) });
        }
      },
    },
  },
});
