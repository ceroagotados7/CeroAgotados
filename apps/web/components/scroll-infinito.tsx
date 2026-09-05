"use client";

// Scroll infinito (feedback del equipo: nada de "ver más, ver más, ver más").
// Un sentinel invisible al final de la lista: cuando entra al viewport,
// dispara onMore y el padre carga la página siguiente. El padre es quien
// guarda el estado de carga y evita disparos duplicados; el rootMargin alto
// precarga ANTES de que el usuario llegue al fondo, para que no vea el corte.

import { useEffect, useRef } from "react";

export function ScrollInfinito({
  onMore,
  cargando,
}: {
  /** Pide la página siguiente. Debe ser idempotente mientras `cargando`. */
  onMore: () => void;
  cargando: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // El observer vive una sola vez; el callback siempre ve el onMore vigente.
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center py-4">
      {cargando ? (
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary"
          role="status"
          aria-label="Cargando más resultados"
        />
      ) : (
        // Fallback accesible (y para entornos sin IntersectionObserver):
        // el mismo gesto queda disponible como botón discreto.
        <button
          type="button"
          onClick={() => onMoreRef.current()}
          className="text-[12.5px] font-semibold text-muted"
        >
          Cargar más
        </button>
      )}
    </div>
  );
}
