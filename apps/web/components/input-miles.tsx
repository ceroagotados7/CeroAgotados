"use client";

// Input numérico con separador de miles en vivo (feedback del fundador:
// "poner visualmente el punto de miles en todas las visuales").
// Un <input type="number"> nativo no puede mostrar "1.250.000", así que este
// componente es type="text" + inputMode="numeric": el padre guarda SOLO
// dígitos ("1250000") y aquí se pinta formateado ("1.250.000").
//
// ---------------------------------------------------------------------------
// CONTRATO DE EDICIÓN (reescrito 2026-09-11 por el reporte del equipo:
// "presionaba en la casilla y la borraba, y seguía quedando cualquier otro
// número; si escribe 7 deben ser 7, no 70")
//
// El problema NO era el formateo, era que el campo no se podía vaciar. Los
// padres hacían `Number(d || 1)` y acotaban en cada tecla, así que:
//   · al borrar todo, un "1" se reinyectaba solo y el usuario terminaba
//     escribiendo sobre él ("17", "71");
//   · si el valor acotado coincidía con el que ya había, React no re-renderizaba
//     y el DOM se quedaba mostrando lo tecleado aunque el estado fuera otro.
//
// Reglas nuevas, y el padre ya no debe acotar por tecla:
//   1. Al enfocar se SELECCIONA todo: tocas y escribes 7 → es 7.
//   2. El campo se puede dejar vacío mientras se edita. Vacío NO se emite:
//      el padre conserva su último valor y ninguna vista cambia de estado a
//      media escritura (una cantidad en 0 significaba "sin stock" y hacía
//      desaparecer el propio campo).
//   3. Mientras se escribe se emite el valor tal cual, sin acotar, para que
//      subtotales y avisos se actualicen en vivo.
//   4. Al SALIR del campo se acota a [min, max] y se emite ya corregido. Si se
//      salió en vacío, se restaura el último valor del padre.
//   5. El DOM se resincroniza con el estado en cada render: nunca puede quedar
//      mostrando un número distinto del que el padre tiene.
// ---------------------------------------------------------------------------

import { useLayoutEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";

import { acotar, milesInput, soloDigitos } from "@/lib/format";

/** Tope de dígitos: evita desbordar Number y precios/stock absurdos. */
const MAX_DIGITOS = 9;

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  /** Valor crudo, solo dígitos (p. ej. "1250000"). "" = vacío. */
  value: string;
  /** Recibe el nuevo valor crudo, solo dígitos. Nunca recibe "". */
  onChange: (digits: string) => void;
  /** Mínimo aplicado AL SALIR del campo (no por tecla). */
  min?: number;
  /** Máximo aplicado AL SALIR del campo (no por tecla). */
  max?: number;
};

export function InputMiles({ value, onChange, className, min, max, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  // Cuántos dígitos quedan a la izquierda del cursor tras el último cambio:
  // así el cursor no salta al final al insertar los puntos.
  const digitosAntesDelCursor = useRef<number | null>(null);
  // Texto que el usuario está escribiendo. null = no está editando (se muestra
  // el valor del padre). "" = lo vació a propósito y aún no ha salido.
  const [borrador, setBorrador] = useState<string | null>(null);

  const mostrado = borrador != null ? milesInput(borrador) : milesInput(value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Resincronizar el DOM con el estado. Sin esto, cuando el padre devuelve el
    // mismo valor que ya tenía (porque acotó), React no re-renderiza y el campo
    // se queda mostrando lo que el usuario tecleó.
    if (el.value !== mostrado) el.value = mostrado;

    const n = digitosAntesDelCursor.current;
    if (n == null || document.activeElement !== el) return;
    let pos = 0;
    let vistos = 0;
    while (pos < el.value.length && vistos < n) {
      if (/\d/.test(el.value[pos])) vistos += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
    digitosAntesDelCursor.current = null;
  });

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={mostrado}
      onFocus={(e) => {
        // Seleccionar todo: el usuario toca la casilla y escribe encima.
        e.target.select();
        props.onFocus?.(e);
      }}
      onChange={(e) => {
        const el = e.target;
        const caret = el.selectionStart ?? el.value.length;
        digitosAntesDelCursor.current = soloDigitos(el.value.slice(0, caret)).length;
        const digits = soloDigitos(el.value).slice(0, MAX_DIGITOS);
        setBorrador(digits);
        // Vacío NO se emite: el padre conserva su valor y nada cambia de estado
        // mientras se reescribe.
        if (digits !== "") onChange(digits);
      }}
      onBlur={(e) => {
        const digits = borrador;
        setBorrador(null);
        if (digits != null && digits !== "") {
          const corregido = acotar(Number(digits), min, max);
          if (String(corregido) !== digits) onChange(String(corregido));
        } else if (digits === "") {
          // Salió en vacío: se restaura lo que el padre ya tenía, acotado.
          const actual = value === "" ? (min ?? 0) : Number(value);
          onChange(String(acotar(actual, min, max)));
        }
        props.onBlur?.(e);
      }}
    />
  );
}
