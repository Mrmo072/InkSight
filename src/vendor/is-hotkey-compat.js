const IS_MAC =
  typeof window !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);

const MODIFIERS = {
  alt: 'altKey',
  control: 'ctrlKey',
  meta: 'metaKey',
  shift: 'shiftKey'
};

const ALIASES = {
  add: '+',
  break: 'pause',
  cmd: 'meta',
  command: 'meta',
  ctl: 'control',
  ctrl: 'control',
  del: 'delete',
  down: 'arrowdown',
  esc: 'escape',
  ins: 'insert',
  left: 'arrowleft',
  mod: IS_MAC ? 'meta' : 'control',
  opt: 'alt',
  option: 'alt',
  return: 'enter',
  right: 'arrowright',
  space: ' ',
  spacebar: ' ',
  up: 'arrowup',
  win: 'meta',
  windows: 'meta'
};

const CODES = {
  backspace: 8,
  tab: 9,
  enter: 13,
  shift: 16,
  control: 17,
  alt: 18,
  pause: 19,
  capslock: 20,
  escape: 27,
  ' ': 32,
  pageup: 33,
  pagedown: 34,
  end: 35,
  home: 36,
  arrowleft: 37,
  arrowup: 38,
  arrowright: 39,
  arrowdown: 40,
  insert: 45,
  delete: 46,
  meta: 91,
  numlock: 144,
  scrolllock: 145,
  ';': 186,
  '=': 187,
  ',': 188,
  '-': 189,
  '.': 190,
  '/': 191,
  '`': 192,
  '[': 219,
  '\\': 220,
  ']': 221,
  "'": 222
};

for (let index = 1; index < 20; index += 1) {
  CODES[`f${index}`] = 111 + index;
}

function toKeyName(name) {
  const normalized = String(name).toLowerCase();
  return ALIASES[normalized] || normalized;
}

function toKeyCode(name) {
  const keyName = toKeyName(name);
  return CODES[keyName] || keyName.toUpperCase().charCodeAt(0);
}

function parseHotkey(hotkey, options) {
  const byKey = options && options.byKey;
  const parsed = {};
  const values = String(hotkey).replace('++', '+add').split('+');

  Object.keys(MODIFIERS).forEach((modifier) => {
    parsed[MODIFIERS[modifier]] = false;
  });

  values.forEach((rawValue) => {
    let value = rawValue;
    const optional = value.endsWith('?') && value.length > 1;

    if (optional) {
      value = value.slice(0, -1);
    }

    const name = toKeyName(value);
    const modifier = MODIFIERS[name];

    if (value.length > 1 && !modifier && !ALIASES[value] && !CODES[name]) {
      throw new TypeError(`Unknown modifier: "${value}"`);
    }

    if (values.length === 1 || !modifier) {
      if (byKey) {
        parsed.key = name;
      } else {
        parsed.which = toKeyCode(value);
      }
    }

    if (modifier) {
      parsed[modifier] = optional ? null : true;
    }
  });

  return parsed;
}

function compareHotkey(parsedHotkey, event) {
  return Object.keys(parsedHotkey).every((key) => {
    const expected = parsedHotkey[key];

    if (expected == null) {
      return true;
    }

    let actual;

    if (key === 'key' && event.key != null) {
      actual = event.key.toLowerCase();
    } else if (key === 'which') {
      actual = expected === 91 && event.which === 93 ? 91 : event.which;
    } else {
      actual = event[key];
    }

    if (actual == null && expected === false) {
      return true;
    }

    return actual === expected;
  });
}

function isHotkey(hotkey, options, event) {
  let resolvedOptions = options;
  let resolvedEvent = event;

  if (resolvedOptions && !('byKey' in resolvedOptions)) {
    resolvedEvent = resolvedOptions;
    resolvedOptions = null;
  }

  const hotkeys = Array.isArray(hotkey) ? hotkey : [hotkey];
  const parsedHotkeys = hotkeys.map((value) => parseHotkey(value, resolvedOptions));
  const matcher = (inputEvent) =>
    parsedHotkeys.some((parsedHotkey) => compareHotkey(parsedHotkey, inputEvent));

  return resolvedEvent == null ? matcher : matcher(resolvedEvent);
}

function isCodeHotkey(hotkey, event) {
  return isHotkey(hotkey, event);
}

function isKeyHotkey(hotkey, event) {
  return isHotkey(hotkey, { byKey: true }, event);
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
