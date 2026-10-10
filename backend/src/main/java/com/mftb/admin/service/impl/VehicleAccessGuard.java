package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.Vehicle;
import com.mftb.admin.entity.VehicleDriverQualification;
import com.mftb.admin.mapper.VehicleDriverQualificationMapper;
import com.mftb.admin.mapper.VehicleManagerMapper;
import com.mftb.admin.mapper.VehicleMapper;
import com.mftb.admin.mapper.VehicleUseDepartmentMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 用车域访问与可派性守卫（两个 Service 共用的唯一判定入口）
 *
 * <p>把"谁能看/能办"和"这辆车现在能不能派"收在一个组件里，是因为这两类判定各有两个
 * 容易出错的方向：
 * <ul>
 *   <li>菜单权限 ≠ 数据范围。持有 vehicle-dispatch 菜单只说明能进办理页，不代表能办所有车；</li>
 *   <li>车辆档案存在 ≠ 车辆可派。维修/停用/证件缺失都必须阻断新出车，但不能阻止已发生的归还。</li>
 * </ul>
 * 两处判定分散实现时，最容易出现的事故是"某个新加的接口忘了带范围过滤"，
 * 集中在一处后，审计只需检查这一个类。
 */
@Component
@RequiredArgsConstructor
public class VehicleAccessGuard {

    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final VehicleMapper vehicleMapper;
    private final VehicleManagerMapper managerMapper;
    private final VehicleUseDepartmentMapper deptMapper;
    private final VehicleDriverQualificationMapper qualificationMapper;

    /** 当前登录人；未登录一律拒绝，不允许用 null 继续往下走 */
    public SysUser currentUser() {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        return user;
    }

    public boolean isAdmin(SysUser user) {
        return operatorResolver.isAdmin(user);
    }

    /* ==================== 资源范围 ==================== */

    /**
     * 本人可办理的车辆 ID。
     *
     * @return null 表示超管不限制；空列表表示一台都不能办理（不是"全部"，调用方必须区分）
     */
    public List<Long> manageableVehicleIds(SysUser user) {
        if (isAdmin(user)) {
            return null;
        }
        return managerMapper.listManageableVehicleIds(user.getId());
    }

    /** 是否可办理该车辆（授权直接登记、安排、出还车确认都要求 manage 级） */
    public boolean canManageVehicle(SysUser user, long vehicleId) {
        if (isAdmin(user)) {
            return true;
        }
        return managerMapper.countManageGrant(vehicleId, user.getId()) > 0;
    }

    /** 办理类动作的硬前置：不满足直接抛业务异常，而不是返回 false 让调用方忘记判断 */
    public void requireManageVehicle(SysUser user, long vehicleId, String action) {
        if (!canManageVehicle(user, vehicleId)) {
            throw new BusinessException("您不是該車輛的授權管理人員，無法" + action);
        }
    }

    /** 车辆可见性（查阅类）：超管全量，其他仅授权范围内 */
    public void requireVehicleVisible(SysUser user, long vehicleId) {
        List<Long> scope = manageableVehicleIds(user);
        if (scope == null) {
            return;
        }
        if (!scope.contains(vehicleId)) {
            throw new BusinessException("无权查看该车辆");
        }
    }

    /** 申请场景：只校验部门是否在显式授权范围内，不要求办理权限 */
    public boolean deptAllowed(long vehicleId, Long departmentId) {
        if (departmentId == null) {
            return false;
        }
        return deptMapper.listDeptIds(vehicleId).contains(departmentId);
    }

    /* ==================== 可派性 ==================== */

    /**
     * 车辆能否被派出：运行状态 + 保险/检验有效性。
     *
     * <p>有效期缺失按"不可派"处理而不是"跳过检查"：默认放行会让没录证件的车直接被派出去，
     * 而漏录恰恰是最常见的初始状态。
     */
    public List<String> vehicleBlockers(Vehicle vehicle, LocalDate at) {
        List<String> blockers = new ArrayList<>();
        if (vehicle == null) {
            blockers.add("未找到车辆档案");
            return blockers;
        }
        switch (vehicle.getStatus() == null ? "" : vehicle.getStatus()) {
            case VehicleConstants.VEHICLE_REPAIRING ->
                    blockers.add("車輛 " + vehicle.getPlateNo() + " 正在維修，不可派出");
            case VehicleConstants.VEHICLE_SUSPENDED ->
                    blockers.add("車輛 " + vehicle.getPlateNo() + " 已停用，不可派出");
            case VehicleConstants.VEHICLE_RETIRED ->
                    blockers.add("車輛 " + vehicle.getPlateNo() + " 已退出使用，不可派出");
            default -> {
            }
        }
        LocalDate day = at == null ? LocalDate.now() : at;
        if (vehicle.getInsuranceValidUntil() == null) {
            blockers.add("車輛 " + vehicle.getPlateNo() + " 保險有效期未錄入，需先完成核驗");
        } else if (vehicle.getInsuranceValidUntil().isBefore(day)) {
            blockers.add("車輛 " + vehicle.getPlateNo() + " 保險已過期（" + vehicle.getInsuranceValidUntil() + "）");
        }
        if (vehicle.getInspectionValidUntil() == null) {
            blockers.add("車輛 " + vehicle.getPlateNo() + " 檢驗有效期未錄入，需先完成核驗");
        } else if (vehicle.getInspectionValidUntil().isBefore(day)) {
            blockers.add("車輛 " + vehicle.getPlateNo() + " 年檢已過期（" + vehicle.getInspectionValidUntil() + "）");
        }
        return blockers;
    }

    /**
     * 驾驶资格判定：必须带驾照适用地区。
     *
     * <p>只按员工查会让"有驾照"变成"哪儿都能开"：内地驾照不能开澳门市区车，反之亦然。
     */
    public List<String> qualificationBlockers(Long userId, String region, LocalDate at) {
        List<String> blockers = new ArrayList<>();
        if (userId == null) {
            blockers.add("未指定實際駕駛人");
            return blockers;
        }
        VehicleDriverQualification qual = qualificationMapper.findCurrent(userId, region == null ? "" : region);
        if (qual == null) {
            blockers.add("該駕駛人無 " + region + " 地區的駕駛資格核驗記錄，不可安排出車");
            return blockers;
        }
        LocalDate day = at == null ? LocalDate.now() : at;
        switch (qual.getResult() == null ? "" : qual.getResult()) {
            case VehicleConstants.QUAL_PENDING -> blockers.add(qual.getEmpName() + " 的駕駛資格尚未核驗，不可安排出車");
            case VehicleConstants.QUAL_EXPIRED -> blockers.add(qual.getEmpName() + " 的駕駛資格已失效");
            default -> {
                if (qual.getValidUntil() == null || qual.getValidUntil().isBefore(day)) {
                    blockers.add(qual.getEmpName() + " 的駕駛資格已過有效期（" + qual.getValidUntil() + "）");
                }
            }
        }
        return blockers;
    }

    /** 人数校验：核定载客含驾驶人 */
    public void checkPassenger(int passengerCount, Integer seatCount) {
        if (passengerCount <= 0) {
            throw new BusinessException("用車人數必須大於 0");
        }
        if (seatCount != null && passengerCount > seatCount) {
            throw new BusinessException("人數 " + passengerCount + " 超過核定載客 " + seatCount + " 人（含駕駛人）");
        }
    }

    /* ==================== 菜单动作 ==================== */

    /** 资源级判定通过后再过菜单动作这一层；两者是不同维度，缺一不可 */
    public void requireMenuAction(String menu, String action) {
        SysUser user = currentUser();
        if (!permissionService.hasPermission(user, menu, action)) {
            throw new BusinessException("您没有权限执行此操作，请联系管理员授权");
        }
    }

    /** 车辆当前档案（不存在即拒绝，不返回 null 让调用方自己判空） */
    public Vehicle requireVehicle(Long vehicleId) {
        if (vehicleId == null) {
            throw new BusinessException("未選擇車輛");
        }
        Vehicle vehicle = vehicleMapper.selectOne(new LambdaQueryWrapper<Vehicle>()
                .eq(Vehicle::getId, vehicleId));
        if (vehicle == null) {
            throw new BusinessException("車輛不存在或已刪除");
        }
        return vehicle;
    }
}
