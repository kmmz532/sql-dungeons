// データローダー: ゲームデータのfetch・パース

// Convert $_NULL_$ strings to null in mock database
function convertNullStrings(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj === '$_NULL_$') return null;
    
    if (Array.isArray(obj)) {
        return obj.map(item => convertNullStrings(item));
    }
    
    if (typeof obj === 'object') {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = convertNullStrings(obj[key]);
            }
        }
        return result;
    }
    
    return obj;
}

export async function loadGameData() {
    const shopRes = await fetch('./assets/data/shop-items.json');

    let mockDatabases = {};
    let mockDatabaseKey = null;
    try {
        const manifestRes = await fetch('./assets/data/mock-databases/manifest.json');
        if (manifestRes && manifestRes.ok) {
            const manifestJson = await manifestRes.json();

            const entries = Array.isArray(manifestJson) ? manifestJson : Object.values(manifestJson || {});
            for (const fname of entries) {
                try {
                    const res = await fetch(`./assets/data/mock-databases/${fname}`);
                    if (res && res.ok) {
                        const json = await res.json();
                        const key = String(fname).replace(/\.json$/i, '');
                        mockDatabases[key] = convertNullStrings(json);
                        if (!mockDatabaseKey) mockDatabaseKey = key;
                    }
                } catch (e) {
                    console.warn('Failed to load mock-database entry', fname, e);
                }
            }
        }
    } catch (e) {

    }

    let manifest = null;
    try {
        const manifestRes = await fetch('./assets/data/dungeons/manifest.json');
        if (manifestRes && manifestRes.ok) manifest = await manifestRes.json();
    } catch (e) {
        manifest = null;
    }

    const shopItems = await shopRes.json();
    if (!mockDatabaseKey) {
        try {
            const mockDbRes = await fetch('./assets/data/mock-database.json');
            if (mockDbRes && mockDbRes.ok) {
                const md = await mockDbRes.json();
                mockDatabases.default = convertNullStrings(md);
                mockDatabaseKey = 'default';
            }
        } catch (e) {
            console.warn('Failed to load fallback mock-database.json', e);
        }
    }
    const dungeons = {};

    if (manifest && Object.keys(manifest).length > 0) {
        const orderedKeys = Object.keys(manifest).sort((a, b) => Number(a) - Number(b));
        for (const key of orderedKeys) {
            const filename = manifest[key];
            try {
                const res = await fetch(`./assets/data/dungeons/${filename}`);
                if (res && res.ok) {
                    const json = await res.json();
                    const name = filename.replace(/\.json$/i, '');
                    dungeons[name] = json || { floors: [] };
                }
            } catch (e) {
                console.warn('Failed to load dungeon file', filename, e);
            }
        }
    } else {
        const [tutorialRes, beginnerRes, fallbackRes] = await Promise.all([
            fetch('./assets/data/dungeons/tutorial.json').catch(() => null),
            fetch('./assets/data/dungeons/beginner.json').catch(() => null),
            fetch('./assets/data/dungeon-data.json').catch(() => null)
        ]);

        const [tutorial, beginner, fallback] = await Promise.all([
            tutorialRes ? tutorialRes.json() : Promise.resolve(null),
            beginnerRes ? beginnerRes.json() : Promise.resolve(null),
            fallbackRes ? fallbackRes.json() : Promise.resolve(null)
        ]);

        if (tutorial) dungeons.tutorial = tutorial;
        if (beginner) dungeons.beginner = beginner;

        if (fallback && !dungeons.tutorial) dungeons.fallback = fallback;
    }

    let dungeonData = { floors: [] };
    const dungeonNames = Object.keys(dungeons);
    if (dungeonNames.length > 0) {
        dungeonData = dungeons[dungeonNames[0]] || { floors: [] };
    } else {
        try {
            const legacyRes = await fetch('./assets/data/dungeon-data.json');
            if (legacyRes && legacyRes.ok) dungeonData = await legacyRes.json();
        } catch (e) {

        }
    }

    return {
        dungeonData,
        dungeons,
        shopItems,
        mockDatabases,
        mockDatabaseKey,
        mockDatabase: mockDatabases && mockDatabaseKey ? mockDatabases[mockDatabaseKey] : null
    };
}