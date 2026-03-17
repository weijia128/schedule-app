import { fetchSchedule, patchScheduleItem } from './api.js';
import { initDocumentLibrary, openLibraryFilePreview, renderFilesCell } from './document-library.js';
import { initMessageBoard } from './message-board.js';
import { initRagChat } from './rag-chat.js';
import { renderStats } from './stats.js?v=20260317';

// 功能开关：改为 true 即可开启文档问答功能
const RAG_ENABLED = false;

let scheduleData = [
    {week: 1, date: '2025-11-28', T1: '李佳晟', T2_1: '解勇宝', T2_2: '班新博', T3: '', topic: '工具：磐石ScienceOne / Chain-of-Thought Prompting...', remark: '', location: '201', time: '9:30-11:30', T1_done: true, T2_1_done: true, T2_2_done: true, T3_done: false, isHoliday: false},
    {week: 2, date: '2025-12-05', T1: '班新博', T2_1: '龚丽', T2_2: '叶玮佳', T3: '李佳晟', topic: 'iFlow CLI / MinerU2.5... / Agentic AI', remark: '', location: '201', time: '9:30-11:30', T1_done: true, T2_1_done: true, T2_2_done: true, T3_done: true, isHoliday: false},
    {week: 3, date: '2025-12-12', T1: '解勇宝', T2_1: '叶玮佳', T2_2: '龚丽', T3: '', topic: 'SAM 3: Segment Anything with Concepts...', remark: '', location: '201', time: '9:30-11:30', T1_done: true, T2_1_done: true, T2_2_done: true, T3_done: false, isHoliday: false},
    {week: 4, date: '2025-12-19', T1: '龚丽', T2_1: '李佳晟', T2_2: '班新博', T3: '解勇宝', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 5, date: '2025-12-26', T1: '叶玮佳', T2_1: '班新博', T2_2: '李佳晟', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 6, date: '2026-01-02', T1: '李佳晟', T2_1: '解勇宝', T2_2: '龚丽', T3: '叶玮佳', topic: '', remark: '假期冲突（元旦1月1-3日），时间视具体情况定', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 7, date: '2026-01-09', T1: '班新博', T2_1: '龚丽', T2_2: '解勇宝', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 8, date: '2026-01-16', T1: '解勇宝', T2_1: '叶玮佳', T2_2: '李佳晟', T3: '班新博', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 9, date: '2026-01-23', T1: '龚丽', T2_1: '李佳晟', T2_2: '叶玮佳', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 10, date: '2026-01-30', T1: '叶玮佳', T2_1: '班新博', T2_2: '解勇宝', T3: '龚丽', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 11, date: '2026-02-06', T1: '李佳晟', T2_1: '解勇宝', T2_2: '班新博', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 12, date: '2026-02-13', T1: '班新博', T2_1: '龚丽', T2_2: '叶玮佳', T3: '李佳晟', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 13, date: '2026-02-20', T1: '解勇宝', T2_1: '叶玮佳', T2_2: '龚丽', T3: '', topic: '', remark: '假期冲突（春节2月15-23日），时间视具体情况定', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 14, date: '2026-02-27', T1: '龚丽', T2_1: '李佳晟', T2_2: '班新博', T3: '解勇宝', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 15, date: '2026-03-06', T1: '叶玮佳', T2_1: '班新博', T2_2: '李佳晟', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 16, date: '2026-03-13', T1: '李佳晟', T2_1: '解勇宝', T2_2: '龚丽', T3: '叶玮佳', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 17, date: '2026-03-20', T1: '班新博', T2_1: '李佳晟', T2_2: '李燕玲', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 18, date: '2026-03-27', T1: '解勇宝', T2_1: '龚丽', T2_2: '叶玮佳', T3: '李佳晟', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 19, date: '2026-04-03', T1: '龚丽', T2_1: '李佳晟', T2_2: '叶玮佳', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 20, date: '2026-04-10', T1: '叶玮佳', T2_1: '解勇宝', T2_2: '李燕玲', T3: '班新博', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 21, date: '2026-04-17', T1: '李燕玲', T2_1: '龚丽', T2_2: '解勇宝', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 22, date: '2026-04-24', T1: '李佳晟', T2_1: '班新博', T2_2: '叶玮佳', T3: '解勇宝', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 23, date: '2026-05-01', T1: '班新博', T2_1: '李佳晟', T2_2: '龚丽', T3: '', topic: '', remark: '假期冲突（劳动节5月1-5日），时间视具体情况定', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 24, date: '2026-05-08', T1: '解勇宝', T2_1: '叶玮佳', T2_2: '李燕玲', T3: '龚丽', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 25, date: '2026-05-15', T1: '龚丽', T2_1: '李燕玲', T2_2: '班新博', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 26, date: '2026-05-22', T1: '叶玮佳', T2_1: '解勇宝', T2_2: '班新博', T3: '李燕玲', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 27, date: '2026-05-29', T1: '李燕玲', T2_1: '李佳晟', T2_2: '龚丽', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 28, date: '2026-06-05', T1: '李佳晟', T2_1: '解勇宝', T2_2: '班新博', T3: '叶玮佳', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 29, date: '2026-06-12', T1: '班新博', T2_1: '李佳晟', T2_2: '李燕玲', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 30, date: '2026-06-19', T1: '解勇宝', T2_1: '龚丽', T2_2: '叶玮佳', T3: '李佳晟', topic: '', remark: '假期冲突（端午节6月19-21日），时间视具体情况定', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 31, date: '2026-06-26', T1: '龚丽', T2_1: '李佳晟', T2_2: '叶玮佳', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 32, date: '2026-07-03', T1: '叶玮佳', T2_1: '解勇宝', T2_2: '李燕玲', T3: '班新博', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 33, date: '2026-07-10', T1: '李燕玲', T2_1: '龚丽', T2_2: '解勇宝', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 34, date: '2026-07-17', T1: '李佳晟', T2_1: '班新博', T2_2: '叶玮佳', T3: '解勇宝', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 35, date: '2026-07-24', T1: '班新博', T2_1: '李佳晟', T2_2: '龚丽', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 36, date: '2026-07-31', T1: '解勇宝', T2_1: '叶玮佳', T2_2: '李燕玲', T3: '龚丽', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 37, date: '2026-08-07', T1: '龚丽', T2_1: '李燕玲', T2_2: '班新博', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 38, date: '2026-08-14', T1: '叶玮佳', T2_1: '解勇宝', T2_2: '班新博', T3: '李燕玲', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 39, date: '2026-08-21', T1: '李燕玲', T2_1: '李佳晟', T2_2: '龚丽', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 40, date: '2026-08-28', T1: '李佳晟', T2_1: '解勇宝', T2_2: '班新博', T3: '叶玮佳', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 41, date: '2026-09-04', T1: '班新博', T2_1: '李佳晟', T2_2: '李燕玲', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 42, date: '2026-09-11', T1: '解勇宝', T2_1: '龚丽', T2_2: '叶玮佳', T3: '李佳晟', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 43, date: '2026-09-18', T1: '龚丽', T2_1: '李佳晟', T2_2: '叶玮佳', T3: '', topic: '', remark: '', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 44, date: '2026-09-25', T1: '叶玮佳', T2_1: '解勇宝', T2_2: '李燕玲', T3: '班新博', topic: '', remark: '假期冲突（中秋节9月25-27日），时间视具体情况定', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 45, date: '2026-10-02', T1: '李燕玲', T2_1: '龚丽', T2_2: '解勇宝', T3: '', topic: '', remark: '假期冲突（国庆节10月1-7日），时间视具体情况定', location: '201', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 46, date: '2026-10-09', T1: '李佳晟', T2_1: '班新博', T2_2: '叶玮佳', T3: '解勇宝', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 47, date: '2026-10-16', T1: '班新博', T2_1: '李佳晟', T2_2: '龚丽', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 48, date: '2026-10-23', T1: '解勇宝', T2_1: '叶玮佳', T2_2: '李燕玲', T3: '龚丽', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 49, date: '2026-10-30', T1: '龚丽', T2_1: '李燕玲', T2_2: '班新博', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 50, date: '2026-11-06', T1: '叶玮佳', T2_1: '解勇宝', T2_2: '班新博', T3: '李燕玲', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 51, date: '2026-11-13', T1: '李燕玲', T2_1: '李佳晟', T2_2: '龚丽', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 52, date: '2026-11-20', T1: '李佳晟', T2_1: '解勇宝', T2_2: '班新博', T3: '叶玮佳', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 53, date: '2026-11-27', T1: '班新博', T2_1: '李佳晟', T2_2: '李燕玲', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 54, date: '2026-12-04', T1: '解勇宝', T2_1: '龚丽', T2_2: '叶玮佳', T3: '李佳晟', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 55, date: '2026-12-11', T1: '龚丽', T2_1: '李佳晟', T2_2: '叶玮佳', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 56, date: '2026-12-18', T1: '叶玮佳', T2_1: '解勇宝', T2_2: '李燕玲', T3: '班新博', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false},
    {week: 57, date: '2026-12-25', T1: '李燕玲', T2_1: '龚丽', T2_2: '解勇宝', T3: '', topic: '', remark: '', location: '603', time: '9:30-11:30', T1_done: false, T2_1_done: false, T2_2_done: false, T3_done: false, isHoliday: false}
];

let refreshInterval = null;

export function getScheduleData() {
    return scheduleData;
}

function getScheduleBody() {
    return document.getElementById('scheduleBody');
}

function linkifyText(text) {
    if (!text) {
        return '';
    }

    let result = text;

    result = result.replace(/(https?:\/\/[^\s<>"]+)/gi, match => {
        let url = match;
        const punctMatch = url.match(/[)）,.;:!?。，、；：！？》」】]+$/);
        let trailing = '';

        if (punctMatch) {
            trailing = punctMatch[0];
            url = url.slice(0, -trailing.length);
        }

        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-link" onclick="event.stopPropagation();">${url}</a>${trailing}`;
    });

    result = result.replace(/(?:^|\s|<br>)(github\.com|gist\.github\.com|gitlab\.com|bitbucket\.org)(\/[^\s<>"]*)/gi, (match, domain, path, offset) => {
        const beforeMatch = result.substring(Math.max(0, offset - 10), offset);
        if (beforeMatch.includes('<a href') || beforeMatch.includes('http')) {
            return match;
        }

        let url = `https://${domain}${path}`;
        let cleanPath = path;
        let trailing = '';
        const punctMatch = path.match(/[)）,.;:!?。，、；：！？》」】]+$/);

        if (punctMatch) {
            trailing = punctMatch[0];
            cleanPath = path.slice(0, -trailing.length);
            url = `https://${domain}${cleanPath}`;
        }

        const leadingSpace = match.match(/^(\s|<br>)/)?.[1] || '';
        return `${leadingSpace}<a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-link" onclick="event.stopPropagation();">${domain}${cleanPath}</a>${trailing}`;
    });

    return result;
}

export function showLoading(show, message = '加载中...') {
    if (show) {
        const existingOverlay = document.getElementById('loading-overlay');
        if (existingOverlay) {
            const textNode = existingOverlay.querySelector('[data-loading-text]');
            if (textNode) {
                textNode.textContent = message;
            }
            return;
        }

        if (!existingOverlay) {
            const overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div style="text-align:center;">
                    <div class="loading-spinner"></div>
                    <div data-loading-text style="margin-top:20px;color:var(--accent-primary);font-weight:700;font-size:1.1rem;font-family:var(--font-body);">${message}</div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        return;
    }

    document.getElementById('loading-overlay')?.remove();
}

export function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'notification error';
    errorDiv.innerHTML = `<strong>❌ 错误:</strong> ${message}`;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

export function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'notification success';
    successDiv.innerHTML = `<strong>✓</strong> ${message}`;
    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
}

function createCheckboxes(item, index) {
    let html = '<div class="status-checkboxes">';

    if (item.T1) {
        html += `
            <div class="status-checkbox-item ${item.T1_done ? 'checked' : ''}">
                <input type="checkbox" id="cb_${index}_T1" data-index="${index}" data-field="T1_done" ${item.T1_done ? 'checked' : ''}>
                <label for="cb_${index}_T1">${item.T1}<span class="task-type">(AI工具)</span></label>
            </div>`;
    }
    if (item.T2_1) {
        html += `
            <div class="status-checkbox-item ${item.T2_1_done ? 'checked' : ''}">
                <input type="checkbox" id="cb_${index}_T2_1" data-index="${index}" data-field="T2_1_done" ${item.T2_1_done ? 'checked' : ''}>
                <label for="cb_${index}_T2_1">${item.T2_1}<span class="task-type">(论文/开源项目)</span></label>
            </div>`;
    }
    if (item.T2_2) {
        html += `
            <div class="status-checkbox-item ${item.T2_2_done ? 'checked' : ''}">
                <input type="checkbox" id="cb_${index}_T2_2" data-index="${index}" data-field="T2_2_done" ${item.T2_2_done ? 'checked' : ''}>
                <label for="cb_${index}_T2_2">${item.T2_2}<span class="task-type">(论文/开源项目)</span></label>
            </div>`;
    }
    if (item.T3) {
        html += `
            <div class="status-checkbox-item ${item.T3_done ? 'checked' : ''}">
                <input type="checkbox" id="cb_${index}_T3" data-index="${index}" data-field="T3_done" ${item.T3_done ? 'checked' : ''}>
                <label for="cb_${index}_T3">${item.T3}<span class="task-type">(技术)</span></label>
            </div>`;
    }

    html += '</div>';
    return html;
}

function updateRowStyle(index) {
    const row = getScheduleBody().rows[index];
    const item = scheduleData[index];
    if (!row || item.isHoliday) {
        return;
    }

    const allDone = (!item.T1 || item.T1_done) &&
        (!item.T2_1 || item.T2_1_done) &&
        (!item.T2_2 || item.T2_2_done) &&
        (!item.T3 || item.T3_done) &&
        (item.T1 || item.T2_1 || item.T2_2 || item.T3);

    row.classList.remove('status-done', 'status-current');
    if (allDone) {
        row.classList.add('status-done');
    }

    const firstPendingIndex = scheduleData.findIndex(data =>
        !data.isHoliday && (
            (data.T1 && !data.T1_done) ||
            (data.T2_1 && !data.T2_1_done) ||
            (data.T2_2 && !data.T2_2_done) ||
            (data.T3 && !data.T3_done)
        )
    );

    Array.from(getScheduleBody().rows).forEach((currentRow, rowIndex) => {
        currentRow.classList.remove('status-current');
        if (rowIndex === firstPendingIndex && !scheduleData[rowIndex].isHoliday) {
            const currentItem = scheduleData[rowIndex];
            const isAllDone = (!currentItem.T1 || currentItem.T1_done) &&
                (!currentItem.T2_1 || currentItem.T2_1_done) &&
                (!currentItem.T2_2 || currentItem.T2_2_done) &&
                (!currentItem.T3 || currentItem.T3_done);
            if (!isAllDone) {
                currentRow.classList.add('status-current');
            }
        }
    });
}

function addCheckboxListeners() {
    document.querySelectorAll('.status-checkboxes input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', async event => {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            const field = event.target.getAttribute('data-field');
            scheduleData[index][field] = event.target.checked;

            const item = event.target.closest('.status-checkbox-item');
            item?.classList.toggle('checked', event.target.checked);

            await updateScheduleItem(index);
            renderStats(scheduleData);
            updateRowStyle(index);
        });
    });
}

async function handleDoubleClick(event) {
    const cell = event.currentTarget;
    const index = parseInt(cell.getAttribute('data-index'), 10);
    const field = cell.getAttribute('data-field');

    if (cell.querySelector('input') || cell.querySelector('textarea')) {
        return;
    }

    if (field === 'location') {
        const item = scheduleData[index];
        const currentLocation = item.location || '201';
        const currentTime = item.time || '9:30-11:30';

        cell.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <input type="text" class="editing-location" value="${currentLocation}" placeholder="会议室" style="width: 100%; padding: 8px; border: 2px solid var(--accent-primary); border-radius: 6px; font-family: var(--font-mono); font-size: 0.95rem; background: var(--bg-elevated); color: var(--text-primary);">
                <input type="text" class="editing-time" value="${currentTime}" placeholder="时间" style="width: 100%; padding: 8px; border: 2px solid var(--accent-primary); border-radius: 6px; font-family: var(--font-mono); font-size: 0.85rem; background: var(--bg-elevated); color: var(--text-primary);">
            </div>
        `;
        cell.classList.add('editing');

        const locationInput = cell.querySelector('.editing-location');
        const timeInput = cell.querySelector('.editing-time');
        locationInput.focus();
        locationInput.select();

        const saveLocation = async () => {
            scheduleData[index].location = locationInput.value.trim() || '603';
            scheduleData[index].time = timeInput.value.trim() || '9:30-11:30';
            cell.innerHTML = `<div class="room">${scheduleData[index].location}</div><div class="time">${scheduleData[index].time}</div>`;
            cell.classList.remove('editing');
            await updateScheduleItem(index);
        };

        locationInput.addEventListener('blur', e => {
            if (e.relatedTarget !== timeInput) {
                setTimeout(saveLocation, 100);
            }
        });
        timeInput.addEventListener('blur', e => {
            if (e.relatedTarget !== locationInput) {
                setTimeout(saveLocation, 100);
            }
        });
        locationInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                timeInput.focus();
                timeInput.select();
            }
        });
        timeInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveLocation();
            }
        });
        return;
    }

    const editText = cell.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
    cell.innerHTML = `<textarea class="editing" rows="4" placeholder="Option/Shift+Enter换行，Enter保存">${editText}</textarea>`;
    cell.classList.add('editing');

    const textarea = cell.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    textarea.addEventListener('blur', async () => {
        const newText = textarea.value.trim();
        scheduleData[index][field] = newText;

        if (field === 'topic') {
            cell.innerHTML = linkifyText(newText ? newText.replace(/\n/g, '<br>') : '');
        } else {
            cell.innerHTML = newText ? newText.replace(/\n/g, '<br>') : '';
        }

        cell.classList.remove('editing');
        await updateScheduleItem(index);
        renderSchedule();
    });

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

function addEditableListeners() {
    document.querySelectorAll('.editable').forEach(cell => {
        cell.removeEventListener('dblclick', handleDoubleClick);
        cell.addEventListener('dblclick', handleDoubleClick);
    });
}

export function renderSchedule() {
    const scheduleBody = getScheduleBody();
    scheduleBody.innerHTML = '';

    const firstPendingIndex = scheduleData.findIndex(data =>
        !data.isHoliday && (
            (data.T1 && !data.T1_done) ||
            (data.T2_1 && !data.T2_1_done) ||
            (data.T2_2 && !data.T2_2_done) ||
            (data.T3 && !data.T3_done)
        )
    );

    scheduleData.forEach((item, index) => {
        const row = scheduleBody.insertRow();
        const allDone = !item.isHoliday &&
            (!item.T1 || item.T1_done) &&
            (!item.T2_1 || item.T2_1_done) &&
            (!item.T2_2 || item.T2_2_done) &&
            (!item.T3 || item.T3_done) &&
            (item.T1 || item.T2_1 || item.T2_2 || item.T3);

        row.className = item.isHoliday
            ? 'status-holiday'
            : allDone
                ? 'status-done'
                : index === firstPendingIndex
                    ? 'status-current'
                    : '';

        row.insertCell().textContent = item.week;
        row.insertCell().textContent = item.date;

        const locationCell = row.insertCell();
        locationCell.className = 'editable location-field';
        if (!item.isHoliday) {
            locationCell.innerHTML = `<div class="room">${item.location || '201'}</div><div class="time">${item.time || '9:30-11:30'}</div>`;
        }
        locationCell.setAttribute('data-index', index);
        locationCell.setAttribute('data-field', 'location');

        const topicCell = row.insertCell();
        topicCell.className = 'editable topic-link';
        topicCell.innerHTML = linkifyText(item.topic ? item.topic.replace(/\n/g, '<br>') : '');
        topicCell.setAttribute('data-index', index);
        topicCell.setAttribute('data-field', 'topic');

        const filesCell = row.insertCell();
        filesCell.className = 'files-cell';
        filesCell.setAttribute('data-index', index);
        if (!item.files) {
            item.files = [];
        }
        filesCell.innerHTML = renderFilesCell(item.files, index);

        const remarkCell = row.insertCell();
        remarkCell.className = 'editable remark-field';
        remarkCell.innerHTML = item.remark ? item.remark.replace(/\n/g, '<br>') : '';
        remarkCell.setAttribute('data-index', index);
        remarkCell.setAttribute('data-field', 'remark');

        row.insertCell().innerHTML = createCheckboxes(item, index);
    });

    addEditableListeners();
    addCheckboxListeners();
    renderStats(scheduleData);
}

async function loadDataFromAPI(silent = false) {
    try {
        if (!silent) {
            showLoading(true);
        }

        const data = await fetchSchedule();
        if (!data || data.length === 0) {
            if (!silent) {
                showLoading(false);
            }
            return false;
        }

        const hasChanges = !scheduleData || JSON.stringify(scheduleData) !== JSON.stringify(data);
        scheduleData = data;

        if (!silent) {
            showLoading(false);
        }

        return silent ? hasChanges : true;
    } catch (error) {
        if (!silent) {
            showLoading(false);
            console.error('加载数据失败:', error);
            showError(`无法连接到服务器，使用本地数据。错误: ${error.message}`);
        }
        return false;
    }
}

export async function updateScheduleItem(index) {
    const item = scheduleData[index];
    if (!item.id) {
        console.error('数据没有 ID，无法更新');
        return false;
    }

    try {
        const updated = await patchScheduleItem(item.id, item);
        scheduleData[index] = updated;
        console.log(`已同步到服务器: 第${item.week}周`);
        return true;
    } catch (error) {
        console.error('更新失败:', error);
        showError('保存失败，请稍后重试');
        return false;
    }
}

function startAutoRefresh(intervalMs = 10000) {
    refreshInterval = setInterval(async () => {
        const hasChanges = await loadDataFromAPI(true);
        if (hasChanges) {
            renderStats(scheduleData);
            console.log('检测到数据变化，已在后台更新数据');
        }
    }, intervalMs);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

async function autoCheckPastDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updates = [];

    scheduleData.forEach((item, index) => {
        if (item.isHoliday) {
            return;
        }

        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);

        if (itemDate >= today) {
            return;
        }

        let needsUpdate = false;
        if (item.T1 && !item.T1_done) {
            item.T1_done = true;
            needsUpdate = true;
        }
        if (item.T2_1 && !item.T2_1_done) {
            item.T2_1_done = true;
            needsUpdate = true;
        }
        if (item.T2_2 && !item.T2_2_done) {
            item.T2_2_done = true;
            needsUpdate = true;
        }
        if (item.T3 && !item.T3_done) {
            item.T3_done = true;
            needsUpdate = true;
        }

        if (needsUpdate) {
            updates.push(index);
        }
    });

    for (const index of updates) {
        await updateScheduleItem(index);
    }
}

async function initApp() {
    const success = await loadDataFromAPI();

    await initMessageBoard({ showError });
    await initDocumentLibrary({
        getScheduleData,
        updateScheduleItem,
        renderSchedule,
        showLoading,
        showError,
        showSuccess
    });
    if (RAG_ENABLED) {
        initRagChat({ openLibraryFilePreview });
    } else {
        document.querySelector('.rag-chat-section').style.display = 'none';
    }

    await autoCheckPastDates();
    renderSchedule();

    if (success) {
        startAutoRefresh(10000);
        window.addEventListener('beforeunload', stopAutoRefresh);
    }
}

document.addEventListener('DOMContentLoaded', initApp);
