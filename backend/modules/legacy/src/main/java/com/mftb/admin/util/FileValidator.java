package com.mftb.admin.util;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

/**
 * 文件安全校验工具：基于 magic bytes（文件头魔数）校验真实文件类型。
 * <p>
 * Content-Type 由客户端提供，可被伪造；magic bytes 是文件内容的真实签名，无法通过简单重命名绕过。
 */
public final class FileValidator {

    private FileValidator() {}

    /**
     * 允许的图像 magic bytes 映射：魔数 → 格式名称。
     * 按魔数长度降序排列，优先匹配更长前缀以避免误判。
     */
    private static final Map<byte[], String> IMAGE_SIGNATURES;

    static {
        // 使用 LinkedHashMap 保持插入顺序（长前缀优先）
        java.util.LinkedHashMap<byte[], String> sigs = new java.util.LinkedHashMap<>();
        sigs.put(new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, "PNG");   // ‰PNG
        sigs.put(new byte[]{(byte) 0x52, 0x49, 0x46, 0x46}, "WEBP");                           // RIFF (WEBP)
        sigs.put(new byte[]{(byte) 0x47, 0x49, 0x46, 0x38}, "GIF");                            // GIF8
        sigs.put(new byte[]{(byte) 0x42, 0x4D}, "BMP");                                        // BM
        sigs.put(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}, "JPEG");                   // ÿØÿ
        IMAGE_SIGNATURES = sigs;
    }

    /**
     * 校验上传文件是否为真实图片（基于 magic bytes）。
     *
     * @param file 上传的文件
     * @return null=校验通过；非 null=错误信息
     */
    public static String validateImageMagicBytes(MultipartFile file) {
        try {
            byte[] header = new byte[12];
            int read = file.getInputStream().read(header);
            if (read < 3) {
                return "文件內容過小，無法識別類型";
            }
            for (Map.Entry<byte[], String> entry : IMAGE_SIGNATURES.entrySet()) {
                if (startsWith(header, entry.getKey())) {
                    return null; // 匹配成功，是真实图片
                }
            }
            return "文件內容與圖像格式不匹配，僅支持 JPEG/PNG/GIF/WebP/BMP";
        } catch (IOException e) {
            return "文件讀取失敗";
        }
    }

    /**
     * 检查 bytes 是否以 prefix 开头。
     */
    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        if (bytes.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (bytes[i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }
}
