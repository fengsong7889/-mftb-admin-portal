#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# 后端服务增量重启脚本 (restart-service.sh)
# ─────────────────────────────────────────────────────────────────────────────
# 用途：根据变更类型选择最快的重启方式，避免每次全量编译
#
# 用法：
#   bash restart-service.sh              # 自动检测变更类型，选择最优重启方式
#   bash restart-service.sh --fast       # 仅跑已有 JAR，不编译（最快，~15s）
#   bash restart-service.sh --rebuild    # 重新编译 + 跑 JAR（代码变更后，~45s）
#   bash restart-service.sh --full       # 等同于 run-local.sh（mvn spring-boot:run）
#   bash restart-service.sh --stop       # 仅停止后端服务
#   bash restart-service.sh --status     # 查看后端运行状态
#
# 决策树：
#   纯 Java 业务逻辑变更（Service/Controller/DTO 等）→ --rebuild
#   pom.xml / 依赖 / 配置文件变更                     → --rebuild（必须重新编译）
#   未变更 / 仅重启调试运行中服务                      → --fast
#   首次启动 / target/ 不存在                          → 自动 --rebuild
#
# 详细说明：backend/SERVICE-RESTART-GUIDE.md
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── 颜色定义 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 路径配置 ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

JAR_PATH="target/mftb-admin.jar"
LOG_FILE="backend-service.log"
PID_FILE=".backend.pid"

# ── 环境变量（与 run-local.sh 保持一致）──
setup_env() {
    export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null) || true
    if [ -z "$JAVA_HOME" ]; then
        echo -e "${RED}❌ 未找到 JDK 17，请确认已安装${NC}"
        exit 1
    fi
    export PATH="$HOME/apache-maven-3.9.6/bin:$JAVA_HOME/bin:$PATH"

    # 数据库连接（与 run-local.sh 一致，连接远程开发库）
    export DB_URL="${DB_URL:-jdbc:mysql://mysql3.sqlpub.com:3308/fengsong?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&socketTimeout=15000&connectTimeout=10000}"
    export DB_USERNAME="${DB_USERNAME:-fengsong_mftb}"
    export DB_PASSWORD="${DB_PASSWORD:-bBMzwCsHPYDhi4my}"
    export JWT_SECRET="${JWT_SECRET:-mftb-local-dev-secret-key-2024-sha256-secure-enough-for-hs384}"
    export LOG_LEVEL="${LOG_LEVEL:-info}"
}

# ── 停止现有服务 ──
stop_service() {
    local stopped=false

    # 方式1：通过 PID 文件优雅停止
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}⏹  停止后端服务 (PID: $pid)${NC}"
            kill "$pid" 2>/dev/null || true
            # 等待进程退出（最多 10 秒）
            local i
            for i in $(seq 1 10); do
                if ! kill -0 "$pid" 2>/dev/null; then
                    stopped=true
                    break
                fi
                sleep 1
            done
            # 仍未退出则强制终止
            if [ "$stopped" = false ]; then
                echo -e "${YELLOW}⏹  强制终止进程...${NC}"
                kill -9 "$pid" 2>/dev/null || true
                sleep 1
            fi
        fi
        rm -f "$PID_FILE"
    fi

    # 方式2：兜底 - 通过端口查找并停止
    local port_pid
    port_pid=$(lsof -ti:8080 2>/dev/null | tr '\n' ' ' | xargs 2>/dev/null || true)
    if [ -n "$port_pid" ]; then
        echo -e "${YELLOW}⏹  停止端口 8080 上的进程 (PID: $port_pid)${NC}"
        kill -9 $port_pid 2>/dev/null || true
        sleep 1
        stopped=true
    fi

    if [ "$stopped" = true ]; then
        echo -e "${GREEN}✅ 后端服务已停止${NC}"
    else
        echo -e "${BLUE}ℹ️  后端服务未在运行${NC}"
    fi
}

# ── 查看状态 ──
show_status() {
    local port_pid
    port_pid=$(lsof -ti:8080 2>/dev/null | tr '\n' ' ' | xargs 2>/dev/null || true)
    if [ -n "$port_pid" ]; then
        echo -e "${GREEN}✅ 后端服务运行中 (PID: $port_pid, 端口: 8080)${NC}"
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/ 2>/dev/null || true)
        http_code="${http_code:-000}"
        if [ "$http_code" != "000" ]; then
            echo -e "${GREEN}   HTTP 状态: $http_code${NC}"
        else
            echo -e "${YELLOW}   HTTP 未响应（可能正在启动中）${NC}"
        fi
    else
        echo -e "${RED}❌ 后端服务未运行${NC}"
    fi

    # JAR 信息
    if [ -f "$JAR_PATH" ]; then
        local jar_size jar_time
        jar_size=$(du -h "$JAR_PATH" | cut -f1)
        jar_time=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$JAR_PATH")
        echo -e "${BLUE}   JAR: $JAR_PATH ($jar_size, 编译于 $jar_time)${NC}"
    else
        echo -e "${YELLOW}   JAR 不存在，需要先编译：bash restart-service.sh --rebuild${NC}"
    fi
}

# ── 检测变更类型 ──
detect_change_type() {
    CHANGE_POM=false
    CHANGE_CONFIG=false
    CHANGE_JAVA=false

    # 检查 git 变更（工作区 + 暂存区）
    if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null; then
        if git diff --name-only HEAD 2>/dev/null | grep -qE '(^|/)pom\.xml$'; then
            CHANGE_POM=true
        fi
        if git diff --name-only HEAD 2>/dev/null | grep -qE 'application(-.*)?\.(yml|yaml|properties)$'; then
            CHANGE_CONFIG=true
        fi
        if git diff --name-only HEAD 2>/dev/null | grep -qE '\.java$'; then
            CHANGE_JAVA=true
        fi
    fi
}

# ── 编译 JAR ──
build_jar() {
    echo -e "${CYAN}🔨 编译后端 JAR（跳过测试）...${NC}"
    local start_time end_time elapsed
    start_time=$(date +%s)

    mvn package -DskipTests -q -e 2>&1 | tail -5 || true

    end_time=$(date +%s)
    elapsed=$((end_time - start_time))

    if [ ! -f "$JAR_PATH" ]; then
        echo -e "${RED}❌ 编译失败，JAR 未生成（耗时 ${elapsed}s）${NC}"
        echo -e "${YELLOW}   可运行完整输出查看错误: mvn package -DskipTests${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ 编译完成 (${elapsed}s)${NC}"
}

# ── 启动 JAR ──
start_jar() {
    if [ ! -f "$JAR_PATH" ]; then
        echo -e "${RED}❌ JAR 不存在: $JAR_PATH${NC}"
        echo -e "${YELLOW}   请先运行: bash restart-service.sh --rebuild${NC}"
        exit 1
    fi

    echo -e "${CYAN}🚀 启动后端服务 (JAR 模式, 懒初始化)...${NC}"
    echo -e "${BLUE}   日志: tail -f $LOG_FILE${NC}"
    echo ""

    # 启动（后台运行）
    nohup java \
        -Xmx2g -Xms512m \
        -XX:+UseG1GC \
        -jar "$JAR_PATH" \
        > "$LOG_FILE" 2>&1 &

    local pid=$!
    echo "$pid" > "$PID_FILE"

    # 等待启动确认
    echo -e "${CYAN}⏳ 等待服务启动...${NC}"
    local max_wait=90
    local waited=0
    while [ $waited -lt $max_wait ]; do
        # 检查进程是否还活着
        if ! kill -0 "$pid" 2>/dev/null; then
            echo ""
            echo -e "${RED}❌ 服务启动失败，请检查日志: $LOG_FILE${NC}"
            echo -e "${YELLOW}─────────── 日志末尾 20 行 ───────────${NC}"
            tail -20 "$LOG_FILE"
            exit 1
        fi

        # HTTP 健康检查（000=未响应，其余任意码都说明 Tomcat 已起来）
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/ 2>/dev/null || true)
        http_code="${http_code:-000}"
        if [ "$http_code" != "000" ]; then
            echo ""
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${GREEN}✅ 后端服务启动成功！(${waited}s)${NC}"
            echo -e "${GREEN}   端口: 8080 | PID: $pid | HTTP: $http_code${NC}"
            echo -e "${GREEN}   日志: tail -f $LOG_FILE${NC}"
            echo -e "${GREEN}   停止: bash restart-service.sh --stop${NC}"
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            return 0
        fi

        printf "."
        sleep 2
        waited=$((waited + 2))
    done

    echo ""
    echo -e "${YELLOW}⚠️  等待超时 (${max_wait}s)，服务可能仍在初始化${NC}"
    echo -e "${YELLOW}   查看状态: bash restart-service.sh --status${NC}"
    echo -e "${YELLOW}   查看日志: tail -f $LOG_FILE${NC}"
}

# ── 全量启动（mvn spring-boot:run，兼容旧方式）──
start_full() {
    echo -e "${CYAN}🚀 全量启动后端服务 (mvn spring-boot:run)...${NC}"
    echo -e "${BLUE}   此模式每次启动都会重新编译并直接运行源码，适合需要完整生命周期的场景${NC}"
    echo ""
    exec ./run-local.sh
}

# ── 自动检测并选择重启方式 ──
auto_restart() {
    echo -e "${CYAN}🔍 检测变更类型...${NC}"
    detect_change_type

    # JAR 不存在时必须重新编译
    if [ ! -f "$JAR_PATH" ]; then
        echo -e "${YELLOW}   JAR 不存在，执行首次编译${NC}"
        stop_service
        build_jar
        start_jar
        return
    fi

    if [ "$CHANGE_POM" = true ]; then
        echo -e "${YELLOW}   ⚡ 检测到 pom.xml 变更 → 重新编译${NC}"
        stop_service
        build_jar
        start_jar
    elif [ "$CHANGE_CONFIG" = true ]; then
        echo -e "${YELLOW}   ⚡ 检测到配置文件变更 → 重新编译${NC}"
        stop_service
        build_jar
        start_jar
    elif [ "$CHANGE_JAVA" = true ]; then
        echo -e "${YELLOW}   ⚡ 检测到 Java 源码变更 → 重新编译${NC}"
        stop_service
        build_jar
        start_jar
    else
        echo -e "${GREEN}   ⚡ 未检测到代码变更 → 快速重启（跳过编译）${NC}"
        stop_service
        start_jar
    fi
}

# ── 主入口 ──
case "${1:-}" in
    --fast)
        setup_env
        stop_service
        start_jar
        ;;
    --rebuild)
        setup_env
        stop_service
        build_jar
        start_jar
        ;;
    --full)
        start_full
        ;;
    --stop)
        stop_service
        ;;
    --status)
        show_status
        ;;
    --help|-h)
        sed -n '2,25p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'
        ;;
    "")
        setup_env
        auto_restart
        ;;
    *)
        echo -e "${RED}未知参数: $1${NC}"
        echo "用法: bash restart-service.sh [--fast|--rebuild|--full|--stop|--status]"
        exit 1
        ;;
esac
