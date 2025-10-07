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
            const insertText = String(e.target.dataset.item || '');
            const fnMatch = insertText.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*$/i);
            if (fnMatch) {
                const fn = fnMatch[1].toUpperCase();
                const editor = dom.elements['sql-editor'];
                const before = editor.value || '';
                const selectionStart = editor.selectionStart || before.length;
                const selectionEnd = editor.selectionEnd || selectionStart;
                const toInsert = `${fn}()`;
                const newVal = before.slice(0, selectionStart) + toInsert + ' ' + before.slice(selectionEnd);
                editor.value = newVal;

                const cursorPos = selectionStart + fn.length + 1;
                try { editor.focus(); editor.setSelectionRange(cursorPos, cursorPos); } catch (err) { editor.focus(); }
            } else {
                dom.elements['sql-editor'].value += `${insertText} `;
                dom.elements['sql-editor'].focus();
            }
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
                const item = new ShopItem(itemData, game.i18n);

                try { console.log('[shop] purchasing item instance:', item); } catch(e){}
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
        try {
            const floorDataTmp = game.gameData?.dungeonData?.floors?.[game.currentFloor] || {};
            const canonicalFloorNumTmp = (floorDataTmp && (floorDataTmp.floor || floorDataTmp.id)) ? Number(floorDataTmp.floor || floorDataTmp.id) : (Number(game.currentFloor) + 1);
            const floorKey = Number(canonicalFloorNumTmp);
            if (!game.player.clearedFloors || !game.player.clearedFloors.has(floorKey)) {
                if (!game.player.spendEnergy(EXECUTE_COST)) {
                    dom.showResult(game.i18n.t('message.no_energy'), 'error');
                    return;
                }
            }
        } catch (e) {
            // Fallback: spend energy normally
            if (!game.player.spendEnergy(EXECUTE_COST)) {
                dom.showResult(game.i18n.t('message.no_energy'), 'error');
                return;
            }
        }
    }

    try {
        try { console.log('[debug] executeQuery - currentFloor:', game.currentFloor); } catch(e){}
        try { console.log('[debug] executeQuery - player.clearedFloors:', game.player && game.player.clearedFloors ? Array.from(game.player.clearedFloors) : null); } catch(e){}
    } catch (e) {}


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

            if (!parsed.select || !parsed.from) {
                if (Array.isArray(parsed.multiple) && parsed.multiple.length > 0) {
                    const allSimple = parsed.multiple.every(p => {
                        try {
                            const part = sqlParser.parseSQL(p.raw);
                            return part && part.select && part.from;
                        } catch (e) { return false; }
                    });
                    if (!allSimple) {
                        dom.showResult(game.i18n.t('message.sandbox_select_from'), 'error');
                        return;
                    }
                } else {
                    dom.showResult(game.i18n.t('message.sandbox_select_from'), 'error');
                    return;
                }
            }
            const results = sqlParser.emulate(query, game.currentFloor, game.gameData.mockDatabase) || [];
            if (!Array.isArray(results) || results.length === 0) {
                const err = diagnoseEmptyResult(sqlParser.parseSQL(query), results, game.gameData.mockDatabase, game.i18n);
                dom.showResult(err, 'error');
                dom.displayTable([]);
                return;
            }
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
                dom.showResult(game.i18n.t('message.emulation_auto_accept'), 'success');
                dom.displayTable(emuResults);
                handleCorrectAnswer(game, floorData, query);
                return;
            } else {
                dom.showResult(game.i18n.t('message.emulation_results'), 'error');
                dom.displayTable(emuResults);
                return;
            }
        }
    } catch (e) {

    }

    try {
        const parsed = sqlParser.parseSQL(query);
        const diag = diagnoseEmptyResult(parsed, [], game.gameData.mockDatabase, game.i18n);
        dom.showResult(diag, 'error');
    } catch (e) {
        dom.showResult(game.i18n.t('message.incorrect_try'), 'error');
    }
}


/**
 * 結果が空になった理由を診断し、ローカライズされたメッセージ（文字列）を返す
 * @param {*} parsed 
 * @param {*} results 
 * @param {*} mockDatabase 
 * @param {*} i18n
 * @returns {string}
 */
function diagnoseEmptyResult(parsed, results, mockDatabase, i18n) {
    const t = (k, ...args) => (i18n && typeof i18n.t === 'function') ? i18n.t(k, ...args) : null;
    if (!parsed) return t('message.invalid_query') || '無効なクエリです。';

    try {
        if (parsed.from && parsed.from.table) {
            const tableKey = String(parsed.from.table).toLowerCase();
            if (!(tableKey in mockDatabase)) {
                return `このテーブルは存在しません: ${parsed.from.table}`;
            }
        }
    } catch (e) {}

    if (Array.isArray(parsed.multiple) && parsed.multiple.length > 0) {
        for (const p of parsed.multiple) {
            try {
                const part = sqlParser.parseSQL(p.raw);
                if (!part) return t('message.invalid_query') || '無効なクエリです。';
                const tk = String(part.from.table).toLowerCase();
                    if (!(tk in mockDatabase)) return t('message.error_table_not_found', part.from.table) || `このテーブルは存在しません: ${part.from.table}`;
            } catch (e) { return t('message.invalid_query') || '無効なクエリです。'; }
        }
    }

    const sampleTable = parsed.from && parsed.from.table ? (mockDatabase[String(parsed.from.table).toLowerCase()] || []) : [];
    const sample = (Array.isArray(sampleTable) && sampleTable.length) ? sampleTable[0] : null;
    if (sample && parsed.select && parsed.select.length > 0 && !(parsed.select.length === 1 && parsed.select[0] === '*')) {
        for (const col of parsed.select) {
            const clean = col.replace(/\s+as\s+.*/i, '').trim();
            if (clean === '*' || /\(|\)/.test(clean)) continue;
            const key = clean.includes('.') ? clean.split('.').pop() : clean;
            if (!(key in sample)) {
                return t('message.error_attribute_not_found', key) || `この属性は存在しません: ${key}`;
            }
        }
    }

    try {
        if (parsed.where && sample) {
            const m = parsed.where.match(/(\w+(?:\.\w+)?)\s*(?:=|!=|<>|>|<|>=|<=)\s*/);
            if (m) {
                const col = m[1];
                const key = col.includes('.') ? col.split('.').pop() : col;
                if (!(key in sample)) return t('message.error_where_column_missing', key) || `WHERE 句のカラムが見つかりません: ${key}`;
            }
        }
    } catch (e) {}

    return t('message.error_no_matching_rows') || t('message.incorrect_try') || '条件に合う行が見つかりませんでした。';
}

function validateQuery(game, query, isSandbox = false) {
    const dom = game.dom;
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
            if (typeof c === 'function') return new c(game.i18n);
            return c;
        } catch (e) {
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
                // Safely get a display name for the clause; fall back to clause.keyword or a generic placeholder
                let kw = null;
                try { kw = (typeof clause.getKeyword === 'function') ? clause.getKeyword({i18n: game.i18n}) : (clause.keyword || ''); } catch (e) { kw = (clause && clause.keyword) ? clause.keyword : ''; }
                if (!kw) kw = clauseWords.join(' ');
                const displayKw = (kw === undefined || kw === null) ? '' : String(kw);
                try { console.debug('[validateQuery] unknown-spell debug', { clauseKeyword: clause.keyword, kw, displayKw, clauseObj: clause }); } catch(e) {}
                // Use i18n formatting with a safe fallback so undefined never appears
                const safeName = displayKw || '不明';
                if (game && game.i18n && typeof game.i18n.t === 'function') {
                    dom.showResult(game.i18n.t('message.unknown_spell', safeName), 'error');
                } else {
                    dom.showResult(`まだ覚えていない呪文「${safeName}」が含まれています。`, 'error');
                }
                return false;
            }
        }
    }
    return true;
}

function handleCorrectAnswer(game, floorData, query) {
    const dom = game.dom;
    const parsed = sqlParser.parseSQL(query);
    if (!parsed) {
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
    // Apply dungeon reward only on the first correct clear of this floor
    try {
    const canonicalFloorNum = (floorData && (floorData.floor || floorData.id)) ? Number(floorData.floor || floorData.id) : (Number(game.currentFloor) + 1);
    const floorKeyCheck = Number(canonicalFloorNum);
    if (!game.player.clearedFloors) game.player.clearedFloors = new Set();
    // DEBUG: log before applying reward
    try { console.log('[debug] handleCorrectAnswer - canonicalFloorNum:', canonicalFloorNum, 'floorKeyCheck:', floorKeyCheck); } catch(e){}
    try { console.log('[debug] handleCorrectAnswer - clearedFloors before:', Array.from(game.player.clearedFloors)); } catch(e){}
    if (!game.player.clearedFloors.has(floorKeyCheck)) {
            // first time clear: grant reward from dungeon-data.json
            try { console.log('[debug] handleCorrectAnswer - granting reward for floor', floorId, floorData.reward); } catch(e){}
            if (floorData.reward) {
                game.player.addGold(floorData.reward.gold || 0);
                game.player.addEnergy(floorData.reward.energy || 0);
                (floorData.reward.items || []).forEach(item => game.player.addItem(item));
            }
            // mark cleared to prevent future rewards for this floor
            try {
                // canonical numeric floor number (prefer floor/id, else index+1)
                const canonicalFloorNum = (floorData && (floorData.floor || floorData.id)) ? Number(floorData.floor || floorData.id) : (Number(game.currentFloor) + 1);
                const keyNumeric = Number(canonicalFloorNum);
                if (!game.player.clearedFloors) game.player.clearedFloors = new Set();
                try { console.debug('[handleCorrectAnswer] marking floor cleared', { currentFloorIndex: game.currentFloor, floorDataFloor: floorData && (floorData.floor || floorData.id), keysToAdd: [keyNumeric], before: Array.from(game.player.clearedFloors) }); } catch(e) {}
                // add numeric key
                game.player.clearedFloors.add(keyNumeric);
                try { console.debug('[handleCorrectAnswer] clearedFloors after add', Array.from(game.player.clearedFloors)); } catch(e){}
            } catch (e) {
                console.error('Failed to mark floor cleared', e);
            }
            // Update UI immediately so player sees gold/energy changes from the reward
            try { if (game && typeof game.updateUI === 'function') game.updateUI(); } catch (e) { console.error('Failed to update UI after reward', e); }
        } else {
            try { console.log('[debug] handleCorrectAnswer - floor already cleared, skipping reward:', floorId); } catch(e){}
        }
    } catch (e) { console.error('Failed to apply/mark floor reward', e); }
    dom.showResult(game.i18n.t('message.correct_result'), 'success');
    dom.displayTable(sqlParser.emulate(query, game.currentFloor, game.gameData.mockDatabase));
    dom.elements['floor-actions-container'].classList.remove('hidden');
    if (game.currentFloor < game.gameData.dungeonData.floors.length - 1) {
        try { console.debug('[handleCorrectAnswer] showing next-floor; currentFloor:', game.currentFloor, 'floorsLen:', game.gameData.dungeonData.floors.length, 'clearedFloors:', Array.from(game.player.clearedFloors || [])); } catch(e) {}
        if (dom.elements['next-floor-btn']) {
            dom.elements['next-floor-btn'].classList.remove('hidden');
            try { dom.elements['next-floor-btn'].style.display = ''; } catch(e) {}
            dom.elements['next-floor-btn'].onclick = () => {
                game.currentFloor++;
                game.loadFloor(game.currentFloor);
            };
            try { this && console.debug && console.debug('[handleCorrectAnswer] next-floor button configured'); } catch(e) {}
        }
    } else {
        dom.elements['next-floor-btn'].classList.add('hidden');
        dom.elements['next-floor-btn'].onclick = null;

        // If this is the last floor, show either a next-dungeon button (if another dungeon is available and this floor is cleared)
        try {
            const isCleared = (() => {
                try {
                    const fd = game.gameData.dungeonData.floors[game.currentFloor];
                    const canonicalFloorNum = fd && (fd.floor || fd.id) ? Number(fd.floor || fd.id) : (Number(game.currentFloor) + 1);
                    const candidates = [`floor:${canonicalFloorNum}`];
                    try { console.debug('[handleCorrectAnswer] isCleared candidates', candidates, 'player.clearedFloors', Array.from(game.player.clearedFloors || [])); } catch(e) {}
                    return game.player && game.player.clearedFloors && candidates.some(c => game.player.clearedFloors.has(c));
                } catch (e) { return false; }
            })();

            const hasNextDungeon = !!(game.gameData && game.gameData.dungeons && Object.keys(game.gameData.dungeons).length > 1);
            try { console.debug('[handleCorrectAnswer] next-dungeon check', { currentDungeon: game.currentDungeon, dungeonKeys: Object.keys(game.gameData?.dungeons || {}), hasNextDungeon }); } catch(e) {}
            if (isCleared && hasNextDungeon && dom.elements['next-dungeon-btn']) {
                try { console.debug('[handleCorrectAnswer] showing next-dungeon button; pre-state:', { className: dom.elements['next-dungeon-btn'].className, inlineDisplay: dom.elements['next-dungeon-btn'].style && dom.elements['next-dungeon-btn'].style.display }); } catch(e) {}
                dom.elements['next-dungeon-btn'].classList.remove('hidden');
                try { dom.elements['next-dungeon-btn'].style.display = ''; } catch(e) {}
                // make sure the container is visible
                try { dom.elements['floor-actions-container'] && dom.elements['floor-actions-container'].classList.remove('hidden'); } catch(e) {}
                dom.elements['next-dungeon-btn'].onclick = async () => {
                    const ok = game.advanceToNextDungeon ? game.advanceToNextDungeon() : false;
                    if (!ok) {
                        // fallback: show end screen
                        setTimeout(() => game.showEndScreen(game.i18n.t('message.clear'), game.i18n.t('message.clear_all')), 1200);
                    }
                };
                try { console.debug('[handleCorrectAnswer] next-dungeon button shown; post-state:', { className: dom.elements['next-dungeon-btn'].className, inlineDisplay: dom.elements['next-dungeon-btn'].style && dom.elements['next-dungeon-btn'].style.display }); } catch(e) {}
            } else {
                try { console.debug('[handleCorrectAnswer] not showing next-dungeon; reasons', { isCleared, hasNextDungeon, hasButton: !!dom.elements['next-dungeon-btn'] }); } catch(e) {}
                if (dom.elements['next-dungeon-btn']) {
                    dom.elements['next-dungeon-btn'].classList.add('hidden');
                    dom.elements['next-dungeon-btn'].onclick = null;
                }
                // mark the whole dungeon as cleared for the player
                try {
                    const dungeonKey = game.currentDungeon || null;
                    if (dungeonKey && game.player) {
                        if (!game.player.clearedDungeons) game.player.clearedDungeons = new Set();
                        game.player.clearedDungeons.add(dungeonKey);
                        // auto-save so the cleared dungeon is persisted and included in export
                        try { if (typeof game.saveGame === 'function') game.saveGame(); } catch (e) { console.warn('Auto-save failed after dungeon clear', e); }
                    }
                } catch (e) { console.error('Failed to mark dungeon cleared', e); }

                setTimeout(() => game.showEndScreen(game.i18n.t('message.clear'), game.i18n.t('message.clear_all')), 1200);
            }
        } catch (e) {
            setTimeout(() => game.showEndScreen(game.i18n.t('message.clear'), game.i18n.t('message.clear_all')), 1200);
        }
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
    if (typeof nextClause !== 'string' || !nextClause) nextClause = '不明';
    // Use i18n formatting (pass as argument) instead of manual replace to avoid 'undefined' insertion
    game.dom.showResult(game.i18n.t('message.next_spell', nextClause), 'hint', true);
    game.updateUI();
}

function determineNextClause(game, query, lastWord) {
    if (query === '') return 'SELECT';

    try {
        const hasSelect = /\bSELECT\b/i.test(query);
        const hasFrom = /\bFROM\b/i.test(query);
        if (hasSelect && !hasFrom) return 'FROM';
    } catch (e) {}
    if (['SELECT', ','].includes(lastWord) || /\w+\(.*\)/.test(lastWord)) return 'FROM';

    let allowed = null;
    try {
        const floorIndex = game.currentFloor || 0;
        const floorData = game.gameData?.dungeonData?.floors?.[floorIndex] || {};
        allowed = Array.isArray(floorData.borrowed) ? floorData.borrowed.map(s => s.toUpperCase()) : null;
    } catch (e) {
        allowed = null;
    }

    if (Object.keys(game.gameData.mockDatabase).includes(lastWord.toLowerCase())) {
        const defaultSet = ['WHERE', 'JOIN', 'GROUP BY'];
        const candidates = allowed ? defaultSet.filter(w => {
            if (w === 'GROUP BY') return allowed.includes('GROUP') || allowed.includes('GROUP BY') || (allowed.includes('GROUP') && allowed.includes('BY'));
            return allowed.includes(w) || allowed.includes(w.split(' ')[0]);
        }) : defaultSet;
        return candidates.length ? candidates.join(' / ') : 'WHERE';
    }

    if (lastWord === 'WHERE' || lastWord === 'ON') {
        const allowGroup = allowed ? (allowed.includes('GROUP') || allowed.includes('GROUP BY') || (allowed.includes('GROUP') && allowed.includes('BY'))) : true;
        return allowGroup ? 'GROUP BY / JOIN' : (allowed && allowed.includes('JOIN') ? 'JOIN' : '不明');
    }
    if (lastWord === 'BY') return 'HAVING';
    if (lastWord === 'JOIN') return 'ON';
    return '不明';
}
