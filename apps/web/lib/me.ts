"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

// Cache a nivel de módulo: /me se pide una vez por sesión y se reusa en las
// app bars de todas las pantallas (se limpia al recargar o cerrar sesión).
let cache: Promise<Me> | null = null;

export function fetchMe(): Promise<Me> {
  if (!cache) cache = api.get<Me>("/me/");
  return cache;
}

export function clearMe(): void {
  cache = null;
}

/** Hook para obtener la organización/perfil del proveedor actual. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let active = true;
    fetchMe()
      .then((m) => active && setMe(m))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return me;
}
