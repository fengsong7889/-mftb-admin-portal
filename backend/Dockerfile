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

# JVM 优化：适配低内存环境（256-512MB）
ENV JAVA_OPTS="-Xms128m -Xmx384m -XX:+UseG1GC -XX:MaxGCPauseMillis=200"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
