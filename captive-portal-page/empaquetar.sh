#!/bin/bash
# Empaqueta index.html como portal.tgz para subir a pfSense.
#
# pfSense REQUIERE que la página customizada del portal cautivo sea un
# archivo .tgz que contenga un archivo llamado "index.php" (aunque sea HTML puro).
# Si se sube el .html directamente o se pega en la interfaz → la zona se rompe.
#
# USO:
#   chmod +x empaquetar.sh
#   ./empaquetar.sh
#
# Luego en pfSense:
#   Services → Captive Portal → [zona] → pestaña "Upload" → subir portal.tgz

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Copiando index.html → index.php ..."
cp "$SCRIPT_DIR/index.html" "$SCRIPT_DIR/index.php"

echo "Creando portal.tgz ..."
tar -czf "$SCRIPT_DIR/portal.tgz" -C "$SCRIPT_DIR" index.php

rm "$SCRIPT_DIR/index.php"

echo ""
echo "✅ Archivo listo: captive-portal-page/portal.tgz"
echo ""
echo "Subilo a pfSense en:"
echo "  Services → Captive Portal → [zona restaurante] → Upload → portal.tgz"
