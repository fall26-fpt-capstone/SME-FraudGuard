const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
const baseCache = new Map();

function resolveModulePath(fromDir, spec) {
  const base = spec.startsWith('@/')
    ? path.join(ROOT, 'src', spec.slice(2))
    : path.resolve(fromDir, spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve module "${spec}" from "${fromDir}"`);
}

function load(relative, imports = {}) {
  const filename = path.isAbsolute(relative) ? relative : path.join(ROOT, relative);
  const hasOverrides = Object.keys(imports).length > 0;
  if (!hasOverrides && baseCache.has(filename)) {
    return baseCache.get(filename);
  }

  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

  const exports = {};
  const module = { exports };
  if (!hasOverrides) {
    baseCache.set(filename, exports);
  }

  const sandbox = {
    module,
    exports,
    React,
    Error: globalThis.Error,
    structuredClone,
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    URL: globalThis.URL,
    Blob: globalThis.Blob,
    setTimeout,
    clearTimeout,
    console,
    require(spec) {
      if (spec in imports) return imports[spec];
      if (spec.endsWith('.css')) {
        return new Proxy(
          {},
          {
            get: (_, prop) => {
              if (prop === '__esModule' || prop === 'then' || typeof prop === 'symbol') {
                return undefined;
              }
              return String(prop);
            },
          }
        );
      }
      if (spec === 'lucide-react' || spec === 'recharts') {
        return new Proxy({}, { get: () => () => null });
      }
      if (spec.startsWith('@/') || spec.startsWith('.')) {
        const target = resolveModulePath(path.dirname(filename), spec);
        return load(target, imports);
      }
      return require(spec);
    },
  };

  vm.runInNewContext(transpiled, sandbox, { filename });
  if (!hasOverrides) {
    baseCache.set(filename, module.exports);
  }
  return module.exports;
}

const { translations } = load('src/config/translations.ts');

function createUiImports(lang = 'vi') {
  return {
    '@/context/LanguageContext': {
      useLanguage: () => ({
        language: lang,
        t: translations[lang],
        setLanguage() {},
      }),
    },
    '@/context/ToastProvider': {
      useToast: () => ({
        toast() {},
        showToast() {},
      }),
    },
    '@/hooks/useDialogFocus': {
      useDialogFocus: () => ({ current: null }),
    },
  };
}

function createScriptedStorage(initial = {}, options = {}) {
  const store = new Map(Object.entries(initial));
  const failReadKeys = new Set(options.failReadKeys || []);
  const failWriteKeys = new Set(options.failWriteKeys || []);
  const failRemoveKeys = new Set(options.failRemoveKeys || []);
  const ops = [];

  return {
    store,
    ops,
    setFailReadKeys(keys) {
      failReadKeys.clear();
      for (const k of keys) failReadKeys.add(k);
    },
    setFailWriteKeys(keys) {
      failWriteKeys.clear();
      for (const k of keys) failWriteKeys.add(k);
    },
    setFailRemoveKeys(keys) {
      failRemoveKeys.clear();
      for (const k of keys) failRemoveKeys.add(k);
    },
    getItem(key) {
      ops.push({ type: 'getItem', key });
      if (failReadKeys.has(key)) {
        const err = new Error(`StorageReadError when reading ${key}`);
        err.name = 'StorageReadError';
        throw err;
      }
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      ops.push({ type: 'setItem', key, value: String(value) });
      if (failWriteKeys.has(key)) {
        const err = new Error(`QuotaExceededError when writing ${key}`);
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, String(value));
    },
    removeItem(key) {
      ops.push({ type: 'removeItem', key });
      if (failRemoveKeys.has(key)) {
        const err = new Error(`StorageRemoveError when removing ${key}`);
        err.name = 'StorageRemoveError';
        throw err;
      }
      store.delete(key);
    },
  };
}

function createInvestigationHookHarness(options = {}) {
  const slots = [];
  let cursor = 0;
  const mockReact = {
    useReducer(reducer, initArg, initFn) {
      const idx = cursor++;
      if (!(idx in slots)) {
        slots[idx] = initFn ? initFn(initArg) : initArg;
      }
      const dispatch = (action) => {
        slots[idx] = reducer(slots[idx], action);
      };
      return [slots[idx], dispatch];
    },
    useRef(initialValue) {
      const idx = cursor++;
      if (!(idx in slots)) {
        slots[idx] = { current: initialValue };
      }
      return slots[idx];
    },
    useEffect(fn) {
      cursor++;
      fn();
    },
    useCallback(fn) {
      cursor++;
      return fn;
    },
  };

  const { useInvestigationCases } = load('src/hooks/useInvestigationCases.ts', {
    react: mockReact,
  });

  return function renderHook(overrideOptions = {}) {
    cursor = 0;
    return useInvestigationCases({
      ...options,
      ...overrideOptions,
    });
  };
}


module.exports = { load, createUiImports, createScriptedStorage, createInvestigationHookHarness };
