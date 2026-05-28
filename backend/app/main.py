from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import supabase_client
from app.routes import empleados  # <--- NUEVA IMPORTACIÓN

app = FastAPI(
    title="Portal Cautivo Bambú API",
    description="Backend para la gestión de usuarios y control de acceso con pfSense",
    version="1.0.0"
)

# Configuración de CORS: Permite que tu React (localhost:5173) se comunique sin bloqueos
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción lo limitaremos a la IP del frontend y de pfSense
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluimos las rutas del CRUD de empleados
app.include_router(empleados.router) # <--- INYECTAMOS LAS RUTAS

@app.on_event("startup")
async def startup_event():
    """
    Se ejecuta al encender la API. Útil para verificar que Supabase responda.
    """
    try:
        # Hacemos una consulta rápida de prueba a la tabla empleados
        supabase_client.table("empleados").select("id").limit(1).execute()
        print("Rico conectado a Supabase!")
    except Exception as e:
        print(f"Error conectando a Supabase during startup: {e}")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "API del Portal Cautivo Bambú corriendo exitosamente",
        "target_pfsense": settings.PFSENSE_HOST
    }