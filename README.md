# 知识分享排班表系统

> 用于管理团队知识分享活动的 Web 应用系统

## 📋 项目简介

知识分享排班表系统是一个轻量级的 Web 应用，用于管理和追踪团队的知识分享活动。支持排班管理、文件上传、任务追踪、数据备份等功能。

## ✨ 核心功能

- 📅 **排班管理** - 人员分配、主题编辑、备注管理
- 📁 **文件管理** - 上传/下载文件，按日期自动分类存储
- ✅ **任务追踪** - 任务完成状态跟踪，过期自动勾选
- 📊 **统计分析** - 实时统计各成员完成情况
- 📝 **留言板** - 团队留言和公告
- 🔄 **自动备份** - 定期自动备份数据和文件
- 📝 **操作日志** - 记录所有编辑和文件操作

## 🚀 快速开始

### 本地开发

```bash
# 1. 克隆或解压项目
cd schedule-app

# 2. 安装后端依赖
cd server
npm install
cd ..

# 3. 启动后端服务（终端 1）
./start-backend.sh

# 4. 启动前端服务（终端 2）
./start-frontend.sh

# 5. 访问应用
open http://localhost:8000/schedule.html
```

### 服务器部署

```bash
# 1. 打包项目
./pack-for-deploy.sh

# 2. 上传到服务器
scp schedule-app-*.tar.gz user@server:/path/

# 3. 在服务器上解压并部署
# 详见 DEPLOY.md
```

## 📂 项目结构

```
schedule-app/
├── schedule.html           # 前端页面
├── start-backend.sh        # 后端启动脚本
├── start-frontend.sh       # 前端启动脚本
├── pack-for-deploy.sh      # 打包脚本
├── backup.sh              # 备份脚本
├── restore.sh             # 恢复脚本
├── README.md              # 项目说明（本文档）
├── BACKUP.md              # 备份指南
├── LOGS.md                # 日志说明
├── crontab.example        # 定时任务示例
├── backups/               # 备份文件目录
└── server/
    ├── server.js          # Node.js 后端服务
    ├── db.json            # JSON 数据库
    ├── package.json       # 依赖配置
    ├── operation.log      # 操作日志
    └── uploads/           # 文件上传目录
        ├── 2025-11-28/    # 按日期分类
        ├── 2025-12-05/
        └── ...
```

## 🔧 技术栈

### 前端
- HTML5 / CSS3 / JavaScript
- 原生 JavaScript（无框架）
- 响应式设计

### 后端
- Node.js >= 18.0.0
- Express.js (通过 json-server)
- Multer (文件上传)
- lowdb (JSON 数据库)

### 部署
- Python 3.x (前端静态服务器)
- PM2 (进程管理，可选)
- Nginx (反向代理，可选)

## 🎯 功能特性

### 1. 智能排班管理

- **灵活编辑**：双击编辑主题和备注，支持换行
- **实时保存**：编辑内容自动保存到服务器
- **人员分配**：T1（AI/产品工具）、T2（论文/开源项目）、T3（技术主题）
- **假期标记**：支持标记节假日

### 2. 文件管理

- **按日期分类**：上传的文件按排班日期自动分类保存
- **进度显示**：实时显示上传进度条
- **大小限制**：单个文件最大 50MB
- **批量上传**：支持同时上传多个文件
- **直接下载**：点击文件名直接下载

### 3. 自动化功能

- **自动过期勾选**：页面加载时自动勾选过期任务
- **自动刷新**：数据每 10 秒自动刷新
- **自动备份**：可配置 cron 定期自动备份
- **日志轮转**：自动清理旧日志，保留最近 500 条

### 4. 数据安全

- **操作日志**：记录所有编辑和文件操作
- **IP 追踪**：记录操作来源 IP 地址
- **自动备份**：定期备份数据库和上传文件
- **一键恢复**：通过 restore.sh 快速恢复数据

## 📝 使用说明

### 编辑排班

1. **编辑主题**：双击"主题 & 文档链接"单元格
2. **编辑备注**：双击"备注"单元格
3. **换行**：按 `Option+Enter`（Mac）或 `Shift+Enter`（Windows）
4. **保存**：按 `Enter` 或点击其他地方

### 上传文件

1. 点击对应行的"📤 上传"按钮
2. 选择一个或多个文件（最大 50MB）
3. 等待上传完成（显示进度条）
4. 文件自动按日期分类保存

### 查看日志

```bash
# 查看操作日志
tail -f server/operation.log

# 查看今天的操作
grep "$(date +%Y-%m-%d)" server/operation.log

# 查看文件操作
grep "上传文件\|删除文件" server/operation.log
```

### 备份数据

```bash
# 手动备份
./backup.sh

# 自动备份（添加到 crontab）
0 2 * * * cd /path/to/schedule-app && ./backup.sh >> backups/backup.log 2>&1
```

## 🔐 安全建议

1. **使用 Nginx**：配置反向代理和 HTTPS
2. **防火墙规则**：限制端口访问
3. **定期备份**：配置自动备份
4. **查看日志**：定期检查操作日志
5. **IP 白名单**：限制访问来源（可选）

## 📚 文档说明

| 文档 | 说明 |
|------|------|
| **README.md** | 项目总体说明（本文档） |
| **BACKUP.md** | 数据备份与恢复完整指南 |
| **LOGS.md** | 操作日志使用说明 |
| **DEPLOY.md** | 服务器部署详细步骤（打包后生成） |
| **crontab.example** | 定时任务配置示例 |

## 🛠️ 常用命令

```bash
# 开发环境
./start-backend.sh          # 启动后端
./start-frontend.sh         # 启动前端

# 打包部署
./pack-for-deploy.sh        # 生成部署包

# 数据管理
./backup.sh                 # 备份数据
./restore.sh                # 恢复数据

# 查看日志
tail -f backend.log         # 后端日志
tail -f server/operation.log # 操作日志

# PM2 管理（生产环境）
pm2 start server/server.js --name schedule-backend
pm2 status                  # 查看状态
pm2 logs                    # 查看日志
pm2 restart all             # 重启服务
```

## 🔍 故障排查

### 端口被占用

```bash
lsof -i :3000
lsof -i :8000
kill -9 <PID>
```

### 无法访问

1. 检查服务是否运行：`ps aux | grep node`
2. 检查防火墙：`sudo ufw allow 3000`
3. 查看日志：`tail -f backend.log`

### 数据丢失

```bash
# 恢复最近的备份
./restore.sh
```

## 📈 更新日志

### v1.0.0 (当前版本)

- ✅ 基础排班管理功能
- ✅ 文件上传/下载（按日期分类）
- ✅ 上传进度条显示
- ✅ 自动过期任务勾选
- ✅ 操作日志记录
- ✅ 自动备份功能
- ✅ 留言板功能
- ✅ 统计分析

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 技术支持

遇到问题时：

1. 查看相关文档（BACKUP.md、LOGS.md、DEPLOY.md）
2. 检查日志文件
3. 提交 Issue

## 📄 许可证

MIT License

---

**快速链接：**
- [部署指南](DEPLOY.md) - 打包后生成
- [备份说明](BACKUP.md)
- [日志说明](LOGS.md)
- [定时任务示例](crontab.example)
