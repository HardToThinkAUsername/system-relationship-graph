#!/usr/bin/env bash
# 系统关系图谱 —— 服务控制脚本
#
# 用法:
#   ./server.sh start     启动
#   ./server.sh stop      关闭
#   ./server.sh restart   重启
#   ./server.sh status    查看状态
#
# 端口默认 8000，可用环境变量覆盖：PORT=9000 ./server.sh start

set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8000}"
PIDFILE="$DIR/.server.pid"
LOGFILE="$DIR/server.log"

is_running() {
    [ -f "$PIDFILE" ] || return 1
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null)"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start() {
    if is_running; then
        echo "已在运行 (PID $(cat "$PIDFILE"), 端口 $PORT)，无需重复启动"
        return 0
    fi
    cd "$DIR"
    nohup python3 server.py "$PORT" >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 1
    if is_running; then
        echo "已启动 (PID $(cat "$PIDFILE"), 端口 $PORT)"
        echo "  本机:      http://localhost:$PORT"
        for ip in $(hostname -I 2>/dev/null); do
            echo "  局域网访问: http://$ip:$PORT"
        done
    else
        echo "启动失败，请查看日志: $LOGFILE"
        rm -f "$PIDFILE"
        return 1
    fi
}

stop() {
    if ! is_running; then
        echo "未在运行"
        rm -f "$PIDFILE"
        return 0
    fi
    local pid
    pid="$(cat "$PIDFILE")"
    kill "$pid" 2>/dev/null
    for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.3
    done
    if kill -0 "$pid" 2>/dev/null; then
        echo "进程未正常退出，强制结束"
        kill -9 "$pid" 2>/dev/null
        sleep 0.3
    fi
    rm -f "$PIDFILE"
    echo "已停止 (PID $pid)"
}

status() {
    if is_running; then
        echo "运行中 (PID $(cat "$PIDFILE"), 端口 $PORT)"
    else
        echo "未运行"
    fi
}

case "${1:-}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        echo "端口可用环境变量覆盖，例如: PORT=9000 $0 start"
        exit 1 ;;
esac