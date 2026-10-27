package com.mftb.admin.dto;

/** 配置响应仅返回密钥是否存在，禁止向浏览器下发应用密钥或签署密钥。 */
public record DingTalkAppConfigVO(String appKey, String agentId, String baseUrl,
                                  boolean appSecretConfigured, boolean tokenSecretConfigured) {
}
