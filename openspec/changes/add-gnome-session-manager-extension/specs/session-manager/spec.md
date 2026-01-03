## ADDED Requirements

### Requirement: Extension Lifecycle
The extension SHALL load without errors on GNOME Shell 49 and 50, properly initialize and clean up resources on enable/disable.

#### Scenario: Extension loads successfully
- **GIVEN** GNOME Shell 49 or 50 is running
- **WHEN** the Session Manager extension is enabled
- **THEN** the extension initializes without errors
- **AND** panel indicator appears in top bar
- **AND** no errors appear in journalctl

#### Scenario: Extension disables cleanly
- **GIVEN** the Session Manager extension is enabled
- **WHEN** the extension is disabled
- **THEN** all signal handlers are disconnected
- **AND** all resources are released
- **AND** panel indicator is removed
- **AND** no errors appear in journalctl

### Requirement: Window Tracking
The extension SHALL track all open windows with unique fingerprints based on stable_sequence and wm_class.

#### Scenario: Window created and tracked
- **GIVEN** the extension is enabled
- **WHEN** a normal window (not splash, dialog, or notification) is created
- **THEN** a WindowFingerprint is generated
- **AND** the window is added to the tracked windows Map
- **AND** debug log shows window title and wm_class

#### Scenario: Window destroyed and removed
- **GIVEN** a window is being tracked
- **WHEN** the window is destroyed
- **THEN** the window is removed from the tracked windows Map
- **AND** debug log shows window title

#### Scenario: Non-normal windows are ignored
- **GIVEN** the extension is enabled
- **WHEN** a splash screen, dialog, or notification window is created
- **THEN** the window is not tracked
- **AND** no log entry is created

### Requirement: Window Fingerprint Matching
The extension SHALL match windows using stable_sequence + wm_class as primary key, with fallback to title + wm_class.

#### Scenario: Match window with stable_sequence
- **GIVEN** a window has a stable_sequence
- **WHEN** matching against saved fingerprints
- **THEN** match key uses `stable_sequence:wm_class`
- **AND** window is successfully matched

#### Scenario: Match window without stable_sequence
- **GIVEN** a window has no stable_sequence
- **WHEN** matching against saved fingerprints
- **THEN** match key uses `title:wm_class`
- **AND** window is successfully matched

### Requirement: Session Serialization
The extension SHALL serialize the current window state to JSON format including monitor info, window positions, states, and app info.

#### Scenario: Save session to file
- **GIVEN** 4-6 windows are open across 2 monitors and 2 workspaces
- **WHEN** user saves session as "test"
- **THEN** session file is created at ~/.config/session-manager/sessions/test.json
- **AND** file includes version, timestamp, session_name
- **AND** file includes monitor geometries
- **AND** file includes all windows with fingerprints, positions, states, and app info
- **AND** JSON is valid and well-formatted

#### Scenario: Capture all window properties
- **GIVEN** a window exists
- **WHEN** saving session
- **THEN** fingerprint includes pid, wm_class, stable_sequence, title, cmd_line
- **AND** position includes monitor, workspace, x, y, width, height
- **AND** state includes maximized, minimized, fullscreen, always_on_top, sticky
- **AND** app_info includes desktop_file and desktop_path

### Requirement: Session Restoration - App Launching
The extension SHALL restore applications from saved session, skipping already-running apps and launching missing apps.

#### Scenario: Launch apps with interval
- **GIVEN** a saved session with 4 apps
- **WHEN** restoring the session
- **THEN** apps are launched one at a time
- **AND** configurable delay (default 100ms) occurs between launches
- **AND** log shows each app launch

#### Scenario: Skip already-running apps
- **GIVEN** a saved session with 4 apps
- **AND** 2 of the apps are already running
- **WHEN** restoring the session
- **THEN** only the 2 missing apps are launched
- **AND** log shows which apps were skipped

#### Scenario: Launch via .desktop file
- **GIVEN** a saved window has a .desktop file
- **WHEN** launching the app
- **THEN** Shell.App.launch() is used
- **AND** app launches on the correct workspace

#### Scenario: Launch via command line
- **GIVEN** a saved window has no .desktop file
- **WHEN** launching the app
- **THEN** cmd_line is executed directly
- **AND** app launches successfully

### Requirement: Window Positioning
The extension SHALL restore windows to exact positions, monitors, workspaces, and states with pixel-perfect accuracy (±2 pixels).

#### Scenario: Position window on correct monitor
- **GIVEN** a saved window on monitor 1
- **WHEN** restoring the window
- **THEN** window is moved to monitor 1
- **AND** system waits for window-entered-monitor signal
- **AND** window is confirmed on monitor 1

#### Scenario: Position window on correct workspace
- **GIVEN** a saved window on workspace 2
- **WHEN** restoring the window
- **THEN** workspace 2 is created if needed
- **AND** window is moved to workspace 2

#### Scenario: Restore exact geometry
- **GIVEN** a saved window at x=100, y=50, width=800, height=600
- **WHEN** restoring the window
- **THEN** window is positioned at the exact coordinates
- **AND** final position is within ±2 pixels of saved position
- **AND** system waits 50-100ms for Wayland compositor

#### Scenario: Restore maximized state
- **GIVEN** a saved window is maximized
- **WHEN** restoring the window
- **THEN** window is unmaximized first
- **AND** geometry is restored
- **AND** window is maximized after geometry

#### Scenario: Restore minimized state
- **GIVEN** a saved window is minimized
- **WHEN** restoring the window
- **THEN** window geometry is restored
- **AND** window is minimized after geometry

#### Scenario: Restore always-on-top state
- **GIVEN** a saved window has always-on-top enabled
- **WHEN** restoring the window
- **THEN** window is made always-on-top after geometry

### Requirement: TilingShell Integration
The extension SHALL coordinate with TilingShell during restore by temporarily disabling auto-tiling.

#### Scenario: Disable TilingShell during restore
- **GIVEN** TilingShell is installed and auto-tiling is enabled
- **WHEN** session restoration begins
- **THEN** TilingShell enable-autotiling is set to false
- **AND** log confirms TilingShell auto-tiling is disabled

#### Scenario: Re-enable TilingShell after restore
- **GIVEN** TilingShell auto-tiling was disabled for restore
- **WHEN** session restoration completes
- **THEN** TilingShell enable-autotiling is restored to previous state
- **AND** log confirms TilingShell auto-tiling is re-enabled

#### Scenario: Handle missing TilingShell
- **GIVEN** TilingShell is not installed
- **WHEN** session restoration begins
- **THEN** restore proceeds normally
- **AND** warning is logged about missing TilingShell
- **AND** no errors occur

### Requirement: D-Bus API
The extension SHALL provide a D-Bus interface for SaveSession, RestoreSession, and ListSessions operations.

#### Scenario: Save session via D-Bus
- **GIVEN** the extension is enabled
- **WHEN** gdbus calls SaveSession with sessionName "test"
- **THEN** session is saved successfully
- **AND** SessionSaved signal is emitted
- **AND** method returns true

#### Scenario: Restore session via D-Bus
- **GIVEN** a saved session "test" exists
- **WHEN** gdbus calls RestoreSession with sessionName "test"
- **THEN** session is restored successfully
- **AND** SessionRestored signal is emitted with window count
- **AND** method returns true

#### Scenario: List sessions via D-Bus
- **GIVEN** multiple saved sessions exist
- **WHEN** gdbus calls ListSessions
- **THEN** list of session names is returned
- **AND** all session names are included

### Requirement: User Interface
The extension SHALL provide a panel indicator with menu for save/restore operations and a preferences window.

#### Scenario: Save from panel menu
- **GIVEN** the extension is enabled
- **WHEN** user clicks panel icon and selects "Save Session..."
- **THEN** naming dialog appears
- **AND** user can enter session name
- **AND** session is saved on confirmation

#### Scenario: Restore from panel menu
- **GIVEN** multiple saved sessions exist
- **WHEN** user clicks panel icon and selects a session from "Restore Session"
- **THEN** selected session is restored
- **AND** success notification appears

#### Scenario: Keyboard shortcut save
- **GIVEN** the extension is enabled
- **WHEN** user presses Ctrl+Alt+S
- **THEN** current session is saved as "current"
- **AND** success notification appears

#### Scenario: Keyboard shortcut restore
- **GIVEN** a saved session exists
- **WHEN** user presses Ctrl+Alt+R
- **THEN** current session is restored
- **AND** success notification appears

### Requirement: Configuration
The extension SHALL provide configurable settings for restore interval, TilingShell integration, keyboard shortcuts, and debug mode.

#### Scenario: Change restore interval
- **GIVEN** default restore interval is 100ms
- **WHEN** user changes restore interval to 200ms in preferences
- **THEN** apps launch with 200ms delay during restore

#### Scenario: Toggle TilingShell integration
- **GIVEN** TilingShell integration is enabled
- **WHEN** user disables TilingShell integration in preferences
- **THEN** restore does not modify TilingShell settings

#### Scenario: Enable debug mode
- **GIVEN** debug mode is disabled
- **WHEN** user enables debug mode in preferences
- **THEN** detailed logs appear in journalctl

### Requirement: Error Handling
The extension SHALL handle errors gracefully with silent failure for individual windows and summary notifications.

#### Scenario: Missing app during restore
- **GIVEN** a saved session references an uninstalled app
- **WHEN** restoring the session
- **THEN** app is silently skipped
- **AND** log shows which app was skipped
- **AND** other apps restore successfully
- **AND** summary notification shows "X windows restored, Y failed"

#### Scenario: Session not found
- **GIVEN** user attempts to restore session "nonexistent"
- **WHEN** restore is triggered
- **THEN** error notification appears
- **AND** no windows are launched

#### Scenario: Invalid session file
- **GIVEN** a corrupted session JSON file exists
- **WHEN** user attempts to restore the session
- **THEN** error notification appears
- **AND** log shows error details
- **AND** no windows are launched

### Requirement: Performance
The extension SHALL restore sessions within performance targets for typical workloads.

#### Scenario: Restore 10-window session
- **GIVEN** a saved session with 10 windows
- **WHEN** restoring the session
- **THEN** total restoration completes within 5 seconds
- **AND** all windows are positioned correctly
- **AND** no GNOME Shell lag occurs

#### Scenario: Save large session
- **GIVEN** 10 windows are open
- **WHEN** saving the session
- **THEN** save completes within 100ms
- **AND** all window data is captured correctly
