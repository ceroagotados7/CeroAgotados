"use client";

// Input numérico con separador de miles en vivo (feedback del fundador:
// "poner visualmente el punto de miles en todas las visuales").
// Un <input type="number"> nativo no puede mostrar "1.250.000", así que este
// componente es type="text" + inputMode="numeric": el padre guarda SOLO
// dígitos ("1250000") y aquí se pinta formateado ("1.250.000").

import { useLayoutEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";

import { milesInput, soloDigitos } from "@/lib/format";

/** Tope de dígitos: evita desbordar Number y precios/stock absurdos. */
const MAX_DIGITOS = 9;

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  /** Valor crudo, solo dígitos (p. ej. "1250000"). "" = vacío. */
  value: string;
  /** Recibe el nuevo valor crudo, solo dígitos. */
  onChange: (digits: string) => void;
};

export function InputMiles({ value, onChange, className, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  // Cuántos dígitos quedan a la izquierda del cursor tras el último cambio:
  // así el cursor no salta al final al insertar los puntos.
  const digitosAntesDelCursor = useRef<number | null>(null);

  const mostrado = milesInput(value);

  useLayoutEffect(() => {
    const el = ref.current;
    const n = digitosAntesDelCursor.current;
    if (!el || n == null || document.activeElement !== el) return;
    let pos = 0;
    let vistos = 0;
    while (pos < el.value.length && vistos < n) {
      if (/\d/.test(el.value[pos])) vistos += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
    digitosAntesDelCursor.current = null;
  }, [mostrado]);

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={mostrado}
      onChange={(e) => {
        const el = e.target;
        const caret = el.selectionStart ?? el.value.length;
        digitosAntesDelCursor.current = soloDigitos(el.value.slice(0, caret)).length;
        onChange(soloDigitos(el.value).slice(0, MAX_DIGITOS));
      }}
    />
  );
}
