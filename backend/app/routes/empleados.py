from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from app.database import supabase_client
from app.services.pfsense import PfsenseSyncError, pfsense_service

router = APIRouter(
    prefix="/empleados",
    tags=["Empleados (Dashboard Dueño)"]
)

# --- MODELOS DE VALIDACIÓN (PYDANTIC) ---
class EmpleadoCreate(BaseModel):
    username: str
    password: str
    nombre_completo: str
    rol: str  # 'cocina', 'mesero', 'administrador'
    limite_mb: Optional[int] = 500
    bloquear_redes: Optional[bool] = True

class EmpleadoUpdate(BaseModel):
    password: Optional[str] = None
    nombre_completo: Optional[str] = None
    rol: Optional[str] = None
    limite_mb: Optional[int] = None
    bloquear_redes: Optional[bool] = None
    estado_wifi: Optional[bool] = None

# --- ENDPOINTS (CRUD) ---

@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_empleado(empleado: EmpleadoCreate):
    """Permite al dueño registrar un nuevo empleado en la BD y en pfSense."""
    empleado_creado = None
    try:
        data = {
            "username": empleado.username,
            "password": empleado.password,  # En el siguiente paso añadiremos hashing por seguridad
            "nombre_completo": empleado.nombre_completo,
            "rol": empleado.rol,
            "limite_mb": empleado.limite_mb,
            "bloquear_redes": empleado.bloquear_redes,
            "estado_wifi": True
        }
        
        # 1. Guarda en Supabase
        response = supabase_client.table("empleados").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Supabase no devolvió el empleado creado")
        empleado_creado = response.data[0]
        
        # 2. Sincroniza en tiempo real con pfSense
        pfsense_service.registrar_usuario_pfsense(empleado.username, empleado.password)

        return {"message": "Empleado creado y sincronizado con pfSense", "data": response.data}
    except PfsenseSyncError as e:
        if empleado_creado and empleado_creado.get("id"):
            supabase_client.table("empleados").delete().eq("id", empleado_creado["id"]).execute()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Empleado no sincronizado con pfSense: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al crear empleado: {str(e)}")


@router.get("/", response_model=List[dict])
def listar_empleados():
    """Muestra la lista de todos los empleados en el dashboard de React"""
    try:
        response = supabase_client.table("empleados").select("*").execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener empleados: {str(e)}")


@router.get("/diagnostico/pfsense")
def diagnosticar_pfsense():
    """Comprueba si el backend puede hablar con XML-RPC de pfSense."""
    try:
        return pfsense_service.probar_conexion()
    except PfsenseSyncError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"pfSense no aceptó la conexión XML-RPC: {str(e)}"
        )


@router.delete("/username/{username}")
def eliminar_empleado_por_username(username: str):
    """Elimina un empleado usando el username, aunque solo exista en pfSense."""
    try:
        pfsense_response = pfsense_service.eliminar_usuario_pfsense(username)

        supabase_response = supabase_client.table("empleados").delete().eq("username", username).execute()
        eliminado_supabase = bool(supabase_response.data)

        return {
            "message": "Eliminación por username procesada",
            "username": username,
            "pfsense": "no encontrado" if pfsense_response == "NOT_FOUND" else "eliminado",
            "supabase": "eliminado" if eliminado_supabase else "no encontrado"
        }
    except PfsenseSyncError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Usuario no eliminado de pfSense: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al eliminar por username: {str(e)}")


@router.patch("/{empleado_id}")
def actualizar_empleado(empleado_id: str, empleado: EmpleadoUpdate):
    """Permite modificar límites, roles o banear (estado_wifi = false)"""
    try:
        # Filtrar solo los campos que el dueño realmente desea actualizar
        update_data = {k: v for k, v in empleado.model_dump(exclude_unset=True).items()}
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No se enviaron campos para modificar")

        response = supabase_client.table("empleados").update(update_data).eq("id", empleado_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Empleado no encontrado")
            
        return {"message": "Empleado actualizado", "data": response.data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al actualizar: {str(e)}")


@router.delete("/{empleado_id}")
def eliminar_empleado(empleado_id: str):
    """Elimina por completo al empleado de pfSense y de la base de datos."""
    try:
        empleado_response = supabase_client.table("empleados").select("id, username").eq("id", empleado_id).limit(1).execute()
        if not empleado_response.data:
            raise HTTPException(status_code=404, detail="Empleado no encontrado")

        username = empleado_response.data[0]["username"]
        pfsense_service.eliminar_usuario_pfsense(username)

        response = supabase_client.table("empleados").delete().eq("id", empleado_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Empleado no encontrado")
        return {"message": "Empleado eliminado correctamente de pfSense y Supabase"}
    except PfsenseSyncError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Empleado no eliminado de pfSense: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al eliminar: {str(e)}")
