"""
Servicio de monitoreo en segundo plano.
Cada 30 segundos consulta pfSense para detectar nuevas conexiones o desconexiones
y emite eventos por WebSocket al panel de administración.
"""

import asyncio
from datetime import datetime, timezone
from typing import Set, Dict


_sesiones_conocidas: Set[str] = set()
_datos_sesion: Dict[str, dict] = {}


async def poll_pfsense_loop(manager, supabase_client, interval: int = 30):
    global _sesiones_conocidas, _datos_sesion

    from app.services.pfsense import pfsense_service

    while True:
        try:
            loop = asyncio.get_event_loop()
            sesiones = await loop.run_in_executor(None, pfsense_service.obtener_estado_portal)

            ids_actuales: Set[str] = {s["session_id"] for s in sesiones}

            # Nuevas conexiones
            for sesion in sesiones:
                sid = sesion["session_id"]
                if sid not in _sesiones_conocidas:
                    _datos_sesion[sid] = sesion
                    await manager.broadcast({
                        "type": "nueva_conexion",
                        "timestamp": _ahora(),
                        "data": {
                            "username": sesion.get("username", "Desconocido"),
                            "ip": sesion.get("ip", ""),
                            "mac": sesion.get("mac", ""),
                            "conectado_en": sesion.get("connected_at", ""),
                        }
                    })
                    _registrar_entrada(supabase_client, sesion)

            # Desconexiones
            for sid in (_sesiones_conocidas - ids_actuales):
                sesion_previa = _datos_sesion.pop(sid, {})
                await manager.broadcast({
                    "type": "desconexion",
                    "timestamp": _ahora(),
                    "data": {
                        "username": sesion_previa.get("username", "Desconocido"),
                        "ip": sesion_previa.get("ip", ""),
                        "mac": sesion_previa.get("mac", ""),
                    }
                })
                _registrar_salida(supabase_client, sesion_previa)

            _sesiones_conocidas = ids_actuales

        except Exception as e:
            print(f"[Monitor] Error al consultar pfSense: {e}")

        await asyncio.sleep(interval)


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _registrar_entrada(supabase_client, sesion: dict):
    try:
        username = sesion.get("username", "")
        resp = supabase_client.table("empleados").select("id").eq("username", username).limit(1).execute()
        empleado_id = resp.data[0]["id"] if resp.data else None

        supabase_client.table("historial_consumo").insert({
            "empleado_id": empleado_id,
            "username_historico": username,
            "mac_address": sesion.get("mac", ""),
            "ip_dispositivo": sesion.get("ip", ""),
        }).execute()
    except Exception as e:
        print(f"[Monitor] Error registrando entrada en Supabase: {e}")


def _registrar_salida(supabase_client, sesion: dict):
    try:
        username = sesion.get("username", "")
        if not username:
            return
        supabase_client.table("historial_consumo").update({
            "hora_salida": _ahora(),
        }).eq("username_historico", username).is_("hora_salida", "null").execute()
    except Exception as e:
        print(f"[Monitor] Error registrando salida en Supabase: {e}")
