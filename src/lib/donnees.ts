import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type { Reglages } from "./types";
import { lireStyleImage, lireStyleVideo, type StyleImage, type StyleVideo } from "./styles";

export const REGLAGES_DEFAUT: Reglages = {
  agent_actif: false,
  validation_requise: true,
  mode: "prudent",
  limite_contacts_jour: 20,
};

export function useUserId() {
  return useAuth().session?.user.id ?? null;
}

// Charge une requête et expose `recharger` ; volontairement minimal tant que
// l'app n'a que quelques écrans.
export function useRequete<T>(charger: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async () => {
    const { data, error } = await charger();
    setErreur(error?.message ?? null);
    setData(data);
    setChargement(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  return { data, erreur, chargement, recharger };
}

export function useReglages() {
  const userId = useUserId();
  const req = useRequete<Reglages>(
    () => supabase().from("reglages_agent").select("agent_actif, validation_requise, mode, limite_contacts_jour").maybeSingle(),
    [userId],
  );

  const enregistrer = async (valeurs: Partial<Reglages>) => {
    if (!userId) return "Non connecté";
    const { error } = await supabase()
      .from("reglages_agent")
      .upsert({ user_id: userId, ...(req.data ?? REGLAGES_DEFAUT), ...valeurs });
    await req.recharger();
    return error?.message ?? null;
  };

  return { reglages: req.data ?? REGLAGES_DEFAUT, erreur: req.erreur, enregistrer };
}

// Styles créatifs par défaut (Réglages), lus à part : tant que la migration
// qui ajoute ces colonnes n'est pas appliquée, `etat` vaut « absent » et les
// styles valent classique / photo.
export function useStylesParDefaut() {
  const userId = useUserId();
  const req = useRequete<{ style_video: string | null; style_image: string | null }>(
    () => supabase().from("reglages_agent").select("style_video, style_image").maybeSingle(),
    [userId],
  );

  const enregistrer = async (valeurs: { style_video?: StyleVideo; style_image?: StyleImage }) => {
    if (!userId) return "Non connecté";
    const { error } = await supabase()
      .from("reglages_agent")
      .upsert({ user_id: userId, ...valeurs });
    await req.recharger();
    return error?.message ?? null;
  };

  return {
    video: lireStyleVideo(req.data?.style_video),
    image: lireStyleImage(req.data?.style_image),
    etat: req.erreur ? "absent" : req.chargement ? "chargement" : "ok",
    enregistrer,
  };
}

// Pilote automatique (Réglages), lu à part comme les styles : `etat` vaut
// « absent » tant que la migration qui ajoute ces colonnes n'est pas appliquée.
export type ReglagesPilote = { autopilote: boolean; rythme: Record<string, number>; creneaux: string[] };

const RYTHME_VIDE: Record<string, number> = {};

export function usePilote() {
  const userId = useUserId();
  const req = useRequete<{ autopilote: boolean | null; rythme: Record<string, number> | null; creneaux: string[] | null }>(
    () => supabase().from("reglages_agent").select("autopilote, rythme, creneaux").maybeSingle(),
    [userId],
  );

  const enregistrer = async (valeurs: Partial<ReglagesPilote>) => {
    if (!userId) return "Non connecté";
    const { error } = await supabase()
      .from("reglages_agent")
      .upsert({ user_id: userId, ...valeurs });
    await req.recharger();
    return error?.message ?? null;
  };

  return {
    pilote: {
      autopilote: req.data?.autopilote ?? false,
      rythme: req.data?.rythme ?? RYTHME_VIDE,
      creneaux: req.data?.creneaux ?? null,
    },
    etat: req.erreur ? "absent" : req.chargement ? "chargement" : "ok",
    enregistrer,
  };
}
