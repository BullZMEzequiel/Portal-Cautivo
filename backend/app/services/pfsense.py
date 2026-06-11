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
        """Añade un usuario de Captive Portal al User Manager de pfSense."""
        username_php = self._php_string(username)
        password_php = self._php_string(password)
        description_php = self._php_string(f"Empleado Portal Bambu: {username}")

        php_code = f"""
        require_once("config.inc");

        $username = {username_php};
        $password = {password_php};
        $description = {description_php};

        $user_config = config_get_path("system/user", []);
        $existing_idx = null;
        foreach ($user_config as $idx => $u) {{
            if (isset($u["name"]) && $u["name"] === $username) {{
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
        $userent["priv"] = ["user-services-captiveportal-login"];

        // Hashear la contraseña directamente con bcrypt nativo de PHP
        $userent["password"] = password_hash($password, PASSWORD_BCRYPT);
        if (isset($userent["md5-hash"])) unset($userent["md5-hash"]);

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

        if ($existing_idx !== null) {{
            $user_config[$existing_idx] = $userent;
        }} else {{
            $user_config[] = $userent;
        }}
        config_set_path("system/user", $user_config);

        $groups = config_get_path("system/group", []);
        foreach ($groups as $idx => &$group) {{
            if (!isset($group["member"])) $group["member"] = [];
            $group["member"] = array_values(array_filter($group["member"], function($uid) use ($userent, $old_uid) {{
                if ((string)$uid === (string)$userent["uid"]) return false;
                if ($old_uid !== null && $old_uid >= 2000 && (string)$uid === (string)$old_uid) return false;
                return true;
            }}));
            if (isset($group["name"]) && $group["name"] === "all") {{
                $group["member"][] = (int)$userent["uid"];
            }}
        }}
        unset($group);
        config_set_path("system/group", $groups);

        write_config("Portal Bambu: usuario " . $username . " sincronizado");
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
    
    def obtener_estado_portal(self):
        """
        Consulta las sesiones activas del Portal Cautivo leyendo la SQLite directamente.
        Compatible con pfSense 2.7+ donde captiveportal_read_db() cambió de API.
        """
        zone = self.zone
        php_code = f"""
        require_once("config.inc");
        $cpzone  = '{zone}';
        $dbfile  = "/var/db/captiveportal{{$cpzone}}.db";
        $result  = [];

        if (!file_exists($dbfile)) {{
            echo json_encode([]);
            return;
        }}

        try {{
            $db = new SQLite3($dbfile, SQLITE3_OPEN_READONLY);
            $query = $db->query(
                "SELECT sessionid, allow_time, ip, mac, username, bytes_in, bytes_out FROM captiveportal"
            );
            if ($query) {{
                while ($row = $query->fetchArray(SQLITE3_ASSOC)) {{
                    $result[] = [
                        "session_id"       => (string)($row["sessionid"]  ?? ""),
                        "username"         => (string)($row["username"]   ?? ""),
                        "ip"               => (string)($row["ip"]         ?? ""),
                        "mac"              => (string)($row["mac"]        ?? ""),
                        "bytes_uploaded"   => (int)($row["bytes_out"]     ?? 0),
                        "bytes_downloaded" => (int)($row["bytes_in"]      ?? 0),
                        "connected_at"     => date("Y-m-d H:i:s", (int)($row["allow_time"] ?? 0))
                    ];
                }}
            }}
            $db->close();
        }} catch (Exception $e) {{
            echo json_encode(["__error" => $e->getMessage()]);
            return;
        }}

        echo json_encode($result);
        """
        try:
            response = self.server.pfsense.exec_php(php_code)
            import json
            data = json.loads(response) if response else []
            if isinstance(data, dict) and "__error" in data:
                print(f"[pfSense SQLite] Error interno: {data['__error']}")
                return []
            return data
        except Exception as e:
            print(f"[pfSense] Error leyendo sesiones: {e}")
            return []


    def obtener_estado_bloqueo(self) -> str:
        """Devuelve 'activo', 'inactivo' o 'no_configurado' según el grupo DNSBL Redes_Sociales."""
        php_code = """
        require_once("config.inc");
        $groups = config_get_path("installedpackages/pfblockerngdnsbl/config", []);
        foreach ($groups as $group) {
            $nombre = $group["aliasname"] ?? "";
            // pfBlockerNG agrega _custom al alias de listas manuales; buscamos ambas variantes
            if ($nombre === "Redes_Sociales" || $nombre === "Redes_Sociales_custom"
                || strpos($nombre, "Redes_Sociales") === 0) {
                echo (isset($group["action"]) && $group["action"] !== "Disabled") ? "activo" : "inactivo";
                return;
            }
        }
        echo "no_configurado";
        """
        try:
            response = self.server.pfsense.exec_php(php_code)
            return response.strip() if response else "no_configurado"
        except Exception as e:
            raise PfsenseSyncError(str(e)) from e

    def toggle_bloqueo_redes(self, enable: bool) -> str:
        """Activa o desactiva el grupo DNSBL 'Redes_Sociales' en pfBlockerNG y fuerza la recarga."""
        nueva_accion = "Unbound" if enable else "Disabled"
        nueva_accion_php = self._php_string(nueva_accion)
        mensaje_php = self._php_string(
            f"Portal Bambu: bloqueo redes sociales {'activado' if enable else 'desactivado'}"
        )

        php_code = f"""
        require_once("config.inc");

        $groups = config_get_path("installedpackages/pfblockerngdnsbl/config", []);
        $encontrado = false;
        foreach ($groups as $idx => &$group) {{
            $nombre = $group["aliasname"] ?? "";
            if ($nombre === "Redes_Sociales" || $nombre === "Redes_Sociales_custom"
                || (strpos($nombre, "Redes_Sociales") === 0)) {{
                $group["action"] = {nueva_accion_php};
                $encontrado = true;
                break;
            }}
        }}
        unset($group);

        if (!$encontrado) {{
            return "GRUPO_NO_ENCONTRADO";
        }}

        config_set_path("installedpackages/pfblockerngdnsbl/config", $groups);
        write_config({mensaje_php});

        // Forzar recarga de pfBlockerNG (actualiza Unbound con los nuevos grupos DNSBL)
        if (file_exists("/usr/local/pkg/pfblockerng/pfblockerng.php")) {{
            exec("/usr/local/sbin/pfSsh.php playback pfblockerng cron force" . " > /dev/null 2>&1 &");
        }}

        return "OK";
        """
        try:
            response = self.server.pfsense.exec_php(php_code)
            if response == "GRUPO_NO_ENCONTRADO":
                raise PfsenseSyncError("Grupo 'Redes_Sociales' no encontrado en pfBlockerNG. Verificá que el grupo esté creado con ese nombre exacto.")
            return response
        except PfsenseSyncError:
            raise
        except Exception as e:
            raise PfsenseSyncError(str(e)) from e

    @staticmethod
    def _php_string(value):
        escaped = str(value).replace("\\", "\\\\").replace("'", "\\'")
        return f"'{escaped}'"


pfsense_service = PfsenseService()
