import { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import ModalEmpleado from './components/ModalEmpleado'
import MonitoreoPanel from './components/MonitoreoPanel'
import './App.css'

// ── Configuración visual por rol ─────────────────────────────────────────────
const ROL = {
  cocina:        { label: 'Cocina',    color: '#fb923c' },
  mesero:        { label: 'Mesero',    color: '#60a5fa' },
  administrador: { label: 'Admin',     color: '#c084fc' },
}

function iniciales(nombre = '') {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function App() {
  const [tab,            setTab]            = useState('empleados') // 'empleados' | 'monitoreo'
  const [empleados,      setEmpleados]      = useState([])
  const [cargando,       setCargando]       = useState(true)
  const [error,          setError]          = useState(null)
  const [modalAbierto,   setModalAbierto]   = useState(false)
  const [empleadoEditar, setEmpleadoEditar] = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(null)
  const [guardando,      setGuardando]      = useState(false)
  const [toast,          setToast]          = useState(null)

  // ── Toast helper ───────────────────────────────────────────────────────────
  const notificar = (msg, tipo = 'ok') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Carga de datos ─────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    try {
      setCargando(true)
      const data = await api.listarEmpleados()
      setEmpleados(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Handlers del modal ─────────────────────────────────────────────────────
  const abrirNuevo   = ()    => { setEmpleadoEditar(null);  setModalAbierto(true) }
  const abrirEditar  = (emp) => { setEmpleadoEditar(emp);   setModalAbierto(true) }
  const cerrarModal  = ()    => { setModalAbierto(false);   setEmpleadoEditar(null) }

  const guardarEmpleado = async (datos) => {
    setGuardando(true)
    try {
      if (empleadoEditar) {
        await api.actualizarEmpleado(empleadoEditar.id, datos)
        notificar(`${empleadoEditar.nombre_completo} actualizado`)
      } else {
        await api.crearEmpleado(datos)
        notificar(`Empleado @${datos.username} creado y sincronizado con pfSense`)
      }
      cerrarModal()
      cargar()
    } catch (e) {
      notificar(e.message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  // ── Toggle Wi-Fi ───────────────────────────────────────────────────────────
  const toggleWifi = async (emp) => {
    const nuevoEstado = !emp.estado_wifi
    // Optimistic UI
    setEmpleados(prev => prev.map(e => e.id === emp.id ? { ...e, estado_wifi: nuevoEstado } : e))
    try {
      await api.actualizarEmpleado(emp.id, { estado_wifi: nuevoEstado })
      notificar(`@${emp.username} ${nuevoEstado ? 'habilitado' : 'bloqueado'}`)
    } catch (e) {
      // Revert on error
      setEmpleados(prev => prev.map(e => e.id === emp.id ? { ...e, estado_wifi: emp.estado_wifi } : e))
      notificar(e.message, 'error')
    }
  }

  // ── Eliminar ───────────────────────────────────────────────────────────────
  const confirmarEliminar = async () => {
    if (!confirmDelete) return
    try {
      await api.eliminarEmpleado(confirmDelete.id)
      notificar(`${confirmDelete.nombre_completo} eliminado de Supabase y pfSense`)
      setConfirmDelete(null)
      cargar()
    } catch (e) {
      notificar(e.message, 'error')
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const habilitados = empleados.filter(e => e.estado_wifi).length
  const bloqueados  = empleados.filter(e => !e.estado_wifi).length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🍽️</span>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px', color: 'var(--text)' }}>
            Bambú <span style={{ color: 'var(--accent)' }}>Admin</span>
          </span>
        </div>

        {/* Tabs de navegación */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3 }}>
          {[
            { key: 'empleados', label: '👥 Empleados' },
            { key: 'monitoreo', label: '📡 Monitoreo' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background:  tab === t.key ? 'var(--accent)' : 'transparent',
                color:       tab === t.key ? '#0f0f12' : 'var(--muted)',
                border: 'none', padding: '6px 16px', borderRadius: 6,
                fontWeight: tab === t.key ? 700 : 400, fontSize: 13,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'empleados'
          ? <button onClick={abrirNuevo} style={s.btnPrimary}>+ Nuevo Empleado</button>
          : <div style={{ width: 120 }} />
        }
      </header>

      {/* Tab Monitoreo — renderiza su propio panel y sale */}
      {tab === 'monitoreo' && (
        <MonitoreoPanel notificar={notificar} />
      )}

      <main style={{ ...s.main, display: tab === 'empleados' ? 'block' : 'none' }}>

        {/* Stats */}
        <div style={s.statsRow}>
          {[
            { label: 'Total empleados', value: empleados.length, color: 'var(--accent)' },
            { label: 'Habilitados',     value: habilitados,      color: 'var(--green)' },
            { label: 'Bloqueados',      value: bloqueados,       color: 'var(--red)' },
          ].map(stat => (
            <div key={stat.label} style={s.statCard}>
              <div style={{ fontSize: 30, fontWeight: 700, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Gestión de Empleados</span>
            <button onClick={cargar} style={s.btnSecondary} disabled={cargando}>
              {cargando ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {cargando && !empleados.length ? (
            <Placeholder>Cargando empleados…</Placeholder>
          ) : error ? (
            <Placeholder color="var(--red)">Error al conectar con el backend: {error}</Placeholder>
          ) : empleados.length === 0 ? (
            <Placeholder>No hay empleados. Creá el primero con el botón de arriba.</Placeholder>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Empleado', 'Rol', 'Wi-Fi', 'Límite diario', 'Acciones'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((emp, i) => (
                    <FilaEmpleado
                      key={emp.id}
                      emp={emp}
                      zebra={i % 2 === 0}
                      onEdit={() => abrirEditar(emp)}
                      onDelete={() => setConfirmDelete(emp)}
                      onToggleWifi={() => toggleWifi(emp)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal crear / editar */}
      {modalAbierto && (
        <ModalEmpleado
          empleado={empleadoEditar}
          guardando={guardando}
          onGuardar={guardarEmpleado}
          onCerrar={cerrarModal}
        />
      )}

      {/* Dialog confirmar eliminación */}
      {confirmDelete && (
        <Overlay onClick={() => setConfirmDelete(null)}>
          <div style={{ ...s.dialog, borderColor: 'rgba(248,113,113,0.3)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text)', marginBottom: 8, fontSize: 17 }}>¿Eliminar empleado?</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>
              Se eliminará a <strong style={{ color: 'var(--text)' }}>{confirmDelete.nombre_completo}</strong> tanto
              de Supabase como de pfSense. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={s.btnSecondary}>Cancelar</button>
              <button onClick={confirmarEliminar} style={s.btnDanger}>Eliminar</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Toast de notificaciones */}
      {toast && (
        <div style={{
          ...s.toast,
          background:   toast.tipo === 'error' ? '#3b0d0d' : '#052e16',
          borderColor:  toast.tipo === 'error' ? 'rgba(248,113,113,0.4)' : 'rgba(52,211,153,0.4)',
        }}>
          {toast.tipo === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Sub-componente: fila de la tabla ─────────────────────────────────────────
function FilaEmpleado({ emp, zebra, onEdit, onDelete, onToggleWifi }) {
  const rolCfg = ROL[emp.rol] ?? { label: emp.rol, color: 'var(--muted)' }

  return (
    <tr style={{ background: zebra ? 'var(--bg-row)' : 'transparent', borderBottom: '1px solid var(--border-sub)' }}>
      {/* Nombre */}
      <td style={s.td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ ...s.avatar, background: `${rolCfg.color}18`, borderColor: `${rolCfg.color}30`, color: rolCfg.color }}>
            {iniciales(emp.nombre_completo)}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{emp.nombre_completo}</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'monospace' }}>@{emp.username}</div>
          </div>
        </div>
      </td>

      {/* Rol */}
      <td style={s.td}>
        <span style={{ ...s.badge, background: `${rolCfg.color}18`, borderColor: `${rolCfg.color}35`, color: rolCfg.color }}>
          {rolCfg.label}
        </span>
      </td>

      {/* Toggle Wi-Fi */}
      <td style={s.td}>
        <button
          onClick={onToggleWifi}
          title={emp.estado_wifi ? 'Click para bloquear' : 'Click para habilitar'}
          style={{
            ...s.badge,
            cursor: 'pointer', border: '1px solid',
            background:   emp.estado_wifi ? 'rgba(52,211,153,0.1)'   : 'rgba(248,113,113,0.1)',
            borderColor:  emp.estado_wifi ? 'rgba(52,211,153,0.3)'   : 'rgba(248,113,113,0.3)',
            color:        emp.estado_wifi ? 'var(--green)'            : 'var(--red)',
          }}
        >
          {emp.estado_wifi ? '● Activo' : '● Bloqueado'}
        </button>
      </td>

      {/* Límite */}
      <td style={{ ...s.td, color: 'var(--muted)' }}>
        {emp.limite_mb} MB
      </td>

      {/* Acciones */}
      <td style={s.td}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onEdit} style={s.btnEdit}>Editar</button>
          <button onClick={onDelete} style={s.btnDeleteRow}>Eliminar</button>
        </div>
      </td>
    </tr>
  )
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────
function Placeholder({ children, color = 'var(--muted)' }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color }}>{children}</div>
  )
}

function Overlay({ children, onClick }) {
  return (
    <div style={s.overlay} onClick={onClick}>{children}</div>
  )
}

// ── Estilos compartidos ───────────────────────────────────────────────────────
const s = {
  header: {
    height: 58, padding: '0 32px',
    borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 20,
  },
  main: {
    padding: '28px 32px', maxWidth: 1120, margin: '0 auto',
  },
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24,
  },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '18px 22px',
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, overflow: 'hidden',
  },
  cardHeader: {
    padding: '14px 20px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  table: {
    width: '100%', borderCollapse: 'collapse',
  },
  th: {
    padding: '10px 20px', textAlign: 'left',
    fontSize: 11, fontWeight: 600, color: 'var(--dim)',
    textTransform: 'uppercase', letterSpacing: '0.6px',
    borderBottom: '1px solid var(--border-sub)',
  },
  td: {
    padding: '12px 20px', verticalAlign: 'middle',
  },
  avatar: {
    width: 36, height: 36, borderRadius: '50%',
    border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, flexShrink: 0,
  },
  badge: {
    display: 'inline-block',
    fontSize: 12, fontWeight: 600,
    padding: '3px 10px', borderRadius: 20,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 16,
  },
  dialog: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 28, width: '100%', maxWidth: 380,
  },
  toast: {
    position: 'fixed', bottom: 24, right: 24,
    color: '#fff', padding: '12px 18px', borderRadius: 10,
    fontSize: 14, zIndex: 300, maxWidth: 380,
    border: '1px solid', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    lineHeight: 1.5,
  },
  btnPrimary: {
    background: 'var(--accent)', color: '#0f0f12', border: 'none',
    padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13,
  },
  btnSecondary: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--muted)', padding: '7px 14px', borderRadius: 7, fontSize: 13,
  },
  btnDanger: {
    background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)',
    color: 'var(--red)', padding: '7px 16px', borderRadius: 7, fontWeight: 700, fontSize: 13,
  },
  btnEdit: {
    background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.25)',
    color: 'var(--accent)', padding: '5px 12px', borderRadius: 6, fontSize: 12,
  },
  btnDeleteRow: {
    background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
    color: 'var(--red)', padding: '5px 12px', borderRadius: 6, fontSize: 12,
  },
}
