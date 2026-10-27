package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.dto.HrAuditVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrOperationAudit;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrOperationAuditMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.util.OperatorResolver;
import com.mftb.admin.util.SensitiveMask;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;

/**
 * 人事操作审计实现。
 * <p>
 * 三条不能让步的口径：
 * <ol>
 *   <li><b>动作码必须是已知动作</b>：写错动作码时宁可抛错让业务回滚，也不要留下一条
 *       界面翻译不出来、统计也归不了类的审计（DB 也有 CHECK 兜底，但服务层先拦在开发期更早暴露）。</li>
 *   <li><b>敏感值在写入时就脱敏</b>，不是查询时脱敏：审计表本身不该持有明文副本，
 *       否则任何拿到库权限的人都能绕过字段权限。</li>
 *   <li><b>没有变更也要留一行</b>：「谁查看了明文」这类动作没有前后值，但它是审计最需要回答的问题之一。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrAuditServiceImpl implements HrAuditService {

    /** 与 DDL 列宽一致：before_value/after_value VARCHAR(500)、detail VARCHAR(500)、reason VARCHAR(255) */
    private static final int MAX_VALUE_LENGTH = 500;
    private static final int MAX_REASON_LENGTH = 255;

    private final HrOperationAuditMapper auditMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public void record(HrAuditEntry entry) {
        if (entry == null || !HrAuditAction.ALL_ACTIONS.contains(entry.getAction())) {
            throw new BusinessException("人事審計動作碼非法：" + (entry == null ? "null" : entry.getAction()));
        }
        if (entry.getUserId() == null) {
            throw new BusinessException("人事審計必須指定目標員工");
        }
        String operator = operatorResolver.currentOperatorName();
        String empNo = resolveEmpNo(entry.getUserId());
        boolean sensitive = HrAuditAction.isSensitiveAction(entry.getAction())
                || entry.getChanges().stream().anyMatch(c -> HrAuditAction.isSensitiveField(c.field()));

        if (entry.getChanges().isEmpty() && !StringUtils.hasText(entry.getDetail())) {
            // 「提交了但什么都没改」不写审计：这种行只会把真正的变更淹没在噪声里
            return;
        }

        if (entry.getChanges().isEmpty()) {
            auditMapper.insert(row(entry, operator, empNo, null, null, null, sensitive));
            return;
        }
        for (HrAuditEntry.FieldChange change : entry.getChanges()) {
            auditMapper.insert(row(entry, operator, empNo, change.field(),
                    SensitiveMask.maskValue(change.field(), change.before()),
                    SensitiveMask.maskValue(change.field(), change.after()), sensitive));
        }
    }

    @Override
    public void recordAction(String action, Long userId, String detail) {
        record(HrAuditEntry.of(action, userId).detail(detail));
    }

    @Override
    public PageResult<HrAuditVO> query(Long userId, String action, String operator,
                                       LocalDate from, LocalDate to, long page, long pageSize) {
        LambdaQueryWrapper<HrOperationAudit> wrapper = new LambdaQueryWrapper<HrOperationAudit>()
                .eq(userId != null, HrOperationAudit::getUserId, userId)
                .eq(StringUtils.hasText(action), HrOperationAudit::getAction, action)
                .like(StringUtils.hasText(operator), HrOperationAudit::getOperator, operator == null ? null : operator.trim())
                .ge(from != null, HrOperationAudit::getOccurredAt, from == null ? null : from.atStartOfDay())
                .le(to != null, HrOperationAudit::getOccurredAt, to == null ? null : to.plusDays(1).atStartOfDay())
                .orderByDesc(HrOperationAudit::getId);
        Page<HrOperationAudit> result = auditMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(pageSize)), wrapper);
        List<HrAuditVO> records = result.getRecords().stream().map(HrAuditVO::from).toList();
        return new PageResult<>(records, result.getTotal());
    }

    private HrOperationAudit row(HrAuditEntry entry, String operator, String empNo,
                                 String field, String before, String after, boolean sensitive) {
        HrOperationAudit row = new HrOperationAudit();
        row.setUserId(entry.getUserId());
        row.setEmpNo(empNo);
        row.setAction(entry.getAction());
        row.setFieldName(field);
        row.setBeforeValue(truncate(before, MAX_VALUE_LENGTH));
        row.setAfterValue(truncate(after, MAX_VALUE_LENGTH));
        row.setDetail(truncate(entry.getDetail(), MAX_VALUE_LENGTH));
        row.setReason(truncate(entry.getReason(), MAX_REASON_LENGTH));
        row.setSourceReqNo(truncate(entry.getSourceReqNo(), 32));
        row.setEffectiveDate(entry.getEffectiveDate());
        row.setSensitive(sensitive ? 1 : 0);
        row.setOperator(truncate(operator, 64));
        // 必须显式赋值：字段标了 @TableField(fill = FieldFill.INSERT)，MyBatis-Plus 会把该列
        // 无条件写进 INSERT，而项目的 MetaObjectHandler 只按名字填 createdAt/updatedAt，
        // 结果是用显式 NULL 覆盖了 DDL 的 DEFAULT CURRENT_TIMESTAMP（审计时间因此全空）。
        // 同一陷阱在 VehicleUseServiceImpl 已踩过，修式一致：写入前自己赋值。
        row.setOccurredAt(java.time.LocalDateTime.now());
        return row;
    }

    /** 工号快照查不到时留空而不是抛错：审计写入失败会连带回滚业务，「查不到历史工号」不值得这个代价 */
    private String resolveEmpNo(Long userId) {
        SysUser user = sysUserMapper.selectById(userId);
        if (user != null) {
            return StringUtils.hasText(user.getEmpId()) ? user.getEmpId() : user.getUsername();
        }
        log.warn("人事审计目标员工不存在，工号快照留空: userId={}", userId);
        return null;
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
