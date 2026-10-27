package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamInboundCreateDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamInboundService;
import com.mftb.admin.util.FileValidator;
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

    /** 分页查询入库批次 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<Map<String, Object>>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return Result.success(inboundService.pageBatches(page, size));
    }

    /** 入库批次详情 */
    @GetMapping("/{batchId}")
    @RequirePermission(menu = MENU)
    public Result<Map<String, Object>> detail(@PathVariable long batchId) {
        return Result.success(inboundService.getBatchDetail(batchId));
    }

    /** 创建入库批次（验收入库提交） */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Map<String, Object>> create(@RequestBody EamInboundCreateDTO dto) {
        return Result.success(inboundService.createBatch(dto));
    }

    /** 登记换货二次发货（PR-3） */
    @PostMapping("/{batchId}/items/{itemId}/exchange-shipment")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Map<String, Object>> registerExchangeShipment(
            @PathVariable long batchId,
            @PathVariable long itemId,
            @RequestBody Map<String, String> body) {
        return Result.success(inboundService.registerExchangeShipment(
                batchId, itemId, body.get("trackingNo"), body.get("expectedDate")));
    }

    /** 查询指定订单/分组的验收记录时间线 */
    @GetMapping("/records")
    @RequirePermission(menu = MENU)
    public Result<java.util.List<Map<String, Object>>> inspectionRecords(
            @RequestParam long poId,
            @RequestParam(required = false) String groupId) {
        return Result.success(inboundService.getInspectionRecords(poId, groupId));
    }

    /** 上传验收照片，返回 Base64 Data URL */
    @PostMapping("/photo/upload")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Map<String, String>> uploadPhoto(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return Result.error("文件不能為空");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            return Result.error("僅支持上傳圖片文件");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            return Result.error("文件大小不能超過 5MB");
        }
        // Magic bytes 校验：防止伪造 Content-Type 的恶意文件
        String magicError = FileValidator.validateImageMagicBytes(file);
        if (magicError != null) {
            return Result.error(magicError);
        }
        try {
            byte[] bytes = file.getBytes();
            String base64 = Base64.getEncoder().encodeToString(bytes);
            String dataUrl = "data:" + contentType + ";base64," + base64;
            String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "photo.jpg";
            return Result.success(Map.of("name", name, "dataUrl", dataUrl));
        } catch (Exception e) {
            log.error("验收照片上传失败: {}", e.getMessage());
            return Result.error("照片上傳失敗");
        }
    }
}
