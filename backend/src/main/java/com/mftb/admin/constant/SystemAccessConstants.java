package com.mftb.admin.constant;

import java.util.List;
import java.util.Set;

/**
 * 系統權限申請（企業門戶「我要申請」）常量。
 * <p>
 * 业务链路：門戶未授權系統卡片 →「我要申請」→ 申請頁<b>陳述使用訴求</b>（使用場景 + 使用期限 + 說明 + 憑證），
 * 可選地指向一個「開放自助申請」的參考角色 → 復用 OA 引擎發起 {@code system_access} 流程（編號 XTSQ）
 * → 審批人在流程上指定授權角色 → 全部節點通過後把該角色綁定到申請人 {@code sys_user.function_roles}，權限立即生效。
 * <p>
 * 口徑約定（與用戶確認）：
 * <ol>
 *   <li>只支持「授權角色」：角色/部門各自持有哪些權限一律在權限管理系統配置，
 *       本流程不改菜單授權、不改部門歸屬（{@code sys_user.department_id} 是人事事實，不得由權限申請改動）。</li>
 *   <li><b>申請人不勾選菜單功能</b>（2026-10 改口径，对齐 Entra Access Packages / SailPoint business role）：
 *       菜单级清单会把目标系统的功能全貌摊给一个对它零权限的人（架构泄露），并且勾选树 +「全选」
 *       与最小权限原则反向（诱导过度授权）；「需要哪些功能」本属审批人的专业判断。
 *       改为申请人陈述业务诉求，可选地指定一个参考角色，最终授予哪个角色仍由审批人决定。</li>
 *   <li>参考角色只从「开放自助申请」的目录里选（{@code sys_role.self_service_requestable=1}），
 *       它是<b>纯建议值</b>，不进入任何授权写入路径——兑现前仍按 {@code requireGrantableRole} 逐条复核。</li>
 *   <li>審批鏈默認降級為單節點「主管審批」（流程配置節點留空），管理員可在「流程配置」隨時編排。</li>
 * </ol>
 */
public final class SystemAccessConstants {

    private SystemAccessConstants() {
    }

    /* ==================== OA 流程 ==================== */

    /** 流程编码（biz_oa_process.process_code / biz_workflow_config.flow_type） */
    public static final String PROCESS_CODE = "system_access";

    /** 流程定义名称（种子与列表展示同源） */
    public static final String PROCESS_NAME = "系統權限申請";

    /**
     * 流程编号规则 key（sys_biz_seq_rule.rule_key）：XTSQ + YYYYMMDD + 2 位日流水。
     * <p>与 {@link com.mftb.admin.util.BizSeqService#RULE_SYSTEM_ACCESS_REQUEST} 同值，
     * 常量放这里是为了让「业务口径」与「发号映射」各自可读；发号只认 BizSeqService 的常量。
     */
    public static final String SEQ_RULE_KEY = "system_access_request";

    /** 编号前缀（登记进「編號生成規則」页，便于追溯） */
    public static final String SEQ_PREFIX = "XTSQ";

    /* ==================== 授权对象 ==================== */

    /**
     * 授权对象类型：角色。
     * <p>目前只有这一种：部门授权没有落点（用户只属于一个部门，改 department_id 等同调岗，
     * 会连带影响人事/考勤/数据范围归属），故不提供。列保留类型字段是为将来扩展不必改表。
     */
    public static final String TARGET_TYPE_ROLE = "role";

    /** 合法授权对象类型白名单（写入前校验，拒绝前端传任意字符串） */
    public static final Set<String> ALLOWED_TARGET_TYPES = Set.of(TARGET_TYPE_ROLE);

    /* ==================== 使用诉求（申请人视角，不涉及任何菜单/权限点） ==================== */

    /** 使用场景：日常查看（查询、浏览业务数据） */
    public static final String SCENARIO_DAILY_VIEW = "daily_view";
    /** 使用场景：数据核对（对账、核销、异常核查） */
    public static final String SCENARIO_DATA_CHECK = "data_check";
    /** 使用场景：报表与导出 */
    public static final String SCENARIO_REPORT_EXPORT = "report_export";
    /** 使用场景：审批与流程处理 */
    public static final String SCENARIO_APPROVAL_OPS = "approval_ops";
    /** 使用场景：配置与维护（规则、基础数据） */
    public static final String SCENARIO_CONFIG_MAINTAIN = "config_maintain";
    /** 使用场景：其它（必须在诉求说明里写清） */
    public static final String SCENARIO_OTHER = "other";

    /**
     * 使用场景白名单：只落 code，展示名由前端 i18n 负责。
     * <p>场景是「业务动作粒度」而不是「菜单粒度」——这是本次改口径的关键：
     * 申请人能表达自己要做什么，但拿不到、也不需要拿到系统的功能分解。
     */
    public static final List<String> ALLOWED_SCENARIOS = List.of(
            SCENARIO_DAILY_VIEW, SCENARIO_DATA_CHECK, SCENARIO_REPORT_EXPORT,
            SCENARIO_APPROVAL_OPS, SCENARIO_CONFIG_MAINTAIN, SCENARIO_OTHER);

    /**
     * 使用期限：长期（不设到期日，永不自动回收）
     */
    public static final String DURATION_PERMANENT = "permanent";
    /** 使用期限：至指定日期（需同时给出 durationUntil；到期次日起自动回收） */
    public static final String DURATION_UNTIL = "until";

    /** 期限类型白名单 */
    public static final Set<String> ALLOWED_DURATION_TYPES = Set.of(DURATION_PERMANENT, DURATION_UNTIL);

    /**
     * 期限最远可填年数：防脏数据（填到 9999 年的日期没有业务意义，还会让列表排序失真）。
     * <p>选了「至指定日期」的授权，到期当天仍可用、次日起由 {@code SystemAccessExpiryJob} 自动收回；
     * 「长期」永不回收。前端必须把这条规则如实告知申请人（不能只当审批依据）。
     */
    public static final int MAX_DURATION_YEARS = 10;

    /**
     * 内置超管角色编码：永远不允许通过本流程绑定。
     * <p>与 {@code PermissionServiceImpl.SUPER_ADMIN_ROLE_CODE} 对齐；绑定它等于把整个平台交出去，
     * 审批人无权这么做（超管本就直通所有系统，也不会出现在候选列表里）。
     */
    public static final String SUPER_ADMIN_ROLE_CODE = "admin";

    /* ==================== 单据状态（与 OA flow_status 同源） ==================== */

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_APPROVED = "approved";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_CANCELLED = "cancelled";

    /* ==================== 授权兑现状态 ==================== */

    /** 尚未兑现（审批中/被驳回/被撤销） */
    public static final String GRANT_NONE = "none";
    /**
     * 已兑现：角色已绑定到申请人。
     * <p>只有这两个值，没有 failed：兑现与审批同事务，失败一律向上抛让审批整体回滚
     * （见 {@code SystemAccessGrantService} 类注释），不会留下「已通过但未兑现」的中间态。
     * 它同时是幂等闸门：重复回调看到 granted 直接跳过。
     */
    public static final String GRANT_GRANTED = "granted";

    /* ==================== 到期回收状态 ==================== */

    /** 未回收（默认）：也是定时任务的认领条件，改成其他值即表示本轮已处理 */
    public static final String REVOKE_NONE = "none";
    /** 已回收：角色已从申请人 function_roles 里移除，并写了 REVOKE 审计 */
    public static final String REVOKE_REVOKED = "revoked";
    /**
     * 不回收：同一申请人因**其他仍有效的授权单**也拿着这个角色，到期时不能把它抽走。
     * <p>标成终态而不是停在 none：否则每天都会被扫一遍，日志里永远挂着同一张单。
     */
    public static final String REVOKE_KEPT = "kept";

    /**
     * 回收执行者标识（写进 {@code revoked_by}）：与真人审批人签名区分，
     * 让事后追查能一眼看出「这条权限是到期作业收的，不是谁手动改的」。
     */
    public static final String EXPIRY_OPERATOR = "system-expiry";

    /* ==================== 表单字段（biz_oa_request.form_data 内的键） ==================== */

    /** 审批人配置的授权对象（审批时合并写入 form_data，终审回调据此兑现） */
    public static final String FORM_KEY_APPROVED_GRANT = "approvedGrant";
    public static final String FORM_KEY_SYSTEM_CODE = "systemCode";
    public static final String FORM_KEY_SYSTEM_NAME = "systemName";
    public static final String FORM_KEY_REASON = "reason";
    /** 使用场景 code 列表（申请人陈述诉求，不含任何菜单信息） */
    public static final String FORM_KEY_SCENARIOS = "scenarios";
    public static final String FORM_KEY_DURATION_TYPE = "durationType";
    public static final String FORM_KEY_DURATION_UNTIL = "durationUntil";
    /** 申请人建议的参考角色（纯展示/建议，授权以 approvedGrant 为准） */
    public static final String FORM_KEY_PREFERRED_ROLE_ID = "preferredRoleId";
    public static final String FORM_KEY_PREFERRED_ROLE_NAME = "preferredRoleName";
    /**
     * 历史单据的勾选菜单键（2026-10 前的申请单 form_data / requested_menus 里存在）。
     * <p>只用于解析旧单回看，新单不再写入：新口径不采集菜单，见类注释第 2 条。
     */
    public static final String FORM_KEY_REQUESTED_MENUS = "requestedMenus";
    public static final String FORM_KEY_MENU_KEY = "menuKey";
    public static final String FORM_KEY_MENU_NAME = "name";
    /** 凭证只存业务表 MEDIUMTEXT 列，form_data(TEXT) 里仅留数量，避免撑爆列宽 */
    public static final String FORM_KEY_ATTACHMENT_COUNT = "attachmentCount";
    public static final String FORM_KEY_TARGET_TYPE = "targetType";
    public static final String FORM_KEY_TARGET_ID = "targetId";
    public static final String FORM_KEY_TARGET_NAME = "targetName";

    /* ==================== 输入上限（服务端强制，前端只做提示） ==================== */

    /** 使用诉求（申请说明）长度上限 */
    public static final int REASON_MAX_LENGTH = 1000;
    /** 凭证数量上限（与 AI 使用申请一致） */
    public static final int MAX_ATTACHMENTS = 5;
    /** 单个凭证字节上限（base64 解码前的原始文件大小） */
    public static final long MAX_ATTACHMENT_BYTES = 2L * 1024 * 1024;
    /** 全部凭证字节上限：业务表列是 MEDIUMTEXT(16MB)，留足余量给 JSON 结构与 base64 膨胀 */
    public static final long MAX_TOTAL_ATTACHMENT_BYTES = 8L * 1024 * 1024;
    /** 凭证 MIME 白名单：图片 + PDF，与 AI 使用申请同口径 */
    public static final Set<String> ALLOWED_ATTACHMENT_TYPES = Set.of(
            "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf");
    /** 凭证类型别名（前端归类用）→ 允许的 MIME 前缀 */
    public static final List<String> ALLOWED_ATTACHMENT_KINDS = List.of("image", "pdf");

    /** 是否系统权限申请流程（OA 回调分发用） */
    public static boolean isSystemAccessProcess(String processCode) {
        return PROCESS_CODE.equals(processCode);
    }
}
