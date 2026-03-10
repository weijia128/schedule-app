const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : `http://${window.location.hostname}:3000`;

console.log('API Base URL:', API_BASE_URL);
console.log('Current hostname:', window.location.hostname);

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

export { API_BASE_URL };

export async function fetchSchedule() {
    return requestJson('/schedule');
}

export async function patchScheduleItem(id, payload) {
    return requestJson(`/schedule/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}

export async function fetchMessageBoard() {
    const response = await fetch(`${API_BASE_URL}/messageBoard`);
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

export async function saveMessageBoard(payload) {
    return requestJson('/messageBoard', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}

export async function fetchAllFiles() {
    return requestJson('/files/all');
}

export async function deleteScheduleFile(scheduleId, fileIndex) {
    const response = await fetch(`${API_BASE_URL}/schedule/${scheduleId}/files/${fileIndex}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        throw new Error(`删除失败: ${response.status}`);
    }
    return response.json();
}

export async function fetchScheduleFile(scheduleId, fileIndex) {
    const response = await fetch(`${API_BASE_URL}/schedule/${scheduleId}/files/${fileIndex}`);
    if (!response.ok) {
        throw new Error(`获取文件失败: ${response.status}`);
    }
    return response;
}

export async function uploadScheduleFiles(scheduleId, files, onProgress) {
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });
    formData.append('scheduleId', scheduleId);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', event => {
            if (event.lengthComputable && typeof onProgress === 'function') {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch {
                    reject(new Error('解析响应失败'));
                }
                return;
            }
            reject(new Error(`上传失败: ${xhr.status}`));
        });

        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
        xhr.open('POST', `${API_BASE_URL}/schedule/${scheduleId}/files`);
        xhr.send(formData);
    });
}

export async function fetchRagStatus() {
    return requestJson('/api/rag/status');
}

export async function reindexRag() {
    return requestJson('/api/rag/reindex', {
        method: 'POST'
    });
}

export async function queryRag(query, history, filters) {
    const payload = { query, history };
    if (filters && Object.keys(filters).length > 0) {
        payload.filters = filters;
    }
    return requestJson('/api/rag/query', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}
