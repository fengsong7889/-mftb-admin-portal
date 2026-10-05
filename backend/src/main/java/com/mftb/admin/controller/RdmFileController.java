package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.util.FileValidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 產研協同（RDM）附件上传接口。
 * <p>沿用 EAM 验收入库照片的口径：服务端不落盘，返回 Base64 Data URL 由业务表存 MEDIUMTEXT 列
 * （见 205 迁移），避免为原型阶段引入对象存储与静态资源目录配置。
 * <p>安全：大小 5MB 上限 + 图片走 magic bytes 校验 + 非图片按扩展名白名单，
 * 防止伪造 Content-Type 上传可执行文件。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/file")
@RequiredArgsConstructor
public class RdmFileController {

    /** 单文件大小上限（与 EAM 照片一致） */
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    /** 文档类扩展名白名单（图片之外允许的需求附件） */
    private static final List<String> DOC_EXTENSIONS = List.of(
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "md", "zip", "rp", "sketch", "fig");

    /** 上传需求附件/现状截图 */
    @PostMapping("/upload")
    @RequirePermission(menu = "rdm-submit", action = "create", anyOf = {
            "rdm-requirement", "rdm-product", "rdm-acceptance", "rdm-intake"})
    public Result<Map<String, String>> upload(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.error("文件不能為空");
        }
        if (file.getSize() > MAX_BYTES) {
            return Result.error("文件大小不能超過 5MB");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType();
        String extension = extensionOf(file.getOriginalFilename());
        boolean image = contentType.startsWith("image/");
        if (image) {
            // Magic bytes 校验：防止伪造 Content-Type 的恶意文件
            String magicError = FileValidator.validateImageMagicBytes(file);
            if (magicError != null) {
                return Result.error(magicError);
            }
        } else if (!DOC_EXTENSIONS.contains(extension)) {
            return Result.error("僅支持圖片與常見文檔附件（pdf/doc/xls/ppt/zip 等）");
        }
        try {
            String base64 = Base64.getEncoder().encodeToString(file.getBytes());
            String mimeType = image || contentType.isEmpty() ? guessMime(extension, contentType) : contentType;
            String name = file.getOriginalFilename() != null && !file.getOriginalFilename().isBlank()
                    ? file.getOriginalFilename() : ("attachment." + extension);
            return Result.success(Map.of(
                    "name", name,
                    "fileType", mimeType,
                    "fileSize", String.valueOf(file.getSize()),
                    "dataUrl", "data:" + mimeType + ";base64," + base64));
        } catch (Exception e) {
            log.error("RDM 附件上傳失敗: name={}, error={}", file.getOriginalFilename(), e.getMessage());
            return Result.error("附件上傳失敗");
        }
    }

    private static String extensionOf(String fileName) {
        if (fileName == null) {
            return "";
        }
        int dot = fileName.lastIndexOf('.');
        return dot < 0 || dot == fileName.length() - 1
                ? "" : fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** 无可信 Content-Type 时按扩展名回退到安全的 MIME（避免浏览器按原类型直接执行） */
    private static String guessMime(String extension, String fallback) {
        return switch (extension) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            case "pdf" -> "application/pdf";
            case "txt", "md" -> "text/plain";
            case "csv" -> "text/csv";
            case "zip" -> "application/zip";
            default -> fallback.isEmpty() ? "application/octet-stream" : fallback;
        };
    }
}
