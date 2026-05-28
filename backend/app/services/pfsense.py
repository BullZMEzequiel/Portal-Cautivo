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
        """Añade un usuario común de Captive Portal al User Manager de pfSense."""
        username_php = self._php_string(username)
        password_php = self._php_string(password)
        description_php = self._php_string(f"Empleado Portal Bambu: {username}")
        zone_php = self._php_string(self.zone)

        php_code = f"""
        require_once("config.inc");
        require_once("auth.inc");

        $username = {username_php};
        $password = {password_php};
        $description = {description_php};
        $zone = {zone_php};

        $user_config = config_get_path("system/user", []);
        $existing_idx = null;
        foreach ($user_config as $idx => $usuario_existente) {{
            if (isset($usuario_existente["name"]) && $usuario_existente["name"] === $username) {{
                $existing_idx = $idx;
                break;
            }}
        }}

        $userent = ($existing_idx !== null) ? $user_config[$existing_idx] : [];
        $old_uid = isset($userent["uid"]) ? (int)$userent["uid"] : null;

        $userent["scope"] = "user";
        $userent["name"] = $username;
        $userent["descr"] = $description;
        $userent["expires"] = "";
        $userent["authorizedkeys"] = "";
        $userent["ipsecpsk"] = "";
        $userent["priv"] = ["user-services-captiveportal-login"];
        unset($userent["groupname"]);

        if (!isset($userent["uid"]) || (int)$userent["uid"] < 2000) {{
            $max_uid = 1999;
            foreach ($user_config as $existing_user) {{
                if (isset($existing_user["uid"])) {{
                    $max_uid = max($max_uid, (int)$existing_user["uid"]);
                }}
            }}

            $nextuid = max((int)config_get_path("system/nextuid", 2000), $max_uid + 1, 2000);
            $userent["uid"] = $nextuid;
            config_set_path("system/nextuid", $nextuid + 1);
        }}

        if (!function_exists("local_user_set_password")) {{
            throw new Exception("La funcion local_user_set_password no existe en este pfSense");
        }}
        $item_wrapper = ["idx" => $existing_idx, "item" => &$userent];
        local_user_set_password($item_wrapper, $password);
        $userent = $item_wrapper["item"];

        if ($existing_idx !== null) {{
            $user_config[$existing_idx] = $userent;
        }} else {{
            $user_config[] = $userent;
        }}

        usort($user_config, function($a, $b) {{
            return strcmp($a["name"], $b["name"]);
        }});
        config_set_path("system/user", $user_config);

        $groups = config_get_path("system/group", []);
        foreach ($groups as $idx => &$group) {{
            if (!isset($group["member"]) || !is_array($group["member"])) {{
                $group["member"] = [];
            }}

            $group["member"] = array_values(array_filter($group["member"], function($member_uid) use ($userent, $old_uid) {{
                if ((string)$member_uid === (string)$userent["uid"]) {{
                    return false;
                }}
                if ($old_uid !== null && $old_uid >= 2000 && (string)$member_uid === (string)$old_uid) {{
                    return false;
                }}
                return true;
            }}));

            if (isset($group["name"]) && $group["name"] === "all") {{
                $group["member"][] = (int)$userent["uid"];
            }}
        }}
        unset($group);
        config_set_path("system/group", $groups);

        local_user_set($userent);
        write_config("Portal Bambu: usuario " . $username . " sincronizado");

        require_once("captiveportal.inc");
        if (function_exists("captiveportal_configure_zone")) {{
            captiveportal_configure_zone($zone);
        }}

        return "OK";
        """
        try:
            response = self.server.pfsense.exec_php(php_code)
            if response not in (True, "OK", "", None):
                print(f"[pfSense XML-RPC] Respuesta inesperada: {response}")
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

    def eliminar_usuario_pfsense(self, username):
        """Elimina un usuario local de pfSense y limpia sus grupos."""
        username_php = self._php_string(username)
        zone_php = self._php_string(self.zone)

        php_code = f"""
        require_once("config.inc");
        require_once("auth.inc");

        $username = {username_php};
        $zone = {zone_php};

        $user_config = config_get_path("system/user", []);
        $removed_uid = null;
        $removed_user = null;
        $found = false;

        foreach ($user_config as $idx => $userent) {{
            if (isset($userent["name"]) && $userent["name"] === $username) {{
                $removed_uid = isset($userent["uid"]) ? (int)$userent["uid"] : null;
                $removed_user = $userent;
                unset($user_config[$idx]);
                $found = true;
                break;
            }}
        }}

        if (!$found) {{
            return "NOT_FOUND";
        }}

        config_set_path("system/user", array_values($user_config));

        if ($removed_uid !== null && $removed_uid >= 2000) {{
            $groups = config_get_path("system/group", []);
            foreach ($groups as $idx => &$group) {{
                if (!isset($group["member"]) || !is_array($group["member"])) {{
                    continue;
                }}

                $group["member"] = array_values(array_filter($group["member"], function($member_uid) use ($removed_uid) {{
                    return (string)$member_uid !== (string)$removed_uid;
                }}));
            }}
            unset($group);
            config_set_path("system/group", $groups);
        }}

        if ($removed_user !== null && $removed_uid !== null && $removed_uid >= 2000 && function_exists("local_user_del")) {{
            local_user_del($removed_user);
        }}

        write_config("Portal Bambu: usuario " . $username . " eliminado");

        require_once("captiveportal.inc");
        if (function_exists("captiveportal_configure_zone")) {{
            captiveportal_configure_zone($zone);
        }}

        return "OK";
        """
        try:
            response = self.server.pfsense.exec_php(php_code)
            if response not in (True, "OK", "NOT_FOUND", "", None):
                print(f"[pfSense XML-RPC] Respuesta inesperada al eliminar: {response}")
            return response
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
