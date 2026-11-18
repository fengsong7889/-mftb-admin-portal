/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.service.cpm.CpmAiService;
import com.mftb.admin.service.cpm.CpmAsrService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 持續績效 AI 辅助录入接口（提取 / 确认 / 录音转写）。
 *
 * <p>与纪要 AI 同一治理口径：ai_cpm 是独立动作（能记录不等于能调模型）；
 * 原文与提取结果都是敏感正文，响应统一 no-store；转写音频只在请求内存中存活。
 */
@RestController
@RequestMapping("/api/cpm/ai")
@RequiredArgsConstructor
public class CpmAiController {

    private static final String MY = CpmConstants.MENU_MY;
    private static final String REPORT = CpmConstants.MENU_REPORT;

    private final CpmAiService aiService;
    private final CpmAsrService asrService;

    /** 预检（不预占不扣费；不就绪时前端按钮置灰并显示原因） */
    @GetMapping("/status")
    @RequirePermission(menu = MY, anyOf = {REPORT})
    public Result<CpmDto.AiStatusVO> status(HttpServletResponse response) {
        noStore(response);
        CpmDto.AiStatusVO vo = aiService.status();
        vo.setAsrAvailable(asrService.available());
        return Result.success(vo);
    }

    /** 执行一次提取（幂等：同 requestKey 同原文返回原结果；换内容拒绝） */
    @PostMapping("/extractions")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_AI_CPM, anyOf = {REPORT})
    public Result<CpmDto.AiExtractionVO> extract(@RequestBody @Valid CpmDto.AiExtractionForm form,
                                                 HttpServletResponse response) {
        noStore(response);
        return Result.success(aiService.extract(form));
    }

    /** 断线重连：按请求号只读查询，不重调模型 */
    @GetMapping("/extractions/{requestKey}")
    @RequirePermission(menu = MY, anyOf = {REPORT})
    public Result<CpmDto.AiExtractionVO> extraction(@PathVariable("requestKey") String requestKey,
                                                    HttpServletResponse response) {
        if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new BusinessException("提取識別碼格式不正確");
        }
        noStore(response);
        return Result.success(aiService.get(requestKey));
    }

    /** 人工确认后才落正式条目（AI 只起草，落账永远由人签字） */
    @PostMapping("/extractions/confirm")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_AI_CPM, anyOf = {REPORT})
    public Result<List<CpmDto.ItemVO>> confirm(@RequestBody @Valid CpmDto.AiConfirmForm form,
                                               HttpServletResponse response) {
        noStore(response);
        return Result.success("已添加到今天", aiService.confirm(form));
    }

    /** 汇报 AI 摘要：输入为服务端重算的确定性快照，输出仅一段概述文字（前端须标 ai_summary） */
    @PostMapping("/report-summary")
    @RequirePermission(menu = REPORT, action = CpmConstants.ACTION_AI_CPM)
    public Result<CpmDto.TranscriptionVO> reportSummary(@RequestBody @Valid CpmDto.AiSummaryForm form,
                                                        HttpServletResponse response) {
        noStore(response);
        CpmDto.TranscriptionVO vo = new CpmDto.TranscriptionVO();
        vo.setText(aiService.summarizeReport(form.getPeriodType(), form.getPeriodStart(), form.getRequestKey()));
        return Result.success(vo);
    }

    /** 录音转写（multipart）：结果作为普通原文回到 extract 链路 */
    @PostMapping("/transcriptions")
    @RequirePermission(menu = MY, action = CpmConstants.ACTION_AI_CPM, anyOf = {REPORT})
    public Result<CpmDto.TranscriptionVO> transcribe(@RequestParam("audio") MultipartFile audio,
                                                     HttpServletResponse response) {
        noStore(response);
        try {
            byte[] bytes = audio.getBytes();
            String text = asrService.transcribe(bytes, audio.getOriginalFilename());
            CpmDto.TranscriptionVO vo = new CpmDto.TranscriptionVO();
            vo.setText(text);
            return Result.success(vo);
        } catch (IOException e) {
            throw new BusinessException("音頻讀取失敗，請重試");
        }
    }

    /** ASR 能力探测（前端录音按钮的可用性来源；不含任何凭据信息） */
    @GetMapping("/asr/capabilities")
    @RequirePermission(menu = MY, anyOf = {REPORT})
    public Result<Map<String, Object>> asrCapabilities() {
        return Result.success(asrService.capabilities());
    }

    private static void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
    }
}
