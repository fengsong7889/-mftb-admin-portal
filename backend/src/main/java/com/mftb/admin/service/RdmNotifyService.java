package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * RDM 通知服务：业务事务内<b>只登记投递任务</b>（rdm_notify_log，一条事件一行），
 * 提交后交给 {@link RdmNotifyDispatcher} 异步发送，并按渠道返回结果落状态。
 *
 * <p>为什么不在事务里直接发：外部 HTTP 会把数据库连接和事务一起拖长。
 * <p>为什么不能「调用完就算成功」：原实现调用 {@code @Async void sendMarkdown} 一返回就记 success，
 * 而 SLA 提醒用 success 做 24 小时去重——渠道没受理的提醒会被自己那条 success 抑制一整天，
 * 越该催的越安静。现在 sent 只代表渠道已受理，未受理一律进入退避重试。
 * <p>通知失败永不回滚业务：需求流转已经成立，不能因为推送失败退回上一步。
 *
 * <p><b>任务22 B 的两处增量</b>：
 * <ol>
 *   <li><b>事件级唯一去重</b>（{@link #notifyDeduped}）：一个接收人一行，
 *       {@code dedupe_key = SHA-256(object_type|object_id|event_version|receiver_user_id)}，
 *       由 238 冻结 DDL 的 {@code uk_rdm_notify_dedupe} 唯一索引兜底，同一事件同一版本或提醒日
 *       同一接收人<b>只出站一次</b>；既有群播路径（{@link #notifyUsers}）保持 {@code dedupe_key = NULL}，行为不变。</li>
 *   <li><b>fallback 不再绕过 dry-run、不再在事务提交前发送</b>：旧实现在登记失败时直接
 *       {@code dispatcher.sendOnce(...)}，等于（a）在业务事务尚未提交时就把消息推给真实收件人
 *       ——事务一旦回滚，通知却已经出去了；（b）完全绕过 {@code rdm.notify.dry-run} 开关
 *       ——联调环境的测试消息会真的打到生产群。现在改为「提交后重试登记」，
 *       重试仍走正常 outbox（因此天然尊重 dry-run 与退避重试）；宁可延迟或留人工补发线索，不可绕过。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmNotifyService {

    private final RdmNotifyDispatcher dispatcher;
    private final SysUserMapper sysUserMapper;
    private final JdbcTemplate jdbcTemplate;
    /** 任务22 B.2：事件级去重键的签发与「是否已出站」判定 */
    private final RdmNotifyDedupeService dedupeService;

    /**
     * Markdown 站内相对链接：{@code [文字](/rdm-xxx?id=1)}。
     * <p>钉钉客户端不认相对地址，点开只会空白；而正文由各业务自己拼，漏一处就多一条死链，
     * 所以在唯一出站入口统一补成公网绝对地址。
     */
    private static final Pattern RELATIVE_MD_LINK = Pattern.compile("\\]\\(/(?!/)([^)\\s]*)\\)");
    private static final long PORTAL_BASE_TTL_MS = 60_000L;
    private volatile String cachedPortalBase;
    private volatile long cachedPortalBaseAt;

    /**
     * 按事件通知一组接收人（一条群播报消息 @多人，因此一条事件只登记一行）。
     *
     * @param eventCode 事件编码（RdmConstants.EVENT_*）
     * @param req       需求（用于追溯与页面跳转）
     * @param receivers 接收人，可为空（只群播报不 @ 人）
     * @param title     标题
     * @param text      Markdown 正文
     */
    public void notifyUsers(String eventCode, RdmRequirement req, Collection<SysUser> receivers,
                            String title, String text) {
        // 先补全相对链接：入队前一次到位，后续落库/重试都拿绝对地址
        text = absolutizeLinks(text);
        Set<String> mobiles = new LinkedHashSet<>();
        Set<String> names = new LinkedHashSet<>();
        for (SysUser user : receivers == null ? List.<SysUser>of() : receivers) {
            if (user == null) {
                continue;
            }
            if (StringUtils.hasText(user.getMobile())) {
                mobiles.add(user.getMobile());
            }
            if (StringUtils.hasText(user.getName())) {
                names.add(user.getName());
            }
        }
        enqueue(eventCode, req, RdmConstants.NOTIFY_SCENARIO, title, text,
                new ArrayList<>(mobiles), new ArrayList<>(names));
    }

    /** 按用户ID集合通知 */
    public void notifyUserIds(String eventCode, RdmRequirement req, Collection<Long> userIds,
                              String title, String text) {
        if (userIds == null || userIds.isEmpty()) {
            notifyUsers(eventCode, req, List.of(), title, text);
            return;
        }
        Set<Long> ids = new LinkedHashSet<>(userIds);
        ids.remove(null);
        if (ids.isEmpty()) {
            return;
        }
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>().in(SysUser::getId, ids));
        notifyUsers(eventCode, req, users, title, text);
    }

    private void enqueue(String eventCode, RdmRequirement req, String scenario, String title,
                         String text, List<String> atMobiles, List<String> receiverNames) {
        boolean blank = !StringUtils.hasText(text);
        Long id = insertTask(eventCode, req, scenario, title, text, atMobiles, receiverNames,
                blank ? "skipped" : "pending", blank ? null : "消息为空，按规则未发送");
        if (blank || id == null) {
            return;
        }
        dispatchAfterCommit(id);
    }

    /**
     * 事务内登记、提交后再发：回滚的需求不该发出「已进入需求池」这种通知。
     * <p>无活动事务（如定时作业）时直接投递：此时没有「提交前」可言，
     * 但<b>仍经由 dispatcher</b>，因此 dry-run / 抢占领取 / 退避重试 三项语义一个不少。
     */
    private void dispatchAfterCommit(Long id) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatcher.dispatch(id);
                }
            });
        } else {
            dispatcher.dispatch(id);
        }
    }

    /* ==================== 链接补全 ==================== */

    /**
     * 把正文里的站内 Markdown 相对链接补成公网绝对地址。
     *
     * <p>例：{@code [點擊處理](/rdm-delivery-item?id=5&mode=view)}<br>
     * → {@code [點擊處理](https://portal.example/-mftb-admin-portal/#/rdm-delivery-item?id=5&mode=view)}
     *
     * <p>前端是 HashRouter，路由必须落在 {@code #/} 之后；已绝对化的链接（{@code http(s)://}）
     * 与协议相对链接（{@code //host/...}）原样保留。取不到门户基址时不动正文，
     * 宁可留一条旧相对链接，也不凭空造一个错误域名。
     */
    String absolutizeLinks(String text) {
        if (!StringUtils.hasText(text) || !text.contains("](/")) {
            return text;
        }
        String base = portalBaseUrl();
        if (!StringUtils.hasText(base)) {
            return text;
        }
        Matcher matcher = RELATIVE_MD_LINK.matcher(text);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            matcher.appendReplacement(out, Matcher.quoteReplacement("](" + base + "/#/" + matcher.group(1) + ")"));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    /**
     * 门户基址：优先取日报场景绑定的企业应用 {@code base_url}，未配置则回退任一启用应用。
     * <p>与 {@code RdmDailyReportService.resolvePortalBaseUrl} 同口径；缓存 60s，
     * 避免每条通知都查一次配置（改配置最多一分钟后生效）。
     */
    private String portalBaseUrl() {
        long now = System.currentTimeMillis();
        String cached = cachedPortalBase;
        if (StringUtils.hasText(cached) && now - cachedPortalBaseAt < PORTAL_BASE_TTL_MS) {
            return cached;
        }
        String base = firstBaseUrl("SELECT a.base_url FROM sys_notification_scenario s "
                + "JOIN sys_notification_app a ON a.id = s.app_id "
                + "WHERE s.scenario_key = ? AND s.enabled = 1 AND a.enabled = 1 "
                + "AND a.base_url IS NOT NULL AND a.base_url <> '' LIMIT 1",
                NotificationAppService.RDM_DAILY_REPORT);
        if (!StringUtils.hasText(base)) {
            base = firstBaseUrl("SELECT base_url FROM sys_notification_app "
                    + "WHERE enabled = 1 AND base_url IS NOT NULL AND base_url <> '' "
                    + "ORDER BY updated_at DESC LIMIT 1");
        }
        if (StringUtils.hasText(base)) {
            cachedPortalBase = base;
            cachedPortalBaseAt = now;
        }
        return base;
    }

    /** 取首个非空 base_url；读库异常不阻断通知，退化为不改写 */
    private String firstBaseUrl(String sql, Object... args) {
        try {
            List<String> rows = args.length == 0
                    ? jdbcTemplate.queryForList(sql, String.class)
                    : jdbcTemplate.queryForList(sql, String.class, args);
            if (rows == null || rows.isEmpty() || !StringUtils.hasText(rows.get(0))) {
                return null;
            }
            String base = rows.get(0).trim();
            while (base.endsWith("/") || base.endsWith("#")) {
                base = base.substring(0, base.length() - 1);
            }
            return base;
        } catch (RuntimeException e) {
            log.warn("RDM 通知链接补全失败（保留相对链接）: {}", e.getMessage());
            return null;
        }
    }

    /* ==================== 任务22 B.2：事件级去重入队 ==================== */

    /**
     * 按事件级去重键通知<b>单个</b>接收人（一个接收人一行，可去重）。
     *
     * <p>与 {@link #notifyUsers} 的群播行共存：群播行 {@code dedupe_key} 为 NULL（不参与唯一索引），
     * 去重行必须携带完整四元组 —— 这是 238 冻结 DDL 的 {@code ck_rdm_notify_dedupe} 要求的：
     * {@code receiver_user_id} 非空且 &gt; 0 才允许写 {@code dedupe_key}。
     *
     * <p><b>三道防线保证「同键只发一次」</b>：
     * <ol>
     *   <li>入队前先查 {@code dedupe_key} 是否已存在（快路径，避开无谓写入）；</li>
     *   <li>并发竞态由唯一索引 {@code uk_rdm_notify_dedupe} 兜底：
     *       {@link DuplicateKeyException} 被当作「另一路已登记」，<b>不重试、不降级发送</b>；</li>
     *   <li>投递仍由 {@link RdmNotifyDispatcher} 的条件更新抢占领取，同一行不会被发两次。</li>
     * </ol>
     *
     * <p><b>fail-closed</b>：四元组不完整（如接收人为空）时直接返回 {@code false}，
     * 绝不降级成「不知道发给谁就不去重」的群发。
     *
     * @param eventCode    事件编码（{@code RdmConstants.EVENT_*}）
     * @param objectType   去重对象类型（{@code RdmConstants.NOTIFY_OBJECT_*}）
     * @param objectId     去重对象ID（必须 &gt; 0）
     * @param eventVersion {@code VERSION:<并发版本>} 或 {@code DATE:<yyyy-MM-dd>}
     * @param receiverUserId 接收人（认证 SysUser.id，必须 &gt; 0）
     * @param reqId        关联需求ID，可为 null（项目/交付项级通知没有单一需求）
     * @return {@code true} = 本次新入队；{@code false} = 已发过 / 不完整 / 正文为空 / 登记失败
     */
    public boolean notifyDeduped(String eventCode, String objectType, Long objectId, String eventVersion,
                                Long receiverUserId, Long reqId, String title, String text) {
        // 同上：去重行与群播行走同一套链接补全，避免「群报能点、个人通知点不开」
        text = absolutizeLinks(text);
        if (!StringUtils.hasText(text)) {
            log.debug("RDM 去重通知正文為空，按規則不發: event={}, objectType={}, objectId={}",
                    eventCode, objectType, objectId);
            return false;
        }
        String dedupeKey = dedupeService.keyOf(objectType, objectId, eventVersion, receiverUserId);
        if (dedupeKey == null) {
            return false;
        }
        if (dedupeService.alreadyEnqueued(dedupeKey)) {
            log.debug("RDM 通知已出站過，跳過: event={}, objectType={}, objectId={}, eventVersion={}, receiver={}",
                    eventCode, objectType, objectId, eventVersion, receiverUserId);
            return false;
        }
        SysUser receiver = sysUserMapper.selectById(receiverUserId);
        List<String> atMobiles = receiver != null && StringUtils.hasText(receiver.getMobile())
                ? List.of(receiver.getMobile()) : List.of();
        List<String> receiverNames = receiver != null && StringUtils.hasText(receiver.getName())
                ? List.of(receiver.getName()) : List.of();
        Long id;
        try {
            id = insertDedupeTask(eventCode, reqId, title, text, atMobiles, receiverNames,
                    objectType, objectId, eventVersion, receiverUserId, dedupeKey);
        } catch (DuplicateKeyException dup) {
            // 并发竞态：同键已被另一路登记。唯一索引就是为此而设，这里必须静默让位，绝不降级重发
            log.info("RDM 通知併發去重命中唯一索引，已登記過，跳過: event={}, dedupeKey={}", eventCode, dedupeKey);
            return false;
        } catch (RuntimeException e) {
            log.error("RDM 去重通知登記失敗，改為提交後重試登記（絕不直接發送）: event={}, objectType={}, "
                            + "objectId={}, receiver={}, error={}",
                    eventCode, objectType, objectId, receiverUserId, e.getMessage());
            scheduleDedupeReinsert(eventCode, reqId, title, text, atMobiles, receiverNames,
                    objectType, objectId, eventVersion, receiverUserId, dedupeKey);
            return false;
        }
        if (id == null) {
            return false;
        }
        dispatchAfterCommit(id);
        return true;
    }

    /**
     * 登记一条带去重键的投递任务（与群播行同一张队列表，因此重试/抢占/回收语义完全一致）。
     * <p>异常一律向上抛，由 {@link #notifyDeduped} 区分「唯一索引命中」与「其它失败」两种处理。
     */
    private Long insertDedupeTask(String eventCode, Long reqId, String title, String text,
                                 List<String> atMobiles, List<String> receiverNames, String objectType,
                                 Long objectId, String eventVersion, Long receiverUserId, String dedupeKey) {
        String sql = "INSERT INTO rdm_notify_log (req_id, event_code, channel, scenario, title, content, "
                + "at_mobiles, receivers, send_status, attempts, next_retry_at, error_msg, deleted, "
                + "object_type, object_id, event_version, receiver_user_id, dedupe_key) "
                + "VALUES (?, ?, 'DINGTALK', ?, ?, ?, ?, ?, ?, 0, now(), NULL, 0, ?, ?, ?, ?, ?)";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            int idx = 1;
            ps.setObject(idx++, reqId);
            ps.setString(idx++, eventCode);
            ps.setString(idx++, RdmConstants.NOTIFY_SCENARIO);
            ps.setString(idx++, truncate(title, 200));
            ps.setString(idx++, text);
            ps.setString(idx++, join(atMobiles));
            ps.setString(idx++, join(receiverNames));
            ps.setString(idx++, RdmConstants.NOTIFY_STATUS_PENDING);
            ps.setString(idx++, objectType);
            ps.setObject(idx++, objectId);
            ps.setString(idx++, eventVersion);
            ps.setObject(idx++, receiverUserId);
            ps.setString(idx, dedupeKey);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return key == null ? null : key.longValue();
    }

    /**
     * 登记失败后的兼容路径：<b>提交后重试登记</b>，而不是就地直发。
     *
     * <p>旧实现在这里调 {@code dispatcher.sendOnce(...)}，两个后果都不能接受：
     * 事务回滚了消息却已经发出去（不可撤回），并且 {@code sendOnce} 不查 dry-run 开关
     * （联调环境的测试消息直接打到真实群）。现在：
     * <ul>
     *   <li>有活动事务 → 注册 {@code afterCommit}，提交后再试一次登记，成功后走正常投递；</li>
     *   <li>无活动事务 → 立即再试一次登记（仍然不直发）；</li>
     *   <li>再试仍失败 → 记 error 日志留人工补发线索。宁可不发，不可绕过 dry-run 或提交前发送。</li>
     * </ul>
     */
    private void scheduleDedupeReinsert(String eventCode, Long reqId, String title, String text,
                                       List<String> atMobiles, List<String> receiverNames, String objectType,
                                       Long objectId, String eventVersion, Long receiverUserId,
                                       String dedupeKey) {
        Runnable reinsert = () -> {
            try {
                Long id = insertDedupeTask(eventCode, reqId, title, text, atMobiles, receiverNames,
                        objectType, objectId, eventVersion, receiverUserId, dedupeKey);
                if (id == null) {
                    log.error("RDM 去重通知重試登記未取回主鍵，需人工補發: event={}, dedupeKey={}", eventCode, dedupeKey);
                    return;
                }
                dispatcher.dispatch(id);
                log.info("RDM 去重通知提交後重試登記成功，已進入正常投遞隊列: event={}, id={}", eventCode, id);
            } catch (DuplicateKeyException dup) {
                log.info("RDM 去重通知重試時命中唯一索引，說明另一路已登記: event={}, dedupeKey={}", eventCode, dedupeKey);
            } catch (RuntimeException e) {
                log.error("RDM 去重通知重試登記仍失敗，需人工補發（絕不降級直發）: event={}, dedupeKey={}, error={}",
                        eventCode, dedupeKey, e.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    reinsert.run();
                }
            });
        } else {
            reinsert.run();
        }
    }

    /**
     * 登记投递任务。
     * <p>写入失败（例如旧库尚未跑完 2C 迁移）不能让业务回滚，也不能静默丢通知：
     * 记 error 日志并改为「提交后重试登记」（{@link #scheduleLegacyReinsert}），
     * <b>不再就地直发</b> —— 旧实现的 {@code sendOnce} fallback 会在事务提交前发送并绕过 dry-run。
     */
    private Long insertTask(String eventCode, RdmRequirement req, String scenario, String title,
                            String text, List<String> atMobiles, List<String> receiverNames,
                            String status, String error) {
        try {
            return doInsertTask(eventCode, req, scenario, title, text, atMobiles, receiverNames, status, error);
        } catch (RuntimeException e) {
            log.error("RDM 通知任務登記失敗，改為提交後重試登記（絕不繞過 dry-run、絕不在提交前發送）: "
                            + "event={}, req={}, error={}",
                    eventCode, req != null ? req.getReqNo() : null, e.getMessage());
            if ("pending".equals(status)) {
                scheduleLegacyReinsert(eventCode, req, scenario, title, text, atMobiles, receiverNames);
            }
            return null;
        }
    }

    /** 群播行的提交后重试登记（语义同 {@link #scheduleDedupeReinsert}，仅列集不同）。 */
    private void scheduleLegacyReinsert(String eventCode, RdmRequirement req, String scenario, String title,
                                       String text, List<String> atMobiles, List<String> receiverNames) {
        Runnable reinsert = () -> {
            try {
                Long id = doInsertTask(eventCode, req, scenario, title, text, atMobiles, receiverNames,
                        "pending", null);
                if (id == null) {
                    log.error("RDM 通知重試登記未取回主鍵，需人工補發: event={}", eventCode);
                    return;
                }
                dispatcher.dispatch(id);
                log.info("RDM 通知提交後重試登記成功，已進入正常投遞隊列: event={}, id={}", eventCode, id);
            } catch (RuntimeException e) {
                log.error("RDM 通知重試登記仍失敗，需人工補發（絕不降級直發）: event={}, error={}",
                        eventCode, e.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    reinsert.run();
                }
            });
        } else {
            reinsert.run();
        }
    }

    /** 真正执行 INSERT（异常上抛，由调用方决定重试还是让位）。 */
    private Long doInsertTask(String eventCode, RdmRequirement req, String scenario, String title,
                              String text, List<String> atMobiles, List<String> receiverNames,
                              String status, String error) {
        String sql = "INSERT INTO rdm_notify_log (req_id, event_code, channel, scenario, title, content, "
                + "at_mobiles, receivers, send_status, attempts, next_retry_at, error_msg, deleted) "
                + "VALUES (?, ?, 'DINGTALK', ?, ?, ?, ?, ?, ?, 0, "
                + ("pending".equals(status) ? "now()" : "NULL") + ", ?, 0)";
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            int idx = 1;
            ps.setObject(idx++, req == null ? null : req.getId());
            ps.setString(idx++, eventCode);
            ps.setString(idx++, scenario);
            ps.setString(idx++, truncate(title, 200));
            ps.setString(idx++, text);
            ps.setString(idx++, join(atMobiles));
            ps.setString(idx++, join(receiverNames));
            ps.setString(idx++, status);
            ps.setString(idx, error);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return key == null ? null : key.longValue();
    }

    private static String join(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        return truncate(values.stream().filter(StringUtils::hasText).collect(Collectors.joining(",")), 512);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
