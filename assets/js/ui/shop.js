// ショップ機能
import { ShopItem } from '../models/item.js';

export function openShop(game) {
    const i18n = game.i18n;
    const shopList = game.dom.elements['shop-item-list'];
    shopList.innerHTML = '';
    game.gameData.shopItems.items.map(itemData => new ShopItem(itemData, i18n)).forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'shop-item';
        // アイテム名/説明をi18nで取得
        const name = item.getName();
        const desc = item.getDesc ? item.getDesc() : '';
        itemDiv.innerHTML = `
            <div>
                <p>${name}</p>
                <p class="item-desc">${desc}</p>
            </div>
            <button class="action-btn buy-btn" data-item-id="${item.id}" ${game.player.gold < item.price ? 'disabled' : ''}>
                💰 ${item.price} G
            </button>
        `;
        shopList.appendChild(itemDiv);
    });
    game.dom.openModal('shop-modal');
}

export function handleItemPurchase(game, item) {
    // itemはShopItemインスタンス
    switch (item.effectType) {
        case 'energy':
            game.player.addEnergy(item.effectValue);
            break;
        case 'kuNext':
            game.player.specialItems.kuNext = (game.player.specialItems.kuNext || 0) + item.effectValue;
            break;
        case 'consumableItem':
            game.player.consumableItems[item.effectItem] = 
                (game.player.consumableItems[item.effectItem] || 0) + item.effectValue;
            break;
    }
    // 購入メッセージをi18nで表示
    const i18n = game.i18n;
    const name = item.getName();
    game.dom.showFeedback(i18n.t('message.purchase_success', name));
}