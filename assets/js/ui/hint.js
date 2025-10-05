// ヒント機能
import { HINT_COST } from '../constants.js';

export function handleHint(game) {
    const floorData = game.gameData.dungeonData.floors[game.currentFloor];
    const i18n = game.i18n;
    if (game.player.purchasedHints.has(game.currentFloor)) {
        showHintModal(game, i18n.t('shop.hint.sage'), floorData.hint);
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
        game.player.purchasedHints.add(game.currentFloor);
        game.updateUI();
        handleHint(game);
    } else {
        game.dom.closeModal(game.dom.elements['hint-modal']);
        game.dom.showFeedback(i18n.t('shop.hint.no_gold'));
    }
}