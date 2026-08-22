"use client";

import { BadgeCheck, Building2, ChevronRight, FileText, Home, LogOut, Mail, MapPin, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, Spinner } from "@/components/ui";
import { api, ApiCallError } from "@/lib/api";
import { clearCart } from "@/lib/cart";
import { iniciales } from "@/lib/format";
import { clearMe, useMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/client";
import type { Organizacion } from "@/lib/types";

export default function CuentaFarmaciaPage() {
  const router = useRouter();
  const supabase = createClient();
  const me = useMe();
  const [email, setEmail] = useState<string>("");
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
  }, [supabase]);

  async function cerrarSesion() {
    setSaliendo(true);
    clearMe();
    clearCart(); // el carrito es de esta farmacia: no debe heredarlo otra sesión
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <AppBar>
        <p className="font-display text-[20px] font-extrabold">Cuenta</p>
      </AppBar>

      <div className="px-5 pb-24 pt-1">
        {!me ? (
          <Spinner />
        ) : (
          <>
            <Card className="mb-4 flex items-center gap-4 p-5">
              <Avatar className="h-16 w-16 bg-teal-600 text-[22px]">{iniciales(me.organizacion?.razon_social ?? "F")}</Avatar>
              <div className="min-w-0">
                <p className="truncate font-display text-[17px] font-bold leading-tight">{me.organizacion?.razon_social}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge tone="teal">Farmacia</Badge>
                  {me.organizacion?.verificado && (
                    <Badge tone="green">
                      <BadgeCheck size={12} /> Verificada
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            <p className="mb-2 px-1 text-[12px] font-semibold text-muted">ORGANIZACIÓN</p>
            <Card className="mb-4 divide-y divide-line">
              <InfoRow icon={<Building2 size={17} />} label="NIT" value={me.organizacion?.nit ?? "—"} />
              <InfoRow icon={<MapPin size={17} />} label="Ciudad" value={me.organizacion?.ciudad ?? "—"} />
              <DireccionRow direccionInicial={me.organizacion?.direccion ?? null} />
              <Link href="/farmacia/cuenta/documentos" className="flex items-center gap-3 p-3.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-canvas text-muted">
                  <FileText size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-tight">Documentación legal</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">Cámara de comercio, NIT/RUT y cédula</p>
                </div>
                <ChevronRight size={16} className="flex-none text-muted" />
              </Link>
            </Card>

            <p className="mb-2 px-1 text-[12px] font-semibold text-muted">USUARIO</p>
            <Card className="mb-6 divide-y divide-line">
              <InfoRow icon={<User size={17} />} label="Nombre" value={me.perfil.nombre || "—"} />
              <InfoRow icon={<Mail size={17} />} label="Correo" value={email || "—"} />
            </Card>

            <Button variant="outline" size="md" block className="text-danger" disabled={saliendo} onClick={cerrarSesion}>
              <LogOut size={17} /> {saliendo ? "Cerrando…" : "Cerrar sesión"}
            </Button>

            <p className="mt-4 text-center text-[11.5px] text-muted">Cero Agotados · Marketplace farmacéutico B2B</p>
          </>
        )}
      </div>
    </>
  );
}

/** Dirección de entrega: visible y EDITABLE (las farmacias registradas antes
 *  del campo la agregan aquí; el proveedor despacha a esta dirección). */
function DireccionRow({ direccionInicial }: { direccionInicial: string | null }) {
  const [direccion, setDireccion] = useState<string | null>(direccionInicial);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(direccionInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDireccion(direccionInicial);
    setBorrador(direccionInicial ?? "");
  }, [direccionInicial]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const org = await api.patch<Organizacion>("/me/organizacion", { direccion: borrador.trim() });
      setDireccion(org.direccion ?? borrador.trim());
      setEditando(false);
      clearMe(); // el resto de pantallas verá la dirección nueva
    } catch (e) {
      setError(
        e instanceof ApiCallError && e.code === "direccion_invalida"
          ? "Escribe una dirección válida (mínimo 5 caracteres)."
          : "No se pudo guardar la dirección.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-canvas text-muted">
          <Home size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] leading-none text-muted">Dirección de entrega</p>
          {!editando && (
            <p className={`mt-1 truncate text-[14px] font-semibold ${!direccion ? "text-amber-700" : ""}`}>
              {direccion ?? "Agrégala: ahí te entregan los pedidos"}
            </p>
          )}
        </div>
        {!editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex-none text-[13px] font-semibold text-primary underline"
          >
            {direccion ? "Editar" : "Agregar"}
          </button>
        )}
      </div>
      {editando && (
        <div className="mt-2.5">
          <input
            className="input w-full"
            placeholder="Ej: Cra 10 # 20-30, local 2"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            aria-label="Dirección de entrega"
          />
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" disabled={guardando} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="flex-1" disabled={guardando || borrador.trim().length < 5} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
          {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-canvas text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] leading-none text-muted">{label}</p>
        <p className="mt-1 truncate text-[14px] font-semibold">{value}</p>
      </div>
    </div>
  );
}
