let srtData = [];
let lastFocusedInput = null;
let undoStack = []; // 元に戻すための履歴スタック

const mediaPlayer = document.getElementById('mediaPlayer');
const editor = document.getElementById('editor');
const undoBtn = document.getElementById('undoBtn');

// イベントリスナーの登録
document.getElementById('mediaInput').addEventListener('change', handleMediaUpload);
document.getElementById('srtInput').addEventListener('change', handleSRTUpload);
document.getElementById('addRowBtn').addEventListener('click', () => addRow());
document.getElementById('setTimeBtn').addEventListener('click', setTimeToFocusedInput);
document.getElementById('undoBtn').addEventListener('click', undoLastAction);
document.getElementById('downloadBtn').addEventListener('click', downloadSRT);

// フォーカスされたテキストボックスを記憶する
document.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('time-input')) {
        lastFocusedInput = e.target;
    }
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
        updateUndoButton();
    };
    reader.readAsText(file);
}

function parseSRT(content) {
    srtData = [];
    // 改行の正規化と、空行を考慮してブロック分割
    const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/);
    
    blocks.forEach(block => {
        const lines = block.trim().split('\n');
        // 空行（テキストなし）の場合は番号と時間の2行だけになるため「2行以上」を条件にする
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

function addRow(start = '00:00:00,000', end = '00:00:00,000', text = '') {
    const nextId = editor.children.length + 1;
    const row = createRowElement(nextId, start, end, text);
    editor.appendChild(row);
    return row; // 追加された行要素を返す
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

// 5. 時間入力と「元に戻す」記録ロジック
function setTimeToFocusedInput() {
    if (!lastFocusedInput || !document.body.contains(lastFocusedInput)) {
        alert("時間を入力したいテキストボックスを一度クリックして選択してください。");
        return;
    }

    const currentTime = mediaPlayer.currentTime || 0;
    const formattedTime = formatTime(currentTime);
    
    // アンドゥ用の状態保存オブジェクト
    const actionHistory = {
        changes: [], // 値が変更されたinputの配列 {element: el, oldVal: string}
        addedRow: null, // 自動追加された行がある場合はその参照
        focusTarget: lastFocusedInput // 操作前にフォーカスがあった場所
    };

    // 選択中のボックスの変更を記録
    actionHistory.changes.push({ el: lastFocusedInput, oldVal: lastFocusedInput.value });
    lastFocusedInput.value = formattedTime;
    
    // 入力時の視覚的フィードバック
    const originalBg = lastFocusedInput.style.backgroundColor;
    lastFocusedInput.style.backgroundColor = '#d4edda';
    setTimeout(() => { lastFocusedInput.style.backgroundColor = originalBg; }, 300);

    const currentRow = lastFocusedInput.closest('.srt-row');

    if (lastFocusedInput.classList.contains('start-time')) {
        // 1. 前の行の終了時間補完
        const prevRow = currentRow.previousElementSibling;
        if (prevRow && prevRow.classList.contains('srt-row')) {
            const prevEnd = prevRow.querySelector('.end-time');
            actionHistory.changes.push({ el: prevEnd, oldVal: prevEnd.value });
            prevEnd.value = formattedTime;
        }

        // 2. 次の行へのフォーカス移動・自動追加
        let nextRow = currentRow.nextElementSibling;
        if (!nextRow || !nextRow.classList.contains('srt-row')) {
            nextRow = addRow();
            actionHistory.addedRow = nextRow; // 自動追加されたことを記録
        }

        if (nextRow) {
            const nextStart = nextRow.querySelector('.start-time');
            nextStart.focus();
        }
    } 

    // 履歴スタックに追加
    undoStack.push(actionHistory);
    updateUndoButton();
}

// 「1つ戻る」実行関数
function undoLastAction() {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack.pop();

    // 1. 自動追加された行があれば削除
    if (lastAction.addedRow && document.body.contains(lastAction.addedRow)) {
        lastAction.addedRow.remove();
        updateRowIds();
    }

    // 2. 変更されたテキストボックスの値を元の値に戻す
    lastAction.changes.forEach(change => {
        if (document.body.contains(change.el)) {
            change.el.value = change.oldVal;
        }
    });

    // 3. フォーカスを元の位置に戻す
    if (lastAction.focusTarget && document.body.contains(lastAction.focusTarget)) {
        lastAction.focusTarget.focus();
    }

    updateUndoButton();
}

// 戻るボタンの有効/無効の切り替え
function updateUndoButton() {
    undoBtn.disabled = undoStack.length === 0;
}

// 6. プレビュー機能（再生時間に応じたハイライト）
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

// 7. SRTファイルの生成とダウンロード
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
    addRow();
});