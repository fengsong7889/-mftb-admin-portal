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
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ai/access-request")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 使用申請", description = "員工AI使用權限與額度申請管理")
public class AiAccessRequestController {

    private static final String MENU = "ai-access-request";

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
    @Operation(summary = "查詢申請列表（管理員/審批人）")
    @RequirePermission(menu = MENU)
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
    @Operation(summary = "審批通過")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> approveRequest(@PathVariable Long id,
                                          @Valid @RequestBody AiAccessRequestDTO.ApproveRequest request) {
        String operator = operatorResolver.currentOperatorName();
        requestService.approveRequest(id, request, operator);
        return Result.success(true);
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "審批駁回")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> rejectRequest(@PathVariable Long id,
                                         @RequestParam(required = false) String remark) {
        String operator = operatorResolver.currentOperatorName();
        requestService.rejectRequest(id, remark, operator);
        return Result.success(true);
    }
}
