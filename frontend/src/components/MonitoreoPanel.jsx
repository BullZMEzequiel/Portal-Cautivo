import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'

const REFRESH_MS = 5000   // refresco cada 5 segundos

export default function MonitoreoPanel({ notificar }) {
  const [sesiones,       setSesiones]       = useState([])
  const [cargando,       setCargando]       = useState(true)
  const [estadoBloqueo,  setEstadoBloqueo]  = useState('cargando')  // 'activo' | 'inactivo' | 'no_configurado' | 'cargando'
  const [toggling,       setToggling]       = useState(false)
  const [ultimaActual,   setUltimaActual]   = useState(null)
  const [expulsando,     setExpulsando]     = useState(null)   // username siendo expulsado

  // Referencia para calcular MB/s entre lecturas
  const prevSnapshot = useRef({})   // { session_id: { bytes_up, bytes_down, ts } }

  // ── Carga sesiones ─────────────────────────────────────────────────────────
  const cargarSesiones = useCallback(async () => {
    try {
      const data = await api.obtenerSesiones()
      const ahora = Date.now()

      const conVelocidad = data.map(s => {
        const prev = prevSnapshot.current[s.session_id]
        let kbps_down = 0, kbps_up = 0

        if (prev) {
          const deltaT = Math.max((ahora - prev.ts) / 1000, 1)
          kbps_down = ((s.bytes_down - prev.bytes_down) / deltaT / 1024)
          kbps_up   = ((s.bytes_up   - prev.bytes_up)   / deltaT / 1024)
          kbps_down = Math.max(0, kbps_down)
          kbps_up   = Math.max(0, kbps_up)
        }

        prevSnapshot.current[s.session_id] = {
          bytes_down: s.bytes_down,
          bytes_up:   s.bytes_up,
          ts: ahora,
        }

        return { ...s, kbps_down, kbps_up }
      })

      // Limpiar sesiones que ya no existen del snapshot
      const ids = new Set(data.map(s => s.session_id))
      Object.keys(prevSnapshot.current).forEach(id => {
        if (!ids.has(id)) delete prevSnapshot.current[id]
      })

      setSesiones(conVelocidad)
      setUltimaActual(new Date())
      setCargando(false)
    } catch {
      setCargando(false)
    }
  }, [])

  // ── Carga estado bloqueo ───────────────────────────────────────────────────
  const cargarBloqueo = useCallback(async () => {
    try {
      const { estado } = await api.obtenerEstadoBloqueo()
      setEstadoBloqueo(estado)
    } catch {
      setEstadoBloqueo('no_configurado')
    }
  }, [])

  useEffect(() => {
    cargarSesiones()
    cargarBloqueo()
    const interval = setInterval(cargarSesiones, REFRESH_MS)
    return () => clearInterval(interval)
  }, [cargarSesiones, cargarBloqueo])

  // ── Toggle bloqueo ─────────────────────────────────────────────────────────
  const handleToggleBloqueo = async () => {
    const nuevoEstado = estadoBloqueo !== 'activo'
    setToggling(true)
    try {
      await api.toggleBloqueo(nuevoEstado)
      setEstadoBloqueo(nuevoEstado ? 'activo' : 'inactivo')
      notificar(`Bloqueo de redes sociales ${nuevoEstado ? 'activado' : 'desactivado'}`)
    } catch (e) {
      notificar(e.message, 'error')
    } finally {
      setToggling(false)
    }
  }

  // ── Expulsar usuario ───────────────────────────────────────────────────────
  const handleExpulsar = async (username) => {
    setExpulsando(username)
    try {
      await api.expulsarUsuario(username)
      notificar(`@${username} expulsado del portal cautivo`)
      cargarSesiones()
    } catch (e) {
      notificar(e.message, 'error')
    } finally {
      setExpulsando(null)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const velocidadLabel = (kbps) => {
    if (kbps < 1)    return '< 1 KB/s'
    if (kbps < 1024) return `${kbps.toFixed(0)} KB/s`
    return `${(kbps / 1024).toFixed(2)} MB/s`
  }

  const duracionLabel = (connected_at) => {
    if (!connected_at) return '—'
    const inicio = new Date(connected_at.replace(' ', 'T'))
    const diff   = Math.floor((Date.now() - inicio.getTime()) / 1000)
    if (isNaN(diff) || diff < 0) return '—'
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const fechaLabel = (connected_at) => {
    if (!connected_at) return '—'
    const d = new Date(connected_at.replace(' ', 'T'))
    return isNaN(d) ? connected_at : d.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const bloqueoActivo = estadoBloqueo === 'activo'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1120, margin: '0 auto' }}>

      {/* Barra superior: stats + toggle bloqueo */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'stretch' }}>

        {/* Stat: conectados */}
        <div style={s.statCard}>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>
            {sesiones.length}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Conectados ahora</div>
        </div>

        {/* Stat: consumo total */}
        <div style={s.statCard}>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--blue)', lineHeight: 1 }}>
            {sesiones.reduce((a, s) => a + s.mb_total, 0).toFixed(1)} MB
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Consumo total sesiones</div>
        </div>

        {/* Toggle pfBlockerNG */}
        <div style={{ ...s.statCard, flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              Bloqueo de redes sociales
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {estadoBloqueo === 'cargando'       && 'Consultando pfBlockerNG…'}
              {estadoBloqueo === 'activo'         && '🔴 Activo — YouTube, Facebook, TikTok, Instagram, X bloqueados para todos'}
              {estadoBloqueo === 'inactivo'       && '🟢 Desactivado — acceso libre a redes sociales'}
              {estadoBloqueo === 'no_configurado' && '⚠️ Grupo "Redes_Sociales" no encontrado en pfBlockerNG'}
            </div>
          </div>

          {estadoBloqueo !== 'no_configurado' && estadoBloqueo !== 'cargando' && (
            <button
              onClick={handleToggleBloqueo}
              disabled={toggling}
              style={{
                background:  bloqueoActivo ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                border:      `1px solid ${bloqueoActivo ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
                color:       bloqueoActivo ? 'var(--green)' : 'var(--red)',
                padding: '10px 22px', borderRadius: 8, fontWeight: 700,
                fontSize: 13, whiteSpace: 'nowrap',
                opacity: toggling ? 0.6 : 1,
              }}
            >
              {toggling ? 'Aplicando…' : bloqueoActivo ? 'Desactivar bloqueo' : 'Activar bloqueo'}
            </button>
          )}
        </div>
      </div>

      {/* Tabla de sesiones */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            Sesiones activas
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {ultimaActual && (
              <span style={{ fontSize: 12, color: 'var(--dim)' }}>
                Actualizado {ultimaActual.toLocaleTimeString('es-AR')}
              </span>
            )}
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: cargando ? 'var(--yellow)' : 'var(--green)',
              display: 'inline-block',
              boxShadow: cargando ? 'none' : '0 0 6px var(--green)',
              animation: cargando ? 'none' : 'pulse 2s infinite',
            }} title="Auto-refresh cada 5s" />
          </div>
        </div>

        {cargando && sesiones.length === 0 ? (
          <div style={s.empty}>Conectando con pfSense…</div>
        ) : sesiones.length === 0 ? (
          <div style={s.empty}>No hay dispositivos conectados al portal cautivo.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Usuario', 'IP / MAC', 'Conectado', 'Inicio', '↓ Bajada', '↑ Subida', 'Velocidad actual', ''].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sesiones.map((ses, i) => (
                  <FilaSesion
                    key={ses.session_id || i}
                    ses={ses}
                    zebra={i % 2 === 0}
                    expulsando={expulsando === ses.username}
                    onExpulsar={() => handleExpulsar(ses.username)}
                    velocidadLabel={velocidadLabel}
                    duracionLabel={duracionLabel}
                    fechaLabel={fechaLabel}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

// ── Fila de sesión ────────────────────────────────────────────────────────────
function FilaSesion({ ses, zebra, expulsando, onExpulsar, velocidadLabel, duracionLabel, fechaLabel }) {
  const totalKbps = ses.kbps_down + ses.kbps_up
  const velColor  = totalKbps > 512 ? 'var(--red)' : totalKbps > 128 ? 'var(--yellow)' : 'var(--green)'

  return (
    <tr style={{ background: zebra ? 'var(--bg-row)' : 'transparent', borderBottom: '1px solid var(--border-sub)' }}>

      {/* Usuario */}
      <td style={s.td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={s.avatar}>{(ses.username || '?')[0].toUpperCase()}</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{ses.username || '—'}</span>
        </div>
      </td>

      {/* IP / MAC */}
      <td style={s.td}>
        <div style={{ fontSize: 13 }}>{ses.ip}</div>
        <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'monospace' }}>{ses.mac}</div>
      </td>

      {/* Duración */}
      <td style={{ ...s.td, fontWeight: 600, color: 'var(--accent)', fontSize: 14 }}>
        {duracionLabel(ses.connected_at)}
      </td>

      {/* Fecha/hora inicio */}
      <td style={{ ...s.td, fontSize: 12, color: 'var(--muted)' }}>
        {fechaLabel(ses.connected_at)}
      </td>

      {/* MB bajada */}
      <td style={s.td}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {ses.mb_down >= 1 ? `${ses.mb_down.toFixed(2)} MB` : `${(ses.mb_down * 1024).toFixed(0)} KB`}
        </div>
      </td>

      {/* MB subida */}
      <td style={s.td}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {ses.mb_up >= 1 ? `${ses.mb_up.toFixed(2)} MB` : `${(ses.mb_up * 1024).toFixed(0)} KB`}
        </div>
      </td>

      {/* Velocidad actual */}
      <td style={s.td}>
        <div style={{ fontSize: 12, color: velColor, fontWeight: 600 }}>
          ↓ {velocidadLabel(ses.kbps_down)}
        </div>
        <div style={{ fontSize: 12, color: velColor }}>
          ↑ {velocidadLabel(ses.kbps_up)}
        </div>
      </td>

      {/* Expulsar */}
      <td style={s.td}>
        <button
          onClick={onExpulsar}
          disabled={expulsando}
          style={{
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            color: 'var(--red)', padding: '5px 12px',
            borderRadius: 6, fontSize: 12, fontWeight: 600,
            opacity: expulsando ? 0.5 : 1,
          }}
        >
          {expulsando ? '…' : 'Expulsar'}
        </button>
      </td>
    </tr>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = {
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '16px 22px', flex: 1,
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, overflow: 'hidden',
  },
  cardHeader: {
    padding: '14px 20px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  th: {
    padding: '10px 16px', textAlign: 'left',
    fontSize: 11, fontWeight: 600, color: 'var(--dim)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border-sub)',
  },
  td: {
    padding: '11px 16px', verticalAlign: 'middle',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
  },
  empty: {
    padding: '48px 24px', textAlign: 'center', color: 'var(--muted)',
  },
}
