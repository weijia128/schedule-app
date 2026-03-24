#!/bin/bash
# ============================================================
# pack-update.sh — 本地执行，打包纯代码更新包（不含 db.json）
# 用法: ./pack-update.sh
# 产出: schedule-update-YYYYMMDD_HHMMSS.tar.gz
# ============================================================
set -e

cd "$(dirname "$0")"

VERSION=$(date +%Y%m%d_%H%M%S)
TEMP_DIR="schedule-update"
PACKAGE_NAME="schedule-update-${VERSION}.tar.gz"

rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR/js" "$TEMP_DIR/server/rag/chunkers" "$TEMP_DIR/server/rag/strategies"

# ---- 前端 ----
cp schedule.html "$TEMP_DIR/"
cp js/*.js "$TEMP_DIR/js/"

# ---- 后端代码（不含 db.json、uploads、node_modules）----
cp server/server.js "$TEMP_DIR/server/"
cp server/package.json "$TEMP_DIR/server/"
cp server/package-lock.json "$TEMP_DIR/server/"
# RAG 模块
for f in server/rag/*.js; do
    [ -f "$f" ] && cp "$f" "$TEMP_DIR/server/rag/"
done
for f in server/rag/chunkers/*.js; do
    [ -f "$f" ] && cp "$f" "$TEMP_DIR/server/rag/chunkers/"
done
for f in server/rag/strategies/*.js; do
    [ -f "$f" ] && cp "$f" "$TEMP_DIR/server/rag/strategies/"
done

# ---- 脚本 & 文档 ----
for f in start-backend.sh start-frontend.sh backup.sh restore.sh safe-update.sh; do
    [ -f "$f" ] && cp "$f" "$TEMP_DIR/"
done

# ---- 数据合并脚本（嵌入到更新包中）----
cp safe-update.sh "$TEMP_DIR/" 2>/dev/null || true

# ---- 打包 ----
tar -czf "$PACKAGE_NAME" "$TEMP_DIR"
rm -rf "$TEMP_DIR"

echo "打包完成: $PACKAGE_NAME ($(du -h "$PACKAGE_NAME" | cut -f1))"
echo ""
echo "使用方式:"
echo "  1. scp $PACKAGE_NAME user@server:/path/to/app/"
echo "  2. ssh 登录服务器"
echo "  3. cd /path/to/app && ./safe-update.sh $PACKAGE_NAME"
