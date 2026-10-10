package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VehicleUseDto;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.Vehicle;
import com.mftb.admin.entity.VehicleTrip;
import com.mftb.admin.entity.VehicleUse;
import com.mftb.admin.entity.VehicleUseEvent;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.mapper.VehicleMapper;
import com.mftb.admin.mapper.VehicleTripMapper;
import com.mftb.admin.mapper.VehicleUseEventMapper;
import com.mftb.admin.mapper.VehicleUseMapper;
import com.mftb.admin.service.VehicleUseService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** 用车单服务实现 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VehicleUseServiceImpl implements VehicleUseService {

    private static final long MAX_PAGE_SIZE = 100L;

    /**
     * 行程已登记归还（待歸還確認分组与超时未还共用）。
     *
     * <p>行程状态在 biz_vehicle_trip 上，用车单没有这一列，只能在 SQL 里做子查询。
     * <p>MyBatis-Plus 的 {@code exists()/notExists()} 会自动包成 {@code EXISTS ( sql )}，
     * 所以这里存的是不带 EXISTS 关键字与外层括号的裸 SELECT。
     * 这两个方法官方标注为「sql 注入方法」，此处传入的全是编译期常量、不接任何用户输入，
     * 因此不构成注入面——不得改成拼接前端参数。
     * <p>判定用 return_at 而不是 status：补录核对不通过后单会留在待确认，
     * 只看 status 会把它误归为正常归还。
     */
    private static final String TRIP_RETURNED_SQL =
            "SELECT 1 FROM biz_vehicle_trip t WHERE t.use_id = biz_vehicle_use.id "
                    + "AND t.deleted = 0 AND t.return_at IS NOT NULL";

    /** 行程处于待核对/争议核对（補錄待核對分组） */
    private static final String TRIP_UNCHECKED_SQL =
            "SELECT 1 FROM biz_vehicle_trip t WHERE t.use_id = biz_vehicle_use.id "
                    + "AND t.deleted = 0 AND t.status IN ('pending_check','disputed')";

    private final VehicleUseMapper useMapper;
    private final VehicleTripMapper tripMapper;
    private final VehicleMapper vehicleMapper;
    private final VehicleUseEventMapper eventMapper;
    private final SysUserMapper userMapper;
    private final SysDepartmentMapper departmentMapper;
    private final VehicleAccessGuard guard;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<VehicleUseDto.VO> page(VehicleUseDto.Query query) {
        SysUser current = guard.currentUser();
        LambdaQueryWrapper<VehicleUse> wrapper = new LambdaQueryWrapper<>();
        if (!applyScope(wrapper, current, query)) {
            return new PageResult<>(List.of(), 0L);
        }
        String scope = scopeOf(query);
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(VehicleUse::getStatus, query.getStatus());
        } else if ("dispatch".equals(scope) && !StringUtils.hasText(query.getGroup())) {
            wrapper.in(VehicleUse::getStatus, VehicleConstants.DISPATCH_STATUSES);
        }
        applyGroup(wrapper, query.getGroup());
        applyCommonFilters(wrapper, query);
        wrapper.orderByDesc(VehicleUse::getUpdatedAt);

        Page<VehicleUse> page = new Page<>(normalizePage(query.getPage()), normalizeSize(query.getSize()));
        Page<VehicleUse> result = useMapper.selectPage(page, wrapper);
        return new PageResult<>(result.getRecords().stream().map(this::toVO).toList(), result.getTotal());
    }

    /**
     * 按视角收敛可见范围。
     *
     * @return false 表示当前用户无任何可办车辆，调用方应直接返回空结果而不是放行全表
     */
    private boolean applyScope(LambdaQueryWrapper<VehicleUse> wrapper, SysUser current, VehicleUseDto.Query query) {
        switch (scopeOf(query)) {
            case "my_applied" -> wrapper.eq(VehicleUse::getApplicantId, current.getId());
            case "my_driving" -> wrapper.eq(VehicleUse::getDriverId, current.getId());
            default -> {
                // 车管视角：按「车辆×管理人员」限定范围，超管不限制
                List<Long> manageable = guard.manageableVehicleIds(current);
                if (manageable != null) {
                    if (manageable.isEmpty()) {
                        return false;
                    }
                    wrapper.and(w -> w.in(VehicleUse::getFinalVehicleId, manageable)
                            .or().in(VehicleUse::getIntentVehicleId, manageable));
                }
            }
        }
        return true;
    }

    private static String scopeOf(VehicleUseDto.Query query) {
        return query.getScope() == null ? "dispatch" : query.getScope();
    }

    @Override
    public VehicleUseDto.VO detail(long id) {
        VehicleUse use = requireUse(id);
        requireUseVisible(use);
        return toVO(use);
    }

    /**
     * 待办统计：分组徽标与超时卡都接当前搜索条件。
     *
     * <p>每个分组都重新走一遍 {@link #applyScope} + {@link #applyCommonFilters} + {@link #applyGroup}，
     * 与列表共用同一套条件构造代码——口径不可能漂移，这是比「两处各自写一遍 IN 列表」更硬的约束。
     * <p>代价是 N 次 COUNT，但都是走索引的计数，远好于把整页数据拉到前端再数。
     */
    @Override
    public VehicleUseDto.TodoStats todoStats(VehicleUseDto.Query query) {
        SysUser current = guard.currentUser();
        VehicleUseDto.TodoStats stats = new VehicleUseDto.TodoStats();
        Map<String, Long> groups = new LinkedHashMap<>();
        for (String group : VehicleConstants.DISPATCH_GROUPS) {
            groups.put(group, countDispatchGroup(current, query, group));
        }
        stats.setGroupCounts(groups);
        stats.setToAssign(groups.getOrDefault(VehicleConstants.GROUP_TO_ASSIGN, 0L));
        stats.setToDepart(groups.getOrDefault(VehicleConstants.GROUP_TO_DEPART, 0L));
        stats.setInUse(groups.getOrDefault(VehicleConstants.GROUP_IN_USE, 0L));
        stats.setToConfirm(groups.getOrDefault(VehicleConstants.GROUP_TO_CONFIRM, 0L));
        stats.setOverdue(countOverdue(current, query));
        return stats;
    }

    /** 单个待办分组在给定条件下的条数 */
    private long countDispatchGroup(SysUser current, VehicleUseDto.Query query, String group) {
        LambdaQueryWrapper<VehicleUse> wrapper = new LambdaQueryWrapper<>();
        if (!applyScope(wrapper, current, query)) {
            return 0L;
        }
        applyCommonFilters(wrapper, query);
        applyGroup(wrapper, group);
        Long cnt = useMapper.selectCount(wrapper);
        return cnt == null ? 0L : cnt;
    }

    /**
     * 超时未归还：已出车/待确认，已过批准结束时间且未登记归还。
     *
     * <p>不再走 Mapper 里那份只接 vehicleIds 的旧 SQL：那份与列表条件各自一套，
     * 搜索后卡片数字不会变。“是否已归还”的事实列在行程表，用车单上没有，
     * 所以用 NOT EXISTS 子查询；子查询是常量谓词，不接任何用户输入。
     */
    private long countOverdue(SysUser current, VehicleUseDto.Query query) {
        LambdaQueryWrapper<VehicleUse> wrapper = new LambdaQueryWrapper<>();
        if (!applyScope(wrapper, current, query)) {
            return 0L;
        }
        applyCommonFilters(wrapper, query);
        wrapper.in(VehicleUse::getStatus, List.of(VehicleConstants.STATUS_IN_USE, VehicleConstants.STATUS_TO_CONFIRM))
                .lt(VehicleUse::getPlannedEnd, LocalDateTime.now())
                .notExists(TRIP_RETURNED_SQL);
        Long cnt = useMapper.selectCount(wrapper);
        return cnt == null ? 0L : cnt;
    }

    /* ==================== 建单：两条路径 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createDraft(VehicleUseDto.Draft dto) {
        SysUser current = guard.currentUser();
        if (!StringUtils.hasText(dto.getPurpose())) {
            throw new BusinessException("請填寫用車事由");
        }
        VehicleUse existing = findByIdempotencyKey(current.getId(), dto.getRequestKey());
        if (existing != null) {
            return existing.getId();
        }
        validateWindow(dto.getPlannedStart(), dto.getPlannedEnd());
        Vehicle vehicle = dto.getIntentVehicleId() == null ? null : guard.requireVehicle(dto.getIntentVehicleId());
        if (vehicle != null && !guard.deptAllowed(vehicle.getId(), current.getDepartmentId())) {
            throw new BusinessException("用車部門不在該車的顯式授權範圍內");
        }

        VehicleUse use = new VehicleUse();
        use.setUseNo(bizSeqService.next(VehicleConstants.seqRuleOf(VehicleConstants.SOURCE_OA)));
        use.setSource(VehicleConstants.SOURCE_OA);
        // 草稿不伪装成"审批中"：OA 对接在 B2，提交动作此时不可用
        use.setApprovalOutcome(VehicleConstants.APPROVAL_NOT_SUBMITTED);
        use.setStatus(VehicleConstants.STATUS_DRAFT);
        fillApplicant(use, current, StringUtils.hasText(dto.getActualUserName()) ? dto.getActualUserName() : current.getName());
        use.setIntentVehicleId(vehicle == null ? null : vehicle.getId());
        use.setIntentPlateNo(vehicle == null ? null : vehicle.getPlateNo());
        use.setPurpose(dto.getPurpose().trim());
        use.setOrigin(nullToEmpty(dto.getOrigin()));
        use.setDestination(nullToEmpty(dto.getDestination()));
        use.setPlannedStart(dto.getPlannedStart());
        use.setPlannedEnd(dto.getPlannedEnd());
        use.setDrivingMode(VehicleConstants.MODE_SELF.equals(dto.getDrivingMode())
                ? VehicleConstants.MODE_SELF : VehicleConstants.MODE_COMPANY_DRIVER);
        use.setPassengerCount(dto.getPassengerCount() == null ? 1 : dto.getPassengerCount());
        use.setVersion(0);
        use.setCreatedBy(operatorResolver.operatorSignature(current));
        use.setUpdatedBy(operatorResolver.operatorSignature(current));
        use.setRequestKey(trimToNull(dto.getRequestKey()));
        useMapper.insert(use);
        appendEvent(use, null, VehicleConstants.EVENT_APPLY, current, "提交用車申請（草稿）", null, null, dto.getRequestKey());
        return use.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long directRegister(VehicleUseDto.DirectRegister dto) {
        SysUser current = guard.currentUser();
        if (!StringUtils.hasText(dto.getDirectReason())) {
            throw new BusinessException("授權直接登記必須填寫登記原因");
        }
        if (dto.getVehicleId() == null || dto.getDriverId() == null) {
            throw new BusinessException("請選擇車輛與實際駕駛人");
        }
        VehicleUse existing = findByIdempotencyKey(current.getId(), dto.getRequestKey());
        if (existing != null) {
            return existing.getId();
        }

        // 前置 2：车辆必须开启直接登记；前置 3：操作者必须在该车授权管理人员范围内
        Vehicle vehicle = lockVehicle(dto.getVehicleId());
        if (!Objects.equals(vehicle.getAllowDirectRegister(), 1)) {
            throw new BusinessException("車輛 " + vehicle.getPlateNo() + " 未開啟授權直接登記，請改走審批用車");
        }
        guard.requireManageVehicle(current, vehicle.getId(), "授權直接登記");

        validateWindow(dto.getPlannedStart(), dto.getPlannedEnd());
        guard.checkPassenger(nvl(dto.getPassengerCount(), 1), vehicle.getSeatCount());
        if (!guard.deptAllowed(vehicle.getId(), dto.getDepartmentId())) {
            throw new BusinessException("用車部門不在該車的顯式授權範圍內");
        }
        List<String> blockers = new ArrayList<>(guard.vehicleBlockers(vehicle, dto.getPlannedStart().toLocalDate()));
        blockers.addAll(guard.qualificationBlockers(dto.getDriverId(), vehicle.getRegisterRegion(),
                dto.getPlannedStart().toLocalDate()));
        String conflict = conflictMessage(vehicle.getId(), dto.getDriverId(), dto.getPlannedStart(), dto.getPlannedEnd(), null);
        if (conflict != null) {
            blockers.add(conflict);
        }
        if (!blockers.isEmpty()) {
            throw new BusinessException(String.join("；", blockers));
        }

        VehicleUse use = new VehicleUse();
        use.setUseNo(bizSeqService.next(VehicleConstants.seqRuleOf(VehicleConstants.SOURCE_DIRECT)));
        use.setSource(VehicleConstants.SOURCE_DIRECT);
        // 与审批通过严格区分：直接登记永远标 direct，不写 approved
        use.setApprovalOutcome(VehicleConstants.APPROVAL_DIRECT);
        use.setStatus(VehicleConstants.STATUS_TO_DEPART);
        fillApplicant(use, current, StringUtils.hasText(dto.getActualUserName())
                ? dto.getActualUserName() : current.getName());
        use.setDepartmentId(dto.getDepartmentId());
        use.setDepartmentName(departmentName(dto.getDepartmentId(), current));
        use.setIntentVehicleId(vehicle.getId());
        use.setIntentPlateNo(vehicle.getPlateNo());
        use.setPurpose(dto.getPurpose().trim());
        use.setOrigin(nullToEmpty(dto.getOrigin()));
        use.setDestination(nullToEmpty(dto.getDestination()));
        use.setPlannedStart(dto.getPlannedStart());
        use.setPlannedEnd(dto.getPlannedEnd());
        use.setDrivingMode(VehicleConstants.MODE_COMPANY_DRIVER);
        use.setPassengerCount(nvl(dto.getPassengerCount(), 1));
        applyAssignmentFields(use, vehicle, dto.getDriverId(), current, dto.getDirectReason());
        use.setVersion(0);
        use.setCreatedBy(operatorResolver.operatorSignature(current));
        use.setUpdatedBy(operatorResolver.operatorSignature(current));
        use.setRequestKey(trimToNull(dto.getRequestKey()));
        useMapper.insert(use);
        appendEvent(use, null, VehicleConstants.EVENT_DIRECT_REGISTER, current,
                "原因：" + dto.getDirectReason(), null, null, dto.getRequestKey());
        log.info("授权直接登记已建单: useNo={}, vehicleId={}, operator={}", use.getUseNo(), vehicle.getId(), current.getUsername());
        return use.getId();
    }

    /* ==================== 安排与出还车 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void assign(VehicleUseDto.Assign dto) {
        SysUser current = guard.currentUser();
        VehicleUse use = lockUse(dto.getUseId());
        requireStatus(use, Set.of(VehicleConstants.STATUS_TO_ASSIGN, VehicleConstants.STATUS_TO_DEPART), "車輛安排");
        if (dto.getVehicleId() == null || dto.getDriverId() == null) {
            throw new BusinessException("請選擇車輛與實際駕駛人");
        }
        Vehicle vehicle = lockVehicle(dto.getVehicleId());
        guard.requireManageVehicle(current, vehicle.getId(), "安排車輛");
        // 换车必须新旧车辆都在本人管理范围内：否则可以把车甩给自己管不到的车以绕过审计
        if (use.getFinalVehicleId() != null && !use.getFinalVehicleId().equals(vehicle.getId())) {
            guard.requireManageVehicle(current, use.getFinalVehicleId(), "從原車輛改派");
        }
        guard.checkPassenger(nvl(use.getPassengerCount(), 1), vehicle.getSeatCount());
        if (!guard.deptAllowed(vehicle.getId(), use.getDepartmentId())) {
            throw new BusinessException("用車部門不在該車的顯式授權範圍內");
        }
        List<String> blockers = new ArrayList<>(guard.vehicleBlockers(vehicle, use.getPlannedStart().toLocalDate()));
        blockers.addAll(guard.qualificationBlockers(dto.getDriverId(), vehicle.getRegisterRegion(),
                use.getPlannedStart().toLocalDate()));
        String conflict = conflictMessage(vehicle.getId(), dto.getDriverId(),
                use.getPlannedStart(), use.getPlannedEnd(), use.getId());
        if (conflict != null) {
            blockers.add(conflict);
        }
        if (!blockers.isEmpty()) {
            throw new BusinessException(String.join("；", blockers));
        }

        String before = use.getFinalPlateNo() + "/" + use.getDriverName();
        applyAssignmentFields(use, vehicle, dto.getDriverId(), current, use.getDirectReason());
        use.setConflictNote(trimToNull(dto.getConflictNote()));
        use.setStatus(VehicleConstants.STATUS_TO_DEPART);
        use.setVersion(use.getVersion() + 1);
        use.setUpdatedBy(operatorResolver.operatorSignature(current));
        use.setUpdatedAt(LocalDateTime.now());
        if (useMapper.updateById(use) == 0) {
            throw new BusinessException("用車單已被他人修改，請刷新後重試");
        }
        appendEvent(use, vehicle.getId(), VehicleConstants.EVENT_ASSIGN, current,
                trimToNull(dto.getReason()), Map.of("vehicle", before),
                Map.of("vehicle", use.getFinalPlateNo() + "/" + use.getDriverName()), dto.getRequestKey());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void depart(VehicleUseDto.Depart dto) {
        SysUser current = guard.currentUser();
        VehicleUse use = lockUse(dto.getUseId());
        requireStatus(use, Set.of(VehicleConstants.STATUS_TO_DEPART), "出車登記");
        if (dto.getDepartAt() == null || dto.getStartOdometer() == null) {
            throw new BusinessException("請填寫實際出車時間與起始里程");
        }
        // 批准开始时间已过而未出车：不允许补点出车，必须重新办理，否则台账会出现"事后造出来的准时"
        if (dto.getDepartAt().isAfter(use.getPlannedEnd())) {
            throw new BusinessException("已超過批准時段且尚未出車，不可直接補點出車，請重新辦理用車");
        }
        Vehicle vehicle = lockVehicle(use.getFinalVehicleId());
        List<String> blockers = new ArrayList<>(guard.vehicleBlockers(vehicle, dto.getDepartAt().toLocalDate()));
        blockers.addAll(guard.qualificationBlockers(use.getDriverId(), vehicle.getRegisterRegion(),
                dto.getDepartAt().toLocalDate()));
        if (!Boolean.TRUE.equals(dto.getKeyReceived())) {
            blockers.add("鑰匙未領取不可出車");
        }
        // 与车辆详情返回的 suggestStartOdometer 同一个查询：两处不同源时页面提示一个值、后端拒绝另一个值
        BigDecimal lastConfirmed = tripMapper.latestConfirmedEnd(vehicle.getId());
        if (lastConfirmed != null && dto.getStartOdometer().compareTo(lastConfirmed) < 0) {
            blockers.add("起始里程低於上次已確認值 " + lastConfirmed + " km");
        }
        if (!blockers.isEmpty()) {
            throw new BusinessException(String.join("；", blockers));
        }

        VehicleTrip trip = tripMapper.selectByUseForUpdate(use.getId());
        LocalDateTime now = LocalDateTime.now();
        if (trip == null) {
            trip = new VehicleTrip();
            trip.setUseId(use.getId());
            trip.setVehicleId(vehicle.getId());
            trip.setVersion(0);
            trip.setCreatedBy(operatorResolver.operatorSignature(current));
        }
        trip.setVehiclePlateNo(vehicle.getPlateNo());
        trip.setDriverId(use.getDriverId());
        trip.setDriverEmpNo(use.getDriverEmpNo());
        trip.setDriverName(use.getDriverName());
        trip.setStatus(VehicleConstants.TRIP_DEPARTED);
        trip.setDepartAt(dto.getDepartAt());
        trip.setStartOdometer(dto.getStartOdometer());
        trip.setKeyReceived(Boolean.TRUE.equals(dto.getKeyReceived()) ? 1 : 0);
        trip.setConditionOk(Boolean.TRUE.equals(dto.getConditionOk()) ? 1 : 0);
        trip.setDepartById(current.getId());
        trip.setDepartByName(operatorResolver.operatorSignature(current));
        trip.setDepartRegisteredAt(now);
        trip.setMileage(null);
        trip.setUpdatedBy(operatorResolver.operatorSignature(current));
        if (trip.getId() == null) {
            trip.setCreatedBy(operatorResolver.operatorSignature(current));
            tripMapper.insert(trip);
        } else {
            trip.setUpdatedAt(LocalDateTime.now());
            tripMapper.updateById(trip);
        }

        advance(use, VehicleConstants.STATUS_IN_USE, current, dto.getRequestKey());
        appendEvent(use, vehicle.getId(), VehicleConstants.EVENT_DEPART, current,
                "起始里程 " + dto.getStartOdometer() + " km", null, null, dto.getRequestKey());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void ret(VehicleUseDto.Return dto) {
        SysUser current = guard.currentUser();
        VehicleUse use = lockUse(dto.getUseId());
        requireStatus(use, Set.of(VehicleConstants.STATUS_IN_USE), "歸還登記");
        VehicleTrip trip = tripMapper.selectByUseForUpdate(use.getId());
        if (trip == null || trip.getDepartAt() == null) {
            throw new BusinessException("尚未登記出車，無法歸還");
        }
        if (dto.getReturnAt() == null || dto.getEndOdometer() == null || !StringUtils.hasText(dto.getReturnPlace())) {
            throw new BusinessException("請填寫實際歸還時間、結束里程與歸還地點");
        }
        if (dto.getReturnAt().isBefore(trip.getDepartAt())) {
            throw new BusinessException("歸還時間不得早於出車時間");
        }
        // 晚归一律据实登记：绝不因"撞上后一单"而拒绝还车，也不倒改批准时段
        Set<String> flags = new LinkedHashSet<>(splitFlags(trip.getFlags()));
        flags.remove(VehicleConstants.FLAG_MILEAGE_ANOMALY);
        if (dto.getReturnAt().isAfter(use.getPlannedEnd())) {
            flags.add(VehicleConstants.FLAG_OVERDUE);
        }
        if (!Boolean.TRUE.equals(dto.getKeyReturned())) {
            flags.add(VehicleConstants.FLAG_KEY_PENDING);
        }
        if ("abnormal".equals(dto.getVehicleCondition())) {
            flags.add(VehicleConstants.FLAG_CONDITION_ABNORMAL);
            if (!StringUtils.hasText(dto.getExceptionNote())) {
                throw new BusinessException("車況異常必須填寫異常說明");
            }
        }
        if (trip.getStartOdometer() != null && dto.getEndOdometer().compareTo(trip.getStartOdometer()) < 0) {
            throw new BusinessException("結束里程小於起始里程，需走授權更正，不能在歸還時直接覆蓋");
        }

        trip.setReturnAt(dto.getReturnAt());
        trip.setEndOdometer(dto.getEndOdometer());
        trip.setReturnPlace(dto.getReturnPlace().trim());
        trip.setKeyReturned(Boolean.TRUE.equals(dto.getKeyReturned()) ? 1 : 0);
        trip.setVehicleCondition("abnormal".equals(dto.getVehicleCondition()) ? "abnormal" : "normal");
        trip.setExceptionNote(trimToNull(dto.getExceptionNote()));
        trip.setMileage(dto.getEndOdometer().subtract(trip.getStartOdometer()));
        trip.setDurationHours(hoursBetween(trip.getDepartAt(), dto.getReturnAt()));
        trip.setStatus(VehicleConstants.TRIP_RETURNED);
        trip.setFlags(joinFlags(flags));
        trip.setVersion(trip.getVersion() + 1);
        trip.setUpdatedBy(operatorResolver.operatorSignature(current));
        trip.setUpdatedAt(LocalDateTime.now());
        tripMapper.updateById(trip);

        advance(use, VehicleConstants.STATUS_TO_CONFIRM, current, dto.getRequestKey());
        appendEvent(use, trip.getVehicleId(), VehicleConstants.EVENT_RETURN, current,
                "行駛 " + trip.getMileage() + " km，時長 " + trip.getDurationHours() + " 小時",
                null, null, dto.getRequestKey());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void confirm(VehicleUseDto.Confirm dto) {
        SysUser current = guard.currentUser();
        VehicleUse use = lockUse(dto.getUseId());
        requireStatus(use, Set.of(VehicleConstants.STATUS_TO_CONFIRM), "歸還確認");
        VehicleTrip trip = tripMapper.selectByUseForUpdate(use.getId());
        if (trip == null) {
            throw new BusinessException("未找到行程記錄，無法確認");
        }
        List<String> blockers = new ArrayList<>();
        if (trip.getReturnAt() == null) {
            blockers.add("尚未登記實際歸還時間");
        }
        if (Objects.equals(trip.getKeyReturned(), 0)) {
            blockers.add("鑰匙未交還：可先完成歸還登記，但本單不得歸檔，車輛也不可派出");
        }
        if ("abnormal".equals(trip.getVehicleCondition()) && !StringUtils.hasText(trip.getExceptionNote())) {
            blockers.add("車況異常必須填寫異常說明");
        }
        if (trip.getMileage() == null) {
            blockers.add("里程數據不完整，需先經授權更正");
        }
        if (!blockers.isEmpty()) {
            throw new BusinessException(String.join("；", blockers));
        }
        if (tripMapper.confirmTrip(trip.getId(), trip.getStatus(), current.getId(),
                operatorResolver.operatorSignature(current), trip.getVersion(),
                operatorResolver.operatorSignature(current)) == 0) {
            throw new BusinessException("行程已被他人確認，請刷新後重試");
        }
        advance(use, VehicleConstants.STATUS_COMPLETED, current, dto.getRequestKey());
        // 里程基线只前进：待核对/争议行程不得污染下一单的默认起始里程
        if (trip.getVehicleId() != null && trip.getEndOdometer() != null) {
            vehicleMapper.advanceOdometer(trip.getVehicleId(), trip.getEndOdometer(),
                    operatorResolver.operatorSignature(current));
        }
        appendEvent(use, trip.getVehicleId(), VehicleConstants.EVENT_CONFIRM, current,
                trimToNull(dto.getReason()), null, null, dto.getRequestKey());
    }

    /* ==================== 补录与更正 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long backfill(VehicleUseDto.Backfill dto) {
        SysUser current = guard.currentUser();
        if (!StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("補錄必須填寫依據說明");
        }
        if (dto.getVehicleId() == null || dto.getDriverId() == null
                || dto.getDepartAt() == null || dto.getReturnAt() == null) {
            throw new BusinessException("請填寫車輛、駕駛人與實際出還車時間");
        }
        VehicleUse existing = findByIdempotencyKey(current.getId(), dto.getRequestKey());
        if (existing != null) {
            return existing.getId();
        }
        validateWindow(dto.getDepartAt(), dto.getReturnAt());
        guard.requireManageVehicle(current, dto.getVehicleId(), "事後補錄");
        Vehicle vehicle = lockVehicle(dto.getVehicleId());
        guard.checkPassenger(nvl(dto.getPassengerCount(), 1), vehicle.getSeatCount());
        List<String> blockers = new ArrayList<>(guard.qualificationBlockers(dto.getDriverId(),
                vehicle.getRegisterRegion(), dto.getDepartAt().toLocalDate()));
        if (dto.getEndOdometer() != null && dto.getStartOdometer() != null
                && dto.getEndOdometer().compareTo(dto.getStartOdometer()) < 0) {
            blockers.add("結束里程小於起始里程");
        }
        if (!blockers.isEmpty()) {
            throw new BusinessException(String.join("；", blockers));
        }

        VehicleUse use = new VehicleUse();
        use.setUseNo(bizSeqService.next(VehicleConstants.seqRuleOf(VehicleConstants.SOURCE_BACKFILL)));
        use.setSource(VehicleConstants.SOURCE_BACKFILL);
        // 补录没有事前审批，标 not_applicable 而不是 approved
        use.setApprovalOutcome(VehicleConstants.APPROVAL_NOT_APPLICABLE);
        use.setStatus(VehicleConstants.STATUS_TO_CONFIRM);
        fillApplicant(use, current, StringUtils.hasText(dto.getActualUserName())
                ? dto.getActualUserName() : current.getName());
        use.setDepartmentId(dto.getDepartmentId());
        use.setDepartmentName(departmentName(dto.getDepartmentId(), current));
        applyAssignmentFields(use, vehicle, dto.getDriverId(), current, "事後補錄：" + dto.getReason());
        use.setPurpose(dto.getPurpose().trim());
        use.setOrigin(nullToEmpty(dto.getOrigin()));
        use.setDestination(nullToEmpty(dto.getDestination()));
        use.setPlannedStart(dto.getDepartAt());
        use.setPlannedEnd(dto.getReturnAt());
        use.setDrivingMode(VehicleConstants.MODE_COMPANY_DRIVER);
        use.setPassengerCount(nvl(dto.getPassengerCount(), 1));
        use.setBackfillEntryAt(LocalDateTime.now());
        use.setVersion(0);
        use.setCreatedBy(operatorResolver.operatorSignature(current));
        use.setUpdatedBy(operatorResolver.operatorSignature(current));
        use.setRequestKey(trimToNull(dto.getRequestKey()));
        useMapper.insert(use);

        // 补录不占用当前车辆（实际时段已过去），但要与既有记录比对：冲突进争议核对，绝不覆盖旧单
        boolean disputed = !useMapper.findConflictUseNos(vehicle.getId(), dto.getDriverId(),
                dto.getDepartAt(), dto.getReturnAt(), use.getId()).isEmpty();
        VehicleTrip trip = new VehicleTrip();
        trip.setUseId(use.getId());
        trip.setVehicleId(vehicle.getId());
        trip.setVehiclePlateNo(vehicle.getPlateNo());
        trip.setDriverId(use.getDriverId());
        trip.setDriverEmpNo(use.getDriverEmpNo());
        trip.setDriverName(use.getDriverName());
        trip.setStatus(disputed ? VehicleConstants.TRIP_DISPUTED : VehicleConstants.TRIP_PENDING_CHECK);
        trip.setDepartAt(dto.getDepartAt());
        trip.setStartOdometer(dto.getStartOdometer());
        trip.setDepartById(current.getId());
        trip.setDepartByName(operatorResolver.operatorSignature(current));
        trip.setDepartRegisteredAt(use.getBackfillEntryAt());
        trip.setReturnAt(dto.getReturnAt());
        trip.setEndOdometer(dto.getEndOdometer());
        trip.setReturnPlace(trimToNull(dto.getReturnPlace()));
        trip.setKeyReturned(1);
        trip.setVehicleCondition("normal");
        if (dto.getStartOdometer() != null && dto.getEndOdometer() != null) {
            trip.setMileage(dto.getEndOdometer().subtract(dto.getStartOdometer()));
        }
        trip.setDurationHours(hoursBetween(dto.getDepartAt(), dto.getReturnAt()));
        Set<String> flags = new LinkedHashSet<>();
        flags.add(VehicleConstants.FLAG_BACKFILL);
        if (disputed) {
            flags.add(VehicleConstants.FLAG_MILEAGE_ANOMALY);
        }
        trip.setFlags(joinFlags(flags));
        trip.setBackfillEntryAt(use.getBackfillEntryAt());
        trip.setVersion(0);
        trip.setCreatedBy(operatorResolver.operatorSignature(current));
        trip.setUpdatedBy(operatorResolver.operatorSignature(current));
        tripMapper.insert(trip);

        appendEvent(use, vehicle.getId(), VehicleConstants.EVENT_BACKFILL, current,
                "實際發生 " + dto.getDepartAt() + " ~ " + dto.getReturnAt() + "；依據：" + dto.getReason()
                        + (disputed ? "；與既有記錄衝突，進入爭議核對" : ""),
                null, null, dto.getRequestKey());
        return use.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void correct(VehicleUseDto.Correct dto) {
        SysUser current = guard.currentUser();
        if (!StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("授權更正必須填寫理由");
        }
        VehicleUse use = lockUse(dto.getUseId());
        // 只有已归档单据才走更正；待核对/争议中的单据由确认流程处理
        requireStatus(use, Set.of(VehicleConstants.STATUS_COMPLETED), "授權更正");
        VehicleTrip trip = tripMapper.selectByUseForUpdate(use.getId());
        if (trip == null) {
            throw new BusinessException("未找到行程記錄，無法更正");
        }

        Map<String, Object> before = new java.util.LinkedHashMap<>();
        before.put("driverName", trip.getDriverName());
        before.put("departAt", trip.getDepartAt());
        before.put("returnAt", trip.getReturnAt());
        before.put("startOdometer", trip.getStartOdometer());
        before.put("endOdometer", trip.getEndOdometer());

        Long driverId = dto.getDriverId() == null ? trip.getDriverId() : dto.getDriverId();
        LocalDateTime departAt = dto.getDepartAt() == null ? trip.getDepartAt() : dto.getDepartAt();
        LocalDateTime returnAt = dto.getReturnAt() == null ? trip.getReturnAt() : dto.getReturnAt();
        BigDecimal start = dto.getStartOdometer() == null ? trip.getStartOdometer() : dto.getStartOdometer();
        BigDecimal end = dto.getEndOdometer() == null ? trip.getEndOdometer() : dto.getEndOdometer();

        if (returnAt != null && departAt != null && !returnAt.isAfter(departAt)) {
            throw new BusinessException("歸還時間必須晚於出車時間");
        }
        Vehicle vehicle = trip.getVehicleId() == null ? null : lockVehicle(trip.getVehicleId());
        List<String> blockers = new ArrayList<>();
        if (start != null && end != null && end.compareTo(start) < 0) {
            blockers.add("更正後結束里程小於起始里程");
        }
        if (vehicle != null) {
            blockers.addAll(guard.qualificationBlockers(driverId, vehicle.getRegisterRegion(), LocalDate.now()));
        }
        if (departAt != null && returnAt != null && vehicle != null) {
            List<String> clash = useMapper.findConflictUseNos(vehicle.getId(), driverId, departAt, returnAt, use.getId());
            if (!clash.isEmpty()) {
                blockers.add("更正後將與 " + String.join("、", clash) + " 衝突");
            }
        }
        if (!blockers.isEmpty()) {
            throw new BusinessException(String.join("；", blockers));
        }

        Set<String> flags = new LinkedHashSet<>(splitFlags(trip.getFlags()));
        flags.add(VehicleConstants.FLAG_CORRECTED);
        trip.setDriverId(driverId);
        // 更正可以改人：驾驶人快照跟员工档案走，但车牌保持行程发生时的值不改
        applyDriverSnapshot(trip, driverId);
        trip.setDepartAt(departAt);
        trip.setReturnAt(returnAt);
        trip.setStartOdometer(start);
        trip.setEndOdometer(end);
        trip.setMileage(start != null && end != null ? end.subtract(start) : null);
        trip.setDurationHours(hoursBetween(departAt, returnAt));
        trip.setFlags(joinFlags(flags));
        trip.setVersion(trip.getVersion() + 1);
        trip.setUpdatedBy(operatorResolver.operatorSignature(current));
        trip.setUpdatedAt(LocalDateTime.now());
        tripMapper.updateById(trip);

        // 里程基线同步：若该车当前基线正是这条行程确立的，更正后必须跟着走，
        // 否则下一单的默认起始里程会低于真实值，里程链从更正处断开
        syncBaselineAfterCorrect(vehicle, before.get("endOdometer"), end, current);

        use.setVersion(use.getVersion() + 1);
        use.setUpdatedBy(operatorResolver.operatorSignature(current));
        use.setUpdatedAt(LocalDateTime.now());
        useMapper.updateById(use);
        Map<String, Object> after = new java.util.LinkedHashMap<>();
        after.put("driverName", trip.getDriverName());
        after.put("departAt", trip.getDepartAt());
        after.put("returnAt", trip.getReturnAt());
        after.put("startOdometer", trip.getStartOdometer());
        after.put("endOdometer", trip.getEndOdometer());
        appendEvent(use, trip.getVehicleId(), VehicleConstants.EVENT_CORRECT, current,
                dto.getReason(), before, after, dto.getRequestKey());
        log.info("用车行程已授权更正: useNo={}, operator={}, reason={}", use.getUseNo(), current.getUsername(), dto.getReason());
    }

    /* ==================== 台账 ==================== */

    /**
     * 更正后同步车辆里程基线。
     *
     * <p>只在“当前基线 == 更正前的结束里程”时动：这说明本单就是该车最近一次行程；
     * 更正历史单据时不能碰基线，否则会把一个旧读数当成“当前里程”。
     * 基线只上调不下调：往下改需要重新校验之后所有单的起始里程，不是一行 UPDATE 能带住的，
     * 宁可留日志人工介入，也不能静默造成里程链矛盾。
     */
    private void syncBaselineAfterCorrect(Vehicle vehicle, Object endBeforeRaw,
                                          java.math.BigDecimal endAfter, SysUser current) {
        if (vehicle == null || endAfter == null || !(endBeforeRaw instanceof java.math.BigDecimal endBefore)) {
            return;
        }
        java.math.BigDecimal baseline = vehicle.getCurrentOdometer();
        if (baseline == null || baseline.compareTo(endBefore) != 0) {
            return;
        }
        if (endAfter.compareTo(baseline) >= 0) {
            vehicleMapper.advanceOdometer(vehicle.getId(), endAfter,
                    operatorResolver.operatorSignature(current));
            log.info("授权更正后里程基线已同步: plate={}, {} -> {}",
                    vehicle.getPlateNo(), baseline, endAfter);
        } else {
            log.warn("授权更正将结束里程下调（{} -> {}），但该车里程基线仍为 {}；"
                    + "基线不自动下调，需人工确认后续行程的起始里程是否仍成立",
                    endBefore, endAfter, baseline);
        }
    }

    @Override
    public PageResult<VehicleUseDto.VO> ledgerPage(VehicleUseDto.Query query) {
        SysUser current = guard.currentUser();
        LambdaQueryWrapper<VehicleUse> wrapper = new LambdaQueryWrapper<>();
        // 台账只呈现实际发生过行程的单据（含待核对与争议，由 flags/tripStatus 区分）
        wrapper.exists("SELECT 1 FROM biz_vehicle_trip t WHERE t.use_id = biz_vehicle_use.id AND t.deleted = 0");
        applyCommonFilters(wrapper, query);
        if (StringUtils.hasText(query.getTripStatus())) {
            wrapper.exists("SELECT 1 FROM biz_vehicle_trip t2 WHERE t2.use_id = biz_vehicle_use.id "
                    + "AND t2.deleted = 0 AND t2.status = {0}", query.getTripStatus());
        }
        if (StringUtils.hasText(query.getDriverName())) {
            wrapper.like(VehicleUse::getDriverName, query.getDriverName().trim());
        }
        if (query.getFromDate() != null) {
            wrapper.ge(VehicleUse::getPlannedStart, query.getFromDate());
        }
        if (query.getToDate() != null) {
            wrapper.le(VehicleUse::getPlannedStart, query.getToDate());
        }
        List<Long> manageable = guard.manageableVehicleIds(current);
        if (manageable != null) {
            if (manageable.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(VehicleUse::getFinalVehicleId, manageable);
        }
        wrapper.orderByDesc(VehicleUse::getPlannedStart);
        Page<VehicleUse> page = new Page<>(normalizePage(query.getPage()), normalizeSize(query.getSize()));
        Page<VehicleUse> result = useMapper.selectPage(page, wrapper);
        return new PageResult<>(result.getRecords().stream().map(this::toVO).toList(), result.getTotal());
    }

    @Override
    public VehicleUseDto.LedgerStats ledgerStats(VehicleUseDto.Query query) {
        SysUser current = guard.currentUser();
        List<Long> manageable = guard.manageableVehicleIds(current);
        if (manageable != null && manageable.isEmpty()) {
            return emptyStats();
        }
        Map<String, Object> row = tripMapper.ledgerStats(query.getFromDate(), query.getToDate(),
                query.getVehicleId(), null, query.getDepartmentId(), query.getSource(), manageable);
        VehicleUseDto.LedgerStats stats = new VehicleUseDto.LedgerStats();
        stats.setTripCount(toLong(row.get("tripCount")));
        stats.setVehicleCount(toLong(row.get("vehicleCount")));
        stats.setDriverCount(toLong(row.get("driverCount")));
        stats.setTotalMileage(toDecimal(row.get("totalMileage")));
        stats.setTotalHours(toDecimal(row.get("totalHours")));
        stats.setOverdueCount(toLong(row.get("overdueCount")));
        stats.setPendingCount(toLong(row.get("pendingCount")));
        return stats;
    }

    @Override
    public List<VehicleUseDto.SummaryRow> ledgerByDepartment() {
        return toRows(tripMapper.ledgerByDepartment(), "departmentId", "departmentName");
    }

    @Override
    public List<VehicleUseDto.SummaryRow> ledgerByVehicle() {
        return toRows(tripMapper.ledgerByVehicle(), "vehicleId", "plateNo");
    }

    @Override
    public List<VehicleUseDto.EventVO> events(long useId) {
        VehicleUse use = requireUse(useId);
        requireUseVisible(use);
        return eventMapper.listByUse(useId).stream().map(e -> {
            VehicleUseDto.EventVO vo = new VehicleUseDto.EventVO();
            vo.setId(e.getId());
            vo.setAction(e.getAction());
            vo.setOperatorName(e.getOperatorName());
            vo.setOperatorEmpNo(e.getOperatorEmpNo());
            vo.setOccurredAt(DateTimeUtils.format(e.getOccurredAt()));
            vo.setReason(e.getReason());
            vo.setBeforeJson(e.getBeforeJson());
            vo.setAfterJson(e.getAfterJson());
            return vo;
        }).toList();
    }

    /* ==================== 内部：锁、校验与推进 ==================== */

    private VehicleUse requireUse(long id) {
        VehicleUse use = useMapper.selectById(id);
        if (use == null) {
            throw new BusinessException("用車單不存在或已作廢");
        }
        return use;
    }

    /** 本人可见性：申请人、驾驶人、或该车授权管理人员，三者之外不可读 */
    private void requireUseVisible(VehicleUse use) {
        SysUser current = guard.currentUser();
        if (guard.isAdmin(current)) {
            return;
        }
        boolean mine = Objects.equals(use.getApplicantId(), current.getId())
                || Objects.equals(use.getDriverId(), current.getId());
        if (mine) {
            return;
        }
        Long vehicleId = use.getFinalVehicleId() == null ? use.getIntentVehicleId() : use.getFinalVehicleId();
        if (vehicleId == null) {
            throw new BusinessException("無權查看該用車單");
        }
        guard.requireVehicleVisible(current, vehicleId);
    }

    private VehicleUse lockUse(long id) {
        VehicleUse use = useMapper.selectForUpdate(id);
        if (use == null) {
            throw new BusinessException("用車單不存在或已作廢");
        }
        return use;
    }

    /** 锁车辆行：时段冲突与状态推进必须在同一锁边界内完成 */
    private Vehicle lockVehicle(Long vehicleId) {
        if (vehicleId == null) {
            throw new BusinessException("未選擇車輛");
        }
        Vehicle vehicle = vehicleMapper.selectForUpdate(vehicleId);
        if (vehicle == null) {
            throw new BusinessException("車輛不存在或已刪除");
        }
        return vehicle;
    }

    private void requireStatus(VehicleUse use, Set<String> allowed, String action) {
        if (!allowed.contains(use.getStatus())) {
            throw new BusinessException("當前狀態「" + use.getStatus() + "」不可執行" + action
                    + "，本頁面僅處理「" + String.join("/", allowed) + "」的單據");
        }
    }

    /** 带状态条件的推进：受影响 0 行说明被并发抢先，必须报错而不是静默覆盖 */
    private void advance(VehicleUse use, String toStatus, SysUser current, String requestKey) {
        if (!VehicleConstants.canTransition(use.getStatus(), toStatus)) {
            throw new BusinessException("不允許的狀態變更：" + use.getStatus() + " → " + toStatus);
        }
        if (useMapper.updateStatusVersioned(use.getId(), use.getStatus(), toStatus, use.getVersion(),
                operatorResolver.operatorSignature(current)) == 0) {
            throw new BusinessException("用車單已被他人變更，請刷新後重試");
        }
        use.setStatus(toStatus);
        use.setVersion(use.getVersion() + 1);
    }

    /** 时段重叠检查：同车或同驾驶人任一命中即冲突，返回可读提示 */
    private String conflictMessage(Long vehicleId, Long driverId, LocalDateTime start, LocalDateTime end, Long excludeUseId) {
        List<String> clashes = useMapper.findConflictUseNos(vehicleId, driverId, start, end, excludeUseId);
        if (clashes.isEmpty()) {
            return null;
        }
        return "所選時段已被 " + String.join("、", clashes) + " 占用（車輛或駕駛人任一衝突即不可安排）";
    }

    private void validateWindow(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            throw new BusinessException("請填寫完整的起止時間");
        }
        if (!end.isAfter(start)) {
            throw new BusinessException("結束時間必須晚於開始時間");
        }
    }

    private VehicleUse findByIdempotencyKey(Long operatorId, String requestKey) {
        if (operatorId == null || !StringUtils.hasText(requestKey)) {
            return null;
        }
        return useMapper.findByIdempotencyKey(operatorId, requestKey);
    }

    private void fillApplicant(VehicleUse use, SysUser current, String actualUserName) {
        use.setApplicantId(current.getId());
        use.setApplicantEmpNo(nullToEmpty(current.getEmpId()));
        use.setApplicantName(nullToEmpty(current.getName()));
        use.setActualUserName(actualUserName.trim());
        if (use.getDepartmentId() == null) {
            use.setDepartmentId(current.getDepartmentId());
            use.setDepartmentName(nullToEmpty(current.getDepartment()));
        }
    }

    /**
     * 安排结果写字段。
     *
     * <p>驾驶人工号/姓名从员工档案取，不接前端传值：否则代登记时可以把任意姓名写进
     * 台账，事后无法对应到具体员工。
     */
    private void applyAssignmentFields(VehicleUse use, Vehicle vehicle, Long driverId,
                                       SysUser current, String directReason) {
        use.setFinalVehicleId(vehicle.getId());
        use.setFinalPlateNo(vehicle.getPlateNo());
        use.setDriverId(driverId);
        use.setAssignById(current.getId());
        use.setAssignByName(operatorResolver.operatorSignature(current));
        use.setAssignAt(LocalDateTime.now());
        use.setDirectReason(trimToNull(directReason));
        SysUser driver = driverId == null ? null : userMapper.selectById(driverId);
        if (driver == null) {
            throw new BusinessException("未找到該駕駛人員工記錄");
        }
        use.setDriverEmpNo(nullToEmpty(driver.getEmpId()));
        use.setDriverName(nullToEmpty(driver.getName()));
    }

    /** 更正时刷新行程上的驾驶人快照 */
    private void applyDriverSnapshot(VehicleTrip trip, Long driverId) {
        SysUser driver = driverId == null ? null : userMapper.selectById(driverId);
        if (driver == null) {
            throw new BusinessException("未找到該駕駛人員工記錄");
        }
        trip.setDriverId(driver.getId());
        trip.setDriverEmpNo(nullToEmpty(driver.getEmpId()));
        trip.setDriverName(nullToEmpty(driver.getName()));
    }

    /** 部门名称快照：按 deptId 查档案，不拿当前登录人的部门顶替（代登记场景下两者不同） */
    private String departmentName(Long departmentId, SysUser current) {
        if (departmentId == null) {
            return nullToEmpty(current.getDepartment());
        }
        SysDepartment dept = departmentMapper.selectById(departmentId);
        return dept == null ? nullToEmpty(current.getDepartment()) : nullToEmpty(dept.getName());
    }

    private void appendEvent(VehicleUse use, Long vehicleId, String action, SysUser current,
                             String reason, Object before, Object after, String requestKey) {
        if (StringUtils.hasText(requestKey)
                && eventMapper.countByIdempotencyKey(current.getId(), requestKey) > 0) {
            return;
        }
        VehicleUseEvent event = new VehicleUseEvent();
        event.setUseId(use.getId());
        event.setVehicleId(vehicleId);
        event.setTargetNo(use.getUseNo());
        event.setAction(action);
        event.setReason(trimToNull(reason));
        event.setBeforeJson(before == null ? null : toJson(before));
        event.setAfterJson(after == null ? null : toJson(after));
        event.setOperatorId(current.getId());
        event.setOperatorName(nullToEmpty(current.getName()));
        event.setOperatorEmpNo(nullToEmpty(current.getEmpId()));
        event.setRequestKey(trimToNull(requestKey));
        event.setOccurredAt(LocalDateTime.now());
        eventMapper.insert(event);
    }

    private VehicleUseDto.VO toVO(VehicleUse use) {
        VehicleUseDto.VO vo = new VehicleUseDto.VO();
        vo.setId(use.getId());
        vo.setUseNo(use.getUseNo());
        vo.setSource(use.getSource());
        vo.setApprovalOutcome(use.getApprovalOutcome());
        vo.setStatus(use.getStatus());
        vo.setFlowNo(use.getFlowNo());
        vo.setApplicantId(use.getApplicantId());
        vo.setApplicantEmpNo(use.getApplicantEmpNo());
        vo.setApplicantName(use.getApplicantName());
        vo.setActualUserName(use.getActualUserName());
        vo.setDepartmentId(use.getDepartmentId());
        vo.setDepartmentName(use.getDepartmentName());
        vo.setIntentVehicleId(use.getIntentVehicleId());
        vo.setIntentPlateNo(use.getIntentPlateNo());
        vo.setFinalVehicleId(use.getFinalVehicleId());
        vo.setFinalPlateNo(use.getFinalPlateNo());
        vo.setDriverId(use.getDriverId());
        vo.setDriverEmpNo(use.getDriverEmpNo());
        vo.setDriverName(use.getDriverName());
        vo.setDrivingMode(use.getDrivingMode());
        vo.setPassengerCount(use.getPassengerCount());
        vo.setPurpose(use.getPurpose());
        vo.setOrigin(use.getOrigin());
        vo.setDestination(use.getDestination());
        vo.setPlannedStart(DateTimeUtils.format(use.getPlannedStart()));
        vo.setPlannedEnd(DateTimeUtils.format(use.getPlannedEnd()));
        vo.setAssignByName(use.getAssignByName());
        vo.setAssignAt(DateTimeUtils.format(use.getAssignAt()));
        vo.setDirectReason(use.getDirectReason());
        vo.setConflictNote(use.getConflictNote());
        vo.setPrevUseId(use.getPrevUseId());
        vo.setVersion(use.getVersion());
        vo.setUpdatedBy(use.getUpdatedBy());
        vo.setUpdatedAt(DateTimeUtils.format(use.getUpdatedAt()));
        vo.setCreatedAt(DateTimeUtils.format(use.getCreatedAt()));

        VehicleTrip trip = use.getId() == null ? null
                : tripMapper.selectOne(new LambdaQueryWrapper<VehicleTrip>().eq(VehicleTrip::getUseId, use.getId()));
        if (trip != null) {
            vo.setTrip(toTripVO(trip));
        }
        Vehicle vehicle = vehicleMapper.selectById(use.getFinalVehicleId() == null
                ? -1L : use.getFinalVehicleId());
        vo.setVehicleBlockers(vehicle == null ? List.of()
                : guard.vehicleBlockers(vehicle, LocalDate.now()));
        vo.setAllowedActions(allowedActions(use, vehicle));
        return vo;
    }

    /**
     * 可执行动作由服务端算：前端只按这个列表渲染按钮。
     * 让前端自己按 status 推断会必然出现"界面给了按钮、后端拒绝"或反过来的偏差。
     */
    private List<String> allowedActions(VehicleUse use, Vehicle vehicle) {
        SysUser current = guard.currentUser();
        List<String> actions = new ArrayList<>();
        boolean manager = use.getFinalVehicleId() != null && guard.canManageVehicle(current, use.getFinalVehicleId());
        boolean mine = Objects.equals(use.getApplicantId(), current.getId());
        switch (use.getStatus()) {
            case VehicleConstants.STATUS_DRAFT -> {
                if (mine) {
                    actions.add("cancel");
                }
            }
            case VehicleConstants.STATUS_TO_ASSIGN -> {
                if (manager && vehicle != null && guard.vehicleBlockers(vehicle, LocalDate.now()).isEmpty()) {
                    actions.add("assign");
                }
                if (mine) {
                    actions.add("cancel");
                }
            }
            case VehicleConstants.STATUS_TO_DEPART -> {
                if (manager) {
                    actions.add("depart");
                    actions.add("assign");
                }
                if (mine) {
                    actions.add("cancel");
                }
            }
            case VehicleConstants.STATUS_IN_USE -> {
                if (manager || Objects.equals(use.getDriverId(), current.getId())) {
                    actions.add("return");
                }
            }
            case VehicleConstants.STATUS_TO_CONFIRM -> {
                if (manager) {
                    actions.add("confirm");
                }
            }
            case VehicleConstants.STATUS_COMPLETED -> {
                if (manager && guard.isAdmin(current)) {
                    actions.add("correct");
                }
            }
            default -> {
            }
        }
        return actions;
    }

    private VehicleUseDto.Trip toTripVO(VehicleTrip trip) {
        VehicleUseDto.Trip vo = new VehicleUseDto.Trip();
        vo.setId(trip.getId());
        vo.setVehiclePlateNo(trip.getVehiclePlateNo());
        vo.setStatus(trip.getStatus());
        vo.setDepartAt(DateTimeUtils.format(trip.getDepartAt()));
        vo.setStartOdometer(trip.getStartOdometer());
        vo.setKeyReceived(Objects.equals(trip.getKeyReceived(), 1));
        vo.setConditionOk(Objects.equals(trip.getConditionOk(), 1));
        vo.setDepartByName(trip.getDepartByName());
        vo.setDepartRegisteredAt(DateTimeUtils.format(trip.getDepartRegisteredAt()));
        vo.setReturnAt(DateTimeUtils.format(trip.getReturnAt()));
        vo.setEndOdometer(trip.getEndOdometer());
        vo.setReturnPlace(trip.getReturnPlace());
        vo.setKeyReturned(Objects.equals(trip.getKeyReturned(), 1));
        vo.setVehicleCondition(trip.getVehicleCondition());
        vo.setExceptionNote(trip.getExceptionNote());
        vo.setConfirmByName(trip.getConfirmByName());
        vo.setConfirmAt(DateTimeUtils.format(trip.getConfirmAt()));
        vo.setMileage(trip.getMileage());
        vo.setDurationHours(trip.getDurationHours());
        vo.setFlags(splitFlags(trip.getFlags()));
        vo.setBackfillEntryAt(DateTimeUtils.format(trip.getBackfillEntryAt()));
        vo.setVersion(trip.getVersion());
        return vo;
    }

    private List<VehicleUseDto.SummaryRow> toRows(List<Map<String, Object>> rows, String keyField, String nameField) {
        List<VehicleUseDto.SummaryRow> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            VehicleUseDto.SummaryRow item = new VehicleUseDto.SummaryRow();
            Object key = row.get(camel(keyField));
            item.setKeyId(key == null ? null : ((Number) key).longValue());
            Object name = row.get(camel(nameField));
            item.setName(name == null ? "" : String.valueOf(name));
            item.setTripCount(toLong(row.get(camel("tripCount"))));
            item.setTotalMileage(toDecimal(row.get(camel("totalMileage"))));
            result.add(item);
        }
        return result;
    }

    /**
     * 待办分组条件：列表与统计徽标共用，Tab 看到的就是这个条件筛出来的。
     *
     * <p>待歸還確認 / 補錄待核對 两个分组靠行程状态区分，而行程状态在另一张表上（用车单没有这一列），
     * 所以用 EXISTS 子查询下推到 SQL。以前这一刀是在前端对已加载的列表切的，
     * 分页后前端只拿得到本页，徽标就会少数。
     * <p>两段子查询都是常量谓词，不拼接任何用户输入。
     */
    private void applyGroup(LambdaQueryWrapper<VehicleUse> wrapper, String group) {
        if (!StringUtils.hasText(group)) {
            return;
        }
        switch (group) {
            case VehicleConstants.STATUS_TO_ASSIGN, VehicleConstants.STATUS_TO_DEPART,
                 VehicleConstants.STATUS_IN_USE -> wrapper.eq(VehicleUse::getStatus, group);
            case VehicleConstants.GROUP_TO_CONFIRM -> wrapper.eq(VehicleUse::getStatus, VehicleConstants.STATUS_TO_CONFIRM)
                    .exists(TRIP_RETURNED_SQL);
            case VehicleConstants.GROUP_BACKFILL -> wrapper.eq(VehicleUse::getStatus, VehicleConstants.STATUS_TO_CONFIRM)
                    .and(w -> w.eq(VehicleUse::getSource, VehicleConstants.SOURCE_BACKFILL)
                            .or().exists(TRIP_UNCHECKED_SQL));
            case VehicleConstants.GROUP_ALL -> wrapper.in(VehicleUse::getStatus, VehicleConstants.PROCESSING_STATUSES);
            default -> throw new BusinessException("未知的待辦分組");
        }
    }

    private void applyCommonFilters(LambdaQueryWrapper<VehicleUse> wrapper, VehicleUseDto.Query query) {
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(VehicleUse::getUseNo, kw)
                    .or().like(VehicleUse::getPurpose, kw)
                    .or().like(VehicleUse::getFinalPlateNo, kw));
        }
        if (StringUtils.hasText(query.getSource())) {
            wrapper.eq(VehicleUse::getSource, query.getSource());
        }
        if (query.getVehicleId() != null) {
            wrapper.eq(VehicleUse::getFinalVehicleId, query.getVehicleId());
        }
        if (StringUtils.hasText(query.getPlateNo())) {
            wrapper.eq(VehicleUse::getFinalPlateNo, query.getPlateNo().trim());
        }
        if (query.getDepartmentId() != null) {
            wrapper.eq(VehicleUse::getDepartmentId, query.getDepartmentId());
        }
    }

    /* ==================== 工具 ==================== */

    private static BigDecimal hoursBetween(LocalDateTime from, LocalDateTime to) {
        if (from == null || to == null || !to.isAfter(from)) {
            return null;
        }
        return BigDecimal.valueOf(Duration.between(from, to).toMinutes())
                .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    private static List<String> splitFlags(String flags) {
        if (!StringUtils.hasText(flags)) {
            return List.of();
        }
        return List.of(flags.split(","));
    }

    private static String joinFlags(Set<String> flags) {
        return flags.isEmpty() ? null : String.join(",", flags);
    }

    private static String camel(String column) {
        String[] parts = column.split("_");
        if (parts.length == 1) {
            return parts[0];
        }
        StringBuilder sb = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            sb.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
        }
        return sb.toString();
    }

    private static int nvl(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private static long toLong(Object value) {
        return value instanceof Number n ? n.longValue() : 0L;
    }

    private static BigDecimal toDecimal(Object value) {
        if (value instanceof BigDecimal b) {
            return b;
        }
        return value instanceof Number n ? BigDecimal.valueOf(n.doubleValue()).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
    }

    private static VehicleUseDto.LedgerStats emptyStats() {
        VehicleUseDto.LedgerStats stats = new VehicleUseDto.LedgerStats();
        stats.setTotalMileage(BigDecimal.ZERO);
        stats.setTotalHours(BigDecimal.ZERO);
        return stats;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static long normalizePage(Integer page) {
        return page == null || page < 1 ? 1L : page;
    }

    private static long normalizeSize(Integer size) {
        return size == null || size < 1 ? 10L : Math.min(size, MAX_PAGE_SIZE);
    }

    private static String toJson(Object value) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value);
        } catch (Exception e) {
            // 审计载荷序列化失败不能阻断业务写入，但必须留下线索
            log.warn("审计事件载荷序列化失败: {}", e.getMessage());
            return String.valueOf(value);
        }
    }
}
