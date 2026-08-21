"use client";

import { BadgeCheck, Building2, ChevronRight, FileText, LogOut, Mail, MapPin, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/shell";
import { Avatar, Badge, Button, Card, Spinner } from "@/components/ui";
import { iniciales } from "@/lib/format";
import { clearMe, useMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/client";

export default function CuentaPage() {
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
            {/* Encabezado de organización */}
            <Card className="mb-4 flex items-center gap-4 p-5">
              <Avatar className="h-16 w-16 bg-primary text-[22px]">{iniciales(me.organizacion?.razon_social ?? "P")}</Avatar>
              <div className="min-w-0">
                <p className="truncate font-display text-[17px] font-bold leading-tight">{me.organizacion?.razon_social}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge tone="gray">Proveedor</Badge>
                  {me.organizacion?.verificado && (
                    <Badge tone="green">
                      <BadgeCheck size={12} /> Verificado
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            {/* Datos de la organización */}
            <p className="mb-2 px-1 text-[12px] font-semibold text-muted">ORGANIZACIÓN</p>
            <Card className="mb-4 divide-y divide-line">
              <InfoRow icon={<Building2 size={17} />} label="NIT" value={me.organizacion?.nit ?? "—"} />
              <InfoRow icon={<MapPin size={17} />} label="Ciudad" value={me.organizacion?.ciudad ?? "—"} />
              <Link href="/proveedor/cuenta/documentos" className="flex items-center gap-3 p-3.5">
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

            {/* Datos del usuario */}
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
