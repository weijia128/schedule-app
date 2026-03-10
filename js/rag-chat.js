import { fetchRagStatus, fetchSchedule, queryRag, reindexRag } from './api.js';

let ragHistory = [];
let openLibraryFilePreview = async () => {};

function formatSourceTitle(source) {
    const weekLabel = source.week != null ? ` 第${source.week}周` : '';
    return `${source.date}${weekLabel}`;
}

function ragAppendMessage(role, content, sources) {
    const container = document.getElementById('ragMessages');
    const welcome = container.querySelector('.rag-welcome');
    if (welcome) {
        welcome.remove();
    }

    const message = document.createElement('div');
    message.className = `rag-message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'rag-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'rag-bubble';
    bubble.textContent = content;

    if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'rag-sources';

        sources.forEach(source => {
            const item = document.createElement('div');
            item.className = 'rag-source-item';

            const tag = document.createElement('span');
            tag.className = 'rag-source-tag';

            if (source.fileIndex != null) {
                tag.title = `${formatSourceTitle(source)} · 点击预览原文档`;
                tag.style.cursor = 'pointer';
                tag.onclick = () => openLibraryFilePreview({
                    name: source.filename,
                    filename: source.filename,
                    scheduleId: source.scheduleId,
                    fileIndex: source.fileIndex,
                    scheduleDate: source.date
                });
            } else {
                tag.title = `${formatSourceTitle(source)}（文件已被删除）`;
                tag.style.opacity = '0.5';
            }

            tag.textContent = `📄 ${source.filename}`;
            item.appendChild(tag);

            if (source.snippet) {
                const snippet = document.createElement('div');
                snippet.className = 'rag-source-snippet';
                snippet.textContent = source.snippet;
                item.appendChild(snippet);
            }

            sourcesDiv.appendChild(item);
        });

        bubble.appendChild(sourcesDiv);
    }

    message.appendChild(avatar);
    message.appendChild(bubble);
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
    return message;
}

function ragShowTyping() {
    const container = document.getElementById('ragMessages');
    const typing = document.createElement('div');
    typing.className = 'rag-message assistant';
    typing.id = 'ragTypingIndicator';
    typing.innerHTML = `
        <div class="rag-avatar">🤖</div>
        <div class="rag-typing"><span></span><span></span><span></span></div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
}

function ragRemoveTyping() {
    document.getElementById('ragTypingIndicator')?.remove();
}

async function ragCheckStatus() {
    const badge = document.getElementById('ragStatusBadge');
    const info = document.getElementById('ragIndexInfo');

    try {
        const data = await fetchRagStatus();
        if (!data.configured) {
            badge.textContent = '未配置';
            badge.className = 'rag-status-badge error';
            info.textContent = data.missingConfigMessage || '需配置 RAG 环境变量';
            return;
        }

        if (data.totalChunks === 0) {
            badge.textContent = '索引为空';
            badge.className = 'rag-status-badge';
            info.textContent = '请点击「重建索引」建立文档索引';
            return;
        }

        badge.textContent = '就绪';
        badge.className = 'rag-status-badge ready';
        info.textContent = `${data.totalFiles} 个文件 · ${data.totalChunks} 个片段`;
    } catch {
        badge.textContent = '离线';
        badge.className = 'rag-status-badge error';
    }
}

async function ragReindex() {
    const button = document.getElementById('ragReindexBtn');
    const info = document.getElementById('ragIndexInfo');

    button.disabled = true;
    button.textContent = '索引中...';
    info.textContent = '正在解析文档并更新检索索引，请稍候...';

    try {
        const data = await reindexRag();
        if (data.success) {
            info.textContent = `索引完成：${data.files} 个文件 · ${data.chunks} 个片段`;
            await ragCheckStatus();
        } else {
            info.textContent = `索引失败：${data.error}`;
        }
    } catch (error) {
        info.textContent = `索引请求失败：${error.message}`;
    } finally {
        button.disabled = false;
        button.textContent = '🔄 重建索引';
    }
}

async function ragSendQuery() {
    const input = document.getElementById('ragInput');
    const sendButton = document.getElementById('ragSendBtn');
    const query = input.value.trim();

    if (!query) {
        return;
    }

    input.value = '';
    input.style.height = 'auto';
    sendButton.disabled = true;

    ragAppendMessage('user', query);
    ragHistory.push({ role: 'user', content: query });
    ragShowTyping();

    try {
        const filters = ragCollectFilters();
        const data = await queryRag(query, ragHistory.slice(0, -1), filters);
        ragRemoveTyping();

        if (data.success) {
            ragAppendMessage('assistant', data.answer, data.sources);
            ragHistory.push({ role: 'assistant', content: data.answer });
        } else {
            ragAppendMessage('assistant', `⚠️ ${data.error}`);
        }
    } catch (error) {
        ragRemoveTyping();
        ragAppendMessage('assistant', `⚠️ 请求失败：${error.message}`);
    } finally {
        sendButton.disabled = false;
        input.focus();
    }
}

function ragHandleKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        ragSendQuery();
    }

    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

function ragClearHistory() {
    ragHistory = [];
    document.getElementById('ragMessages').innerHTML = `
        <div class="rag-welcome">
            <div class="rag-welcome-icon">💬</div>
            <p>向团队文档提问，AI 将从已上传的文件中检索相关内容并作答。<br>
               例如：<em>LangSmith 有哪些功能？</em>&nbsp;&nbsp;<em>MinerU 如何处理 PDF？</em></p>
        </div>
    `;
}

function ragCollectFilters() {
    const filters = {};
    const dateFrom = document.getElementById('ragDateFrom')?.value;
    const dateTo = document.getElementById('ragDateTo')?.value;
    const weekValue = document.getElementById('ragWeekFilter')?.value;

    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (weekValue) {
        const parsed = parseInt(weekValue, 10);
        if (!isNaN(parsed)) filters.week = parsed;
    }

    return filters;
}

async function ragPopulateWeekFilter() {
    const select = document.getElementById('ragWeekFilter');
    if (!select) return;

    try {
        const schedules = await fetchSchedule();
        const weeks = [...new Set(
            schedules
                .map(s => s.week)
                .filter(w => w != null)
        )].sort((a, b) => a - b);

        // Keep the "全部" option, add week options
        select.innerHTML = '<option value="">全部</option>';
        for (const w of weeks) {
            const option = document.createElement('option');
            option.value = w;
            option.textContent = `第${w}周`;
            select.appendChild(option);
        }
    } catch {
        // Non-critical; leave default "全部" option
    }
}

function addRagListeners() {
    document.getElementById('ragReindexBtn').addEventListener('click', ragReindex);
    document.getElementById('ragClearBtn')?.addEventListener('click', ragClearHistory);
    document.getElementById('ragSendBtn').addEventListener('click', ragSendQuery);
    document.getElementById('ragInput').addEventListener('keydown', ragHandleKey);
}

export function initRagChat(options = {}) {
    openLibraryFilePreview = options.openLibraryFilePreview || openLibraryFilePreview;

    window.ragReindex = ragReindex;
    window.ragSendQuery = ragSendQuery;
    window.ragHandleKey = ragHandleKey;
    window.ragClearHistory = ragClearHistory;

    addRagListeners();
    ragCheckStatus();
    ragPopulateWeekFilter();
}
