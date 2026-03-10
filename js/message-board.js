import { fetchMessageBoard, saveMessageBoard } from './api.js';

let messageBoardData = {
    feedbacks: [],
    notice: ''
};

const categoryOptions = ['服务优化', '功能建议', 'Bug反馈', '使用问题', '其他'];

let showError = message => console.error(message);

function updateFeedbackStats() {
    const feedbacks = messageBoardData.feedbacks || [];
    const total = feedbacks.length;
    const completed = feedbacks.filter(item => item.completed).length;
    const pending = total - completed;

    document.getElementById('feedbackTotal').textContent = total;
    document.getElementById('feedbackCompleted').textContent = completed;
    document.getElementById('feedbackPending').textContent = pending;
}

function renderFeedbackTable() {
    const feedbackBody = document.getElementById('feedbackBody');
    updateFeedbackStats();

    if (!messageBoardData.feedbacks || messageBoardData.feedbacks.length === 0) {
        feedbackBody.innerHTML = `
            <tr>
                <td colspan="6" class="feedback-empty">暂无反馈，点击下方按钮添加</td>
            </tr>
        `;
        return;
    }

    const sortedFeedbacks = [...messageBoardData.feedbacks].sort((a, b) => {
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        return b.id - a.id;
    });

    feedbackBody.innerHTML = sortedFeedbacks.map((item, index) => {
        const originalIndex = messageBoardData.feedbacks.findIndex(feedback => feedback.id === item.id);
        return `
            <tr data-index="${originalIndex}">
                <td class="seq-num">${index + 1}</td>
                <td>
                    <div class="editable-cell" data-field="date" data-index="${originalIndex}">
                        ${item.date || '点击设置'}
                    </div>
                </td>
                <td>
                    <div class="editable-cell" data-field="category" data-index="${originalIndex}">
                        <span class="category-tag ${item.category || ''}">${item.category || '点击选择'}</span>
                    </div>
                </td>
                <td>
                    <div class="editable-cell" data-field="description" data-index="${originalIndex}">
                        ${item.description || '点击输入描述'}
                    </div>
                </td>
                <td>
                    <span class="status-badge ${item.completed ? 'completed' : 'pending'}"
                          data-index="${originalIndex}"
                          onclick="toggleFeedbackStatus(${originalIndex})">
                        ${item.completed ? '✓ 已完成' : '○ 待处理'}
                    </span>
                </td>
                <td>
                    <button class="delete-feedback-btn" onclick="deleteFeedback(${originalIndex})" title="删除">×</button>
                </td>
            </tr>
        `;
    }).join('');

    addFeedbackEditListeners();
}

function renderMessageBoard() {
    renderFeedbackTable();

    const noticeContent = document.getElementById('noticeContent');
    if (messageBoardData.notice) {
        noticeContent.textContent = messageBoardData.notice;
        noticeContent.classList.remove('empty');
    } else {
        noticeContent.textContent = '点击此处发布公告...';
        noticeContent.classList.add('empty');
    }
}

async function updateMessageBoard() {
    try {
        await saveMessageBoard(messageBoardData);
        console.log('留言板已同步到服务器');
        return true;
    } catch (error) {
        console.error('留言板更新失败:', error);
        showError('留言板保存失败，请稍后重试');
        return false;
    }
}

function addFeedbackEditListeners() {
    document.querySelectorAll('.feedback-table .editable-cell').forEach(cell => {
        cell.addEventListener('click', handleFeedbackCellClick);
    });
}

function handleFeedbackCellClick(event) {
    const cell = event.currentTarget;
    if (cell.querySelector('input') || cell.querySelector('select')) {
        return;
    }

    const field = cell.getAttribute('data-field');
    const index = parseInt(cell.getAttribute('data-index'), 10);
    const item = messageBoardData.feedbacks[index];

    if (field === 'category') {
        const currentValue = item.category || '';
        cell.innerHTML = `
            <select>
                <option value="">选择种类</option>
                ${categoryOptions.map(option => `
                    <option value="${option}" ${option === currentValue ? 'selected' : ''}>${option}</option>
                `).join('')}
            </select>
        `;

        const select = cell.querySelector('select');
        select.focus();

        const save = async () => {
            const newValue = select.value;
            messageBoardData.feedbacks[index].category = newValue;
            cell.innerHTML = `<span class="category-tag ${newValue}">${newValue || '点击选择'}</span>`;
            await updateMessageBoard();
        };

        select.addEventListener('blur', save);
        select.addEventListener('change', () => select.blur());
        return;
    }

    if (field === 'date') {
        const currentValue = item.date || '';
        cell.innerHTML = `<input type="date" value="${currentValue}">`;

        const input = cell.querySelector('input');
        input.focus();

        const save = async () => {
            const newValue = input.value;
            messageBoardData.feedbacks[index].date = newValue;
            cell.textContent = newValue || '点击设置';
            await updateMessageBoard();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                input.blur();
            }
        });
        return;
    }

    if (field === 'description') {
        const currentValue = item.description || '';
        cell.innerHTML = `<input type="text" value="${currentValue}" placeholder="输入描述">`;

        const input = cell.querySelector('input');
        input.focus();
        input.select();

        const save = async () => {
            const newValue = input.value.trim();
            messageBoardData.feedbacks[index].description = newValue;
            cell.textContent = newValue || '点击输入描述';
            await updateMessageBoard();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                input.blur();
            }
        });
    }
}

async function toggleFeedbackStatus(index) {
    messageBoardData.feedbacks[index].completed = !messageBoardData.feedbacks[index].completed;
    renderFeedbackTable();
    await updateMessageBoard();
}

async function addFeedback() {
    const today = new Date().toISOString().split('T')[0];
    const newFeedback = {
        id: Date.now(),
        date: today,
        category: '',
        description: '',
        completed: false
    };

    if (!messageBoardData.feedbacks) {
        messageBoardData.feedbacks = [];
    }

    messageBoardData.feedbacks.unshift(newFeedback);
    renderFeedbackTable();
    await updateMessageBoard();
}

async function deleteFeedback(index) {
    if (!confirm('确定要删除这条反馈吗？')) {
        return;
    }

    messageBoardData.feedbacks.splice(index, 1);
    renderFeedbackTable();
    await updateMessageBoard();
}

function handleNoticeClick(event) {
    const element = event.currentTarget;
    if (element.querySelector('textarea')) {
        return;
    }

    const currentText = element.classList.contains('empty') ? '' : element.textContent.trim();
    element.innerHTML = `<textarea placeholder="Shift+Enter换行，Enter保存">${currentText}</textarea>`;
    element.classList.add('editing');

    const textarea = element.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const save = async () => {
        const newText = textarea.value.trim();
        messageBoardData.notice = newText;

        if (newText) {
            element.textContent = newText;
            element.classList.remove('empty');
        } else {
            element.textContent = '点击此处发布公告...';
            element.classList.add('empty');
        }

        element.classList.remove('editing');
        await updateMessageBoard();
    };

    textarea.addEventListener('blur', save);
    textarea.addEventListener('keydown', e => {
        if (e.key !== 'Enter') {
            return;
        }

        if (e.shiftKey || e.altKey || e.metaKey) {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;
            textarea.value = value.substring(0, start) + '\n' + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            return;
        }

        e.preventDefault();
        textarea.blur();
    });
}

function addMessageBoardListeners() {
    document.getElementById('noticeContent').addEventListener('click', handleNoticeClick);
    document.getElementById('addFeedbackBtn').addEventListener('click', addFeedback);
}

async function loadMessageBoardData() {
    try {
        const data = await fetchMessageBoard();
        if (!data) {
            console.log('留言板接口不存在，使用默认数据');
            renderMessageBoard();
            return;
        }

        if (data.feedbacks) {
            messageBoardData = data;
        } else {
            messageBoardData = {
                feedbacks: [],
                notice: data.notice || ''
            };
            console.log('检测到旧数据格式，已转换为新格式');
        }

        renderMessageBoard();
    } catch (error) {
        console.log('留言板数据加载失败，使用默认数据:', error.message);
        renderMessageBoard();
    }
}

export async function initMessageBoard(options = {}) {
    showError = options.showError || showError;
    window.toggleFeedbackStatus = toggleFeedbackStatus;
    window.deleteFeedback = deleteFeedback;
    addMessageBoardListeners();
    await loadMessageBoardData();
}
