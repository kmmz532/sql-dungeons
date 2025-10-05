// UIイベントのバインド・UI更新
import { SQLParser } from '../sql/sql-parser.js';

const sqlParser = new SQLParser();
import { HINT_COST, EXECUTE_COST, SQL_KEYWORDS } from '../constants.js';
import { handleHint, showHintModal, showPurchaseHintModal, purchaseHint } from './hint.js';
import { openShop, handleItemPurchase } from './shop.js';

export function setupUIHandlers(game) {
    const dom = game.dom;
    dom.elements['start-button'].addEventListener('click', () => game.startGame());
    dom.elements['load-button'].addEventListener('click', () => game.loadGame());
    dom.elements['retry-button'].addEventListener('click', () => game.startGame());
    dom.elements['save-button'].addEventListener('click', () => game.saveGame());
    dom.elements['execute-btn'].addEventListener('click', () => executeQuery(game));
    dom.elements['hint-btn'].addEventListener('click', () => handleHint(game));
    dom.elements['ku-next-btn'].addEventListener('click', () => useKuNext(game));
    dom.elements['shop-btn'].addEventListener('click', () => openShop(game));
    dom.elements['inventory-list'].addEventListener('click', e => {
        if (e.target.classList.contains('inventory-item')) {
            dom.elements['sql-editor'].value += `${e.target.dataset.item} `;
            dom.elements['sql-editor'].focus();
        }
    });
    dom.elements['quest-schema'].addEventListener('click', e => {
        if (e.target.classList.contains('schema-term')) {
            dom.elements['sql-editor'].value += `${e.target.dataset.term} `;
            dom.elements['sql-editor'].focus();
        }
    });
    dom.elements['shop-item-list'].addEventListener('click', e => {
        if (e.target.classList.contains('buy-btn')) {
            const itemData = game.gameData.shopItems.items.find(i => i.id === e.target.dataset.itemId);
            if (itemData && game.player.spendGold(itemData.price)) {
                const item = new (itemData.constructor || Object.getPrototypeOf(itemData).constructor)(itemData, game.i18n);
                handleItemPurchase(game, item);
                game.updateUI();
                openShop(game);
            }
        }
    });
}

function executeQuery(game) {
    const dom = game.dom;
    if (!game.player) return;
    const query = dom.elements['sql-editor'].value.trim();
    if (!query) {
        dom.showResult('クエリを入力してください。', 'error');
        return;
    }
    if (!game.player.spendEnergy(EXECUTE_COST)) {
        dom.showResult('エネルギーが足りません！', 'error');
        return;
    }
    if (!validateQuery(game, query)) return;
    const floorData = game.gameData.dungeonData.floors[game.currentFloor];
    const isCorrect = sqlParser.validate(query, floorData);
    game.updateUI();
    if (isCorrect) {
        handleCorrectAnswer(game, floorData, query);
    } else {
        dom.showResult('不正解です。もう一度挑戦してください。', 'error');
    }
}

function validateQuery(game, query) {
    const dom = game.dom;
    const usableItems = new Set([
        ...game.player.inventory,
        ...game.player.borrowedItems,
        ...Object.keys(game.player.consumableItems).filter(k => game.player.consumableItems[k] > 0)
    ]);
    const words = query.toUpperCase().match(/[A-Z_][A-Z0-9_]*/g) || [];
    for (const word of words) {
        const clause = SQL_KEYWORDS.find(c => c.keyword === word);
        if (clause && !usableItems.has(word)) {
            dom.showResult(`まだ覚えていない呪文「${clause.getKeyword({i18n: game.i18n})}」が詠唱に含まれています。`, 'error');
            return false;
        }
    }
    return true;
}

function handleCorrectAnswer(game, floorData, query) {
    const dom = game.dom;
    if (floorData.reward) {
        game.player.addGold(floorData.reward.gold || 0);
        game.player.addEnergy(floorData.reward.energy || 0);
        (floorData.reward.items || []).forEach(item => game.player.addItem(item));
    }
    dom.showResult('正解！クエリの実行結果:', 'success');
    dom.displayTable(sqlParser.emulate(query, game.currentFloor, game.gameData.mockDatabase));
    dom.elements['floor-actions-container'].classList.remove('hidden');
    if (game.currentFloor < game.gameData.dungeonData.floors.length - 1) {
        dom.elements['next-floor-btn'].classList.remove('hidden');
        dom.elements['next-floor-btn'].onclick = () => {
            game.currentFloor++;
            game.loadFloor(game.currentFloor);
        };
    } else {
        dom.elements['next-floor-btn'].classList.add('hidden');
        dom.elements['next-floor-btn'].onclick = null;
        setTimeout(() => game.showEndScreen('クリア！', '全てのフロアを攻略しました！'), 1200);
    }
    if (floorData.opensShop) {
        dom.elements['shop-btn'].classList.remove('hidden');
    } else {
        dom.elements['shop-btn'].classList.add('hidden');
    }
}

function useKuNext(game) {
    if (!game.player || game.player.specialItems.kuNext <= 0) return;
    game.player.specialItems.kuNext--;
    const query = game.dom.elements['sql-editor'].value.trim().toUpperCase();
    const lastWord = query.split(/\s+/).pop() || '';
    let nextClause = determineNextClause(game, query, lastWord);
    game.dom.showResult(`賢者の声: 「次に続くのはおそらく... ${nextClause} 句じゃな。」`, 'hint', true);
    game.updateUI();
}

function determineNextClause(game, query, lastWord) {
    if (query === '') return 'SELECT';
    if (['SELECT', ','].includes(lastWord) || /\w+\(.*\)/.test(lastWord)) return 'FROM';
    if (Object.keys(game.gameData.mockDatabase).includes(lastWord.toLowerCase())) return 'WHERE / JOIN / GROUP BY';
    if (lastWord === 'WHERE' || lastWord === 'ON') return 'GROUP BY / JOIN';
    if (lastWord === 'BY') return 'HAVING';
    if (lastWord === 'JOIN') return 'ON';
    return '不明';
}
