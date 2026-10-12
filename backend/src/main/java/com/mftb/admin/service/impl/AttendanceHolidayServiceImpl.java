package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AttendanceHolidayVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttHoliday;
import com.mftb.admin.mapper.AttHolidayMapper;
import com.mftb.admin.service.AttendanceHolidayService;
import com.mftb.admin.util.AttendanceWriteGuard;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 考勤节假日日历服务实现。
 * <p>
 * 唯一性按「日期」判而不是按名称：同一天被两条记录声明成法定节假日与调休上班，
 * 汇总会同时按两种口径算，属于必须启动即拒的错账。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceHolidayServiceImpl implements AttendanceHolidayService {

    private static final String STATUS_ENABLED = "enabled";
    private static final String STATUS_DISABLED = "disabled";

    private static final Set<Integer> VALID_TYPES = Set.of(
            AttHoliday.TYPE_LEGAL, AttHoliday.TYPE_SWAP_WORKDAY, AttHoliday.TYPE_COMPANY);

    private final AttHolidayMapper holidayMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AttendanceHolidayVO> list(long page, long size, Integer yearNo, Integer holidayType,
                                                String keyword, String status) {
        Page<AttHoliday> result = holidayMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)),
                filter(yearNo, holidayType, keyword, status).orderByAsc(AttHoliday::getHolidayDate));
        List<AttendanceHolidayVO> vos = result.getRecords().stream().map(AttendanceHolidayVO::of).toList();
        return new PageResult<>(vos, result.getTotal());
    }

    /**
     * 与列表同口径的统计。
     * <p>共用 {@link #filter} 而不是另写一份条件：统计卡一旦与列表口径漂移，
     * 用户改完筛选会先看到未过滤的全量数字，极易误读（AGENTS.md 已因此立门禁）。
     */
    @Override
    public Map<String, Object> stats(Integer yearNo, Integer holidayType, String keyword, String status) {
        List<AttHoliday> rows = holidayMapper.selectList(
                filter(yearNo, holidayType, keyword, status).select(AttHoliday::getHolidayType));
        long legal = 0;
        long swap = 0;
        long company = 0;
        for (AttHoliday row : rows) {
            Integer type = row.getHolidayType();
            if (type == null) {
                continue;
            }
            if (type == AttHoliday.TYPE_LEGAL) {
                legal++;
            } else if (type == AttHoliday.TYPE_SWAP_WORKDAY) {
                swap++;
            } else if (type == AttHoliday.TYPE_COMPANY) {
                company++;
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", rows.size());
        stats.put("legal", legal);
        stats.put("swap", swap);
        stats.put("company", company);
        return stats;
    }

    /** 列表与统计共用的条件构造器 */
    private LambdaQueryWrapper<AttHoliday> filter(Integer yearNo, Integer holidayType, String keyword, String status) {
        LambdaQueryWrapper<AttHoliday> wrapper = new LambdaQueryWrapper<>();
        if (yearNo != null) {
            wrapper.eq(AttHoliday::getYearNo, yearNo);
        }
        if (holidayType != null) {
            wrapper.eq(AttHoliday::getHolidayType, holidayType);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(AttHoliday::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            wrapper.like(AttHoliday::getHolidayName, keyword.trim());
        }
        return wrapper;
    }

    @Override
    public AttendanceHolidayVO detail(Long id) {
        return AttendanceHolidayVO.of(requireHoliday(id));
    }

    private static boolean isValidStatus(String status) {
        return STATUS_ENABLED.equals(status) || STATUS_DISABLED.equals(status);
    }

    @Override
    public List<AttendanceHolidayVO> listByYear(Integer yearNo) {
        if (yearNo == null) {
            throw new BusinessException("年度為必填");
        }
        return holidayMapper.selectList(new LambdaQueryWrapper<AttHoliday>()
                .eq(AttHoliday::getYearNo, yearNo)
                .eq(AttHoliday::getStatus, STATUS_ENABLED)
                .orderByAsc(AttHoliday::getHolidayDate))
                .stream().map(AttendanceHolidayVO::of).toList();
    }

    @Override
    @Transactional
    public AttendanceHolidayVO save(AttHoliday holiday) {
        // 实体直接当请求体收，先清掉客户端不得掌控的审计与软删字段
        AttendanceWriteGuard.strip(holiday);
        if (holiday.getHolidayDate() == null || !StringUtils.hasText(holiday.getHolidayName())) {
            throw new BusinessException("日期與名稱均為必填");
        }
        if (holiday.getHolidayType() == null || !VALID_TYPES.contains(holiday.getHolidayType())) {
            throw new BusinessException("節假日類型不合法");
        }
        if (StringUtils.hasText(holiday.getStatus()) && !isValidStatus(holiday.getStatus())) {
            throw new BusinessException("狀態只能為 enabled 或 disabled");
        }
        holiday.setYearNo(holiday.getHolidayDate().getYear());
        String operator = operatorResolver.currentOperatorName();
        AttHoliday sameDay = holidayMapper.selectOne(new LambdaQueryWrapper<AttHoliday>()
                .eq(AttHoliday::getHolidayDate, holiday.getHolidayDate())
                .ne(holiday.getId() != null, AttHoliday::getId, holiday.getId())
                .last("LIMIT 1"));
        if (sameDay != null) {
            throw new BusinessException(holiday.getHolidayDate() + " 已存在日曆記錄（" + sameDay.getHolidayName() + "），請直接編輯該條");
        }
        if (holiday.getId() == null) {
            holiday.setStatus(isValidStatus(holiday.getStatus()) ? holiday.getStatus() : STATUS_ENABLED);
            holiday.setCreatedBy(operator);
            holiday.setUpdatedBy(operator);
            holidayMapper.insert(holiday);
        } else {
            AttHoliday existing = requireHoliday(holiday.getId());
            // 表单可改状态：提交合法值时不得被静默回退成原值，未传时才保留
            if (!isValidStatus(holiday.getStatus())) {
                holiday.setStatus(existing.getStatus());
            }
            holiday.setUpdatedBy(operator);
            holidayMapper.updateById(holiday);
        }
        return AttendanceHolidayVO.of(requireHoliday(holiday.getId()));
    }

    @Override
    @Transactional
    public AttendanceHolidayVO changeStatus(Long id, String status) {
        if (!isValidStatus(status)) {
            throw new BusinessException("狀態只能為 enabled 或 disabled");
        }
        AttHoliday holiday = requireHoliday(id);
        holiday.setStatus(status);
        holiday.setUpdatedBy(operatorResolver.currentOperatorName());
        holidayMapper.updateById(holiday);
        return AttendanceHolidayVO.of(holiday);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireHoliday(id);
        holidayMapper.deleteById(id);
    }

    private AttHoliday requireHoliday(Long id) {
        if (id == null) {
            throw new BusinessException("節假日記錄ID必填");
        }
        AttHoliday holiday = holidayMapper.selectById(id);
        if (holiday == null) {
            throw new BusinessException("節假日記錄不存在或已刪除");
        }
        return holiday;
    }
}
