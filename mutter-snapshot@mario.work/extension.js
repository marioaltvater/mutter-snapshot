import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindowTracker} from './src/windowTracker.js';
import {SessionSaver} from './src/sessionSaver.js';

export default class MutterSnapshotExtension extends Extension {
  enable() {
    console.log('[MutterSnapshot] Extension enabled');
    this.windowTracker = new WindowTracker();
    this.sessionSaver = new SessionSaver(this.windowTracker);
    console.log('[MutterSnapshot] WindowTracker initialized');
    console.log('[MutterSnapshot] SessionSaver initialized');
    console.log('[MutterSnapshot] Current windows tracked:', this.windowTracker.getAllWindows().length);

    global.mutterSnapshot = {
      saveSession: (name) => this.sessionSaver.saveSession(name),
      listSessions: () => this.sessionSaver.listSessions(),
      loadSession: (filename) => this.sessionSaver.loadSession(filename)
    };
  }

  disable() {
    console.log('[MutterSnapshot] Extension disabled');
    this.windowTracker?.destroy();
    this.windowTracker = null;
    this.sessionSaver = null;
    delete global.mutterSnapshot;
  }
}
