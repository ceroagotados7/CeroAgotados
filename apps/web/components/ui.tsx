import { clsx } from "clsx";
import { Search } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Botones — variantes y tamaños del design system (assets/app.css).   */
/* ------------------------------------------------------------------ */
type BtnVariant = "primary" | "teal" | "ghost" | "outline" | "dark";
type BtnSize = "lg" | "md" | "sm";

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  block?: boolean;
}) {
  return (
    <button
      className={clsx("btn", `btn-${variant}`, `btn-${size}`, block && "btn-block", className)}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Cards. El padding lo pone quien la usa (el diseño varía p-3.5/p-4/p-5). */
/* ------------------------------------------------------------------ */
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFlat({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("card-flat", className)} {...props}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges de estado.                                                   */
/* ------------------------------------------------------------------ */
type BadgeTone = "green" | "teal" | "amber" | "red" | "gray" | "best" | "danger" | "muted";

// `danger`/`muted` son alias legibles de red/gray (compatibilidad de call sites).
const BADGE_TONE: Record<BadgeTone, string> = {
  green: "badge-green",
  teal: "badge-teal",
  amber: "badge-amber",
  red: "badge-red",
  gray: "badge-gray",
  best: "badge-best",
  danger: "badge-red",
  muted: "badge-gray",
};

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={clsx("badge", BADGE_TONE[tone], className)}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Chips (filtros clicables o etiquetas estáticas).                    */
/* ------------------------------------------------------------------ */
export function Chip({
  active = false,
  onClick,
  className,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const cls = clsx("chip", active && "chip-active", className);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Inputs.                                                             */
/* ------------------------------------------------------------------ */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("input", className)} {...props} />;
}

/** Barra de búsqueda con icono (searchbar del design system). */
export function SearchBar({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={clsx("searchbar", className)}>
      <Search size={18} className="text-muted flex-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle (switch) — activar/pausar oferta. Accesible (role=switch).   */
/* ------------------------------------------------------------------ */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative h-6 w-10 flex-none rounded-full transition-colors cursor-pointer",
        checked ? "bg-primary" : "bg-slate-200",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar con iniciales. El tamaño/color los pone quien lo usa.        */
/* ------------------------------------------------------------------ */
export function Avatar({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={clsx("avatar", className)}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Barra de progreso.                                                  */
/* ------------------------------------------------------------------ */
export function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx("bar", className)}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Botón-icono (icon-btn del design system).                           */
/* ------------------------------------------------------------------ */
export function IconButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={clsx("icon-btn", className)} {...props}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Estados.                                                            */
/* ------------------------------------------------------------------ */
export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" />
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-display font-semibold text-ink">{title}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}
