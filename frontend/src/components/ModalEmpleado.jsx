import { useState } from 'react'

const ROLES = [
  { value: 'mesero',        label: 'Mesero' },
  { value: 'cocina',        label: 'Cocina' },
  { value: 'administrador', label: 'Administrador' },
]

export default function ModalEmpleado({ empleado, guardando, onGuardar, onCerrar }) {
  const editando = Boolean(empleado)

  const [form, setForm] = useState({
    nombre_completo: empleado?.nombre_completo ?? '',
    username:        empleado?.username        ?? '',
    password:        '',
    rol:             empleado?.rol             ?? 'mesero',
    limite_mb:       empleado?.limite_mb       ?? 500,
    bloquear_redes:  empleado?.bloquear_redes  ?? true,
  })

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const datos = { ...form }
    // En modo editar, si no se escribe contraseña no se envía (no se modifica)
    if (editando && !datos.password.trim()) delete datos.password
    onGuardar(datos)
  }

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div style={s.modal}>

        {/* Encabezado */}
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>
            {editando ? 'Editar Empleado' : 'Nuevo Empleado'}
          </h2>
          <button onClick={onCerrar} style={s.closeBtn} aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>

          {/* Nombre completo */}
          <Campo label="Nombre completo">
            <input
              type="text"
              required
              placeholder="Ej. Juan García"
              value={form.nombre_completo}
              onChange={e => set('nombre_completo', e.target.value)}
              style={s.input}
            />
          </Campo>

          {/* Username */}
          <Campo label="Usuario de Wi-Fi">
            <input
              type="text"
              required
              placeholder="Ej. juangarcia"
              value={form.username}
              onChange={e => set('username', e.target.value.toLowerCase().replace(/\s+/g, ''))}
              style={{ ...s.input, opacity: editando ? 0.6 : 1 }}
              disabled={editando}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {editando && (
              <span style={s.hint}>El username no se puede modificar.</span>
            )}
          </Campo>

          {/* Contraseña */}
          <Campo label={editando ? 'Nueva contraseña (opcional)' : 'Contraseña'}>
            <input
              type="password"
              placeholder={editando ? 'Dejar vacío para no cambiar' : 'Mínimo 4 caracteres'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required={!editando}
              minLength={editando ? undefined : 4}
              style={s.input}
            />
          </Campo>

          {/* Rol */}
          <Campo label="Rol">
            <select value={form.rol} onChange={e => set('rol', e.target.value)} style={s.input}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Campo>

          {/* Límite + Bloquear redes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo label="Límite diario (MB)">
              <input
                type="number"
                min={50}
                max={50000}
                value={form.limite_mb}
                onChange={e => set('limite_mb', parseInt(e.target.value) || 500)}
                style={s.input}
              />
            </Campo>

            <Campo label="Bloquear redes sociales">
              <button
                type="button"
                onClick={() => set('bloquear_redes', !form.bloquear_redes)}
                style={{
                  ...s.input,
                  cursor: 'pointer', textAlign: 'left', fontWeight: 600,
                  background:  form.bloquear_redes ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)',
                  borderColor: form.bloquear_redes ? 'rgba(248,113,113,0.35)' : 'rgba(52,211,153,0.35)',
                  color:       form.bloquear_redes ? '#f87171' : '#34d399',
                }}
              >
                {form.bloquear_redes ? '🚫 Activado' : '✅ Desactivado'}
              </button>
            </Campo>
          </div>

          {/* Acciones */}
          <div style={s.actions}>
            <button type="button" onClick={onCerrar} style={s.btnSecondary} disabled={guardando}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              style={{ ...s.btnPrimary, opacity: guardando ? 0.7 : 1 }}
            >
              {guardando
                ? 'Guardando…'
                : editando ? 'Guardar cambios' : 'Crear empleado'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 16,
  },
  modal: {
    background: '#1a1a21',
    border: '1px solid rgba(192,132,252,0.2)',
    borderRadius: 16, width: '100%', maxWidth: 460,
    maxHeight: '92vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  modalHeader: {
    padding: '20px 24px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, background: '#1a1a21', zIndex: 1,
  },
  modalTitle: {
    color: '#f3f4f6', fontSize: 17, fontWeight: 700, margin: 0,
  },
  closeBtn: {
    background: 'none', border: 'none',
    color: '#6b7280', fontSize: 18, lineHeight: 1, padding: 2,
  },
  form: {
    display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px 24px',
  },
  input: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '10px 14px',
    color: '#f3f4f6', fontSize: 14,
    width: '100%', outline: 'none', boxSizing: 'border-box',
  },
  hint: {
    fontSize: 11, color: '#6b7280', marginTop: 2,
  },
  actions: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4,
  },
  btnPrimary: {
    background: '#c084fc', color: '#0f0f12', border: 'none',
    padding: '10px 22px', borderRadius: 8, fontWeight: 700, fontSize: 14,
  },
  btnSecondary: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#9ca3af', padding: '10px 18px', borderRadius: 8, fontWeight: 500, fontSize: 14,
  },
}
