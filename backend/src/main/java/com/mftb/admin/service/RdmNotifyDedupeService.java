package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmNotifyLog;
import com.mftb.admin.mapper.RdmNotifyLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * RDM 通知<b>事件级唯一去重</b>（任务22 B.2）。
 *
 * <p>去重键 = {@code (object_type, object_id, event_version, receiver_user_id)} 四元组的
 * 规范化 SHA-256 摘要，写入 {@code rdm_notify_log.dedupe_key}（CHAR(64) ascii_bin），
 * 由 238 冻结 DDL 的唯一索引 {@code uk_rdm_notify_dedupe} 兜底：
 * <b>同一对象 / 同一事件 / 同一版本或提醒日 / 同一接收人只出站一次</b>。
 *
 * <p>{@code event_version} 有两种语义（前缀常量见 {@link RdmConstants}）：
 * <ul>
 *   <li>{@code VERSION:<并发版本>}：版本驱动事件（如 PM 待办通知）。对象被改一次版本推进一次，
 *       于是「待办产生/变更」会再通知一次；同一版本内无论扫描多少轮都<b>不重发</b>。</li>
 *   <li>{@code DATE:<yyyy-MM-dd>}：日期驱动事件（如工作日催办）。提醒日参与键，
 *       因此「同一天只催一次」，第二天可以再催 —— 这正是催办需要的语义，
 *       既不会一天催 N 次，也不会催过一次就永远安静。</li>
 * </ul>
 *
 * <p><b>为什么必须按「每接收人一行」</b>：238 的 CHECK 约束 {@code ck_rdm_notify_dedupe} 要求
 * {@code dedupe_key} 非空时 {@code receiver_user_id} 非空且 &gt; 0。也就是说数据库层面就不允许
 * 「一条群播行代表多个接收人」参与去重。因此本服务只对<b>单一接收人</b>签发去重键；
 * 既有的群播行（一条事件 @ 多人）保持 {@code dedupe_key = NULL}，不受唯一索引影响、也不回填。
 *
 * <p><b>fail-closed</b>：四元组任一要素缺失或非法时，本服务返回 {@code null} 键并把
 * {@link #alreadyEnqueued(String)} 判为「已发过」——宁可漏发一条通知，也绝不写出违反 CHECK 约束的行，
 * 更不允许「拿不到接收人就当成所有人都没收到过」而重复群发。
 *
 * <p>本类<b>不发送任何消息</b>：发送仍由 {@link RdmNotifyService}（事务内入队）与
 * {@link RdmNotifyDispatcher}（提交后投递 / 抢占领取 / 退避重试 / dry-run）负责，
 * 既有 outbox 语义一字不改。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmNotifyDedupeService {

    /** {@code dedupe_key} 列宽（238 冻结 DDL：CHAR(64)，CHECK 约束要求 CHAR_LENGTH = 64） */
    public static final int DEDUPE_KEY_LENGTH = 64;

    /** 四元组规范化分隔符：对象类型里不可能出现，避免 {@code (a|b, c)} 与 {@code (a, b|c)} 撞键 */
    private static final String SEPARATOR = "|";

    /** {@code DATE:} 后的日期格式（与 238 列注释 {@code DATE:yyyy-MM-dd} 一致） */
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    /**
     * 对象并发版本缺失时的兜底版本号。
     * <p>存量行可能尚未启用乐观锁列（{@code version} 为 NULL）。此时退化为 {@code VERSION:0}：
     * 同一对象同一接收人只通知一次，<b>宁可少发也不重复发</b>；等对象真的被改动、版本推进后自然恢复。
     */
    public static final int FALLBACK_VERSION = 0;

    private final RdmNotifyLogMapper notifyLogMapper;

    /* ==================== event_version 构造 ==================== */

    /** 版本驱动事件的 {@code event_version}：{@code VERSION:<并发版本>}（null 版本退化 {@code VERSION:0}）。 */
    public static String versionEventVersion(Integer version) {
        return RdmConstants.NOTIFY_EVENT_VERSION_PREFIX + (version == null ? FALLBACK_VERSION : version);
    }

    /** 日期驱动事件的 {@code event_version}：{@code DATE:<yyyy-MM-dd>}（提醒日）。 */
    public static String dateEventVersion(LocalDate remindDay) {
        LocalDate day = remindDay == null ? LocalDate.now() : remindDay;
        return RdmConstants.NOTIFY_EVENT_DATE_PREFIX + day.format(DATE_FORMAT);
    }

    /* ==================== 去重键 ==================== */

    /**
     * 四元组是否完整合法（对齐 238 的 {@code ck_rdm_notify_dedupe}）。
     * <p>任何一项不满足都<b>不得</b>签发去重键：写进去会被 CHECK 约束拒绝，
     * 更糟的是若放宽成「接收人为空也算一个键」，就等于把「不知道发给谁」变成「发给所有人只发一次」。
     */
    public static boolean isComplete(String objectType, Long objectId, String eventVersion, Long receiverUserId) {
        return StringUtils.hasText(objectType)
                && objectId != null && objectId > 0L
                && StringUtils.hasText(eventVersion)
                && receiverUserId != null && receiverUserId > 0L;
    }

    /**
     * 计算去重键（SHA-256 小写十六进制，固定 64 字符）。
     *
     * @return 四元组不完整时返回 {@code null}（调用方必须按 fail-closed 处理，不得写入 NULL 键以外的行）
     */
    public static String dedupeKey(String objectType, Long objectId, String eventVersion, Long receiverUserId) {
        if (!isComplete(objectType, objectId, eventVersion, receiverUserId)) {
            return null;
        }
        String normalized = objectType.trim().toLowerCase(Locale.ROOT) + SEPARATOR
                + objectId + SEPARATOR
                + eventVersion.trim() + SEPARATOR
                + receiverUserId;
        // 复用任务28 的规范化摘要实现，避免项目里出现第二套 SHA-256 写法（大小写/编码不一致就会撞不上唯一索引）
        return RdmIdempotentService.sha256Hex(normalized);
    }

    /**
     * 计算去重键并在不合法时记 error 日志（供调用方直接拿到「可用或不可用」的结论）。
     */
    public String keyOf(String objectType, Long objectId, String eventVersion, Long receiverUserId) {
        String key = dedupeKey(objectType, objectId, eventVersion, receiverUserId);
        if (key == null) {
            log.error("RDM 通知去重鍵不完整，按 fail-closed 拒絕出站: objectType={}, objectId={}, eventVersion={}, "
                            + "receiverUserId={}", objectType, objectId, eventVersion, receiverUserId);
        } else if (key.length() != DEDUPE_KEY_LENGTH) {
            // 理论上不可能（SHA-256 恒为 64 位十六进制）；一旦成立说明摘要实现被改动，必须暴露而不是静默写坏行
            log.error("RDM 通知去重鍵長度異常，拒絕出站: length={}, key={}", key.length(), key);
            return null;
        }
        return key;
    }

    /* ==================== 去重查询 ==================== */

    /**
     * 该去重键是否已出站过（含 pending / sending / sent / failed / abandoned / skipped 全部状态）。
     *
     * <p><b>为什么 skipped 也算「已发过」</b>：dry-run 环境下消息被刻意不真发，
     * 若把 skipped 当成「没发过」，联调期每轮扫描都会插一行，唯一索引反而成了噪音源，
     * 也无法验证「同键只发一次」。真实发送与否由 dry-run 开关决定，与去重是两件正交的事。
     *
     * @param dedupeKey {@code null} 或空白时一律返回 {@code true}（fail-closed：拿不到键就不发）
     */
    public boolean alreadyEnqueued(String dedupeKey) {
        if (!StringUtils.hasText(dedupeKey)) {
            log.warn("RDM 通知去重鍵為空，按 fail-closed 視為已出站（不重複發送）");
            return true;
        }
        Long count = notifyLogMapper.selectCount(new LambdaQueryWrapper<RdmNotifyLog>()
                .eq(RdmNotifyLog::getDedupeKey, dedupeKey));
        return count != null && count > 0L;
    }

    /** 四元组重载：内部先算键再查（键不完整时同样 fail-closed 返回 true）。 */
    public boolean alreadyEnqueued(String objectType, Long objectId, String eventVersion, Long receiverUserId) {
        return alreadyEnqueued(dedupeKey(objectType, objectId, eventVersion, receiverUserId));
    }
}
