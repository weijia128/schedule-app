#!/bin/bash

# 打包脚本 - 用于服务器部署
echo "📦 开始打包项目..."

# 获取当前日期时间作为版本号
VERSION=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="schedule-app-${VERSION}.tar.gz"

# 创建临时目录
TEMP_DIR="schedule-app-deploy"
rm -rf ${TEMP_DIR}
mkdir -p ${TEMP_DIR}

echo "📁 复制必要文件..."

# 复制前端文件
cp schedule.html ${TEMP_DIR}/

# 复制后端文件（排除node_modules和其他不必要的文件）
mkdir -p ${TEMP_DIR}/server
cp server/package.json ${TEMP_DIR}/server/
cp server/package-lock.json ${TEMP_DIR}/server/
cp server/server.js ${TEMP_DIR}/server/
cp server/.gitignore ${TEMP_DIR}/server/

# 复制数据库文件（如果需要保留现有数据）
if [ -f server/db.json ]; then
    echo "📊 包含现有数据库文件"
    cp server/db.json ${TEMP_DIR}/server/
else
    echo "⚠️  未找到db.json，服务器需要创建新的数据库"
fi

# 创建uploads目录（空目录）
mkdir -p ${TEMP_DIR}/server/uploads
echo "# 文件上传目录" > ${TEMP_DIR}/server/uploads/.gitkeep

# 复制启动脚本
cp start-backend.sh ${TEMP_DIR}/
cp start-frontend.sh ${TEMP_DIR}/

# 复制备份和恢复脚本
cp backup.sh ${TEMP_DIR}/
cp restore.sh ${TEMP_DIR}/

# 复制文档文件
cp BACKUP.md ${TEMP_DIR}/
cp LOGS.md ${TEMP_DIR}/
cp crontab.example ${TEMP_DIR}/

# 创建部署说明文档
cat > ${TEMP_DIR}/DEPLOY.md << 'EOF'
# 服务器部署指南

## 📋 项目简介

知识分享排班表系统 - 用于管理团队知识分享活动的Web应用。

**核心功能：**
- 📅 排班管理（人员分配、主题、备注）
- 📁 文件上传/下载（按日期分类存储）
- ✅ 任务完成状态跟踪
- 📝 留言板功能
- 📊 统计分析
- 🔄 自动备份
- 📝 操作日志记录

## 🔧 环境要求

- **Node.js** >= 18.0.0
- **Python** 3.x (用于前端服务器)
- **npm** 或 yarn
- 磁盘空间 >= 1GB (用于文件上传和备份)

## 🚀 快速部署

### 1. 上传文件到服务器

```bash
scp schedule-app-*.tar.gz user@your-server:/path/to/deploy/
```

### 2. 解压文件

```bash
tar -xzf schedule-app-*.tar.gz
cd schedule-app-deploy
```

### 3. 安装依赖

```bash
cd server
npm install --production
cd ..
```

### 4. 启动服务

#### 方式一：使用脚本启动（快速测试）

```bash
# 后台运行后端服务
nohup ./start-backend.sh > backend.log 2>&1 &

# 后台运行前端服务
nohup ./start-frontend.sh > frontend.log 2>&1 &
```

#### 方式二：使用 PM2（生产环境推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动后端
pm2 start server/server.js --name schedule-backend

# 启动前端
pm2 start "python3 -m http.server 8000 --bind 0.0.0.0" --name schedule-frontend

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

### 5. 验证部署

```bash
# 检查服务状态
curl http://localhost:3000/schedule
curl http://localhost:8000/schedule.html

# 或使用 PM2
pm2 status
```

## 🌐 服务访问

部署成功后，通过以下地址访问：

- **前端页面**: `http://your-server:8000/schedule.html`
- **后端 API**: `http://your-server:3000/schedule`

## ⚙️ 配置说明

### 修改后端端口

编辑 `server/server.js` 或设置环境变量：

```bash
export PORT=3000
```

### 修改前端端口

编辑 `start-frontend.sh`，修改端口号：

```bash
python3 -m http.server 8001 --bind 0.0.0.0
```

### 配置 Nginx 反向代理（可选，推荐）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 💾 数据备份（重要！）

系统包含自动备份功能，建议配置定期备份。

### 手动备份

```bash
./backup.sh
```

### 自动定时备份

```bash
# 编辑 crontab
crontab -e

# 添加定时任务（每天凌晨 2 点备份）
0 2 * * * cd /path/to/schedule-app-deploy && ./backup.sh >> backups/backup.log 2>&1
```

详细说明请参阅 `BACKUP.md`

## 📝 操作日志

系统会自动记录以下操作到 `server/operation.log`：

- 修改主题
- 修改备注
- 上传文件
- 删除文件
- 更新留言板

### 查看日志

```bash
# 实时监控
tail -f server/operation.log

# 查看今天的操作
grep "$(date +%Y-%m-%d)" server/operation.log

# 查看文件操作
grep "上传文件\|删除文件" server/operation.log
```

详细说明请参阅 `LOGS.md`

## 📂 目录结构

```
schedule-app-deploy/
├── schedule.html           # 前端页面
├── start-backend.sh        # 后端启动脚本
├── start-frontend.sh       # 前端启动脚本
├── backup.sh              # 备份脚本
├── restore.sh             # 恢复脚本
├── DEPLOY.md              # 部署指南（本文档）
├── BACKUP.md              # 备份说明
├── LOGS.md                # 日志说明
├── crontab.example        # 定时任务示例
└── server/
    ├── server.js          # 后端服务
    ├── db.json            # 数据库文件
    ├── package.json       # 依赖配置
    ├── operation.log      # 操作日志
    └── uploads/           # 文件上传目录（按日期分类）
        ├── 2025-11-28/
        ├── 2025-12-05/
        └── ...
```

## 🎯 功能特性

### 1. 文件管理

- **按日期分类存储**：上传的文件自动按排班日期分类保存
- **上传进度显示**：实时显示上传进度条
- **文件大小限制**：单个文件最大 50MB

### 2. 自动化功能

- **自动过期勾选**：日期过期的任务自动标记为完成
- **自动备份**：可配置定期自动备份数据和文件
- **自动刷新**：数据每 10 秒自动刷新

### 3. 操作记录

- **详细日志**：记录所有编辑操作、文件操作
- **IP 追踪**：记录操作来源 IP 地址
- **时间戳**：精确到毫秒的操作时间

## 🔍 常用命令

```bash
# 查看日志
tail -f backend.log
tail -f server/operation.log

# 停止服务（nohup 方式）
pkill -f "node server.js"
pkill -f "python3 -m http.server"

# 停止服务（PM2 方式）
pm2 stop schedule-backend schedule-frontend
pm2 delete schedule-backend schedule-frontend

# 重启服务
pm2 restart all

# 查看进程
pm2 status
pm2 logs

# 手动备份
./backup.sh

# 恢复备份
./restore.sh
```

## 🛠️ 故障排查

### 端口被占用

```bash
# 查看端口占用
lsof -i :3000
lsof -i :8000

# 杀死占用进程
kill -9 <PID>
```

### 权限问题

```bash
# 给脚本添加执行权限
chmod +x *.sh

# 检查文件权限
ls -la server/db.json
ls -la server/uploads
```

### 无法访问

1. 检查防火墙是否开放端口：
   ```bash
   sudo ufw allow 3000
   sudo ufw allow 8000
   ```

2. 检查服务是否运行：
   ```bash
   ps aux | grep node
   ps aux | grep python
   ```

### Node.js 版本问题

```bash
# 检查版本
node --version

# 如果版本过低，使用 nvm 升级
nvm install 18
nvm use 18
```

## 🔄 更新部署

当有新版本时：

```bash
# 1. 备份当前数据
./backup.sh

# 2. 停止服务
pm2 stop all

# 3. 上传新版本并解压
tar -xzf schedule-app-new-version.tar.gz

# 4. 恢复数据
./restore.sh

# 5. 重启服务
pm2 restart all
```

## 📞 技术支持

遇到问题时：

1. 查看日志文件：`backend.log` 和 `server/operation.log`
2. 检查服务状态：`pm2 status` 或 `ps aux | grep node`
3. 查看文档：`BACKUP.md`、`LOGS.md`

## 📚 相关文档

- **备份指南**：`BACKUP.md`
- **日志说明**：`LOGS.md`
- **定时任务示例**：`crontab.example`

---

**部署完成后记得：**
- ✅ 配置自动备份
- ✅ 设置防火墙规则
- ✅ 配置开机自启
- ✅ 定期查看日志
EOF

# 打包
echo "🗜️  正在压缩..."
tar -czf ${PACKAGE_NAME} ${TEMP_DIR}

# 清理临时目录
rm -rf ${TEMP_DIR}

# 显示结果
echo ""
echo "✅ 打包完成！"
echo "📦 文件名: ${PACKAGE_NAME}"
echo "📏 大小: $(du -h ${PACKAGE_NAME} | cut -f1)"
echo ""
echo "📤 上传到服务器："
echo "   scp ${PACKAGE_NAME} user@server:/path/to/deploy/"
echo ""
echo "🚀 服务器上部署："
echo "   tar -xzf ${PACKAGE_NAME}"
echo "   cd ${TEMP_DIR}"
echo "   cd server && npm install --production && cd .."
echo "   nohup ./start-backend.sh > backend.log 2>&1 &"
echo "   nohup ./start-frontend.sh > frontend.log 2>&1 &"
echo ""
