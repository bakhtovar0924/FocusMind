// ==================== INDEXEDDB МОДУЛЬ ====================
const DB = {
    name: 'FocusMindDB',
    version: 2,
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('tasks')) {
                    const tasksStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    tasksStore.createIndex('createdAt', 'createdAt');
                }

                if (!db.objectStoreNames.contains('settings')) {
                    const settingsStore = db.createObjectStore('settings', { keyPath: 'id' });
                    settingsStore.createIndex('block', 'block');
                }

                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('timer')) {
                    db.createObjectStore('timer', { keyPath: 'id' });
                }
            };
        });
    },

    async getAll(store) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const request = tx.objectStore(store).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    async get(store, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const request = tx.objectStore(store).get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async set(store, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const request = tx.objectStore(store).put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(store, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const request = tx.objectStore(store).delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getByIndex(store, indexName, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const index = tx.objectStore(store).index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// ==================== ОСНОВНОЕ СОСТОЯНИЕ ====================
const stateKey = 'focusmind.v1';
const STYLE_LOCAL_KEY = 'focusmind.blockSettings.v1';

const defaultState = {
    tasks: [],
    notes: '',
    timer: { mins: 25, remaining: 1500, running: false }
};

// Загрузка состояния из localStorage (совместимость со старыми данными)
function loadState() {
    const saved = localStorage.getItem(stateKey);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) { }
    }
    return JSON.parse(JSON.stringify(defaultState));
}

let state = loadState();
const save = () => localStorage.setItem(stateKey, JSON.stringify(state));

// ==================== КАСТОМНЫЕ УВЕДОМЛЕНИЯ ====================
function showToast(message, duration = 2000) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function showConfirm(message, onConfirm, onCancel) {
    let overlay = document.querySelector('.modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <p></p>
                <div class="modal-buttons">
                    <button class="btn primary" id="modalConfirm">Да</button>
                    <button class="btn" id="modalCancel">Нет</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    const modalText = overlay.querySelector('.modal p');
    modalText.textContent = message;

    const confirmBtn = overlay.querySelector('#modalConfirm');
    const cancelBtn = overlay.querySelector('#modalCancel');

    const cleanup = () => {
        overlay.classList.remove('show');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    const handleConfirm = () => {
        cleanup();
        if (onConfirm) onConfirm();
    };

    const handleCancel = () => {
        cleanup();
        if (onCancel) onCancel();
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    overlay.classList.add('show');
}

// ==================== ИНИЦИАЛИЗАЦИЯ INDEXEDDB И МИГРАЦИЯ ====================
let dbReady = false;

async function migrateOldDataToIndexedDB() {
    await DB.init();

    // Миграция задач из localStorage в IndexedDB
    if (state.tasks && state.tasks.length > 0) {
        const existingTasks = await DB.getAll('tasks');
        if (existingTasks.length === 0) {
            for (const task of state.tasks) {
                await DB.set('tasks', {
                    title: task.title,
                    done: task.done || false,
                    created: task.created || new Date().toISOString()
                });
            }
            console.log('Tasks migrated to IndexedDB');
        }
    }

    // Миграция заметок
    if (state.notes) {
        const existingNote = await DB.get('notes', 'main');
        if (!existingNote) {
            await DB.set('notes', { id: 'main', content: state.notes });
        }
    }

    // Миграция таймера
    const existingTimer = await DB.get('timer', 'main');
    if (!existingTimer && state.timer) {
        await DB.set('timer', { id: 'main', ...state.timer });
    }
}

// Загрузка задач из IndexedDB
async function loadTasksFromDB() {
    await DB.init();
    const tasks = await DB.getAll('tasks');
    // Конвертируем формат IndexedDB в формат state.tasks
    state.tasks = tasks.map(t => ({
        id: t.id,
        title: t.title,
        done: t.done || false,
        created: t.created
    }));
    save();
    renderTasks();
}

// Сохранение задачи в IndexedDB
async function saveTaskToDB(task, id = null) {
    await DB.init();
    const taskData = {
        title: task.title,
        done: task.done || false,
        created: task.created || new Date().toISOString()
    };
    if (id) {
        taskData.id = id;
        await DB.set('tasks', taskData);
    } else {
        const newId = await DB.set('tasks', taskData);
        return newId;
    }
}

// Удаление задачи из IndexedDB
async function deleteTaskFromDB(taskId) {
    await DB.init();
    await DB.delete('tasks', taskId);
}

// Обновление статуса задачи
async function updateTaskDoneInDB(taskId, done) {
    await DB.init();
    const task = await DB.get('tasks', taskId);
    if (task) {
        task.done = done;
        await DB.set('tasks', task);
    }
}

// Загрузка заметки из IndexedDB (старая совместимость)
async function loadNoteFromDB() {
    // Функция больше не нужна, используем новую систему заметок
    // Оставляем только для совместимости со старыми данными
    await DB.init();
    const oldNote = await DB.get('notes', 'main');
    if (oldNote && oldNote.content) {
        // Создаём заметку из старых данных
        const existingNotes = await DB.getAll('notes');
        const hasUserNotes = existingNotes.some(n => n.type === 'user_note');
        if (!hasUserNotes && oldNote.content.trim()) {
            await DB.set('notes', {
                id: Date.now(),
                title: 'Старая заметка',
                content: oldNote.content,
                type: 'user_note',
                updatedAt: new Date().toISOString()
            });
            console.log('Migrated old note to new format');
        }
    }
    // Загружаем список новых заметок
    await loadNotesList();
}

// Сохранение заметки в IndexedDB
async function saveNoteToDB(content) {
    await DB.init();
    await DB.set('notes', { id: 'main', content: content });
}

// Загрузка таймера из IndexedDB
async function loadTimerFromDB() {
    await DB.init();
    const timer = await DB.get('timer', 'main');
    if (timer) {
        state.timer = {
            mins: timer.mins || 25,
            remaining: timer.remaining || 1500,
            running: timer.running || false
        };
    }
    updateTimerUI();
    if (state.timer.running) startTimer();
}

// Сохранение таймера в IndexedDB
async function saveTimerToDB() {
    await DB.init();
    await DB.set('timer', { id: 'main', ...state.timer });
}

// ==================== НАСТРОЙКИ СТИЛЕЙ (без бекенда) ====================
const STYLE_DEFAULTS = [
    { id: 'appHeader', block: 'appHeader', bg: '#0c1321', text: '#e6eef8' },
    { id: 'tasks', block: 'tasks', bg: '#0c1321', text: '#e6eef8' },
    { id: 'notes', block: 'notes', bg: '#0b1220aa', text: '#e6eef8' },
    { id: 'timer', block: 'timer', bg: '#0c1321', text: '#e6eef8' },
    { id: 'sidebar', block: 'sidebar', bg: '#0b1220cc', text: '#e6eef8' }
];

function loadStyleSettings() {
    try {
        const saved = localStorage.getItem(STYLE_LOCAL_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            STYLE_DEFAULTS.forEach(defaultStyle => {
                const savedStyle = settings[defaultStyle.id];
                if (savedStyle) {
                    applySettingToDOM({ block: savedStyle.block, bg: savedStyle.bg, text: savedStyle.text });
                } else {
                    applySettingToDOM(defaultStyle);
                }
            });
        } else {
            STYLE_DEFAULTS.forEach(s => applySettingToDOM(s));
        }
    } catch (e) {
        STYLE_DEFAULTS.forEach(s => applySettingToDOM(s));
    }
}

function saveStyleSetting(blockId, bg, text) {
    try {
        const saved = localStorage.getItem(STYLE_LOCAL_KEY);
        const settings = saved ? JSON.parse(saved) : {};
        settings[blockId] = { block: blockId, bg, text };
        localStorage.setItem(STYLE_LOCAL_KEY, JSON.stringify(settings));
    } catch (e) { }
}

function applySettingToDOM(s) {
    if (!s || !s.block) return;
    let sel;
    if (s.block === 'appHeader') {
        sel = $('appHeader');
    } else if (s.block === 'sidebar') {
        sel = $('sidebar');  // <-- добавь эту строку
    } else {
        sel = document.querySelector(`[data-block="${s.block}"]`);
    }
    if (!sel) return;
    if (s.bg) sel.style.background = s.bg;
    if (s.text) sel.style.color = s.text;

    const bgInput = document.getElementById(`${s.block}-bg`);
    const textInput = document.getElementById(`${s.block}-text`);
    if (bgInput && s.bg) bgInput.value = s.bg;
    if (textInput && s.text) textInput.value = s.text;
}

function bindBlockControls() {
    const blocks = ['appHeader', 'tasks', 'notes', 'timer', 'sidebar'];
    blocks.forEach(block => {
        const bg = document.getElementById(`${block}-bg`);
        const text = document.getElementById(`${block}-text`);

        const onChange = () => {
            const bgVal = bg ? bg.value : '';
            const textVal = text ? text.value : '';
            applySettingToDOM({ block: block, bg: bgVal, text: textVal });
            saveStyleSetting(block, bgVal, textVal);
        };

        if (bg) { bg.addEventListener('input', onChange); bg.addEventListener('change', onChange); }
        if (text) { text.addEventListener('input', onChange); text.addEventListener('change', onChange); }
    });
}

async function resetStyles() {
    STYLE_DEFAULTS.forEach(s => {
        applySettingToDOM(s);
        saveStyleSetting(s.id, s.bg, s.text);
    });
    showToast('Стили сброшены к заводским');
}

// ==================== DOM ЭЛЕМЕНТЫ ====================
const $ = (id) => document.getElementById(id);
const tasksList = $('tasksList');

// ==================== ESCAPE ФУНКЦИЯ ====================
function escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== РЕНДЕР ЗАДАЧ ====================
function renderTasks() {
    if (!tasksList) return;
    tasksList.innerHTML = '';
    if (!state.tasks.length) {
        tasksList.innerHTML = '<div class="hint">Нет задач — добавьте первую.</div>';
        return;
    }
    state.tasks.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'task-row';
        row.innerHTML = `
            <input type="checkbox" ${t.done ? 'checked' : ''} data-id="${t.id}" />
            <div class="task-title" style="text-decoration:${t.done ? 'line-through' : ''}">${escape(t.title)}</div>
            <div class="task-actions">
                <button class="btn" data-del="${t.id}">✖</button>
            </div>`;
        tasksList.appendChild(row);
    });
}

// ==================== ОБРАБОТЧИКИ ЗАДАЧ ====================
if (tasksList) {
    tasksList.addEventListener('click', async (e) => {
        if (e.target.matches('[data-del]')) {
            const id = +e.target.getAttribute('data-del');
            const index = state.tasks.findIndex(t => t.id === id);
            if (index !== -1) {
                state.tasks.splice(index, 1);
                await deleteTaskFromDB(id);
                save();
                renderTasks();
            }
        }
        if (e.target.matches('input[type="checkbox"]')) {
            const id = +e.target.getAttribute('data-id');
            const task = state.tasks.find(t => t.id === id);
            if (task) {
                task.done = e.target.checked;
                await updateTaskDoneInDB(id, task.done);
                save();
                renderTasks();
            }
        }
    });
}

// Добавление задачи
if ($('addTaskBtn')) {
    $('addTaskBtn').addEventListener('click', async () => {
        const text = $('taskText').value.trim();
        if (!text) return;

        const newId = await saveTaskToDB({ title: text, done: false });
        state.tasks.push({ id: newId, title: text, done: false, created: new Date().toISOString() });
        $('taskText').value = '';
        save();
        renderTasks();
    });
}

if ($('taskText')) {
    $('taskText').addEventListener('keydown', e => { if (e.key === 'Enter') $('addTaskBtn').click(); });
}

// ==================== ЗАМЕТКИ ====================
let currentNoteId = null;

// Загрузка списка заметок
async function loadNotesList() {
    await DB.init();
    const allNotes = await DB.getAll('notes');
    // Фильтруем только заметки (не main и не системные)
    const userNotes = allNotes.filter(n => n.id !== 'main' && n.type === 'user_note');

    const notesList = document.getElementById('notesList');
    if (!notesList) return;

    if (userNotes.length === 0) {
        notesList.innerHTML = '<div class="hint" style="padding:12px;text-align:center">Нет заметок. Создайте первую.</div>';
        return;
    }

    notesList.innerHTML = userNotes.map(note => `
        <div class="note-preview" data-note-id="${note.id}">
            <div class="note-preview-title">${escape(note.title || 'Без заголовка')}</div>
            <div class="note-preview-excerpt">${escape(note.content?.substring(0, 60) || '...')}</div>
        </div>
    `).join('');

    // Обработчики клика
    document.querySelectorAll('.note-preview').forEach(el => {
        el.addEventListener('click', () => openNote(parseInt(el.dataset.noteId)));
    });
}

// Открыть заметку для редактирования
async function openNote(noteId) {
    currentNoteId = noteId;
    const note = await DB.get('notes', noteId);

    if (note) {
        document.getElementById('noteTitle').value = note.title || '';
        document.getElementById('noteContent').value = note.content || '';
    }

    const deleteBtn = document.getElementById('deleteNoteBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';

    document.getElementById('noteEditor').style.display = 'block';
    document.querySelector('#notesList').style.display = 'none';
}

// Сохранить текущую заметку
async function saveCurrentNote() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value;

    if (!title && !content) {
        showToast('Заметка пуста, ничего не сохранено');
        return;
    }

    if (currentNoteId) {
        // Обновление существующей заметки
        const noteData = {
            id: currentNoteId,
            title: title || 'Без названия',
            content: content,
            type: 'user_note',
            updatedAt: new Date().toISOString()
        };
        await DB.set('notes', noteData);
        showToast('✓ Заметка обновлена');
    } else {
        // Создание новой заметки — генерируем ID вручную
        const newId = Date.now(); // уникальный ID
        const noteData = {
            id: newId,
            title: title || 'Без названия',
            content: content,
            type: 'user_note',
            updatedAt: new Date().toISOString()
        };
        await DB.set('notes', noteData);
        currentNoteId = newId;
        showToast('✓ Новая заметка создана');
    }

    // Обновляем список и закрываем редактор
    await loadNotesList();
    document.getElementById('noteEditor').style.display = 'none';
    document.querySelector('#notesList').style.display = 'block';
    clearNoteEditor();
}

// Очистить редактор
function clearNoteEditor() {
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    currentNoteId = null;
}

// Создать новую заметку
function newNote() {
    clearNoteEditor();

    // Скрываем кнопку удаления для новой заметки
    const deleteBtn = document.getElementById('deleteNoteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.getElementById('noteEditor').style.display = 'block';
    document.querySelector('#notesList').style.display = 'none';
    document.getElementById('noteTitle').focus();
}

// Отмена редактирования
function cancelNoteEdit() {
    clearNoteEditor();

    // Скрываем кнопку удаления
    const deleteBtn = document.getElementById('deleteNoteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    document.getElementById('noteEditor').style.display = 'none';
    document.querySelector('#notesList').style.display = 'block';
}

// Преобразование простого текста в HTML (жирный, курсив, списки)
function formatSimpleMarkdown(text) {
    if (!text) return '';
    let html = escape(text);
    // Жирный: **текст** → <strong>текст</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Курсив: *текст* → <em>текст</em>
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Списки: - пункт → <ul><li>пункт</li></ul>
    if (html.includes('- ')) {
        const lines = html.split('\n');
        let inList = false;
        let result = [];
        for (let line of lines) {
            if (line.trim().startsWith('- ')) {
                if (!inList) {
                    result.push('<ul>');
                    inList = true;
                }
                result.push(`<li>${line.trim().substring(2)}</li>`);
            } else {
                if (inList) {
                    result.push('</ul>');
                    inList = false;
                }
                result.push(line);
            }
        }
        if (inList) result.push('</ul>');
        html = result.join('\n');
    }
    // Переносы строк
    html = html.replace(/\n/g, '<br>');
    return html;
}

// Удалить текущую заметку
async function deleteCurrentNote() {
    if (!currentNoteId) return;

    showConfirm('Удалить эту заметку? Отменить будет нельзя.', async () => {
        await DB.delete('notes', currentNoteId);
        showToast('✓ Заметка удалена');

        // Очищаем редактор и обновляем список
        clearNoteEditor();
        document.getElementById('noteEditor').style.display = 'none';
        document.querySelector('#notesList').style.display = 'block';
        await loadNotesList();
    });
}

// ==================== ЭКСПОРТ/ИМПОРТ ====================
function exportJSON() {
    const exportData = {
        tasks: state.tasks,
        notes: state.notes,
        timer: state.timer,
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'focusmind-data.json';
    a.click();
    URL.revokeObjectURL(url);
}

if ($('exportBtn')) $('exportBtn').addEventListener('click', exportJSON);

if ($('importFile')) {
    $('importFile').addEventListener('change', async (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                // Импорт задач
                if (parsed.tasks && Array.isArray(parsed.tasks)) {
                    for (const task of parsed.tasks) {
                        await saveTaskToDB({ title: task.title, done: task.done || false });
                    }
                    await loadTasksFromDB();
                }
                // Импорт заметок
                if (parsed.notes) {
                    state.notes = parsed.notes;
                    await saveNoteToDB(parsed.notes);
                    if ($('notes')) $('notes').value = parsed.notes;
                }
                // Импорт таймера
                if (parsed.timer) {
                    state.timer = parsed.timer;
                    await saveTimerToDB();
                    updateTimerUI();
                }
                save();
                showToast('Импортировано');
            }
        } catch (err) {
            showToast('Неверный JSON');
        }
        ev.target.value = '';
    });
}

if ($('openData')) {
    $('openData').addEventListener('click', () => {
        const w = window.open();
        w.document.write('<pre>' + escape(JSON.stringify({ tasks: state.tasks, notes: state.notes, timer: state.timer }, null, 2)) + '</pre>');
    });
}

if ($('clearStorage')) {
    $('clearStorage').addEventListener('click', () => {
        showConfirm('Сбросить все данные? Это действие необратимо.', () => {
            localStorage.removeItem(stateKey);
            localStorage.removeItem(STYLE_LOCAL_KEY);
            indexedDB.deleteDatabase('FocusMindDB');
            location.reload();
        });
    });
}

// ==================== ТАЙМЕР ====================
let timerInterval = null;

function format(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

function updateTimerUI() {
    if ($('time')) $('time').textContent = format(state.timer.remaining);
    if ($('minutes')) $('minutes').value = state.timer.mins;
}

// Обновить иконку play/pause
function updatePlayPauseIcon() {
    const btn = $('playPauseBtn');
    if (!btn) return;

    if (state.timer.running) {
        btn.textContent = '⏸';  // две полоски (пауза)
        btn.setAttribute('aria-label', 'Пауза');
    } else {
        btn.textContent = '▶';  // треугольник (play)
        btn.setAttribute('aria-label', 'Запустить');
    }
}

async function startTimer() {
    if (state.timer.running) return;
    state.timer.running = true;
    save();
    await saveTimerToDB();

    updatePlayPauseIcon();

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(async () => {
        if (state.timer.remaining > 0) {
            state.timer.remaining--;
            updateTimerUI();
            save();
            await saveTimerToDB();
        } else {
            clearInterval(timerInterval);
            state.timer.running = false;
            save();
            showToast('Интервал завершён');
            await saveTimerToDB();
        }
    }, 1000);
}

function pauseTimer() {
    if (timerInterval) clearInterval(timerInterval);
    state.timer.running = false;
    save();
    saveTimerToDB();
    updatePlayPauseIcon();
}

async function resetTimer() {
    pauseTimer();
    state.timer.remaining = state.timer.mins * 60;
    updateTimerUI();
    save();
    await saveTimerToDB();
    updatePlayPauseIcon();
}

// Объединённая кнопка Play/Pause
const playPauseBtn = $('playPauseBtn');
if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
        if (state.timer.running) {
            pauseTimer();
        } else {
            startTimer();
        }
    });
}

if ($('resetTimer')) $('resetTimer').addEventListener('click', () => { resetTimer(); });

if ($('minutes')) {
    $('minutes').addEventListener('change', async (e) => {
        const v = Math.max(1, Math.trunc(Number(e.target.value) || 25));
        state.timer.mins = v;
        state.timer.remaining = v * 60;
        save();
        await saveTimerToDB();
        updateTimerUI();
    });
}

if ($('quick25')) $('quick25').addEventListener('click', () => { if ($('minutes')) { $('minutes').value = 25; $('minutes').dispatchEvent(new Event('change')); } });
if ($('quick50')) $('quick50').addEventListener('click', () => { if ($('minutes')) { $('minutes').value = 50; $('minutes').dispatchEvent(new Event('change')); } });
if ($('quick15')) $('quick15').addEventListener('click', () => { if ($('minutes')) { $('minutes').value = 15; $('minutes').dispatchEvent(new Event('change')); } });

// ==================== БРЕНДИНГ ====================
function createDivBrand() {
    const sidebar = $("sidebar");
    if (!sidebar) return;

    const divBrand = document.createElement("div");
    divBrand.classList.add("brand");
    const divLogo = document.createElement("div");
    divLogo.classList.add("logo");
    const icon = document.createElement("img");
    icon.loading = "eager";
    icon.src = "favicio.png";
    icon.alt = "Logo";
    icon.style.width = "36px";
    icon.style.height = "36px";
    icon.classList.add("logo");
    divLogo.append(icon);
    const div = document.createElement("div");
    const divFMOS = document.createElement("div");
    divFMOS.style.fontWeight = "700";
    const h1 = document.createElement("h1");
    h1.innerText = "FocusMind OS";
    h1.style.fontSize = "24px";
    divFMOS.append(h1);
    const divSubtitle = document.createElement("div");
    divSubtitle.classList.add("subtitle");
    const h2 = document.createElement("h2");
    h2.style.fontSize = "12px";
    h2.innerText = "Локальный центр продуктивности";
    divSubtitle.append(h2);
    div.append(divFMOS, divSubtitle);
    divBrand.append(divLogo, div);
    sidebar.prepend(divBrand);
}

// ==================== НАСТРОЙКИ (UI) ====================
if ($("settings")) {
    $("settings").addEventListener("click", () => {
        $("settings").classList.toggle("primary");
        const resetBtn = $("resetStyleBtn");
        if (resetBtn) {
            if (resetBtn.classList.value == "btn none") {
                resetBtn.classList.remove("none");
            } else {
                resetBtn.classList.add("none");
            }
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
}

const resetStyleBtn = document.getElementById('resetStyleBtn') || document.getElementById('resetStylesBtn');
if (resetStyleBtn) {
    resetStyleBtn.addEventListener('click', () => {
        showConfirm('Сбросить все стили к заводским настройкам?', () => {
            resetStyles();
        });
    });
}

// ==================== ПРЕЛОАДЕР ====================
let loadedCount = 0;
const totalResources = document.images.length + document.querySelectorAll('audio').length;

function updateProgress() {
    loadedCount++;
    const progress = Math.round((loadedCount / Math.max(totalResources, 1)) * 100);
    const progressEl = document.getElementById('progress-count');
    if (progressEl) progressEl.textContent = progress + '%';

    if (loadedCount >= totalResources && totalResources > 0) {
        setTimeout(() => {
            const preloader = document.getElementById('preloader');
            if (preloader) preloader.classList.add('hidden');
        }, 500);
    }
}

document.querySelectorAll('img').forEach(img => {
    if (img.complete) {
        updateProgress();
    } else {
        img.addEventListener('load', updateProgress);
        img.addEventListener('error', updateProgress);
    }
});

// Если нет изображений, скрываем прелоадер сразу
if (totalResources === 0) {
    const preloader = document.getElementById('preloader');
    if (preloader) preloader.classList.add('hidden');
}

// ==================== ACCESSIBILITY FIXES ====================
function addAccessibilityAttributes() {
    // minutes теперь имеет видимый label в HTML, скрытый не нужен

    // Добавляем aria-label для кнопок
    const addTaskBtn = $('addTaskBtn');
    if (addTaskBtn && !addTaskBtn.hasAttribute('aria-label')) {
        addTaskBtn.setAttribute('aria-label', 'Добавить новую задачу');
    }

    // Добавляем aria-label для кнопок таймера
    const playPauseBtn = $('playPauseBtn');
    if (playPauseBtn && !playPauseBtn.hasAttribute('aria-label')) {
        playPauseBtn.setAttribute('aria-label', 'Запуск / Пауза');
    }

    const resetTimerBtn = $('resetTimer');
    if (resetTimerBtn && !resetTimerBtn.hasAttribute('aria-label')) {
        resetTimerBtn.setAttribute('aria-label', 'Сбросить таймер');
    }

    const exportBtn = $('exportBtn');
    if (exportBtn && !exportBtn.hasAttribute('aria-label')) {
        exportBtn.setAttribute('aria-label', 'Экспортировать данные в JSON');
    }

    const clearStorageBtn = $('clearStorage');
    if (clearStorageBtn && !clearStorageBtn.hasAttribute('aria-label')) {
        clearStorageBtn.setAttribute('aria-label', 'Сбросить все локальные данные');
    }

    const openDataBtn = $('openData');
    if (openDataBtn && !openDataBtn.hasAttribute('aria-label')) {
        openDataBtn.setAttribute('aria-label', 'Просмотреть JSON данные в новом окне');
    }

    // Добавляем role для таймера
    const timeDisplay = $('time');
    if (timeDisplay && !timeDisplay.hasAttribute('aria-live')) {
        timeDisplay.setAttribute('aria-live', 'polite');
        timeDisplay.setAttribute('aria-label', 'Оставшееся время таймера');
    }

    // Добавляем aria-label для импорта
    const importLabel = document.querySelector('label[for="importFile"]');
    if (importLabel && !importLabel.hasAttribute('aria-label')) {
        importLabel.setAttribute('aria-label', 'Импортировать данные из JSON файла');
    }
}

// ==================== ЗАПУСК ПРИЛОЖЕНИЯ ====================
async function init() {
    createDivBrand();

    await DB.init();
    migrateOldDataToIndexedDB().catch(console.warn);

    await loadTasksFromDB();
    await loadNoteFromDB();  // старые заметки (если есть)
    await loadTimerFromDB();

    loadStyleSettings();
    bindBlockControls();
    addAccessibilityAttributes();

    // Обработчики для кнопок заметок
    const newNoteBtn = document.getElementById('newNoteBtn');
    if (newNoteBtn) newNoteBtn.addEventListener('click', newNote);

    const saveNoteBtn = document.getElementById('saveNoteBtn');
    if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveCurrentNote);

    const cancelNoteBtn = document.getElementById('cancelNoteBtn');
    if (cancelNoteBtn) cancelNoteBtn.addEventListener('click', cancelNoteEdit);

    const deleteNoteBtn = document.getElementById('deleteNoteBtn');
    if (deleteNoteBtn) deleteNoteBtn.addEventListener('click', deleteCurrentNote);

    // Обработчики для кнопок data-action
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = btn.getAttribute('data-action');
            if (a === 'new-task' && $('taskText')) $('taskText').focus();
            if (a === 'open-timer' && $('playPauseBtn')) $('playPauseBtn').focus();
        });
    });

    console.log('FocusMind готов, всё работает локально на IndexedDB');
}

init();