# Design: GNOME Session Manager Extension

## Context

This is a GNOME Shell extension (GNOME 49, Wayland) that provides reliable window session management. The extension must integrate with the TilingShell extension, handle multi-monitor and multi-workspace setups, and provide both UI (panel indicator) and programmatic (D-Bus) control interfaces.

### Constraints
- Wayland-only environment (no X11 support)
- GNOME Shell 49 (Fedora 43)
- Must coordinate with TilingShell extension
- Target system: Dual-monitor (4000x3000 + 2560x1440), multi-workspace

## Goals / Non-Goals

### Goals
- Save and restore window layouts with pixel-perfect accuracy (±2 pixels)
- Restore windows to correct monitors and workspaces
- Coordinate with TilingShell during restore to prevent conflicts
- Provide keyboard shortcuts and D-Bus API for automation
- Handle missing apps gracefully with silent failure + summary notification

### Non-Goals
- Auto-save before logout (manual only)
- Auto-restore on login (manual only)
- Named sessions (single "current" state in V1)
- Visual session editor
- Session templates

## Decisions

### 1. Window Identification Strategy
**Decision**: Use `stable_sequence + wm_class` as primary key, fall back to `title + wm_class`

**Rationale**: `stable_sequence` provides a unique, persistent identifier for windows across restarts. It's more reliable than title alone (which can change). Fallback to title ensures matching even when stable_sequence is unavailable.

**Alternatives considered**:
- Title only (rejected: titles change frequently)
- PID only (rejected: PIDs change on restart)
- Window handle (rejected: not persistent across sessions)

### 2. Wayland Positioning Strategy
**Decision**: Sequential positioning with signal-based synchronization

**Rationale**: Wayland doesn't allow immediate geometry changes. Must wait for signals:
1. Wait for `window-entered-monitor` after `move_to_monitor()`
2. Apply geometry via `move_resize_frame()`
3. Wait 50-100ms for Wayland compositor
4. Apply state (maximized, etc.) after geometry

**Alternatives considered**:
- Immediate positioning (rejected: fails on Wayland)
- Single wait after all operations (rejected: race conditions)

### 3. TilingShell Integration
**Decision**: Settings-based approach via GSettings (`enable-autotiling=false`)

**Rationale**: Direct API would break if TilingShell changes internals. GSettings is a stable public interface. Temporary disable during restore prevents auto-tiling conflicts.

**Alternatives considered**:
- Direct TilingShell API calls (rejected: fragility)
- Complete TilingShell disable (rejected: affects user experience)

### 4. Session Storage Format
**Decision**: JSON with explicit versioning

**Rationale**: Human-readable, easy to debug, supports schema evolution via version field. Stores in `~/.config/session-manager/sessions/` following XDG config directory standard.

**Structure**:
```json
{
  "version": "1.0",
  "timestamp": "ISO 8601",
  "session_name": "string",
  "active_workspace": 0,
  "n_workspaces": 2,
  "monitors": [...],
  "windows": [...]
}
```

### 5. App Launch Strategy
**Decision**: Prefer Shell.App.launch() with .desktop files, fallback to cmd execution

**Rationale**: Shell.App integrates properly with GNOME's app system (workspace targeting, proper environment). Fallback to cmd for apps without .desktop entries.

**Workflow**:
1. Check if app already running via Shell.AppSystem.get_running()
2. If .desktop exists: use Shell.App.launch()
3. If no .desktop: execute cmd_line directly
4. Launch apps with configurable interval (default 100ms)

### 6. Module Architecture
**Decision**: Modular design with clear responsibilities

**Modules**:
- `WindowTracker`: Track all windows, generate fingerprints
- `SessionSaver`: Serialize state to JSON
- `SessionRestorer`: Restore windows with timing control
- `TilingShellBridge`: Coordinate with TilingShell
- `DBusAPI`: External control interface
- `Indicator` + `Notification`: User feedback

**Rationale**: Separation of concerns enables testing and future extensions. Each module owns a specific domain.

## Risks / Trade-offs

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wayland timing issues | Medium | High | Signal-based synchronization, configurable delays |
| TilingShell API changes | Low | Medium | Use stable GSettings interface |
| Missing apps during restore | High | Low | Silent skip with summary notification |
| Monitor configuration changes | Medium | Medium | Validate monitor indices, fallback to primary |
| Flatpak app differences | Low | Medium | Test with Flatpak apps, handle cmd variations |

### Trade-offs

1. **Launch interval vs speed**: Default 100ms balances reliability and speed. Configurable 50-500ms.
2. **Named sessions vs simplicity**: V1 uses single "current" state for simplicity. Named sessions planned for V2.
3. **Auto-save vs manual control**: Manual only prevents unintended saves. Automation via D-Bus provides flexibility.

## Migration Plan

### Version 1.0
- Single "current" session
- Manual save/restore
- Keyboard shortcuts + D-Bus API

### Future versions
- Named sessions
- Auto-save before logout
- Session templates
- Visual editor

## Open Questions

- [ ] What is the maximum number of windows to support?
- [ ] Should we implement session backup/rollback?
- [ ] How to handle window IDs if stable_sequence is not available on all GNOME versions?

## Data Flow

### Save Flow
```
User triggers save
  → WindowTracker.getAllWindows()
  → SessionSaver.saveSession()
  → Serialize window fingerprints, positions, states
  → Write JSON to ~/.config/session-manager/sessions/
```

### Restore Flow
```
User triggers restore
  → Load session JSON
  → TilingShellBridge.setAutoTiling(false)
  → SessionRestorer._launchApps() with intervals
  → Listen for window-created signals
  → Match windows by fingerprint
  → Position windows (monitor → workspace → geometry → state)
  → TilingShellBridge.setAutoTiling(true)
  → Notification with results
```

## Technical Notes

### Wayland-Specific Workarounds
1. **Monitor switching**: Always wait for `window-entered-monitor` signal
2. **Geometry restoration**: Add 50-100ms delay after `move_resize_frame()`
3. **State restoration**: Apply maximized state AFTER geometry, not before
4. **Signal timing**: Some signals fire asynchronously

### Debugging
```bash
# View logs
journalctl -f -o cat /usr/bin/gnome-shell | grep SessionManager

# Reload extension
Alt+F2 → "restart"
gnome-extensions disable session-manager@mario.work
gnome-extensions enable session-manager@mario.work
```

### Performance Targets
- Save: <100ms
- App launching: <1s (100ms interval × 10 windows)
- Positioning: <2s per window
- Total restore: <5s for 10 windows
