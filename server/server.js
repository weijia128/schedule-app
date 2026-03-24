const path = require('path');
const fs = require('fs');

// ── 最优先：从 .env 加载配置（若已设置环境变量则不覆盖）──────────────────────
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    // Strip optional surrounding quotes from value
    const val = line.slice(eqIdx + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
  console.log('[env] Loaded .env from', envPath);
})();

const jsonServer = require('json-server');
const cors = require('cors');
const multer = require('multer');
const express = require('express');
const server = jsonServer.create();
const DB_PATH = path.join(__dirname, 'db.json');
const router = jsonServer.router(DB_PATH);
const middlewares = jsonServer.defaults();

// RAG 模块
const ragRouter = require('./rag/router');
const { indexSingleFile, removeFromIndex } = require('./rag/indexer');

const PORT = process.env.PORT || 3000;
const UPLOAD_SYNC_INTERVAL_MS = Math.max(parseInt(process.env.UPLOAD_SYNC_INTERVAL_MS || '5000', 10), 2000);

// 确保uploads目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

let uploadSyncInProgress = false;
let uploadSyncPending = false;
const unmatchedUploadFolders = new Set();

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.txt': 'text/plain',
    '.text': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.js': 'application/javascript'
  };

  return mimeMap[ext] || 'application/octet-stream';
}

function normalizeRelativePath(filePath) {
  return path.relative(__dirname, filePath).split(path.sep).join('/');
}

function isScheduleUploadFolderName(folderName) {
  return /^\d{4}-\d{2}-\d{2}$/.test(folderName) || /^schedule_\d+$/.test(folderName);
}

function resolveScheduleForFolder(schedules, folderName) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(folderName)) {
    return schedules.find(schedule => schedule.date === folderName) || null;
  }

  const scheduleMatch = /^schedule_(\d+)$/.exec(folderName);
  if (!scheduleMatch) {
    return null;
  }

  return schedules.find(schedule => schedule.id === parseInt(scheduleMatch[1], 10)) || null;
}

function buildDbFileKey(scheduleId, file) {
  const relativePath = file.relativePath
    ? file.relativePath.split(path.sep).join('/')
    : (file.path ? normalizeRelativePath(file.path) : '');
  const fallbackName = file.name || file.filename || '';
  return `${scheduleId}::${relativePath || fallbackName}`;
}

function createDiskFileRecord(schedule, filePath, fileStats) {
  const filename = path.basename(filePath);
  return {
    scheduleId: schedule.id,
    date: schedule.date || path.basename(path.dirname(filePath)),
    week: schedule.week,
    name: filename,
    filename,
    size: fileStats.size,
    path: filePath,
    relativePath: normalizeRelativePath(filePath),
    uploadDate: new Date(fileStats.mtimeMs).toISOString(),
    mimetype: guessMimeType(filename),
    syncSourceMtimeMs: fileStats.mtimeMs
  };
}

async function syncUploadsDirectoryOnce(trigger = 'interval') {
  const db = router.db;
  const schedules = db.get('schedule').value() || [];
  const diskFilesBySchedule = new Map();
  const activeUnmatchedFolders = new Set();

  if (fs.existsSync(uploadsDir)) {
    const folderNames = fs.readdirSync(uploadsDir);
    for (const folderName of folderNames) {
      const folderPath = path.join(uploadsDir, folderName);
      if (!fs.statSync(folderPath).isDirectory()) {
        continue;
      }

      if (!isScheduleUploadFolderName(folderName)) {
        continue;
      }

      const schedule = resolveScheduleForFolder(schedules, folderName);
      if (!schedule) {
        activeUnmatchedFolders.add(folderName);
        if (!unmatchedUploadFolders.has(folderName)) {
          unmatchedUploadFolders.add(folderName);
          console.warn(`[uploads-sync] 跳过未找到排班记录的目录: ${folderName}`);
        }
        continue;
      }

      const files = fs.readdirSync(folderPath);
      const fileMap = diskFilesBySchedule.get(schedule.id) || new Map();

      for (const filename of files) {
        const filePath = path.join(folderPath, filename);
        const fileStats = fs.statSync(filePath);
        if (!fileStats.isFile()) {
          continue;
        }

        const diskFile = createDiskFileRecord(schedule, filePath, fileStats);
        fileMap.set(buildDbFileKey(schedule.id, diskFile), diskFile);
      }

      diskFilesBySchedule.set(schedule.id, fileMap);
    }
  }

  for (const folderName of Array.from(unmatchedUploadFolders)) {
    if (!activeUnmatchedFolders.has(folderName)) {
      unmatchedUploadFolders.delete(folderName);
    }
  }

  let addedCount = 0;
  let updatedCount = 0;
  let removedCount = 0;
  let schedulesChanged = false;
  const indexTasks = [];

  for (const schedule of schedules) {
    const currentFiles = Array.isArray(schedule.files) ? schedule.files : [];
    const diskMap = new Map(diskFilesBySchedule.get(schedule.id) || []);
    const nextFiles = [];
    let scheduleChanged = false;

    for (const currentFile of currentFiles) {
      const fileKey = buildDbFileKey(schedule.id, currentFile);
      const diskFile = diskMap.get(fileKey);

      if (!diskFile) {
        removedCount++;
        scheduleChanged = true;
        removeFromIndex(schedule.date || `schedule_${schedule.id}`, currentFile.name || currentFile.filename);
        continue;
      }

      const syncedFile = {
        ...currentFile,
        name: currentFile.name || currentFile.filename || diskFile.name,
        filename: diskFile.filename,
        size: diskFile.size,
        path: diskFile.path,
        relativePath: diskFile.relativePath,
        uploadDate: currentFile.uploadDate || diskFile.uploadDate,
        mimetype: diskFile.mimetype,
        syncSourceMtimeMs: diskFile.syncSourceMtimeMs
      };

      const metadataChanged =
        currentFile.filename !== syncedFile.filename ||
        currentFile.size !== syncedFile.size ||
        currentFile.path !== syncedFile.path ||
        currentFile.relativePath !== syncedFile.relativePath ||
        currentFile.mimetype !== syncedFile.mimetype ||
        currentFile.syncSourceMtimeMs !== syncedFile.syncSourceMtimeMs;

      const contentChanged =
        currentFile.size !== diskFile.size ||
        currentFile.relativePath !== diskFile.relativePath ||
        currentFile.path !== diskFile.path ||
        (currentFile.syncSourceMtimeMs != null && currentFile.syncSourceMtimeMs !== diskFile.syncSourceMtimeMs);

      if (metadataChanged) {
        updatedCount++;
        scheduleChanged = true;
      }

      if (contentChanged) {
        indexTasks.push(
          indexSingleFile(diskFile.path, {
            date: schedule.date || `schedule_${schedule.id}`,
            week: schedule.week,
            scheduleId: schedule.id,
            filename: diskFile.name,
            mimetype: diskFile.mimetype
          })
        );
      }

      nextFiles.push(syncedFile);
      diskMap.delete(fileKey);
    }

    for (const diskFile of diskMap.values()) {
      addedCount++;
      scheduleChanged = true;
      nextFiles.push({
        name: diskFile.name,
        filename: diskFile.filename,
        size: diskFile.size,
        path: diskFile.path,
        relativePath: diskFile.relativePath,
        uploadDate: diskFile.uploadDate,
        mimetype: diskFile.mimetype,
        syncSourceMtimeMs: diskFile.syncSourceMtimeMs
      });

      indexTasks.push(
        indexSingleFile(diskFile.path, {
          date: schedule.date || `schedule_${schedule.id}`,
          week: schedule.week,
          scheduleId: schedule.id,
          filename: diskFile.name,
          mimetype: diskFile.mimetype
        })
      );
    }

    if (scheduleChanged) {
      schedule.files = nextFiles;
      schedule.updatedAt = new Date().toISOString();
      schedulesChanged = true;
    }
  }

  if (schedulesChanged) {
    db.set('schedule', schedules).write();
  }

  const indexResults = await Promise.allSettled(indexTasks);
  const indexedFiles = indexResults.reduce((count, result) => {
    if (result.status !== 'fulfilled') {
      return count;
    }
    return count + (result.value > 0 ? 1 : 0);
  }, 0);

  if (addedCount > 0 || updatedCount > 0 || removedCount > 0) {
    console.log(
      `[uploads-sync] ${trigger}: 新增 ${addedCount}，更新 ${updatedCount}，删除 ${removedCount}，触发索引 ${indexedFiles}`
    );
  }

  return {
    addedCount,
    updatedCount,
    removedCount,
    indexedFiles
  };
}

async function syncUploadsDirectory(trigger = 'interval') {
  if (uploadSyncInProgress) {
    uploadSyncPending = true;
    return { skipped: true };
  }

  uploadSyncInProgress = true;
  let lastResult = { addedCount: 0, updatedCount: 0, removedCount: 0, indexedFiles: 0 };
  let nextTrigger = trigger;

  try {
    do {
      uploadSyncPending = false;
      lastResult = await syncUploadsDirectoryOnce(nextTrigger);
      nextTrigger = 'pending';
    } while (uploadSyncPending);
  } catch (error) {
    console.error('[uploads-sync] 同步失败:', error);
  } finally {
    uploadSyncInProgress = false;
  }

  return lastResult;
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 根据scheduleId获取日期，按日期创建文件夹
    const scheduleId = req.params.id || req.body.scheduleId || 'default';

    // 从数据库读取对应的日期
    const db = router.db;
    const schedule = db.get('schedule').find({ id: parseInt(scheduleId) }).value();

    let folderName = 'unknown';
    if (schedule && schedule.date) {
      // 使用日期作为文件夹名，例如: 2025-12-19
      folderName = schedule.date;
    } else {
      // 如果找不到日期，使用scheduleId
      folderName = `schedule_${scheduleId}`;
    }

    const scheduleDir = path.join(uploadsDir, folderName);

    if (!fs.existsSync(scheduleDir)) {
      fs.mkdirSync(scheduleDir, { recursive: true });
    }
    cb(null, scheduleDir);
  },
  filename: function (req, file, cb) {
    // 直接使用原始文件名
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, originalName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 限制50MB
  }
});

// 启用 CORS - 允许所有来源
server.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// 使用默认中间件（logger、static、cors、no-cache）
server.use(middlewares);

// 静态文件服务 - 使uploads文件夹可访问
server.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 添加自定义路由（可选）
server.use(jsonServer.bodyParser);

// ==================== RAG 路由 ====================
// 将 db 引用挂载到 app，供 ragRouter 使用
server.set('ragDb', router.db);
server.use('/api/rag', ragRouter);

// ==================== 文件上传路由 ====================
// POST /schedule/:id/files - 上传文件
server.post('/schedule/:id/files', upload.array('files', 10), (req, res) => {
  const scheduleId = req.params.id;

  try {
    // 读取当前数据库
    const db = router.db;
    const schedule = db.get('schedule').find({ id: parseInt(scheduleId) }).value();

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // 初始化files数组
    if (!schedule.files) {
      schedule.files = [];
    }

    // 添加上传的文件信息
    const uploadedFiles = req.files.map(file => ({
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      filename: file.filename,
      size: file.size,
      path: file.path,
      relativePath: path.relative(__dirname, file.path),
      uploadDate: new Date().toISOString(),
      mimetype: file.mimetype
    }));

    schedule.files = [...schedule.files, ...uploadedFiles];

    // 更新数据库
    db.get('schedule')
      .find({ id: parseInt(scheduleId) })
      .assign({ files: schedule.files, updatedAt: new Date().toISOString() })
      .write();

    // 记录文件上传日志
    recordLog(req, '上传文件', {
      scheduleId,
      week: schedule.week,
      date: schedule.date,
      fileCount: uploadedFiles.length,
      fileNames: uploadedFiles.map(f => f.name),
      totalSize: uploadedFiles.reduce((sum, f) => sum + f.size, 0),
      sizeFormatted: formatBytes(uploadedFiles.reduce((sum, f) => sum + f.size, 0))
    });

    console.log(`📤 Uploaded ${uploadedFiles.length} file(s) for schedule ${scheduleId}`);
    res.json({
      success: true,
      files: schedule.files,
      uploaded: uploadedFiles.length
    });

    // 异步增量索引新上传的文件（不阻塞响应）
    const uploadDate = schedule.date || `schedule_${scheduleId}`;
    for (const file of uploadedFiles) {
      const meta = {
        date: uploadDate,
        week: schedule.week,
        scheduleId: parseInt(scheduleId),
        filename: file.name,
        mimetype: file.mimetype
      };
      indexSingleFile(file.path, meta).then(chunks => {
        if (chunks > 0) console.log(`[RAG] Indexed ${file.name}: ${chunks} chunks`);
      }).catch(err => {
        console.warn('[RAG] Incremental index failed for', file.name, ':', err.message);
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed', message: error.message });
  }
});

// ==================== 文件下载路由 ====================
// GET /schedule/:id/files/:fileIndex - 下载文件
server.get('/schedule/:id/files/:fileIndex', (req, res) => {
  const scheduleId = req.params.id;
  const fileIndex = parseInt(req.params.fileIndex);

  try {
    const db = router.db;
    const schedule = db.get('schedule').find({ id: parseInt(scheduleId) }).value();

    if (!schedule || !schedule.files || !schedule.files[fileIndex]) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = schedule.files[fileIndex];
    const filePath = path.join(__dirname, file.relativePath || file.path);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // 发送文件
    res.download(filePath, file.name, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      } else {
        console.log(`📥 Downloaded file: ${file.name} for schedule ${scheduleId}`);
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed', message: error.message });
  }
});

// ==================== 文件删除路由 ====================
// DELETE /schedule/:id/files/:fileIndex - 删除文件
server.delete('/schedule/:id/files/:fileIndex', (req, res) => {
  const scheduleId = req.params.id;
  const fileIndex = parseInt(req.params.fileIndex);

  try {
    const db = router.db;
    const schedule = db.get('schedule').find({ id: parseInt(scheduleId) }).value();

    if (!schedule || !schedule.files || !schedule.files[fileIndex]) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = schedule.files[fileIndex];
    const filePath = path.join(__dirname, file.relativePath || file.path);

    // 记录文件删除日志（在实际删除之前）
    recordLog(req, '删除文件', {
      scheduleId,
      week: schedule.week,
      date: schedule.date,
      fileName: file.name,
      fileSize: file.size,
      sizeFormatted: formatBytes(file.size || 0)
    });

    // 从磁盘删除文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Deleted file: ${file.name} from disk`);
    }

    // 从数据库删除文件记录
    schedule.files.splice(fileIndex, 1);

    db.get('schedule')
      .find({ id: parseInt(scheduleId) })
      .assign({ files: schedule.files, updatedAt: new Date().toISOString() })
      .write();

    console.log(`🗑️  Removed file record for schedule ${scheduleId}`);
    res.json({
      success: true,
      message: 'File deleted successfully',
      remainingFiles: schedule.files.length
    });

    // 从 RAG 索引中移除已删除文件的条目
    const deleteDate = schedule.date || `schedule_${scheduleId}`;
    removeFromIndex(deleteDate, file.name);
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'File deletion failed', message: error.message });
  }
});

// ==================== 获取单个schedule的文件列表 ====================
// GET /schedule/:id/files - 获取文件列表
server.get('/schedule/:id/files', (req, res) => {
  const scheduleId = req.params.id;

  try {
    const db = router.db;
    const schedule = db.get('schedule').find({ id: parseInt(scheduleId) }).value();

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({
      files: schedule.files || [],
      count: (schedule.files || []).length
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files', message: error.message });
  }
});

// ==================== 获取所有文件列表 ====================
// GET /files/all - 获取所有上传的文件
server.get('/files/all', (req, res) => {
  try {
    const db = router.db;
    const schedules = db.get('schedule').value();

    // 收集所有文件信息
    const allFiles = [];
    schedules.forEach(schedule => {
      if (schedule.files && schedule.files.length > 0) {
        schedule.files.forEach((file, index) => {
          allFiles.push({
            ...file,
            scheduleId: schedule.id,
            scheduleWeek: schedule.week,
            scheduleDate: schedule.date,
            fileIndex: index,
            downloadUrl: `/schedule/${schedule.id}/files/${index}`
          });
        });
      }
    });

    // 按上传时间倒序排列
    allFiles.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    res.json({
      files: allFiles,
      total: allFiles.length
    });
  } catch (error) {
    console.error('Get all files error:', error);
    res.status(500).json({ error: 'Failed to get all files', message: error.message });
  }
});

// ==================== 留言板路由 ====================
// GET /messageBoard - 获取留言板数据
server.get('/messageBoard', (req, res) => {
  try {
    const db = router.db;
    const messageBoard = db.get('messageBoard').value();

    if (!messageBoard) {
      // 如果不存在，返回默认值（新格式包含 feedbacks 数组）
      return res.json({ feedbacks: [], notice: '' });
    }

    // 兼容旧格式：如果没有 feedbacks 字段，添加空数组
    if (!messageBoard.feedbacks) {
      messageBoard.feedbacks = [];
    }

    res.json(messageBoard);
  } catch (error) {
    console.error('Get messageBoard error:', error);
    res.status(500).json({ error: 'Failed to get messageBoard', message: error.message });
  }
});

// PUT /messageBoard - 更新留言板数据
server.put('/messageBoard', (req, res) => {
  try {
    const db = router.db;
    const newData = {
      feedbacks: req.body.feedbacks || [],
      notice: req.body.notice || '',
      updatedAt: new Date().toISOString()
    };

    // 更新或创建留言板数据
    db.set('messageBoard', newData).write();

    console.log('📝 Updated messageBoard');
    res.json(newData);
  } catch (error) {
    console.error('Update messageBoard error:', error);
    res.status(500).json({ error: 'Failed to update messageBoard', message: error.message });
  }
});

// ==================== 访问和编辑记录功能 ====================

const logFilePath = path.join(__dirname, 'operation.log');

// 辅助函数：格式化文件大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// 记录操作日志到文件
function recordLog(req, action, details = {}) {
  try {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'Unknown';

    const logEntry = {
      timestamp,
      ip,
      userAgent: userAgent.substring(0, 100), // 截取前100字符
      action,
      ...details
    };

    // 格式化日志行
    const logLine = `[${timestamp}] [${ip}] ${action} - ${JSON.stringify(details)}\n`;

    // 写入文件（追加模式）
    fs.appendFileSync(logFilePath, logLine, 'utf8');

    console.log(`📝 [${timestamp}] ${ip} - ${action}`);
  } catch (error) {
    console.error('Failed to record log:', error);
  }
}

// 分析修改的字段，确定操作类型（仅记录可编辑内容）
function analyzeModification(modifiedFields, data, oldData) {
  const operations = [];

  // 主题
  if (modifiedFields.includes('topic')) {
    operations.push({
      type: '修改主题',
      oldValue: oldData?.topic || '',
      newValue: data.topic || ''
    });
  }

  // 备注
  if (modifiedFields.includes('remark')) {
    operations.push({
      type: '修改备注',
      oldValue: oldData?.remark || '',
      newValue: data.remark || ''
    });
  }

  return operations;
}

// 监听所有 schedule 修改操作
server.use('/schedule/:id', (req, res, next) => {
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const scheduleId = req.params.id;
    const modifiedFields = Object.keys(req.body).filter(f => f !== 'updatedAt');

    try {
      const db = router.db;
      const oldData = db.get('schedule').find({ id: parseInt(scheduleId) }).value();

      // 分析修改了什么
      const operations = analyzeModification(modifiedFields, req.body, oldData);

      // 记录每个操作
      operations.forEach(op => {
        recordLog(req, op.type, {
          scheduleId,
          week: oldData?.week,
          date: oldData?.date,
          ...op
        });
      });
    } catch (error) {
      console.error('Failed to analyze modification:', error);
    }
  }
  next();
});

// 监听留言板修改
server.use('/messageBoard', (req, res, next) => {
  if (req.method === 'PUT') {
    try {
      const db = router.db;
      const oldData = db.get('messageBoard').value() || {};

      const changes = [];
      // 检查 feedbacks 变化
      if (req.body.feedbacks !== undefined) {
        const oldFeedbacksCount = (oldData.feedbacks || []).length;
        const newFeedbacksCount = (req.body.feedbacks || []).length;
        if (oldFeedbacksCount !== newFeedbacksCount ||
            JSON.stringify(oldData.feedbacks) !== JSON.stringify(req.body.feedbacks)) {
          changes.push('问题反馈');
        }
      }
      if (req.body.notice !== undefined && req.body.notice !== oldData.notice) {
        changes.push('公告');
      }

      if (changes.length > 0) {
        recordLog(req, `更新留言板（${changes.join('、')}）`, {
          changes,
          feedbacksCount: (req.body.feedbacks || []).length,
          noticeLength: req.body.notice?.length || 0
        });
      }
    } catch (error) {
      console.error('Failed to log message board update:', error);
    }
  }
  next();
});

// // ==================== 数据验证和安全中间件 ====================

// // 操作日志记录
// function logOperation(req, action, details = {}) {
//   const timestamp = new Date().toISOString();
//   const ip = req.ip || req.connection.remoteAddress;
//   const userAgent = req.get('user-agent') || 'Unknown';

//   const logEntry = {
//     timestamp,
//     ip,
//     userAgent,
//     action,
//     method: req.method,
//     path: req.path,
//     ...details
//   };

//   console.log(`[${timestamp}] [${ip}] ${action} - ${JSON.stringify(details)}`);

//   // 可选：写入日志文件
//   // fs.appendFileSync('operation.log', JSON.stringify(logEntry) + '\n');
// }

// // 验证 schedule 数据的中间件
// function validateScheduleData(req, res, next) {
//   if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
//     const data = req.body;

//     // 允许的字段白名单
//     const allowedFields = [
//       'id', 'week', 'date', 'T1', 'T2_1', 'T2_2', 'T3',
//       'topic', 'remark', 'location', 'time', 'isHoliday',
//       'T1_done', 'T2_1_done', 'T2_2_done', 'T3_done',
//       'files', 'updatedAt'
//     ];

//     // 移除不在白名单中的字段
//     Object.keys(data).forEach(key => {
//       if (!allowedFields.includes(key)) {
//         delete data[key];
//         console.warn(`⚠️  Removed unauthorized field: ${key}`);
//       }
//     });

//     // 验证必填字段（仅对 POST 请求）
//     if (req.method === 'POST') {
//       const requiredFields = ['week', 'date'];
//       const missingFields = requiredFields.filter(field => !data[field]);

//       if (missingFields.length > 0) {
//         return res.status(400).json({
//           error: 'Validation failed',
//           message: `Missing required fields: ${missingFields.join(', ')}`
//         });
//       }
//     }

//     // 验证数据类型和格式
//     if (data.week !== undefined) {
//       if (!Number.isInteger(data.week) || data.week < 1 || data.week > 100) {
//         return res.status(400).json({
//           error: 'Validation failed',
//           message: 'Week must be an integer between 1 and 100'
//         });
//       }
//     }

//     // 验证日期格式
//     if (data.date !== undefined) {
//       const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
//       if (!dateRegex.test(data.date)) {
//         return res.status(400).json({
//           error: 'Validation failed',
//           message: 'Date must be in YYYY-MM-DD format'
//         });
//       }
//     }

//     // 验证人员名称（只允许特定的团队成员）
//     const validMembers = ['班新博', '龚丽', '李佳晟', '解勇宝', '叶玮佳', ''];
//     const personFields = ['T1', 'T2_1', 'T2_2', 'T3'];

//     for (const field of personFields) {
//       if (data[field] !== undefined && !validMembers.includes(data[field])) {
//         return res.status(400).json({
//           error: 'Validation failed',
//           message: `Invalid member name in ${field}: ${data[field]}`
//         });
//       }
//     }

//     // 验证布尔值字段
//     const booleanFields = ['isHoliday', 'T1_done', 'T2_1_done', 'T2_2_done', 'T3_done'];
//     for (const field of booleanFields) {
//       if (data[field] !== undefined && typeof data[field] !== 'boolean') {
//         return res.status(400).json({
//           error: 'Validation failed',
//           message: `${field} must be a boolean value`
//         });
//       }
//     }

//     // 限制文本字段长度
//     const textFields = {
//       topic: 2000,
//       remark: 1000,
//       location: 50,
//       time: 50
//     };

//     for (const [field, maxLength] of Object.entries(textFields)) {
//       if (data[field] && typeof data[field] === 'string' && data[field].length > maxLength) {
//         return res.status(400).json({
//           error: 'Validation failed',
//           message: `${field} exceeds maximum length of ${maxLength} characters`
//         });
//       }
//     }

//     // 记录操作日志
//     logOperation(req, 'Schedule Data Modification', {
//       id: data.id,
//       week: data.week,
//       modifiedFields: Object.keys(data)
//     });
//   }

//   next();
// }

// // 验证留言板数据
// function validateMessageBoardData(req, res, next) {
//   if (req.method === 'PUT' && req.path === '/messageBoard') {
//     const data = req.body;

//     // 限制字段
//     const allowedFields = ['message', 'notice'];
//     Object.keys(data).forEach(key => {
//       if (!allowedFields.includes(key)) {
//         delete data[key];
//       }
//     });

//     // 限制长度
//     if (data.message && data.message.length > 5000) {
//       return res.status(400).json({
//         error: 'Validation failed',
//         message: 'Message exceeds maximum length of 5000 characters'
//       });
//     }

//     if (data.notice && data.notice.length > 5000) {
//       return res.status(400).json({
//         error: 'Validation failed',
//         message: 'Notice exceeds maximum length of 5000 characters'
//       });
//     }

//     logOperation(req, 'MessageBoard Update', {
//       messageLength: data.message?.length || 0,
//       noticeLength: data.notice?.length || 0
//     });
//   }

//   next();
// }

// // 应用验证中间件
// server.use('/schedule', validateScheduleData);
// server.use('/messageBoard', validateMessageBoardData);

// 可以添加自定义逻辑
server.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    req.body.updatedAt = new Date().toISOString();
  }
  next();
});

// 使用默认路由
server.use(router);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 JSON Server is running on port ${PORT}`);
  console.log(`📊 Resources: http://localhost:${PORT}/schedule`);
  console.log(`📊 Statistics: http://localhost:${PORT}/statistics`);
  console.log(`📁 File uploads: http://localhost:${PORT}/schedule/:id/files`);
  console.log(`📂 Uploads directory: ${uploadsDir}`);
  console.log(`🔄 Upload sync interval: ${UPLOAD_SYNC_INTERVAL_MS}ms`);

  syncUploadsDirectory('startup').catch(error => {
    console.error('[uploads-sync] 启动同步失败:', error);
  });

  setInterval(() => {
    syncUploadsDirectory('interval').catch(error => {
      console.error('[uploads-sync] 定时同步失败:', error);
    });
  }, UPLOAD_SYNC_INTERVAL_MS);
});
