package com.mftb.admin.dto;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 一条人事审计的写入参数。
 * <p>
 * 用链式而不是七个重载参数：调用点大多只填 action/userId + 变更清单，
 * 但「原因 / 来源单号 / 生效日」在单据类动作里是必填的 —— 参数顺序写错不会报错，
 * 只会把审计的原因列留空，而审计最怕的就是看起来完整、其实缺关键字段。
 * {@link #change} 只在值真的不同时记录：把「提交了但没改」写成变更会淹掉真实信号。
 */
public class HrAuditEntry {

    /** 单字段变更 */
    public record FieldChange(String field, Object before, Object after) {
    }

    private final String action;
    private final Long userId;
    private final List<FieldChange> changes = new ArrayList<>();
    private String detail;
    private String reason;
    private String sourceReqNo;
    private LocalDate effectiveDate;

    private HrAuditEntry(String action, Long userId) {
        this.action = action;
        this.userId = userId;
    }

    public static HrAuditEntry of(String action, Long userId) {
        return new HrAuditEntry(action, userId);
    }

    /** 值相等（含两边都空）时不记这一行 */
    public HrAuditEntry change(String field, Object before, Object after) {
        if (!same(before, after)) {
            changes.add(new FieldChange(field, before, after));
        }
        return this;
    }

    /** 无条件记一行（用于「明文查看」这类没有前后值、只有发生事实的动作） */
    public HrAuditEntry note(String field, Object value) {
        changes.add(new FieldChange(field, null, value));
        return this;
    }

    public HrAuditEntry detail(String detail) {
        this.detail = detail;
        return this;
    }

    public HrAuditEntry reason(String reason) {
        this.reason = reason;
        return this;
    }

    public HrAuditEntry sourceReqNo(String sourceReqNo) {
        this.sourceReqNo = sourceReqNo;
        return this;
    }

    public HrAuditEntry effectiveDate(LocalDate effectiveDate) {
        this.effectiveDate = effectiveDate;
        return this;
    }

    public String getAction() {
        return action;
    }

    public Long getUserId() {
        return userId;
    }

    public List<FieldChange> getChanges() {
        return changes;
    }

    public String getDetail() {
        return detail;
    }

    public String getReason() {
        return reason;
    }

    public String getSourceReqNo() {
        return sourceReqNo;
    }

    public LocalDate getEffectiveDate() {
        return effectiveDate;
    }

    /** 空串与 null 视为同值，避免「前端把没填的字段回传成空串」被记成一次变更 */
    private static boolean same(Object before, Object after) {
        String left = normalize(before);
        String right = normalize(after);
        return left.equals(right);
    }

    private static String normalize(Object value) {
        if (value == null) {
            return "";
        }
        String text = String.valueOf(value).trim();
        return text;
    }
}
