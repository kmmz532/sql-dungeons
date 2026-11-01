// ステージ（ダンジョン）選択画面
// dungeons/manifest.json から読み込んだダンジョン一覧を動的に描画する

/**
 * ステージ名を i18n から取得（未定義の場合はダンジョンファイルの title、なければキー名）
 */
const getStageName = (i18n, key, data) => {
    const v = i18n.t(`stage.${key}.name`);
    if (v && !v.startsWith('stage.')) return v;
    return data.title || key;
};

/**
 * ステージ説明を i18n から取得（未定義の場合は空文字）
 */
const getStageDesc = (i18n, key) => {
    const v = i18n.t(`stage.${key}.desc`);
    return (v && !v.startsWith('stage.')) ? v : '';
};

/**
 * ステージ選択画面の一覧を描画する
 * @param {GameCore} game
 * @param {string} message - 画面上部に表示するメッセージ（空なら非表示）
 */
export function renderStageSelect(game, message = '') {
    const { dom, i18n } = game;
    const list = dom.elements['stage-list'];
    const msgEl = dom.elements['stage-message'];
    if (!list) return;

    if (msgEl) {
        msgEl.textContent = message || '';
        msgEl.classList.toggle('hidden', !message);
    }

    list.innerHTML = '';
    const dungeons = game.gameData?.dungeons || {};
    for (const key of Object.keys(dungeons)) {
        const data = dungeons[key] || {};
        const floorCount = Array.isArray(data.floors) ? data.floors.length : 0;
        const cleared = !!game.player?.clearedDungeons?.has(key);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stage-btn' + (cleared ? ' cleared' : '');
        btn.dataset.stage = key;

        const name = document.createElement('span');
        name.className = 'stage-name';
        name.textContent = getStageName(i18n, key, data);

        const desc = document.createElement('span');
        desc.className = 'stage-desc';
        desc.textContent = getStageDesc(i18n, key);

        const meta = document.createElement('span');
        meta.className = 'stage-meta';
        meta.textContent = i18n.t('stage.floors', floorCount) + (cleared ? ` / ${i18n.t('stage.cleared')}` : '');

        btn.append(name, desc, meta);
        btn.addEventListener('click', () => game.enterStage(key));
        list.appendChild(btn);
    }
}
