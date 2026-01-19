#!/bin/bash

# =============================================================================
# 自动备份脚本 - 用于备份 db.json 和 uploads 文件夹
# =============================================================================

# 配置项
BACKUP_DIR="backups"                    # 备份目录
SERVER_DIR="server"                     # 服务器目录
KEEP_BACKUPS=30                         # 保留最近30个备份
DATE=$(date +%Y%m%d_%H%M%S)            # 时间戳
BACKUP_NAME="backup_${DATE}.tar.gz"     # 备份文件名

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 检查必要的文件和目录是否存在
check_prerequisites() {
    if [ ! -d "$SERVER_DIR" ]; then
        log_error "服务器目录不存在: $SERVER_DIR"
        exit 1
    fi

    if [ ! -f "$SERVER_DIR/db.json" ]; then
        log_warn "数据库文件不存在: $SERVER_DIR/db.json"
    fi

    if [ ! -d "$SERVER_DIR/uploads" ]; then
        log_warn "上传目录不存在: $SERVER_DIR/uploads"
    fi
}

# 创建备份目录
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_info "创建备份目录: $BACKUP_DIR"
    fi
}

# 执行备份
perform_backup() {
    log_info "开始备份..."

    # 获取脚本所在目录的绝对路径
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    BACKUP_DIR_FULL="$SCRIPT_DIR/$BACKUP_DIR"

    # 创建临时目录
    TEMP_DIR=$(mktemp -d)
    log_info "临时目录: $TEMP_DIR"

    # 复制文件到临时目录
    if [ -f "$SERVER_DIR/db.json" ]; then
        cp "$SERVER_DIR/db.json" "$TEMP_DIR/"
        log_info "已复制 db.json"
    fi

    if [ -d "$SERVER_DIR/uploads" ]; then
        cp -r "$SERVER_DIR/uploads" "$TEMP_DIR/"
        log_info "已复制 uploads 目录"
    fi

    # 创建备份信息文件
    cat > "$TEMP_DIR/backup_info.txt" << EOF
备份时间: $(date '+%Y-%m-%d %H:%M:%S')
备份内容:
  - db.json (数据库文件)
  - uploads/ (上传文件目录)

数据统计:
  - db.json 大小: $(du -h "$SERVER_DIR/db.json" 2>/dev/null | cut -f1 || echo "N/A")
  - uploads 大小: $(du -sh "$SERVER_DIR/uploads" 2>/dev/null | cut -f1 || echo "N/A")
  - uploads 文件数: $(find "$SERVER_DIR/uploads" -type f 2>/dev/null | wc -l || echo "N/A")
EOF

    # 压缩备份
    log_info "正在压缩备份文件..."
    cd "$TEMP_DIR" || exit 1
    tar -czf "$BACKUP_NAME" ./*
    mv "$BACKUP_NAME" "$BACKUP_DIR_FULL/"
    cd - > /dev/null || exit 1

    # 清理临时目录
    rm -rf "$TEMP_DIR"

    # 获取备份文件大小
    BACKUP_SIZE=$(du -h "$BACKUP_DIR_FULL/$BACKUP_NAME" | cut -f1)
    log_info "备份完成: $BACKUP_DIR/$BACKUP_NAME ($BACKUP_SIZE)"
}

# 清理旧备份
cleanup_old_backups() {
    log_info "清理旧备份（保留最近 $KEEP_BACKUPS 个）..."

    # 获取备份文件数量
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | wc -l)

    if [ "$BACKUP_COUNT" -gt "$KEEP_BACKUPS" ]; then
        # 删除最旧的备份
        REMOVE_COUNT=$((BACKUP_COUNT - KEEP_BACKUPS))
        ls -1t "$BACKUP_DIR"/backup_*.tar.gz | tail -n "$REMOVE_COUNT" | while read -r file; do
            rm -f "$file"
            log_info "已删除旧备份: $(basename "$file")"
        done
    else
        log_info "当前备份数量: $BACKUP_COUNT，无需清理"
    fi
}

# 显示备份统计
show_statistics() {
    echo ""
    log_info "========== 备份统计 =========="
    log_info "备份目录: $BACKUP_DIR"
    log_info "备份文件数: $(ls -1 "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | wc -l)"
    log_info "总大小: $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "N/A")"

    echo ""
    log_info "最近5个备份:"
    ls -1t "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | head -n 5 | while read -r file; do
        SIZE=$(du -h "$file" | cut -f1)
        echo "  - $(basename "$file") ($SIZE)"
    done
    echo ""
}

# 主函数
main() {
    echo ""
    log_info "========================================="
    log_info "   知识分享排班表 - 数据备份脚本"
    log_info "========================================="
    echo ""

    check_prerequisites
    create_backup_dir
    perform_backup
    cleanup_old_backups
    show_statistics

    log_info "✅ 备份任务完成！"
    echo ""
}

# 执行主函数
main
