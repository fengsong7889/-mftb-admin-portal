package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VehicleDto;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.Vehicle;
import com.mftb.admin.entity.VehicleDriverQualification;
import com.mftb.admin.entity.VehicleManager;
import com.mftb.admin.entity.VehicleUse;
import com.mftb.admin.entity.VehicleUseDepartment;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.mapper.VehicleDriverQualificationMapper;
import com.mftb.admin.mapper.VehicleManagerMapper;
import com.mftb.admin.mapper.VehicleMapper;
import com.mftb.admin.mapper.VehicleUseDepartmentMapper;
import com.mftb.admin.mapper.VehicleTripMapper;
import com.mftb.admin.mapper.VehicleUseMapper;
import com.mftb.admin.service.VehicleService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** 车辆档案与授权服务实现 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VehicleServiceImpl implements VehicleService {

    /** 允许的运行状态取值（与 DB CHECK 一致，但先在这里给出友好错误而不是等驱动报 3819） */
    private static final Set<String> VEHICLE_STATUSES = Set.of(
            VehicleConstants.VEHICLE_NORMAL, VehicleConstants.VEHICLE_REPAIRING,
            VehicleConstants.VEHICLE_SUSPENDED, VehicleConstants.VEHICLE_RETIRED);

    private final VehicleMapper vehicleMapper;
    private final VehicleUseMapper useMapper;
    private final VehicleTripMapper tripMapper;
    private final VehicleManagerMapper managerMapper;
    private final VehicleUseDepartmentMapper deptMapper;
    private final VehicleDriverQualificationMapper qualificationMapper;
    private final SysDepartmentMapper departmentMapper;
    private final SysUserMapper userMapper;
    private final com.mftb.admin.mapper.SysPurchaseCompanyMapper purchaseCompanyMapper;
    private final VehicleAccessGuard guard;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<VehicleDto.VO> page(VehicleDto.Query query) {
        SysUser current = guard.currentUser();
        LambdaQueryWrapper<Vehicle> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(Vehicle::getPlateNo, kw)
                    .or().like(Vehicle::getVehicleCode, kw)
                    .or().like(Vehicle::getVin, kw));
        }
        if (StringUtils.hasText(query.getVehicleType())) {
            wrapper.eq(Vehicle::getVehicleType, query.getVehicleType().trim());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(Vehicle::getStatus, query.getStatus());
        }
        if (query.getManageDeptId() != null) {
            wrapper.eq(Vehicle::getManageDeptId, query.getManageDeptId());
        }
        if (query.getOwnerCompanyId() != null) {
            wrapper.eq(Vehicle::getOwnerCompanyId, query.getOwnerCompanyId());
        }
        if (query.getCompanyBrand() != null) {
            wrapper.eq(Vehicle::getCompanyBrand, query.getCompanyBrand());
        }
        // 可见范围：超管全量；其他人只能看到"自己可办理"或"自己所在部门可用"的车
        List<Long> scope = guard.manageableVehicleIds(current);
        if (scope != null) {
            List<Long> deptVehicles = query.getUsableByDeptId() != null
                    ? deptMapper.listVehicleIdsByDept(query.getUsableByDeptId())
                    : List.of();
            List<Long> visible = new ArrayList<>(scope);
            visible.addAll(deptVehicles);
            if (visible.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(Vehicle::getId, visible.stream().distinct().toList());
        } else if (query.getUsableByDeptId() != null) {
            List<Long> deptVehicles = deptMapper.listVehicleIdsByDept(query.getUsableByDeptId());
            if (deptVehicles.isEmpty()) {
                return new PageResult<>(List.of(), 0L);
            }
            wrapper.in(Vehicle::getId, deptVehicles);
        }
        wrapper.orderByDesc(Vehicle::getUpdatedAt);

        Page<Vehicle> page = new Page<>(normalizePage(query.getPage()), normalizeSize(query.getSize()));
        Page<Vehicle> result = vehicleMapper.selectPage(page, wrapper);
        List<VehicleDto.VO> records = result.getRecords().stream().map(this::toVO)
                .collect(java.util.stream.Collectors.toList());
        attachGrants(records);
        return new PageResult<>(records, result.getTotal());
    }

    /**
     * 为列表 VO 批量装填部门授权与管理人员。
     *
     * <p>之前只有详情装、列表不装，导致两个真实后果：
     * ・「授权直接登记」表单拿不到可选部门，提交按钮永久置灰；
     * ・前端对非超管读 {@code vehicle.managers} 时拿到 undefined 而 TypeError。
     * 两项授权都一次 IN 取回，不在循环里逐车查。
     */
    private void attachGrants(List<VehicleDto.VO> records) {
        if (records.isEmpty()) {
            return;
        }
        List<Long> ids = records.stream().map(VehicleDto.VO::getId).toList();
        Map<Long, List<VehicleUseDepartment>> deptRows = deptMapper.listByVehicles(ids).stream()
                .collect(java.util.stream.Collectors.groupingBy(VehicleUseDepartment::getVehicleId));
        Map<Long, List<VehicleManager>> managerRows = managerMapper.listByVehicles(ids).stream()
                .collect(java.util.stream.Collectors.groupingBy(VehicleManager::getVehicleId));
        for (VehicleDto.VO vo : records) {
            vo.setAllowedDepts(deptRows.getOrDefault(vo.getId(), List.of()).stream()
                    .map(d -> grantOf(d.getDeptId(), d.getDeptName())).toList());
            vo.setManagers(managerRows.getOrDefault(vo.getId(), List.of()).stream().map(m -> {
                VehicleDto.ManagerGrant g = new VehicleDto.ManagerGrant();
                g.setUserId(m.getUserId());
                g.setEmpNo(m.getEmpNo());
                g.setEmpName(m.getEmpName());
                g.setLevel(m.getLevel());
                return g;
            }).toList());
        }
    }

    @Override
    public VehicleDto.VO detail(long id) {
        guard.requireVehicleVisible(guard.currentUser(), id);
        Vehicle vehicle = guard.requireVehicle(id);
        VehicleDto.VO vo = toVO(vehicle);
        attachGrants(List.of(vo));
        // 建议起始里程：档案值与最近已确认行程取大，与出车校验同口径
        java.math.BigDecimal latest = tripMapper.latestConfirmedEnd(id);
        java.math.BigDecimal archived = vehicle.getCurrentOdometer();
        vo.setSuggestStartOdometer(latest == null ? archived
                : archived == null ? latest : latest.max(archived));
        return vo;
    }

    /* ==================== 写入 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long save(VehicleDto.Save dto) {
        SysUser current = guard.currentUser();
        validateSave(dto);
        // 并发重复登记同一车牌由表上唯一键（register_region + plate_no）兜住，
        // 不另设 requestKey：车辆档案是低频配置类写入，幂等价值不如一个真实约束。
        if (dto.getId() == null) {
            Vehicle vehicle = new Vehicle();
            applyEditableFields(vehicle, dto);
            vehicle.setVehicleCode(bizSeqService.next(BizSeqService.RULE_VEHICLE));
            vehicle.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : VehicleConstants.VEHICLE_NORMAL);
            vehicle.setVersion(0L);
            vehicle.setCreatedBy(operatorResolver.operatorSignature(current));
            vehicle.setUpdatedBy(operatorResolver.operatorSignature(current));
            try {
                vehicleMapper.insert(vehicle);
            } catch (org.springframework.dao.DuplicateKeyException e) {
                // 唯一键冲突是并发登记同一车牌，给业务提示而不是把 SQL 细节抛给前端
                throw new BusinessException("該登記地區下車牌「" + dto.getPlateNo() + "」已存在，請確認是否重複登記");
            }
            replaceGrants(vehicle.getId(), dto, current);
            log.info("车辆档案已创建: id={}, code={}, plate={}", vehicle.getId(), vehicle.getVehicleCode(), vehicle.getPlateNo());
            return vehicle.getId();
        }

        Vehicle vehicle = guard.requireVehicle(dto.getId());
        guard.requireManageVehicle(current, vehicle.getId(), "編輯車輛檔案");
        if (dto.getExpectVersion() != null && !dto.getExpectVersion().equals(vehicle.getVersion())) {
            throw new BusinessException("該車輛檔案已被他人修改，請刷新後重試");
        }
        applyEditableFields(vehicle, dto);
        vehicle.setVersion(vehicle.getVersion() == null ? 1L : vehicle.getVersion() + 1);
        vehicle.setUpdatedBy(operatorResolver.operatorSignature(current));
        // 必须显式赋值：MyBatis-Plus 的 strictUpdateFill 只在字段为 null 时才填，
        // 而这里是“从库里读出的实体”（updatedAt 已非空），不手写就会把旧时间原样写回，
        // 列表按 updatedAt 倒序也会以假乱真（端到端测试里就发现了这一条）
        vehicle.setUpdatedAt(LocalDateTime.now());
        vehicleMapper.updateById(vehicle);
        replaceGrants(vehicle.getId(), dto, current);
        log.info("车辆档案已更新: id={}, plate={}", vehicle.getId(), vehicle.getPlateNo());
        return vehicle.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeStatus(long id, VehicleDto.StatusChange dto) {
        SysUser current = guard.currentUser();
        Vehicle vehicle = guard.requireVehicle(id);
        guard.requireManageVehicle(current, id, "變更車輛運行狀態");
        String status = dto.getStatus();
        if (!VEHICLE_STATUSES.contains(status)) {
            throw new BusinessException("無效的運行狀態");
        }
        if (!StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("變更車輛運行狀態必須填寫原因");
        }
        // 停用/退出不得影响在途行程：那是"阻止新派出"，不是"抹掉正在发生的车"
        if (vehicleMapper.updateStatusVersioned(id, status,
                dto.getExpectVersion() == null ? vehicle.getVersion() : dto.getExpectVersion(),
                operatorResolver.operatorSignature(current)) == 0) {
            throw new BusinessException("該車輛狀態已被他人變更，請刷新後重試");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeDirectRegister(long id, VehicleDto.DirectRegisterToggle dto) {
        SysUser current = guard.currentUser();
        Vehicle vehicle = guard.requireVehicle(id);
        // 配置权与办理权分离：能办用车不等于能开"免审批"口子
        if (!guard.isAdmin(current)) {
            throw new BusinessException("授權直接登記開關僅系統管理員可調整");
        }
        if (!StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("調整直接登記開關必須填寫原因");
        }
        boolean enabled = Boolean.TRUE.equals(dto.getEnabled());
        Vehicle patch = new Vehicle();
        patch.setId(id);
        patch.setAllowDirectRegister(enabled ? 1 : 0);
        patch.setVersion((vehicle.getVersion() == null ? 0L : vehicle.getVersion()) + 1);
        patch.setUpdatedBy(operatorResolver.operatorSignature(current));
        vehicleMapper.updateById(patch);
        log.info("车辆直接登记开关已变更: id={}, enabled={}, reason={}", id, enabled, dto.getReason());
    }

    @Override
    public List<VehicleDto.Option> available(VehicleDto.AvailableQuery query) {
        SysUser current = guard.currentUser();
        if (query.getStart() == null || query.getEnd() == null) {
            throw new BusinessException("查詢可用車輛需提供起止時段");
        }
        if (!query.getEnd().isAfter(query.getStart())) {
            throw new BusinessException("結束時間必須晚於開始時間");
        }
        List<Vehicle> candidates = vehicleMapper.selectList(new LambdaQueryWrapper<Vehicle>()
                .ne(Vehicle::getStatus, VehicleConstants.VEHICLE_RETIRED)
                .orderByAsc(Vehicle::getPlateNo));
        List<Long> manageable = guard.manageableVehicleIds(current);
        List<VehicleDto.Option> options = new ArrayList<>();
        LocalDate day = query.getStart().toLocalDate();
        for (Vehicle vehicle : candidates) {
            if (Boolean.TRUE.equals(query.getDirectOnly())
                    && !Objects.equals(vehicle.getAllowDirectRegister(), 1)) {
                continue;
            }
            // 申请场景按部门过滤；办理场景按"本人可办理"过滤
            boolean deptOk = query.getDepartmentId() == null
                    || guard.deptAllowed(vehicle.getId(), query.getDepartmentId());
            if (!deptOk) {
                continue;
            }
            if (manageable != null && !manageable.contains(vehicle.getId())) {
                continue;
            }
            VehicleDto.Option option = new VehicleDto.Option();
            option.setVehicleId(vehicle.getId());
            option.setVehicleCode(vehicle.getVehicleCode());
            option.setPlateNo(vehicle.getPlateNo());
            option.setVehicleType(vehicle.getVehicleType());
            option.setSeatCount(vehicle.getSeatCount());
            option.setCurrentOdometer(vehicle.getCurrentOdometer());
            option.setStatus(vehicle.getStatus());
            option.setRegisterRegion(vehicle.getRegisterRegion());
            option.setAllowDirectRegister(Objects.equals(vehicle.getAllowDirectRegister(), 1));
            List<String> blockers = new ArrayList<>(guard.vehicleBlockers(vehicle, day));
            addWindowConflict(blockers, vehicle.getId(), query);
            option.setBlockers(blockers);
            options.add(option);
        }
        // 可派的排前面，同序按车牌：避免"能选的车"沉在长列表底部
        options.sort((a, b) -> Boolean.compare(!a.getBlockers().isEmpty(), !b.getBlockers().isEmpty()));
        return options;
    }

    @Override
    public List<VehicleDto.QualificationVO> listQualifications() {
        return qualificationMapper.selectList(new LambdaQueryWrapper<VehicleDriverQualification>()
                        .orderByDesc(VehicleDriverQualification::getValidUntil))
                .stream().map(this::toQualVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long saveQualification(VehicleDto.QualificationSave dto) {
        SysUser current = guard.currentUser();
        if (dto.getUserId() == null) {
            throw new BusinessException("請選擇員工");
        }
        SysUser employee = userMapper.selectById(dto.getUserId());
        if (employee == null) {
            throw new BusinessException("未找到該員工記錄");
        }
        if (!StringUtils.hasText(dto.getRegion()) || !StringUtils.hasText(dto.getLicenseClass())
                || dto.getValidUntil() == null) {
            throw new BusinessException("適用地區、準駕範圍與有效期至均為必填");
        }
        if (dto.getValidUntil().isBefore(LocalDate.now())) {
            throw new BusinessException("駕駛資格有效期已過，請核實後再登記");
        }
        VehicleDriverQualification existing = qualificationMapper.findCurrent(dto.getUserId(), dto.getRegion());
        String signature = operatorResolver.operatorSignature(current);
        if (existing == null) {
            VehicleDriverQualification qual = new VehicleDriverQualification();
            qual.setUserId(employee.getId());
            qual.setEmpNo(employee.getEmpId());
            qual.setEmpName(employee.getName());
            qual.setRegion(dto.getRegion());
            qual.setLicenseClass(dto.getLicenseClass());
            qual.setValidUntil(dto.getValidUntil());
            qual.setResult(VehicleConstants.QUAL_VERIFIED);
            qual.setVerifiedBy(signature);
            qual.setVerifiedAt(LocalDateTime.now());
            qual.setRemark(dto.getRemark());
            qual.setCreatedBy(signature);
            qual.setUpdatedBy(signature);
            qualificationMapper.insert(qual);
            return qual.getId();
        }
        // 同人同地区只保留一条现行资格：重复登记视为换证/续期，覆盖有效期并留核验人
        existing.setLicenseClass(dto.getLicenseClass());
        existing.setValidUntil(dto.getValidUntil());
        existing.setResult(VehicleConstants.QUAL_VERIFIED);
        existing.setVerifiedBy(signature);
        existing.setVerifiedAt(LocalDateTime.now());
        existing.setRemark(dto.getRemark());
        existing.setUpdatedBy(signature);
        qualificationMapper.updateById(existing);
        return existing.getId();
    }

    /* ==================== 内部工具 ==================== */

    private void validateSave(VehicleDto.Save dto) {
        if (!StringUtils.hasText(dto.getPlateNo())) {
            throw new BusinessException("請輸入車牌號碼");
        }
        if (!StringUtils.hasText(dto.getRegisterRegion())) {
            throw new BusinessException("請選擇登記地區");
        }
        if (!StringUtils.hasText(dto.getVehicleType())) {
            throw new BusinessException("請選擇車型");
        }
        if (dto.getSeatCount() == null || dto.getSeatCount() <= 0 || dto.getSeatCount() > 60) {
            throw new BusinessException("核定載客人數需在 1~60 之間");
        }
        if (dto.getCurrentOdometer() == null || dto.getCurrentOdometer().signum() < 0) {
            throw new BusinessException("當前里程不可為負數");
        }
        if (dto.getManageDeptId() == null) {
            throw new BusinessException("請選擇管理部門");
        }
        if (StringUtils.hasText(dto.getStatus()) && !VEHICLE_STATUSES.contains(dto.getStatus())) {
            throw new BusinessException("無效的運行狀態");
        }
        if (dto.getInsuranceValidUntil() != null && dto.getInsuranceValidUntil().isBefore(LocalDate.now().minusYears(1))) {
            log.warn("车辆保险有效期早于一年前仍被登记: plate={}", dto.getPlateNo());
        }
    }

    private void applyEditableFields(Vehicle vehicle, VehicleDto.Save dto) {
        vehicle.setPlateNo(dto.getPlateNo().trim());
        vehicle.setRegisterRegion(dto.getRegisterRegion().trim());
        vehicle.setVehicleType(dto.getVehicleType().trim());
        vehicle.setVin(trimToNull(dto.getVin()));
        vehicle.setSeatCount(dto.getSeatCount());
        vehicle.setCurrentOdometer(dto.getCurrentOdometer());
        if (StringUtils.hasText(dto.getStatus())) {
            vehicle.setStatus(dto.getStatus());
        }
        vehicle.setAllowDirectRegister(Boolean.TRUE.equals(dto.getAllowDirectRegister()) ? 1 : 0);
        vehicle.setInsuranceValidUntil(dto.getInsuranceValidUntil());
        vehicle.setInspectionValidUntil(dto.getInspectionValidUntil());
        vehicle.setVerifyBy(operatorResolver.operatorSignature(guard.currentUser()));
        vehicle.setVerifyAt(LocalDateTime.now());
        vehicle.setOwnerCompanyId(dto.getOwnerCompanyId());
        vehicle.setOwnerCompanyName(purchaseCompanyName(dto.getOwnerCompanyId()));
        vehicle.setCompanyBrand(dto.getCompanyBrand() == null ? 1 : dto.getCompanyBrand());
        vehicle.setManageDeptId(dto.getManageDeptId());
        vehicle.setManageDeptName(deptName(dto.getManageDeptId()));
        vehicle.setEamAssetNo(trimToNull(dto.getEamAssetNo()));
        vehicle.setRemark(trimToNull(dto.getRemark()));
    }

    /** 授权关系整组覆盖：空集合即清空授权，避免"删不掉部门"的粘滞状态 */
    private void replaceGrants(long vehicleId, VehicleDto.Save dto, SysUser current) {
        String signature = operatorResolver.operatorSignature(current);
        deptMapper.purgeByVehicle(vehicleId);
        if (dto.getAllowedDeptIds() != null) {
            for (Long deptId : dto.getAllowedDeptIds().stream().filter(Objects::nonNull).distinct().toList()) {
                VehicleUseDepartment grant = new VehicleUseDepartment();
                grant.setVehicleId(vehicleId);
                grant.setDeptId(deptId);
                grant.setDeptName(deptName(deptId));
                grant.setCreatedBy(signature);
                deptMapper.insert(grant);
            }
        }
        managerMapper.purgeByVehicle(vehicleId);
        if (dto.getManagers() != null) {
            Map<Long, VehicleDto.ManagerGrant> distinct = new HashMap<>();
            for (VehicleDto.ManagerGrant g : dto.getManagers()) {
                if (g.getUserId() != null) {
                    distinct.putIfAbsent(g.getUserId(), g);
                }
            }
            distinct.forEach((userId, g) -> {
                SysUser employee = userMapper.selectById(userId);
                if (employee == null) {
                    return;
                }
                VehicleManager manager = new VehicleManager();
                manager.setVehicleId(vehicleId);
                manager.setUserId(userId);
                manager.setEmpNo(employee.getEmpId());
                manager.setEmpName(employee.getName());
                manager.setLevel("view".equals(g.getLevel()) ? "view" : "manage");
                manager.setCreatedBy(signature);
                managerMapper.insert(manager);
            });
        }
    }

    private void addWindowConflict(List<String> blockers, long vehicleId, VehicleDto.AvailableQuery query) {
        long conflicts = useMapper.selectCount(new LambdaQueryWrapper<VehicleUse>()
                .eq(VehicleUse::getFinalVehicleId, vehicleId)
                .in(VehicleUse::getStatus, VehicleConstants.OCCUPYING_STATUSES)
                .lt(VehicleUse::getPlannedStart, query.getEnd())
                .gt(VehicleUse::getPlannedEnd, query.getStart())
                .ne(query.getExcludeUseId() != null, VehicleUse::getId, query.getExcludeUseId()));
        if (conflicts > 0) {
            blockers.add("該時段已被 " + conflicts + " 張用車單占用");
        }
    }

    private VehicleDto.VO toVO(Vehicle vehicle) {
        VehicleDto.VO vo = new VehicleDto.VO();
        vo.setId(vehicle.getId());
        vo.setVehicleCode(vehicle.getVehicleCode());
        vo.setPlateNo(vehicle.getPlateNo());
        vo.setRegisterRegion(vehicle.getRegisterRegion());
        vo.setVehicleType(vehicle.getVehicleType());
        vo.setVin(vehicle.getVin());
        vo.setSeatCount(vehicle.getSeatCount());
        vo.setCurrentOdometer(vehicle.getCurrentOdometer());
        vo.setStatus(vehicle.getStatus());
        vo.setAllowDirectRegister(Objects.equals(vehicle.getAllowDirectRegister(), 1));
        vo.setInsuranceValidUntil(vehicle.getInsuranceValidUntil());
        vo.setInspectionValidUntil(vehicle.getInspectionValidUntil());
        vo.setDispatchBlockers(guard.vehicleBlockers(vehicle, LocalDate.now()));
        vo.setVerifyBy(vehicle.getVerifyBy());
        vo.setVerifyAt(DateTimeUtils.format(vehicle.getVerifyAt()));
        vo.setOwnerCompanyId(vehicle.getOwnerCompanyId());
        vo.setOwnerCompanyName(vehicle.getOwnerCompanyName());
        vo.setCompanyBrand(vehicle.getCompanyBrand());
        vo.setManageDeptId(vehicle.getManageDeptId());
        vo.setManageDeptName(vehicle.getManageDeptName());
        vo.setEamAssetId(vehicle.getEamAssetId());
        vo.setEamAssetNo(vehicle.getEamAssetNo());
        vo.setRemark(vehicle.getRemark());
        vo.setUpdatedBy(vehicle.getUpdatedBy());
        vo.setUpdatedAt(DateTimeUtils.format(vehicle.getUpdatedAt()));
        vo.setVersion(vehicle.getVersion());
        vo.setOccupiedCount(useMapper.selectCount(new LambdaQueryWrapper<VehicleUse>()
                .eq(VehicleUse::getFinalVehicleId, vehicle.getId())
                .in(VehicleUse::getStatus, VehicleConstants.OCCUPYING_STATUSES)));
        return vo;
    }

    private VehicleDto.QualificationVO toQualVO(VehicleDriverQualification qual) {
        VehicleDto.QualificationVO vo = new VehicleDto.QualificationVO();
        vo.setId(qual.getId());
        vo.setUserId(qual.getUserId());
        vo.setEmpNo(qual.getEmpNo());
        vo.setEmpName(qual.getEmpName());
        vo.setRegion(qual.getRegion());
        vo.setLicenseClass(qual.getLicenseClass());
        vo.setValidUntil(qual.getValidUntil());
        vo.setResult(qual.getResult());
        vo.setVerifiedBy(qual.getVerifiedBy());
        vo.setVerifiedAt(DateTimeUtils.format(qual.getVerifiedAt()));
        vo.setRemark(qual.getRemark());
        return vo;
    }

    private VehicleDto.DeptGrant grantOf(Long deptId, String deptName) {
        VehicleDto.DeptGrant grant = new VehicleDto.DeptGrant();
        grant.setDeptId(deptId);
        grant.setDeptName(deptName);
        return grant;
    }

    private String deptName(Long deptId) {
        if (deptId == null) {
            return "";
        }
        SysDepartment dept = departmentMapper.selectById(deptId);
        return dept == null ? "" : dept.getName();
    }

    /**
     * 法人主体名称快照。
     *
     * <p>存名称而不只存 ID：字典改名后历史列表不应集体“改口”，
     * 而档案本身需要稳定展示。业务真值（哪个法人）仍以 owner_company_id 为准。
     */
    private String purchaseCompanyName(Long companyId) {
        if (companyId == null) {
            return "";
        }
        com.mftb.admin.entity.SysPurchaseCompany company = purchaseCompanyMapper.selectById(companyId);
        if (company == null) {
            return "";
        }
        return StringUtils.hasText(company.getName()) ? company.getName() : company.getShortName();
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static long normalizePage(Integer page) {
        return page == null || page < 1 ? 1L : page;
    }

    private static long normalizeSize(Integer size) {
        // 上限 100：防止前端传 size=999999 变成全表扫描
        return size == null || size < 1 ? 10L : Math.min(size, 100L);
    }
}
