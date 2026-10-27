# ====== 运行阶段（镜像内不再编译源码）======
# 制品来源：CI 的 verify job 用一次完整 Maven 生命周期（编译 + 全量测试 + 打包）产出的
# backend/bootstrap/target/mftb-admin.jar（多模块 P3：bootstrap 装配 legacy 后打包），
# 经 actions/upload-artifact 传给 build job 下载回同一位置。
# 旧实现在镜像里再跑一次 `mvn package`，等于同一份源码在一条流水线被完整编译 2~3 次，
# 且镜像内的 JAR 与被测试过的 JAR 不是同一个字节，无法用摘要证明「测的就是发的」。
#
# 本地手工构建镜像：先 `mvn -B -f backend/pom.xml package -DskipTests`，再
# `docker build -f backend/Dockerfile .`（构建上下文是仓库根，需要 backend/target/ 与 .git）。
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 创建非 root 用户
RUN addgroup -S app && adduser -S app -G app

# 只接受已验证制品：文件缺失时 COPY 直接失败，空文件（如制品下载中断）由下面的校验拦下，
# 不允许静默退化成「镜像里再编译一次」的旧路径
COPY backend/bootstrap/target/mftb-admin.jar app.jar
RUN test -s app.jar || { echo "❌ app.jar 为空或缺失：请先由 CI/本地 Maven 产出制品再构建镜像"; exit 1; }

# 复制 .git 目录，供「从 Git 同步版本记录」功能读取提交历史
COPY .git .git

# 时区设置 + git（safe.directory 修复：.git 归 root、运行用户为 app，Git 2.35.2+ 会拒绝执行仓库命令）
RUN apk add --no-cache tzdata git && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    git config --system --add safe.directory /app && \
    apk del tzdata

# 文档中心本地对象存储目录：必须在切换用户前建好并授权，
# 否则非 root 用户 app 无法在 /app 下创建 .local，启动即 AccessDeniedException。
# 多实例部署请改用共享对象存储，或把 DOC_STORAGE_LOCAL_ROOT 指向挂载的持久卷。
RUN mkdir -p /app/.local/doc-assets/tmp && chown -R app:app /app/.local

USER app

EXPOSE 8080

# JVM 优化：堆按容器内存百分比弹性分配（容器感知，自动适配 Sealos 配额，建议配额 >=1G）；
# 限制 Metaspace 与线程栈，防止非堆内存挤爆容器限额触发 OOM；OOM 时快速退出交由编排重建
ENV JAVA_OPTS="-XX:InitialRAMPercentage=50.0 -XX:MaxRAMPercentage=60.0 -XX:MaxMetaspaceSize=192m -Xss512k -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+ExitOnOutOfMemoryError"
# 显式声明存储根目录，与上面预建目录保持一致（可用环境变量覆盖为持久卷路径）
ENV DOC_STORAGE_LOCAL_ROOT=/app/.local/doc-assets

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
