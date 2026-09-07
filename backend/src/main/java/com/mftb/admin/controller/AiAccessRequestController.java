package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiAccessRequestDTO;
import com.mftb.admin.service.AiAccessRequestService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/ai/access-request")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 使用申請", description = "員工AI使用權限與額度申請管理（審批即授權）")
public class AiAccessRequestController {

    private final AiAccessRequestService requestService;
    private final OperatorResolver operatorResolver;

    @PostMapping
    @Operation(summary = "提交申請（當前登錄用戶）")
    public Result<Long> submitRequest(@Valid @RequestBody AiAccessRequestDTO.SubmitRequest request) {
        String operator = operatorResolver.currentOperatorName();
        Long id = requestService.submitRequest(request, operator);
        return Result.success(id);
    }

    @GetMapping
    @Operation(summary = "查詢申請列表（審批中心合併展示，審批人跨設備可見他人提交的申請）")
    @RequirePermission(menu = "approval-center", action = "view")
    public Result<List<AiAccessRequestDTO.RequestVO>> listRequests(AiAccessRequestDTO.QueryRequest query) {
        return Result.success(requestService.listRequests(query));
    }

    @GetMapping("/my")
    @Operation(summary = "查詢我的申請列表")
    public Result<List<AiAccessRequestDTO.RequestVO>> listMyRequests(AiAccessRequestDTO.QueryRequest query) {
        return Result.success(requestService.listMyRequests(query));
    }

    @GetMapping("/{id}")
    @Operation(summary = "查詢申請詳情")
    public Result<AiAccessRequestDTO.RequestVO> getRequest(@PathVariable Long id) {
        AiAccessRequestDTO.RequestVO vo = requestService.getRequestById(id);
        return vo != null ? Result.success(vo) : Result.error("申請記錄不存在");
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "審批通過（審批即授權：自動下發模型權限與個人額度）")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<Boolean> approveRequest(@PathVariable Long id,
                                          @Valid @RequestBody AiAccessRequestDTO.ApproveRequest request) {
        String operator = operatorResolver.currentOperatorName();
        requestService.approveRequest(id, request, operator);
        return Result.success(true);
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "審批駁回")
    @RequirePermission(menu = "approval-center", action = "edit")
    public Result<Boolean> rejectRequest(@PathVariable Long id,
                                         @RequestParam(required = false) String remark) {
        String operator = operatorResolver.currentOperatorName();
        requestService.rejectRequest(id, remark, operator);
        return Result.success(true);
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "撤銷申請（僅申請人本人且待審批狀態）")
    public Result<Boolean> cancelRequest(@PathVariable Long id) {
        String operator = operatorResolver.currentOperatorName();
        requestService.cancelRequest(id, operator);
        return Result.success(true);
    }

    /**
     * 上傳申請憑證附件，返回 base64 Data URL（與頭像上傳同模式）
     * 支持圖片與 PDF，單文件 ≤ 2MB；附件隨申請一併提交存入 ai_access_request.credentials
     */
    @PostMapping("/credential/upload")
    @Operation(summary = "上傳申請憑證附件（圖片/PDF，≤2MB）")
    public Result<java.util.Map<String, Object>> uploadCredential(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file.isEmpty()) {
            return Result.error("文件不能為空");
        }
        String contentType = file.getContentType();
        boolean isImage = contentType != null && contentType.startsWith("image/");
        boolean isPdf = "application/pdf".equals(contentType);
        if (!isImage && !isPdf) {
            return Result.error("僅支持上傳圖片或 PDF 文件");
        }
        if (file.getSize() > 2 * 1024 * 1024) {
            return Result.error("文件大小不能超過 2MB");
        }
        try {
            byte[] bytes = file.getBytes();
            String base64 = java.util.Base64.getEncoder().encodeToString(bytes);
            String dataUrl = "data:" + contentType + ";base64," + base64;
            return Result.success(java.util.Map.of(
                    "name", file.getOriginalFilename() != null ? file.getOriginalFilename() : "credential",
                    "type", isPdf ? "pdf" : "image",
                    "size", file.getSize(),
                    "dataUrl", dataUrl));
        } catch (java.io.IOException e) {
            log.error("憑證上傳失敗: {}", e.getMessage());
            return Result.error("憑證上傳失敗");
        }
    }
}
