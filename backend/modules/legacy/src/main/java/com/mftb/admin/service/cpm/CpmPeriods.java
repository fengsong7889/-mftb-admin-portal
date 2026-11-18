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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * CPM 周期口径的唯一真源（周=周一起、月/季=自然期、业务时区 Asia/Shanghai）。
 *
 * <p>为什么必须单点：期初既被汇报唯一键使用（(user,period,start) 判「同一份」）、
 * 又被催办作业幂等使用、又被前端导航预计算。两套「周一」定义（Locale 差异）
 * 会让同一周的草稿和已发布行并存，用户看到「刚发布又变回草稿」。
 * 服务端一律以本类复核前端传来的期初，不合规直接拒绝。
 */
@Component
public class CpmPeriods {

    @Value("${cpm.business-timezone:Asia/Shanghai}")
    private String businessTimezone;

    public ZoneId zone() {
        return ZoneId.of(businessTimezone);
    }

    /** 今日（业务时区）；条目 workDate、催办判定都从这里取。 */
    public LocalDate today() {
        return LocalDate.now(zone());
    }

    public Period resolve(String periodType, LocalDate start) {
        LocalDate periodStart;
        LocalDate periodEnd;
        switch (periodType) {
            case CpmConstants.PERIOD_WEEK -> {
                if (start.getDayOfWeek() != DayOfWeek.MONDAY) {
                    throw new BusinessException("週期起點必須是週一（與系統週口徑一致）");
                }
                periodStart = start;
                periodEnd = start.plusDays(6);
            }
            case CpmConstants.PERIOD_MONTH -> {
                if (start.getDayOfMonth() != 1) {
                    throw new BusinessException("月週期起點必須是月初");
                }
                periodStart = start;
                periodEnd = start.withDayOfMonth(start.lengthOfMonth());
            }
            case CpmConstants.PERIOD_QUARTER -> {
                int month = start.getMonthValue();
                boolean quarterStart = start.getDayOfMonth() == 1 && (month == 1 || month == 4 || month == 7 || month == 10);
                if (!quarterStart) {
                    throw new BusinessException("季度週期起點必須是自然季首日（1/4/7/10 月 1 日）");
                }
                periodStart = start;
                periodEnd = start.plusMonths(3).minusDays(1);
            }
            default -> throw new BusinessException("不支援的匯報週期");
        }
        return new Period(periodType, periodStart, periodEnd);
    }

    /** 归属期间标（成果档案/认定的季度标签，如 2026-Q4） */
    public String quarterTag(LocalDate date) {
        int quarter = (date.getMonthValue() - 1) / 3 + 1;
        return date.getYear() + "-Q" + quarter;
    }

    public record Period(String periodType, LocalDate start, LocalDate end) {
    }
}
