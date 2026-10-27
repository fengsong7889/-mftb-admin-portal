package com.mftb.admin.util;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 网络工具类: 提取客户端真实 IP（兼容 Nginx / CDN 等反向代理）
 */
public final class NetworkUtils {

    private NetworkUtils() {
    }

    /**
     * 从 HTTP 请求中提取客户端真实 IP
     * 依次检查 X-Forwarded-For → X-Real-IP → remoteAddr
     */
    public static String getClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // 多级代理取第一个
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
