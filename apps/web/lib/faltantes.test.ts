import { describe, expect, it } from "vitest";

import { cajas, faltantesDeOrden } from "./faltantes";
import type { OrdenItem } from "./types";

function item(over: Partial<OrdenItem>): OrdenItem {
  return {
    id: "it-1",
    producto_maestro_id: "pm-1",
    precio_unitario_snapshot: 1000,
    cantidad_solicitada: 10,
    cantidad_aceptada: 10,
    cantidad_no_aceptada: 0,
    estado_item: "aceptado",
    producto: { id: "pm-1", nombre: "Acetaminofén 500mg" },
    ...over,
  };
}

describe("faltantesDeOrden", () => {
  it("orden sin novedades (todo aceptado completo) → sin faltantes", () => {
    expect(faltantesDeOrden([item({})], "aceptada_total")).toEqual([]);
  });

  it("rechazado → sin_stock con todas las cajas como faltante", () => {
    const [f] = faltantesDeOrden(
      [item({ estado_item: "rechazado", cantidad_aceptada: 0 })],
      "rechazada",
    );
    expect(f).toMatchObject({ tipo: "sin_stock", pedidas: 10, aceptadas: 0, faltan: 10 });
  });

  it("parcial → faltan = pedidas - aceptadas", () => {
    const [f] = faltantesDeOrden([item({ cantidad_aceptada: 3 })], "aceptada_parcial");
    expect(f).toMatchObject({ tipo: "parcial", pedidas: 10, aceptadas: 3, faltan: 7 });
  });

  it("mixta: completo + parcial + rechazado → solo los 2 con faltante, en orden", () => {
    const res = faltantesDeOrden(
      [
        item({ id: "a" }),
        item({ id: "b", cantidad_aceptada: 4 }),
        item({ id: "c", estado_item: "rechazado", cantidad_aceptada: 0 }),
      ],
      "aceptada_parcial",
    );
    expect(res.map((f) => [f.itemId, f.tipo])).toEqual([
      ["b", "parcial"],
      ["c", "sin_stock"],
    ]);
  });

  it("orden cancelada → nunca hay faltantes (los ítems quedan pendientes con aceptada=0)", () => {
    const res = faltantesDeOrden(
      [item({ estado_item: "pendiente", cantidad_aceptada: 0 })],
      "cancelada",
    );
    expect(res).toEqual([]);
  });

  it("orden pendiente → sin faltantes aunque los ítems traigan aceptada=0", () => {
    const res = faltantesDeOrden(
      [item({ estado_item: "pendiente", cantidad_aceptada: 0 })],
      "pendiente",
    );
    expect(res).toEqual([]);
  });

  it("ítems pendientes o sustituidos dentro de una orden gestionada no cuentan", () => {
    const res = faltantesDeOrden(
      [
        item({ estado_item: "pendiente", cantidad_aceptada: 0 }),
        item({ estado_item: "sustituido", cantidad_aceptada: 0 }),
      ],
      "aceptada_parcial",
    );
    expect(res).toEqual([]);
  });

  it("datos corruptos: aceptada > solicitada no es faltante; aceptada negativa se acota a 0", () => {
    expect(faltantesDeOrden([item({ cantidad_aceptada: 99 })], "aceptada_total")).toEqual([]);
    const [f] = faltantesDeOrden([item({ cantidad_aceptada: -5 })], "aceptada_parcial");
    expect(f).toMatchObject({ aceptadas: 0, faltan: 10 });
  });

  it("producto nulo → nombre de respaldo, sin romper", () => {
    const [f] = faltantesDeOrden(
      [item({ producto: null, estado_item: "rechazado" })],
      "rechazada",
    );
    expect(f.nombre).toBe("Producto");
  });

  it("despachada/completada conservan el resumen (el faltante sigue siendo informativo)", () => {
    const [f] = faltantesDeOrden([item({ cantidad_aceptada: 3 })], "completada");
    expect(f.tipo).toBe("parcial");
  });
});

describe("cajas (concordancia singular/plural + miles)", () => {
  it("singular", () => expect(cajas(1)).toBe("1 caja"));
  it("plural", () => expect(cajas(7)).toBe("7 cajas"));
  it("cero es plural", () => expect(cajas(0)).toBe("0 cajas"));
  it("miles con punto", () => expect(cajas(1200)).toBe("1.200 cajas"));
});
