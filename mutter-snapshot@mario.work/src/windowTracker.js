import Meta from 'gi://Meta';

import {WindowFingerprint} from './windowFingerprint.js';

export class WindowTracker {
  constructor() {
    this.windows = new Map();
    this.signals = [];
    this._connectSignals();
  }

  _connectSignals() {
    const windowCreatedId = global.display.connect('window-created',
      (display, metaWindow) => this._onWindowCreated(metaWindow)
    );
    this.signals.push([global.display, windowCreatedId]);

    const windowDestroyedId = global.display.connect('window-destroyed',
      (display, metaWindow) => this._onWindowDestroyed(metaWindow)
    );
    this.signals.push([global.display, windowDestroyedId]);
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

    console.log(`[MutterSnapshot] Window created: ${fingerprint.title} (${fingerprint.wmClass})`);
  }

  _onWindowDestroyed(metaWindow) {
    const fingerprint = new WindowFingerprint(metaWindow);
    this.windows.delete(fingerprint.getMatchKey());

    console.log(`[MutterSnapshot] Window destroyed: ${fingerprint.title}`);
  }

  _shouldIgnoreWindow(metaWindow) {
    const windowType = metaWindow.get_window_type();
    return windowType !== Meta.WindowType.NORMAL;
  }

  getAllWindows() {
    return Array.from(this.windows.values());
  }

  findWindowByFingerprint(fingerprint) {
    if (fingerprint.stableSequence) {
      const key1 = `${fingerprint.stableSequence}:${fingerprint.wmClass}`;
      if (this.windows.has(key1)) {
        return this.windows.get(key1).metaWindow;
      }
    }

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
