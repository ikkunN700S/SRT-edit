let srtData = [];
let lastFocusedInput = null;
let undoStack = [];
let redoStack = [];

const mediaPlayer = document.getElementById('mediaPlayer');
const editor = document.getElementById('editor');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const floatingPlayPauseBtn = document.getElementById('floatingPlayPauseBtn');

// イベントリスナーの登録
document.getElementById('mediaInput').addEventListener('change', handleMediaUpload);
document.getElementById('srtInput').addEventListener('change', handleFileUpload);
document.getElementById('setTimeBtn').addEventListener('click', setTimeToFocusedInput);
document.getElementById('undoBtn').addEventListener('click', undoLastAction);
document.getElementById('redoBtn').addEventListener('click', redoLastAction);
document.getElementById('downloadBtn').addEventListener('click', downloadSRT);

// 新しい行を追加ボタン
document.getElementById('addRowBtn').addEventListener('click', () => {
    const row = createRowElement(0, '00:00:00,000', '00:00:00,000', '');
    if (lastFocusedInput && document.body.contains(lastFocusedInput)) {
        const currentRow = lastFocusedInput.closest('.srt-row');
        if (currentRow) {
            currentRow.after(row);
        } else {
            editor.appendChild(row);
        }
    } else {
        editor.appendChild(row);
    }
    updateRowIds();
});

// テキストボックスのフォーカス（選択）の記録
document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.classList.contains('time-input')) {
        lastFocusedInput = e.target;
    }
});

// 【変更点】行番号（.col-id）をクリックした時の再生シーク機能
editor.addEventListener('click', (e) => {
    const colIdBtn = e.target.closest('.col-id');
    if (colIdBtn && mediaPlayer.readyState > 0) {
        const row = colIdBtn.closest('.srt-row');
        const startSec = parseTime(row.querySelector('.start-time').value);
        
        mediaPlayer.currentTime = startSec;
        // クリックしたら自動的に再生を開始する
        if (mediaPlayer.paused) {
            mediaPlayer.play();
        }
    }
});

// 【変更点】常時表示の再生・一時停止ボタンの制御
floatingPlayPauseBtn.addEventListener('click', () => {
    if (mediaPlayer.readyState === 0) {
        alert("先に音源または動画ファイルを読み込んでください。");
        return;
    }
    if (mediaPlayer.paused) {
        mediaPlayer.play();
    } else {
        mediaPlayer.pause();
    }
});

mediaPlayer.addEventListener('loadedmetadata', () => {
    floatingPlayPauseBtn.disabled = false;
});

mediaPlayer.addEventListener('play', () => {
    floatingPlayPauseBtn.innerHTML = '<span class="icon">⏸</span> 一時停止';
    floatingPlayPauseBtn.classList.add('playing');
});

mediaPlayer.addEventListener('pause', () => {
    floatingPlayPauseBtn.innerHTML = '<span class="icon">▶</span> 再生';
    floatingPlayPauseBtn.classList.remove('playing');
});

// 1. メディア（音声/動画）読み込み
function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        mediaPlayer.src = url;
    }
}

// 2. 【変更点】SRT・TXTファイル読み込みの分岐
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
        if (fileName.endsWith('.txt')) {
            parseTXT(e.target.result);
        } else {
            parseSRT(e.target.result);
        }
        renderEditor();
        undoStack = [];
        redoStack = [];
        updateUndoRedoButtons();
    };
    reader.readAsText(file);
}

// SRTの解析
function parseSRT(content) {
    srtData = [];
    const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/);
    blocks.forEach(block => {
        const lines = block.trim().split('\n');
        if (lines.length >= 2) {
            const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s-->\s(\d{2}:\d{2}:\d{2},\d{3})/);
            if (timeMatch) {
                const text = lines.slice(2).join('\n');
                srtData.push({ start: timeMatch[1], end: timeMatch[2], text: text });
            }
        }
    });
}

// 【新規】TXTの解析（空行を保持）
function parseTXT(content) {
    srtData = [];
    // ファイル末尾の不要な改行だけを消し、中の空行は残す
    const lines = content.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
    lines.forEach(line => {
        srtData.push({
            start: '00:00:00,000',
            end: '00:00:00,000',
            text: line // 空行の場合は空文字がセットされる
        });
    });
}

function renderEditor() {
    editor.innerHTML = '';
    srtData.forEach((data, index) => {
        const row = createRowElement(index + 1, data.start, data.end, data.text);
        editor.appendChild(row);
    });
}

function createRowElement(id, start = '00:00:00,000', end = '00:00:00,000', text = '') {
    const div = document.createElement('div');
    div.className = 'srt-row';
    div.innerHTML = `
        <div class="col-id" title="クリックしてこの時間から再生">
            <span class="id-text">${id}</span>
            <span class="play-icon">▶</span>
        </div>
        <div class="col-time">
            <input type="text" class="time-input start-time" value="${start}" placeholder="00:00:00,000">
        </div>
        <div class="col-time">
            <input type="text" class="time-input end-time" value="${end}" placeholder="00:00:00,000">
        </div>
        <div class="col-text">
            <input type="text" class="text-input" value="${text}">
        </div>
        <div class="col-action">
            <button class="btn-danger delete-btn">削除</button>
        </div>
    `;

    div.querySelector('.delete-btn').addEventListener('click', () => {
        div.remove();
        updateRowIds();
    });

    return div;
}

function updateRowIds() {
    const rows = editor.querySelectorAll('.srt-row');
    rows.forEach((row, index) => {
        row.querySelector('.id-text').textContent = index + 1;
    });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00:00,000';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(',');
    if (parts.length !== 2) return 0;
    const hms = parts[0].split(':');
    if (hms.length !== 3) return 0;
    const h = parseInt(hms[0], 10) * 3600;
    const m = parseInt(hms[1], 10) * 60;
    const s = parseInt(hms[2], 10);
    const ms = parseInt(parts[1], 10) / 1000;
    return h + m + s + ms;
}

function flashElement(el, color = '#d4edda') {
    if (!el) return;
    el.style.transition = 'none';
    el.style.backgroundColor = color;
    void el.offsetWidth;
    el.style.transition = 'background-color 0.4s ease-out';
    el.style.backgroundColor = '';
}

// 5. 時間入力と履歴記録ロジック（順次入力方式）
function setTimeToFocusedInput() {
    let targetInput = lastFocusedInput;

    if (!targetInput || !document.body.contains(targetInput)) {
        let firstRow = editor.querySelector('.srt-row');
        if (!firstRow) {
            firstRow = createRowElement(1, '00:00:00,000', '00:00:00,000', '');
            editor.appendChild(firstRow);
        }
        targetInput = firstRow.querySelector('.start-time');
        targetInput.focus();
    }

    const currentTime = mediaPlayer.currentTime || 0;
    const formattedTime = formatTime(currentTime);
    
    const actionHistory = {
        changes: [], 
        addedRowInfo: null, 
        focusBefore: lastFocusedInput,
        focusAfter: null
    };

    // 時間の入力
    actionHistory.changes.push({ el: targetInput, oldVal: targetInput.value, newVal: formattedTime });
    targetInput.value = formattedTime;
    flashElement(targetInput, '#d4edda');

    const currentRow = targetInput.closest('.srt-row');
    let nextFocusTarget = targetInput;

    if (targetInput.classList.contains('start-time')) {
        // 前の行の終了時間補完
        const prevRow = currentRow.previousElementSibling;
        if (prevRow && prevRow.classList.contains('srt-row')) {
            const prevEnd = prevRow.querySelector('.end-time');
            actionHistory.changes.push({ el: prevEnd, oldVal: prevEnd.value, newVal: formattedTime });
            prevEnd.value = formattedTime;
            flashElement(prevEnd, '#d4edda');
        }

        // 次の行へのフォーカス移動・自動追加
        let nextRow = currentRow.nextElementSibling;
        if (!nextRow || !nextRow.classList.contains('srt-row')) {
            nextRow = createRowElement(0, '00:00:00,000', '00:00:00,000', '');
            currentRow.after(nextRow);
            updateRowIds();
            actionHistory.addedRowInfo = { row: nextRow, prevSibling: currentRow };
        }

        if (nextRow) {
            nextFocusTarget = nextRow.querySelector('.start-time');
        }
    } 

    nextFocusTarget.focus();
    lastFocusedInput = nextFocusTarget;
    actionHistory.focusAfter = nextFocusTarget;

    // 履歴スタックの更新
    undoStack.push(actionHistory);
    redoStack = [];
    updateUndoRedoButtons();
}

// 6. 「1つ戻る」実行関数
function undoLastAction() {
    if (undoStack.length === 0) return;
    const lastAction = undoStack.pop();

    if (lastAction.addedRowInfo && document.body.contains(lastAction.addedRowInfo.row)) {
        lastAction.addedRowInfo.row.remove();
        updateRowIds();
    }

    lastAction.changes.forEach(change => {
        if (document.body.contains(change.el)) {
            change.el.value = change.oldVal;
            flashElement(change.el, '#fff3cd');
        }
    });

    if (lastAction.focusBefore && document.body.contains(lastAction.focusBefore)) {
        lastAction.focusBefore.focus();
        lastFocusedInput = lastAction.focusBefore;
    }

    redoStack.push(lastAction);
    updateUndoRedoButtons();
}

// 7. 「やり直し」実行関数
function redoLastAction() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();

    if (action.addedRowInfo) {
        if (document.body.contains(action.addedRowInfo.prevSibling)) {
            action.addedRowInfo.prevSibling.after(action.addedRowInfo.row);
        } else {
            editor.appendChild(action.addedRowInfo.row);
        }
        updateRowIds();
    }

    action.changes.forEach(change => {
        if (document.body.contains(change.el)) {
            change.el.value = change.newVal;
            flashElement(change.el, '#d4edda');
        }
    });

    if (action.focusAfter && document.body.contains(action.focusAfter)) {
        action.focusAfter.focus();
        lastFocusedInput = action.focusAfter;
    }

    undoStack.push(action);
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
}

// 8. プレビュー機能（再生時間に応じたハイライト）
mediaPlayer.addEventListener('timeupdate', () => {
    const currentSec = mediaPlayer.currentTime;
    const rows = editor.querySelectorAll('.srt-row');
    
    rows.forEach(row => {
        const startStr = row.querySelector('.start-time').value;
        const endStr = row.querySelector('.end-time').value;
        const startSec = parseTime(startStr);
        const endSec = parseTime(endStr);
        
        if (startSec <= currentSec && currentSec < endSec) {
            row.classList.add('highlight');
        } else {
            row.classList.remove('highlight');
        }
    });
});

// 9. SRTファイルの生成とダウンロード
function downloadSRT() {
    const rows = editor.querySelectorAll('.srt-row');
    if (rows.length === 0) {
        alert("出力するデータがありません。");
        return;
    }

    let srtOutput = '';
    
    rows.forEach((row, index) => {
        const start = row.querySelector('.start-time').value.trim() || '00:00:00,000';
        const end = row.querySelector('.end-time').value.trim() || '00:00:00,000';
        // 空行の場合は全角スペース（または半角スペース）として出力（SRT仕様のため）
        const text = row.querySelector('.text-input').value || ' '; 

        srtOutput += `${index + 1}\n`;
        srtOutput += `${start} --> ${end}\n`;
        srtOutput += `${text}\n\n`;
    });

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, srtOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrics.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 初期状態で1行空の行を用意しておく
window.addEventListener('DOMContentLoaded', () => {
    const row = createRowElement(1, '00:00:00,000', '00:00:00,000', '');
    editor.appendChild(row);
});