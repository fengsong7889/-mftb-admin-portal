package com.mftb.admin.dto;

/**
 * 机翻引擎配置请求 DTO（入参）
 */
public class MtEngineRequest {

    private String engineName;
    private String apiUrl;
    private String apiKey;
    private Integer dailyLimit;
    private Integer timeoutMs;
    private Integer status;
    private String configJson;

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
}
