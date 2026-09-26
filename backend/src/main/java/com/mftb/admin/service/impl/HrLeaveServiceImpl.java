package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrEssConstants;
import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.dto.HrLeaveBalanceVO;
import com.mftb.admin.dto.HrLeaveRequestSaveDTO;
import com.mftb.admin.dto.HrLeaveRequestVO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrLeaveBalance;
import com.mftb.admin.entity.HrLeaveRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrLeaveBalanceMapper;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrLeaveService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SysHrDictService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * HR 假期服务实现。
 * <p>
 * 额度口径：可用 = 授予 + 结转 - 已用 - 在途占用（草稿/审批中/待办理）；
 * 天数由服务端按起止日期计算（自然日含首尾），审批通过才累加 used_days，驳回不动额度。
 * 审批环节委托 OA 引擎（流程定义复用 oa_leave），formData 携带 bizId 作为双向锚点。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrLeaveServiceImpl implements HrLeaveService {

    private final HrLeaveRequestMapper leaveMapper;
    private final HrLeaveBalanceMapper balanceMapper;
    private final SysUserMapper sysUserMapper;
    private final OaRequestService oaRequestService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final SysHrDictService dictService;

    // ==================== 额度台账 ====================

    @Override
    public PageResult<HrLeaveBalanceVO> balances(long page, long size, Integer year, String keyword, boolean mineOnly) {
        // 人事角色看全量；员工自助(ess-leave)只看本人额度行
        Long viewerScope = quotaViewerScope();
        // 自助页即便由人事角色打开也强制本人，避免「我的假期」呈现全员数据
        Long ownerScope = mineOnly ? requireCurrentUser().getId() : viewerScope;
        int y = year != null ? year : LocalDate.now().getYear();
        LambdaQueryWrapper<HrLeaveBalance> wrapper = new LambdaQueryWrapper<HrLeaveBalance>()
                .eq(HrLeaveBalance::getYear, y)
                .eq(ownerScope != null, HrLeaveBalance::getUserId, ownerScope)
                .orderByAsc(HrLeaveBalance::getUserId)
                .orderByAsc(HrLeaveBalance::getLeaveType);
        if (StringUtils.hasText(keyword)) {
            List<Long> ids = searchUserIds(keyword.trim());
            if (ids.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(HrLeaveBalance::getUserId, ids);
        }
        Page<HrLeaveBalance> result = balanceMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<HrLeaveBalance> rows = result.getRecords();
        Map<Long, SysUser> userMap = loadUsers(rows.stream().map(HrLeaveBalance::getUserId).distinct().toList());
        Map<String, BigDecimal> occupied = occupiedDaysMap(y);
        List<HrLeaveBalanceVO> vos = rows.stream().map(b -> {
            SysUser u = userMap.get(b.getUserId());
            HrLeaveBalanceVO vo = HrLeaveBalanceVO.of(b, u != null ? u.getName() : null,
                    u != null ? u.getDepartment() : null);
            BigDecimal used = occupied.getOrDefault(key(b.getUserId(), b.getLeaveType()), BigDecimal.ZERO);
            vo.setOccupiedDays(used);
            vo.setRemainingDays(vo.getTotalDays().add(vo.getCarriedDays()).subtract(vo.getUsedDays()).subtract(used));
            return vo;
        }).toList();
        return new PageResult<>(vos, result.getTotal());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLeaveBalance saveBalance(HrLeaveBalance body) {
        requirePermission(HrLeaveConstants.MENU_QUOTA,
                body.getId() == null ? "create" : "edit");
        if (body.getUserId() == null) {
            throw new BusinessException("請選擇員工");
        }
        if (!HrLeaveConstants.isValidType(body.getLeaveType())) {
            throw new BusinessException("無效的假期類型: " + body.getLeaveType());
        }
        int year = body.getYear() != null ? body.getYear() : LocalDate.now().getYear();
        SysUser user = requireUser(body.getUserId());
        HrLeaveBalance existing = balanceMapper.selectOne(new LambdaQueryWrapper<HrLeaveBalance>()
                .eq(HrLeaveBalance::getUserId, user.getId())
                .eq(HrLeaveBalance::getYear, year)
                .eq(HrLeaveBalance::getLeaveType, body.getLeaveType())
                .last("LIMIT 1"));
        String operator = operatorResolver.currentOperatorName();
        if (body.getId() == null) {
            if (existing != null) {
                throw new BusinessException("該員工本年此假別額度已存在，請直接編輯");
            }
            body.setId(null);
            body.setUserId(user.getId());
            body.setEmpNo(user.getEmpId());
            body.setYear(year);
            body.setUsedDays(BigDecimal.ZERO);
            body.setTotalDays(nz(body.getTotalDays()));
            body.setCarriedDays(nz(body.getCarriedDays()));
            body.setCreatedBy(operator);
            body.setUpdatedBy(operator);
            body.setDeleted(0);
            balanceMapper.insert(body);
            return body;
        }
        HrLeaveBalance db = requireBalance(body.getId());
        // used_days 只由审批回调累加，请求值一律忽略
        db.setTotalDays(nz(body.getTotalDays()));
        db.setCarriedDays(nz(body.getCarriedDays()));
        db.setRemark(body.getRemark());
        db.setUpdatedBy(operator);
        db.setUpdatedAt(LocalDateTime.now());
        balanceMapper.updateById(db);
        return db;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteBalance(Long id) {
        requirePermission(HrLeaveConstants.MENU_QUOTA, "delete");
        HrLeaveBalance db = requireBalance(id);
        if (nz(db.getUsedDays()).compareTo(BigDecimal.ZERO) > 0) {
            throw new BusinessException("該額度已有使用記錄，不可刪除；可將授予天數改為 0");
        }
        balanceMapper.deleteById(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int batchInit(Integer year, String leaveType, BigDecimal totalDays, List<Long> userIds) {
        requirePermission(HrLeaveConstants.MENU_QUOTA, "create");
        if (!HrLeaveConstants.isValidType(leaveType)) {
            throw new BusinessException("無效的假期類型: " + leaveType);
        }
        int y = year != null ? year : LocalDate.now().getYear();
        BigDecimal days = nz(totalDays);
        List<SysUser> users = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1)
                .in(userIds != null && !userIds.isEmpty(), SysUser::getId,
                        userIds == null ? List.of() : userIds));
        String operator = operatorResolver.currentOperatorName();
        int created = 0;
        for (SysUser u : users) {
            Long exists = balanceMapper.selectCount(new LambdaQueryWrapper<HrLeaveBalance>()
                    .eq(HrLeaveBalance::getUserId, u.getId())
                    .eq(HrLeaveBalance::getYear, y)
                    .eq(HrLeaveBalance::getLeaveType, leaveType));
            if (exists != null && exists > 0) {
                continue;
            }
            HrLeaveBalance b = new HrLeaveBalance();
            b.setUserId(u.getId());
            b.setEmpNo(u.getEmpId());
            b.setYear(y);
            b.setLeaveType(leaveType);
            b.setTotalDays(days);
            b.setCarriedDays(BigDecimal.ZERO);
            b.setUsedDays(BigDecimal.ZERO);
            b.setCreatedBy(operator);
            b.setUpdatedBy(operator);
            b.setDeleted(0);
            balanceMapper.insert(b);
            created++;
        }
        log.info("HR 假期額度批量初始化: year={}, type={}, created={}", y, leaveType, created);
        return created;
    }

    @Override
    public List<Map<String, Object>> employeeOptions(String keyword) {
        requireLeavePermission("view");
        Long self = scopedUserId();
        if (self != null) {
            // 自助请假场景不暴露同事名单，仅返回本人
            SysUser me = requireUser(self);
            return List.of(userOption(me));
        }
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1)
                .orderByAsc(SysUser::getEmpId)
                .last("LIMIT 30");
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysUser::getName, keyword).or().like(SysUser::getEmpId, keyword));
        }
        return sysUserMapper.selectList(wrapper).stream().map(this::userOption).toList();
    }

    @Override
    public Map<String, Object> quota(Long userId, String leaveType, Integer year) {
        requireLeavePermission("view");
        if (userId == null || !HrLeaveConstants.isValidType(leaveType)) {
            throw new BusinessException("員工與假期類型均為必填且假期類型需合法");
        }
        requireSameEmployee(userId);
        int y = year != null ? year : LocalDate.now().getYear();
        BigDecimal available = available(userId, leaveType, y, null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("granted", available != null);
        result.put("year", y);
        result.put("leaveType", leaveType);
        result.put("remainingDays", available);
        return result;
    }

    @Override
    public long overdueCount(Integer year) {
        requirePermission(HrLeaveConstants.MENU_QUOTA, "view");
        int y = year != null ? year : LocalDate.now().getYear();
        List<HrLeaveBalance> rows = balanceMapper.selectList(new LambdaQueryWrapper<HrLeaveBalance>()
                .eq(HrLeaveBalance::getYear, y)
                .select(HrLeaveBalance::getUserId, HrLeaveBalance::getLeaveType,
                        HrLeaveBalance::getTotalDays, HrLeaveBalance::getCarriedDays, HrLeaveBalance::getUsedDays));
        if (rows.isEmpty()) {
            return 0L;
        }
        Map<String, BigDecimal> occupied = occupiedDaysMap(y);
        return rows.stream().filter(b -> nz(b.getTotalDays()).add(nz(b.getCarriedDays()))
                .subtract(nz(b.getUsedDays()))
                .subtract(occupied.getOrDefault(key(b.getUserId(), b.getLeaveType()), BigDecimal.ZERO))
                .compareTo(BigDecimal.ZERO) < 0).count();
    }

    // ==================== 请假申请 ====================

    @Override
    public PageResult<HrLeaveRequestVO> page(long page, long size, String status, String keyword, boolean mineOnly) {
        requireLeavePermission("view");
        LambdaQueryWrapper<HrLeaveRequest> wrapper = new LambdaQueryWrapper<HrLeaveRequest>()
                .orderByDesc(HrLeaveRequest::getId);
        Long scope = mineOnly ? requireCurrentUser().getId() : scopedUserId();
        if (scope != null) {
            wrapper.eq(HrLeaveRequest::getUserId, scope);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(HrLeaveRequest::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            List<Long> ids = searchUserIds(kw);
            wrapper.and(w -> {
                w.like(HrLeaveRequest::getReqNo, kw).or().like(HrLeaveRequest::getEmpName, kw);
                if (!ids.isEmpty()) {
                    w.or().in(HrLeaveRequest::getUserId, ids);
                }
            });
        }
        Page<HrLeaveRequest> result = leaveMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        return new PageResult<>(result.getRecords().stream().map(HrLeaveRequestVO::from).toList(), result.getTotal());
    }

    @Override
    public Map<String, Long> stats(boolean mineOnly) {
        requireLeavePermission("view");
        Long scope = mineOnly ? requireCurrentUser().getId() : scopedUserId();
        List<HrLeaveRequest> all = leaveMapper.selectList(
                new LambdaQueryWrapper<HrLeaveRequest>()
                        .eq(scope != null, HrLeaveRequest::getUserId, scope)
                        .select(HrLeaveRequest::getStatus));
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("all", (long) all.size());
        for (String s : List.of(HrLeaveConstants.STATUS_DRAFT, HrLeaveConstants.STATUS_PENDING,
                HrLeaveConstants.STATUS_REJECTED, HrLeaveConstants.STATUS_APPROVED,
                HrLeaveConstants.STATUS_COMPLETED)) {
            counts.put(s, 0L);
        }
        for (HrLeaveRequest r : all) {
            counts.merge(r.getStatus(), 1L, Long::sum);
        }
        return counts;
    }

    @Override
    public HrLeaveRequestVO detail(Long id) {
        HrLeaveRequest entity = requireRequest(id);
        requireLeavePermission("view");
        requireSameEmployee(entity.getUserId());
        HrLeaveRequestVO vo = HrLeaveRequestVO.from(entity);
        vo.setRemainingDays(available(entity.getUserId(), entity.getLeaveType(), entity.getYear(), entity.getId()));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLeaveRequestVO saveDraft(HrLeaveRequestSaveDTO dto) {
        requireLeavePermission("create");
        HrLeaveRequest entity = new HrLeaveRequest();
        entity.setStatus(HrLeaveConstants.STATUS_DRAFT);
        entity.setReqNo(generateReqNo());
        applyDto(entity, dto);
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        leaveMapper.insert(entity);
        return HrLeaveRequestVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLeaveRequestVO update(Long id, HrLeaveRequestSaveDTO dto) {
        HrLeaveRequest entity = requireRequest(id);
        requireEditable(entity);
        requireLeavePermission("edit");
        requireSameEmployee(entity.getUserId());
        applyDto(entity, dto);
        touch(entity);
        leaveMapper.updateById(entity);
        return HrLeaveRequestVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLeaveRequestVO submit(Long id) {
        HrLeaveRequest entity = requireRequest(id);
        requireEditable(entity);
        requireLeavePermission("edit");
        requireSameEmployee(entity.getUserId());
        if (entity.getDays() == null || entity.getDays().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("請假天數無效");
        }
        BigDecimal available = available(entity.getUserId(), entity.getLeaveType(), entity.getYear(), entity.getId());
        if (available != null && entity.getDays().compareTo(available) > 0) {
            throw new BusinessException("額度不足：" + leaveTypeName(entity.getLeaveType()) + " 剩餘 "
                    + available.stripTrailingZeros().toPlainString() + " 天，本單申請 "
                    + entity.getDays().stripTrailingZeros().toPlainString() + " 天");
        }
        Map<String, Object> formData = new HashMap<>();
        formData.put("bizId", entity.getId());
        formData.put("bizType", "leave");
        formData.put("empName", entity.getEmpName());
        formData.put("leaveType", entity.getLeaveType());
        formData.put("days", entity.getDays());

        OaRequestCreateDTO oa = new OaRequestCreateDTO();
        oa.setProcessCode(HrLeaveConstants.PROCESS_CODE);
        oa.setTitle("請假申請-" + entity.getEmpName() + "(" + entity.getReqNo() + ")");
        oa.setFormData(JsonUtils.toJson(formData));
        String flowNo = oaRequestService.submit(oa);

        entity.setFlowNo(flowNo);
        entity.setStatus(HrLeaveConstants.STATUS_PENDING);
        touch(entity);
        leaveMapper.updateById(entity);
        log.info("HR leave submitted: reqNo={}, flowNo={}", entity.getReqNo(), flowNo);
        return HrLeaveRequestVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long id) {
        HrLeaveRequest entity = requireRequest(id);
        requireLeavePermission("edit");
        requireSameEmployee(entity.getUserId());
        if (!HrLeaveConstants.STATUS_PENDING.equals(entity.getStatus())) {
            throw new BusinessException("僅審批中的請假單可以撤銷");
        }
        oaRequestService.cancel(entity.getFlowNo());
        entity.setStatus(HrLeaveConstants.STATUS_DRAFT);
        touch(entity);
        leaveMapper.updateById(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        HrLeaveRequest entity = requireRequest(id);
        requireEditable(entity);
        requireLeavePermission("delete");
        requireSameEmployee(entity.getUserId());
        leaveMapper.deleteById(id);
    }

    // ==================== 内部逻辑 ====================

    /** 类型级权限：请假与额度分属两个菜单，超管在 hasPermission 内部直通 */
    private void requirePermission(String menuKey, String action) {
        SysUser user = operatorResolver.currentUser();
        if (user == null || !permissionService.hasPermission(user, menuKey, action)) {
            throw new PermissionDeniedException(menuKey, action);
        }
    }

    /**
     * 请假单权限：人事菜单 hr-leave 与员工自助菜单 ess-leave 任一即可，
     * 数据范围仍由 {@link #scopedUserId()} 保证非人事角色只能碰本人单据。
     */
    private void requireLeavePermission(String action) {
        SysUser user = requireCurrentUser();
        if (!permissionService.hasPermission(user, HrLeaveConstants.MENU_LEAVE, action)
                && !permissionService.hasPermission(user, HrEssConstants.MENU_LEAVE, action)) {
            throw new PermissionDeniedException(HrLeaveConstants.MENU_LEAVE, action);
        }
    }

    /**
     * 额度台账访问范围：null=人事可看全量；非 null=只能看该员工。
     * 两种授权都没有时按 hr-leave-quota 拒绝，保持默认拒绝语义。
     */
    private Long quotaViewerScope() {
        SysUser user = requireCurrentUser();
        if (permissionService.hasPermission(user, HrLeaveConstants.MENU_QUOTA, "view")) {
            return null;
        }
        if (permissionService.hasPermission(user, HrEssConstants.MENU_LEAVE, "view")) {
            return user.getId();
        }
        throw new PermissionDeniedException(HrLeaveConstants.MENU_QUOTA, "view");
    }

    /** 当前登录用户（登录态由 JWT 过滤器保证，服务层再兜一次避免 NPE 变成 500） */
    private SysUser requireCurrentUser() {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            throw new PermissionDeniedException(HrLeaveConstants.MENU_LEAVE, "view");
        }
        return user;
    }

    /**
     * 行级数据范围：返回 null 表示可跨员工查看，否则只能看/操作该 userId 的数据。
     * <p>
     * 判定口径复用功能授权本身——能查看「假期額度」台账即视为人事职能用户（超管在
     * hasPermission 内直通），因此无需新增数据范围表；普通员工即便被授予「請假管理」
     * 菜单（自助请假），也只能看到并操作本人的请假单与额度。
     */
    private Long scopedUserId() {
        SysUser user = requireCurrentUser();
        return permissionService.hasPermission(user, HrLeaveConstants.MENU_QUOTA, "view")
                ? null : user.getId();
    }

    /** 需要人事角色才能查看/操作他人单据（提示区分于"缺菜单权限"，避免自助用户误判授权） */
    private void requireSameEmployee(Long ownerUserId) {
        Long scope = scopedUserId();
        if (scope != null && !scope.equals(ownerUserId)) {
            throw PermissionDeniedException.outOfDataScope("他人的請假單或額度");
        }
    }

    /** 天数 = 自然日差 + 1（含首尾）；年度取开始日期年份 */
    private void applyDto(HrLeaveRequest entity, HrLeaveRequestSaveDTO dto) {
        if (!HrLeaveConstants.isValidType(dto.getLeaveType())) {
            throw new BusinessException("無效的假期類型: " + dto.getLeaveType());
        }
        if (dto.getEndDate().isBefore(dto.getStartDate())) {
            throw new BusinessException("結束日期不能早於開始日期");
        }
        SysUser user = requireUser(dto.getUserId());
        // 代他人请假属人事职能，自助用户只能为本人建单
        requireSameEmployee(user.getId());
        entity.setUserId(user.getId());
        entity.setEmpName(user.getName());
        entity.setEmpNo(user.getEmpId());
        entity.setDeptName(user.getDepartment());
        entity.setLeaveType(dto.getLeaveType());
        entity.setStartDate(dto.getStartDate());
        entity.setEndDate(dto.getEndDate());
        entity.setYear(dto.getStartDate().getYear());
        entity.setDays(BigDecimal.valueOf(ChronoUnit.DAYS.between(dto.getStartDate(), dto.getEndDate()) + 1));
        entity.setReason(dto.getReason() == null ? null : dto.getReason().trim());
    }

    /** 剩余可用额度；无额度记录返回 null（表示未授予，不做强校验） */
    private BigDecimal available(Long userId, String leaveType, Integer year, Long excludeRequestId) {
        HrLeaveBalance balance = balanceMapper.selectOne(new LambdaQueryWrapper<HrLeaveBalance>()
                .eq(HrLeaveBalance::getUserId, userId)
                .eq(HrLeaveBalance::getYear, year)
                .eq(HrLeaveBalance::getLeaveType, leaveType)
                .last("LIMIT 1"));
        if (balance == null) {
            return null;
        }
        BigDecimal occupied = BigDecimal.ZERO;
        List<HrLeaveRequest> pending = leaveMapper.selectList(new LambdaQueryWrapper<HrLeaveRequest>()
                .eq(HrLeaveRequest::getUserId, userId)
                .eq(HrLeaveRequest::getYear, year)
                .eq(HrLeaveRequest::getLeaveType, leaveType)
                .in(HrLeaveRequest::getStatus, HrLeaveConstants.OCCUPYING_STATUSES)
                .ne(excludeRequestId != null, HrLeaveRequest::getId, excludeRequestId));
        for (HrLeaveRequest r : pending) {
            occupied = occupied.add(nz(r.getDays()));
        }
        return nz(balance.getTotalDays()).add(nz(balance.getCarriedDays()))
                .subtract(nz(balance.getUsedDays())).subtract(occupied);
    }

    /** 一次查询汇总各（员工,假别）在途占用，避免额度列表 N+1 */
    private Map<String, BigDecimal> occupiedDaysMap(int year) {
        List<HrLeaveRequest> rows = leaveMapper.selectList(new LambdaQueryWrapper<HrLeaveRequest>()
                .eq(HrLeaveRequest::getYear, year)
                .in(HrLeaveRequest::getStatus, HrLeaveConstants.OCCUPYING_STATUSES)
                .select(HrLeaveRequest::getUserId, HrLeaveRequest::getLeaveType, HrLeaveRequest::getDays));
        Map<String, BigDecimal> map = new HashMap<>();
        for (HrLeaveRequest r : rows) {
            map.merge(key(r.getUserId(), r.getLeaveType()), nz(r.getDays()), BigDecimal::add);
        }
        return map;
    }

    private static String key(Long userId, String leaveType) {
        return userId + "#" + leaveType;
    }

    private void touch(HrLeaveRequest entity) {
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        // MetaObjectHandler 的 strictUpdateFill 在实体已带非空 updatedAt 时会跳过，需显式刷新
        entity.setUpdatedAt(LocalDateTime.now());
    }

    private HrLeaveRequest findByFlowNo(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        List<HrLeaveRequest> list = leaveMapper.selectList(
                new LambdaQueryWrapper<HrLeaveRequest>().eq(HrLeaveRequest::getFlowNo, flowNo));
        return list.isEmpty() ? null : list.get(0);
    }

    private HrLeaveRequest requireRequest(Long id) {
        HrLeaveRequest entity = id == null ? null : leaveMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("請假單不存在");
        }
        return entity;
    }

    private HrLeaveBalance requireBalance(Long id) {
        HrLeaveBalance db = id == null ? null : balanceMapper.selectById(id);
        if (db == null) {
            throw new BusinessException("額度記錄不存在");
        }
        return db;
    }

    private void requireEditable(HrLeaveRequest entity) {
        if (!HrLeaveConstants.EDITABLE_STATUSES.contains(entity.getStatus())) {
            throw new BusinessException("當前狀態不允許該操作");
        }
    }

    private SysUser requireUser(Long userId) {
        SysUser user = userId == null ? null : sysUserMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("所選員工不存在");
        }
        return user;
    }

    /** 选人下拉的单行结构（与 employeeOptions 返回体保持一致） */
    private Map<String, Object> userOption(SysUser u) {
        Map<String, Object> m = new HashMap<>();
        m.put("userId", u.getId());
        m.put("empId", u.getEmpId());
        m.put("name", u.getName());
        m.put("department", u.getDepartment());
        return m;
    }

    private List<Long> searchUserIds(String keyword) {
        return sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .select(SysUser::getId)
                        .and(w -> w.like(SysUser::getName, keyword).or().like(SysUser::getEmpId, keyword)))
                .stream().map(SysUser::getId).toList();
    }

    private Map<Long, SysUser> loadUsers(List<Long> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, SysUser> map = new HashMap<>();
        for (SysUser u : sysUserMapper.selectBatchIds(userIds)) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private String generateReqNo() {
        try {
            return bizSeqService.next(HrLeaveConstants.SEQ_RULE_KEY);
        } catch (Exception e) {
            log.warn("請假單編號規則不可用，回退時間戳: {}", e.getMessage());
            return "LQ" + LocalDate.now().toString().replace("-", "")
                    + String.format("%04d", (int) (System.nanoTime() % 10000));
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    /** 面向用户的文案一律用字典名称，不暴露 LEAVE_TYPE 的枚举码 */
    private String leaveTypeName(String code) {
        String name = dictService.getNameByCode(HrLeaveConstants.DICT_TYPE, code);
        return StringUtils.hasText(name) ? name : code;
    }
}
