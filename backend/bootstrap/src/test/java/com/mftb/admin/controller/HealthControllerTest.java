package com.mftb.admin.controller;

import com.mftb.admin.config.migration.DatabaseReadinessState;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 健康端点的行为契约（方案 §六 / §8.1.6 的探针依据）。
 *
 * <p>为什么要测：K8s/Sealos 的 startup/readiness/liveness 全靠这两个端点，
 * 且它们已在 SecurityConfig 白名单里匿名放行。一旦「未就绪时返回 200」或「就绪时返回非 200」，
 * 要么把未完成迁移的实例接进流量，要么把健康实例反复重启，且线上很难第一时间发现。
 */
class HealthControllerTest {

    private final DatabaseReadinessState state = new DatabaseReadinessState();
    private final HealthController controller = new HealthController(state);

    @Test
    @DisplayName("/live 始终 200 且只回 status：不依赖数据库，避免瞬时故障触发重启风暴")
    void liveIsAlwaysUp() {
        ResponseEntity<Map<String, Object>> res = controller.live();
        assertEquals(200, res.getStatusCode().value());
        assertEquals("UP", res.getBody().get("status"));
        assertEquals(1, res.getBody().size(), "live 不应携带迁移原因等额外信息");
    }

    @Test
    @DisplayName("/ready 迁移未完成 → 503 + 摘要原因，绝不返回 200")
    void readyIsNotReadyBeforeMigration() {
        ResponseEntity<Map<String, Object>> res = controller.ready();
        assertEquals(503, res.getStatusCode().value());
        assertEquals("DOWN", res.getBody().get("status"));
        assertEquals(1, res.getBody().get("driftCount"), "初始未就绪默认带 1 条原因");
        assertFalse(String.valueOf(res.getBody().get("reason")).isBlank());
    }

    @Test
    @DisplayName("/ready 迁移完成 → 200 UP，且不泄露具体表/列")
    void readyIsUpAfterMigration() {
        state.markReady();
        ResponseEntity<Map<String, Object>> res = controller.ready();
        assertEquals(200, res.getStatusCode().value());
        assertEquals("UP", res.getBody().get("status"));
        assertNull(res.getBody().get("reason"));
        assertNull(res.getBody().get("driftCount"));
    }

    @Test
    @DisplayName("/ready 结构漂移 → 503，driftCount 反映原因条数，便于对账但不暴露明细")
    void readyReportsDriftCount() {
        state.markNotReady(List.of("表 A 缺列", "表 B 缺列"));
        ResponseEntity<Map<String, Object>> res = controller.ready();
        assertEquals(503, res.getStatusCode().value());
        assertEquals("DOWN", res.getBody().get("status"));
        assertEquals(2, res.getBody().get("driftCount"));
        assertEquals("数据库迁移或结构校验尚未通过", res.getBody().get("reason"));
    }
}
