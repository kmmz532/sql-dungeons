// データローダー: ゲームデータのfetch・パース
export async function loadGameData() {
    // Attempt to load a manifest that lists dungeon files (ordered)
    const shopRes = await fetch('./assets/data/shop-items.json');
    const mockDbRes = await fetch('./assets/data/mock-database.json');

    let manifest = null;
    try {
        const manifestRes = await fetch('./assets/data/dungeons/manifest.json');
        if (manifestRes && manifestRes.ok) manifest = await manifestRes.json();
    } catch (e) {
        manifest = null;
    }

    const shopItems = await shopRes.json();
    const mockDatabase = await mockDbRes.json();

    // dungeons will be a map of name -> dungeonData
    const dungeons = {};

    if (manifest && Object.keys(manifest).length > 0) {
        // manifest is expected to be an object where keys are order numbers and values are filenames
        const orderedKeys = Object.keys(manifest).sort((a, b) => Number(a) - Number(b));
        for (const key of orderedKeys) {
            const filename = manifest[key];
            try {
                const res = await fetch(`./assets/data/dungeons/${filename}`);
                if (res && res.ok) {
                    const json = await res.json();
                    // use filename (without extension) as the dungeon key
                    const name = filename.replace(/\.json$/i, '');
                    dungeons[name] = json || { floors: [] };
                }
            } catch (e) {
                // skip missing/invalid files
                // eslint-disable-next-line no-console
                console.warn('Failed to load dungeon file', filename, e);
            }
        }
    } else {
        // Backwards-compatible: try to load tutorial and beginner if manifest missing
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
        // keep fallback as unnamed default
        if (fallback && !dungeons.tutorial) dungeons.fallback = fallback;
    }

    // Determine primary dungeonData: prefer the first entry in manifest, else tutorial, else fallback
    let dungeonData = { floors: [] };
    const dungeonNames = Object.keys(dungeons);
    if (dungeonNames.length > 0) {
        dungeonData = dungeons[dungeonNames[0]] || { floors: [] };
    } else {
        // last-resort: try to load legacy dungeon-data.json
        try {
            const legacyRes = await fetch('./assets/data/dungeon-data.json');
            if (legacyRes && legacyRes.ok) dungeonData = await legacyRes.json();
        } catch (e) {
            // keep empty
        }
    }

    return {
        dungeonData,
        dungeons,
        shopItems,
        mockDatabase
    };
}