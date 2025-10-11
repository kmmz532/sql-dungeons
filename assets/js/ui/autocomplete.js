// SQLエディタのオートコンプリート機能

const SQL_KEYWORDS = ['SELECT','FROM','WHERE','GROUP BY','ORDER BY','HAVING','JOIN','LEFT JOIN','RIGHT JOIN','INNER JOIN','ON','AS','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE','IS','NULL','CASE','WHEN','THEN','ELSE','END','LIMIT'];
const SQL_FUNCTIONS = ['COUNT','SUM','AVG','MIN','MAX','COALESCE','ROW_NUMBER','RANK'];

export function setupAutocomplete(editor, game) {
    // create autocomplete container
    const ac = document.createElement('div');
    ac.className = 'sql-autocomplete';
    ac.style.position = 'absolute';
    ac.style.zIndex = 9999;
    ac.style.display = 'none';
    ac.setAttribute('role', 'listbox');
    document.body.appendChild(ac);

    let suggestions = [];
    let activeIndex = -1;

    // Helper: return caret rect for textarea (approximate) by mirroring content
    const getCaretRect = (textarea, position) => {
        try {
            const style = getComputedStyle(textarea);
            const rect = textarea.getBoundingClientRect();
            const div = document.createElement('div');
            
            // copy textarea styles that affect layout
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordWrap = 'break-word';
            div.style.position = 'absolute';
            div.style.visibility = 'hidden';
            div.style.top = rect.top + 'px';
            div.style.left = rect.left + 'px';
            div.style.width = rect.width + 'px';
            div.style.fontFamily = style.fontFamily;
            div.style.fontSize = style.fontSize;
            div.style.fontWeight = style.fontWeight;
            div.style.lineHeight = style.lineHeight;
            div.style.padding = style.padding;
            div.style.boxSizing = style.boxSizing;
            div.style.overflow = 'hidden';

            // copy value up to caret, escape HTML
            const value = textarea.value.substring(0, position);
            const escaped = value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const html = escaped.replace(/\n/g, '<br/>').replace(/\s/g, '&nbsp;');
            div.innerHTML = html + '<span id="caret-span">&nbsp;</span>';
            document.body.appendChild(div);
            const span = div.querySelector('#caret-span');
            const spanRect = span.getBoundingClientRect();
            const outRect = { 
                left: spanRect.left, 
                top: spanRect.top, 
                bottom: spanRect.bottom, 
                right: spanRect.right, 
                height: spanRect.height 
            };
            document.body.removeChild(div);
            return outRect;
        } catch (e) {
            return textarea.getBoundingClientRect();
        }
    };

    const getCandidates = () => {
        const db = (game.gameData && game.gameData.mockDatabase) ? game.gameData.mockDatabase : {};
        const isSandbox = !game.player;
        
        // determine candidate tables: in sandbox use selectedTables, otherwise use floor's tables
        let tables = [];
        try {
            if (isSandbox) {
                const sel = Array.isArray(game.sandboxSelectedTables) && game.sandboxSelectedTables.length 
                    ? game.sandboxSelectedTables 
                    : Object.keys(db).filter(k => !k.startsWith('__'));
                tables = sel;
            } else {
                const floorData = game.gameData?.dungeonData?.floors?.[game.currentFloor] || {};
                if (Array.isArray(floorData.tables) && floorData.tables.length) {
                    tables = floorData.tables;
                } else {
                    tables = Object.keys(db).filter(k => !k.startsWith('__'));
                }
            }
        } catch (e) { 
            tables = Object.keys(db).filter(k => !k.startsWith('__')); 
        }

        const cols = new Set();
        tables.forEach(t => {
            try {
                const rows = db[t] || db[t.toLowerCase()] || [];
                if (Array.isArray(rows) && rows.length > 0) {
                    Object.keys(rows[0]).forEach(c => cols.add(c));
                }
            } catch (e) {}
        });

        // keywords: restrict to usable clauses when not sandbox
        let keywords = SQL_KEYWORDS.slice();
        // functions: default to all, but may be filtered for non-sandbox (only learned functions)
        let functions = SQL_FUNCTIONS.slice();
        
        if (!isSandbox) {
            try {
                // collect learned spells / usable clause words from player's inventory/borrowed/consumableItems
                const learned = new Set();
                try {
                    if (game.player && game.player.inventory) {
                        if (Array.isArray(game.player.inventory)) {
                            game.player.inventory.forEach(i => learned.add(String(i).toUpperCase()));
                        } else if (game.player.inventory instanceof Set) {
                            Array.from(game.player.inventory).forEach(i => learned.add(String(i).toUpperCase()));
                        }
                    }
                } catch(e){}
                
                try { 
                    if (game.player && game.player.borrowedItems) {
                        Array.from(game.player.borrowedItems).forEach(i => learned.add(String(i).toUpperCase())); 
                    }
                } catch(e){}
                
                try { 
                    if (game.player && game.player.consumableItems) {
                        Object.keys(game.player.consumableItems).forEach(k => { 
                            if (game.player.consumableItems[k] > 0) {
                                learned.add(String(k).toUpperCase()); 
                            }
                        }); 
                    }
                } catch(e){}
                
                if (learned.size > 0) {
                    keywords = keywords.filter(k => {
                        const first = k.split(' ')[0].toUpperCase();
                        return learned.has(first) || learned.has(k.toUpperCase());
                    });
                }
                
                // filter functions to only those the player has learned (when not sandbox)
                if (learned.size > 0) {
                    functions = functions.filter(f => learned.has(String(f).toUpperCase()));
                } else {
                    // if player hasn't learned any spells, don't show functions in normal mode
                    functions = [];
                }
            } catch (e) {}
        }

        return {
            keywords,
            functions,
            tables,
            columns: Array.from(cols)
        };
    };

    const showAutocomplete = (list, anchorRect) => {
        ac.innerHTML = '';
        if (!list || !list.length) { 
            ac.style.display = 'none'; 
            return; 
        }
        
        list.forEach((s, i) => {
            const it = document.createElement('div');
            it.className = 'sql-ac-item';
            it.setAttribute('role','option');
            it.dataset.index = i;
            it.textContent = s.display;
            it.style.padding = '4px 6px';
            it.style.cursor = 'pointer';
            it.style.borderRadius = '4px';
            
            it.addEventListener('mouseover', () => {
                const items = ac.querySelectorAll('.sql-ac-item');
                items.forEach(x => x.classList.remove('active'));
                it.classList.add('active');
                activeIndex = Number(it.dataset.index);
            });
            
            it.addEventListener('mousedown', (ev) => {
                ev.preventDefault(); // prevent blur
                insertSuggestion(s);
            });
            
            ac.appendChild(it);
        });

        ac.style.background = 'rgba(30,30,30,0.95)';
        ac.style.color = '#fff';
        ac.style.border = '1px solid rgba(255,255,255,0.08)';
        ac.style.padding = '6px 8px';
        ac.style.borderRadius = '6px';
        ac.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
        ac.style.maxHeight = '240px';
        ac.style.overflow = 'auto';

        if (anchorRect) {
            const left = (anchorRect.left || anchorRect.x) || editor.getBoundingClientRect().left;
            const top = (anchorRect.bottom || (anchorRect.top + (anchorRect.height || 16))) || (editor.getBoundingClientRect().bottom + 4);
            ac.style.left = (left) + 'px';
            ac.style.top = (top + 6) + 'px';
        } else {
            const r = editor.getBoundingClientRect();
            ac.style.left = r.left + 'px';
            ac.style.top = (r.bottom + 4) + 'px';
        }
        
        ac.style.display = 'block';
        activeIndex = -1;
        suggestions = list;
    };

    const hideAutocomplete = () => { 
        ac.style.display = 'none'; 
        suggestions = []; 
        activeIndex = -1; 
    };

    const insertSuggestion = (s) => {
        const before = editor.value || '';
        const pos = Number(editor.selectionStart || before.length);
        const left = before.slice(0, pos);
        const m = left.match(/[\w\.]*$/);
        const start = m ? (pos - (m[0] ? m[0].length : 0)) : pos;
        const insertText = s.insert || s.display;

        try {
            editor.focus();
            editor.setSelectionRange(start, pos);
            
            if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, insertText);
                let cursor = start + insertText.length;
                const parenIndex = insertText.indexOf('()');
                if (parenIndex >= 0) cursor = start + parenIndex + 1;
                else if (insertText.endsWith('(')) cursor = start + insertText.length;
                try { editor.setSelectionRange(cursor, cursor); } catch(e) {}
            } else if (typeof editor.setRangeText === 'function') {
                editor.setRangeText(insertText, start, pos, 'end');
                let cursor = start + insertText.length;
                const parenIndex = insertText.indexOf('()');
                if (parenIndex >= 0) cursor = start + parenIndex + 1;
                else if (insertText.endsWith('(')) cursor = start + insertText.length;
                try { editor.setSelectionRange(cursor, cursor); } catch(e) {}
            } else {
                const newVal = before.slice(0, start) + insertText + before.slice(pos);
                editor.value = newVal;
                let cursor = start + insertText.length;
                const parenIndex = insertText.indexOf('()');
                if (parenIndex >= 0) cursor = start + parenIndex + 1;
                else if (insertText.endsWith('(')) cursor = start + insertText.length;
                try { editor.focus(); editor.setSelectionRange(cursor, cursor); } catch(e) { editor.focus(); }
            }
        } catch (e) {
            const newVal = before.slice(0, start) + insertText + before.slice(pos);
            editor.value = newVal;
            let cursor = start + insertText.length;
            const parenIndex = insertText.indexOf('()');
            if (parenIndex >= 0) cursor = start + parenIndex + 1;
            else if (insertText.endsWith('(')) cursor = start + insertText.length;
            try { editor.focus(); editor.setSelectionRange(cursor, cursor); } catch(e) { editor.focus(); }
        }
        hideAutocomplete();
    };

    const buildSuggestions = (prefix) => {
        const cand = getCandidates();
        const p = String(prefix || '').toLowerCase();
        const out = [];
        
        cand.functions.forEach(f => { 
            if (f.toLowerCase().startsWith(p) || p === '') {
                out.push({ display: f + '()', insert: f + '()' }); 
            }
        });
        
        cand.keywords.forEach(k => { 
            if (k.toLowerCase().startsWith(p) || p === '') {
                out.push({ display: k, insert: k + ' ' }); 
            }
        });
        
        (cand.tables || []).forEach(t => { 
            if (t.toLowerCase().startsWith(p) || p === '') {
                out.push({ display: t, insert: t + ' ' }); 
            }
        });
        
        (cand.columns || []).forEach(cn => { 
            if (cn.toLowerCase().startsWith(p) || p === '') {
                out.push({ display: cn, insert: cn + ' ' }); 
            }
        });
        
        return out.slice(0, 40);
    };

    editor.addEventListener('input', (ev) => {
        try { 
            if (game && typeof game.markDirty === 'function') game.markDirty(); 
        } catch(e){}
        
        try {
            const pos = editor.selectionStart || 0;
            const left = editor.value.slice(0, pos);
            const m = left.match(/(\w+|\w+\.|\w+\.|\.)$/);
            const tokenMatch = left.match(/[\w\.]+$/);
            const token = tokenMatch ? tokenMatch[0] : '';

            if (!token || token.length === 0) { 
                hideAutocomplete(); 
                return; 
            }
            
            const suggestionsList = buildSuggestions(token);
            if (suggestionsList.length > 0) {
                const rect = getCaretRect(editor, pos);
                showAutocomplete(suggestionsList, rect);
            } else {
                hideAutocomplete();
            }
        } catch (e) { 
            console.error('Autocomplete input error', e); 
        }
    });

    editor.addEventListener('keydown', (ev) => {
        if (ac.style.display === 'block') {
            if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                activeIndex = Math.min(suggestions.length - 1, activeIndex + 1);
                const items = ac.querySelectorAll('.sql-ac-item');
                items.forEach(it => { it.classList.remove('active'); it.style.background = ''; });
                if (items[activeIndex]) {
                    items[activeIndex].classList.add('active');
                    items[activeIndex].style.background = 'rgba(255,255,255,0.08)';
                }
                return;
            }
            
            if (ev.key === 'ArrowUp') {
                ev.preventDefault();
                activeIndex = Math.max(0, activeIndex - 1);
                const items = ac.querySelectorAll('.sql-ac-item');
                items.forEach(it => { it.classList.remove('active'); it.style.background = ''; });
                if (items[activeIndex]) {
                    items[activeIndex].classList.add('active');
                    items[activeIndex].style.background = 'rgba(255,255,255,0.08)';
                }
                return;
            }
            
            if (ev.key === 'Enter') {
                if (activeIndex >= 0 && suggestions[activeIndex]) {
                    ev.preventDefault();
                    insertSuggestion(suggestions[activeIndex]);
                    return;
                }
            }

            if (ev.key === 'Tab') {
                if (suggestions && suggestions.length > 0) {
                    ev.preventDefault();
                    const idx = (activeIndex >= 0) ? activeIndex : 0;
                    if (suggestions[idx]) insertSuggestion(suggestions[idx]);
                    return;
                }
            }
            
            if (ev.key === 'Escape') {
                hideAutocomplete();
                return;
            }
        }
    });

    editor.addEventListener('blur', () => { 
        setTimeout(() => hideAutocomplete(), 120); 
    });
    
    window.addEventListener('resize', () => hideAutocomplete());
}
