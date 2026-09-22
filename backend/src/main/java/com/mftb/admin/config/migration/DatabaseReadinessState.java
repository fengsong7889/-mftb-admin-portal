package com.mftb.admin.config.migration;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 数据库就绪状态持有器（单例）。迁移与契约校验全部通过后由
 * {@link SchemaContractValidator} 置为就绪；就绪前 readiness 探针返回非就绪，
 * 使编排系统（K8s/Sealos）不会把流量导入未完成迁移的实例。
 * <p>
 * 说明：liveness 不依赖此状态，避免数据库瞬时故障导致实例被反复重启。
 */
@Component
public class DatabaseReadinessState {

    private volatile boolean ready = false;
    private volatile List<String> reasons = List.of("迁移与结构校验尚未完成");

    public boolean isReady() {
        return ready;
    }

    public List<String> getReasons() {
        return reasons;
    }

    public void markReady() {
        this.ready = true;
        this.reasons = List.of();
    }

    public void markNotReady(List<String> reasons) {
        this.ready = false;
        this.reasons = (reasons == null || reasons.isEmpty())
                ? List.of("数据库结构未满足契约") : List.copyOf(reasons);
    }
}
