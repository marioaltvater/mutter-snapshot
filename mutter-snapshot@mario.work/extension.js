import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindowTracker} from './src/windowTracker.js';

export default class MutterSnapshotExtension extends Extension {
  enable() {
    console.log('[MutterSnapshot] Extension enabled');
    this.windowTracker = new WindowTracker();
    console.log('[MutterSnapshot] WindowTracker initialized');
    console.log('[MutterSnapshot] Current windows tracked:', this.windowTracker.getAllWindows().length);
  }

  disable() {
    console.log('[MutterSnapshot] Extension disabled');
    this.windowTracker?.destroy();
    this.windowTracker = null;
  }
}
