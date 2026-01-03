import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {WindowFingerprint} from './windowFingerprint.js';

export class AppLauncher {
  constructor(windowTracker) {
    this.windowTracker = windowTracker;
    this.desktopDirs = [
      '/usr/share/applications',
      '/usr/local/share/applications',
      `${GLib.get_user_data_dir()}/applications`
    ];
  }

  async launchSession(sessionData) {
    console.log(`[MutterSnapshot] Launching session: ${sessionData.name}`);
    const launchedApps = [];

    for (const windowInfo of sessionData.windows) {
      try {
        const launched = await this._launchWindow(windowInfo);
        if (launched) {
          launchedApps.push(windowInfo);
        }
      } catch (e) {
        console.error(`[MutterSnapshot] Failed to launch window: ${e.message}`);
      }
    }

    console.log(`[MutterSnapshot] Launched ${launchedApps.length}/${sessionData.windows.length} apps`);
    return launchedApps;
  }

  async _launchWindow(windowInfo) {
    const fingerprint = windowInfo.fingerprint;

    if (!fingerprint.cmdLine || fingerprint.cmdLine.length === 0) {
      console.log(`[MutterSnapshot] No command line for ${fingerprint.title}, skipping`);
      return false;
    }

    console.log(`[MutterSnapshot] Launching: ${fingerprint.title}`);

    let launched = false;
    let metaWindow = this.windowTracker.findWindowByFingerprint(fingerprint);

    if (metaWindow) {
      console.log(`[MutterSnapshot] App already running: ${fingerprint.title}`);
      launched = true;
    } else {
      const desktopFile = this._findDesktopFile(fingerprint);
      
      if (desktopFile) {
        console.log(`[MutterSnapshot] Launching via .desktop: ${desktopFile}`);
        launched = await this._launchViaDesktop(desktopFile);
      } else {
        console.log(`[MutterSnapshot] Launching via command line`);
        launched = await this._launchViaCmdLine(fingerprint.cmdLine);
      }

      if (launched) {
        metaWindow = await this._waitForWindow(fingerprint, 10000);
        if (!metaWindow) {
          console.log(`[MutterSnapshot] Window did not appear for ${fingerprint.title}`);
          return false;
        }
      }
    }

    if (metaWindow && windowInfo.workspace !== undefined) {
      this._moveToWorkspace(metaWindow, windowInfo.workspace);
    }

    return launched;
  }

  _findDesktopFile(fingerprint) {
    const appName = this._extractAppName(fingerprint);

    for (const dir of this.desktopDirs) {
      const dirFile = Gio.File.new_for_path(dir);
      if (!dirFile.query_exists(null)) {
        continue;
      }

      try {
        const enumerator = dirFile.enumerate_children(
          'standard::name,standard::type',
          Gio.FileQueryInfoFlags.NONE,
          null
        );

        let fileInfo;
        while ((fileInfo = enumerator.next_file(null)) !== null) {
          if (fileInfo.get_file_type() === Gio.FileType.REGULAR && 
              fileInfo.get_name().endsWith('.desktop')) {
            const desktopPath = `${dir}/${fileInfo.get_name()}`;
            if (this._matchesDesktopFile(desktopPath, appName, fingerprint.wmClass)) {
              return desktopPath;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  _matchesDesktopFile(desktopPath, appName, wmClass) {
    try {
      const file = Gio.File.new_for_path(desktopPath);
      const [success, contents] = file.load_contents(null);
      if (!success) {
        return false;
      }

      const content = contents instanceof Uint8Array 
        ? new TextDecoder().decode(contents) 
        : contents;

      const lines = content.split('\n');
      for (const line of lines) {
        const execMatch = line.match(/^Exec=(.+)$/);
        if (execMatch) {
          const execPath = execMatch[1].trim().split(' ')[0];
          const execName = execPath.split('/').pop();
          if (execName === appName || execName.toLowerCase() === appName.toLowerCase()) {
            return true;
          }
        }

        const wmClassMatch = line.match(/^StartupWMClass=(.+)$/);
        if (wmClassMatch && wmClassMatch[1].trim() === wmClass) {
          return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  _extractAppName(fingerprint) {
    if (fingerprint.cmdLine && fingerprint.cmdLine.length > 0) {
      const cmdPath = fingerprint.cmdLine[0];
      return cmdPath.split('/').pop();
    }
    return fingerprint.wmClass || '';
  }

  async _launchViaDesktop(desktopFile) {
    try {
      const result = GLib.spawn_async(
        null,
        ['gio', 'launch', desktopFile],
        null,
        GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
      );

      return result !== null;
    } catch (e) {
      console.error(`[MutterSnapshot] Failed to launch .desktop file: ${e.message}`);
      return false;
    }
  }

  async _launchViaCmdLine(cmdLine) {
    try {
      const result = GLib.spawn_async(
        null,
        cmdLine,
        null,
        GLib.SpawnFlags.SEARCH_PATH_FROM_ENVP | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
      );

      return result !== null;
    } catch (e) {
      console.error(`[MutterSnapshot] Failed to launch command line: ${e.message}`);
      return false;
    }
  }

  async _waitForWindow(fingerprint, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const metaWindow = this.windowTracker.findWindowByFingerprint(fingerprint);
      if (metaWindow) {
        console.log(`[MutterSnapshot] Window appeared: ${fingerprint.title}`);
        return metaWindow;
      }
      await this._sleep(200);
    }

    return null;
  }

  _sleep(ms) {
    return new Promise(resolve => {
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
      });
    });
  }

  _moveToWorkspace(metaWindow, workspaceIndex) {
    try {
      const workspaceManager = global.workspace_manager;
      const targetWorkspace = workspaceManager.get_workspace_by_index(workspaceIndex);
      
      if (targetWorkspace) {
        metaWindow.change_workspace(targetWorkspace);
        console.log(`[MutterSnapshot] Moved window to workspace ${workspaceIndex}`);
      } else {
        console.warn(`[MutterSnapshot] Workspace ${workspaceIndex} does not exist`);
      }
    } catch (e) {
      console.error(`[MutterSnapshot] Failed to move window to workspace: ${e.message}`);
    }
  }
}
