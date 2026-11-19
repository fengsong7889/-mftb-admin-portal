/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.SysUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/**
 * 日报投影服务（阶段三）。
 *
 * <p>它<b>不产生任何新的聚合口径</b>：直接把 {@code [date, date]} 当作区间交给
 * {@link CpmSnapshotBuilder}——那个类是「周期 → 快照」的算式单点，日报只是区间长度为 1 的特例。
 * 另写一份日聚合是最容易想到的实现，也是最快长出第二套数字的开始：
 * 同一天的日报与周报里那一条，两周后一定对不上。
 *
 * <p>也不走 {@link CpmPeriods#resolve}：那套校验服务的是「可发布的周期」，
 * 日报不可发布、没有 {@code biz_cpm_report} 行，把 'day' 塞进去只会让
 * {@code period_type} 的 CHECK 在写库时才拒绝，报出一条没人看得懂约束错误。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmDailyReportService {

    /** 日报档位标识：只在读路径存在，绝不进 {@code biz_cpm_report.period_type} */
    private static final String PERIOD_DAY = "day";

    private final CpmSnapshotBuilder snapshotBuilder;
    private final CpmAccessGuard guard;
    private final CpmPeriods periods;

    /**
     * 某人某天的日报。
     *
     * @param dateStr  yyyy-MM-dd，空=今天
     * @param userIdStr 被查看人；空=本人。给他人时必须是可见范围内成员
     *                  （直属下属或显式授权），否则走 {@code viewableUserIds} 拒绝。
     */
    public CpmDto.DailyVO daily(String dateStr, String userIdStr) {
        SysUser viewer = guard.currentUser();
        LocalDate date = parseDate(dateStr, periods.today());
        if (date.isAfter(periods.today())) {
            // 未来的投入还没有发生：给一个空白日报会让人以为「记了但没显示」，
            // 而按「补记不能早于事件」的同一条纪律，向前看同样不该产生一份看起来像事实的东西
            throw new BusinessException("日報不能查看未來日期");
        }
        long targetUserId = resolveTarget(viewer, userIdStr);

        CpmDto.Snapshot snapshot = snapshotBuilder.build(targetUserId, PERIOD_DAY, date, date);
        CpmDto.DailyVO vo = new CpmDto.DailyVO();
        vo.setDate(date.toString());
        vo.setSnapshot(snapshot);
        boolean self = targetUserId == viewer.getId();
        vo.setSelf(self);
        if (self) {
            vo.setOwnerName(viewer.getName());
            vo.setOwnerEmpId(viewer.getUsername());
        } else {
            SysUser owner = guard.userById(targetUserId);
            vo.setOwnerName(owner == null ? null : owner.getName());
            vo.setOwnerEmpId(owner == null ? null : owner.getUsername());
        }
        return vo;
    }

    /**
     * 归属判定：请求里的 userId 只用来「指名要看谁」，能不能看由可见范围裁决。
     *
     * <p>与汇报详情同一条守卫（{@code viewableUserIds}）：前端传谁都一样被服务端拦，
     * 不信任请求里的身份字段是本模块从第一天就有的纪律。
     */
    private long resolveTarget(SysUser viewer, String userIdStr) {
        if (!StringUtils.hasText(userIdStr)) {
            return viewer.getId();
        }
        long target;
        try {
            target = Long.parseLong(userIdStr.trim());
        } catch (NumberFormatException e) {
            throw new BusinessException("成員標識格式不正確");
        }
        if (target == viewer.getId()) {
            return target;
        }
        if (!guard.viewableUserIds(viewer).contains(target)) {
            throw new BusinessException("無權查看該成員的日報");
        }
        return target;
    }

    /** 缺省日期取 {@link CpmPeriods#today()}：业务时区可配置，这里绝不能自己 now() 一份第二口径。 */
    private static LocalDate parseDate(String dateStr, LocalDate today) {
        if (!StringUtils.hasText(dateStr)) {
            return today;
        }
        try {
            return LocalDate.parse(dateStr.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
    }
}
