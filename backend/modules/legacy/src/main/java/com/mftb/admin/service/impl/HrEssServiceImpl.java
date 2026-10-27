package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrEssConstants;
import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.dto.HrLifecycleVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrEssService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 員工自助（ESS）服务实现。
 * <p>
 * 数据范围在本类内部**硬编码为登录人**：所有查询都以 {@code user_id = 当前用户} 起过滤，
 * 不接受入参指定员工，因此普通员工即便没有任何 hr-* 菜单也能自助查看自己的单据与档案，
 * 同时无法探测他人数据。
 */
@Service
@RequiredArgsConstructor
public class HrEssServiceImpl implements HrEssService {

    private final HrLifecycleRequestMapper lifecycleMapper;
    private final EmployeeService employeeService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<HrLifecycleVO> myRequests(long page, long size, String type, String status) {
        Long me = currentUserId();
        if (StringUtils.hasText(type) && !HrLifecycleConstants.isValidType(type)) {
            throw new BusinessException("無效的單據類型: " + type);
        }
        LambdaQueryWrapper<HrLifecycleRequest> wrapper = new LambdaQueryWrapper<HrLifecycleRequest>()
                .eq(HrLifecycleRequest::getUserId, me)
                .eq(StringUtils.hasText(type), HrLifecycleRequest::getType, type)
                .eq(StringUtils.hasText(status), HrLifecycleRequest::getStatus, status)
                .orderByDesc(HrLifecycleRequest::getId);
        Page<HrLifecycleRequest> result = lifecycleMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<HrLifecycleVO> records = result.getRecords().stream().map(HrLifecycleVO::from).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public Map<String, Long> myRequestStats() {
        Long me = currentUserId();
        List<HrLifecycleRequest> rows = lifecycleMapper.selectList(
                new LambdaQueryWrapper<HrLifecycleRequest>()
                        .eq(HrLifecycleRequest::getUserId, me)
                        .select(HrLifecycleRequest::getStatus));
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("all", (long) rows.size());
        for (String status : List.of(HrLifecycleConstants.STATUS_DRAFT, HrLifecycleConstants.STATUS_PENDING,
                HrLifecycleConstants.STATUS_APPROVED, HrLifecycleConstants.STATUS_REJECTED,
                HrLifecycleConstants.STATUS_COMPLETED, HrLifecycleConstants.STATUS_CANCELLED)) {
            counts.put(status, 0L);
        }
        for (HrLifecycleRequest r : rows) {
            counts.merge(r.getStatus(), 1L, Long::sum);
        }
        return counts;
    }

    @Override
    public Map<String, Object> myProfile() {
        Long me = currentUserId();
        // reveal=false：证件号/住址即使是本人也走服务端脱敏口径，避免明文流经自助页面前端
        return employeeService.getBasicInfo(me, false);
    }

    /** 登录人 ID；未登录按 ESS 域菜单拒绝（默认拒绝，不留匿名自助通道） */
    private Long currentUserId() {
        SysUser user = operatorResolver.currentUser();
        if (user == null || user.getId() == null) {
            throw new PermissionDeniedException(HrEssConstants.MENU_DOMAIN, "view");
        }
        return user.getId();
    }
}
