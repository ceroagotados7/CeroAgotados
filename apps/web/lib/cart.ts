"use client";

// Carrito del pedido de la farmacia (f3/f4). Vive en localStorage: sobrevive
// recargas y no necesita backend hasta confirmar (ahí se vuelve órdenes reales).
// El proveedor de cada línea es SOLO el alias anónimo que entrega la API.

import { useEffect, useState } from "react";

export type CartItem = {
  oferta_id: string;
  producto_id: string;
  nombre: string;
  presentacion: string;
  proveedor_alias: string;
  precio: number;
  stock: number;
  cantidad: number;
};

const KEY = "ca-pedido-v1";
const EVENT = "ca-cart-changed";

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as CartItem[];
  } catch {
    return [];
  }
}

function write(items: CartItem[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(item: CartItem): void {
  const items = read().filter((i) => i.oferta_id !== item.oferta_id);
  items.push(item);
  write(items);
}

export function removeFromCart(ofertaId: string): void {
  write(read().filter((i) => i.oferta_id !== ofertaId));
}

export function setCantidad(ofertaId: string, cantidad: number): void {
  write(read().map((i) => (i.oferta_id === ofertaId ? { ...i, cantidad } : i)));
}

export function clearCart(): void {
  write([]);
}

/** Hook reactivo: el carrito actual, sincronizado entre pantallas. */
export function useCart(): CartItem[] {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
}
