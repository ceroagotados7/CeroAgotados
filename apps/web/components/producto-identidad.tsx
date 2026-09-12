// Bloque de identidad de un producto — el mismo en toda la app.
//
// Existe porque cada pantalla lo armaba a mano y cada una olvidaba un campo
// distinto (ver el encabezado de lib/producto.ts). Con un solo componente, un
// campo nuevo aparece en las 11 vistas a la vez o en ninguna.
//
// Propuesta B (fundador, 2026-09-11): título con la concentración pegada al
// nombre, molécula debajo solo si aporta, y forma · presentación · laboratorio.
//
// El texto NUNCA se trunca ni se recorta: el reporte del caso Basilox fue
// exactamente eso, información del producto tapada. Si no cabe, envuelve.

import { clsx } from "clsx";

import {
  detalleProducto,
  moleculaProducto,
  tituloProducto,
  type ProductoIdentificable,
} from "@/lib/producto";

type Size = "md" | "sm";

const TITULO: Record<Size, string> = {
  md: "text-[14.5px]",
  sm: "text-[13.5px]",
};

const SECUNDARIA: Record<Size, string> = {
  md: "text-[12px]",
  sm: "text-[11.5px]",
};

export function IdentidadProducto({
  producto,
  fallback = "Producto",
  size = "md",
  mostrarMolecula = true,
  className,
  tituloClassName,
}: {
  producto: ProductoIdentificable | null | undefined;
  /** Texto si el producto no viene (ítem cuyo maestro fue removido). */
  fallback?: string;
  size?: Size;
  /** El principio activo sobra donde ya se filtró por molécula. */
  mostrarMolecula?: boolean;
  className?: string;
  /** Para estados sobre el título (p. ej. tachado de un ítem rechazado). */
  tituloClassName?: string;
}) {
  const p = producto ?? {};
  const molecula = mostrarMolecula ? moleculaProducto(p) : null;
  const detalle = detalleProducto(p);

  return (
    <div className={clsx("min-w-0", className)}>
      <p className={clsx(TITULO[size], "font-semibold leading-tight", tituloClassName)}>
        {tituloProducto(p, fallback)}
      </p>
      {molecula && (
        <p className={clsx("mt-0.5 font-medium leading-tight text-slate-600", SECUNDARIA[size])}>
          {molecula}
        </p>
      )}
      {detalle && (
        <p className={clsx("mt-0.5 leading-tight text-muted", SECUNDARIA[size])}>{detalle}</p>
      )}
    </div>
  );
}
