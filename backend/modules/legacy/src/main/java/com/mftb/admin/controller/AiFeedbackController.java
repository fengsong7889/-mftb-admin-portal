package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiFeedback;
import com.mftb.admin.service.agent.AiFeedbackService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * AI 回答反馈：用户赞/踩（自助）；管理员查看低分列表（配置中心权限）。
 */
@RestController
@RequestMapping("/api/ai/feedback")
@RequiredArgsConstructor
public class AiFeedbackController {

    private final AiFeedbackService feedbackService;

    @PostMapping
    @Operation(summary = "提交回答反饋（贊/踩）")
    public Result<AiFeedback> submit(@RequestBody AiFeedback body) {
        return Result.success(feedbackService.submit(body));
    }

    @GetMapping
    @RequirePermission(menu = "ai-assistant-feedback", action = "view")
    @Operation(summary = "低分/最近反饋列表（管理員）")
    public Result<List<AiFeedback>> recent(@RequestParam(required = false) Integer rating,
                                           @RequestParam(defaultValue = "50") int limit,
                                           @RequestParam(required = false) String systemCode) {
        return Result.success(feedbackService.recent(rating, limit, systemCode));
    }

    @GetMapping("/stats")
    @RequirePermission(menu = "ai-assistant-feedback", action = "view")
    @Operation(summary = "反饋聚合（按工具/原因/日趨勢）")
    public Result<Map<String, Object>> stats(@RequestParam(defaultValue = "30") int days,
                                             @RequestParam(required = false) String systemCode) {
        return Result.success(feedbackService.stats(days, systemCode));
    }
}
