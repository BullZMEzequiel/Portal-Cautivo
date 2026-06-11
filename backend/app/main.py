from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import supabase_client
from app.routes import empleados, portal

app = FastAPI(
    title="Portal Cautivo Bambú API",
    description="Backend para la gestión de usuarios y control de acceso con pfSense",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(empleados.router)
app.include_router(portal.router)


@app.on_event("startup")
async def startup_event():
    try:
        supabase_client.table("empleados").select("id").limit(1).execute()
        print("Conectado a Supabase!")
    except Exception as e:
        print(f"Error conectando a Supabase: {e}")


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "API del Portal Cautivo Bambú corriendo exitosamente",
        "target_pfsense": settings.PFSENSE_HOST,
    }
