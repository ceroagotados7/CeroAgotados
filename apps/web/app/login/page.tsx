"use client";

import { BarChart3, Eye, EyeOff, Factory, Lock, Mail, Plus, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { clearMe, fetchMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/client";

type Rol = "proveedor" | "farmacia" | "admin";

const ROLES: {
  rol: Rol;
  label: string;
  icon: typeof Factory;
  ruta: string;
  chip: string;
}[] = [
  { rol: "proveedor", label: "Proveedor", icon: Factory, ruta: "/proveedor", chip: "bg-primary text-white" },
  { rol: "farmacia", label: "Farmacia", icon: Store, ruta: "/farmacia", chip: "bg-teal-50 text-teal-700" },
  { rol: "admin", label: "Admin", icon: BarChart3, ruta: "/admin", chip: "bg-slate-100 text-slate-600" },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [rol, setRol] = useState<Rol>("proveedor");
  const [email, setEmail] = useState("proveedor1@cero.test");
  const [password, setPassword] = useState("password123");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError("Credenciales inválidas. Verifica el correo y la contraseña.");
      return;
    }
    // Enruta por el tipo REAL de la organización (no por la pestaña elegida):
    // evita que una farmacia caiga en el panel de proveedor o viceversa.
    clearMe();
    try {
      const me = await fetchMe();
      router.push(me.organizacion.tipo === "farmacia" ? "/farmacia" : "/proveedor");
    } catch {
      router.push(ROLES.find((r) => r.rol === rol)!.ruta);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col">
      {/* Hero de marca */}
      <div className="gradient-brand relative overflow-hidden px-6 pb-14 pt-8 text-white">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute right-16 top-24 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Plus size={22} />
          </div>
          <span className="font-display text-2xl font-extrabold tracking-tight">Cero Agotados</span>
        </div>
        <h1 className="relative mt-7 font-display text-[26px] font-extrabold leading-tight">
          El mejor precio
          <br />
          para tu farmacia.
        </h1>
        <p className="relative mt-2 max-w-[260px] text-[14px] text-white/85">
          Marketplace farmacéutico B2B. Laboratorios y farmacias, conectados.
        </p>
      </div>

      {/* Card de acceso */}
      <div className="relative -mt-7 px-5 pb-8">
        <form onSubmit={onSubmit} className="card p-5">
          <p className="label">Ingreso según tu rol</p>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {ROLES.map(({ rol: r, label, icon: Icon, chip }) => {
              const active = rol === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRol(r)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3 transition ${
                    active ? "border-2 border-primary bg-primary-50" : "border-line bg-surface"
                  }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${chip}`}>
                    <Icon size={18} />
                  </span>
                  <span className={`text-[11.5px] font-semibold ${active ? "text-primary-800" : "text-muted"}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="label" htmlFor="email">
            Correo corporativo
          </label>
          <div className="relative mb-3.5">
            <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input pl-11"
              autoComplete="email"
              required
            />
          </div>

          <label className="label" htmlFor="pass">
            Contraseña
          </label>
          <div className="relative mb-2">
            <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="pass"
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-11 pr-11"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="mb-4 text-right">
            <a className="cursor-pointer text-[12.5px] font-semibold text-primary">¿Olvidaste tu contraseña?</a>
          </div>

          {error && <p className="mb-3 text-sm text-danger">{error}</p>}

          <Button type="submit" size="lg" block disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted">
          ¿Tu empresa aún no está?{" "}
          <Link href="/registro" className="font-semibold text-primary">
            Crear cuenta
          </Link>
        </p>
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
          <ShieldCheck size={14} /> Conexión segura · datos cifrados
        </div>
      </div>
    </main>
  );
}
