#!/bin/bash
# ============================================================
# safe-update.sh — 服务器执行，安全更新代码且不丢失已有数据
# 用法: ./safe-update.sh schedule-update-XXXXXXXX_XXXXXX.tar.gz
# ============================================================
set -e

# ---- 参数检查 ----
if [ -z "$1" ]; then
    echo "用法: $0 <更新包.tar.gz>"
    echo "示例: $0 schedule-update-20260318_120000.tar.gz"
    exit 1
fi

PACKAGE="$1"
if [ ! -f "$PACKAGE" ]; then
    echo "错误: 文件不存在 -> $PACKAGE"
    exit 1
fi

cd "$(dirname "$0")"
APP_DIR="$(pwd)"

echo "=============================="
echo "  服务器安全更新"
echo "=============================="
echo "工作目录: $APP_DIR"
echo "更新包:   $PACKAGE"
echo ""

# ============================================================
# 1. 备份
# ============================================================
BACKUP_DIR="backups/pre-update-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp server/db.json "$BACKUP_DIR/db.json"
echo "[1/6] 数据库备份 -> $BACKUP_DIR/db.json"

if [ -d server/uploads ] && [ "$(ls -A server/uploads 2>/dev/null)" ]; then
    cp -r server/uploads "$BACKUP_DIR/uploads"
    echo "      上传文件备份 -> $BACKUP_DIR/uploads/"
fi

if [ -f server/operation.log ]; then
    cp server/operation.log "$BACKUP_DIR/operation.log"
    echo "      操作日志备份 -> $BACKUP_DIR/operation.log"
fi
echo ""

# ============================================================
# 2. 解压更新包（只覆盖代码文件，跳过 db.json 和 uploads）
# ============================================================
TEMP_EXTRACT="__update_tmp__"
rm -rf "$TEMP_EXTRACT"
tar -xzf "$PACKAGE"

# 找到解压后的目录名（schedule-update 或 schedule-update-*）
EXTRACT_DIR=$(find . -maxdepth 1 -type d -name "schedule-update*" | head -1)
if [ -z "$EXTRACT_DIR" ]; then
    echo "错误: 解压后未找到 schedule-update 目录"
    exit 1
fi

echo "[2/6] 解压完成 -> $EXTRACT_DIR"

# 覆盖前端文件
[ -f "$EXTRACT_DIR/schedule.html" ] && cp "$EXTRACT_DIR/schedule.html" .
echo "      schedule.html 已更新"

# 覆盖 js 目录
if [ -d "$EXTRACT_DIR/js" ]; then
    cp "$EXTRACT_DIR/js/"*.js js/
    echo "      js/*.js 已更新"
fi

# 覆盖后端代码（不动 db.json、uploads、node_modules、日志）
[ -f "$EXTRACT_DIR/server/server.js" ] && cp "$EXTRACT_DIR/server/server.js" server/
[ -f "$EXTRACT_DIR/server/package.json" ] && cp "$EXTRACT_DIR/server/package.json" server/
[ -f "$EXTRACT_DIR/server/package-lock.json" ] && cp "$EXTRACT_DIR/server/package-lock.json" server/
echo "      server.js, package.json 已更新"

# 覆盖 RAG 模块
if [ -d "$EXTRACT_DIR/server/rag" ]; then
    mkdir -p server/rag/chunkers server/rag/strategies
    for f in "$EXTRACT_DIR/server/rag/"*.js; do
        [ -f "$f" ] && cp "$f" server/rag/
    done
    for f in "$EXTRACT_DIR/server/rag/chunkers/"*.js; do
        [ -f "$f" ] && cp "$f" server/rag/chunkers/
    done
    for f in "$EXTRACT_DIR/server/rag/strategies/"*.js; do
        [ -f "$f" ] && cp "$f" server/rag/strategies/
    done
    echo "      server/rag/ 已更新"
fi

# 覆盖脚本文件
for f in start-backend.sh start-frontend.sh backup.sh restore.sh; do
    if [ -f "$EXTRACT_DIR/$f" ]; then
        cp "$EXTRACT_DIR/$f" .
        chmod +x "$f"
    fi
done
echo "      脚本文件已更新"

# 清理解压目录
rm -rf "$EXTRACT_DIR"
echo ""

# ============================================================
# 3. 合并数据（只更新排班人员，保留所有运行时数据）
# ============================================================
python3 - <<'PYEOF'
import json

with open('server/db.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

# 6人12周排班循环
cycle = [
    {'T1':'班新博','T2_1':'李佳晟','T2_2':'李燕玲','T3':''},
    {'T1':'解勇宝','T2_1':'龚丽','T2_2':'叶玮佳','T3':'李佳晟'},
    {'T1':'龚丽','T2_1':'李佳晟','T2_2':'叶玮佳','T3':''},
    {'T1':'叶玮佳','T2_1':'解勇宝','T2_2':'李燕玲','T3':'班新博'},
    {'T1':'李燕玲','T2_1':'龚丽','T2_2':'解勇宝','T3':''},
    {'T1':'李佳晟','T2_1':'班新博','T2_2':'叶玮佳','T3':'解勇宝'},
    {'T1':'班新博','T2_1':'李佳晟','T2_2':'龚丽','T3':''},
    {'T1':'解勇宝','T2_1':'叶玮佳','T2_2':'李燕玲','T3':'龚丽'},
    {'T1':'龚丽','T2_1':'李燕玲','T2_2':'班新博','T3':''},
    {'T1':'叶玮佳','T2_1':'解勇宝','T2_2':'班新博','T3':'李燕玲'},
    {'T1':'李燕玲','T2_1':'李佳晟','T2_2':'龚丽','T3':''},
    {'T1':'李佳晟','T2_1':'解勇宝','T2_2':'班新博','T3':'叶玮佳'},
]

changed = 0
for item in db['schedule']:
    if item['week'] >= 17:
        c = cycle[(item['week'] - 17) % 12]
        item['T1'] = c['T1']
        item['T2_1'] = c['T2_1']
        item['T2_2'] = c['T2_2']
        item['T3'] = c['T3']
        changed += 1

if '李燕玲' not in db.get('members', []):
    db['members'].append('李燕玲')

with open('server/db.json', 'w', encoding='utf-8') as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

topics = sum(1 for i in db['schedule'] if i.get('topic'))
files_count = sum(len(i.get('files', [])) for i in db['schedule'])
fb_count = len(db.get('messageBoard', {}).get('feedbacks', []))
has_notice = bool(db.get('messageBoard', {}).get('notice'))

print(f'[3/6] 数据合并完成')
print(f'      排班更新: {changed} 周 (W17+)')
print(f'      成员列表: {db["members"]}')
print(f'      保留主题: {topics} 条')
print(f'      保留文件: {files_count} 个')
print(f'      保留反馈: {fb_count} 条')
print(f'      保留公告: {"有" if has_notice else "无"}')
PYEOF
echo ""

# ============================================================
# 4. 更新依赖
# ============================================================
cd server && npm install --production 2>&1 | tail -1 && cd ..
echo "[4/6] 依赖更新完成"
echo ""

# ============================================================
# 5. 重启后端
# ============================================================
if command -v pm2 &> /dev/null && pm2 list 2>/dev/null | grep -q "schedule-backend"; then
    pm2 restart schedule-backend
    echo "[5/6] PM2 重启完成"
elif command -v systemctl &> /dev/null && systemctl is-active --quiet schedule-backend 2>/dev/null; then
    sudo systemctl restart schedule-backend
    echo "[5/6] systemd 重启完成"
else
    pkill -f "node server.js" 2>/dev/null || true
    sleep 1
    nohup ./start-backend.sh > backend.log 2>&1 &
    echo "[5/6] 后端已重启 (nohup, PID: $!)"
fi
echo ""

# ============================================================
# 6. 验证
# ============================================================
echo "[6/6] 验证结果"
echo "---"

sleep 2

# API 验证
API_RESULT=$(curl -s --max-time 5 http://localhost:3000/schedule 2>/dev/null)
if [ -n "$API_RESULT" ]; then
    RECORD_COUNT=$(echo "$API_RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
    echo "  API:  正常 ($RECORD_COUNT 条记录)"
else
    echo "  API:  暂不可用（后端可能还在启动中，稍后检查: curl http://localhost:3000/schedule）"
fi

# W17 排班验证
python3 -c "
import json
with open('server/db.json') as f:
    db = json.load(f)
w17 = next((i for i in db['schedule'] if i['week'] == 17), None)
if w17:
    ok = w17['T1']=='班新博' and w17['T2_1']=='李佳晟' and w17['T2_2']=='李燕玲'
    status = '正确' if ok else '异常'
    print(f'  W17:  {status} (T1={w17[\"T1\"]}, T2_1={w17[\"T2_1\"]}, T2_2={w17[\"T2_2\"]})')
" 2>/dev/null

echo "---"
echo ""
echo "=============================="
echo "  更新完成！请在浏览器刷新验证"
echo ""
echo "  回滚命令:"
echo "  cp $BACKUP_DIR/db.json server/db.json"
echo "=============================="
