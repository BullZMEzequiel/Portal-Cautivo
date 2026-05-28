from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Pydantic buscará automáticamente estas variables en el archivo .env
    SUPABASE_URL: str
    SUPABASE_KEY: str
    PFSENSE_HOST: str
    PFSENSE_USER: str
    PFSENSE_PASSWORD: str
    PFSENSE_CP_ZONE: str = "restauranteportal"

    # Configuración para que apunte al archivo .env un nivel arriba de /app
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8")

settings = Settings()
