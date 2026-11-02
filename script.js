let srtData = [];
let lastFocusedInput = null;
let undoStack = []; // 戻る用の履歴スタック
let redoStack = []; // やり直し用の履歴スタック

const mediaPlayer = document.getElementById('mediaPlayer');
const editor = document.getElementById('editor');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

// イベントリスナーの登録
document.getElementById('mediaInput').addEventListener('change', handleMediaUpload);
document.getElementById('srtInput').addEventListener('change', handleSRTUpload);
document.getElementById('setTimeBtn').addEventListener('click', setTimeToFocusedInput);
document.getElementById('undoBtn').addEventListener('click', undoLastAction);
document.getElementById('redoBtn').addEventListener('click', redoLastAction);
document.getElementById('downloadBtn').addEventListener('click', downloadSRT);

// フォーカスされたテキストボックスを記憶する
document.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('time-input')) {
        lastFocusedInput = e.target;
    }
});

// 手動で「新しい行を追加」ボタンを押したときの処理
document.getElementById('addRowBtn').addEventListener('click', () => {
    const row = createRowElement(0, '00:00:00,000', '00:00:00,000', '');
    
    // 選択中の行があれば、そのすぐ下に追加する
    if (lastFocusedInput && document.body.contains(lastFocusedInput)) {
        const currentRow = lastFocusedInput.closest('.srt-row');
        if (currentRow) {
            currentRow.after(row);
        } else {
            editor.appendChild(row);
        }
    } else {
        editor.appendChild(row); // 選択されていなければ一番下に追加
    }
    updateRowIds();
});

// 1. メディア（音声/動画）読み込み
function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        mediaPlayer.src = url;
    }
}

// 2. SRTファイル読み込み
function handleSRTUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        parseSRT(e.target.result);
        renderEditor();
        // 新しいファイルを読み込んだら履歴をリセット
        undoStack = [];
        redoStack = [];
        updateUndoRedoButtons();
    };
    reader.readAsText(file);
}

function parseSRT(content) {
    srtData = [];
    const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/);
    blocks.forEach(block => {
        const lines = block.trim().split('\n');
        if (lines.length >= 2) {
            const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s-->\s(\d{2}:\d{2}:\d{2},\d{3})/);
            if (timeMatch) {
                const text = lines.slice(2).join('\n');
                srtData.push({
                    start: timeMatch[1],
                    end: timeMatch[2],
                    text: text
                });
            }
        }
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
        <div class="col-id">${id}</div>
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
        row.querySelector('.col-id').textContent = index + 1;
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

// 変更箇所を一時的にハイライトするヘルパー関数
function flashElement(el, color = '#d4edda') {
    if (!el) return;
    el.style.transition = 'none';
    el.style.backgroundColor = color;
    void el.offsetWidth; // 強制リフロー
    el.style.transition = 'background-color 0.4s ease-out';
    el.style.backgroundColor = '';
}

// 5. 時間入力と履歴記録ロジック
function setTimeToFocusedInput() {
    // 選択されていない場合、1行目の開始時間を自動選択
    if (!lastFocusedInput || !document.body.contains(lastFocusedInput)) {
        let firstRow = editor.querySelector('.srt-row');
        if (!firstRow) {
            firstRow = createRowElement(1, '00:00:00,000', '00:00:00,000', '');
            editor.appendChild(firstRow);
        }
        lastFocusedInput = firstRow.querySelector('.start-time');
        lastFocusedInput.focus();
    }

    const currentTime = mediaPlayer.currentTime || 0;
    const formattedTime = formatTime(currentTime);
    
    // アンドゥ/リドゥ用の状態保存オブジェクト
    const actionHistory = {
        changes: [], // { el, oldVal, newVal }
        addedRowInfo: null, 
        focusBefore: lastFocusedInput,
        focusAfter: null
    };

    // 選択中のボックスの変更を記録
    actionHistory.changes.push({ el: lastFocusedInput, oldVal: lastFocusedInput.value, newVal: formattedTime });
    lastFocusedInput.value = formattedTime;
    flashElement(lastFocusedInput, '#d4edda');

    const currentRow = lastFocusedInput.closest('.srt-row');
    let nextFocusTarget = lastFocusedInput;

    if (lastFocusedInput.classList.contains('start-time')) {
        // 1. 前の行の終了時間補完
        const prevRow = currentRow.previousElementSibling;
        if (prevRow && prevRow.classList.contains('srt-row')) {
            const prevEnd = prevRow.querySelector('.end-time');
            actionHistory.changes.push({ el: prevEnd, oldVal: prevEnd.value, newVal: formattedTime });
            prevEnd.value = formattedTime;
            flashElement(prevEnd, '#d4edda');
        }

        // 2. 次の行へのフォーカス移動・自動追加
        let nextRow = currentRow.nextElementSibling;
        if (!nextRow || !nextRow.classList.contains('srt-row')) {
            nextRow = createRowElement(0, '00:00:00,000', '00:00:00,000', '');
            currentRow.after(nextRow);
            updateRowIds();
            
            actionHistory.addedRowInfo = {
                row: nextRow,
                prevSibling: currentRow
            };
        }

        if (nextRow) {
            nextFocusTarget = nextRow.querySelector('.start-time');
        }
    } 

    nextFocusTarget.focus();
    actionHistory.focusAfter = nextFocusTarget;

    // 新しい操作を行ったのでやり直しスタックをクリア
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
            flashElement(change.el, '#fff3cd'); // 戻したときは黄色でハイライト
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
            flashElement(change.el, '#d4edda'); // やり直したときは緑でハイライト
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