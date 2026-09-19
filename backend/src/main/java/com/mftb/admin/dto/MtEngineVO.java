package com.mftb.admin.dto;

import java.time.LocalDateTime;

/**
 * 机翻引擎配置 VO（出参）
 */
public class MtEngineVO {

    private Long id;
    private String engineKey;
    private String engineName;
    private String apiUrl;
    /** API Key 脱敏输出: 仅显示前4后4位 */
    private String apiKey;
    private Integer dailyLimit;
    private Integer timeoutMs;
    private Integer status;
    private String configJson;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 今日已用字符数（运行时统计） */
    private Integer todayUsage;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getEngineKey() { return engineKey; }
    public void setEngineKey(String engineKey) { this.engineKey = engineKey; }
    public String getEngineName() { return engineName; }
    public void setEngineName(String engineName) { this.engineName = engineName; }
    public String getApiUrl() { return apiUrl; }
    public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public Integer getDailyLimit() { return dailyLimit; }
    public void setDailyLimit(Integer dailyLimit) { this.dailyLimit = dailyLimit; }
    public Integer getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(Integer timeoutMs) { this.timeoutMs = timeoutMs; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public Integer getTodayUsage() { return todayUsage; }
    public void setTodayUsage(Integer todayUsage) { this.todayUsage = todayUsage; }
}
