// データローダー: ゲームデータのfetch・パース
export async function loadGameData() {
    const [dungeonRes, shopRes, mockDbRes] = await Promise.all([
        fetch('./assets/data/dungeon-data.json'),
        fetch('./assets/data/shop-items.json'),
        fetch('./assets/data/mock-database.json')
    ]);
    const [dungeonData, shopItems, mockDatabase] = await Promise.all([
        dungeonRes.json(),
        shopRes.json(),
        mockDbRes.json()
    ]);
    return {
        dungeonData,
        shopItems,
        mockDatabase
    };
}