from supabase import create_client, Client
from app.config import settings

# Inicializamos el cliente de Supabase usando las configuraciones seguras
supabase_key = settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_KEY
supabase_client: Client = create_client(settings.SUPABASE_URL, supabase_key)

def get_db():
    """
    Función auxiliar para retornar el cliente de la base de datos.
    Facilita futuras pruebas o inyecciones de dependencia.
    """
    return supabase_client
