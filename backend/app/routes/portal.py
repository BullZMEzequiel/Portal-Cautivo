from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

from app.services.pfsense import pfsense_service

router = APIRouter(prefix="/pfsense", tags=["pfSense Monitor"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.remove(ws)


manager = ConnectionManager()


@router.get("/monitoreo/tiempo-real")
def monitorear_red():
    """Snapshot actual de dispositivos conectados y su consumo en MB."""
    datos_crudos = pfsense_service.obtener_estado_portal()
    datos_procesados = []
    for disp in datos_crudos:
        mb_subida = round(int(disp.get("bytes_uploaded", 0)) / (1024 * 1024), 2)
        mb_bajada = round(int(disp.get("bytes_downloaded", 0)) / (1024 * 1024), 2)
        datos_procesados.append({
            "username": disp["username"],
            "ip": disp["ip"],
            "mac": disp["mac"],
            "conectado_en": disp["connected_at"],
            "consumo_subida_mb": mb_subida,
            "consumo_bajada_mb": mb_bajada,
            "total_mb": round(mb_subida + mb_bajada, 2)
        })
    return datos_procesados


@router.websocket("/admin/ws")
async def websocket_admin(websocket: WebSocket):
    """
    WebSocket para el panel de admin.
    Al conectarse recibe el estado actual; luego recibe eventos en tiempo real:
      - { "type": "nueva_conexion", "data": {...} }
      - { "type": "desconexion",    "data": {...} }
    """
    await manager.connect(websocket)
    try:
        # Enviar snapshot inicial al panel que acaba de conectarse
        sesiones_actuales = pfsense_service.obtener_estado_portal()
        await websocket.send_json({
            "type": "estado_inicial",
            "data": sesiones_actuales,
            "total": len(sesiones_actuales)
        })
        # Mantener la conexión viva esperando mensajes (ping/pong)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
