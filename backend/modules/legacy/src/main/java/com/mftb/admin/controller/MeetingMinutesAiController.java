package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesAiDto;
import com.mftb.admin.service.minutes.MeetingMinutesAiService;
import com.mftb.admin.service.minutes.MeetingMinutesNoteService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 会议纪要 AI 辅助录入接口（个人笔记读写 + 提取）。
 *
 * <p>身份一律由服务端从 JWT 取（请求体没有 recorderUserId/tenantId 的位置）；
 * 菜单与动作锚点沿用纪要既有登记（{@code meeting-my} + anyOf 预约/记录页，写动作用 edit），
 * 不新增菜单 key。笔记与提取结果都是敏感正文，响应统一 {@code no-store}。
 */
@RestController
@RequestMapping("/api/meeting/minutes")
@RequiredArgsConstructor
public class MeetingMinutesAiController {

    private static final String MY = MeetingConstants.MENU_MY;
    private static final String BOOKING = MeetingConstants.MENU_BOOKING;
    private static final String RECORD = MeetingConstants.MENU_RECORD;

    private final MeetingMinutesNoteService noteService;
    private final MeetingMinutesAiService aiService;

    /** 读个人笔记（含最近可恢复的提取请求号） */
    @GetMapping("/notes")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesAiDto.NoteVO> readNote(@RequestParam("bookingId") long bookingId, HttpServletResponse response) {
        noStore(response);
        return Result.success(noteService.read(bookingId));
    }

    /** 自动保存个人笔记（不触发模型、不动正式草稿版本） */
    @PutMapping("/notes")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesAiDto.NoteVO> saveNote(@RequestBody @Valid MeetingMinutesAiDto.NoteForm form,
                                                       HttpServletResponse response) {
        noStore(response);
        return Result.success("筆記已保存", noteService.save(form));
    }

    /** AI 可用性预检（不预占、不扣费；失败只影响 AI，不阻塞手动表单） */
    @GetMapping("/ai/status")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesAiDto.AiStatusVO> aiStatus(@RequestParam("bookingId") long bookingId, HttpServletResponse response) {
        noStore(response);
        return Result.success(aiService.status(bookingId));
    }

    /** 执行一次提取（幂等：同 requestKey 重放返回原结果，不重复调模型） */
    @PostMapping("/ai/extractions")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesAiDto.ExtractionVO> extract(@RequestBody @Valid MeetingMinutesAiDto.ExtractionForm form,
                                                            HttpServletResponse response) {
        noStore(response);
        return Result.success(aiService.extract(form));
    }

    /** 重连后按请求号查询本次结果（只读，不重调模型） */
    @GetMapping("/ai/extractions/{requestKey}")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesAiDto.ExtractionVO> extraction(@PathVariable("requestKey") String requestKey,
                                                               HttpServletResponse response) {
        if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new BusinessException("提取識別碼格式不正確");
        }
        noStore(response);
        return Result.success(aiService.get(requestKey));
    }

    private static void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
    }

    /** 供测试/清理作业引用：可恢复的处理中请求上限（当前由服务内部按分钟限流，控制器不直接暴露）。 */
    static List<String> allowedMenus() {
        return List.of(MY, BOOKING, RECORD);
    }
}
