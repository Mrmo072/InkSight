import hotkeyModule from '../../node_modules/is-hotkey/lib/index.js';

const resolvedModule = hotkeyModule && typeof hotkeyModule === 'object' ? hotkeyModule : {};
const defaultHotkey =
  typeof hotkeyModule === 'function'
    ? hotkeyModule
    : typeof resolvedModule.default === 'function'
      ? resolvedModule.default
      : null;

const isHotkey =
  typeof resolvedModule.isHotkey === 'function'
    ? resolvedModule.isHotkey
    : defaultHotkey;

const isCodeHotkey =
  typeof resolvedModule.isCodeHotkey === 'function'
    ? resolvedModule.isCodeHotkey
    : (hotkey, event) => isHotkey(hotkey, event);

const isKeyHotkey =
  typeof resolvedModule.isKeyHotkey === 'function'
    ? resolvedModule.isKeyHotkey
    : (hotkey, event) => isHotkey(hotkey, { byKey: true }, event);

const parseHotkey =
  typeof resolvedModule.parseHotkey === 'function'
    ? resolvedModule.parseHotkey
    : undefined;

const compareHotkey =
  typeof resolvedModule.compareHotkey === 'function'
    ? resolvedModule.compareHotkey
    : undefined;

const toKeyCode =
  typeof resolvedModule.toKeyCode === 'function'
    ? resolvedModule.toKeyCode
    : undefined;

const toKeyName =
  typeof resolvedModule.toKeyName === 'function'
    ? resolvedModule.toKeyName
    : undefined;

if (typeof isHotkey !== 'function') {
  throw new Error('Failed to resolve is-hotkey compatibility wrapper.');
}

export default isHotkey;
export {
  compareHotkey,
  isCodeHotkey,
  isHotkey,
  isKeyHotkey,
  parseHotkey,
  toKeyCode,
  toKeyName
};
