# ====== 构建阶段 ======
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app

# 先复制 pom.xml，利用 Docker 缓存加速依赖下载
COPY pom.xml .
RUN mvn dependency:go-offline -B

# 复制源码并构建
COPY src src
RUN mvn package -DskipTests -B && \
    mv target/mftb-admin.jar app.jar

# ====== 运行阶段 ======
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 创建非 root 用户
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/app.jar .

# 时区设置
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

USER app

EXPOSE 8080

# JVM 优化：堆按容器内存百分比弹性分配（容器感知，自动适配 Sealos 配额，建议配额 >=1G）；
# 限制 Metaspace 与线程栈，防止非堆内存挤爆容器限额触发 OOM；OOM 时快速退出交由编排重建
ENV JAVA_OPTS="-XX:InitialRAMPercentage=50.0 -XX:MaxRAMPercentage=60.0 -XX:MaxMetaspaceSize=192m -Xss512k -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
