package com.mftb.admin.util;

import org.springframework.util.StringUtils;

import java.net.URI;
import java.util.Locale;

/**
 * 免登链接可达性判断：只做“字面量”检查，不做 DNS 解析。
 *
 * <p>为什么需要它：纪要卡片里的「查看完整紀要」如果拼成 {@code http://192.168.x.x:3000}，
 * 在开发机上点得开、在手机上必然“网络不给力”。这不是白名单问题，而是把一个只有内网能到的
 * 地址发给了外网收件人。发送前给出明确警告，比发完让收件人自己猜更负责。
 *
 * <p>刻意不解析域名：启动/发送路径上做 DNS 查询会把“网络抖动”变成“发不出去”，
 * 而且公网域名解析结果也不能证明对手机可达。能判断的只有三类：
 * <ul>
 *   <li>协议必须是 http/https；</li>
 *   <li>主机是 localhost / *.local / IPv6 回环或本地段；</li>
 *   <li>主机是 IPv4 私网、回环、链路本地或运营商级 NAT 地址。</li>
 * </ul>
 * 其余（域名、公网 IP）一律视为“看起来可达”，由管理员配置负责。
 */
public final class PublicLinkGuard {

    private PublicLinkGuard() {
    }

    /** true 表示“不是明显的内网/本地地址”，可发给外部收件人 */
    public static boolean isPubliclyReachable(String url) {
        if (!StringUtils.hasText(url)) {
            return false;
        }
        try {
            URI uri = URI.create(url.trim());
            String scheme = uri.getScheme();
            if (scheme == null
                    || (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))) {
                return false;
            }
            String host = uri.getHost();
            if (!StringUtils.hasText(host)) {
                return false;
            }
            host = host.toLowerCase(Locale.ROOT);
            // URI.getHost() 对 IPv6 会保留方括号（[::1]），不去掉就永远匹配不到回环
            if (host.startsWith("[") && host.endsWith("]")) {
                host = host.substring(1, host.length() - 1);
            }
            if ("localhost".equals(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
                return false;
            }
            if (host.contains(":")) {
                // IPv6：回环、唯一本地地址（fc00::/7）、链路本地（fe80::/10）
                return !("::1".equals(host) || host.startsWith("fc") || host.startsWith("fd")
                        || host.startsWith("fe80"));
            }
            if (host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) {
                return isPublicIpv4(host);
            }
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static boolean isPublicIpv4(String host) {
        String[] parts = host.split("\\.");
        int[] octets = new int[4];
        for (int index = 0; index < 4; index++) {
            try {
                octets[index] = Integer.parseInt(parts[index]);
            } catch (NumberFormatException e) {
                return false;
            }
            if (octets[index] < 0 || octets[index] > 255) {
                return false;
            }
        }
        int first = octets[0];
        int second = octets[1];
        if (first == 0 || first == 10 || first == 127) {
            return false;
        }
        if (first == 169 && second == 254) {
            return false;
        }
        if (first == 192 && second == 168) {
            return false;
        }
        if (first == 172 && second >= 16 && second <= 31) {
            return false;
        }
        // 100.64.0.0/10：运营商级 NAT，手机与外网都到不了
        return !(first == 100 && second >= 64 && second <= 127);
    }
}
