#!/bin/bash

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/server"

# 检测操作系统
OS_TYPE="$(uname -s)"

# 加载环境变量（确保 nohup 时能找到 node/npm）
if [ "$OS_TYPE" = "Darwin" ]; then
    # macOS
    export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
    source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null || true
else
    # Linux (Ubuntu)
    export PATH="/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"
    source ~/.bashrc 2>/dev/null || source ~/.profile 2>/dev/null || true
fi

echo "🚀 正在启动后端服务器..."
echo "📍 本地访问: http://localhost:3000"

# 根据系统获取局域网 IP
if [ "$OS_TYPE" = "Darwin" ]; then
    # macOS
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
else
    # Linux (Ubuntu)
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip -4 addr show scope global | grep inet | awk '{print $2}' | cut -d/ -f1 | head -1 || echo "localhost")
fi

echo "📍 网络访问: http://${LOCAL_IP}:3000"
echo "📍 系统类型: ${OS_TYPE}"
echo ""

# 加载 .env 配置（如果存在）
if [ -f ".env" ]; then
    echo "⚙️  Loading .env configuration..."
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

npm start
