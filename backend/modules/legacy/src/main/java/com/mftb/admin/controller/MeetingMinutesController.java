package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesDto;
import com.mftb.admin.service.MeetingMinutesService;
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
 * 会议纪要接口（录入、编辑、发送、发送历史、群候选、作废链接）。
 *
 * <p><b>请求体里没有 recorderUserId/organizerId</b>：记录人与发送人一律由服务端从 JWT 解析，
 * 相信前端传的"我是谁"等于允许任何人替别人署名记纪要。
 *
 * <p>菜单与动作对应关系沿用会议域既有登记：纪要挂在 {@code meeting-my} 下（anyOf 放行
 * 预约页与记录页入口），写动作用 {@code edit}。不新增菜单 key 是刻意的：种子里没有的菜单
 * 注解会让接口对非超管永久 403，而纪要的归属本来就是"我与这场会的关系统计"。
 */
@RestController
@RequestMapping("/api/meeting/minutes")
@RequiredArgsConstructor
public class MeetingMinutesController {

    private static final String MY = MeetingConstants.MENU_MY;
    private static final String BOOKING = MeetingConstants.MENU_BOOKING;
    private static final String RECORD = MeetingConstants.MENU_RECORD;

    private final MeetingMinutesService minutesService;

    /**
     * 按会议单取纪要。
     *
     * <p>没有纪要时返回 {@code exists=false} 的骨架而不是 404：录入页要能直接打开，
     * 拿 404 当"还没有"会让前端把"不存在"与"无权限/服务异常"混成一类。
     */
    @GetMapping
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.VO> viewByBooking(@RequestParam("bookingId") long bookingId) {
        return Result.success(minutesService.viewByBooking(bookingId));
    }

    /** 纪要候选群清单：只回 id 与名称，webhook 与加签密钥一律不下发 */
    @GetMapping("/groups")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<List<MeetingMinutesDto.GroupOptionVO>> groups() {
        return Result.success(minutesService.groupOptions());
    }

    /** 站内只读详情（被发送过纪要的非参会人也读得到） */
    @GetMapping("/{id}")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.VO> detail(@PathVariable long id) {
        return Result.success(minutesService.view(id));
    }

    /** 发送历史：批次 + 每批投递明细 */
    @GetMapping("/{id}/sends")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<List<MeetingMinutesDto.SendVO>> sends(@PathVariable long id) {
        return Result.success(minutesService.sends(id));
    }

    /** 新建纪要 */
    @PostMapping
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.VO> create(@RequestBody @Valid MeetingMinutesDto.Form form) {
        return Result.success("紀要已保存", minutesService.create(form));
    }

    /** 编辑纪要（乐观锁：版本不一致直接拒绝，不静默覆盖） */
    @PutMapping("/{id}")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.VO> update(@PathVariable long id,
                                               @RequestBody @Valid MeetingMinutesDto.Form form) {
        return Result.success("紀要已更新", minutesService.update(id, form));
    }

    /** 发布与通知分离，发布失败不会登记投递任务。 */
    @PostMapping("/{id}/publish")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.RevisionVO> publish(@PathVariable long id,
                                                       @RequestBody @Valid MeetingMinutesDto.PublishForm form) {
        return Result.success("紀要已發布", minutesService.publish(id, form));
    }

    @GetMapping("/{id}/revisions")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<List<MeetingMinutesDto.RevisionVO>> revisions(@PathVariable long id) {
        return Result.success(minutesService.revisions(id));
    }

    @GetMapping("/{id}/revisions/{revisionId}")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.RevisionVO> revision(@PathVariable long id, @PathVariable long revisionId) {
        return Result.success(minutesService.revision(id, revisionId));
    }

    /** 发送一批纪要：接口只回"进了投递队列"的受理结论，最终送达状态看发送历史 */
    @PostMapping("/{id}/send")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.SendResult> send(@PathVariable long id,
                                                     @RequestBody @Valid MeetingMinutesDto.SendForm form) {
        return Result.success("紀要發送已提交", minutesService.send(id, form));
    }

    /** 作废历史免登链接（不可逆：已转发的链接立刻读不到内容） */
    @PostMapping("/{id}/revoke-links")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.VO> revokeLinks(@PathVariable long id,
                                                    @RequestBody @Valid MeetingMinutesDto.RevokeForm form) {
        return Result.success("查看鏈接已作廢", minutesService.revokeLinks(id, form));
    }

    /** 单批次链接作废：只失效指定批次的免登链接，其他批次不受影响 */
    @PostMapping("/{id}/sends/{sendId}/revoke-link")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<Void> revokeBatchLink(@PathVariable long id, @PathVariable long sendId) {
        minutesService.revokeBatchLink(id, sendId);
        return Result.success("本批次查看鏈接已作廢", null);
    }

    /**
     * 更新事项处理结果（完成 / 部分完成 / 无法完成 + 原因）。
     *
     * <p>权限没挂在 {@code edit} 上：负责人回来更新自己那一条时，他往往连会议菜单都没有。
     * 具体“能不能改这一条”由服务层按 负责人/记录人/组织者/行政 判定，接口只挡未登录。
     */
    @PostMapping("/items/{itemId}/resolve")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingMinutesDto.VO> resolveItem(@PathVariable long itemId,
                                                    @RequestBody MeetingMinutesDto.ResolveForm form) {
        return Result.success("處理結果已更新", minutesService.resolveItem(itemId, form));
    }

    /**
     * 行政侧纪要检索（會議治理 › 會議紀要）。
     * <p>挂 {@code meeting-minutes-list:view}：入口由菜单授权控制，不靠前端隐藏。
     */
    @GetMapping("/admin/page")
    @RequirePermission(menu = "meeting-minutes-list", action = "view")
    public Result<MeetingMinutesDto.AdminPage> adminPage(MeetingMinutesDto.AdminQuery query) {
        return Result.success(minutesService.adminPage(query));
    }

    /** 关联纪要选择器的候选（纪要单号/会议单号/主题模糊匹配，最多 20 条） */
    @GetMapping("/search")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<List<MeetingMinutesDto.LinkVO>> search(@RequestParam(value = "keyword", required = false) String keyword,
                                                        @RequestParam(value = "excludeId", required = false) Long excludeId) {
        return Result.success(minutesService.search(keyword, excludeId));
    }
}
