// クエリ実行・検証ロジック

import { SQLParser } from '../sql/sql-parser.js';
import { EXECUTE_COST } from '../constants.js';
import Register from '../register.js';

const sqlParser = new SQLParser();
const EMULATE_AUTO_ACCEPT = false;

export function executeQuery(game) {
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
            const canonicalFloorNumTmp = (floorDataTmp && (floorDataTmp.floor || floorDataTmp.id)) 
                ? Number(floorDataTmp.floor || floorDataTmp.id) 
                : (Number(game.currentFloor) + 1);
            const floorKey = Number(canonicalFloorNumTmp);
            
            if (!game.player.clearedFloors || !game.player.clearedFloors.has(floorKey)) {
                if (!game.player.spendEnergy(EXECUTE_COST)) {
                    dom.showResult(game.i18n.t('message.no_energy'), 'error');
                    return;
                }
            }
        } catch (e) {
            if (!game.player.spendEnergy(EXECUTE_COST)) {
                dom.showResult(game.i18n.t('message.no_energy'), 'error');
                return;
            }
        }
    }

    try {
        console.log('[debug] executeQuery - currentFloor:', game.currentFloor);
        console.log('[debug] executeQuery - player.clearedFloors:', 
            game.player && game.player.clearedFloors ? Array.from(game.player.clearedFloors) : null);
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
        
        let sandboxDb = game.gameData.mockDatabase;
        try {
            const sel = Array.isArray(game.sandboxSelectedTables) ? game.sandboxSelectedTables : null;
            if (sel && sel.length > 0 && game.gameData && game.gameData.mockDatabase) {
                sandboxDb = {};
                sel.forEach(k => {
                    try { 
                        if (k && game.gameData.mockDatabase[k]) {
                            sandboxDb[k] = game.gameData.mockDatabase[k]; 
                        }
                    } catch(e) {}
                });
            }
        } catch (e) { 
            sandboxDb = game.gameData.mockDatabase; 
        }

        const results = sqlParser.emulate(query, game.currentFloor, sandboxDb) || [];
        if (!Array.isArray(results) || results.length === 0) {
            const err = diagnoseEmptyResult(sqlParser.parseSQL(query), results, sandboxDb, game.i18n);
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
    let validationDb = game.gameData.mockDatabase;
    try {
        const sel = Array.isArray(game.sandboxSelectedTables) ? game.sandboxSelectedTables : null;
        if (sel && sel.length > 0 && game.gameData && game.gameData.mockDatabase) {
            validationDb = {};
            sel.forEach(k => { 
                try { 
                    if (k && game.gameData.mockDatabase[k]) {
                        validationDb[k] = game.gameData.mockDatabase[k]; 
                    }
                } catch(e){} 
            });
        }
    } catch (e) { 
        validationDb = game.gameData.mockDatabase; 
    }

    const isCorrect = sqlParser.validate(query, floorData, validationDb);

    game.updateUI();

    if (isCorrect) {
        handleCorrectAnswer(game, floorData, query);
        return;
    }

    try {
        const emuResults = sqlParser.emulate(query, game.currentFloor, validationDb);
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
    } catch (e) {}

    try {
        const parsed = sqlParser.parseSQL(query);
        const diag = diagnoseEmptyResult(parsed, [], validationDb, game.i18n);
        dom.showResult(diag, 'error');
    } catch (e) {
        dom.showResult(game.i18n.t('message.incorrect_try'), 'error');
    }
}

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
                if (!(tk in mockDatabase)) {
                    return t('message.error_table_not_found', part.from.table) || `このテーブルは存在しません: ${part.from.table}`;
                }
            } catch (e) { 
                return t('message.invalid_query') || '無効なクエリです。'; 
            }
        }
    }

    const sampleTable = parsed.from && parsed.from.table 
        ? (mockDatabase[String(parsed.from.table).toLowerCase()] || []) 
        : [];
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
                if (!(key in sample)) {
                    return t('message.error_where_column_missing', key) || `WHERE 句のカラムが見つかりません: ${key}`;
                }
            }
        }
    } catch (e) {}

    return t('message.error_no_matching_rows') || t('message.incorrect_try') || '条件に合う行が見つかりませんでした。';
}

export function validateQuery(game, query, isSandbox = false) {
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
        const clauseWords = (clause.keyword || '').toUpperCase().split(/\s+/).filter(Boolean);
        let used = false;
        
        if (clauseWords.length === 0) continue;
        
        if (clauseWords.length === 1) {
            used = wordSet.has(clauseWords[0]);
        } else {
            const re = new RegExp('\\b' + clauseWords.join('\\s+') + '\\b');
            used = re.test(queryUpper);
        }
        
        if (used) {
            const ownsAll = clauseWords.every(w => usableItems.has(w));
            if (!ownsAll) {
                let kw = null;
                try { 
                    kw = (typeof clause.getKeyword === 'function') 
                        ? clause.getKeyword({i18n: game.i18n}) 
                        : (clause.keyword || ''); 
                } catch (e) { 
                    kw = (clause && clause.keyword) ? clause.keyword : ''; 
                }
                
                if (!kw) kw = clauseWords.join(' ');
                const displayKw = (kw === undefined || kw === null) ? '' : String(kw);
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

export function handleCorrectAnswer(game, floorData, query) {
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
            if (suggestions[lw]) { 
                changed = true; 
                return suggestions[lw]; 
            }
            return w;
        }).join('');

        if (changed) {
            const msg = (game.i18n ? game.i18n.t('message.invalid_query') : 'Invalid query') + '\n' + 
                       (game.i18n ? game.i18n.t('message.suggestion') : 'Did you mean:') + '\n' + corrected;
            dom.showResult(msg, 'error');
        } else {
            dom.showResult(game.i18n ? game.i18n.t('message.invalid_query') : 'Invalid query', 'error');
        }
        return;
    }

    try { 
        if (game && typeof game.markDirty === 'function') game.markDirty(); 
    } catch(e){}
    
    try {
        const canonicalFloorNum = (floorData && (floorData.floor || floorData.id)) 
            ? Number(floorData.floor || floorData.id) 
            : (Number(game.currentFloor) + 1);
        const floorKeyCheck = Number(canonicalFloorNum);
        
        if (!game.player.clearedFloors) game.player.clearedFloors = new Set();
        
        console.log('[debug] handleCorrectAnswer - canonicalFloorNum:', canonicalFloorNum, 'floorKeyCheck:', floorKeyCheck);
        console.log('[debug] handleCorrectAnswer - clearedFloors before:', Array.from(game.player.clearedFloors));
        
        if (!game.player.clearedFloors.has(floorKeyCheck)) {
            if (floorData.reward) {
                game.player.addGold(floorData.reward.gold || 0);
                game.player.addEnergy(floorData.reward.energy || 0);
                (floorData.reward.items || []).forEach(item => game.player.addItem(item));
            }
            
            const keyNumeric = Number(canonicalFloorNum);
            if (!game.player.clearedFloors) game.player.clearedFloors = new Set();
            
            console.debug('[handleCorrectAnswer] marking floor cleared', { 
                currentFloorIndex: game.currentFloor, 
                floorDataFloor: floorData && (floorData.floor || floorData.id), 
                keysToAdd: [keyNumeric], 
                before: Array.from(game.player.clearedFloors) 
            });
            
            game.player.clearedFloors.add(keyNumeric);
            console.debug('[handleCorrectAnswer] clearedFloors after add', Array.from(game.player.clearedFloors));
            
            try { 
                if (game && typeof game.updateUI === 'function') game.updateUI(); 
            } catch (e) { 
                console.error('Failed to update UI after reward', e); 
            }
        }
    } catch (e) { 
        console.error('Failed to apply/mark floor reward', e); 
    }
    
    dom.showResult(game.i18n.t('message.correct_result'), 'success');
    dom.displayTable(sqlParser.emulate(query, game.currentFloor, game.gameData.mockDatabase));
    dom.elements['floor-actions-container'].classList.remove('hidden');
    
    if (game.currentFloor < game.gameData.dungeonData.floors.length - 1) {
        console.debug('[handleCorrectAnswer] showing next-floor; currentFloor:', game.currentFloor, 
            'floorsLen:', game.gameData.dungeonData.floors.length, 
            'clearedFloors:', Array.from(game.player.clearedFloors || []));
        
        if (dom.elements['next-floor-btn']) {
            dom.elements['next-floor-btn'].classList.remove('hidden');
            try { dom.elements['next-floor-btn'].style.display = ''; } catch(e) {}
            dom.elements['next-floor-btn'].onclick = () => {
                game.currentFloor++;
                game.loadFloor(game.currentFloor);
            };
        }
    } else {
        dom.elements['next-floor-btn'].classList.add('hidden');
        dom.elements['next-floor-btn'].onclick = null;

        try {
            const isCleared = (() => {
                try {
                    const fd = game.gameData.dungeonData.floors[game.currentFloor];
                    const canonicalFloorNum = fd && (fd.floor || fd.id) 
                        ? Number(fd.floor || fd.id) 
                        : (Number(game.currentFloor) + 1);
                    const candidates = [`floor:${canonicalFloorNum}`];
                    
                    console.debug('[handleCorrectAnswer] isCleared candidates', candidates, 
                        'player.clearedFloors', Array.from(game.player.clearedFloors || []));
                    
                    return game.player && game.player.clearedFloors && 
                           candidates.some(c => game.player.clearedFloors.has(c));
                } catch (e) { 
                    return false; 
                }
            })();

            const hasNextDungeon = !!(game.gameData && game.gameData.dungeons && 
                                     Object.keys(game.gameData.dungeons).length > 1);
            
            if (isCleared && hasNextDungeon && dom.elements['next-dungeon-btn']) {
                dom.elements['next-dungeon-btn'].classList.remove('hidden');
                try { dom.elements['next-dungeon-btn'].style.display = ''; } catch(e) {}
                try { 
                    dom.elements['floor-actions-container'] && 
                    dom.elements['floor-actions-container'].classList.remove('hidden'); 
                } catch(e) {}
                
                dom.elements['next-dungeon-btn'].onclick = async () => {
                    const ok = game.advanceToNextDungeon ? game.advanceToNextDungeon() : false;
                    if (!ok) {
                        setTimeout(() => game.showEndScreen(
                            game.i18n.t('message.clear'), 
                            game.i18n.t('message.clear_all')
                        ), 1200);
                    }
                };
            } else {
                if (dom.elements['next-dungeon-btn']) {
                    dom.elements['next-dungeon-btn'].classList.add('hidden');
                    dom.elements['next-dungeon-btn'].onclick = null;
                }
                
                try {
                    const dungeonKey = game.currentDungeon || null;
                    if (dungeonKey && game.player) {
                        if (!game.player.clearedDungeons) game.player.clearedDungeons = new Set();
                        game.player.clearedDungeons.add(dungeonKey);
                        try { 
                            if (typeof game.saveGame === 'function') game.saveGame(); 
                        } catch (e) { 
                            console.warn('Auto-save failed after dungeon clear', e); 
                        }
                    }
                } catch (e) { 
                    console.error('Failed to mark dungeon cleared', e); 
                }

                setTimeout(() => game.showEndScreen(
                    game.i18n.t('message.clear'), 
                    game.i18n.t('message.clear_all')
                ), 1200);
            }
        } catch (e) {
            setTimeout(() => game.showEndScreen(
                game.i18n.t('message.clear'), 
                game.i18n.t('message.clear_all')
            ), 1200);
        }
    }
    
    if (floorData.opensShop) {
        dom.elements['shop-btn'].classList.remove('hidden');
    } else {
        dom.elements['shop-btn'].classList.add('hidden');
    }
}

export function useKuNext(game) {
    if (!game.player || game.player.specialItems.kuNext <= 0) return;
    
    game.player.specialItems.kuNext--;
    const query = game.dom.elements['sql-editor'].value.trim().toUpperCase();
    const lastWord = query.split(/\s+/).pop() || '';
    let nextClause = determineNextClause(game, query, lastWord);
    
    if (typeof nextClause !== 'string' || !nextClause) nextClause = '不明';
    
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
        allowed = Array.isArray(floorData.borrowed) 
            ? floorData.borrowed.map(s => s.toUpperCase()) 
            : null;
    } catch (e) {
        allowed = null;
    }

    if (Object.keys(game.gameData.mockDatabase).includes(lastWord.toLowerCase())) {
        const defaultSet = ['WHERE', 'JOIN', 'GROUP BY'];
        const candidates = allowed ? defaultSet.filter(w => {
            if (w === 'GROUP BY') {
                return allowed.includes('GROUP') || allowed.includes('GROUP BY') || 
                       (allowed.includes('GROUP') && allowed.includes('BY'));
            }
            return allowed.includes(w) || allowed.includes(w.split(' ')[0]);
        }) : defaultSet;
        return candidates.length ? candidates.join(' / ') : 'WHERE';
    }

    if (lastWord === 'WHERE' || lastWord === 'ON') {
        const allowGroup = allowed ? (allowed.includes('GROUP') || allowed.includes('GROUP BY') || 
                                     (allowed.includes('GROUP') && allowed.includes('BY'))) : true;
        return allowGroup ? 'GROUP BY / JOIN' : (allowed && allowed.includes('JOIN') ? 'JOIN' : '不明');
    }
    
    if (lastWord === 'BY') return 'HAVING';
    if (lastWord === 'JOIN') return 'ON';
    
    return '不明';
}
