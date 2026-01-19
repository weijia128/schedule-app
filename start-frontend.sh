#!/bin/bash
cd "$(dirname "$0")"
SERVER_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
echo "🌐 正在启动前端服务器..."
echo "📍 本地访问: http://localhost:8000/schedule.html"
echo "📍 网络访问: http://${SERVER_IP}:8000/schedule.html"
echo ""
echo "💡 提示: 团队成员可通过网络地址访问"
echo "⏸️  按 Ctrl+C 停止服务器"
echo ""
python3 -m http.server 8000 --bind 0.0.0.0
