#!/bin/bash
set -e
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$HOME/Library/apache-maven-3.9.9/bin:$JAVA_HOME/bin:$PATH"
export DB_URL='jdbc:mysql://mysql6.sqlpub.com:3311/fengsong_test?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true'
export DB_USERNAME='fengsong_mt'
export DB_PASSWORD='re6NO4pZLL2pgqhp'
export JWT_SECRET='mftb-local-dev-secret-key-2024-sha256-secure-enough-for-hs384'
export LOG_LEVEL=info
cd "$(dirname "$0")"
mvn spring-boot:run
