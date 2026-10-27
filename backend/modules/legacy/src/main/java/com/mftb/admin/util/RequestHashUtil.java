package com.mftb.admin.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * 请求内容摘要（幂等键的"内容指纹"）。
 *
 * <p>抽成工具的原因很实际：预约单与周期系列都要"同一个 requestKey 只允许同一份内容"，
 * 而两个服务不在同一个包下，各自复制一份 SHA-256 代码就等于允许两边对"内容变了没有"
 * 得出不同结论——那时同一次重放在一处被拒、在另一处被放行，比没摘要更难查。
 */
public final class RequestHashUtil {

    private RequestHashUtil() {
    }

    /** SHA-256 十六进制串；算法不可用时抛 IllegalStateException（没有摘要就不能承诺幂等语义） */
    public static String sha256Hex(String canonical) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
