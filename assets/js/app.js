/*
*@LICENSE
*FocusMind v1.0.0
*Copyright (c) 2026 Bakhtovar Usmonov All rights reserved.
*Unauthorized copying of this file, via any medium is strictly prohibited.
*/
const stateKey = 'focusmind.v1';
const defaultState = { tasks: [], notes: '', timer: { mins: 25, remaining: 1500, running: false } };
const state = jsonServerData();
function jsonServerData() {
    return JSON.parse(localStorage.getItem(stateKey) || 'null') || defaultState;
}

const save = () => localStorage.setItem(stateKey, JSON.stringify(state));
const $ = (id) => document.getElementById(id);

const tasksList = $('tasksList');

function renderTasks() {
    tasksList.innerHTML = '';
    if (!state.tasks.length) { tasksList.innerHTML = '<div class="hint">Нет задач — добавьте первую.</div>'; return }
    state.tasks.forEach((t, i) => {
        const row = document.createElement('div'); row.className = 'task-row';
        row.innerHTML = `
                    <input type="checkbox" ${t.done ? 'checked' : ''} data-i="${i}" />
                    <div class="task-title" style="text-decoration:${t.done ? 'line-through' : ''}">${escape(t.title)}</div>
                    <div class="task-actions">
                        <button class="btn" data-del="${i}">✖</button>
                    </div>`;
        tasksList.appendChild(row);
    });
}
function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

tasksList.addEventListener('click', e => {
    if (e.target.matches('[data-del]')) { const i = +e.target.getAttribute('data-del'); state.tasks.splice(i, 1); save(); renderTasks(); }
    if (e.target.matches('input[type="checkbox"]')) { const i = +e.target.getAttribute('data-i'); state.tasks[i].done = e.target.checked; save(); renderTasks(); }
});

$('addTaskBtn').addEventListener('click', () => {
    const text = $('taskText').value.trim(); if (!text) return;
    state.tasks.push({ title: text, done: false, created: new Date().toISOString() });
    $('taskText').value = ''; save(); renderTasks();
});
$('taskText').addEventListener('keydown', e => { if (e.key === 'Enter') $('addTaskBtn').click(); });

$('notes').value = state.notes || '';
$('notes').addEventListener('input', (e) => { state.notes = e.target.value; save(); });

function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'focusmind-data.json'; a.click(); URL.revokeObjectURL(url);
}
$('exportBtn').addEventListener('click', exportJSON);
document.querySelector('[data-action="export"]')?.addEventListener('click', exportJSON);

$('importFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
        const text = await f.text(); const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') { Object.assign(state, parsed); save(); renderTasks(); $('notes').value = state.notes || ''; alert('Импортировано'); }
    } catch (err) { alert('Неверный JSON'); }
    ev.target.value = '';
});

$('openData').addEventListener('click', () => {
    const w = window.open(); w.document.write('<pre>' + escape(JSON.stringify(state, null, 2)) + '</pre>');
});
$('clearStorage').addEventListener('click', () => {
    if (confirm('Сбросить локальные данные?')) { localStorage.removeItem(stateKey); location.reload(); }
});

document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
        const a = btn.getAttribute('data-action');
        if (a === 'new-task') $('taskText').focus();
        if (a === 'open-timer') $('startTimer').focus();
    });
});

let timerInterval = null;
function format(s) { const m = Math.floor(s / 60).toString().padStart(2, '0'); const sec = (s % 60).toString().padStart(2, '0'); return `${m}:${sec}`; }
function updateTimerUI() { $('time').textContent = format(state.timer.remaining); $('minutes').value = state.timer.mins; }

function startTimer() {
    if (state.timer.running) return;
    state.timer.running = true; save();
    timerInterval = setInterval(() => {
        if (state.timer.remaining > 0) { state.timer.remaining--; updateTimerUI(); }
        else { clearInterval(timerInterval); state.timer.running = false; save(); alert('Интервал завершён'); }
    }, 1000);
}
function pauseTimer() { if (timerInterval) clearInterval(timerInterval); state.timer.running = false; save(); }
function resetTimer() { pauseTimer(); state.timer.remaining = state.timer.mins * 60; updateTimerUI(); save(); }

$('startTimer').addEventListener('click', () => { startTimer(); });
$('pauseTimer').addEventListener('click', () => { pauseTimer(); });
$('resetTimer').addEventListener('click', () => { resetTimer(); });
$('minutes').addEventListener('change', (e) => { const v = Math.max(1, Math.trunc(Number(e.target.value) || 25)); state.timer.mins = v; state.timer.remaining = v * 60; save(); updateTimerUI(); });

$('quick25').addEventListener('click', () => { $('minutes').value = 25; $('minutes').dispatchEvent(new Event('change')); });
$('quick50').addEventListener('click', () => { $('minutes').value = 50; $('minutes').dispatchEvent(new Event('change')); });
$('quick15').addEventListener('click', () => { $('minutes').value = 15; $('minutes').dispatchEvent(new Event('change')); });

renderTasks();
updateTimerUI();
if (state.timer.running) startTimer();

function createDivBrand() {
    const divBrand = document.createElement("div");
    divBrand.classList.add("brand");
    const divLogo = document.createElement("div");
    divLogo.classList.add("logo");
    divLogo.innerText = "FM";
    const div = document.createElement("div");
    const divFMOS = document.createElement("div");
    divFMOS.style.fontWeight = "700";
    divFMOS.innerText = "FocusMind OS";
    const divSubtitle = document.createElement("div");
    divSubtitle.classList.add("subtitle");
    divSubtitle.style.fontSize = "12px";
    divSubtitle.innerText = "Локальный центр продуктивности";
    div.append(divFMOS, divSubtitle);
    divBrand.append(divLogo, div);
    return $("sidebar").prepend(divBrand);
}

createDivBrand();

function settingsBodyColor() {
    const aside = document.createElement("aside");
    const input = document.createElement("input");
    input.type = "color";
    aside.innerText = "Свет фона";
    input.addEventListener("input", () => {
        $("body").style.background = input.value
    })
    aside.append(input);
    return aside
}

function settingsAllTextColor() {
    const aside = document.createElement("aside");
    const style = document.createElement("style");
    const input = document.createElement("input");
    input.type = "color";
    aside.innerText = "Свет текста(все)";
    input.addEventListener("input", () => {
        style.innerHTML = `*{
            color: ${input.value};
        }`
    });
    aside.append(input);
    $("body").append(style);
    return aside
}

async function colorsData() {
    try {
        let response = await fetch("http://localhost:3333/root", {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        });
        let colors = await response.json();
        return colors
    } catch (error) {
        return [false, "Ошибка загрузки!"];
    }
}

const BLOCKS_LOCAL_KEY = 'focusmind.blockSettings.v1';

function applySettingToDOM(s) {
    if (!s || !s.block) return;
    const sel = s.block === 'appHeader' ? $('#appHeader') : document.querySelector(`[data-block="${s.block}"]`);
    if (!sel) return;
    try {
        if (s.bg) sel.style.background = s.bg;
        if (s.text) sel.style.color = s.text;
        sel.classList.remove('row-1', 'row-2', 'row-3');
        const layoutClass = (s.layout || '1-row').replace('-rows', '').replace('-row', '');
        sel.classList.add(`row-${layoutClass}`);
        const bgInput = document.getElementById(`${s.block}-bg`);
        const textInput = document.getElementById(`${s.block}-text`);
        const layoutSelect = document.getElementById(`${s.block}-layout`);
        if (bgInput && s.bg) bgInput.value = s.bg;
        if (textInput && s.text) textInput.value = s.text;
        if (layoutSelect && s.layout) layoutSelect.value = s.layout;
    } catch (err) {
        console.warn('applySettingToDOM error', err);
    }
}

function saveBlocksToLocal(obj) {
    try {
        localStorage.setItem(BLOCKS_LOCAL_KEY, JSON.stringify(obj));
    } catch (e) { }
}

function loadBlocksFromLocal() {
    try {
        return JSON.parse(localStorage.getItem(BLOCKS_LOCAL_KEY) || '{}');
    } catch (e) { return {}; }
}

async function updateSettingOnServer(id, patch) {
    try {
        const res = await fetch(`http://localhost:3333/settings/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        if (!res.ok) throw new Error('server returned ' + res.status);
        const updated = await res.json();
        const local = loadBlocksFromLocal();
        if (local && local[id]) { delete local[id]; saveBlocksToLocal(local); }
        return updated;
    } catch (err) {
        const local = loadBlocksFromLocal();
        local[id] = Object.assign({}, local[id] || {}, patch);
        saveBlocksToLocal(local);
        console.warn('Сохранено локально (сервера нет):', id, patch);
        return null;
    }
}

async function loadBlockSettings() {
    try {
        const res = await fetch('http://localhost:3333/settings');
        if (!res.ok) throw new Error('no settings');
        const arr = await res.json();
        arr.forEach(s => applySettingToDOM(s));
    } catch (err) {
        const local = loadBlocksFromLocal();
        Object.keys(local).forEach(k => {
            try { applySettingToDOM(Object.assign({ id: k }, local[k])); } catch (e) { }
        });
    }
}

function bindBlockControls() {
    const blocks = ['appHeader', 'tasks', 'notes', 'timer'];
    blocks.forEach(block => {
        const bg = document.getElementById(`${block}-bg`);
        const text = document.getElementById(`${block}-text`);
        const layout = document.getElementById(`${block}-layout`);
        const settingElement = (function () {
            if (block === 'appHeader') return document.querySelector('#appHeader');
            return document.querySelector(`[data-block="${block}"]`);
        })();
        const details = document.querySelector(`[data-setting-id][data-setting-id][data-setting-id]`) || null;
        let settingId = null;
        const detailsForBlock = document.querySelector(`.block-settings[data-setting-id][data-setting-id]`);
        const possibleBg = document.getElementById(`${block}-bg`);
        if (possibleBg && possibleBg.closest('.block-settings')) {
            settingId = possibleBg.closest('.block-settings').getAttribute('data-setting-id');
        }

        const onChange = async () => {
            const obj = { block };
            if (bg) obj.bg = bg.value;
            if (text) obj.text = text.value;
            applySettingToDOM(obj);
            if (settingId) {
                await updateSettingOnServer(settingId, obj);
            }
        };

        [bg, text, layout].forEach(el => { if (el) el.addEventListener('input', onChange); if (el) el.addEventListener('change', onChange); });
    });
}

loadBlockSettings().then(() => bindBlockControls());

$("settings").addEventListener("click", () => {
    $("settings").classList.toggle("primary");
    if ($("resetStyleBtn").classList.value == "btn none") {
        $("resetStyleBtn").classList.remove("none");
    } else {
        $("resetStyleBtn").classList.add("none");
    }
    const blockSettings = document.querySelectorAll("#blockSettings");
    blockSettings.forEach(block => {
        if (block.classList.value == "block-settings") {
            block.classList.add("open");
            block.style.display = "block";
        } else if (block.classList.value == "block-settings open") {
            block.classList.remove("open");
            block.style.display = "none";
        }
    });
});

const STYLE_DEFAULTS = [
    { id: 1, block: 'appHeader', bg: '#0c1321', text: '#e6eef8', layout: '1-row' },
    { id: 2, block: 'tasks', bg: '#0c1321', text: '#e6eef8', layout: '1-row' },
    { id: 3, block: 'notes', bg: '#0b1220aa', text: '#e6eef8', layout: '1-row' },
    { id: 4, block: 'timer', bg: '#0c1321', text: '#e6eef8', layout: '1-row' },
    { id: 5, block: 'sidebar', bg: '#0b1220cc', text: '#e6eef8', layout: '1-row' }
];

async function resetStyles() {
    STYLE_DEFAULTS.forEach(s => {
        try { applySettingToDOM(s); } catch (e) { console.warn('applySettingToDOM failed', e); }
    });

    const localObj = {};
    STYLE_DEFAULTS.forEach(s => {
        localObj[s.id] = { block: s.block, bg: s.bg, text: s.text, layout: s.layout };
    });
    saveBlocksToLocal(localObj);

    const promises = STYLE_DEFAULTS.map(s => {
        return updateSettingOnServer(s.id, { block: s.block, bg: s.bg, text: s.text, layout: s.layout });
    });

    try {
        await Promise.all(promises);
        alert('Стили сброшены к заводским и сохранены локально.');
    } catch (err) {
        console.warn('resetStyles: some saves failed', err);
        alert('Стили сброшены.');
    }

}

const resetBtn = document.getElementById('resetStyleBtn') || document.getElementById('resetStylesBtn');
if (resetBtn) {
    resetBtn.removeEventListener?.('click', () => { });
    resetBtn.addEventListener('click', () => {
        if (confirm('Сбросить все стили к заводским настройкам?')) {
            resetStyles();
        }
    });
}

/*
*@LICENSE
*FocusMind v1.0.0
*Copyright (c) 2026 Bakhtovar Usmonov All rights reserved.
*Unauthorized copying of this file, via any medium is strictly prohibited.
*/
