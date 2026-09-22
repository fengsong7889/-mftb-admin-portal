package com.mftb.admin.config.migration;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * 迁移登记条目（对应 db/migrations/catalog.json 的单个 migration）。
 * 仅作登记、依赖校验与文档用途，执行仍由各 DataInitializer 承担；
 * {@link MigrationCatalog} 在启动/CI 校验清单一致性（版本键唯一、依赖存在、资源存在、无环）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class MigrationEntry {

    /** 唯一版本键（与 SchemaVersionTracker 中使用的 versionKey 一致） */
    private String versionKey;

    /** 所属模块（core/biz/eam/adpromo/...） */
    private String module;

    /** 执行阶段 */
    private SchemaPhase phase;

    /** 执行类型：JAVA（初始化器）或 SQL（classpath 脚本资源） */
    private ExecutionType executionType;

    /** JAVA 类型的执行器 Bean 名 */
    private String executor;

    /** SQL 类型的 classpath 资源名 */
    private String resource;

    /** 依赖的其他 versionKey（可为空） */
    private List<String> dependencies;

    /** 状态：ACTIVE / RETIRED / SUPERSEDED / MANUAL_ONLY */
    private MigrationStatus status;

    /** 被哪个 versionKey 取代（status=SUPERSEDED 时填写） */
    private String supersededBy;

    /** 该迁移对应的自愈契约名（可选，供 SchemaContractValidator 关联） */
    private String selfHealContract;

    private String comment;

    public enum ExecutionType { JAVA, SQL }

    public String getVersionKey() { return versionKey; }
    public void setVersionKey(String versionKey) { this.versionKey = versionKey; }
    public String getModule() { return module; }
    public void setModule(String module) { this.module = module; }
    public SchemaPhase getPhase() { return phase; }
    public void setPhase(SchemaPhase phase) { this.phase = phase; }
    public ExecutionType getExecutionType() { return executionType; }
    public void setExecutionType(ExecutionType executionType) { this.executionType = executionType; }
    public String getExecutor() { return executor; }
    public void setExecutor(String executor) { this.executor = executor; }
    public String getResource() { return resource; }
    public void setResource(String resource) { this.resource = resource; }
    public List<String> getDependencies() { return dependencies; }
    public void setDependencies(List<String> dependencies) { this.dependencies = dependencies; }
    public MigrationStatus getStatus() { return status; }
    public void setStatus(MigrationStatus status) { this.status = status; }
    public String getSupersededBy() { return supersededBy; }
    public void setSupersededBy(String supersededBy) { this.supersededBy = supersededBy; }
    public String getSelfHealContract() { return selfHealContract; }
    public void setSelfHealContract(String selfHealContract) { this.selfHealContract = selfHealContract; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
