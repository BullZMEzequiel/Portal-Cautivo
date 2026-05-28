import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import supabase_client
from app.routes import empleados, portal
from app.services.monitor import poll_pfsense_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        supabase_client.table("empleados").select("id").limit(1).execute()
        print("Conectado a Supabase!")
    except Exception as e:
        print(f"Error conectando a Supabase: {e}")

    monitor_task = asyncio.create_task(
        poll_pfsense_loop(portal.manager, supabase_client, interval=30)
    )

    yield

    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Portal Cautivo Bambú API",
    description="Backend para la gestión de usuarios y control de acceso con pfSense",
    version="1.0.0",
    lifespan=lifespan,
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


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "API del Portal Cautivo Bambú corriendo exitosamente",
        "target_pfsense": settings.PFSENSE_HOST,
    }
