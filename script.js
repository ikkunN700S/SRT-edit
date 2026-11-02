let srtData = [];
let lastFocusedInput = null;

const mediaPlayer = document.getElementById('mediaPlayer');
const editor = document.getElementById('editor');

// イベントリスナーの登録
document.getElementById('mediaInput').addEventListener('change', handleMediaUpload);
document.getElementById('srtInput').addEventListener('change', handleSRTUpload);
document.getElementById('addRowBtn').addEventListener('click', () => addRow());
document.getElementById('setTimeBtn').addEventListener('click', setTimeToFocusedInput);
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
    };
    reader.readAsText(file);
}

function parseSRT(content) {
    srtData = [];
    const blocks = content.replace(/\r\n/g, '\n').split('\n\n');
    
    blocks.forEach(block => {
        const lines = block.trim().split('\n');
        if (lines.length >= 3) {
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
}

function updateRowIds() {
    const rows = editor.querySelectorAll('.srt-row');
    rows.forEach((row, index) => {
        row.querySelector('.col-id').textContent = index + 1;
    });
}

// 4. 秒数をSRTのHH:MM:SS,MMM形式に変換
function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00:00,000';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// SRTのHH:MM:SS,MMM形式を秒数に変換（ハイライト計算用）
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

// 5. ボタン押下時の時間入力ロジック（連続移動＆自動補完対応）
function setTimeToFocusedInput() {
    if (!lastFocusedInput || !document.body.contains(lastFocusedInput)) {
        alert("時間を入力したいテキストボックスを一度クリックして選択してください。");
        return;
    }

    const currentTime = mediaPlayer.currentTime || 0;
    const formattedTime = formatTime(currentTime);
    
    // 選択中のボックスに時間を入力
    lastFocusedInput.value = formattedTime;
    
    // 入力時の視覚的フィードバック
    const originalBg = lastFocusedInput.style.backgroundColor;
    lastFocusedInput.style.backgroundColor = '#d4edda';
    setTimeout(() => {
        lastFocusedInput.style.backgroundColor = originalBg;
    }, 300);

    const currentRow = lastFocusedInput.closest('.srt-row');

    // 「開始時間」のボックスだった場合の処理
    if (lastFocusedInput.classList.contains('start-time')) {
        
        // 1. 前の行があれば、前の行の終了時間に同じ時間を自動入力する
        const prevRow = currentRow.previousElementSibling;
        if (prevRow && prevRow.classList.contains('srt-row')) {
            const prevEnd = prevRow.querySelector('.end-time');
            prevEnd.value = formattedTime;
        }

        // 2. 次の行の開始時間へフォーカスを自動で移す
        let nextRow = currentRow.nextElementSibling;
        
        // 次の行がない場合は新しい行を自動的に追加する
        if (!nextRow || !nextRow.classList.contains('srt-row')) {
            addRow();
            nextRow = currentRow.nextElementSibling;
        }

        if (nextRow) {
            const nextStart = nextRow.querySelector('.start-time');
            nextStart.focus();
        }
        
    } 
    // 「終了時間」のボックスだった場合は単独更新のみ（次の行はいじらずフォーカス移動もしない）
    else if (lastFocusedInput.classList.contains('end-time')) {
        // 何もしない
    }
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
        
        // 開始時間と終了時間の間に現在時間がある場合にハイライト
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