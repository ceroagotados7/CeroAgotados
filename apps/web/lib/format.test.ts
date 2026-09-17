import { describe, expect, it } from "vitest";

import { cop, etiquetaOrden, miles, milesInput, soloDigitos } from "./format";

// El design system es es-CO: el separador de miles es el punto.
describe("miles", () => {
  it("no toca números de 3 dígitos o menos", () => {
    expect(miles(0)).toBe("0");
    expect(miles(7)).toBe("7");
    expect(miles(999)).toBe("999");
  });

  it("pone el punto desde 1.000 (regla del fundador: automático al pasar el monto)", () => {
    expect(miles(1000)).toBe("1.000");
    expect(miles(24149)).toBe("24.149");
    expect(miles(1250000)).toBe("1.250.000");
    expect(miles(999999999)).toBe("999.999.999");
  });

  it("aguanta valores no finitos sin romper la UI", () => {
    expect(miles(NaN)).toBe("0");
    expect(miles(Infinity)).toBe("0");
    expect(miles(-Infinity)).toBe("0");
  });

  it("negativos y decimales: signo conservado, sin decimales", () => {
    // Ningún flujo de la app produce negativos, pero un dato corrupto de la
    // API no debe pintar basura.
    expect(miles(-1200)).toBe("-1.200");
    expect(miles(1200.4)).toBe("1.200");
    expect(miles(1200.5)).toBe("1.201");
  });
});

describe("soloDigitos", () => {
  it("extrae dígitos de textos formateados o pegados", () => {
    expect(soloDigitos("1.250.000")).toBe("1250000");
    expect(soloDigitos("$ 1,250,000 COP")).toBe("1250000");
    expect(soloDigitos("12 500")).toBe("12500");
  });

  it("devuelve vacío cuando no hay dígitos", () => {
    expect(soloDigitos("")).toBe("");
    expect(soloDigitos("abc-!·")).toBe("");
  });

  it("no interpreta separadores decimales: solo conserva dígitos", () => {
    // Comportamiento documentado del input: "24000.5" tecleado → 240005.
    // Por eso quien inicializa el input debe redondear antes (EditCard lo hace).
    expect(soloDigitos("24000.5")).toBe("240005");
  });
});

describe("milesInput (lo que se pinta dentro del input mientras se escribe)", () => {
  it("vacío se queda vacío (sin un '0' fantasma)", () => {
    expect(milesInput("")).toBe("");
    expect(milesInput("abc")).toBe("");
  });

  it("formatea mientras se escribe", () => {
    expect(milesInput("1")).toBe("1");
    expect(milesInput("1250")).toBe("1.250");
    expect(milesInput("1250000")).toBe("1.250.000");
  });

  it("re-formatea un pegado con separadores de otra convención", () => {
    expect(milesInput("1,250,000")).toBe("1.250.000");
    expect(milesInput("$1.250.000")).toBe("1.250.000");
  });

  it("normaliza ceros a la izquierda", () => {
    expect(milesInput("007")).toBe("7");
    expect(milesInput("0")).toBe("0");
    expect(milesInput("000")).toBe("0");
  });
});

describe("cop (no debe romperse con los nuevos helpers al lado)", () => {
  it("sigue formateando COP sin decimales", () => {
    // Intl puede usar espacio duro entre símbolo y cifra: comparamos sin él.
    expect(cop(1250000).replace(/\s/g, "")).toBe("$1.250.000");
    expect(cop(0).replace(/\s/g, "")).toBe("$0");
  });
});

// ---------------------------------------------------------------------------
// etiquetaOrden (2026-09-17)
//
// `estado` por sí solo no basta: la RPC deja la orden en 'completada' tanto si
// la farmacia la recibió conforme como si la rechazó entera, y el distribuidor
// veía el mismo badge verde en los dos casos. Pasó con ORD-0017 en producción.
// ---------------------------------------------------------------------------
describe("etiquetaOrden", () => {
  it("una entrega conforme sigue siendo Completada en verde", () => {
    expect(etiquetaOrden("completada", "aceptada")).toEqual({
      label: "Completada",
      tone: "green",
    });
  });

  it("un rechazo parcial se distingue: Completada con novedades, en ámbar", () => {
    expect(etiquetaOrden("completada", "no_aceptada_parcial")).toEqual({
      label: "Completada con novedades",
      tone: "amber",
    });
  });

  it("un rechazo total se llama por su nombre y va en rojo", () => {
    expect(etiquetaOrden("completada", "no_aceptada_total")).toEqual({
      label: "Entrega rechazada",
      tone: "red",
    });
  });

  it("una completada sin veredicto aún no inventa novedades", () => {
    expect(etiquetaOrden("completada", null).label).toBe("Completada");
    expect(etiquetaOrden("completada").label).toBe("Completada");
  });

  it("el veredicto solo manda sobre 'completada', no sobre los demás estados", () => {
    // Una orden despachada nunca tiene recepción, pero si la tuviera no debe
    // cambiar de etiqueta: el estado del flujo manda mientras no esté cerrada.
    expect(etiquetaOrden("despachada", "no_aceptada_total").label).toBe("Despachada");
  });

  it("mantiene las etiquetas y tonos de los demás estados", () => {
    expect(etiquetaOrden("pendiente")).toEqual({ label: "Pendiente", tone: "amber" });
    expect(etiquetaOrden("aceptada_parcial")).toEqual({ label: "Aceptada parcial", tone: "amber" });
    expect(etiquetaOrden("aceptada_total")).toEqual({ label: "Aceptada", tone: "green" });
    expect(etiquetaOrden("rechazada")).toEqual({ label: "Rechazada", tone: "red" });
    expect(etiquetaOrden("cancelada")).toEqual({ label: "Cancelada", tone: "gray" });
  });

  it("un estado desconocido no pinta 'undefined'", () => {
    // La vista del proveedor indexaba los mapas a pelo y eso era justo lo que
    // pasaba si algún día se añadía un estado nuevo.
    expect(etiquetaOrden("estado_del_futuro")).toEqual({
      label: "estado_del_futuro",
      tone: "gray",
    });
  });
});
