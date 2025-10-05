// UIイベントのバインド・UI更新
import { SQLParser } from '../sql/sql-parser.js';

const sqlParser = new SQLParser();
import { EXECUTE_COST } from '../constants.js';
import { SQL_KEYWORDS } from '../sql/clause/sql-keywords.js';
// When true, if puzzle validation fails but emulate() returns rows, treat as correct
// Disabled by default because it can accept looser queries (e.g. price >= 200)
const EMULATE_AUTO_ACCEPT = false;
import { handleHint, showHintModal, showPurchaseHintModal, purchaseHint } from './hint.js';
import { openShop, handleItemPurchase } from './shop.js';

export function setupUIHandlers(game) {
    const dom = game.dom;
    dom.elements['start-button'].addEventListener('click', () => game.startGame());
    dom.elements['load-button'].addEventListener('click', () => game.loadGame());
    dom.elements['sandbox-button'].addEventListener('click', () => game.startSandbox());
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
            const term = e.target.dataset.term;
            // find parent line to decide if this is a column
            const line = e.target.closest('.schema-line');
            const lineType = line ? line.dataset.lineType : null;
            if (lineType === 'columns') {
                dom.elements['sql-editor'].value += `${term}, `;
            } else {
                dom.elements['sql-editor'].value += `${term} `;
            }
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
    const isSandbox = !game.player; // sandbox mode when no player exists
    const query = dom.elements['sql-editor'].value.trim();
    if (!query) {
        dom.showResult(game.i18n.t('message.empty_query'), 'error');
        return;
    }
    // Deduct energy only when a player exists (not in sandbox)
    if (!isSandbox) {
            if (!game.player.spendEnergy(EXECUTE_COST)) {
            dom.showResult(game.i18n.t('message.no_energy'), 'error');
            return;
        }
    }


    const floorData = game.gameData?.dungeonData?.floors?.[game.currentFloor] || {};


        // Sandbox: allow arbitrary SELECT queries (parse + emulate) without changing game state
        if (isSandbox) {
            // Special hidden debug trigger: allow "SELECT DEBUG PANEL" to open debug.html
            if (/^SELECT\s+DEBUG\s+PANEL$/i.test(query)) {
                try {
                    window.location.href = 'debug.html';
                    return;
                } catch (e) {
                    // fallback: show a message if redirect failed
                    dom.showResult('Redirect to debug panel failed.', 'error');
                    return;
                }
            }

            const parsed = sqlParser.parseSQL(query);
            if (!parsed) {
                dom.showResult(game.i18n.t('message.invalid_query'), 'error');
                return;
            }
            // Only support SELECT ... FROM ... in sandbox for now
            if (!parsed.select || !parsed.from) {
                dom.showResult(game.i18n.t('message.sandbox_select_from'), 'error');
                return;
            }
            const results = sqlParser.emulate(query, game.currentFloor, game.gameData.mockDatabase);
            dom.showResult(game.i18n.t('message.sandbox_result'), 'success');
            dom.displayTable(results);
            return;
        }

    // Ensure user has required spells/items for this query (only for non-sandbox)
    if (!validateQuery(game, query, false)) return;

    // Normal gameplay path: puzzle validation against the floor's expected solution
    const isCorrect = sqlParser.validate(query, floorData);

    // Update UI only for normal game
    game.updateUI();

        if (isCorrect) {
            handleCorrectAnswer(game, floorData, query);
            return;
        }

        // Fallback: if validation failed, try emulation to see if the query actually returns data
        try {
            const emuResults = sqlParser.emulate(query, game.currentFloor, game.gameData.mockDatabase);
            if (Array.isArray(emuResults) && emuResults.length > 0) {
                if (EMULATE_AUTO_ACCEPT) {
                    // Accept as correct based on emulation
                    dom.showResult(game.i18n.t('message.emulation_auto_accept'), 'success');
                    dom.displayTable(emuResults);
                    handleCorrectAnswer(game, floorData, query);
                    return;
                } else {
                    // Emulation produced results. Show them but do not grant rewards.
                    dom.showResult(game.i18n.t('message.emulation_results'), 'error');
                    dom.displayTable(emuResults);
                    return;
                }
            }
        } catch (e) {
            // ignore emulation errors and fall through to incorrect
        }

    dom.showResult(game.i18n.t('message.incorrect_try'), 'error');
}

function validateQuery(game, query, isSandbox = false) {
    const dom = game.dom;
    // In sandbox mode, skip item-ownership checks
    if (isSandbox) return true;

    const usableItems = new Set([
        ...game.player.inventory,
        ...game.player.borrowedItems,
        ...Object.keys(game.player.consumableItems).filter(k => game.player.consumableItems[k] > 0)
    ]);
    const words = query.toUpperCase().match(/[A-Z_][A-Z0-9_]*/g) || [];
    const wordSet = new Set(words);
    const queryUpper = query.toUpperCase();
    for (const clause of SQL_KEYWORDS) {
        // clause.keyword may be multi-word like 'ORDER BY'
        const clauseWords = (clause.keyword || '').toUpperCase().split(/\s+/).filter(Boolean);
        let used = false;
        if (clauseWords.length === 0) continue;
        if (clauseWords.length === 1) {
            used = wordSet.has(clauseWords[0]);
        } else {
            // match the full sequence (e.g. 'ORDER BY' or 'GROUP BY') to avoid false positives on shared words like 'BY'
            const re = new RegExp('\\b' + clauseWords.join('\\s+') + '\\b');
            used = re.test(queryUpper);
        }
        if (used) {
            // Require ownership of all parts of the clause (e.g., both 'GROUP' and 'BY')
            const ownsAll = clauseWords.every(w => usableItems.has(w));
            if (!ownsAll) {
                // Use i18n message with the human-friendly clause name
                dom.showResult(game.i18n.t('message.unknown_spell').replace('%s', clause.getKeyword({i18n: game.i18n})), 'error');
                return false;
            }
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
    dom.showResult(game.i18n.t('message.correct_result'), 'success');
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
    game.dom.showResult(game.i18n.t('message.next_spell').replace('%s', nextClause), 'hint', true);
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
