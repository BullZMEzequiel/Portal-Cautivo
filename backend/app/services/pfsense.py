import xmlrpc.client
import ssl
from urllib.parse import quote

from app.config import settings


class PfsenseSyncError(Exception):
    """Error controlado cuando pfSense rechaza o no completa la sincronización."""


class PfsenseService:
    def __init__(self):
        self.host = settings.PFSENSE_HOST
        self.user = settings.PFSENSE_USER
        self.password = settings.PFSENSE_PASSWORD
        self.zone = settings.PFSENSE_CP_ZONE

        # pfSense suele usar certificados autofirmados en LAN.
        self.context = ssl._create_unverified_context()
        user = quote(self.user, safe="")
        password = quote(self.password, safe="")
        self.url = f"https://{user}:{password}@{self.host}/xmlrpc.php"
        self.server = xmlrpc.client.ServerProxy(self.url, context=self.context)

    def registrar_usuario_pfsense(self, username, password):
        """Añade el usuario al User Manager local de pfSense usando XML-RPC."""
        username_php = self._php_string(username)
        password_php = self._php_string(password)
        description_php = self._php_string(f"Empleado creado desde Portal Bambu: {username}")
        zone_php = self._php_string(self.zone)

        php_code = f"""
        global $config;
        require_once("config.inc");
        require_once("auth.inc");

        $username = {username_php};
        $password = {password_php};
        $description = {description_php};
        $zone = {zone_php};

        $user_config = config_get_path("system/user", []);
        $user_idx = null;
        foreach ($user_config as $idx => $usuario_existente) {{
            if (isset($usuario_existente["name"]) && $usuario_existente["name"] === $username) {{
                $user_idx = $idx;
                break;
            }}
        }}

        if ($user_idx !== null) {{
            $user_item_config = [
                "idx" => $user_idx,
                "item" => config_get_path("system/user/" . $user_idx)
            ];
        }} else {{
            $user_item_config = [
                "idx" => null,
                "item" => []
            ];
        }}

        $userent =& $user_item_config["item"];
        $userent["scope"] = "system";
        $userent["name"] = $username;
        $userent["descr"] = $description;
        $userent["expires"] = "";
        $userent["authorizedkeys"] = "";
        $userent["ipsecpsk"] = "";

        if (!function_exists("local_user_set_password")) {{
            throw new Exception("La funcion local_user_set_password no existe en este pfSense");
        }}
        local_user_set_password($user_item_config, $password);

        if ($user_idx !== null) {{
            config_set_path("system/user/" . $user_idx, $userent);
        }} else {{
            $nextuid_config = config_get_path("system/nextuid");
            if (empty($nextuid_config)) {{
                $nextuid_config = 2000;
            }}
            $userent["uid"] = $nextuid_config++;
            config_set_path("system/nextuid", $nextuid_config);

            $group_config = config_get_path("system/group", []);
            foreach ($group_config as $gidx => &$group) {{
                if (isset($group["name"]) && $group["name"] === "all") {{
                    if (!isset($group["member"]) || !is_array($group["member"])) {{
                        $group["member"] = [];
                    }}
                    if (!in_array($userent["uid"], $group["member"])) {{
                        $group["member"][] = $userent["uid"];
                    }}
                    break;
                }}
            }}
            unset($group);
            config_set_path("system/group", $group_config);

            $user_config[] = $userent;
            config_set_path("system/user", $user_config);
        }}

        $user_config = config_get_path("system/user", []);
        usort($user_config, function($a, $b) {{
            return strcmp($a["name"], $b["name"]);
        }});
        config_set_path("system/user", $user_config);

        local_user_set_groups($userent, []);
        local_user_set($userent);
        write_config("Usuario " . $username . " registrado desde FastAPI");
        
        require_once("captiveportal.inc");
        if (function_exists("captiveportal_configure_zone")) {{
            captiveportal_configure_zone($zone);
        }}

        return "OK";
        """
        try:
            response = self.server.pfsense.exec_php(php_code)
            if response not in (True, "OK", "", None):
                print(f"Respuesta XML-RPC pfSense: {response}")
            return response
        except Exception as e:
            raise PfsenseSyncError(str(e)) from e

    def probar_conexion(self):
        """Valida que XML-RPC acepte credenciales y permita ejecutar PHP."""
        try:
            self.server.pfsense.exec_php('return;')
            return {"status": "ok", "message": "pfSense XML-RPC responde y acepta exec_php"}
        except Exception as e:
            raise PfsenseSyncError(str(e)) from e

    def expulsar_dispositivo(self, username):
        """Busca la sesión activa de un usuario en el portal cautivo y lo desconecta inmediatamente"""
        username_php = self._php_string(username)
        php_code = f"""
        require_once("captiveportal.inc");
        captiveportal_disconnect_user({username_php});
        """
        try:
            response = self.server.pfsense.exec_php(php_code)
            return {{"status": "ok", "data": "Usuario expulsado exitosamente via XML-RPC"}}
        except Exception as e:
            print(f"Error al expulsar usuario de pfSense (XML-RPC): {e}")
            return None

    @staticmethod
    def _php_string(value):
        escaped = str(value).replace("\\", "\\\\").replace("'", "\\'")
        return f"'{escaped}'"


pfsense_service = PfsenseService()
