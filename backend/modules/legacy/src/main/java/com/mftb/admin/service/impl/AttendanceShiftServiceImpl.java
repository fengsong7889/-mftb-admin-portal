package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AttendanceShiftVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.service.AttendanceShiftService;
import com.mftb.admin.util.AttendanceWriteGuard;
import com.mftb.admin.util.OperatorResolver;
import com.mftb.admin.util.SortSupport;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 考勤班次服务实现。
 * <p>
 * 校验口径全部在服务端：前端表单校验只是体验，不能当安全边界。
 * 弹性班次允许不填上下班时刻，非弹性必须填且上下班不得相同；工时一律 DECIMAL，禁止浮点。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceShiftServiceImpl implements AttendanceShiftService {

    private static final String STATUS_ENABLED = "enabled";
    private static final String STATUS_DISABLED = "disabled";

    /** 班次可服务端排序的列白名单（列key → getter）；前端 sorter.columnKey 取同名，未登记列一律忽略 */
    private static final Map<String, SFunction<AttShift, ?>> SHIFT_SORT_ALLOW = Map.of(
            "shiftCode", AttShift::getShiftCode,
            "onTime", AttShift::getOnTime,
            "workHours", AttShift::getWorkHours,
            "updatedAt", AttShift::getUpdatedAt);

    private final AttShiftMapper shiftMapper;
    private final AttGroupMapper groupMapper;
    private final AttScheduleMapper scheduleMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<AttendanceShiftVO> list(long page, long size, String keyword, Integer flexFlag, String status,
                                             String sortField, String sortOrder) {
        LambdaQueryWrapper<AttShift> wrapper = filter(keyword, flexFlag, status);
        // 白名单排序优先，再补 shiftCode 作稳定次级序；无有效排序时仅按 shiftCode 升序（同原默认）
        SortSupport.apply(wrapper, sortField, sortOrder, SHIFT_SORT_ALLOW);
        wrapper.orderByAsc(AttShift::getShiftCode);
        Page<AttShift> result = shiftMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<AttendanceShiftVO> vos = result.getRecords().stream().map(AttendanceShiftVO::of).toList();
        return new PageResult<>(vos, result.getTotal());
    }

    /**
     * 与列表同口径的统计。
     * <p>必须共用 {@link #filter}：统计卡如果单独发一次不带条件的请求，用户改完筛选会
     * 先看到未过滤的全量数字，再看到表格变化，极易误读（AGENTS.md 已因此立门禁）。
     * <p>服务端算而不是前端算：分页后前端只有当页数据，求和会得到错误口径。
     */
    @Override
    public Map<String, Object> stats(String keyword, Integer flexFlag, String status) {
        List<AttShift> rows = shiftMapper.selectList(
                filter(keyword, flexFlag, status).select(AttShift::getStatus, AttShift::getFlexFlag,
                        AttShift::getWorkHours));
        long enabled = 0;
        long flex = 0;
        BigDecimal hours = BigDecimal.ZERO;
        for (AttShift row : rows) {
            if (STATUS_ENABLED.equals(row.getStatus())) {
                enabled++;
            }
            if (row.getFlexFlag() != null && row.getFlexFlag() == 1) {
                flex++;
            }
            if (row.getWorkHours() != null) {
                hours = hours.add(row.getWorkHours());
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", rows.size());
        stats.put("enabled", enabled);
        stats.put("flex", flex);
        stats.put("hours", hours.setScale(1, RoundingMode.HALF_UP));
        return stats;
    }

    /** 列表与统计共用的条件构造器，口径不可能漂移 */
    private LambdaQueryWrapper<AttShift> filter(String keyword, Integer flexFlag, String status) {
        LambdaQueryWrapper<AttShift> wrapper = new LambdaQueryWrapper<>();
        if (flexFlag != null) {
            wrapper.eq(AttShift::getFlexFlag, flexFlag);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(AttShift::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(AttShift::getShiftCode, kw).or().like(AttShift::getShiftName, kw));
        }
        return wrapper;
    }

    @Override
    public AttendanceShiftVO detail(Long id) {
        return AttendanceShiftVO.of(requireShift(id));
    }

    @Override
    public List<Map<String, Object>> options() {
        return shiftMapper.selectList(new LambdaQueryWrapper<AttShift>()
                        .eq(AttShift::getStatus, STATUS_ENABLED)
                        .orderByAsc(AttShift::getShiftCode))
                .stream()
                .map(s -> Map.<String, Object>of(
                        "id", s.getId(),
                        "code", s.getShiftCode(),
                        "name", s.getShiftName(),
                        "flex", s.getFlexFlag() != null && s.getFlexFlag() == 1))
                .toList();
    }

    @Override
    @Transactional
    public AttendanceShiftVO save(AttShift shift) {
        // 实体直接当请求体收，先清掉客户端不得掌控的审计与软删字段
        AttendanceWriteGuard.strip(shift);
        validate(shift);
        String operator = operatorResolver.currentOperatorName();
        AttShift existing = shift.getId() == null ? null : requireShift(shift.getId());
        if (shift.getId() == null) {
            requireCodeUnique(shift.getShiftCode(), null);
            shift.setStatus(isValidStatus(shift.getStatus()) ? shift.getStatus() : STATUS_ENABLED);
            shift.setCreatedBy(operator);
            shift.setUpdatedBy(operator);
            shiftMapper.insert(shift);
        } else {
            // 编码是稳定身份：排班与历史考勤结论都按它追源，不接受编辑请求改写
            // （前端表单已锁定该栏，但前端锁定不是安全边界）。
            // 锁定后编辑路径无需再查编码唯一性：值未变，唯一性在建时已保证。
            shift.setShiftCode(existing.getShiftCode());
            // 表单里可以改状态，不能把提交值静默回退成原值；未传时才保留原值
            if (!isValidStatus(shift.getStatus())) {
                shift.setStatus(existing.getStatus());
            }
            shift.setUpdatedBy(operator);
            shiftMapper.updateById(shift);
        }
        return AttendanceShiftVO.of(requireShift(shift.getId()));
    }

    @Override
    @Transactional
    public AttendanceShiftVO changeStatus(Long id, String status) {
        if (!STATUS_ENABLED.equals(status) && !STATUS_DISABLED.equals(status)) {
            throw new BusinessException("狀態只能為 enabled 或 disabled");
        }
        AttShift shift = requireShift(id);
        shift.setStatus(status);
        shift.setUpdatedBy(operatorResolver.currentOperatorName());
        shiftMapper.updateById(shift);
        return AttendanceShiftVO.of(shift);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        AttShift shift = requireShift(id);
        // 引用检查而不是级联删除：历史排班与考勤结论必须还能追溯到当时的班次名称
        Long usedByGroup = groupMapper.selectCount(new LambdaQueryWrapper<AttGroup>().eq(AttGroup::getShiftId, id));
        if (usedByGroup != null && usedByGroup > 0) {
            throw new BusinessException("該班次已被 " + usedByGroup + " 個考勤組引用，請改用停用");
        }
        Long usedBySchedule = scheduleMapper.selectCount(new LambdaQueryWrapper<AttSchedule>().eq(AttSchedule::getShiftId, id));
        if (usedBySchedule != null && usedBySchedule > 0) {
            throw new BusinessException("該班次已存在排班記錄，請改用停用");
        }
        shiftMapper.deleteById(id);
    }

    /* ==================== 校验 ==================== */

    private AttShift requireShift(Long id) {
        if (id == null) {
            throw new BusinessException("班次ID必填");
        }
        AttShift shift = shiftMapper.selectById(id);
        if (shift == null) {
            throw new BusinessException("班次不存在或已刪除");
        }
        return shift;
    }

    private void validate(AttShift shift) {
        if (!StringUtils.hasText(shift.getShiftCode()) || !StringUtils.hasText(shift.getShiftName())) {
            throw new BusinessException("班次編碼與名稱均為必填");
        }
        if (!shift.getShiftCode().matches("^[A-Z]{2}\\d{2,3}$")) {
            throw new BusinessException("班次編碼格式應為 SH + 2~3 位序號");
        }
        boolean flex = shift.getFlexFlag() != null && shift.getFlexFlag() == 1;
        if (!flex) {
            LocalTime on = shift.getOnTime();
            LocalTime off = shift.getOffTime();
            if (on == null || off == null) {
                throw new BusinessException("非彈性班次必須填寫上下班時間");
            }
            if (on.equals(off)) {
                throw new BusinessException("上下班時間不能相同");
            }
        }
        if (shift.getWorkHours() == null || shift.getWorkHours().compareTo(BigDecimal.ZERO) <= 0
                || shift.getWorkHours().compareTo(new BigDecimal("24")) > 0) {
            throw new BusinessException("標準工時必須在 0~24 小時之間");
        }
        if (shift.getRestStart() != null && shift.getRestEnd() == null
                || shift.getRestStart() == null && shift.getRestEnd() != null) {
            throw new BusinessException("休息時段需同時填寫開始與結束");
        }
        if (StringUtils.hasText(shift.getStatus()) && !isValidStatus(shift.getStatus())) {
            throw new BusinessException("狀態只能為 enabled 或 disabled");
        }
    }

    private static boolean isValidStatus(String status) {
        return STATUS_ENABLED.equals(status) || STATUS_DISABLED.equals(status);
    }

    private void requireCodeUnique(String code, Long excludeId) {
        Long dup = shiftMapper.selectCount(new LambdaQueryWrapper<AttShift>()
                .eq(AttShift::getShiftCode, code)
                .ne(excludeId != null, AttShift::getId, excludeId));
        if (dup != null && dup > 0) {
            throw new BusinessException("班次編碼 " + code + " 已存在");
        }
    }
}
