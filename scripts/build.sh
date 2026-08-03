#!/usr/bin/env bash
# Build and install script for Mosaic WM

set -e

UUID="mosaicwm@cleomenezesjr.github.io"
SRCDIR="extension"
ZIPFILE="$UUID.zip"

is_enabled() {
    gnome-extensions info "$UUID" 2>/dev/null | grep -q '^  Enabled: Yes$'
}

reload_extension() {
    if ! is_enabled; then
        echo "Extension is not enabled; skipping in-session reload."
        return 0
    fi

    echo "Reloading active extension in-session..."
    gnome-extensions disable "$UUID"
    gnome-extensions enable "$UUID"
}

usage() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  -b, --build     Build the extension (create zip)"
    echo "  -i, --install   Install the extension locally"
    echo "  -u, --uninstall Uninstall the extension"
    echo "  -h, --help      Show this help message"
}

build() {
    echo "Building extension..."
    
    # Remove compiled schemas
    rm -f "$SRCDIR/schemas/gschemas.compiled"
    (cd "$SRCDIR" && zip -r "../$ZIPFILE" .)
    
    echo "Build complete: $ZIPFILE"
}

install() {
    echo "Installing Mosaic WM..."

    local was_enabled=false
    if is_enabled; then
        was_enabled=true
    fi

    # Build first
    build

    # Install using gnome-extensions
    gnome-extensions install --force "$ZIPFILE"

    # Clean up
    rm -f "$ZIPFILE"

    if [ "$was_enabled" = true ]; then
        reload_extension
    else
        echo "Extension is installed but currently disabled."
        echo "Enable it with: gnome-extensions enable $UUID"
    fi

    echo "Installation complete!"
    echo "If the current GNOME Shell session still shows stale behavior, log out and log back in as a fallback."
}

uninstall() {
    echo "Uninstalling Mosaic WM..."
    gnome-extensions uninstall "$UUID" 2>/dev/null || true
    echo "Uninstallation complete!"
}

# Parse arguments
if [ $# -eq 0 ]; then
    usage
    exit 1
fi

case "$1" in
    -b|--build)
        build
        ;;
    -i|--install)
        install
        ;;
    -u|--uninstall)
        uninstall
        ;;
    -h|--help)
        usage
        ;;
    *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
esac
