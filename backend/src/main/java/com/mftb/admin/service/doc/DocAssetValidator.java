package com.mftb.admin.service.doc;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * 文件上传校验纯函数：扩展名、MIME、magic bytes、文件名清洗。
 *
 * <p>与 Service 分离是为了能在不启动 Spring、不落盘的情况下覆盖伪造文件头、
 * 路径片段和二进制伪装文本等安全边界。
 */
public final class DocAssetValidator {
    public static final Set<String> ALLOWED = Set.of(
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "png", "jpg", "jpeg", "webp");
    private static final Set<String> ZIP_BASED = Set.of("docx", "xlsx", "pptx");
    private static final int MAX_NAME = 255;

    private DocAssetValidator() {}

    public static String safeName(String fileName) {
        if (fileName == null || fileName.isBlank()) return "unnamed";
        String name = fileName.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        name = name.replaceAll("[\\p{Cntrl}]", "").trim();
        if (name.isEmpty()) name = "unnamed";
        return name.length() > MAX_NAME ? name.substring(name.length() - MAX_NAME) : name;
    }

    public static String extension(String fileName, String contentType) {
        int dot = fileName.lastIndexOf('.');
        if (dot >= 0 && dot < fileName.length() - 1) {
            String ext = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
            if (ext.matches("[a-z0-9]{1,8}")) return ext;
        }
        if (contentType == null) return "";
        String type = contentType.toLowerCase(Locale.ROOT);
        if (type.contains("pdf")) return "pdf";
        if (type.contains("png")) return "png";
        if (type.contains("jpeg")) return "jpg";
        if (type.contains("markdown")) return "md";
        if (type.contains("text/plain")) return "txt";
        return "";
    }

    public static String mimeOf(String extension) {
        return switch (extension) {
            case "pdf" -> "application/pdf";
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "webp" -> "image/webp";
            case "md" -> "text/markdown; charset=utf-8";
            case "txt" -> "text/plain; charset=utf-8";
            case "csv" -> "text/csv; charset=utf-8";
            case "doc" -> "application/msword";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xls" -> "application/vnd.ms-excel";
            case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "ppt" -> "application/vnd.ms-powerpoint";
            case "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            default -> "application/octet-stream";
        };
    }

    /** 返回 null 表示通过；否则返回可直接展示给用户的中文原因。 */
    public static String validateMagic(String extension, byte[] head, int length) {
        if (length == 0) return "文件內容為空";
        return switch (extension) {
            case "pdf" -> startsWith(head, length, "%PDF-") ? null : "PDF 文件頭不匹配";
            case "png" -> length >= 8 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G'
                    ? null : "PNG 文件頭不匹配";
            case "jpg", "jpeg" -> length >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF
                    ? null : "JPEG 文件頭不匹配";
            case "webp" -> length >= 12 && new String(head, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                    && new String(head, 8, 4, StandardCharsets.US_ASCII).equals("WEBP") ? null : "WEBP 文件頭不匹配";
            case "docx", "xlsx", "pptx" -> length >= 4 && head[0] == 'P' && head[1] == 'K' ? null : "Office 文件頭不匹配";
            case "txt", "md", "csv" -> hasNul(head, length) ? "文本文件包含二进制内容" : null;
            default -> ZIP_BASED.contains(extension) ? "Office 文件頭不匹配" : null;
        };
    }

    private static boolean startsWith(byte[] head, int length, String magic) {
        byte[] bytes = magic.getBytes(StandardCharsets.US_ASCII);
        if (length < bytes.length) return false;
        for (int i = 0; i < bytes.length; i++) if (head[i] != bytes[i]) return false;
        return true;
    }

    private static boolean hasNul(byte[] head, int length) {
        for (int i = 0; i < length; i++) if (head[i] == 0) return true;
        return false;
    }
}
