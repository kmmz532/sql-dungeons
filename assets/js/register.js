const _registries = {
    clause: new Map(),
    aggregate: new Map(),
};
let _initialized = false;

// type: 'clause' | 'aggregate' 必須
export function register(name, value, type) {
    if (!type || !_registries[type]) throw new Error('register: type must be specified as "clause" or "aggregate"');
    _registries[type].set(name, value);
}

export function get(name, type) {
    if (!type || !_registries[type]) throw new Error('get: type must be specified as "clause" or "aggregate"');
    return _registries[type].get(name);
}

export function getAll(type) {
    if (!type || !_registries[type]) throw new Error('getAll: type must be specified as "clause" or "aggregate"');
    const out = {};
    const reg = _registries[type];
    for (const [k, v] of reg.entries()) out[k] = v;
    return out;
}

// type: 'clause' | 'aggregate' 必須
export async function init(manifestUrl, type) {
    if (!type || !_registries[type]) throw new Error('init: type must be specified as "clause" or "aggregate"');
    if (_initialized) return getAll(type);
    if (!manifestUrl) {
        _initialized = true;
        return getAll(type);
    }
    try {
        console.debug('[Register] init manifestUrl=', manifestUrl, 'type=', type);
        const res = await fetch(manifestUrl, { cache: 'no-cache' });
        if (!res.ok) throw new Error('manifest fetch failed');
        const manifest = await res.json();
        console.debug('[Register] manifest loaded', manifest);
        const imports = Object.keys(manifest).map(async key => {
            const rel = manifest[key];
            const resolved = new URL(rel, manifestUrl).href;
            try {
                const mod = await import(resolved);
                const ctor = mod.default || mod[key] || mod[Object.keys(mod)[0]];
                if (ctor) register(key, ctor, type);
                else console.warn('No export found in module for', key, 'at', resolved);
            } catch (e) {
                console.warn('Failed to import', resolved, e);
            }
        });
        await Promise.all(imports);
        console.debug('[Register] registration complete. type=', type, 'keys=', Array.from(_registries[type].keys()));
    } catch (e) {
        console.warn('Registry init failed', e);
    }
    _initialized = true;
    return getAll(type);
}

// Register modules from an in-memory manifest object { KEY: path }
export async function registerFromManifestObject(manifest, basePath, type) {
    if (!type || !_registries[type]) throw new Error('registerFromManifestObject: type must be specified as "clause" or "aggregate"');
    if (!manifest || typeof manifest !== 'object') return getAll(type);
    const imports = Object.keys(manifest).map(async key => {
        const rel = manifest[key];
        const path = basePath ? (new URL(rel, basePath).href) : rel;
        try {
            const mod = await import(path);
            const ctor = mod.default || mod[key] || mod[Object.keys(mod)[0]];
            if (ctor) register(key, ctor, type);
            else console.warn('No export found in module for', key, 'at', path);
        } catch (e) {
            console.warn('Failed to import', path, e);
        }
    });
    await Promise.all(imports);
    return getAll(type);
}

// Backwards compat helper: register known static clauses/aggregates
export function registerStatic(map, type) {
    if (!type || !_registries[type]) throw new Error('registerStatic: type must be specified as "clause" or "aggregate"');
    for (const k in map) register(k, map[k], type);
}

export default { register, get, getAll, init, registerStatic, registerFromManifestObject };
