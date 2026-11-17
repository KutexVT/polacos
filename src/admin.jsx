import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Pencil,
  Pin,
  Check,
  Trash2,
  LifeBuoy,
  Building2,
  StickyNote,
  Activity,
} from "lucide-react";
import { useApp } from "./main";
import { Heading, Clients, Inventory } from "./commerce";
import { Team, Trash } from "./management";
import { Requests, Chats } from "./social";
import { api, time, labels } from "./api";
import {
  Button,
  Field,
  Form,
  State,
  Empty,
  Pager,
  SearchBox,
  useData,
  RecordTable,
} from "./ui";
export const supportLabels = {
  open: "Pendiente",
  in_progress: "En revisión",
  resolved: "Resuelto",
};
export function GroupFilter({ onChange }) {
  const a = useApp();
  return (
    <select
      key={a.group}
      aria-label="Filtrar por grupo"
      value={a.group}
      onChange={(e) => {
        a.setGroup(e.target.value);
        onChange?.();
      }}
    >
      <option value="">Todos los grupos</option>
      {a.groupData.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
export function AdminHome() {
  const a = useApp(),
    state = useData("/admin/overview", a.revision),
    notes = useData("/admin/notes?status=open", a.revision),
    activity = useData("/admin/activity", a.revision),
    d = state.data;
  return (
    <>
      <Heading title="Centro de administración">
        <Button icon={LifeBuoy} onClick={() => a.navigate("/support")}>
          Abrir soporte
        </Button>
      </Heading>
      <State {...state}>
        {d && (
          <>
            <div className="admin-summary" aria-label="Estado de la plataforma">
              <p>
                <strong>{d.waiting_reply}</strong>
                <span>esperando respuesta</span>
              </p>
              <p>
                <strong>{d.open_support}</strong>
                <span>casos abiertos</span>
              </p>
              <button onClick={() => a.navigate("/groups")}>
                <strong>{d.groups}</strong>
                <span>grupos</span>
              </button>
              <button onClick={() => a.navigate("/team")}>
                <strong>{d.users}</strong>
                <span>usuarios activos</span>
              </button>
            </div>
            <div className="admin-columns">
              <section className="admin-queue">
                <div className="section-title">
                  <h2>Necesitan atención</h2>
                  <Button
                    variant="quiet"
                    icon={ArrowRight}
                    onClick={() => a.navigate("/support")}
                  >
                    Ver soporte
                  </Button>
                </div>
                <p className="muted">
                  Primero los casos que esperan tu respuesta · Más antiguos
                  arriba
                </p>
                {d.queue.length ? (
                  d.queue.map((c) => (
                    <button
                      className="support-row"
                      key={c.id}
                      onClick={() => a.navigate("/support/" + c.id)}
                    >
                      <span className="support-person">
                        <strong>{c.creator_name}</strong>
                        <small>
                          {c.group_name} · {labels[c.creator_role]}
                        </small>
                        <span className="support-preview">
                          {c.last_body || "Archivo adjunto"}
                        </span>
                      </span>
                      <span className="support-meta">
                        <span className={"support-state " + c.support_status}>
                          {supportLabels[c.support_status]}
                        </span>
                        <small>
                          {c.sender_role === "admin"
                            ? "Esperando al usuario"
                            : "Espera tu respuesta"}
                        </small>
                        <small>
                          {c.last_message_at && time(c.last_message_at)}
                        </small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  ))
                ) : (
                  <Empty icon={LifeBuoy} title="Soporte al día">
                    Los nuevos casos aparecerán aquí
                  </Empty>
                )}
              </section>
              <aside className="admin-side">
                <section>
                  <div className="section-title">
                    <h2>Mis pendientes</h2>
                    <Button
                      variant="quiet"
                      onClick={() => a.navigate("/notes")}
                    >
                      Ver notas
                    </Button>
                  </div>
                  <State {...notes}>
                    {notes.data?.items.length ? (
                      notes.data.items.slice(0, 4).map((n) => (
                        <button
                          className="admin-note-preview"
                          key={n.id}
                          onClick={() => a.navigate("/notes")}
                        >
                          <strong>
                            {n.pinned && <Pin size={13} />} {n.title}
                          </strong>
                          <small>{n.group_name || "Nota general"}</small>
                        </button>
                      ))
                    ) : (
                      <p className="muted">
                        Guarda recordatorios y lo que necesitas revisar
                      </p>
                    )}
                  </State>
                  <Button
                    variant="secondary"
                    icon={Plus}
                    onClick={() => a.navigate("/notes")}
                  >
                    Escribir una nota
                  </Button>
                </section>
                <section>
                  <div className="section-title">
                    <h2>Actividad reciente</h2>
                    <Button
                      variant="quiet"
                      onClick={() => a.navigate("/activity")}
                    >
                      Ver todo
                    </Button>
                  </div>
                  <State {...activity}>
                    {activity.data?.items.slice(0, 5).map((r) => (
                      <div className="activity-preview" key={r.id}>
                        <strong>{r.action}</strong>
                        <small>
                          {r.actor_name} · {r.group_name || "Plataforma"}
                        </small>
                        <small>{time(r.created_at)}</small>
                      </div>
                    ))}
                    {activity.data?.total === 0 && (
                      <p className="muted">Aún no hay cambios registrados</p>
                    )}
                  </State>
                </section>
              </aside>
            </div>
          </>
        )}
      </State>
    </>
  );
}
export function AdminActivity() {
  const a = useApp(),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const state = useData(
    a.scope(
      `/admin/activity?q=${encodeURIComponent(q)}&page=${page}&from=${from}&to=${to}`,
    ),
    a.revision,
  );
  return (
    <>
      <Heading
        title="Actividad"
        description="Cambios guardados con la identidad real de quien los realizó"
      />
      <div className="toolbar wrap">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Buscar acción o persona"
        />
        <GroupFilter onChange={() => setPage(1)} />
        <Field
          label="Desde"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <Field
          label="Hasta"
          type="date"
          value={to}
          min={from}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <p className="muted">
        Incluye cambios en registros y estados de soporte. Las notas privadas no
        aparecen en este historial
      </p>
      <State {...state}>
        {state.data?.items.length ? (
          <div className="records-wrap">
            <RecordTable>
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Persona</th>
                  <th>Grupo</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.action}</strong>
                      <small className="cell-detail">
                        {{
                          client: "Cliente",
                          purchase: "Compra",
                          product: "Producto",
                          user: "Usuario",
                          group: "Grupo",
                          access: "Permiso",
                          conversation: "Soporte",
                        }[r.entity_type] || "Registro"}
                      </small>
                    </td>
                    <td>
                      {r.actor_name}
                      <small className="cell-detail">
                        {labels[r.actor_role]}
                      </small>
                    </td>
                    <td>{r.group_name || "Plataforma"}</td>
                    <td>{time(r.created_at)}</td>
                    <td>
                      <Button
                        variant="quiet"
                        onClick={() => a.navigate(activityPath(r))}
                      >
                        Revisar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </RecordTable>
          </div>
        ) : (
          <Empty icon={Activity} title="Sin cambios en esta búsqueda">
            Prueba otro período o grupo
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
    </>
  );
}
function activityPath(r) {
  if (r.entity_type === "conversation") return "/support/" + r.entity_id;
  if (r.entity_type === "client") return "/clients/" + r.entity_id;
  if (r.entity_type === "purchase") return "/purchases/" + r.entity_id;
  if (!r.group_id) return "/groups";
  return (
    "/groups/" +
    r.group_id +
    "/" +
    ({ product: "inventory", user: "team", access: "requests" }[
      r.entity_type
    ] || "overview")
  );
}
export function AdminNotes({
  conversation = null,
  groupId = null,
  compact = false,
}) {
  const a = useApp(),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("open"),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState(null),
    [confirm, setConfirm] = useState(null),
    [error, setError] = useState("");
  const gid = groupId || a.group;
  useEffect(() => setPage(1), [gid]);
  const state = useData(
    `/admin/notes?page=${page}&q=${encodeURIComponent(q)}&status=${status}&group_id=${gid || ""}&conversation_id=${conversation || ""}`,
    a.revision,
  );
  async function change(n, patch) {
    try {
      await api("/admin/notes/" + n.id, {
        method: "PATCH",
        body: { ...n, ...patch },
      });
      a.refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <Heading
        title={compact ? "Notas del caso" : "Mis notas"}
        description="Privadas para tu cuenta de administrador"
      >
        <Button
          icon={Plus}
          onClick={() =>
            setEditing({ group_id: gid || null, conversation_id: conversation })
          }
        >
          Nueva nota
        </Button>
      </Heading>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!compact && (
        <div className="toolbar wrap">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Buscar nota"
          />
          {!groupId && <GroupFilter />}
          <select
            aria-label="Estado de las notas"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="open">Pendientes</option>
            <option value="done">Completadas</option>
            <option value="all">Todas las notas</option>
          </select>
        </div>
      )}
      {editing && (
        <section className="note-editor">
          <div className="section-title">
            <h2>{editing.id ? "Editar nota" : "Escribir una nota"}</h2>
            <Button variant="quiet" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
          <Form
            key={editing.id || "new"}
            submit="Guardar nota"
            onSubmit={async (b) => {
              await api("/admin/notes" + (editing.id ? "/" + editing.id : ""), {
                method: editing.id ? "PATCH" : "POST",
                body: { ...editing, ...b, group_id: b.group_id || null },
              });
              setEditing(null);
              a.refresh("Nota guardada");
            }}
          >
            <Field
              label="Título"
              name="title"
              required
              maxLength={150}
              defaultValue={editing.title}
            />
            <Field label="Nota">
              <textarea
                name="body"
                rows="5"
                maxLength={5000}
                defaultValue={editing.body}
              />
            </Field>
            <Field label="Grupo">
              <select
                name="group_id"
                defaultValue={editing.group_id || ""}
                disabled={!!editing.conversation_id}
              >
                <option value="">Nota general</option>
                {a.groupData.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            {editing.conversation_id && (
              <input
                type="hidden"
                name="group_id"
                value={editing.group_id || gid || ""}
              />
            )}
          </Form>
        </section>
      )}
      <State {...state}>
        {state.data?.items.length ? (
          <div className={"admin-notes " + (compact ? "compact" : "")}>
            {state.data.items.map((n) => (
              <article
                className={"admin-note " + (n.done ? "done" : "")}
                key={n.id}
              >
                <div className="section-title">
                  <h2>
                    {n.pinned && <Pin size={17} />} {n.title}
                  </h2>
                  <span className="support-state">
                    {n.done ? "Completada" : "Pendiente"}
                  </span>
                </div>
                <p className="note-body">
                  {n.body || "Sin contenido adicional"}
                </p>
                <small>
                  {n.group_name || "Nota general"} · {time(n.updated_at)}
                </small>
                {n.conversation_id && (
                  <Button
                    variant="quiet"
                    onClick={() => a.navigate("/support/" + n.conversation_id)}
                  >
                    Abrir conversación
                  </Button>
                )}
                <div className="row-actions">
                  <Button
                    variant="quiet"
                    icon={Check}
                    onClick={() => change(n, { done: !n.done })}
                  >
                    {n.done ? "Reabrir" : "Completar"}
                  </Button>
                  <Button
                    variant="quiet"
                    icon={Pin}
                    onClick={() => change(n, { pinned: !n.pinned })}
                  >
                    {n.pinned ? "Desfijar" : "Fijar"}
                  </Button>
                  <Button
                    variant="quiet"
                    icon={Pencil}
                    onClick={() => setEditing(n)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="quiet"
                    icon={Trash2}
                    onClick={() => setConfirm(n.id)}
                  >
                    Eliminar
                  </Button>
                </div>
                {confirm === n.id && (
                  <Form
                    submit="Eliminar nota"
                    onSubmit={async () => {
                      await api("/admin/notes/" + n.id, {
                        method: "DELETE",
                        body: {},
                      });
                      setConfirm(null);
                      a.refresh("Nota eliminada");
                    }}
                  >
                    <p>Se eliminará esta nota de forma permanente</p>
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => setConfirm(null)}
                    >
                      Conservar nota
                    </Button>
                  </Form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={StickyNote} title="Sin notas en esta lista">
            Anota lo que necesitas revisar y marca lo resuelto
          </Empty>
        )}
        <Pager data={state.data} page={page} setPage={setPage} />
      </State>
    </>
  );
}
export function AdminGroupReview({ id, section = "overview" }) {
  const a = useApp(),
    state = useData("/admin/groups/" + id, a.revision),
    g = state.data;
  const sections = [
    ["overview", "Resumen"],
    ["team", "Usuarios"],
    ["clients", "Clientes"],
    ["inventory", "Inventario"],
    ["requests", "Solicitudes"],
    ["chats", "Conversaciones"],
    ["notes", "Notas"],
    ["trash", "Papelera"],
  ];
  return (
    <>
      <Button
        variant="quiet back"
        icon={ArrowLeft}
        onClick={() => a.navigate("/groups")}
      >
        Todos los grupos
      </Button>
      <State {...state}>
        {g && (
          <>
            <div className="review-heading">
              <h1>{g.name}</h1>
              <p>
                Revisión administrativa · Los cambios quedan a nombre de{" "}
                {a.user.name}
              </p>
            </div>
            <nav className="review-tabs" aria-label="Revisión del grupo">
              {sections.map(([key, label]) => (
                <button
                  className={section === key ? "active" : ""}
                  key={key}
                  onClick={() => a.navigate("/groups/" + id + "/" + key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {section === "overview" ? (
              <>
                <section className="group-review-summary">
                  <h2>Estado del grupo</h2>
                  <dl>
                    <div>
                      <dt>Usuarios activos</dt>
                      <dd>{g.users}</dd>
                    </div>
                    <div>
                      <dt>Clientes activos</dt>
                      <dd>{g.clients}</dd>
                    </div>
                    <div>
                      <dt>Productos activos</dt>
                      <dd>{g.products}</dd>
                    </div>
                    <div>
                      <dt>Soporte abierto</dt>
                      <dd>{g.open_support}</dd>
                    </div>
                    <div>
                      <dt>Cupos de polacos</dt>
                      <dd>{g.polaco_limit}</dd>
                    </div>
                  </dl>
                  <div className="row-actions">
                    <Button
                      icon={LifeBuoy}
                      onClick={() => {
                        a.setGroup(id);
                        a.navigate("/support", true);
                      }}
                    >
                      Ver soporte del grupo
                    </Button>
                    <Button
                      variant="secondary"
                      icon={Activity}
                      onClick={() => {
                        a.setGroup(id);
                        a.navigate("/activity", true);
                      }}
                    >
                      Revisar actividad
                    </Button>
                  </div>
                </section>
                <p className="notice">
                  Busca a la persona en Usuarios para corregir su acceso. Abre
                  Clientes o Inventario para revisar registros existentes y
                  ayudar con un problema
                </p>
              </>
            ) : section === "team" ? (
              <Team />
            ) : section === "clients" ? (
              <Clients />
            ) : section === "inventory" ? (
              <Inventory />
            ) : section === "requests" ? (
              <Requests />
            ) : section === "chats" ? (
              <Chats />
            ) : section === "notes" ? (
              <AdminNotes groupId={id} />
            ) : section === "trash" ? (
              <Trash />
            ) : (
              <Empty title="Sección no disponible">
                Elige una sección del grupo
              </Empty>
            )}
          </>
        )}
      </State>
    </>
  );
}
export function ReviewRecord({ groupId }) {
  const a = useApp();
  if (!a.admin) return null;
  return (
    <div className="review-record">
      <span>
        Revisión administrativa ·{" "}
        {a.groupData.find((g) => g.id === groupId)?.name || "Grupo"}
      </span>
      <Button
        variant="quiet"
        onClick={() => a.navigate("/groups/" + groupId + "/clients")}
      >
        Volver al grupo
      </Button>
      <Button
        variant="quiet"
        onClick={() => a.navigate("/groups/" + groupId + "/notes")}
      >
        Notas del grupo
      </Button>
    </div>
  );
}
