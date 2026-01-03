# Change: Add GNOME Shell Session Manager Extension

## Why
Users need a reliable way to save and restore window layouts across sessions on Wayland, with integration with TilingShell extension and support for multi-monitor, multi-workspace setups.

## What Changes
- Add GNOME Shell extension for window session management
- Implement window tracking with unique fingerprints (stable_sequence + wm_class)
- Add session serialization to JSON format
- Implement window restoration with exact positioning across monitors and workspaces
- Integrate with TilingShell extension via GSettings
- Provide D-Bus API for external control
- Add panel indicator UI and keyboard shortcuts

## Impact
- Affected specs: New capability `session-manager`
- Affected code: New GNOME Shell extension at `~/.local/share/gnome-shell/extensions/session-manager@mario.work/`
