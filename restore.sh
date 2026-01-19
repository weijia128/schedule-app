#!/bin/bash

# =============================================================================
# 备份恢复脚本 - 用于恢复 db.json 和 uploads 文件夹
# =============================================================================

# 配置项
BACKUP_DIR="backups"
SERVER_DIR="server"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_question() {
    echo -e "${BLUE}[?]${NC} $1"
}

# 列出可用的备份
list_backups() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "备份目录不存在: $BACKUP_DIR"
        exit 1
    fi

    BACKUPS=($(ls -1t "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null))

    if [ ${#BACKUPS[@]} -eq 0 ]; then
        log_error "未找到任何备份文件"
        exit 1
    fi

    echo ""
    log_info "========== 可用备份列表 =========="
    for i in "${!BACKUPS[@]}"; do
        BACKUP_FILE="${BACKUPS[$i]}"
        BACKUP_NAME=$(basename "$BACKUP_FILE")
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        BACKUP_DATE=$(echo "$BACKUP_NAME" | sed 's/backup_\(.*\)\.tar\.gz/\1/')

        # 格式化日期显示
        YEAR=${BACKUP_DATE:0:4}
        MONTH=${BACKUP_DATE:4:2}
        DAY=${BACKUP_DATE:6:2}
        HOUR=${BACKUP_DATE:9:2}
        MIN=${BACKUP_DATE:11:2}
        SEC=${BACKUP_DATE:13:2}

        printf "%2d) %s-%s-%s %s:%s:%s  (%s)\n" \
            $((i+1)) "$YEAR" "$MONTH" "$DAY" "$HOUR" "$MIN" "$SEC" "$BACKUP_SIZE"
    done
    echo ""
}

# 选择备份
select_backup() {
    list_backups

    while true; do
        log_question "请选择要恢复的备份 (输入序号，或 q 退出): "
        read -r choice

        if [ "$choice" = "q" ] || [ "$choice" = "Q" ]; then
            log_info "已取消恢复操作"
            exit 0
        fi

        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#BACKUPS[@]} ]; then
            SELECTED_BACKUP="${BACKUPS[$((choice-1))]}"
            log_info "已选择: $(basename "$SELECTED_BACKUP")"
            break
        else
            log_error "无效的选择，请重试"
        fi
    done
}

# 查看备份内容
view_backup_content() {
    echo ""
    log_info "========== 备份内容预览 =========="

    # 解压到临时目录查看内容
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$SELECTED_BACKUP" -C "$TEMP_DIR" 2>/dev/null

    if [ -f "$TEMP_DIR/backup_info.txt" ]; then
        cat "$TEMP_DIR/backup_info.txt"
    else
        log_warn "未找到备份信息文件"
        echo "备份内容:"
        ls -lh "$TEMP_DIR"
    fi

    rm -rf "$TEMP_DIR"
    echo ""
}

# 确认恢复
confirm_restore() {
    log_warn "⚠️  警告：恢复操作将覆盖现有数据！"
    echo ""
    log_info "将会覆盖以下文件/目录:"
    echo "  - $SERVER_DIR/db.json"
    echo "  - $SERVER_DIR/uploads/"
    echo ""

    # 备份当前数据
    if [ -f "$SERVER_DIR/db.json" ] || [ -d "$SERVER_DIR/uploads" ]; then
        log_info "建议先备份当前数据（自动创建安全备份）"
        log_question "是否自动创建当前数据的安全备份? (y/n): "
        read -r create_safety_backup

        if [ "$create_safety_backup" = "y" ] || [ "$create_safety_backup" = "Y" ]; then
            SAFETY_BACKUP="$BACKUP_DIR/safety_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
            tar -czf "$SAFETY_BACKUP" -C "$SERVER_DIR" db.json uploads 2>/dev/null
            log_info "安全备份已创建: $SAFETY_BACKUP"
        fi
    fi

    echo ""
    log_question "确定要继续恢复吗? 输入 'YES' 确认: "
    read -r confirm

    if [ "$confirm" != "YES" ]; then
        log_info "已取消恢复操作"
        exit 0
    fi
}

# 执行恢复
perform_restore() {
    echo ""
    log_info "开始恢复数据..."

    # 创建临时目录
    TEMP_DIR=$(mktemp -d)

    # 解压备份
    log_info "正在解压备份文件..."
    tar -xzf "$SELECTED_BACKUP" -C "$TEMP_DIR"

    # 恢复 db.json
    if [ -f "$TEMP_DIR/db.json" ]; then
        cp "$TEMP_DIR/db.json" "$SERVER_DIR/"
        log_info "✅ 已恢复 db.json"
    else
        log_warn "备份中未找到 db.json"
    fi

    # 恢复 uploads 目录
    if [ -d "$TEMP_DIR/uploads" ]; then
        # 删除现有 uploads 目录
        if [ -d "$SERVER_DIR/uploads" ]; then
            rm -rf "$SERVER_DIR/uploads"
        fi
        cp -r "$TEMP_DIR/uploads" "$SERVER_DIR/"
        log_info "✅ 已恢复 uploads 目录"
    else
        log_warn "备份中未找到 uploads 目录"
    fi

    # 清理临时目录
    rm -rf "$TEMP_DIR"

    echo ""
    log_info "========================================="
    log_info "✅ 数据恢复完成！"
    log_info "========================================="
    echo ""
    log_info "下一步:"
    log_info "  1. 重启服务器使更改生效"
    log_info "  2. 验证数据是否正确恢复"
    echo ""
}

# 主函数
main() {
    echo ""
    log_info "========================================="
    log_info "   知识分享排班表 - 数据恢复脚本"
    log_info "========================================="
    echo ""

    select_backup
    view_backup_content
    confirm_restore
    perform_restore
}

# 执行主函数
main
