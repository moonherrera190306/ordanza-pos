"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { estadoCita, guardarCita } from "@/app/actions/agenda";
import { addDays, fmtLong } from "@/lib/dates";
import { Icon } from "@/components/Icon";
import { Empty, Modal, ModalHead, toast } from "@/components/ui";

type Cita = { id: string; titulo: string; fecha: string; hora: string | null; cliente: string | null; telefono: string | null; nota: string | null; estado: string };

export function AgendaView({ dia, hoy, lunes, citas, nueva }: { dia: string; hoy: string; lunes: string; citas: Cita[]; nueva: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Cita | "new" | null>(nueva ? "new" : null);
  const [, start] = useTransition();
  const go = (d: string) => router.push(`/agenda?d=${d}`);
  const week = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  const delDia = citas.filter((c) => c.fecha === dia);
  const proximas = citas.filter((c) => c.fecha > hoy && c.fecha <= addDays(hoy, 7) && c.estado === "PENDIENTE");

  return (
    <div className="wrap">
      <div className="phead">
        <div><p className="eyebrow">Citas, entregas y pendientes</p><h1>Agenda</h1></div>
        <div className="acts"><button className="btn primary" onClick={() => setEdit("new")}><Icon name="plus" />Nueva cita</button></div>
      </div>
      <div className="daybar">
        <button className="btn-icon" onClick={() => go(addDays(dia, -7))} aria-label="Semana anterior">‹</button>
        <button className="btn sm" onClick={() => go(hoy)}>Hoy</button>
        <button className="btn-icon" onClick={() => go(addDays(dia, 7))} aria-label="Semana siguiente">›</button>
        <input type="date" value={dia} onChange={(e) => e.target.value && go(e.target.value)} style={{ width: "auto" }} aria-label="Fecha" />
      </div>
      <div className="week">
        {week.map((d) => {
          const dd = new Date(d + "T12:00:00Z");
          return (
            <button key={d} className={`wd ${d === dia ? "on" : ""} ${d === hoy ? "today" : ""}`} onClick={() => go(d)}>
              <small>{dd.toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" })}</small>
              <b>{dd.getUTCDate()}</b>
              <i className={citas.some((c) => c.fecha === d) ? "has" : ""} />
            </button>
          );
        })}
      </div>
      <div className="grid3">
        <section className="panel span2">
          <h3 style={{ textTransform: "capitalize" }}>{fmtLong(dia)}{dia === hoy ? " · hoy" : ""}</h3>
          {delDia.length ? (
            <div className="list">
              {delDia.map((c) => (
                <div key={c.id} className={`appt ${c.estado === "HECHA" ? "done" : ""}`}>
                  <span className="h">{c.hora || "--:--"}</span>
                  <div className="t" style={{ minWidth: 0, cursor: "pointer" }} onClick={() => setEdit(c)}>
                    <b>{c.titulo}</b>
                    <div className="muted" style={{ fontSize: ".84rem" }}>{[c.cliente, c.telefono, c.nota].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button className={`btn sm ${c.estado === "HECHA" ? "" : "primary"}`} onClick={() => start(async () => {
                    const r = await estadoCita(c.id, c.estado === "HECHA" ? "PENDIENTE" : "HECHA");
                    if (!r.ok) toast(r.error, "bad"); else router.refresh();
                  })}>{c.estado === "HECHA" ? "Reabrir" : <><Icon name="check" />Hecha</>}</button>
                </div>
              ))}
            </div>
          ) : <Empty icon="cal" title="Nada programado este día" />}
        </section>
        <section className="panel">
          <h3>Próximos 7 días</h3>
          {proximas.length ? (
            <div className="list">
              {proximas.map((c) => (
                <div key={c.id} className="li" style={{ cursor: "pointer" }} onClick={() => go(c.fecha)}>
                  <div className="t"><b>{c.titulo}</b><small style={{ textTransform: "capitalize" }}>{new Date(c.fecha + "T12:00:00Z").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}{c.hora ? ` · ${c.hora}` : ""}</small></div>
                </div>
              ))}
            </div>
          ) : <Empty icon="cal" title="Sin pendientes próximos" />}
        </section>
      </div>
      {edit && <CitaForm cita={edit === "new" ? null : edit} fecha={dia} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CitaForm({ cita, fecha, onClose }: { cita: Cita | null; fecha: string; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ titulo: cita?.titulo ?? "", fecha: cita?.fecha ?? fecha, hora: cita?.hora ?? "", cliente: cita?.cliente ?? "", telefono: cita?.telefono ?? "", nota: cita?.nota ?? "" });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} label="Cita">
      <form style={{ display: "flex", flexDirection: "column", gap: 14 }} onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await guardarCita({ id: cita?.id, ...f });
          if (!r.ok) return toast(r.error, "bad");
          toast(r.msg!);
          onClose();
          router.push(`/agenda?d=${f.fecha}`);
          router.refresh();
        });
      }}>
        <ModalHead title={cita ? "Editar cita" : "Nueva cita"} onClose={onClose} />
        <label className="fld"><span>Asunto</span><input value={f.titulo} onChange={set("titulo")} autoFocus placeholder="Entrega de pedido, visita de proveedor…" /></label>
        <div className="grid2">
          <label className="fld"><span>Fecha</span><input type="date" value={f.fecha} onChange={set("fecha")} /></label>
          <label className="fld"><span>Hora</span><input type="time" value={f.hora} onChange={set("hora")} /></label>
        </div>
        <div className="grid2">
          <label className="fld"><span>Cliente / contacto</span><input value={f.cliente} onChange={set("cliente")} /></label>
          <label className="fld"><span>Teléfono</span><input inputMode="tel" value={f.telefono} onChange={set("telefono")} /></label>
        </div>
        <label className="fld"><span>Notas</span><textarea rows={3} value={f.nota} onChange={set("nota")} /></label>
        <div className="mfoot">
          {cita && <button type="button" className="btn ghost danger" onClick={() => start(async () => {
            const r = await estadoCita(cita.id, "CANCELADA");
            if (!r.ok) return toast(r.error, "bad");
            toast("Cita cancelada"); onClose(); router.refresh();
          })}><Icon name="trash" />Cancelar cita</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
          <button className="btn primary" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
