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

// セーブデータのバージョン。2: ダンジョン再編（旧チュートリアル6〜15階→初級、旧初級→中級）
export const SAVE_VERSION = 2;

const SPLIT_OFFSET = 5; // 旧チュートリアルのうち、1〜5階が新チュートリアル、6階以降が初級へ移った
const SPLIT_FLOOR_COUNT = { tutorial: 5, beginner: 10 };

const remapFloorKey = (key) => {
    const m = /^([^:]+):(\d+)$/.exec(key);
    if (!m) return key;
    const n = Number(m[2]);
    if (m[1] === 'beginner') return `intermediate:${n}`;
    if (m[1] === 'tutorial' && n > SPLIT_OFFSET) return `beginner:${n - SPLIT_OFFSET}`;
    return key;
};

/**
 * v1 のセーブをダンジョン再編後の構成に変換する（プレイヤーのクリア記録を書き換え、現在位置を返す）
 * @param {Player} player
 * @param {string|null} currentDungeon
 * @param {number} currentFloor - ダンジョン内の配列インデックス
 * @returns {{currentDungeon: string|null, currentFloor: number}}
 */
export const migrateDungeonSplit = (player, currentDungeon, currentFloor) => {
    player.clearedFloors = new Set([...player.clearedFloors].map(remapFloorKey));
    player.purchasedHints = new Set([...player.purchasedHints].map(remapFloorKey));
    player.clearedDungeons = new Set([...player.clearedDungeons].map(d => (d === 'beginner' ? 'intermediate' : d)));

    // 全フロアをクリア済みのダンジョンはクリア済みとして扱う
    for (const [dungeon, count] of Object.entries(SPLIT_FLOOR_COUNT)) {
        let all = true;
        for (let n = 1; n <= count; n++) {
            if (!player.clearedFloors.has(makeFloorKey(dungeon, n))) { all = false; break; }
        }
        if (all) player.clearedDungeons.add(dungeon);
    }

    if (currentDungeon === 'beginner') return { currentDungeon: 'intermediate', currentFloor };
    if (currentDungeon === 'tutorial' && currentFloor >= SPLIT_OFFSET) {
        return { currentDungeon: 'beginner', currentFloor: currentFloor - SPLIT_OFFSET };
    }
    return { currentDungeon, currentFloor };
};
