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
        // manifest.jsonがない場合、tutorialとbeginnerを直接読み込む
        const [tutorialRes, beginnerRes] = await Promise.all([
            fetch('./assets/data/dungeons/tutorial.json').catch(() => null),
            fetch('./assets/data/dungeons/beginner.json').catch(() => null)
        ]);

        const [tutorial, beginner] = await Promise.all([
            tutorialRes ? tutorialRes.json() : Promise.resolve(null),
            beginnerRes ? beginnerRes.json() : Promise.resolve(null)
        ]);

        if (tutorial) dungeons.tutorial = tutorial;
        if (beginner) dungeons.beginner = beginner;
    }

    // デフォルトのダンジョンデータを設定
    let dungeonData = { floors: [] };
    const dungeonNames = Object.keys(dungeons);
    if (dungeonNames.length > 0) {
        dungeonData = dungeons[dungeonNames[0]] || { floors: [] };
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

/**
 * 複数のデータベースを統合して1つのデータベースオブジェクトを生成
 * テーブル名が重複する場合は "データベース名-テーブル名" の形式にリネーム
 * @param {Object} mockDatabases - 全データベースオブジェクト
 * @param {Array<string>} databaseNames - 統合するデータベース名の配列
 * @returns {Object} 統合されたデータベースオブジェクト
 */
export function mergeDatabases(mockDatabases, databaseNames) {
    if (!mockDatabases || !Array.isArray(databaseNames) || databaseNames.length === 0) {
        return {};
    }

    const merged = {};
    const schemaMap = {};
    const tableOrigins = {}; // テーブル名 -> 出現したデータベース名の配列

    // 最初にテーブル名の重複をチェック
    for (const dbName of databaseNames) {
        const db = mockDatabases[dbName];
        if (!db) continue;

        Object.keys(db).forEach(tableName => {
            if (tableName.startsWith('_')) return; // __schema などはスキップ
            if (!tableOrigins[tableName]) {
                tableOrigins[tableName] = [];
            }
            tableOrigins[tableName].push(dbName);
        });
    }

    // データベースを統合
    for (const dbName of databaseNames) {
        const db = mockDatabases[dbName];
        if (!db) {
            console.warn(`Database '${dbName}' not found in mockDatabases`);
            continue;
        }

        Object.keys(db).forEach(key => {
            if (key === '__schema') {
                // スキーマ情報を統合
                const dbSchema = db[key] || {};
                Object.keys(dbSchema).forEach(tableName => {
                    const isDuplicate = tableOrigins[tableName] && tableOrigins[tableName].length > 1;
                    const finalTableName = isDuplicate ? `${dbName}-${tableName}` : tableName;
                    schemaMap[finalTableName] = dbSchema[tableName];
                });
            } else if (!key.startsWith('_')) {
                // テーブルデータを統合
                const isDuplicate = tableOrigins[key] && tableOrigins[key].length > 1;
                const finalTableName = isDuplicate ? `${dbName}-${key}` : key;
                merged[finalTableName] = db[key];
            }
        });
    }

    // スキーマ情報を追加
    if (Object.keys(schemaMap).length > 0) {
        merged.__schema = schemaMap;
    }

    return merged;
}

/**
 * 全データベースを統合（サンドボックスモード用）
 * @param {Object} mockDatabases - 全データベースオブジェクト
 * @returns {Object} 全データベースが統合されたオブジェクト
 */
export function mergeAllDatabases(mockDatabases) {
    if (!mockDatabases) return {};
    const allDbNames = Object.keys(mockDatabases);
    return mergeDatabases(mockDatabases, allDbNames);
}

/**
 * 統合されたデータベースから選択されたテーブルのみをフィルタリング
 * 選択されたテーブルの中で重複がない場合はハイフンを除去
 * @param {Object} mergedDatabase - 統合されたデータベース（ハイフン付きテーブル名を含む）
 * @param {Array<string>} selectedTables - 選択されたテーブル名の配列（ハイフン付き可能性あり）
 * @returns {Object} フィルタリング後のデータベースオブジェクト
 */
export function filterSelectedTables(mergedDatabase, selectedTables) {
    if (!mergedDatabase || !Array.isArray(selectedTables) || selectedTables.length === 0) {
        return mergedDatabase || {};
    }

    const filtered = {};
    const schemaFiltered = {};
    
    // 選択されたテーブルから実際のテーブル名（ハイフン除去後）を抽出
    const tableNameCounts = {}; // テーブル名 -> 出現回数
    selectedTables.forEach(fullName => {
        // "db-tablename" から "tablename" を抽出
        const baseName = fullName.includes('-') ? fullName.split('-').pop() : fullName;
        tableNameCounts[baseName] = (tableNameCounts[baseName] || 0) + 1;
    });

    // 選択されたテーブルをフィルタリング
    selectedTables.forEach(fullName => {
        if (!mergedDatabase[fullName]) return;
        
        const baseName = fullName.includes('-') ? fullName.split('-').pop() : fullName;
        const isDuplicate = tableNameCounts[baseName] > 1;
        
        // 重複していない場合はハイフンを除去したテーブル名を使用
        const finalName = isDuplicate ? fullName : baseName;
        filtered[finalName] = mergedDatabase[fullName];
        
        // スキーマ情報もコピー
        if (mergedDatabase.__schema && mergedDatabase.__schema[fullName]) {
            schemaFiltered[finalName] = mergedDatabase.__schema[fullName];
        }
    });

    // スキーマ情報を追加
    if (Object.keys(schemaFiltered).length > 0) {
        filtered.__schema = schemaFiltered;
    }

    return filtered;
}