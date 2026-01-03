## 1. Foundation
- [ ] 1.1 Create extension skeleton with `gnome-extensions create --interactive`
- [ ] 1.2 Create metadata.json with shell-version [49, 50]
- [ ] 1.3 Create schemas/ directory and GSchema XML
- [ ] 1.4 Compile schemas with `glib-compile-schemas schemas/`
- [ ] 1.5 Create basic extension.js with empty enable/disable
- [ ] 1.6 Test extension loads without errors in journalctl

## 2. Window Tracking
- [ ] 2.1 Implement WindowFingerprint class (PID, wm_class, stable_sequence, cmd_line, getMatchKey)
- [ ] 2.2 Implement WindowTracker class (connect to window-created/destroyed signals)
- [ ] 2.3 Implement window filtering (ignore non-NORMAL window types)
- [ ] 2.4 Maintain Map of windows by fingerprint
- [ ] 2.5 Implement findWindowByFingerprint() with fallback logic
- [ ] 2.6 Test window tracking with Terminal, Vivaldi, VS Code

## 3. Session Saving
- [ ] 3.1 Implement SessionSaver class
- [ ] 3.2 Implement _getMonitorInfo() to collect monitor data
- [ ] 3.3 Implement _getWindowInfo() to collect window state
- [ ] 3.4 Implement JSON serialization to ~/.config/session-manager/sessions/
- [ ] 3.5 Test session saving with 4-6 windows across 2 monitors and 2 workspaces
- [ ] 3.6 Verify JSON validity and completeness

## 4. App Launching
- [ ] 4.1 Implement app detection via Shell.AppSystem.get_running()
- [ ] 4.2 Implement launch via Shell.App.launch() for .desktop apps
- [ ] 4.3 Implement launch via cmd execution for apps without .desktop
- [ ] 4.4 Implement workspace targeting during launch
- [ ] 4.5 Test app launching with cleared workspace

## 5. Window Positioning
- [ ] 5.1 Implement monitor switching with window-entered-monitor signal
- [ ] 5.2 Implement workspace management (create/move windows)
- [ ] 5.3 Implement geometry restoration via move_resize_frame()
- [ ] 5.4 Implement window state restoration (maximized, minimized, always-on-top, sticky)
- [ ] 5.5 Test full positioning with test session

## 6. TilingShell Integration
- [ ] 6.1 Implement TilingShellBridge class
- [ ] 6.2 Read TilingShell enable-autotiling setting
- [ ] 6.3 Implement setAutoTiling() to toggle auto-tiling
- [ ] 6.4 Test TilingShell coordination during restore
- [ ] 6.5 Handle missing TilingShell gracefully

## 7. D-Bus API
- [ ] 7.1 Define D-Bus interface XML with SaveSession, RestoreSession, ListSessions
- [ ] 7.2 Register D-Bus object on session bus
- [ ] 7.3 Implement method handlers and signal emissions
- [ ] 7.4 Test D-Bus methods via gdbus calls
- [ ] 7.5 Verify signals fire on events

## 8. UI & Keyboard Shortcuts
- [ ] 8.1 Implement panel indicator with dropdown menu
- [ ] 8.2 Implement session naming dialog
- [ ] 8.3 Implement preferences window with AdwApplication
- [ ] 8.4 Implement keyboard shortcuts (Ctrl+Alt+S, Ctrl+Alt+R)
- [ ] 8.5 Test UI workflow (save, restore, preferences)

## 9. Testing & Debugging
- [ ] 9.1 Create test sessions (A: 2 windows, B: 4 windows across monitors, C: mixed workspaces, D: mixed apps)
- [ ] 9.2 Test each session save/restore cycle
- [ ] 9.3 Test edge cases (monitor disconnect, multi-window apps, maximized windows, etc.)
- [ ] 9.4 Test TilingShell scenarios (auto-tiling on/off)
- [ ] 9.5 Test with debug logging enabled
- [ ] 9.6 Performance testing with 10-window session

## 10. Documentation
- [ ] 10.1 Create comprehensive README.md
- [ ] 10.2 Document architecture and data flow
- [ ] 10.3 Add inline code comments for complex logic
- [ ] 10.4 Create CHANGELOG.md

## 11. Final Validation
- [ ] 11.1 Verify extension loads without errors on GNOME 49
- [ ] 11.2 Verify all success criteria met
- [ ] 11.3 Run comprehensive integration tests
- [ ] 11.4 Prepare for deployment
