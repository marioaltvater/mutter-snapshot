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
mkdir -p "$(dirname "$EXTENSION_DIR")"
cp -r "$SCRIPT_DIR/mutter-snapshot@mario.work" "$EXTENSION_DIR"
echo "   Extension copied"
echo

echo "2. Installing GSettings schema..."
if [[ -f "$SCRIPT_DIR/$SCHEMA_FILE" ]]; then
    if sudo cp "$SCRIPT_DIR/$SCHEMA_FILE" "$SYSTEM_SCHEMA_DIR/"; then
        echo "   Schema file copied to $SYSTEM_SCHEMA_DIR"
        
        echo "3. Compiling schemas..."
        if sudo glib-compile-schemas "$SYSTEM_SCHEMA_DIR"; then
            echo "   Schemas compiled successfully"
        else
            echo "   Error: Failed to compile schemas"
            exit 1
        fi
    else
        echo "   Error: Failed to copy schema file (requires sudo)"
        exit 1
    fi
else
    echo "   Warning: Schema file not found at $SCRIPT_DIR/$SCHEMA_FILE"
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

echo "Installation complete!"
echo
echo "Next steps:"
echo "  1. Reload GNOME Shell by pressing:"
echo "     Alt+F2 → type 'restart' → press Enter"
echo
echo "  2. Or run the following commands:"
echo "     gnome-extensions disable $EXTENSION_NAME"
echo "     gnome-extensions enable $EXTENSION_NAME"
echo
echo "  3. Verify extension appears in the list:"
echo "     gnome-extensions list | grep mutter-snapshot"
echo
echo "  4. To view logs:"
echo "     journalctl -f -o cat /usr/bin/gnome-shell | grep MutterSnapshot"
