package com.mftb.admin.service;

import com.mftb.admin.dto.MeetingMinutesDto;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ResponseEntity;

import java.io.InputStream;
import java.util.List;

/**
 * 会议纪要服务：录入、编辑、发送、发送历史、免登查看与链接作废。
 *
 * <p>权限与数据范围都收敛在这里（与 {@code MeetingBookingService} 同一口径）：
 * 控制器上的 {@code @RequirePermission} 只挡菜单入口，"这一笔能不能读写"由服务层判定。
 */
public interface MeetingMinutesService {

    /** 按会议单取纪要；没有纪要时返回 exists=false 的骨架（不是错误） */
    MeetingMinutesDto.VO viewByBooking(long bookingId);

    /** 按纪要 id 取（站内只读页；被发送过纪要的非参会人也读得到） */
    MeetingMinutesDto.VO view(long minutesId);

    /** 新建纪要（记录人 = 当前登录人，请求体里的 recorder* 一律不认） */
    MeetingMinutesDto.VO create(MeetingMinutesDto.Form form);

    /** 编辑纪要：乐观锁冲突时拒绝，不静默覆盖别人的修改 */
    MeetingMinutesDto.VO update(long minutesId, MeetingMinutesDto.Form form);

    /** 发布已保存的草稿，正式版本只追加。 */
    MeetingMinutesDto.RevisionVO publish(long minutesId, MeetingMinutesDto.PublishForm form);

    /** 仅返回当前用户有权读取的正式版本。 */
    List<MeetingMinutesDto.RevisionVO> revisions(long minutesId);

    MeetingMinutesDto.RevisionVO revision(long minutesId, long revisionId);

    /** 发送一批纪要（群 + 自选收件人） */
    MeetingMinutesDto.SendResult send(long minutesId, MeetingMinutesDto.SendForm form);

    /** 发送历史（批次 + 每批投递明细 + 免登链接） */
    List<MeetingMinutesDto.SendVO> sends(long minutesId);

    /** 作废历史免登链接：token_version 递增，已发出去的链接立刻读不到内容 */
    MeetingMinutesDto.VO revokeLinks(long minutesId, MeetingMinutesDto.RevokeForm form);

    /** 单批次链接作废：只失效指定批次的免登链接，其他批次不受影响 */
    void revokeBatchLink(long minutesId, long sendId);

    /** 可选的钉钉群候选（只回 id 与名称） */
    List<MeetingMinutesDto.GroupOptionVO> groupOptions();

    /**
     * 更新事项处理结果（负责人本人 / 记录人 / 组织者 / 行政）。
     * <p>完成后向当初发纪要的群回一条通知；不发个人，不给负责人发“你自己刚做完的事”。
     */
    MeetingMinutesDto.VO resolveItem(long itemId, MeetingMinutesDto.ResolveForm form);

    /** 行政侧纪要检索：关键字/时间/记录人/状态/待办状态 + 跟随搜索条件的统计 */
    MeetingMinutesDto.AdminPage adminPage(MeetingMinutesDto.AdminQuery query);

    /** 关联纪要选择器的候选搜索（按纪要单号/会议单号/主题，最多 20 条） */
    List<MeetingMinutesDto.LinkVO> search(String keyword, Long excludeId);

    /** 免登只读视图：令牌裁决可见范围，不叠加登录态 */
    MeetingMinutesDto.PublicView publicView(String token);

    /* ==================== 补充说明附件 ==================== */

    /** 上传附件（原始字节流）：仅对这场会可录入纪要的人开放；服务端重验类型/大小/幂等 */
    MeetingMinutesDto.AttachmentVO uploadAttachment(long bookingId, String fileName, long contentLength,
                                                    InputStream input, String requestKey);

    /** 删除尚未绑定的附件：仅上传人本人，已随纪要保存的不可物理删除 */
    void deleteAttachment(String attachmentNo);

    /** 签发站内访问票据（view/download）：先按纪要读权限裁决，新标签页带不了 JWT 才用票据 */
    MeetingMinutesDto.AttachmentAccess attachmentAccess(String attachmentNo, String purpose);

    /** 凭票据取文件：兑换时复核用户仍启用且仍有读权限，权限撤销后旧票据立刻失效 */
    ResponseEntity<InputStreamResource> attachmentFileByTicket(String attachmentNo, String ticket);

    /** 免登页取文件：纪要令牌有效且附件属于该批快照才放行，否则统一按链接不可用处理 */
    ResponseEntity<InputStreamResource> attachmentFileByPublicToken(String attachmentNo, String token, String purpose);

    /** 回收超期未绑定的附件（清理作业入口）；返回处理条数 */
    int cleanupAttachments();

    /** 纪要能力是否已开启（前端入口与接口共用同一结论，避免两处口径漂移） */
    boolean enabled();
}
