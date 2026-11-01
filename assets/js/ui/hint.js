// ヒント機能
import { HINT_COST } from '../constants.js';
import { Floor } from '../models/floor.js';
import { getCurrentFloorKey } from '../core/floor-key.js';

/**
 * 現在フロアのヒント本文を i18n から取得する（未設定の場合は空文字）
 */
const getHintText = (game) => {
    const floorData = game.gameData.dungeonData.floors[game.currentFloor];
    const text = new Floor(floorData, game.i18n).getHint({ i18n: game.i18n, currentDungeon: game.currentDungeon });
    return typeof text === 'string' ? text : '';
};

export function handleHint(game) {
    const i18n = game.i18n;
    if (game.player.purchasedHints.has(getCurrentFloorKey(game))) {
        showHintModal(game, i18n.t('shop.hint.sage'), getHintText(game));
    } else {
        showPurchaseHintModal(game);
    }
}

export function showHintModal(game, title, hint) {
    game.dom.elements['hint-modal-title'].textContent = title;
    game.dom.elements['hint-modal-text'].innerHTML = hint;
    game.dom.elements['hint-modal-actions'].innerHTML = '';
    game.dom.openModal('hint-modal');
}

export function showPurchaseHintModal(game) {
    const i18n = game.i18n;
    game.dom.elements['hint-modal-title'].textContent = i18n.t('shop.hint.title');
    game.dom.elements['hint-modal-text'].innerHTML = i18n.t('shop.hint.confirm', HINT_COST).replace(/\n/g, '<br>');
    const yesBtn = document.createElement('button');
    yesBtn.textContent = i18n.t('button.yes');
    yesBtn.className = 'action-btn';
    yesBtn.onclick = () => purchaseHint(game);
    game.dom.elements['hint-modal-actions'].innerHTML = '';
    game.dom.elements['hint-modal-actions'].appendChild(yesBtn);
    game.dom.openModal('hint-modal');
}

export function purchaseHint(game) {
    const i18n = game.i18n;
    if (game.player.spendGold(HINT_COST)) {
        game.player.purchasedHints.add(getCurrentFloorKey(game));
        game.updateUI();
        handleHint(game);
    } else {
        game.dom.closeModal(game.dom.elements['hint-modal']);
        game.dom.showFeedback(i18n.t('shop.hint.no_gold'));
    }
}
