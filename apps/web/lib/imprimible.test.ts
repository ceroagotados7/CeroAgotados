import { describe, expect, it } from "vitest";

import { valorizarOrden } from "./imprimible";
import type { Orden, OrdenItem } from "./types";

function item(over: Partial<OrdenItem>): OrdenItem {
  return {
    id: "it-1",
    producto_maestro_id: "pm-1",
    precio_unitario_snapshot: 1000,
    cantidad_solicitada: 10,
    cantidad_aceptada: 0,
    estado_item: "pendiente",
    producto: {
      id: "pm-1",
      nombre: "Acetaminofén 500mg",
      forma_farmaceutica: "Tableta",
      presentacion: "Caja x 100",
      laboratorio: "Genfar",
    },
    ...over,
  };
}

function orden(estado: Orden["estado"], items: OrdenItem[]): Orden {
  return {
    id: "o-1",
    codigo: "ORD-1",
    farmacia_id: "f",
    proveedor_id: "p",
    estado,
    total: 0,
    created_at: "2026-09-05T00:00:00Z",
    items,
  };
}

describe("valorizarOrden (hoja imprimible cotejeable contra la factura)", () => {
  it("pendiente → valoriza lo SOLICITADO (lo que se verifica en bodega)", () => {
    const v = valorizarOrden(orden("pendiente", [item({}), item({ id: "it-2", cantidad_solicitada: 3, precio_unitario_snapshot: 500 })]));
    expect(v.gestionada).toBe(false);
    expect(v.filas.map((f) => f.subtotal)).toEqual([10_000, 1_500]);
    expect(v.total).toBe(11_500);
  });

  it("aceptada parcial → valoriza lo ACEPTADO (lo que se factura)", () => {
    const v = valorizarOrden(
      orden("aceptada_parcial", [
        item({ estado_item: "aceptado", cantidad_aceptada: 10 }), // completo
        item({ id: "it-2", estado_item: "aceptado", cantidad_aceptada: 4 }), // parcial
        item({ id: "it-3", estado_item: "rechazado", cantidad_aceptada: 0 }), // sin stock
      ]),
    );
    expect(v.gestionada).toBe(true);
    expect(v.filas.map((f) => f.cantidad)).toEqual([10, 4, 0]);
    expect(v.filas.map((f) => f.subtotal)).toEqual([10_000, 4_000, 0]);
    expect(v.total).toBe(14_000); // el rechazado no infla la factura
  });

  it("rechazada completa → total 0 (nada que facturar)", () => {
    const v = valorizarOrden(orden("rechazada", [item({ estado_item: "rechazado" })]));
    expect(v.total).toBe(0);
  });

  it("cancelada → vuelve a lo solicitado (los ítems quedan pendientes en 0)", () => {
    const v = valorizarOrden(orden("cancelada", [item({})]));
    expect(v.gestionada).toBe(false);
    expect(v.total).toBe(10_000);
  });

  it("despachada y completada valorizan lo aceptado (coincide con la factura)", () => {
    for (const estado of ["despachada", "completada"] as const) {
      const v = valorizarOrden(orden(estado, [item({ estado_item: "aceptado", cantidad_aceptada: 7 })]));
      expect(v.gestionada).toBe(true);
      expect(v.total).toBe(7_000);
    }
  });

  it("datos corruptos acotados: aceptada > solicitada o negativa no descuadra", () => {
    const v = valorizarOrden(
      orden("aceptada_total", [
        item({ estado_item: "aceptado", cantidad_aceptada: 99 }),
        item({ id: "it-2", estado_item: "aceptado", cantidad_aceptada: -5 }),
      ]),
    );
    expect(v.filas.map((f) => f.cantidad)).toEqual([10, 0]);
    expect(v.total).toBe(10_000);
  });

  it("producto nulo → respaldos sin romper la hoja", () => {
    const v = valorizarOrden(orden("pendiente", [item({ producto: null })]));
    expect(v.filas[0].nombre).toBe("Producto");
    expect(v.filas[0].presentacion).toBe("—");
    expect(v.filas[0].laboratorio).toBe("—");
  });
});
