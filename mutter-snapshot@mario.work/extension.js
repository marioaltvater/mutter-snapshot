import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class MutterSnapshotExtension extends Extension {
  enable() {
    console.log('[MutterSnapshot] Extension enabled');
  }

  disable() {
    console.log('[MutterSnapshot] Extension disabled');
  }
}
