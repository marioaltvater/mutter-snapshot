# Custom Window Session Manager - Implementation Plan

**Version**: 1.0  
**GNOME Shell**: 49 (Fedora 43)  
**Target System**: Wayland, Dual-monitor (2 monitors), Multi-workspace  
**TilingShell Integration**: Settings-based (temporary disable)  

---

## User Requirements Summary

- **Q1 (TilingShell Integration)**: Settings-based approach - temporarily set `enable-autotiling=false`  
- **Q2 (Window Matching)**: `stable_sequence + wm_class` first, then `title + wm_class`  
- **Q3 (Session Model)**: Single "current" state to start (can add named sessions later)  
- **Q4 (Failure Handling)**: Silent skip with summary notification  
- **Q5 (Startup Behavior)**: Manual only (keyboard shortcuts, menu, D-Bus)  

---

## Extension Metadata

```
UUID: session-manager@mario.work
Name: Session Manager
Description: Reliable window session management for Wayland with TilingShell integration
Shell Versions: [49, 50]
URL: https://github.com/mario/session-manager-extension
```

---

## Project Structure

```
~/.local/share/gnome-shell/extensions/session-manager@mario.work/
├── extension.js                    # Main extension class
├── metadata.json                  # Extension metadata
├── prefs.js                       # Settings UI (AdwApplication)
├── schemas/
│   └── org.gnome.shell.extensions.session-manager.gschema.xml
├── src/
│   ├── windowTracker.js            # Track all windows with unique fingerprints
│   ├── sessionSaver.js           # Serialize window state to JSON
│   ├── sessionRestorer.js        # Restore windows with timing control
│   ├── tilingShellBridge.js       # Coordinate with TilingShell
│   ├── workspaceManager.js         # Handle workspace creation/deletion
│   └── dbusApi.js               # External control interface
└── ui/
    ├── indicator.js               # Panel icon/menu
    └── notification.js           # User feedback notifications
```

---

## Configuration Schema

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema path="/org/gnome/shell/extensions/session-manager/" id="org.gnome.shell.extensions.session-manager">
    <key name="restore-interval" type="i">
      <default>100</default>
      <summary>Delay between app launches (ms)</summary>
      <description>Time to wait between launching apps during restore</description>
      <range min="50" max="500"/>
    </key>
    <key name="disable-tilingshell-during-restore" type="b">
      <default>true</default>
      <summary>Disable TilingShell auto-tiling during restore</summary>
    </key>
    <key name="save-shortcut" type="s">
      <default>"&lt;Ctrl&gt;&lt;Alt&gt;s"</default>
      <summary>Save session keyboard shortcut</summary>
    </key>
    <key name="restore-shortcut" type="s">
      <default>"&lt;Ctrl&gt;&lt;Alt&gt;r"</default>
      <summary>Restore session keyboard shortcut</summary>
    </key>
    <key name="debug-mode" type="b">
      <default>false</default>
      <summary>Enable debug logging</summary>
    </key>
  </schema>
</schemalist>
```

---

## Data Structures

### Window Fingerprint (Primary Matching)

```javascript
class WindowFingerprint {
  constructor(metaWindow) {
    this.pid = metaWindow.get_pid();
    this.wmClass = metaWindow.get_wm_class();
    this.stableSequence = metaWindow.get_stable_sequence();
    this.title = metaWindow.get_title();
    this.cmdLine = this._getCmdLine(this.pid);
  }

  getMatchKey() {
    // Primary: stable_sequence + wm_class (most reliable)
    if (this.stableSequence) {
      return `${this.stableSequence}:${this.wmClass}`;
    }
    // Fallback: title + wm_class
    return `${this.title}:${this.wmClass}`;
  }

  _getCmdLine(pid) {
    // Read /proc/{pid}/cmdline
    // Returns array of command arguments
  }
}
```

### Saved Session Format

```json
{
  "version": "1.0",
  "timestamp": "2026-01-03T14:30:00Z",
  "session_name": "current",
  "active_workspace": 0,
  "n_workspaces": 2,
  "monitors": [
    {
      "index": 0,
      "primary": true,
      "rect": {"x": 0, "y": 0, "width": 4000, "height": 3000}
    },
    {
      "index": 1,
      "primary": false,
      "rect": {"x": 4000, "y": 0, "width": 2560, "height": 1440}
    }
  ],
  "windows": [
    {
      "fingerprint": {
        "pid": 31037,
        "wm_class": "Vivaldi-flatpak",
        "stable_sequence": 22,
        "title": "Start Page - Vivaldi",
        "cmd": ["/app/vivaldi/vivaldi", "--enable-features=WebRTCPipeWireCapturer"]
      },
      "position": {
        "monitor": 1,
        "workspace": 0,
        "x": 1262,
        "y": 0,
        "width": 2560,
        "height": 1440
      },
      "state": {
        "maximized": true,
        "minimized": false,
        "fullscreen": false,
        "always_on_top": false,
        "sticky": false
      },
      "app_info": {
        "desktop_file": "com.vivaldi.Vivaldi.desktop",
        "desktop_path": "/var/lib/flatpak/exports/share/applications/com.vivaldi.Vivaldi.desktop"
      }
    }
  ]
}
```

---

## Core Architecture

### WindowTracker Module

**Responsibility**: Track all open windows, generate fingerprints, detect changes

```javascript
class WindowTracker {
  constructor() {
    this.windows = new Map(); // fingerprint -> metaWindow
    this.signals = [];
    
    this._connectSignals();
  }

  _connectSignals() {
    // Track window creation
    const windowCreatedId = global.display.connect('window-created', 
      (display, metaWindow) => this._onWindowCreated(metaWindow)
    );
    this.signals.push([global.display, windowCreatedId]);

    // Track window destruction
    const windowDestroyedId = global.display.connect('window-destroyed',
      (display, metaWindow) => this._onWindowDestroyed(metaWindow)
    );
    this.signals.push([global.display, windowDestroyedId]);

    // Track window moves (optional, for auto-save)
    const windowMovedId = global.display.connect('position-changed',
      (display, metaWindow) => this._onWindowMoved(metaWindow)
    );
    this.signals.push([global.display, windowMovedId]);
  }

  _onWindowCreated(metaWindow) {
    if (this._shouldIgnoreWindow(metaWindow)) {
      return;
    }

    const fingerprint = new WindowFingerprint(metaWindow);
    this.windows.set(fingerprint.getMatchKey(), {
      metaWindow,
      fingerprint
    });

    Log.debug(`Window created: ${fingerprint.title} (${fingerprint.wmClass})`);
  }

  _onWindowDestroyed(metaWindow) {
    const fingerprint = new WindowFingerprint(metaWindow);
    this.windows.delete(fingerprint.getMatchKey());
    
    Log.debug(`Window destroyed: ${fingerprint.title}`);
  }

  _shouldIgnoreWindow(metaWindow) {
    // Ignore splash screens, dialogs, notifications, etc.
    const windowType = metaWindow.get_window_type();
    return windowType !== Meta.WindowType.NORMAL;
  }

  getAllWindows() {
    return Array.from(this.windows.values());
  }

  findWindowByFingerprint(fingerprint) {
    // Try stable_sequence + wm_class first
    if (fingerprint.stableSequence) {
      const key1 = `${fingerprint.stableSequence}:${fingerprint.wmClass}`;
      if (this.windows.has(key1)) {
        return this.windows.get(key1).metaWindow;
      }
    }

    // Fallback: title + wm_class
    const key2 = `${fingerprint.title}:${fingerprint.wmClass}`;
    if (this.windows.has(key2)) {
      return this.windows.get(key2).metaWindow;
    }

    return null;
  }

  destroy() {
    for (const [obj, id] of this.signals) {
      obj.disconnect(id);
    }
    this.signals = [];
    this.windows.clear();
  }
}
```

### SessionSaver Module

**Responsibility**: Serialize current window state to JSON

```javascript
class SessionSaver {
  constructor(windowTracker) {
    this.windowTracker = windowTracker;
    this.storagePath = GLib.build_filenamev([
      GLib.get_user_config_dir(),
      'session-manager',
      'sessions'
    ]);
  }

  saveSession(sessionName = 'current') {
    const session = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      session_name: sessionName,
      active_workspace: global.workspace_manager.get_active_workspace_index(),
      n_workspaces: global.workspace_manager.get_n_workspaces(),
      monitors: this._getMonitorInfo(),
      windows: this._getWindowInfo()
    };

    const filePath = GLib.build_filenamev([
      this.storagePath, 
      `${sessionName}.json`
    ]);

    this._ensureStorageDirectory();
    this._writeJson(filePath, session);

    Log.info(`Session saved: ${sessionName} with ${session.windows.length} windows`);
    return session;
  }

  _getMonitorInfo() {
    const monitors = [];
    const nMonitors = global.display.get_n_monitors();

    for (let i = 0; i < nMonitors; i++) {
      const rect = global.display.get_monitor_geometry(i);
      monitors.push({
        index: i,
        primary: i === global.display.get_primary_monitor(),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      });
    }

    return monitors;
  }

  _getWindowInfo() {
    const windowInfos = [];

    for (const {metaWindow, fingerprint} of this.windowTracker.getAllWindows()) {
      const windowInfo = {
        fingerprint: fingerprint,
        position: this._getWindowPosition(metaWindow),
        state: this._getWindowState(metaWindow),
        app_info: this._getAppInfo(metaWindow)
      };

      windowInfos.push(windowInfo);
    }

    return windowInfos;
  }

  _getWindowPosition(metaWindow) {
    const rect = metaWindow.get_frame_rect();
    return {
      monitor: metaWindow.get_monitor(),
      workspace: metaWindow.get_workspace()?.index() || 0,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  }

  _getWindowState(metaWindow) {
    return {
      maximized: metaWindow.is_maximized(),
      minimized: metaWindow.is_minimized(),
      fullscreen: metaWindow.is_fullscreen(),
      always_on_top: metaWindow.is_above(),
      sticky: metaWindow.is_on_all_workspaces()
    };
  }

  _getAppInfo(metaWindow) {
    const windowTracker = Shell.WindowTracker.get_default();
    const shellApp = windowTracker.get_window_app(metaWindow);

    if (!shellApp) {
      return {
        desktop_file: null,
        desktop_path: null
      };
    }

    const appInfo = shellApp.get_app_info();
    return {
      desktop_file: shellApp.get_id(),
      desktop_path: appInfo?.get_filename() || null
    };
  }

  _ensureStorageDirectory() {
    const dir = Gio.File.new_for_path(this.storagePath);
    if (!dir.query_exists(null)) {
      dir.make_directory_with_parents(null);
    }
  }

  _writeJson(filePath, data) {
    const file = Gio.File.new_for_path(filePath);
    const [success] = file.replace_contents(
      JSON.stringify(data, null, 2),
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      null
    );
  }
}
```

### SessionRestorer Module

**Responsibility**: Restore windows with proper timing and TilingShell coordination

```javascript
class SessionRestorer {
  constructor(windowTracker, settings) {
    this.windowTracker = windowTracker;
    this.settings = settings;
    this.expectedWindows = new Map(); // fingerprint -> windowInfo
    this.positionedWindows = new Set();
    this.restoreStartTime = 0;
  }

  async restoreSession(sessionName = 'current') {
    this.restoreStartTime = Date.now();
    this.expectedWindows.clear();
    this.positionedWindows.clear();

    const session = this._loadSession(sessionName);
    if (!session) {
      Notification.error(`Session "${sessionName}" not found`);
      return;
    }

    Log.info(`Restoring session: ${sessionName}`);

    // Phase 1: Disable TilingShell auto-tiling
    if (this.settings.get_boolean('disable-tilingshell-during-restore')) {
      TilingShellBridge.setAutoTiling(false);
      Log.debug('TilingShell auto-tiling disabled');
    }

    // Phase 2: Ensure workspaces exist
    this._ensureWorkspaces(session.n_workspaces);

    // Phase 3: Launch apps
    await this._launchApps(session.windows);

    // Phase 4: Wait for all windows to be positioned
    await this._waitForRestoration();

    // Phase 5: Re-enable TilingShell
    if (this.settings.get_boolean('disable-tilingshell-during-restore')) {
      TilingShellBridge.setAutoTiling(true);
      Log.debug('TilingShell auto-tiling re-enabled');
    }

    const duration = ((Date.now() - this.restoreStartTime) / 1000).toFixed(1);
    Notification.success(
      `Session restored: ${session.windows.length} windows in ${duration}s`
    );

    Log.info(`Session restored successfully in ${duration}s`);
  }

  async _launchApps(windowInfos) {
    const appSystem = Shell.AppSystem.get_default();
    const runningApps = appSystem.get_running();
    const restoreInterval = this.settings.get_int('restore-interval');

    for (const windowInfo of windowInfos) {
      // Check if app is already running
      const isRunning = this._isAppRunning(runningApps, windowInfo);

      if (isRunning) {
        Log.debug(`${windowInfo.fingerprint.title} already running, skipping`);
        this.expectedWindows.set(
          windowInfo.fingerprint.getMatchKey(),
          windowInfo
        );
      } else {
        // Launch app
        if (windowInfo.app_info.desktop_file) {
          const shellApp = appSystem.lookup_app(windowInfo.app_info.desktop_file);
          if (shellApp) {
            Log.info(`Launching: ${windowInfo.fingerprint.title}`);
            shellApp.launch(0, windowInfo.position.workspace);
          }
        } else {
          // Launch via command line
          this._launchViaCmd(windowInfo);
        }

        this.expectedWindows.set(
          windowInfo.fingerprint.getMatchKey(),
          windowInfo
        );
      }

      // Wait before launching next app
      await new Promise(r => setTimeout(r, restoreInterval));
    }
  }

  _isAppRunning(runningApps, windowInfo) {
    if (!windowInfo.app_info.desktop_file) {
      return false;
    }

    for (const app of runningApps) {
      if (app.get_id() === windowInfo.app_info.desktop_file) {
        return true;
      }
    }

    return false;
  }

  _launchViaCmd(windowInfo) {
    const cmd = windowInfo.fingerprint.cmd.join(' ');
    Log.info(`Launching via cmd: ${windowInfo.fingerprint.title}`);

    // Use SubprocessUtils to spawn command
    SubprocessUtils.trySpawnCmdstr(cmd);
  }

  _waitForRestoration() {
    return new Promise((resolve) => {
      const windowCreatedId = global.display.connect('window-created',
        this._onWindowCreated.bind(this)
      );

      // Timeout after 30 seconds
      const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30000, () => {
        global.display.disconnect(windowCreatedId);
        resolve();
        return GLib.SOURCE_REMOVE;
      });

      this._timeoutId = timeoutId;
      this._windowCreatedId = windowCreatedId;
    });
  }

  _onWindowCreated(display, metaWindow) {
    if (this._shouldIgnoreWindow(metaWindow)) {
      return;
    }

    const fingerprint = new WindowFingerprint(metaWindow);
    const matchKey = fingerprint.getMatchKey();

    if (!this.expectedWindows.has(matchKey)) {
      return;
    }

    const windowInfo = this.expectedWindows.get(matchKey);
    Log.debug(`Matched window: ${fingerprint.title}`);

    // Position the window
    this._positionWindow(metaWindow, windowInfo);

    // Mark as positioned
    this.expectedWindows.delete(matchKey);
    this.positionedWindows.add(matchKey);

    // Check if restoration is complete
    if (this.expectedWindows.size === 0) {
      this._completeRestoration();
    }
  }

  async _positionWindow(metaWindow, savedWindow) {
    const position = savedWindow.position;
    const state = savedWindow.state;

    // Step 1: Move to monitor first (Wayland requirement)
    await this._moveToMonitor(metaWindow, position.monitor);

    // Step 2: Move to workspace
    await this._moveToWorkspace(metaWindow, position.workspace);

    // Step 3: Restore position and size
    await this._restoreGeometry(metaWindow, position, state);

    // Step 4: Restore window state
    this._restoreState(metaWindow, state);
  }

  _moveToMonitor(metaWindow, monitorIndex) {
    return new Promise((resolve) => {
      const currentMonitor = metaWindow.get_monitor();

      if (currentMonitor === monitorIndex) {
        resolve();
        return;
      }

      Log.debug(`Moving ${metaWindow.get_title()} to monitor ${monitorIndex}`);

      const id = global.display.connect('window-entered-monitor',
        (dsp, num, w) => {
          if (w === metaWindow) {
            global.display.disconnect(id);
            resolve();
          }
        }
      );

      metaWindow.move_to_monitor(monitorIndex);

      // Timeout fallback
      setTimeout(() => {
        global.display.disconnect(id);
        resolve();
      }, 1000);
    });
  }

  _moveToWorkspace(metaWindow, workspaceIndex) {
    const currentWorkspace = metaWindow.get_workspace()?.index();
    
    if (currentWorkspace === workspaceIndex) {
      return;
    }

    Log.debug(`Moving ${metaWindow.get_title()} to workspace ${workspaceIndex}`);
    metaWindow.change_workspace_by_index(workspaceIndex, false);
  }

  async _restoreGeometry(metaWindow, position, state) {
    const rect = metaWindow.get_frame_rect();

    // Handle maximized state
    if (state.maximized && metaWindow.is_maximized()) {
      // Wait for window to be ready before restoring geometry
      await new Promise(r => setTimeout(r, 100));
    } else if (state.maximized) {
      metaWindow.unmaximize();
      await new Promise(r => setTimeout(r, 50));
    }

    // Move and resize
    metaWindow.move_frame(true, position.x, position.y);
    metaWindow.move_resize_frame(
      true,  // user_op
      position.x,
      Math.max(position.y, 0),  // Ensure non-negative Y
      position.width,
      position.height
    );

    // Wait for Wayland to apply
    await new Promise(r => setTimeout(r, 100));
  }

  _restoreState(metaWindow, state) {
    if (state.always_on_top && !metaWindow.is_above()) {
      Log.debug(`Making ${metaWindow.get_title()} always on top`);
      metaWindow.make_above();
    }

    if (state.sticky && !metaWindow.is_on_all_workspaces()) {
      Log.debug(`Making ${metaWindow.get_title()} sticky`);
      metaWindow.stick();
    }

    if (state.maximized && !metaWindow.is_maximized()) {
      Log.debug(`Maximizing ${metaWindow.get_title()}`);
      metaWindow.maximize();
    }

    if (state.minimized && !metaWindow.is_minimized()) {
      metaWindow.minimize();
    }
  }

  _ensureWorkspaces(nWorkspaces) {
    const workspaceManager = global.workspace_manager;
    const currentCount = workspaceManager.get_n_workspaces();

    if (currentCount < nWorkspaces) {
      for (let i = currentCount; i < nWorkspaces; i++) {
        workspaceManager.append_new_workspace(false, 0);
        Log.debug(`Created workspace ${i}`);
      }
    }
  }

  _loadSession(sessionName) {
    const filePath = GLib.build_filenamev([
      this.storagePath,
      `${sessionName}.json`
    ]);

    const file = Gio.File.new_for_path(filePath);
    if (!file.query_exists(null)) {
      return null;
    }

    const [success, contents] = file.load_contents(null);
    if (!success) {
      return null;
    }

    return JSON.parse(contents);
  }

  _completeRestoration() {
    Log.info('All windows positioned');

    // Clean up signal handlers
    if (this._windowCreatedId) {
      global.display.disconnect(this._windowCreatedId);
    }

    if (this._timeoutId) {
      GLib.Source.remove(this._timeoutId);
    }
  }
}
```

### TilingShellBridge Module

**Responsibility**: Coordinate with TilingShell extension

```javascript
class TilingShellBridge {
  static SETTINGS_KEY = 'enable-autotiling';
  static TILINGSHELL_SCHEMA = 'org.gnome.shell.extensions.tilingshell';

  static getAutoTiling() {
    try {
      const settings = new Gio.Settings({
        schema_id: this.TILINGSHELL_SCHEMA
      });
      return settings.get_boolean(this.SETTINGS_KEY);
    } catch (e) {
      Log.error('Could not read TilingShell settings', e);
      return null;
    }
  }

  static setAutoTiling(enabled) {
    try {
      const settings = new Gio.Settings({
        schema_id: this.TILINGSHELL_SCHEMA
      });
      const current = settings.get_boolean(this.SETTINGS_KEY);

      if (current !== enabled) {
        settings.set_boolean(this.SETTINGS_KEY, enabled);
        Log.info(`TilingShell auto-tiling set to ${enabled}`);
      }
    } catch (e) {
      Log.error('Could not set TilingShell settings', e);
    }
  }

  static isAvailable() {
    try {
      const settings = new Gio.Settings({
        schema_id: this.TILINGSHELL_SCHEMA
      });
      return settings !== null;
    } catch {
      return false;
    }
  }
}
```

### DBusAPI Module

**Responsibility**: Provide external control interface

```javascript
class DBusAPI {
  constructor(extension) {
    this.extension = extension;
    this.dbus = null;
  }

  enable() {
    // Create D-Bus interface
    const xml = `
      <node name="/">
        <interface name="org.gnome.Shell.Extensions.SessionManager">
          <method name="SaveSession">
            <arg name="sessionName" type="s" direction="in"/>
            <arg name="success" type="b" direction="out"/>
          </method>
          <method name="RestoreSession">
            <arg name="sessionName" type="s" direction="in"/>
            <arg name="success" type="b" direction="out"/>
          </method>
          <method name="ListSessions">
            <arg name="sessions" type="as" direction="out"/>
          </method>
          <signal name="SessionSaved">
            <arg name="sessionName" type="s"/>
          </signal>
          <signal name="SessionRestored">
            <arg name="sessionName" type="s"/>
            <arg name="windowCount" type="i"/>
          </signal>
        </interface>
      </node>
    `;

    const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
    this.dbus = Gio.DBusExportedObject.wrapJSObject(
      xml,
      this
    );

    bus.register_object(
      '/org/gnome/Shell/Extensions/SessionManager',
      this.dbus
    );

    Log.info('D-Bus API enabled');
  }

  SaveSession(sessionName) {
    try {
      this.extension.saveSession(sessionName);
      this.SessionSaved(sessionName);
      return true;
    } catch (e) {
      Log.error('SaveSession failed', e);
      return false;
    }
  }

  RestoreSession(sessionName) {
    try {
      this.extension.restoreSession(sessionName);
      this.SessionRestored(sessionName, 0);
      return true;
    } catch (e) {
      Log.error('RestoreSession failed', e);
      return false;
    }
  }

  ListSessions() {
    const sessionsDir = GLib.build_filenamev([
      GLib.get_user_config_dir(),
      'session-manager',
      'sessions'
    ]);

    const dir = Gio.File.new_for_path(sessionsDir);
    const enumerator = dir.enumerate_children(
      'standard::name',
      null
    );

    const sessions = [];
    let fileInfo;

    while ((fileInfo = enumerator.next_file(null)) !== null) {
      if (fileInfo.get_file_type() === Gio.FileType.REGULAR) {
        const name = fileInfo.get_name();
        if (name.endsWith('.json')) {
          sessions.push(name.replace('.json', ''));
        }
      }
    }

    return sessions;
  }

  disable() {
    if (this.dbus) {
      const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
      bus.unregister_object('/org/gnome/Shell/Extensions/SessionManager');
      this.dbus = null;
      Log.info('D-Bus API disabled');
    }
  }
}
```

---

## Main Extension Class

```javascript
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {WindowTracker} from './src/windowTracker.js';
import {SessionSaver} from './src/sessionSaver.js';
import {SessionRestorer} from './src/sessionRestorer.js';
import {DBusAPI} from './src/dbusApi.js';
import {Indicator} from './ui/indicator.js';
import * as Log from './src/log.js';
import * as Settings from './src/settings.js';

export default class SessionManagerExtension extends Extension {
  enable() {
    Log.info('Enabling Session Manager');

    // Initialize settings
    this.settings = Settings.getSettings();

    // Initialize core modules
    this.windowTracker = new WindowTracker();
    this.sessionSaver = new SessionSaver(this.windowTracker);
    this.sessionRestorer = new SessionRestorer(
      this.windowTracker,
      this.settings
    );

    // Initialize UI
    this.indicator = new Indicator(this);
    this.indicator.enable();

    // Initialize D-Bus API
    this.dbusApi = new DBusAPI(this);
    this.dbusApi.enable();

    // Setup keyboard shortcuts
    this._setupShortcuts();

    Log.info('Session Manager enabled');
  }

  disable() {
    Log.info('Disabling Session Manager');

    // Clean up shortcuts
    this._cleanupShortcuts();

    // Clean up D-Bus
    this.dbusApi?.disable();
    this.dbusApi = null;

    // Clean up UI
    this.indicator?.disable();
    this.indicator = null;

    // Clean up modules
    this.sessionRestorer?.destroy();
    this.sessionRestorer = null;

    this.sessionSaver = null;

    this.windowTracker?.destroy();
    this.windowTracker = null;

    this.settings = null;

    Log.info('Session Manager disabled');
  }

  saveSession(sessionName = 'current') {
    Log.info(`Saving session: ${sessionName}`);
    const session = this.sessionSaver.saveSession(sessionName);
    Notification.success(`Session "${sessionName}" saved with ${session.windows.length} windows`);
    return session;
  }

  restoreSession(sessionName = 'current') {
    Log.info(`Restoring session: ${sessionName}`);
    return this.sessionRestorer.restoreSession(sessionName);
  }

  _setupShortcuts() {
    this.shortcuts = [];
    const mode = Main.wm.addKeybinding(
      this.settings.get_string('save-shortcut'),
      () => this.saveSession()
    );
    this.shortcuts.push(mode);

    const restoreMode = Main.wm.addKeybinding(
      this.settings.get_string('restore-shortcut'),
      () => this.restoreSession()
    );
    this.shortcuts.push(restoreMode);
  }

  _cleanupShortcuts() {
    for (const mode of this.shortcuts) {
      Main.wm.removeKeybinding(mode);
    }
    this.shortcuts = [];
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
**Goal**: Working extension skeleton that loads without errors

**Tasks**:
1. Create extension with `gnome-extensions create`
   ```bash
   gnome-extensions create --interactive
   ```
   - Name: Session Manager
   - Description: Reliable window session management for Wayland
   - UUID: session-manager@mario.work
   - Template: Indicator

2. Update `metadata.json`
   - Set shell-version: [49]
   - Add proper description and URL

3. Create `schemas/` directory and GSchema XML
   - Define all settings keys
   - Compile schemas: `glib-compile-schemas schemas/`

4. Create basic `extension.js`
   - Extend Extension class
   - Implement empty enable/disable
   - Test: Extension loads, no errors in journalctl

5. Create basic indicator UI
   - Panel icon with dropdown menu
   - Save button (placeholder)
   - Restore button (placeholder)
   - Test: Icon appears in panel, menu opens

**Deliverables**:
- Extension loads without errors
- Panel icon visible
- No GNOME Shell crashes

---

### Phase 2: Window Tracking (Day 3)
**Goal**: Track all windows with unique fingerprints

**Tasks**:
1. Implement `WindowFingerprint` class
   - Read PID from metaWindow
   - Read wm_class
   - Read stable_sequence
   - Read cmd_line from /proc/{pid}/cmdline
   - Implement getMatchKey() method

2. Implement `WindowTracker` class
   - Connect to `window-created` signal
   - Connect to `window-destroyed` signal
   - Implement window filtering (ignore non-NORMAL types)
   - Maintain Map of windows
   - Implement findWindowByFingerprint()

3. Test window tracking
   - Open various apps (Terminal, Vivaldi, VS Code)
   - Check journalctl for fingerprint logs
   - Verify window destruction is tracked

**Deliverables**:
- All windows tracked with unique fingerprints
- Logs show proper window identification
- No memory leaks (windows map cleared on destroy)

---

### Phase 3: Session Saving (Day 4)
**Goal**: Serialize window state to JSON

**Tasks**:
1. Implement `SessionSaver` class
   - Save to `~/.config/session-manager/sessions/`
   - Collect monitor info
   - Collect window info with positions
   - Collect window state (maximized, etc.)
   - Collect app info (desktop files)

2. Implement JSON serialization
   - Format with proper indentation
   - Include timestamp and version
   - Handle Gio file operations

3. Test session saving
   - Open 4-6 windows across 2 monitors and 2 workspaces
   - Save session as "test"
   - Verify JSON file is valid: `cat ~/.config/session-manager/sessions/test.json | jq`
   - Verify all windows captured

**Deliverables**:
- Sessions saved to proper directory
- JSON is valid and complete
- All window properties captured correctly

---

### Phase 4: App Launching (Day 5)
**Goal**: Restore apps from session

**Tasks**:
1. Implement app detection
   - Check Shell.AppSystem.get_running()
   - Skip already-running apps
   - Detect if .desktop file exists

2. Implement app launching
   - Launch via Shell.App.launch() if .desktop available
   - Launch via cmd execution if no .desktop
   - Handle app-specific workspace targeting

3. Test app launching
   - Clear all windows
   - Restore session with 4-6 apps
   - Verify all apps launch
   - Check journalctl for launch logs

**Deliverables**:
- All apps from saved session launch
- Already-running apps are skipped
- Command-line apps launch correctly

---

### Phase 5: Window Positioning (Days 6-7)
**Goal**: Restore exact window positions, sizes, monitors, workspaces

**Tasks**:
1. Implement monitor switching
   - Use Meta.Window.move_to_monitor()
   - Wait for `window-entered-monitor` signal (Wayland)
   - Handle monitor index validation

2. Implement workspace management
   - Create workspaces as needed
   - Move windows to correct workspace
   - Handle workspace cleanup

3. Implement geometry restoration
   - Use Meta.Window.move_resize_frame()
   - Handle maximized state
   - Add Wayland delay after positioning

4. Implement window state restoration
   - Restore maximized
   - Restore minimized
   - Restore always-on-top
   - Restore sticky

5. Test full positioning
   - Restore "test" session
   - Verify each window is on correct monitor
   - Verify each window is on correct workspace
   - Verify exact positions match (within 1-2 pixels)
   - Verify maximized state matches

**Deliverables**:
- Windows appear on correct monitors
- Windows appear in correct workspaces
- Window positions are pixel-perfect
- Window states (maximized, etc.) match saved state

---

### Phase 6: TilingShell Integration (Day 8)
**Goal**: Coordinate with TilingShell during restore

**Tasks**:
1. Implement `TilingShellBridge` class
   - Read TilingShell GSettings schema
   - Read `enable-autotiling` setting
   - Set `enable-autotiling` to false
   - Set `enable-autotiling` back to true

2. Test TilingShell coordination
   - Save session with TilingShell active
   - Disable TilingShell auto-tiling
   - Restore session
   - Re-enable TilingShell auto-tiling
   - Verify TilingShell auto-tiles new windows after restore

3. Handle missing TilingShell
   - Graceful degradation if TilingShell not installed
   - Log warning and continue without integration

**Deliverables**:
- TilingShell disabled during restore
- TilingShell re-enabled after restore
- No conflicts between extensions
- Works with or without TilingShell

---

### Phase 7: D-Bus API (Day 9)
**Goal**: External control via command line

**Tasks**:
1. Implement D-Bus interface XML
   - Define SaveSession method
   - Define RestoreSession method
   - Define ListSessions method
   - Define signals for session saved/restored

2. Implement D-Bus registration
   - Register object on session bus
   - Handle method calls
   - Emit signals on events

3. Test D-Bus API
   - Save session: `gdbus call ... SaveSession '"test"'`
   - List sessions: `gdbus call ... ListSessions`
   - Restore session: `gdbus call ... RestoreSession '"test"'`
   - Verify signals are emitted

**Deliverables**:
- D-Bus methods work from command line
- D-Bus signals fire on events
- External scripts can control extension

**CLI Examples**:
```bash
# Save current session
gdbus call --session \
  --dest org.gnome.Shell.Extensions.SessionManager \
  --object-path /org/gnome/Shell/Extensions/SessionManager \
  --method org.gnome.Shell.Extensions.SessionManager.SaveSession \
  '"my-work-session"'

# Restore session
gdbus call --session \
  --dest org.gnome.Shell.Extensions.SessionManager \
  --object-path /org/gnome/Shell/Extensions/SessionManager \
  --method org.gnome.Shell.Extensions.SessionManager.RestoreSession \
  '"my-work-session"'

# List all sessions
gdbus call --session \
  --dest org.gnome.Shell.Extensions.SessionManager \
  --object-path /org/gnome/Shell/Extensions/SessionManager \
  --method org.gnome.Shell.Extensions.SessionManager.ListSessions
```

---

### Phase 8: UI & Keyboard Shortcuts (Day 10)
**Goal**: Complete user interface

**Tasks**:
1. Complete indicator menu
   - Save Session... (opens naming dialog)
   - Restore Session → submenu with list
   - Preferences
   - Separator
   - Quick save (Ctrl+Alt+Shift+S)
   - Quick restore (Ctrl+Alt+Shift+R)

2. Implement session naming dialog
   - Simple text entry
   - Save/Cancel buttons
   - Default to "current"

3. Implement preferences window
   - Restore interval slider (50-500ms)
   - TilingShell integration toggle
   - Debug mode toggle
   - Shortcut editors

4. Implement keyboard shortcuts
   - Bind Ctrl+Alt+S to save
   - Bind Ctrl+Alt+R to restore
   - Use Main.wm.addKeybinding()

5. Test UI workflow
   - Save session with custom name
   - Restore from menu
   - Use keyboard shortcuts
   - Change preferences
   - Verify all controls work

**Deliverables**:
- Intuitive panel menu
- Keyboard shortcuts work
- Preferences accessible
- Smooth user workflow

---

### Phase 9: Testing & Debugging (Days 11-12)
**Goal**: Comprehensive testing across scenarios

**Tasks**:
1. Create test sessions
   - Session A: 2 windows on monitor 0
   - Session B: 4 windows across 2 monitors
   - Session C: Windows on workspace 1 and 2
   - Session D: Mixed apps (Flatpak, native, cmd-line)

2. Test each session
   - Save and restore each session
   - Verify window positions match
   - Verify monitor assignments
   - Verify workspace assignments
   - Verify app states

3. Edge case testing
   - Unplug one monitor → restore session
   - Replug monitor → restore session
   - App with multiple windows (Vivaldi)
   - App without .desktop file
   - Maximally stretched window
   - Minimized window
   - Always-on-top window

4. TilingShell scenarios
   - Save session with TilingShell auto-tiling ON
   - Restore → verify TilingShell was disabled
   - Verify new windows auto-tile after restore
   - Save session with TilingShell auto-tiling OFF

5. Enable debug logging
   - Test with Settings debug-mode=true
   - Review journalctl logs
   - Verify proper error handling
   - Check for memory leaks

6. Performance testing
   - Restore 10-window session
   - Measure time to complete
   - Test with fast/slow intervals
   - Verify no GNOME Shell lag

7. Bug fixes
   - Fix any issues discovered
   - Improve error messages
   - Add missing edge cases

**Deliverables**:
- All test scenarios pass
- No crashes or hangs
- Logs are clear and helpful
- Performance is acceptable (<5s for 10 windows)

---

### Phase 10: Documentation (Day 13)
**Goal**: Complete documentation for users and developers

**Tasks**:
1. Create README.md
   - Project overview
   - Features list
   - Installation instructions
   - Usage guide
   - Keyboard shortcuts reference
   - D-Bus API documentation
   - Troubleshooting section

2. Create architecture diagram
   - Visual representation of modules
   - Data flow diagram
   - Interaction with GNOME Shell

3. Add inline code comments
   - Document complex logic
   - Explain Wayland-specific workarounds
   - Note TilingShell integration points

4. Create CHANGELOG.md
   - Version history
   - Breaking changes
   - Known issues

**Deliverables**:
- Comprehensive README
- Clear documentation
- Easy to install and use

---

## Testing Strategy

### Unit Testing (Manual)
For each module, create test functions:
```javascript
function testWindowFingerprint() {
  const mockWindow = { /* mock Meta.Window */ };
  const fp = new WindowFingerprint(mockWindow);
  
  assert(fp.pid !== null);
  assert(fp.wmClass !== null);
  assert(fp.getMatchKey().includes(':'));
}
```

### Integration Testing
1. Full save/restore cycle
2. Multiple consecutive saves
3. D-Bus control from external script
4. TilingShell interaction
5. Multi-monitor scenarios

### Stress Testing
1. 20+ windows across 4 workspaces
2. Rapid save/restore cycles
3. Session with missing apps (uninstalled)
4. Session with renamed apps

---

## Known Limitations

1. **Wayland Timing**: Position restoration requires waiting for signals, not instantaneous
2. **Window Title Changes**: If app changes title, matching may fail (fallback to stable_sequence helps)
3. **App Version Updates**: If app updates and wm_class changes, won't match
4. **Flatpak Apps**: May have different cmd_line structure than native apps
5. **Multi-window Apps**: Relies on launch order matching save order

---

## Future Enhancements (Post-V1)

1. Named sessions support (currently: single "current" state)
2. Auto-save before logout
3. Auto-restore on login (optional)
4. Session templates (save window arrangements without specific apps)
5. Visual session editor (drag and drop windows)
6. Integration with other extensions (e.g., Workspace Switcher)
7. Session backup and versioning
8. Import/export sessions

---

## Success Criteria

Extension is complete when:
- ✅ Loads without errors on GNOME 49
- ✅ Tracks all windows with unique fingerprints
- ✅ Saves complete session state to JSON
- ✅ Launches all apps from saved session
- ✅ Restores windows to exact positions (±2 pixels)
- ✅ Restores windows to correct monitors and workspaces
- ✅ Restores window states (maximized, minimized, etc.)
- ✅ Coordinates with TilingShell (no conflicts)
- ✅ Works via keyboard shortcuts (Ctrl+Alt+S, Ctrl+Alt+R)
- ✅ Works via D-Bus API (gdbus calls)
- ✅ Panel indicator with menu
- ✅ Preferences window functional
- ✅ Handles 10+ windows without performance issues
- ✅ Handles missing apps gracefully (silent skip)
- ✅ Logs helpful information to journalctl
- ✅ No GNOME Shell crashes or hangs
- ✅ Works on both single and dual-monitor setups

---

## Development Notes

### Wayland-Specific Considerations

1. **Monitor Switching**: Always wait for `window-entered-monitor` signal before moving to workspace
2. **Geometry Restoration**: Add 50-100ms delay after move_resize_frame() on Wayland
3. **State Restoration**: Apply maximized state AFTER geometry, not before
4. **Signal Timing**: Some signals fire asynchronously; don't assume immediate state changes

### Debugging

```bash
# View extension logs
journalctl -f -o cat /usr/bin/gnome-shell | grep SessionManager

# Reload extension after code changes
Alt+F2 → "restart"
gnome-extensions disable session-manager@mario.work
gnome-extensions enable session-manager@mario.work

# Test in nested session (Wayland)
dbus-run-session gnome-shell --devkit --wayland
```

### Performance Profile

Target metrics (for 10-window session):
- Save: <100ms
- App launching: <1s (100ms interval × 10 windows)
- Positioning: <2s (per window)
- Total restore: <5s

---

## Appendix: Example Usage

### Typical Workflow

```bash
# Set up workspace (windows in perfect arrangement)
# Press Ctrl+Alt+S
# Enter session name: "Development"
# Session saved

# Close all windows (logout, reboot, etc.)

# After reboot, restore session
# Press Ctrl+Alt+R
# OR from menu: Session Manager → Restore Session → Development
# All windows restored to exact positions
```

### Advanced: D-Bus Control Script

```bash
#!/bin/bash
# save-workspace.sh

SESSION_NAME="${1:-current}"

gdbus call --session \
  --dest org.gnome.Shell.Extensions.SessionManager \
  --object-path /org/gnome/Shell/Extensions/SessionManager \
  --method org.gnome.Shell.Extensions.SessionManager.SaveSession \
  "\"$SESSION_NAME\""

echo "Session '$SESSION_NAME' saved"
```

```bash
#!/bin/bash
# restore-workspace.sh

SESSION_NAME="${1:-current}"

gdbus call --session \
  --dest org.gnome.Shell.Extensions.SessionManager \
  --object-path /org/gnome/Shell/Extensions/SessionManager \
  --method org.gnome.Shell.Extensions.SessionManager.RestoreSession \
  "\"$SESSION_NAME\""

echo "Session '$SESSION_NAME' restored"
```

Usage:
```bash
# Save current workspace
chmod +x save-workspace.sh
./save-workspace.sh my-setup

# Later, restore it
./restore-workspace.sh my-setup
```

---

## End of Plan

This plan provides a complete roadmap for building a robust, reliable window session manager extension for your Fedora 43 (GNOME 49) system. The extension will integrate cleanly with TilingShell and provide exact window restoration across your dual-monitor setup.

Total estimated development time: **13 days**
Total estimated testing time: **2-3 days**
Total estimated time to completion: **15-16 days**

Ready to begin implementation when you approve.
