// UIイベントのバインド/UI更新

const EMULATE_AUTO_ACCEPT = false; // SQLエミュが行を返したら自動的に正解とみなす設定 (デフォルト: 無効)

import { SQLParser } from '../sql/sql-parser.js';

const sqlParser = new SQLParser();

import { EXECUTE_COST } from '../constants.js';
import Register from '../register.js';

import { handleHint } from './hint.js';
import { openShop, handleItemPurchase } from './shop.js';
import { ShopItem } from '../models/item.js';

export function setupUIHandlers(game) {
    const dom = game.dom;
    // Prevent binding handlers multiple times for same DOM manager
    if (dom.__uiHandlersBound) return;
    dom.__uiHandlersBound = true;
    dom.elements['start-button'].addEventListener('click', () => game.startGame());
    dom.elements['load-button'].addEventListener('click', () => game.loadGame());
    dom.elements['sandbox-button'].addEventListener('click', () => {
        game.startSandbox();
        try { history.pushState({ mode: 'sandbox' }, '', '?mode=sandbox'); } catch(e) {console.error(e);}
    });
    
    if (dom.elements['back-to-title-button']) {
        dom.elements['back-to-title-button'].addEventListener('click', () => {
            try {
                const proceed = () => {
                    try { const sc = document.querySelector('.sandbox-controls'); if (sc) sc.remove(); } catch(e){console.error(e);}
                    try { const sw = document.querySelectorAll('.sandbox-schema-wrapper'); if (sw) sw.forEach(s=>s.remove()); } catch(e){console.error(e);}
                    try { document.body.classList.remove('sandbox-mode'); } catch(e){console.error(e);}
                    game.dom.showScreen('start');
                    try { history.pushState({ mode: 'start' }, '', window.location.pathname); } catch(e){console.error(e);}
                };

                if (game && typeof game.isDirty === 'function' && game.isDirty() && !game.isSandbox) {
                    const msg = game.i18n ? game.i18n.t('confirm.unsaved_changes') : 'セーブしていません。タイトルに戻りますか？';
                    if (confirm(msg)) {
                        proceed();
                    }
                } else {
                    proceed();
                }
            } catch (e) { console.error('Back to title failed', e); }
        });
    }
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

    if (dom.elements['sql-editor']) {
        dom.elements['sql-editor'].addEventListener('input', () => {
            try { if (game && typeof game.markDirty === 'function') game.markDirty(); } catch(e){}
        });
    }
    dom.elements['quest-schema'].addEventListener('click', e => {
        if (e.target.classList.contains('schema-term')) {
            const term = e.target.dataset.term;
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
                // Ensure we create a ShopItem instance so getName/getDesc and effects are available
                const item = new ShopItem(itemData, game.i18n);
                handleItemPurchase(game, item);
                game.updateUI();
                openShop(game);
                try { if (game && typeof game.markDirty === 'function') game.markDirty(); } catch(e){}
            }
        }
    });
}

function executeQuery(game) {
    const dom = game.dom;
    const isSandbox = !game.player;
    const query = dom.elements['sql-editor'].value.trim();
    if (!query) {
        dom.showResult(game.i18n.t('message.empty_query'), 'error');
        return;
    }

    if (!isSandbox) {
            if (!game.player.spendEnergy(EXECUTE_COST)) {
            dom.showResult(game.i18n.t('message.no_energy'), 'error');
            return;
        }
    }


    const floorData = game.gameData?.dungeonData?.floors?.[game.currentFloor] || {};
        if (isSandbox) {
            // デバッグの隠しコマンド 'SELECT DEBUG PANEL' で debug.html にリダイレクト
            if (/^SELECT\s+DEBUG\s+PANEL$/i.test(query)) {
                try {
                    window.location.href = 'debug.html';
                    return;
                } catch (e) {
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

    // クエリに必要な呪文を所持しているかチェック
    if (!validateQuery(game, query, false)) return;

    // フロアの模範解答と照合
    const isCorrect = sqlParser.validate(query, floorData, game.gameData.mockDatabase);

    game.updateUI();

    if (isCorrect) {
        handleCorrectAnswer(game, floorData, query);
        return;
    }

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

    const registered = Register.getAll ? Object.values(Register.getAll('clause')) : [];
    const clauseList = (registered && registered.length) ? registered.map(c => {
        try {
            // If it's a constructor/class, instantiate; otherwise assume it's already an instance
            if (typeof c === 'function') return new c(game.i18n);
            return c;
        } catch (e) {
            // fallback: if instantiation fails, return as-is
            return c;
        }
    }) : [];
    
    for (const clause of clauseList) {
        // ORDER BY, GROUP BY のような複数語の句もあるので分割してチェック
        const clauseWords = (clause.keyword || '').toUpperCase().split(/\s+/).filter(Boolean);
        let used = false;
        if (clauseWords.length === 0) continue;
        if (clauseWords.length === 1) {
            used = wordSet.has(clauseWords[0]);
        } else {
            // BY のような部分語で誤検出しないように正規表現でチェックする
            const re = new RegExp('\\b' + clauseWords.join('\\s+') + '\\b');
            used = re.test(queryUpper);
        }
        if (used) {
            // by のような一般語で誤検出しないように、SQLキーワードリストにあるものだけをチェック
            const ownsAll = clauseWords.every(w => usableItems.has(w));
            if (!ownsAll) {
                dom.showResult(game.i18n.t('message.unknown_spell').replace('%s', clause.getKeyword({i18n: game.i18n})), 'error');
                return false;
            }
        }
    }
    return true;
}

function handleCorrectAnswer(game, floorData, query) {
    const dom = game.dom;
    // Defensive: ensure query is parseable before awarding/emulating
    const parsed = sqlParser.parseSQL(query);
    if (!parsed) {
        // try to suggest a correction for common typos
        const suggestions = {
            'innser': 'inner',
            'inser': 'inner',
            'selet': 'select',
            'frm': 'from',
            'whre': 'where',
            'grup': 'group',
            'grup by': 'group by',
            'ordr': 'order',
            'dep_name': 'dept_name'
        };
        const words = query.split(/(\s+|\W+)/);
        let changed = false;
        const corrected = words.map(w => {
            const lw = w.toLowerCase();
            if (suggestions[lw]) { changed = true; return suggestions[lw]; }
            return w;
        }).join('');

        if (changed) {
            const msg = (game.i18n ? game.i18n.t('message.invalid_query') : 'Invalid query') + '\n' + (game.i18n ? game.i18n.t('message.suggestion') : 'Did you mean:') + '\n' + corrected;
            dom.showResult(msg, 'error');
        } else {
            dom.showResult(game.i18n ? game.i18n.t('message.invalid_query') : 'Invalid query', 'error');
        }
        return;
    }

    try { if (game && typeof game.markDirty === 'function') game.markDirty(); } catch(e){}
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
        setTimeout(() => game.showEndScreen(game.i18n.t('message.clear'), game.i18n.t('message.clear_all')), 1200);
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
