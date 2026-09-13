package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamInboundService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;
import java.util.Map;

/**
 * EAM 验收入库控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/eam/inbound")
@RequiredArgsConstructor
public class EamInboundController {

    private static final String MENU = "asset-inbound";

    private final EamInboundService inboundService;

    /** 分頁查詢入庫批次 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<Map<String, Object>>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return Result.success(inboundService.pageBatches(page, size));
    }

    /** 入庫批次詳情 */
    @GetMapping("/{batchId}")
    @RequirePermission(menu = MENU)
    public Result<Map<String, Object>> detail(@PathVariable long batchId) {
        return Result.success(inboundService.getBatchDetail(batchId));
    }

    /** 創建入庫批次（驗收入庫提交） */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> data) {
        return Result.success(inboundService.createBatch(data));
    }

    /** 上传验收照片，返回 Base64 Data URL */
    @PostMapping("/photo/upload")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Map<String, String>> uploadPhoto(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return Result.error("文件不能为空");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            return Result.error("仅支持上传图片文件");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            return Result.error("文件大小不能超过 5MB");
        }
        try {
            byte[] bytes = file.getBytes();
            String base64 = Base64.getEncoder().encodeToString(bytes);
            String dataUrl = "data:" + contentType + ";base64," + base64;
            String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "photo.jpg";
            return Result.success(Map.of("name", name, "dataUrl", dataUrl));
        } catch (Exception e) {
            log.error("验收照片上传失败: {}", e.getMessage());
            return Result.error("照片上传失败");
        }
    }
}
