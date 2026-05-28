// frontend/src/components/MonitorRed.jsx
import React, { useState, useEffect } from 'react';

export default function MonitorRed() {
  const [dispositivos, setDispositivos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarEstadoRed = async () => {
    try {
      const response = await fetch('http://localhost:8000/pfsense/monitoreo/tiempo-real');
      const data = await response.json();
      setDispositivos(data);
      setCargando(false);
    } catch (error) {
      console.error("Error cargando el estado del Wi-Fi:", error);
    }
  };

  useEffect(() => {
    // Carga inicial
    cargarEstadoRed();

    // Consultar el pfSense de forma automática cada 5 segundos (Live Monitoring)
    const intervalo = setInterval(cargarEstadoRed, 5000);
    return () => clearInterval(intervalo);
  }, []);

  const expulsarUsuario = async (username) => {
    if (window.confirm(`¿Estás seguro de que deseas expulsar a ${username}?`)) {
      try {
        await fetch(`http://localhost:8000/api/pfsense/expulsar?username=${username}`, { method: 'POST' });
        cargarEstadoRed(); // Recargar la lista inmediatamente
      } catch (error) {
        alert("No se pudo expulsar al usuario");
      }
    }
  };

  if (cargando) return <div style={{ color: '#fff', padding: '20px' }}>Conectando con el router pfSense...</div>;

  return (
    <div style={{ padding: '20px', backgroundColor: '#1e1e24', borderRadius: '12px', color: '#f3f4f6' }}>
      <h2 style={{ color: '#c084fc', marginBottom: '4px' }}>📡 Control de Tráfico Wi-Fi en Tiempo Real</h2>
      <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '20px' }}>Actualizándose automáticamente cada 5 segundos.</p>
      
      {dispositivos.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>No hay clientes activos en el Portal Cautivo actualmente.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(192, 132, 252, 0.3)', color: '#9ca3af' }}>
              <th style={{ padding: '12px' }}>Usuario</th>
              <th style={{ padding: '12px' }}>IP / MAC</th>
              <th style={{ padding: '12px' }}>Hora Conexión</th>
              <th style={{ padding: '12px' }}>Consumo (Subida/Bajada)</th>
              <th style={{ padding: '12px' }}>Total Consumido</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {dispositivos.map((disp, index) => (
              <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <td style={{ padding: '12px', fontWeight: 'bold', color: '#fff' }}>{disp.username}</td>
                <td style={{ padding: '12px', fontSize: '13px' }}>
                  <div>{disp.ip}</div>
                  <div style={{ color: '#6b7280' }}>{disp.mac}</div>
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#d1d5db' }}>{disp.conectado_en}</td>
                <td style={{ padding: '12px', fontSize: '13px' }}>
                  ⬆️ {disp.consumo_subida_mb} MB / ⬇️ {disp.consumo_bajada_mb} MB
                </td>
                <td style={{ padding: '12px', color: disp.total_mb > 100 ? '#ef4444' : '#10b981', fontWeight: '500' }}>
                  {disp.total_mb} MB
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button 
                    onClick={() => expulsarUsuario(disp.username)}
                    style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', transition: '0.2s' }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#b91c1c'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#ef4444'}
                  >
                    Expulsar 🚫
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}