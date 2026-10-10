package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VehicleDto;
import com.mftb.admin.service.VehicleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 车辆档案与授权接口
 *
 * <p>权限分层说明：菜单动作（@RequirePermission）与车辆资源范围（Service 内按
 * 「车辆×管理人员」判定）是两层不同控制，缺一不可。拥有本菜单不代表能改任意车辆。
 */
@RestController
@RequestMapping("/api/vehicle/vehicles")
@RequiredArgsConstructor
public class VehicleController {

    private static final String MENU = VehicleConstants.MENU_FILES;

    private final VehicleService vehicleService;

    /** 车辆档案分页 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<VehicleDto.VO>> page(@org.springframework.web.bind.annotation.ModelAttribute VehicleDto.Query query) {
        return Result.success(vehicleService.page(query));
    }

    /** 车辆详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<VehicleDto.VO> detail(@PathVariable long id) {
        return Result.success(vehicleService.detail(id));
    }

    /** 新增车辆档案 */
    @PostMapping
    @RequirePermission(menu = MENU, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> create(@RequestBody VehicleDto.Save dto) {
        dto.setId(null);
        return Result.success("車輛檔案已創建", vehicleService.save(dto));
    }

    /** 编辑车辆档案 */
    @PutMapping("/{id}")
    @RequirePermission(menu = MENU, action = VehicleConstants.ACTION_EDIT)
    public Result<Long> update(@PathVariable long id, @RequestBody VehicleDto.Save dto) {
        dto.setId(id);
        return Result.success("車輛檔案已保存", vehicleService.save(dto));
    }

    /** 变更运行状态（列表 Switch，前端已二次确认，服务端仍重验） */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = MENU, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> changeStatus(@PathVariable long id, @RequestBody VehicleDto.StatusChange dto) {
        vehicleService.changeStatus(id, dto);
        return Result.success("運行狀態已更新", null);
    }

    /** 变更「允许授权直接登记」开关：配置动作，独立于办理权限 */
    @PutMapping("/{id}/direct-register")
    @RequirePermission(menu = MENU, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> changeDirectRegister(@PathVariable long id, @RequestBody VehicleDto.DirectRegisterToggle dto) {
        vehicleService.changeDirectRegister(id, dto);
        return Result.success("直接登記開關已更新", null);
    }

    /**
     * 可用车辆候选。
     *
     * <p>anyOf 让办理页与申请页共用同一只读接口：申请场景只需 my-vehicle-use 权限，
     * 不应被迫持有车管菜单；但返回范围仍由服务层按部门/管理范围收敛。
     */
    @GetMapping("/available")
    @RequirePermission(menu = MENU, action = VehicleConstants.ACTION_VIEW,
            anyOf = {VehicleConstants.MENU_DISPATCH, VehicleConstants.MENU_LEDGER, VehicleConstants.MENU_MY_USE})
    public Result<List<VehicleDto.Option>> available(VehicleDto.AvailableQuery query) {
        return Result.success(vehicleService.available(query));
    }

    /** 驾驶资格列表 */
    @GetMapping("/qualifications")
    @RequirePermission(menu = MENU)
    public Result<List<VehicleDto.QualificationVO>> qualifications() {
        return Result.success(vehicleService.listQualifications());
    }

    /**
     * 可安排驾驶人候选。
     *
     * <p>驾驶资格属于车辆管理配置，办理页与申请页都需要读，因此与 available 同样放开只读备选菜单。
     */
    @GetMapping("/eligible-drivers")
    @RequirePermission(menu = MENU, action = VehicleConstants.ACTION_VIEW,
            anyOf = {VehicleConstants.MENU_DISPATCH, VehicleConstants.MENU_MY_USE})
    public Result<List<VehicleDto.QualificationVO>> eligibleDrivers() {
        return Result.success(vehicleService.listQualifications().stream()
                .filter(q -> VehicleConstants.QUAL_VERIFIED.equals(q.getResult())).toList());
    }

    /** 新增/续期驾驶资格核验记录 */
    @PostMapping("/qualifications")
    @RequirePermission(menu = MENU, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> saveQualification(@RequestBody VehicleDto.QualificationSave dto) {
        return Result.success("駕駛資格核驗記錄已保存", vehicleService.saveQualification(dto));
    }

    /** 部门可用车辆反查（供申请页按部门筛选；登录即可，服务层按本人部门收敛范围） */
    @GetMapping("/by-department")
    @RequirePermission(menu = VehicleConstants.MENU_MY_USE)
    public Result<List<VehicleDto.Option>> byDepartment(@RequestParam long departmentId,
                                                         @RequestParam String start,
                                                         @RequestParam String end) {
        VehicleDto.AvailableQuery query = new VehicleDto.AvailableQuery();
        query.setDepartmentId(departmentId);
        query.setStart(java.time.LocalDateTime.parse(start));
        query.setEnd(java.time.LocalDateTime.parse(end));
        return Result.success(vehicleService.available(query));
    }
}
