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

// フォーカスされたテキストボックス（時間入力用）を記憶する
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

// SRT形式のテキストを解析
function parseSRT(content) {
    srtData = [];
    // 改行コードを統一して空行でブロックごとに分割
    const blocks = content.replace(/\r\n/g, '\n').split('\n\n');
    
    blocks.forEach(block => {
        const lines = block.trim().split('\n');
        if (lines.length >= 3) {
            const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s-->\s(\d{2}:\d{2}:\d{2},\d{3})/);
            if (timeMatch) {
                // 3行目以降をテキストとして結合（空行だけの字幕も保持）
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

// 3. 画面にエディタ行を描画
function renderEditor() {
    editor.innerHTML = '';
    srtData.forEach((data, index) => {
        const row = createRowElement(index + 1, data.start, data.end, data.text);
        editor.appendChild(row);
    });
}

// 行要素の生成
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

    // 削除ボタンの処理
    div.querySelector('.delete-btn').addEventListener('click', () => {
        div.remove();
        updateRowIds();
    });

    return div;
}

// 行の追加
function addRow(start = '00:00:00,000', end = '00:00:00,000', text = '') {
    const nextId = editor.children.length + 1;
    const row = createRowElement(nextId, start, end, text);
    editor.appendChild(row);
}

// 行番号の振り直し（削除時）
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

// ボタンを押した時、選択中のテキストボックスに現在時間を入力
function setTimeToFocusedInput() {
    if (lastFocusedInput && document.body.contains(lastFocusedInput)) {
        const currentTime = mediaPlayer.currentTime || 0;
        lastFocusedInput.value = formatTime(currentTime);
        
        // 入力後、少しハイライトして視覚的なフィードバックを与える
        const originalBg = lastFocusedInput.style.backgroundColor;
        lastFocusedInput.style.backgroundColor = '#d4edda';
        setTimeout(() => {
            lastFocusedInput.style.backgroundColor = originalBg;
        }, 300);
    } else {
        alert("時間を入力したい開始時間・終了時間のテキストボックスを一度クリックして選択してください。");
    }
}

// 5. SRTファイルの生成とダウンロード
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
        // 空白文字（全角スペース等）もそのまま保持
        const text = row.querySelector('.text-input').value || ' '; 

        srtOutput += `${index + 1}\n`;
        srtOutput += `${start} --> ${end}\n`;
        srtOutput += `${text}\n\n`;
    });

    // BOM付きUTF-8でBlobを作成（文字化け防止）
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