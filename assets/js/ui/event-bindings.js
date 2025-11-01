// UIイベントバインディング

import { executeQuery, useKuNext } from './query-executor.js';
import { setupAutocomplete } from './autocomplete.js';
import { handleHint } from './hint.js';
import { openShop, handleItemPurchase } from './shop.js';
import { ShopItem } from '../models/item.js';

export function setupUIHandlers(game) {
    const dom = game.dom;
    
    // 二重バインドを防ぐ（初回のみバインド、以降はスキップ）
    // ただし、明示的に再バインドが必要な場合は dom.__uiHandlersBound = false にリセット可能
    if (dom.__uiHandlersBound) {
        console.debug('[setupUIHandlers] Already bound, skipping');
        return;
    }
    dom.__uiHandlersBound = true;
    console.debug('[setupUIHandlers] Binding UI handlers');
    
    // メインボタンのバインディング
    dom.elements['start-button'].addEventListener('click', () => {
        // 新しいゲームを開始するときは、未保存警告フラグをリセット
        dom.__unsavedWarningShown = false;
        game.startGame();
    });
    dom.elements['load-button'].addEventListener('click', () => {
        // ゲームをロードするときも、未保存警告フラグをリセット
        dom.__unsavedWarningShown = false;
        game.loadGame();
    });
    dom.elements['sandbox-button'].addEventListener('click', () => {
        // サンドボックスモードを開始するときも、未保存警告フラグをリセット
        dom.__unsavedWarningShown = false;
        game.startSandbox();
        try { 
            history.pushState({ mode: 'sandbox' }, '', '?mode=sandbox'); 
        } catch(e) { 
            console.error(e); 
        }
    });
    
    // タイトルに戻るボタン
    if (dom.elements['back-to-title-button']) {
        dom.elements['back-to-title-button'].addEventListener('click', () => {
            try {
                const proceed = () => {
                    try { 
                        const sc = document.querySelector('.sandbox-controls'); 
                        if (sc) sc.remove(); 
                    } catch(e) { console.error(e); }
                    
                    try { 
                        const sw = document.querySelectorAll('.sandbox-schema-wrapper'); 
                        if (sw) sw.forEach(s => s.remove()); 
                    } catch(e) { console.error(e); }
                    
                    try { 
                        document.body.classList.remove('sandbox-mode'); 
                    } catch(e) { console.error(e); }
                    
                    game.dom.showScreen('start');
                    
                    try { 
                        history.pushState({ mode: 'start' }, '', window.location.pathname); 
                    } catch(e) { console.error(e); }
                };

                // 未保存の変更がある場合、一度だけダイアログを表示
                // フラグはdom.__unsavedWarningShownに保存（セッション全体で共有）
                if (game && typeof game.isDirty === 'function' && game.isDirty() && !game.isSandbox && !dom.__unsavedWarningShown) {
                    const msg = game.i18n 
                        ? game.i18n.t('confirm.unsaved_changes') 
                        : 'セーブしていません。タイトルに戻りますか？';
                    if (confirm(msg)) {
                        // OKを押したら、次回からはダイアログを表示しない
                        dom.__unsavedWarningShown = true;
                        proceed();
                    }
                } else {
                    // ダイアログが既に表示済み、またはサンドボックスモード、または保存済みの場合は直接実行
                    proceed();
                }
            } catch (e) { 
                console.error('Back to title failed', e); 
            }
        });
    }
    
    // ゲーム制御ボタン
    dom.elements['retry-button'].addEventListener('click', () => game.startGame());
    dom.elements['save-button'].addEventListener('click', () => game.saveGame());
    dom.elements['execute-btn'].addEventListener('click', () => executeQuery(game));
    dom.elements['hint-btn'].addEventListener('click', () => handleHint(game));
    dom.elements['ku-next-btn'].addEventListener('click', () => useKuNext(game));
    dom.elements['shop-btn'].addEventListener('click', () => openShop(game));

    // インベントリアイテムのクリック
    dom.elements['inventory-list'].addEventListener('click', e => {
        if (e.target.classList.contains('inventory-item')) {
            const insertText = String(e.target.dataset.item || '');
            const fnMatch = insertText.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*$/i);
            const editor = dom.elements['sql-editor'];
            
            if (fnMatch) {
                const fn = fnMatch[1].toUpperCase();
                const toInsert = `${fn}()` + ' ';
                const before = editor.value || '';
                const selectionStart = Number(editor.selectionStart || before.length);
                const selectionEnd = Number(editor.selectionEnd || selectionStart);
                
                try {
                    editor.focus();
                    editor.setSelectionRange(selectionStart, selectionEnd);
                    
                    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                        document.execCommand('insertText', false, toInsert);
                        const parenIndex = toInsert.indexOf('()');
                        let cursor = selectionStart + toInsert.length;
                        if (parenIndex >= 0) cursor = selectionStart + parenIndex + 1;
                        try { editor.setSelectionRange(cursor, cursor); } catch(e) {}
                    } else if (typeof editor.setRangeText === 'function') {
                        editor.setRangeText(toInsert, selectionStart, selectionEnd, 'end');
                        const parenIndex = toInsert.indexOf('()');
                        let cursor = selectionStart + toInsert.length;
                        if (parenIndex >= 0) cursor = selectionStart + parenIndex + 1;
                        try { editor.setSelectionRange(cursor, cursor); } catch(e) {}
                    } else {
                        const newVal = before.slice(0, selectionStart) + toInsert + before.slice(selectionEnd);
                        editor.value = newVal;
                        const cursorPos = selectionStart + fn.length + 1;
                        try { editor.focus(); editor.setSelectionRange(cursorPos, cursorPos); } catch (err) { editor.focus(); }
                    }
                } catch (e) {
                    const newVal = before.slice(0, selectionStart) + toInsert + before.slice(selectionEnd);
                    editor.value = newVal;
                    const cursorPos = selectionStart + fn.length + 1;
                    try { editor.focus(); editor.setSelectionRange(cursorPos, cursorPos); } catch (err) { editor.focus(); }
                }
            } else {
                const toInsert = `${insertText} `;
                const before = editor.value || '';
                const selectionStart = Number(editor.selectionStart || before.length);
                const selectionEnd = Number(editor.selectionEnd || selectionStart);
                
                try {
                    editor.focus();
                    editor.setSelectionRange(selectionStart, selectionEnd);
                    
                    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
                        document.execCommand('insertText', false, toInsert);
                        const cursor = selectionStart + toInsert.length;
                        try { editor.setSelectionRange(cursor, cursor); } catch(e) {}
                    } else if (typeof editor.setRangeText === 'function') {
                        editor.setRangeText(toInsert, selectionStart, selectionEnd, 'end');
                        const cursor = selectionStart + toInsert.length;
                        try { editor.setSelectionRange(cursor, cursor); } catch(e) {}
                    } else {
                        editor.value = before + toInsert;
                        editor.focus();
                    }
                } catch (e) {
                    editor.value = before + toInsert;
                    editor.focus();
                }
            }
        }
    });

    // オートコンプリートのセットアップ
    if (dom.elements['sql-editor']) {
        setupAutocomplete(dom.elements['sql-editor'], game);
    }
    
    // スキーマクリックでエディタに挿入
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
    
    // ショップアイテム購入
    dom.elements['shop-item-list'].addEventListener('click', e => {
        if (e.target.classList.contains('buy-btn')) {
            const itemData = game.gameData.shopItems.items.find(i => i.id === e.target.dataset.itemId);
            if (itemData && game.player.spendGold(itemData.price)) {
                const item = new ShopItem(itemData, game.i18n);
                
                try { 
                    console.log('[shop] purchasing item instance:', item); 
                } catch(e){}
                
                handleItemPurchase(game, item);
                game.updateUI();
                openShop(game);
                
                try { 
                    if (game && typeof game.markDirty === 'function') game.markDirty(); 
                } catch(e){}
            }
        }
    });
}
