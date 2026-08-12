"use client";

// Guarda de rol (route guard) para las áreas protegidas.
//
// El navegador guarda UNA sesión de Supabase por sitio: si el usuario inicia
// sesión con otra cuenta en otra pestaña, las pestañas abiertas quedan con una
// sesión de rol distinto y sus llamadas devuelven 403 (pantallas "rotas").
// Esta guarda valida el rol REAL de la sesión al montar, al recuperar el foco
// y ante cualquier cambio de auth (Supabase lo difunde entre pestañas), y
// redirige al área que corresponde en vez de dejar errores crípticos.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clearMe, fetchMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/client";
import type { Me } from "@/lib/types";

export type Rol = "proveedor" | "farmacia" | "admin";

function rutaDe(me: Me): string {
  if (me.es_admin) return "/admin";
  return me.organizacion?.tipo === "farmacia" ? "/farmacia" : "/proveedor";
}

function rolDe(me: Me): Rol {
  if (me.es_admin) return "admin";
  return me.organizacion?.tipo === "farmacia" ? "farmacia" : "proveedor";
}

/** Valida sesión + rol. Devuelve `true` cuando es seguro renderizar el área. */
export function useRoleGuard(rolEsperado: Rol): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;

    async function validar(refrescar: boolean) {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      if (refrescar) clearMe(); // la sesión pudo cambiar en otra pestaña
      try {
        const me = await fetchMe();
        if (!vivo) return;
        if (rolDe(me) !== rolEsperado) {
          router.replace(rutaDe(me));
          return;
        }
        setReady(true);
      } catch {
        // /me no disponible (red momentánea): dejamos pasar; el backend sigue
        // validando el rol en cada petición.
        if (vivo) setReady(true);
      }
    }

    validar(false);

    // Cambios de sesión (login/logout en esta u otra pestaña).
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") {
        validar(true);
      }
    });
    // Al volver a la pestaña, revalida (cubre navegadores sin broadcast).
    const alFoco = () => validar(true);
    window.addEventListener("focus", alFoco);

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", alFoco);
    };
  }, [router, rolEsperado]);

  return ready;
}
