const BASE = 'http://localhost:8000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Error ${res.status}`);
  return body;
}

// ── Empleados (CRUD) ───────────────────────────────────────────────────────
export const api = {
  listarEmpleados:    ()         => request('/empleados/'),
  crearEmpleado:      (data)     => request('/empleados/',   { method: 'POST',  body: JSON.stringify(data) }),
  actualizarEmpleado: (id, data) => request(`/empleados/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  eliminarEmpleado:   (id)       => request(`/empleados/${id}`, { method: 'DELETE' }),

  // ── Monitoreo en vivo ────────────────────────────────────────────────────
  obtenerSesiones: () => request('/pfsense/monitoreo/sesiones'),
  expulsarUsuario: (username) => request(`/pfsense/expulsar/${encodeURIComponent(username)}`, { method: 'POST' }),

  // ── pfBlockerNG ──────────────────────────────────────────────────────────
  obtenerEstadoBloqueo: ()           => request('/pfsense/bloqueo'),
  toggleBloqueo:        (activo)     => request('/pfsense/bloqueo', { method: 'POST', body: JSON.stringify({ activo }) }),
};
