#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_NAME="mutter-snapshot@mario.work"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_NAME"
SCHEMA_FILE="schemas/org.gnome.shell.extensions.mutter-snapshot.gschema.xml"
SYSTEM_SCHEMA_DIR="/usr/share/glib-2.0/schemas"

echo "Installing Mutter Snapshot Extension..."
echo

if [[ ! -d "$SCRIPT_DIR/mutter-snapshot@mario.work" ]]; then
    echo "Error: Extension source directory not found"
    echo "Expected: $SCRIPT_DIR/mutter-snapshot@mario.work"
    exit 1
fi

echo "1. Copying extension to $EXTENSION_DIR..."
mkdir -p "$EXTENSION_DIR"
cp -r "$SCRIPT_DIR/mutter-snapshot@mario.work/"* "$EXTENSION_DIR/"
echo "   Extension copied"
echo

echo "2. Installing GSettings schema..."
if [[ -f "$SCRIPT_DIR/mutter-snapshot@mario.work/$SCHEMA_FILE" ]]; then
    if sudo cp "$SCRIPT_DIR/mutter-snapshot@mario.work/$SCHEMA_FILE" "$SYSTEM_SCHEMA_DIR/" 2>/dev/null; then
        echo "   Schema file copied to $SYSTEM_SCHEMA_DIR"

        echo "3. Compiling schemas..."
        if sudo glib-compile-schemas "$SYSTEM_SCHEMA_DIR" 2>/dev/null; then
            echo "   Schemas compiled successfully"
        else
            echo "   Warning: Failed to compile schemas (extension may still work)"
        fi
    else
        echo "   Warning: Failed to copy schema file (requires sudo access)"
        echo "   Extension will be installed without schema support"
    fi
else
    echo "   Warning: Schema file not found at $SCRIPT_DIR/mutter-snapshot@mario.work/$SCHEMA_FILE"
    echo "   Extension will be installed without schema support"
fi
echo

echo "4. Verifying installation..."
if [[ -d "$EXTENSION_DIR" && -f "$EXTENSION_DIR/metadata.json" ]]; then
    echo "   Extension directory: OK"
else
    echo "   Error: Extension directory verification failed"
    exit 1
fi

if [[ -f "$SYSTEM_SCHEMA_DIR/$(basename "$SCHEMA_FILE")" ]]; then
    echo "   GSettings schema: OK"
else
    echo "   Warning: GSettings schema not installed"
fi
echo

echo "5. Restarting GNOME Shell to load extension..."
echo "   NOTE: You must log out and log back in to reload GNOME Shell"
echo

echo "After restarting GNOME Shell:"
echo "   - Enable the extension: gnome-extensions enable $EXTENSION_NAME"
echo "   - Or enable it via the Extensions app"
echo
echo "To view logs:"
echo "  journalctl -f -o cat /usr/bin/gnome-shell | grep MutterSnapshot"
echo

echo "Installation complete!"
