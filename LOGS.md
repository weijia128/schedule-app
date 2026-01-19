# 操作日志说明

## 📋 日志文件位置

所有的访问和编辑操作都会记录到日志文件中：

```
server/operation.log
```

## 📝 记录的操作类型

系统会自动记录前端可编辑的内容操作：

### 1. 排班数据编辑

- **修改主题** - 编辑主题内容
  - 记录旧值、新值（完整内容）

- **修改备注** - 编辑备注信息
  - 记录旧值、新值（完整内容）

### 2. 文件操作

- **上传文件** - 上传一个或多个文件
  - 记录文件数量、文件名列表、总大小

- **删除文件** - 删除已上传的文件
  - 记录文件名、文件大小

### 3. 留言板操作

- **更新留言板（留言）** - 修改留言内容
- **更新留言板（公告）** - 修改公告内容
- **更新留言板（留言、公告）** - 同时修改两者

## 📊 日志格式

每条日志包含以下信息：

```
[时间戳] [IP地址] 操作类型 - {详细信息JSON}
```

### 日志示例

**修改主题：**
```
[2025-12-20T15:32:10.789Z] [192.168.1.101] 修改主题 - {"scheduleId":"3","week":3,"date":"2025-12-12","type":"修改主题","oldValue":"AI工具使用技巧","newValue":"ChatGPT高级应用实践"}
```

**修改备注：**
```
[2025-12-20T15:33:25.123Z] [192.168.1.100] 修改备注 - {"scheduleId":"2","week":2,"date":"2025-12-05","type":"修改备注","oldValue":"需要准备演示环境","newValue":"已准备好演示环境，使用会议室A"}
```

**上传文件：**
```
[2025-12-20T15:33:50.012Z] [192.168.1.102] 上传文件 - {"scheduleId":"4","week":4,"date":"2025-12-19","fileCount":2,"fileNames":["report.pdf","presentation.pptx"],"totalSize":2048576,"sizeFormatted":"2 MB"}
```

**删除文件：**
```
[2025-12-20T15:35:20.345Z] [192.168.1.100] 删除文件 - {"scheduleId":"4","week":4,"date":"2025-12-19","fileName":"old-report.pdf","fileSize":524288,"sizeFormatted":"512 KB"}
```

**更新留言板：**
```
[2025-12-20T15:36:40.678Z] [192.168.1.103] 更新留言板（留言、公告） - {"changes":["留言","公告"],"messageLength":150,"noticeLength":80}
```

## 🔍 查看日志

### 1. 查看所有日志

```bash
cat server/operation.log
```

### 2. 查看最近的日志

```bash
# 查看最后 20 条
tail -n 20 server/operation.log

# 实时监控新日志
tail -f server/operation.log
```

### 3. 按时间查看

```bash
# 查看今天的日志
grep "2025-12-20" server/operation.log

# 查看最近一小时的日志
grep "2025-12-20T15:" server/operation.log
```

### 4. 按操作类型查看

```bash
# 查看所有主题修改
grep "修改主题" server/operation.log

# 查看所有备注修改
grep "修改备注" server/operation.log

# 查看所有文件上传
grep "上传文件" server/operation.log

# 查看所有文件删除
grep "删除文件" server/operation.log

# 查看留言板修改
grep "更新留言板" server/operation.log

# 查看所有编辑操作（主题+备注）
grep "修改主题\|修改备注" server/operation.log
```

### 5. 按IP地址查看

```bash
# 查看特定IP的所有操作
grep "192.168.1.100" server/operation.log
```

### 6. 统计操作次数

```bash
# 统计总操作数
wc -l server/operation.log

# 统计各类操作的次数
grep -c "修改主题" server/operation.log
grep -c "修改备注" server/operation.log
grep -c "上传文件" server/operation.log
grep -c "删除文件" server/operation.log
grep -c "更新留言板" server/operation.log

# 统计今天的操作数
grep "$(date +%Y-%m-%d)" server/operation.log | wc -l

# 统计各操作类型的分布
awk -F'] ' '{print $3}' server/operation.log | awk -F' -' '{print $1}' | sort | uniq -c | sort -rn
```

输出示例：
```
  23 修改主题
  18 上传文件
   8 删除文件
   5 修改备注
   3 更新留言板
```

## 🔐 日志安全

### 1. 设置文件权限

确保只有管理员可以查看日志：

```bash
chmod 600 server/operation.log
chown youruser:yourgroup server/operation.log
```

### 2. 定期备份日志

```bash
# 按日期备份
cp server/operation.log server/operation.log.$(date +%Y%m%d)

# 或者使用 logrotate（推荐）
```

### 3. 日志轮转（推荐）

创建 `/etc/logrotate.d/schedule-app` 配置：

```
/path/to/schedule-app/server/operation.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 youruser yourgroup
}
```

这样会：
- 每天轮转日志
- 保留 30 天的日志
- 自动压缩旧日志

## 📈 日志分析示例

### 查找可疑活动

```bash
# 查找短时间内大量操作（可能是攻击）
grep "2025-12-20T15:30" server/operation.log | wc -l

# 查找失败的操作
grep "error\|failed" server/operation.log
```

### 生成使用报告

```bash
# 按IP统计操作次数
awk '{print $2}' server/operation.log | sort | uniq -c | sort -rn

# 按日期统计
awk '{print substr($1, 2, 10)}' server/operation.log | sort | uniq -c
```

### 导出为CSV

```bash
# 简单的CSV导出
awk -F'[][]' '{print $2","$3","$5}' server/operation.log > operations.csv
```

## 🚨 监控告警

### 创建监控脚本

创建 `monitor-logs.sh`：

```bash
#!/bin/bash

LOG_FILE="server/operation.log"
ALERT_THRESHOLD=100

# 检查最近5分钟的操作数
RECENT_OPS=$(tail -n 1000 $LOG_FILE | grep "$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:)" | wc -l)

if [ $RECENT_OPS -gt $ALERT_THRESHOLD ]; then
    echo "⚠️ 告警：最近5分钟有 $RECENT_OPS 次操作（超过阈值 $ALERT_THRESHOLD）"
    # 发送邮件或其他告警
fi
```

### 定时运行

```bash
# 每5分钟检查一次
*/5 * * * * /path/to/monitor-logs.sh
```

## 💡 最佳实践

1. **定期查看日志**
   - 每周查看一次操作日志
   - 注意异常的IP地址或操作模式

2. **备份日志**
   - 定期备份操作日志
   - 与数据备份一起存储

3. **日志轮转**
   - 使用 logrotate 自动管理日志大小
   - 避免日志文件过大影响性能

4. **访问控制**
   - 限制日志文件访问权限
   - 只有管理员可以查看

5. **异常监控**
   - 设置告警规则
   - 及时发现异常操作

## 📞 常用命令速查

```bash
# 实时监控日志
tail -f server/operation.log

# 查看今天的所有操作
grep "$(date +%Y-%m-%d)" server/operation.log

# 统计今天的操作次数
grep "$(date +%Y-%m-%d)" server/operation.log | wc -l

# 查找特定用户的操作（通过IP）
grep "192.168.1.100" server/operation.log

# 查看最后10条编辑操作
grep "编辑排班数据" server/operation.log | tail -10

# 清空日志（慎用！）
> server/operation.log
```

---

**注意：** 操作日志会持续增长，建议定期清理或使用日志轮转。
