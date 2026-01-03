import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class WindowFingerprint {
  constructor(metaWindow) {
    this.pid = metaWindow.get_pid();
    this.wmClass = metaWindow.get_wm_class();
    this.stableSequence = metaWindow.get_stable_sequence();
    this.title = metaWindow.get_title();
    this.cmdLine = this._getCmdLine(this.pid);
  }

  getMatchKey() {
    if (this.stableSequence) {
      return `${this.stableSequence}:${this.wmClass}`;
    }
    return `${this.title}:${this.wmClass}`;
  }

  _getCmdLine(pid) {
    const path = `/proc/${pid}/cmdline`;
    const file = Gio.File.new_for_path(path);

    if (!file.query_exists(null)) {
      return null;
    }

    try {
      const [success, contents] = file.load_contents(null);
      if (!success) {
        return null;
      }

      const content = contents instanceof Uint8Array ? contents : new TextDecoder().decode(contents);
      const args = content.split('\0').filter(arg => arg.length > 0);
      return args;
    } catch (e) {
      return null;
    }
  }
}
