"use client";

// Piezas de estructura (shell) del área autenticada: app bar por pantalla,
// barra con "atrás" para sub-pantallas y bottom-nav de 4 tabs.
// Mobile-first y responsive: el contenido vive en una columna fluida centrada.
import { ArrowLeft, ClipboardList, LayoutDashboard, Pill, Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

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

// Rutas que son "tab principal" y por tanto muestran el bottom-nav.
const MAIN_TAB_HREFS = new Set([...TABS, ...TABS_FARMACIA].map((t) => t.href));

/** ¿La ruta actual es una tab principal (muestra bottom-nav) o una sub-pantalla? */
export function isMainTab(pathname: string): boolean {
  return MAIN_TAB_HREFS.has(pathname);
}

/** Bottom-nav flotante de 4 tabs, constreñido a la columna móvil. */
export function BottomNav({ rol = "proveedor" }: { rol?: "proveedor" | "farmacia" }) {
  const pathname = usePathname();
  const tabs = rol === "farmacia" ? TABS_FARMACIA : TABS;
  const home = rol === "farmacia" ? "/farmacia" : "/proveedor";
  return (
    <nav className="bottomnav fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === home ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`navitem ${active ? "active" : ""}`}>
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
