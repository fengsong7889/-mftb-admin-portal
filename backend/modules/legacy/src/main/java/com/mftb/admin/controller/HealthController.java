package com.mftb.admin.controller;

import com.mftb.admin.config.migration.DatabaseReadinessState;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查接口（匿名可访问，已在 SecurityConfig 白名单放行）。
 * <ul>
 *   <li>{@code /api/health/live}：进程存活即 200，不依赖数据库，避免瞬时故障导致被反复重启。</li>
 *   <li>{@code /api/health/ready}：迁移与结构契约校验通过（{@link DatabaseReadinessState#isReady()}）才 200，
 *       否则 503。用于 K8s/Sealos readiness 探针，保证未完成迁移的实例不接流量。</li>
 * </ul>
 * 仅暴露最小状态信息，不外泄表名、SQL、凭据或数据库地址。
 */
@RestController
@RequestMapping("/api/health")
@RequiredArgsConstructor
public class HealthController {

    private final DatabaseReadinessState readinessState;

    @GetMapping("/live")
    public ResponseEntity<Map<String, Object>> live() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        return ResponseEntity.ok(body);
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, Object>> ready() {
        Map<String, Object> body = new LinkedHashMap<>();
        boolean ready = readinessState.isReady();
        body.put("status", ready ? "UP" : "DOWN");
        if (!ready) {
            // 仅返回计数与摘要级原因，不暴露具体表/列等结构细节
            body.put("reason", "数据库迁移或结构校验尚未通过");
            body.put("driftCount", readinessState.getReasons().size());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }
        return ResponseEntity.ok(body);
    }
}
