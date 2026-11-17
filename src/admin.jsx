import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Building2 } from "lucide-react";
import { useApp } from "./main";
import { Heading } from "./commerce";
import { Team } from "./management";
import { day } from "./api";
import { Button, State, Empty, RecordTable, useData } from "./ui";
export function GroupFilter({ onChange }) {
  const a = useApp();
  return (
    <select
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
export function AdminHome({ embedded = false }) {
  const a = useApp(),
    [days, setDays] = useState("30"),
    state = useData(a.scope("/admin/overview?days=" + days), a.revision),
    d = state.data;
  const peak = Math.max(1, ...(d?.timeline || []).map((x) => x.users || 0));
  return (
    <section className="platform-stats">
      {!embedded && (
        <Heading title="Estadísticas">
          <Button icon={Building2} onClick={() => a.navigate("/groups")}>
            Administrar grupos
          </Button>
        </Heading>
      )}
      <div className="toolbar wrap">
        {!embedded && <GroupFilter />}
        <select
          aria-label="Período de estadísticas"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          {["7", "30", "90"].map((n) => (
            <option value={n} key={n}>
              Últimos {n} días
            </option>
          ))}
        </select>
      </div>
      <State {...state} loading={state.loading && !d}>
        {d && (
          <>
            <dl className="platform-summary">
              <div>
                <dt>Con actividad reciente</dt>
                <dd>{d.active_now}</dd>
                <small>Últimos 15 minutos</small>
              </div>
              <div>
                <dt>Personas activas</dt>
                <dd>{d.active_period}</dd>
                <small>En los últimos {d.days} días</small>
              </div>
              <div>
                <dt>Personas registradas</dt>
                <dd>{d.users}</dd>
                <small>
                  {d.owners} dueños · {d.workers} polacos
                </small>
              </div>
              <div>
                <dt>Grupos</dt>
                <dd>{d.groups}</dd>
                <small>{d.new_users} personas nuevas en el período</small>
              </div>
            </dl>
            <div className="platform-records">
              {[
                ["clients", "Clientes"],
                ["products", "Productos"],
                ["purchases", "Compras registradas"],
                ["payments", "Pagos vigentes"],
                ["closings", "Cierres guardados"],
                ["messages", "Mensajes del equipo"],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <strong>{d[key]}</strong>
                </div>
              ))}
            </div>
            <section className="section">
              <div className="section-heading">
                <h2>Uso de la página</h2>
                <span className="muted">
                  {d.operations} operaciones registradas en el período
                </span>
              </div>
              <p className="muted">
                Personas con actividad por día · Uso registrado desde{" "}
                {day(d.tracking_started)} · Las cuentas de administrador no se
                incluyen
              </p>
              <div
                className="usage-chart"
                role="img"
                aria-label="Personas activas por día"
              >
                {d.timeline.map((p, i) => (
                  <div
                    className="usage-day"
                    key={p.day}
                    title={
                      day(p.day) +
                      ": " +
                      (p.users === null
                        ? "Sin datos de uso"
                        : p.users + " personas activas")
                    }
                  >
                    <div className="usage-track">
                      {p.users !== null && (
                        <span
                          style={{
                            height:
                              Math.max(
                                p.users ? 3 : 0,
                                (p.users / peak) * 100,
                              ) + "%",
                          }}
                        />
                      )}
                    </div>
                    {(i === 0 ||
                      i === d.timeline.length - 1 ||
                      i === Math.floor(d.timeline.length / 2)) && (
                      <small>
                        {p.day.slice(8)}/{p.day.slice(5, 7)}
                      </small>
                    )}
                  </div>
                ))}
              </div>
              <details className="usage-detail">
                <summary>Ver cifras por día</summary>
                <RecordTable>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Personas activas</th>
                      <th>Operaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.timeline].reverse().map((p) => (
                      <tr key={p.day}>
                        <td>{day(p.day)}</td>
                        <td>
                          {p.users === null ? "Sin datos de uso" : p.users}
                        </td>
                        <td>{p.operations}</td>
                      </tr>
                    ))}
                  </tbody>
                </RecordTable>
              </details>
            </section>
            {!embedded && (
              <section className="section">
                <div className="section-heading">
                  <h2>Actividad por grupo</h2>
                  <Button
                    variant="quiet"
                    icon={ArrowRight}
                    onClick={() => a.navigate("/groups")}
                  >
                    Ver grupos
                  </Button>
                </div>
                {d.group_activity.length ? (
                  <RecordTable>
                    <thead>
                      <tr>
                        <th>Grupo</th>
                        <th>Personas registradas</th>
                        <th>Personas activas</th>
                        <th>Operaciones</th>
                        <th>Administrar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.group_activity.map((g) => (
                        <tr key={g.id}>
                          <td>
                            <strong>{g.name}</strong>
                          </td>
                          <td>{g.users}</td>
                          <td>{g.active}</td>
                          <td>{g.operations}</td>
                          <td>
                            <Button
                              variant="quiet"
                              onClick={() => a.navigate("/groups/" + g.id)}
                            >
                              Abrir grupo
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </RecordTable>
                ) : (
                  <Empty icon={Building2} title="Sin grupos">
                    <Button icon={Plus} onClick={() => a.navigate("/groups")}>
                      Crear grupo
                    </Button>
                  </Empty>
                )}
              </section>
            )}
          </>
        )}
      </State>
    </section>
  );
}
export function AdminGroupReview({ id, section = "overview" }) {
  const a = useApp(),
    state = useData("/admin/groups/" + id, a.revision),
    g = state.data;
  return (
    <>
      <Button
        variant="quiet back"
        icon={ArrowLeft}
        onClick={() => a.navigate("/groups")}
      >
        Todos los grupos
      </Button>
      <State {...state} loading={state.loading && !g}>
        {g && (
          <>
            <div className="review-heading">
              <h1>{g.name}</h1>
              <p>
                {g.users} personas registradas · {g.polaco_limit} cupos de
                polacos
              </p>
            </div>
            <nav className="review-tabs" aria-label="Administración del grupo">
              {[
                ["overview", "Estadísticas"],
                ["team", "Usuarios"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={
                    (section === "team" ? "team" : "overview") === key
                      ? "active"
                      : ""
                  }
                  onClick={() => a.navigate("/groups/" + id + "/" + key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {section === "team" ? <Team /> : <AdminHome embedded />}
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
    <Button variant="quiet" onClick={() => a.navigate("/groups/" + groupId)}>
      Volver al grupo
    </Button>
  );
}
