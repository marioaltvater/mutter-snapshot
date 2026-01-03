import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {WindowFingerprint} from './windowFingerprint.js';

export class SessionSaver {
  constructor(windowTracker) {
    this.windowTracker = windowTracker;
    this.configDir = GLib.get_user_config_dir();
    this.sessionsDir = `${this.configDir}/session-manager/sessions`;
    this._ensureSessionsDir();
  }

  _ensureSessionsDir() {
    const dir = Gio.File.new_for_path(this.sessionsDir);
    if (!dir.query_exists(null)) {
      dir.make_directory_with_parents(null);
      console.log(`[MutterSnapshot] Created sessions directory: ${this.sessionsDir}`);
    }
  }

  saveSession(name) {
    const sessionData = {
      name,
      timestamp: new Date().toISOString(),
      monitors: this._getMonitorInfo(),
      windows: this._getWindowInfo()
    };

    const filename = `${this._sanitizeName(name)}.json`;
    const filepath = `${this.sessionsDir}/${filename}`;
    const file = Gio.File.new_for_path(filepath);

    try {
      const json = JSON.stringify(sessionData, null, 2);
      file.replace_contents(
        json,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
      console.log(`[MutterSnapshot] Session saved: ${filepath}`);
      return filepath;
    } catch (e) {
      console.error(`[MutterSnapshot] Failed to save session: ${e.message}`);
      return null;
    }
  }

  _getMonitorInfo() {
    const monitors = [];
    const display = global.display;
    const nMonitors = display.get_n_monitors();

    for (let i = 0; i < nMonitors; i++) {
      const monitor = {
        index: i,
        width: display.get_monitor_geometry(i).width,
        height: display.get_monitor_geometry(i).height,
        x: display.get_monitor_geometry(i).x,
        y: display.get_monitor_geometry(i).y,
        is_primary: display.get_primary_monitor() === i,
        scale: display.get_monitor_scale(i)
      };
      monitors.push(monitor);
    }

    return monitors;
  }

  _getWindowInfo() {
    const windows = [];
    const trackedWindows = this.windowTracker.getAllWindows();

    for (const {metaWindow, fingerprint} of trackedWindows) {
      const rect = metaWindow.get_frame_rect();
      const windowInfo = {
        fingerprint: {
          pid: fingerprint.pid,
          wmClass: fingerprint.wmClass,
          stableSequence: fingerprint.stableSequence,
          title: fingerprint.title,
          cmdLine: fingerprint.cmdLine
        },
        monitor: metaWindow.get_monitor(),
        workspace: metaWindow.get_workspace().index(),
        geometry: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        state: {
          minimized: metaWindow.minimized,
          maximized: metaWindow.get_maximized(),
          above: metaWindow.is_above(),
          sticky: metaWindow.is_on_all_workspaces()
        }
      };
      windows.push(windowInfo);
    }

    return windows;
  }

  _sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  listSessions() {
    const dir = Gio.File.new_for_path(this.sessionsDir);
    const sessions = [];

    if (!dir.query_exists(null)) {
      return sessions;
    }

    const enumerator = dir.enumerate_children(
      'standard::name,standard::type',
      Gio.FileQueryInfoFlags.NONE,
      null
    );

    let fileInfo;
    while ((fileInfo = enumerator.next_file(null)) !== null) {
      if (fileInfo.get_file_type() === Gio.FileType.REGULAR) {
        const name = fileInfo.get_name();
        if (name.endsWith('.json')) {
          sessions.push({
            name: name.replace('.json', ''),
            filename: name,
            path: `${this.sessionsDir}/${name}`
          });
        }
      }
    }

    return sessions;
  }

  loadSession(filename) {
    const filepath = `${this.sessionsDir}/${filename}`;
    const file = Gio.File.new_for_path(filepath);

    try {
      const [success, contents] = file.load_contents(null);
      if (!success) {
        return null;
      }

      const content = contents instanceof Uint8Array 
        ? new TextDecoder().decode(contents) 
        : contents;
      return JSON.parse(content);
    } catch (e) {
      console.error(`[MutterSnapshot] Failed to load session: ${e.message}`);
      return null;
    }
  }
}
