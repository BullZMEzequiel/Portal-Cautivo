from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.pfsense import pfsense_service, PfsenseSyncError

router = APIRouter(prefix="/pfsense", tags=["Monitor & Bloqueo"])


# ── Sesiones activas ──────────────────────────────────────────────────────────

@router.get("/monitoreo/sesiones")
def sesiones_activas():
    """
    Retorna todas las sesiones activas del portal cautivo con IP, MAC,
    bytes subidos/bajados y timestamp de conexión.
    El frontend calcula MB/s comparando lecturas consecutivas.
    """
    raw = pfsense_service.obtener_estado_portal()
    sesiones = []
    for s in raw:
        bytes_up   = int(s.get("bytes_uploaded",   0) or 0)
        bytes_down = int(s.get("bytes_downloaded", 0) or 0)
        sesiones.append({
            "session_id":    s.get("session_id", ""),
            "username":      s.get("username",   ""),
            "ip":            s.get("ip",         ""),
            "mac":           s.get("mac",        ""),
            "connected_at":  s.get("connected_at", ""),
            "bytes_up":      bytes_up,
            "bytes_down":    bytes_down,
            "mb_up":         round(bytes_up   / (1024 * 1024), 3),
            "mb_down":       round(bytes_down / (1024 * 1024), 3),
            "mb_total":      round((bytes_up + bytes_down) / (1024 * 1024), 3),
        })
    return sesiones


# ── Expulsar usuario ──────────────────────────────────────────────────────────

@router.post("/expulsar/{username}")
def expulsar_usuario(username: str):
    """Desconecta inmediatamente al usuario del portal cautivo (no lo elimina)."""
    resultado = pfsense_service.expulsar_dispositivo(username)
    if resultado is None:
        raise HTTPException(status_code=502, detail="No se pudo expulsar al usuario de pfSense")
    return {"message": f"Usuario '{username}' expulsado del portal cautivo"}


# ── Toggle pfBlockerNG ────────────────────────────────────────────────────────

class BloqueoPayload(BaseModel):
    activo: bool


@router.get("/bloqueo")
def estado_bloqueo():
    """Devuelve el estado actual del grupo DNSBL 'Redes_Sociales' en pfBlockerNG."""
    try:
        estado = pfsense_service.obtener_estado_bloqueo()
        return {"estado": estado}
    except PfsenseSyncError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/bloqueo")
def toggle_bloqueo(payload: BloqueoPayload):
    """Activa o desactiva el grupo DNSBL 'Redes_Sociales' en pfBlockerNG y recarga Unbound."""
    try:
        pfsense_service.toggle_bloqueo_redes(payload.activo)
        estado = "activado" if payload.activo else "desactivado"
        return {"message": f"Bloqueo de redes sociales {estado} correctamente", "estado": estado}
    except PfsenseSyncError as e:
        raise HTTPException(status_code=502, detail=str(e))
