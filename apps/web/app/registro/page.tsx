"use client";

import { ArrowLeft, ArrowRight, Building2, Factory, Hash, Lock, Mail, MapPin, Plus, Store, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  email_ya_registrado: "Ese correo ya está registrado. Inicia sesión.",
  nit_ya_registrado: "Ese NIT ya está registrado por otra empresa.",
};

type Tipo = "proveedor" | "farmacia";

const TIPOS: { tipo: Tipo; label: string; icon: typeof Factory; hint: string }[] = [
  { tipo: "proveedor", label: "Proveedor", icon: Factory, hint: "Laboratorio o distribuidora" },
  { tipo: "farmacia", label: "Farmacia", icon: Store, hint: "Farmacia o droguería" },
];

export default function RegistroPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tipo, setTipo] = useState<Tipo>("proveedor");
  const [razonSocial, setRazonSocial] = useState("");
  const [nit, setNit] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await api.post(`/onboarding/${tipo}`, {
        razon_social: razonSocial,
        nit: nit || null,
        ciudad: ciudad || null,
        nombre,
        email,
        password,
      });
      // Alta OK → iniciar sesión automáticamente y entrar al panel del rol.
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
      if (loginErr) {
        router.push("/login");
        return;
      }
      router.push(tipo === "farmacia" ? "/farmacia" : "/proveedor");
    } catch (err) {
      const code = err instanceof ApiCallError ? err.code : "";
      setError(ERRORES[code] ?? "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col">
      {/* Hero de marca */}
      <div className="gradient-brand relative overflow-hidden px-6 pb-10 pt-8 text-white">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Plus size={22} />
          </div>
          <span className="font-display text-2xl font-extrabold tracking-tight">Cero Agotados</span>
        </div>
        <h1 className="relative mt-6 font-display text-[24px] font-extrabold leading-tight">
          {tipo === "farmacia" ? "Crea tu cuenta de farmacia" : "Crea tu cuenta de proveedor"}
        </h1>
        <p className="relative mt-1.5 max-w-[280px] text-[13.5px] text-white/85">
          {tipo === "farmacia"
            ? "Registra tu farmacia y compra siempre al mejor precio."
            : "Registra tu laboratorio o distribuidora y empieza a ofertar al mejor precio."}
        </p>
      </div>

      <div className="relative -mt-6 px-5 pb-10">
        <form onSubmit={onSubmit} className="card p-5">
          <p className="label">Tipo de empresa</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {TIPOS.map(({ tipo: t, label, icon: Icon, hint }) => {
              const active = tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  aria-pressed={active}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
                    active ? "border-2 border-primary bg-primary-50" : "border-line bg-surface"
                  }`}
                >
                  <span className={`flex items-center gap-1.5 text-[13.5px] font-semibold ${active ? "text-primary-800" : ""}`}>
                    <Icon size={16} /> {label}
                  </span>
                  <span className="text-[11.5px] text-muted">{hint}</span>
                </button>
              );
            })}
          </div>

          <p className="label">Datos de la empresa</p>
          <div className="relative mb-3">
            <Building2 size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input pl-11"
              placeholder="Razón social"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              required
            />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="relative">
              <Hash size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-10" placeholder="NIT" value={nit} onChange={(e) => setNit(e.target.value)} />
            </div>
            <div className="relative">
              <MapPin size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-10" placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
            </div>
          </div>

          <p className="label mt-2">Responsable de la cuenta</p>
          <div className="relative mb-3">
            <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input pl-11"
              placeholder="Nombre completo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="relative mb-3">
            <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="email"
              className="input pl-11"
              placeholder="Correo corporativo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="relative">
              <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="password"
                className="input pl-10"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="relative">
              <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="password"
                className="input pl-10"
                placeholder="Confirmar"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-danger">{error}</p>}

          {tipo === "proveedor" && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Tu cuenta quedará <b>en revisión</b> del equipo de Cero Agotados. Podrás armar tu
              catálogo de inmediato; será visible para las farmacias cuando te aprobemos.
            </p>
          )}

          <Button type="submit" size="lg" block disabled={loading}>
            {loading ? "Creando cuenta…" : "Crear cuenta"} <ArrowRight size={18} />
          </Button>
        </form>

        <Link href="/login" className="mt-5 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary">
          <ArrowLeft size={15} /> Ya tengo cuenta · Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
