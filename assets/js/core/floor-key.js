// フロアのキー管理（クリア済み・ヒント購入状況をダンジョンごとに独立させる）
export const DEFAULT_DUNGEON = 'tutorial';

/**
 * フロアの表示番号を取得（floor / id フィールド優先、なければ配列インデックス+1）
 * @param {object} floorData
 * @param {number} index
 * @returns {number}
 */
export const getFloorNumber = (floorData, index) => {
    return (floorData && (floorData.floor || floorData.id))
        ? Number(floorData.floor || floorData.id)
        : Number(index) + 1;
};

/**
 * "ダンジョン:フロア番号" 形式のキーを作る
 * @param {string} dungeonKey
 * @param {number} floorNumber
 * @returns {string}
 */
export const makeFloorKey = (dungeonKey, floorNumber) => `${dungeonKey || DEFAULT_DUNGEON}:${floorNumber}`;

/**
 * 現在プレイ中のフロアのキーを取得
 * @param {GameCore} game
 * @returns {string}
 */
export const getCurrentFloorKey = (game) => {
    const floorData = game.gameData?.dungeonData?.floors?.[game.currentFloor];
    return makeFloorKey(game.currentDungeon, getFloorNumber(floorData, game.currentFloor));
};

/**
 * 旧形式（数値 / "floor:N"）のキーを新形式に変換する。旧セーブは保存時のダンジョンに属するとみなす
 * @param {Array<number|string>} keys
 * @param {string} dungeonKey
 * @returns {Set<string>}
 */
export const migrateFloorKeys = (keys, dungeonKey) => {
    const out = new Set();
    for (const k of Array.isArray(keys) ? keys : []) {
        if (typeof k === 'number') out.add(makeFloorKey(dungeonKey, k));
        else if (typeof k === 'string' && k.startsWith('floor:')) out.add(makeFloorKey(dungeonKey, k.slice(6)));
        else if (typeof k === 'string') out.add(k);
    }
    return out;
};
