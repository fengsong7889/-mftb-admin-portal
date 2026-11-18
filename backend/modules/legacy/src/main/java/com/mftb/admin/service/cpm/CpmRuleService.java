/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmRule;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmRuleMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 汇报规则服务：全局单行配置的读写与「接收人解析」。
 *
 * <p>接收人模型（方案 §五-D）：直属上级（按 sys_department.leader 姓名匹配，
 * 沿用 ApproverResolverService 的既有口径）+ 追加名单。解析失败（leader 是自由文本、
 * 可能匹配不到用户）不阻断发布——送达降级为「站内可见 + 日志」，汇报本身不能因为
 * 组织数据缺失而发不出去。
 */
@Service
@RequiredArgsConstructor
public class CpmRuleService {

    private final CpmRuleMapper ruleMapper;
    private final SysUserMapper userMapper;
    private final OperatorResolver operatorResolver;
    private final CpmAccessGuard guard;

    /** 读默认规则（缺行时回显内置默认值而不是报错：治理页要能打开才能修）。 */
    public CpmDto.RuleVO read() {
        guard.currentUser();
        return readInternal();
    }

    /**
     * 定时任务专用读取：调度线程没有登录态，走 {@link #read()} 会被
     * {@code guard.currentUser()} 抛「登錄狀態失效」直接打断整条催办扫描——
     * 表现是「规则页看着正常，催办一次也没发出去」。规则行本身是全局单行配置，
     * 权限门禁留在 Controller 层，不在这里重复判定第二遍。
     */
    public CpmDto.RuleVO readForScheduler() {
        return readInternal();
    }

    private CpmDto.RuleVO readInternal() {
        CpmRule row = ruleMapper.findDefault();
        CpmDto.RuleVO vo = new CpmDto.RuleVO();
        vo.setNotifyDryRun(Boolean.parseBoolean(System.getProperty("cpm.notify.dry-run",
                System.getenv().getOrDefault("CPM_NOTIFY_DRY_RUN", "true"))));
        if (row == null) {
            vo.setEnabled(true);
            vo.setPeriodTypes(List.of(CpmConstants.PERIOD_WEEK));
            vo.setDeadlineDay(5);
            vo.setDeadlineTime("18:00");
            vo.setRemindBeforeHours(4);
            vo.setReceiverManager(true);
            vo.setGroupPush(true);
            vo.setPersonalPush(true);
            return vo;
        }
        vo.setEnabled(!Integer.valueOf(0).equals(row.getEnabled()));
        vo.setPeriodTypes(parsePeriodTypes(row.getPeriodTypesJson()));
        vo.setDeadlineDay(row.getDeadlineDay());
        vo.setDeadlineTime(row.getDeadlineTime());
        vo.setRemindBeforeHours(row.getRemindBeforeHours());
        vo.setReceiverManager(!Integer.valueOf(0).equals(row.getReceiverManager()));
        List<Long> extra = parseIds(row.getExtraReceiverIds());
        vo.setExtraReceiverIds(extra);
        vo.setExtraReceiverNames(namesOf(extra));
        vo.setGroupPush(!Integer.valueOf(0).equals(row.getGroupPush()));
        vo.setPersonalPush(!Integer.valueOf(0).equals(row.getPersonalPush()));
        vo.setRemark(row.getRemark());
        vo.setUpdatedBy(row.getUpdatedBy());
        vo.setUpdatedAt(row.getUpdatedAt() == null ? null : row.getUpdatedAt().toString());
        return vo;
    }

    /** 快照表里没有接收人列：送达口径 = 直属上级(1) + 追加名单（本方法给 ReportVO 的 receiverCount 用）。 */
    public int receiverCountFor(long reportUserId) {
        CpmRule row = ruleMapper.findDefault();
        if (row == null || Integer.valueOf(0).equals(row.getEnabled())) {
            // 规则关闭时送达面收缩为 0：receiverCount=0 如实显示「仅站内」
            return 0;
        }
        int count = 0;
        if (!Integer.valueOf(0).equals(row.getReceiverManager()) && resolveManagerId(reportUserId) != null) {
            count++;
        }
        count += parseIds(row.getExtraReceiverIds()).stream()
                .filter(id -> id != reportUserId).count();
        return count;
    }

    /** 发布送达对象：直属上级 + 追加名单（去掉本人）。 */
    public List<Long> resolveReceivers(long reportUserId) {
        CpmRule row = ruleMapper.findDefault();
        if (row == null || Integer.valueOf(0).equals(row.getEnabled())) {
            return List.of();
        }
        List<Long> ids = new ArrayList<>();
        if (!Integer.valueOf(0).equals(row.getReceiverManager())) {
            Long managerId = resolveManagerId(reportUserId);
            if (managerId != null && managerId != reportUserId) {
                ids.add(managerId);
            }
        }
        for (Long id : parseIds(row.getExtraReceiverIds())) {
            if (!id.equals(reportUserId) && !ids.contains(id)) {
                ids.add(id);
            }
        }
        return ids;
    }

    public boolean personalPushEnabled() {
        CpmRule row = ruleMapper.findDefault();
        return row != null && !Integer.valueOf(0).equals(row.getEnabled())
                && !Integer.valueOf(0).equals(row.getPersonalPush());
    }

    public boolean groupPushEnabled() {
        CpmRule row = ruleMapper.findDefault();
        return row != null && !Integer.valueOf(0).equals(row.getEnabled())
                && !Integer.valueOf(0).equals(row.getGroupPush());
    }

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.RuleVO save(CpmDto.RuleForm form) {
        SysUser current = guard.currentUser();
        if (form.getDeadlineDay() < 1 || form.getDeadlineDay() > 7) {
            throw new BusinessException("截止星期必須在 1-7");
        }
        if (form.getDeadlineTime() == null || !form.getDeadlineTime().matches("\\d{2}:\\d{2}")) {
            throw new BusinessException("截止時刻格式應為 HH:mm");
        }
        if (form.getRemindBeforeHours() < 0 || form.getRemindBeforeHours() > 72) {
            throw new BusinessException("催辦提前量應在 0-72 小時");
        }
        List<String> periodTypes = form.getPeriodTypes() == null ? List.of() : form.getPeriodTypes().stream()
                .filter(CpmConstants.PERIOD_WEEK::equals)
                // 一期只放开周报周期（月/季汇报手动生成即可；自动催办与推送先只对周报生效）
                .toList();
        if (periodTypes.isEmpty()) {
            periodTypes = List.of(CpmConstants.PERIOD_WEEK);
        }
        CpmRule row = ruleMapper.findDefault();
        boolean isNew = row == null;
        if (isNew) {
            row = new CpmRule();
            row.setRuleSlot(CpmConstants.RULE_SLOT_DEFAULT);
        }
        row.setEnabled(Boolean.TRUE.equals(form.getEnabled()) ? 1 : 0);
        row.setPeriodTypesJson(JsonUtils.toJson(periodTypes));
        row.setDeadlineDay(form.getDeadlineDay());
        row.setDeadlineTime(form.getDeadlineTime());
        row.setRemindBeforeHours(form.getRemindBeforeHours());
        row.setReceiverManager(Boolean.TRUE.equals(form.getReceiverManager()) ? 1 : 0);
        List<Long> extra = form.getExtraReceiverIds() == null ? List.of() : form.getExtraReceiverIds();
        // 前后带逗号存储（与 meeting admin_user_ids 同口径）：LIKE ',12,' 精确匹配，避免 123 误中 12
        row.setExtraReceiverIds(extra.isEmpty() ? "" : "," + String.join(",", extra.stream().map(String::valueOf).toList()) + ",");
        row.setGroupPush(Boolean.TRUE.equals(form.getGroupPush()) ? 1 : 0);
        row.setPersonalPush(Boolean.TRUE.equals(form.getPersonalPush()) ? 1 : 0);
        row.setRemark(form.getRemark() == null ? null : form.getRemark().trim());
        // 审计列显式落值：fill 注解只覆盖时间，updatedBy 留 NULL 会让 INSERT/UPDATE 一起撞 NOT NULL
        row.setUpdatedBy(current.getName());
        if (isNew) {
            row.setCreatedBy(current.getName());
            ruleMapper.insert(row);
        } else {
            ruleMapper.updateById(row);
        }
        return read();
    }

    /** 直属上级：员工所属部门 leader（姓名匹配）。数据不全时返回 null——降级为仅站内可见。 */
    private Long resolveManagerId(long userId) {
        SysUser user = userMapper.selectById(userId);
        if (user == null || user.getDepartmentId() == null) {
            return null;
        }
        CpmDerivedReader reader = findManagerByDepartment(user.getDepartmentId());
        return reader == null ? null : reader.id();
    }

    /** 部门主管按姓名匹配在职用户（口径同 ApproverResolverService，找不到属数据不全非异常）。 */
    private CpmDerivedReader findManagerByDepartment(Long departmentId) {
        SysUser manager = userMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1).eq(SysUser::getDeleted, 0)
                .apply("EXISTS (SELECT 1 FROM sys_department d WHERE d.id = {0} AND d.deleted = 0 AND d.leader = sys_user.name)",
                        departmentId)
                .last("LIMIT 1"));
        return manager == null ? null : new CpmDerivedReader(manager.getId(), manager.getName());
    }

    private record CpmDerivedReader(Long id, String name) {
    }

    private List<String> parsePeriodTypes(String json) {
        List<String> list = JsonUtils.parseStringList(json);
        return list.isEmpty() ? List.of(CpmConstants.PERIOD_WEEK) : list;
    }

    private static List<Long> parseIds(String csv) {
        if (!StringUtils.hasText(csv)) {
            return List.of();
        }
        return Arrays.stream(csv.split(","))
                .map(String::trim).filter(StringUtils::hasText)
                .filter(s -> s.matches("\\d{1,19}"))
                .map(Long::valueOf).distinct().toList();
    }

    private List<String> namesOf(List<Long> ids) {
        List<String> out = new ArrayList<>();
        for (Long id : ids) {
            SysUser u = userMapper.selectById(id);
            if (u != null) {
                out.add(u.getName());
            }
        }
        return out;
    }
}
