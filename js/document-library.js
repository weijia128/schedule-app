import { API_BASE_URL, deleteScheduleFile, fetchAllFiles, fetchScheduleFile, uploadScheduleFiles } from './api.js';

let allFilesData = [];
let filteredFilesData = [];
let currentPage = 1;
const filesPerPage = 10;
let selectedFiles = new Set();
let currentPreviewFile = null;
let fileListenersAdded = false;

let showLoading = () => {};
let showError = message => console.error(message);
let showSuccess = message => console.log(message);
let getScheduleData = () => [];
let updateScheduleItem = async () => false;
let renderSchedule = () => {};

function getPaginatedFiles() {
    const startIndex = (currentPage - 1) * filesPerPage;
    return filteredFilesData.slice(startIndex, startIndex + filesPerPage);
}

function getTotalPages() {
    return Math.ceil(filteredFilesData.length / filesPerPage);
}

function formatFileSize(bytes) {
    if (bytes === 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, exponent)) * 100) / 100} ${units[exponent]}`;
}

function truncateFileName(fileName, maxLength) {
    if (fileName.length <= maxLength) {
        return fileName;
    }

    const extension = fileName.split('.').pop();
    const nameWithoutExtension = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncatedName = `${nameWithoutExtension.substring(0, maxLength - extension.length - 4)}...`;
    return `${truncatedName}.${extension}`;
}

function getFileIcon(filename) {
    if (!filename) {
        return '📄';
    }

    const ext = filename.toLowerCase().split('.').pop();
    const iconMap = {
        pdf: '📕',
        doc: '📘',
        docx: '📘',
        ppt: '📙',
        pptx: '📙',
        xls: '📗',
        xlsx: '📗',
        txt: '📝',
        md: '📃',
        jpg: '🖼️',
        jpeg: '🖼️',
        png: '🖼️',
        gif: '🖼️',
        zip: '📦',
        rar: '📦',
        mp4: '🎬',
        mp3: '🎵'
    };

    return iconMap[ext] || '📄';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderTextPreview(text) {
    return `
        <div class="text-preview-inline">
            <pre>${escapeHtml(text)}</pre>
        </div>
    `;
}

function renderMarkdownPreview(markdownText) {
    if (!window.marked || typeof window.marked.parse !== 'function' || !window.DOMPurify) {
        return renderTextPreview(markdownText);
    }

    const rawHtml = window.marked.parse(markdownText, { gfm: true, breaks: true });
    const safeHtml = window.DOMPurify.sanitize(rawHtml);
    return `<div class="markdown-preview-inline">${safeHtml}</div>`;
}

function setPreviewShell(file, extraInfo = '') {
    const previewSection = document.getElementById('filePreviewSection');
    const previewContent = document.getElementById('filePreviewContentInline');
    const previewTitle = document.getElementById('previewFileNameInline');
    const previewInfo = document.getElementById('previewFileInfoInline');

    const fileName = file.name || file.filename || '文件';
    const fileSize = file.size ? formatFileSize(file.size) : '';
    const uploadDate = file.uploadDate ? new Date(file.uploadDate).toLocaleString('zh-CN') : '';

    previewTitle.textContent = fileName;
    previewInfo.textContent = `大小: ${fileSize}${uploadDate ? ` | 上传时间: ${uploadDate}` : ''}${extraInfo}`;
    previewContent.innerHTML = '<div class="preview-loading">正在加载预览...</div>';

    previewSection.style.display = 'flex';
    previewSection.style.position = 'fixed';
    previewSection.style.top = '0';
    previewSection.style.left = '0';
    previewSection.style.width = '100vw';
    previewSection.style.height = '100vh';
    previewSection.style.maxHeight = '100vh';
    previewSection.style.zIndex = '10000';
    document.body.style.overflow = 'hidden';

    return previewContent;
}

async function renderPreviewContent(response, file, previewContent) {
    const fileName = file.name || file.filename || '';
    const extension = fileName.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        previewContent.innerHTML = `
            <div class="image-preview-inline">
                <img src="${url}" alt="${fileName}" style="max-width: 100%; height: auto;">
            </div>
        `;
        return;
    }

    if (extension === 'pdf') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        previewContent.innerHTML = `
            <div class="pdf-preview-inline">
                <iframe src="${url}" frameborder="0"></iframe>
            </div>
        `;
        return;
    }

    if (['md', 'markdown'].includes(extension)) {
        const text = await response.text();
        previewContent.innerHTML = renderMarkdownPreview(text);
        return;
    }

    if (['txt', 'json', 'js', 'html', 'css', 'csv'].includes(extension)) {
        const text = await response.text();
        previewContent.innerHTML = renderTextPreview(text);
        return;
    }

    previewContent.innerHTML = `
        <div class="no-preview">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📄</div>
            <p>此文件类型不支持在线预览</p>
            <p style="font-size: 0.9rem; color: var(--text-tertiary); margin-top: 0.5rem;">
                文件类型: ${extension.toUpperCase()}
            </p>
            <button class="file-preview-download-btn" onclick="downloadCurrentFile()" style="margin-top: 1rem;">
                📥 下载文件
            </button>
        </div>
    `;
}

export function renderFilesCell(files, index, uploadingFiles = []) {
    let html = '<div class="files-container">';

    if (files && files.length > 0) {
        html += '<div class="files-list">';
        files.forEach((file, fileIndex) => {
            const fileName = file.name || file.filename || `文件${fileIndex + 1}`;
            const fileSize = file.size ? formatFileSize(file.size) : '';
            html += `
                <div class="file-item">
                    <a href="#" class="file-preview" data-index="${index}" data-file-index="${fileIndex}" title="${fileName}">
                        📎 ${truncateFileName(fileName, 20)}
                    </a>
                    <span class="file-size">${fileSize}</span>
                    <button class="file-delete" data-index="${index}" data-file-index="${fileIndex}" title="删除文件">×</button>
                </div>
            `;
        });
        html += '</div>';
    }

    if (uploadingFiles && uploadingFiles.length > 0) {
        if (!files || files.length === 0) {
            html += '<div class="files-list">';
        }

        uploadingFiles.forEach((uploadingFile, fileIndex) => {
            html += `
                <div class="file-item uploading" id="uploading-file-${index}-${fileIndex}">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="color: var(--accent-primary);">📤</span>
                            <span class="file-download" style="flex: 1; min-width: 0; pointer-events: none;">${truncateFileName(uploadingFile.name, 20)}</span>
                        </div>
                        <div class="file-progress-container">
                            <div class="file-progress-bar">
                                <div class="file-progress-fill" style="width: ${uploadingFile.progress || 0}%"></div>
                            </div>
                            <div class="file-progress-text">${uploadingFile.progress || 0}%</div>
                        </div>
                    </div>
                </div>
            `;
        });

        if (!files || files.length === 0) {
            html += '</div>';
        }
    }

    html += `
        <div class="file-upload-wrapper">
            <input type="file" id="file-input-${index}" class="file-input" data-index="${index}" multiple style="display: none;">
            <button class="file-upload-btn" data-index="${index}" title="上传文件">
                📤 上传
            </button>
        </div>
    `;

    html += '</div>';
    return html;
}

async function loadDocumentLibrary() {
    try {
        const data = await fetchAllFiles();
        allFilesData = data.files || [];
        filteredFilesData = [...allFilesData];
        selectedFiles.clear();
        currentPage = 1;
        renderDocumentLibrary();
    } catch (error) {
        console.error('文档库数据加载失败:', error);
        renderEmptyLibrary();
    }
}

function renderDocumentLibrary() {
    const contentDiv = document.getElementById('documentLibraryContent');
    const totalCountSpan = document.getElementById('totalFilesCount');

    totalCountSpan.textContent = filteredFilesData.length;

    if (filteredFilesData.length === 0) {
        renderEmptyLibrary();
        return;
    }

    const fileList = document.createElement('div');
    fileList.className = 'document-list';

    const paginatedFiles = getPaginatedFiles();
    const startIndex = (currentPage - 1) * filesPerPage;

    paginatedFiles.forEach((file, index) => {
        fileList.appendChild(createFileItem(file, startIndex + index));
    });

    contentDiv.innerHTML = '';
    contentDiv.appendChild(fileList);
    renderPagination();
    updateBatchDownloadButton();
}

function renderPagination() {
    const totalPages = getTotalPages();
    if (totalPages <= 1) {
        return;
    }

    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => goToPage(currentPage - 1);
    paginationDiv.appendChild(prevBtn);

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let page = startPage; page <= endPage; page++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-btn ${page === currentPage ? 'active' : ''}`;
        pageBtn.textContent = page;
        pageBtn.onclick = () => goToPage(page);
        paginationDiv.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => goToPage(currentPage + 1);
    paginationDiv.appendChild(nextBtn);

    const pageInfo = document.createElement('span');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页，共 ${filteredFilesData.length} 个文件`;
    paginationDiv.appendChild(pageInfo);

    document.getElementById('documentLibraryContent').appendChild(paginationDiv);
}

function createFileItem(file, index) {
    const item = document.createElement('div');
    item.className = 'document-item';
    item.style.animationDelay = `${index * 0.05}s`;

    const sizeFormatted = file.size ? formatFileSize(file.size) : '未知大小';
    const uploadDate = file.uploadDate ? new Date(file.uploadDate).toLocaleString('zh-CN') : '未知时间';
    const isSelected = selectedFiles.has(index);

    item.innerHTML = `
        <div class="document-checkbox">
            <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} data-index="${index}">
        </div>
        <div class="document-icon">${getFileIcon(file.name || file.filename)}</div>
        <div class="document-info">
            <div class="document-name">${file.name || file.filename}</div>
            <div class="document-meta">
                <span class="document-meta-item">📅 ${file.scheduleDate || '未知日期'}</span>
                <span class="document-meta-item">📊 第${file.scheduleWeek || '?'}周</span>
                <span class="document-size">🕒 ${uploadDate}</span>
                <span class="document-size">📦 ${sizeFormatted}</span>
            </div>
        </div>
        <div class="document-actions"></div>
    `;

    const previewBtn = document.createElement('button');
    previewBtn.className = 'download-btn';
    previewBtn.innerHTML = '预览';
    previewBtn.title = '打开预览';
    previewBtn.onclick = () => openLibraryFilePreview(file);

    item.querySelector('.document-actions').appendChild(previewBtn);

    const downloadLink = document.createElement('a');
    downloadLink.href = `${API_BASE_URL}${file.downloadUrl}`;
    downloadLink.download = file.name || file.filename;
    downloadLink.style.display = 'none';
    item.appendChild(downloadLink);

    return item;
}

function toggleFileSelection(index, selected) {
    if (selected) {
        selectedFiles.add(index);
    } else {
        selectedFiles.delete(index);
    }
    updateBatchDownloadButton();
}

function getSelectedFiles() {
    const selected = [];
    selectedFiles.forEach(index => {
        if (index < filteredFilesData.length) {
            selected.push(filteredFilesData[index]);
        }
    });
    return selected;
}

function updateBatchDownloadButton() {
    const batchBtn = document.getElementById('batchDownloadBtn');
    if (!batchBtn) {
        return;
    }
    batchBtn.textContent = `📦 批量下载 (${selectedFiles.size})`;
    batchBtn.disabled = selectedFiles.size === 0;
}

function goToPage(page) {
    const totalPages = getTotalPages();
    if (page < 1 || page > totalPages) {
        return;
    }
    currentPage = page;
    renderDocumentLibrary();
}

function renderEmptyLibrary() {
    document.getElementById('documentLibraryContent').innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-text">暂无文件</div>
            <div class="empty-state-subtext">还没有团队分享任何文档</div>
        </div>
    `;
    updateBatchDownloadButton();
}

function filterAndSortFiles(searchTerm, sortOption) {
    filteredFilesData = allFilesData.filter(file => {
        const fileName = (file.name || file.filename || '').toLowerCase();
        return fileName.includes(searchTerm);
    });

    filteredFilesData.sort((a, b) => {
        switch (sortOption) {
            case 'date-desc':
                return new Date(b.uploadDate) - new Date(a.uploadDate);
            case 'date-asc':
                return new Date(a.uploadDate) - new Date(b.uploadDate);
            case 'name-asc':
                return (a.name || a.filename || '').localeCompare(b.name || b.filename || '', 'zh-CN');
            case 'name-desc':
                return (b.name || b.filename || '').localeCompare(a.name || a.filename || '', 'zh-CN');
            default:
                return 0;
        }
    });

    currentPage = 1;
    renderDocumentLibrary();
}

export async function refreshDocumentLibrary() {
    const refreshBtn = document.getElementById('refreshLibraryBtn');
    const originalText = refreshBtn.innerHTML;

    try {
        refreshBtn.classList.add('refreshing');
        refreshBtn.innerHTML = '🔄 刷新中...';
        await loadDocumentLibrary();

        setTimeout(() => {
            refreshBtn.classList.remove('refreshing');
            refreshBtn.innerHTML = originalText;
        }, 1000);
    } catch (error) {
        console.error('文档库刷新失败:', error);
        refreshBtn.classList.remove('refreshing');
        refreshBtn.innerHTML = '❌ 刷新失败';
        setTimeout(() => {
            refreshBtn.innerHTML = originalText;
        }, 2000);
    }
}

export function toggleSelectAll() {
    const paginatedFiles = getPaginatedFiles();
    const startIndex = (currentPage - 1) * filesPerPage;
    const allSelected = paginatedFiles.every((_, index) => selectedFiles.has(startIndex + index));

    paginatedFiles.forEach((_, index) => {
        const fileIndex = startIndex + index;
        if (allSelected) {
            selectedFiles.delete(fileIndex);
        } else {
            selectedFiles.add(fileIndex);
        }
    });

    renderDocumentLibrary();
}

export async function batchDownload() {
    const selected = getSelectedFiles();
    if (selected.length === 0) {
        showError('请先选择要下载的文件');
        return;
    }

    showLoading(true, '正在准备下载...');

    try {
        if (selected.length === 1) {
            const link = document.createElement('a');
            link.href = `${API_BASE_URL}${selected[0].downloadUrl}`;
            link.download = selected[0].name || selected[0].filename;
            link.click();
            showSuccess('开始下载');
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const file of selected) {
            try {
                const link = document.createElement('a');
                link.href = `${API_BASE_URL}${file.downloadUrl}`;
                link.download = file.name || file.filename;
                link.click();
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`下载失败: ${file.name}`, error);
                failCount++;
            }
        }

        if (successCount > 0) {
            showSuccess(`已触发 ${successCount} 个文件的下载`);
        }
        if (failCount > 0) {
            showError(`${failCount} 个文件下载失败`);
        }
    } catch (error) {
        console.error('批量下载失败:', error);
        showError(`批量下载失败: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

export async function openLibraryFilePreview(file) {
    currentPreviewFile = {
        mode: 'library',
        file
    };

    const previewContent = setPreviewShell(
        file,
        file.scheduleDate ? ` | 所属日期: ${file.scheduleDate}` : ''
    );

    try {
        const response = await fetchScheduleFile(file.scheduleId, file.fileIndex);
        await renderPreviewContent(response, file, previewContent);
    } catch (error) {
        previewContent.innerHTML = `<div class="preview-error">预览失败: ${error.message}</div>`;
    }
}

export async function openFilePreview(index, fileIndex) {
    const item = getScheduleData()[index];
    const file = item.files[fileIndex];
    currentPreviewFile = {
        mode: 'schedule',
        index,
        fileIndex,
        file
    };

    const previewContent = setPreviewShell(file);

    try {
        const response = await fetchScheduleFile(item.id || index, fileIndex);
        await renderPreviewContent(response, file, previewContent);
    } catch (error) {
        previewContent.innerHTML = `<div class="preview-error">预览失败: ${error.message}</div>`;
    }
}

export function closeInlineFilePreview() {
    document.getElementById('filePreviewSection').style.display = 'none';
    document.body.style.overflow = 'auto';
    currentPreviewFile = null;
}

async function downloadCurrentLibraryFile() {
    if (!currentPreviewFile || currentPreviewFile.mode !== 'library') {
        return;
    }

    const file = currentPreviewFile.file;
    const link = document.createElement('a');
    link.href = `${API_BASE_URL}/schedule/${file.scheduleId}/files/${file.fileIndex}`;
    link.download = file.name || file.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function handleFileDownload(index, fileIndex) {
    const item = getScheduleData()[index];
    const file = item.files[fileIndex];

    try {
        const response = await fetchScheduleFile(item.id || index, fileIndex);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name || `file_${fileIndex}`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        showSuccess('文件下载成功');
    } catch (error) {
        console.error('文件下载失败:', error);
        showError(`文件下载失败: ${error.message}`);
    }
}

export async function downloadCurrentFile() {
    if (!currentPreviewFile) {
        return;
    }

    if (currentPreviewFile.mode === 'library') {
        await downloadCurrentLibraryFile();
        return;
    }

    await handleFileDownload(currentPreviewFile.index, currentPreviewFile.fileIndex);
}

export async function handleFileUpload(index, files) {
    const scheduleData = getScheduleData();
    const item = scheduleData[index];
    if (!item.files) {
        item.files = [];
    }

    const uploadingFiles = Array.from(files).map(file => ({
        name: file.name,
        progress: 0
    }));

    const filesCell = document.querySelector(`.files-cell[data-index="${index}"]`);
    if (filesCell) {
        filesCell.innerHTML = renderFilesCell(item.files, index, uploadingFiles);
    }

    try {
        const result = await uploadScheduleFiles(item.id || index, files, percent => {
            uploadingFiles.forEach((uploadingFile, fileIndex) => {
                uploadingFile.progress = percent;
                const progressFill = document.querySelector(`#uploading-file-${index}-${fileIndex} .file-progress-fill`);
                const progressText = document.querySelector(`#uploading-file-${index}-${fileIndex} .file-progress-text`);
                if (progressFill) {
                    progressFill.style.width = `${percent}%`;
                }
                if (progressText) {
                    progressText.textContent = `${percent}%`;
                }
            });
        });

        if (result.files) {
            item.files = result.files;
        } else {
            files.forEach(file => {
                item.files.push({
                    name: file.name,
                    size: file.size,
                    uploadDate: new Date().toISOString()
                });
            });
        }

        scheduleData[index] = item;
        await updateScheduleItem(index);

        if (filesCell) {
            filesCell.innerHTML = renderFilesCell(item.files, index);
        }

        await loadDocumentLibrary();
        showSuccess(`成功上传 ${files.length} 个文件`);
    } catch (error) {
        console.error('文件上传失败:', error);
        showError(`文件上传失败: ${error.message}`);
        if (filesCell) {
            filesCell.innerHTML = renderFilesCell(item.files, index);
        }
    }
}

export async function handleFileDelete(index, fileIndex) {
    const scheduleData = getScheduleData();
    const item = scheduleData[index];

    try {
        showLoading(true);
        await deleteScheduleFile(item.id || index, fileIndex);
        item.files.splice(fileIndex, 1);
        scheduleData[index] = item;
        await updateScheduleItem(index);
        renderSchedule();
        await loadDocumentLibrary();
        showSuccess('文件删除成功');
    } catch (error) {
        console.error('文件删除失败:', error);
        showError(`文件删除失败: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function addFileListeners() {
    if (fileListenersAdded) {
        return;
    }

    document.addEventListener('click', event => {
        if (event.target.classList.contains('file-upload-btn') || event.target.closest('.file-upload-btn')) {
            event.preventDefault();
            const button = event.target.classList.contains('file-upload-btn')
                ? event.target
                : event.target.closest('.file-upload-btn');
            document.getElementById(`file-input-${button.getAttribute('data-index')}`)?.click();
        }

        if (event.target.classList.contains('file-delete')) {
            event.preventDefault();
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            const fileIndex = parseInt(event.target.getAttribute('data-file-index'), 10);
            if (confirm('确定要删除这个文件吗？')) {
                handleFileDelete(index, fileIndex);
            }
        }

        if (event.target.classList.contains('file-preview') || event.target.closest('.file-preview')) {
            event.preventDefault();
            const link = event.target.classList.contains('file-preview')
                ? event.target
                : event.target.closest('.file-preview');
            const index = parseInt(link.getAttribute('data-index'), 10);
            const fileIndex = parseInt(link.getAttribute('data-file-index'), 10);
            openFilePreview(index, fileIndex).catch(error => {
                console.error('预览错误:', error);
            });
        }
    });

    document.addEventListener('change', async event => {
        if (!event.target.classList.contains('file-input')) {
            return;
        }

        const index = parseInt(event.target.getAttribute('data-index'), 10);
        const files = Array.from(event.target.files);
        if (files.length > 0) {
            await handleFileUpload(index, files);
            event.target.value = '';
        }
    });

    fileListenersAdded = true;
}

function addDocumentLibraryListeners() {
    const searchInput = document.getElementById('fileSearchInput');
    const sortSelect = document.getElementById('fileSortSelect');
    const refreshBtn = document.getElementById('refreshLibraryBtn');
    const contentDiv = document.getElementById('documentLibraryContent');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const batchDownloadBtn = document.getElementById('batchDownloadBtn');
    const previewCloseBtn = document.getElementById('previewCloseBtn');
    const previewDownloadBtn = document.getElementById('previewDownloadBtn');

    searchInput.addEventListener('input', event => {
        filterAndSortFiles(event.target.value.toLowerCase().trim(), sortSelect.value);
    });

    sortSelect.addEventListener('change', event => {
        filterAndSortFiles(searchInput.value.toLowerCase().trim(), event.target.value);
    });

    refreshBtn.addEventListener('click', refreshDocumentLibrary);
    selectAllCheckbox.addEventListener('change', toggleSelectAll);
    batchDownloadBtn.addEventListener('click', batchDownload);
    previewCloseBtn.addEventListener('click', closeInlineFilePreview);
    previewDownloadBtn.addEventListener('click', downloadCurrentFile);

    contentDiv.addEventListener('change', event => {
        if (!event.target.classList.contains('file-checkbox')) {
            return;
        }
        toggleFileSelection(parseInt(event.target.getAttribute('data-index'), 10), event.target.checked);
    });
}

export async function initDocumentLibrary(options = {}) {
    showLoading = options.showLoading || showLoading;
    showError = options.showError || showError;
    showSuccess = options.showSuccess || showSuccess;
    getScheduleData = options.getScheduleData || getScheduleData;
    updateScheduleItem = options.updateScheduleItem || updateScheduleItem;
    renderSchedule = options.renderSchedule || renderSchedule;

    window.toggleSelectAll = toggleSelectAll;
    window.batchDownload = batchDownload;
    window.downloadCurrentFile = downloadCurrentFile;
    window.downloadCurrentLibraryFile = downloadCurrentLibraryFile;
    window.closeInlineFilePreview = closeInlineFilePreview;

    addDocumentLibraryListeners();
    addFileListeners();
    await loadDocumentLibrary();
}
