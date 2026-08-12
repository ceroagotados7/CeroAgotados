"use client";

// Piezas de estructura (shell) del área autenticada: app bar por pantalla,
// barra con "atrás" para sub-pantallas y bottom-nav de 4 tabs.
// Mobile-first y responsive: el contenido vive en una columna fluida centrada.
import { ArrowLeft, BarChart3, ClipboardList, Factory, LayoutDashboard, PiggyBank, Pill, Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/api";

/** App bar genérica (cada pantalla compone su contenido). */
export function AppBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <header className={`appbar ${className}`}>{children}</header>;
}

/** App bar de sub-pantalla: botón atrás + título (+ subtítulo opcional). */
export function BackBar({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
}) {
  const router = useRouter();
  return (
    <AppBar>
      {backHref ? (
        <Link href={backHref} className="icon-btn" aria-label="Volver">
          <ArrowLeft size={19} />
        </Link>
      ) : (
        <button className="icon-btn" aria-label="Volver" onClick={() => router.back()}>
          <ArrowLeft size={19} />
        </button>
      )}
      <div className="min-w-0">
        {subtitle && <p className="mb-1 text-[12px] leading-none text-muted">{subtitle}</p>}
        <p className="truncate font-display text-[18px] font-extrabold leading-none">{title}</p>
      </div>
    </AppBar>
  );
}

const TABS = [
  { href: "/proveedor", label: "Inicio", icon: LayoutDashboard },
  { href: "/proveedor/catalogo", label: "Catálogo", icon: Pill },
  { href: "/proveedor/ordenes", label: "Órdenes", icon: ClipboardList },
  { href: "/proveedor/cuenta", label: "Cuenta", icon: User },
];

// Tabs del rol farmacia (f1–f6): buscar, pedido en curso, seguimiento, cuenta.
const TABS_FARMACIA = [
  { href: "/farmacia", label: "Buscar", icon: Search },
  { href: "/farmacia/pedido", label: "Pedido", icon: ShoppingCart },
  { href: "/farmacia/pedidos", label: "Mis pedidos", icon: ClipboardList },
  { href: "/farmacia/cuenta", label: "Cuenta", icon: User },
];

// Tabs del rol admin (a1–a3 + bandeja de verificación).
const TABS_ADMIN = [
  { href: "/admin", label: "Resumen", icon: BarChart3 },
  { href: "/admin/proveedores", label: "Proveedores", icon: Factory },
  { href: "/admin/ganancias", label: "Ganancias", icon: PiggyBank },
  { href: "/admin/cuenta", label: "Cuenta", icon: User },
];

// Rutas que son "tab principal" y por tanto muestran el bottom-nav.
const MAIN_TAB_HREFS = new Set([...TABS, ...TABS_FARMACIA, ...TABS_ADMIN].map((t) => t.href));

/** ¿La ruta actual es una tab principal (muestra bottom-nav) o una sub-pantalla? */
export function isMainTab(pathname: string): boolean {
  return MAIN_TAB_HREFS.has(pathname);
}

/** Evento para forzar el refresco del punto rojo (p. ej. tras marcar visto). */
export const EVENTO_BADGE = "ca-badge-refresh";
export function refrescarBadge(): void {
  window.dispatchEvent(new Event(EVENTO_BADGE));
}

/** Conteo de notificaciones del rol (punto rojo). Se refresca al montar, al
 *  volver el foco a la pestaña, cada 30 s y ante EVENTO_BADGE.
 *  Proveedor: órdenes pendientes. Farmacia: pedidos respondidos sin leer.
 *  Admin: proveedores en revisión. */
function usePendientes(rol: "proveedor" | "farmacia" | "admin"): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    const tick = () => {
      const consulta =
        rol === "proveedor"
          ? api.get<{ pendientes: number }>("/ordenes/resumen").then((d) => d.pendientes)
          : rol === "farmacia"
            ? api.get<{ novedades: number }>("/farmacia/resumen").then((d) => d.novedades)
            : api
                .get<{ proveedores_en_revision: number }>("/admin/resumen")
                .then((d) => d.proveedores_en_revision);
      consulta.then((v) => vivo && setN(v)).catch(() => {});
    };
    tick();
    const cada30s = setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    window.addEventListener(EVENTO_BADGE, tick);
    return () => {
      vivo = false;
      clearInterval(cada30s);
      window.removeEventListener("focus", tick);
      window.removeEventListener(EVENTO_BADGE, tick);
    };
  }, [rol]);
  return n;
}

/** Bottom-nav flotante de 4 tabs, constreñido a la columna móvil. */
export function BottomNav({ rol = "proveedor" }: { rol?: "proveedor" | "farmacia" | "admin" }) {
  const pathname = usePathname();
  const pendientes = usePendientes(rol);
  const tabs = rol === "farmacia" ? TABS_FARMACIA : rol === "admin" ? TABS_ADMIN : TABS;
  const home = rol === "farmacia" ? "/farmacia" : rol === "admin" ? "/admin" : "/proveedor";
  return (
    <nav className="bottomnav fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === home ? pathname === href : pathname.startsWith(href);
        const conBadge =
          (href === "/proveedor/ordenes" || href === "/admin/proveedores" || href === "/farmacia/pedidos") &&
          pendientes > 0;
        return (
          <Link key={href} href={href} className={`navitem ${active ? "active" : ""}`}>
            <span className="relative">
              <Icon />
              {conBadge && (
                <span
                  className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white"
                  aria-label={`${pendientes} pendientes`}
                >
                  {pendientes > 9 ? "9+" : pendientes}
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
