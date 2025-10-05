// Simple runtime registry for pluggable modules (clauses etc.)
// Provides: register(name, value), get(name), getAll(), init(manifestUrl)
// manifest format (optional): { "INSERT": "./sql/clause/insert-clause.js", "SELECT": "./sql/clause/select-clause.js" }

const _registry = new Map();
let _initialized = false;

export function register(name, value) {
    _registry.set(name, value);
}

export function get(name) {
    return _registry.get(name);
}

export function getAll() {
    const out = {};
    for (const [k, v] of _registry.entries()) out[k] = v;
    return out;
}

export async function init(manifestUrl) {
    if (_initialized) return getAll();
    if (!manifestUrl) {
        _initialized = true;
        return getAll();
    }
    // debug: indicate init was called and which manifest URL is being used
    try {
        console.debug('[Register] init manifestUrl=', manifestUrl);
        const res = await fetch(manifestUrl, { cache: 'no-cache' });
        console.debug('[Register] fetch status', res.status, res.statusText, manifestUrl);
        if (!res.ok) throw new Error('manifest fetch failed');
        const manifest = await res.json();
        console.debug('[Register] manifest loaded', manifest);
        const imports = Object.keys(manifest).map(async key => {
            const rel = manifest[key];
            // resolve relative to the manifest location so paths like "./select-clause.js" work
            const resolved = new URL(rel, manifestUrl).href;
            try {
                const mod = await import(resolved);
                // default export or named export fallback
                const ctor = mod.default || mod[key] || mod[Object.keys(mod)[0]];
                if (ctor) register(key, ctor);
                else console.warn('No export found in module for', key, 'at', resolved);
            } catch (e) {
                console.warn('Failed to import', resolved, e);
            }
        });
        await Promise.all(imports);
        console.debug('[Register] registration complete. keys=', Array.from(_registry.keys()));
    } catch (e) {
        console.warn('Clause registry init failed', e);
    }

    _initialized = true;
    return getAll();
}

// Register modules from an in-memory manifest object { KEY: path }
export async function registerFromManifestObject(manifest, basePath) {
    if (!manifest || typeof manifest !== 'object') return getAll();
    const imports = Object.keys(manifest).map(async key => {
        const rel = manifest[key];
        // resolve path relative to basePath if provided (basePath may be a manifest URL)
        const path = basePath ? (new URL(rel, basePath).href) : rel;
        try {
            const mod = await import(path);
            const ctor = mod.default || mod[key] || mod[Object.keys(mod)[0]];
            if (ctor) register(key, ctor);
            else console.warn('No export found in module for', key, 'at', path);
        } catch (e) {
            console.warn('Failed to import', path, e);
        }
    });
    await Promise.all(imports);
    return getAll();
}

// Backwards compat helper: register known static clauses
export function registerStatic(map) {
    for (const k in map) register(k, map[k]);
}

export default { register, get, getAll, init, registerStatic, registerFromManifestObject };
