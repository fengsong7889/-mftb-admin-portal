package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.VehicleMasterDto;
import com.mftb.admin.service.VehicleMasterService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
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
 * 车辆参数库接口（基础数据 → 車輛參數庫）。
 *
 * <p>权限按菜单 vehicle-master-data 裁决，动作只有 view/create/edit 三种；
 * 删除归到 edit——不为"删除"再造一个后端不会用到的动作名。
 * <p>级联查询（车辆档案选品牌→车系→年款）也走本接口，读权限统一用 view：
 * 能看车辆档案的人必然要能看懂它引用的是哪台车。
 */
@RestController
@RequestMapping("/api/vehicle/masters")
@RequiredArgsConstructor
public class VehicleMasterController {

    private final VehicleMasterService vehicleMasterService;

    /* ==================== 品牌 ==================== */

    @GetMapping("/brands")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_VIEW,
            anyOf = {VehicleConstants.MENU_MASTER, VehicleConstants.MENU_FILES})
    public Result<List<VehicleMasterDto.BrandVO>> listBrands(
            @RequestParam(defaultValue = "0") int includeDisabled) {
        return Result.success(vehicleMasterService.listBrands(includeDisabled == 1));
    }

    @PostMapping("/brands")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> createBrand(@RequestBody VehicleMasterDto.BrandSave save) {
        return Result.success(vehicleMasterService.saveBrand(save));
    }

    @PutMapping("/brands/{id}")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_EDIT)
    public Result<Long> updateBrand(@PathVariable long id, @RequestBody VehicleMasterDto.BrandSave save) {
        save.setId(id);
        return Result.success(vehicleMasterService.saveBrand(save));
    }

    @DeleteMapping("/brands/{id}")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> deleteBrand(@PathVariable long id) {
        vehicleMasterService.deleteBrand(id);
        return Result.success();
    }

    /* ==================== 车系 ==================== */

    @GetMapping("/series")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_VIEW,
            anyOf = {VehicleConstants.MENU_MASTER, VehicleConstants.MENU_FILES})
    public Result<List<VehicleMasterDto.SeriesVO>> listSeries(
            @RequestParam(required = false) Long brandId,
            @RequestParam(defaultValue = "0") int includeDisabled) {
        return Result.success(vehicleMasterService.listSeries(brandId, includeDisabled == 1));
    }

    @PostMapping("/series")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> createSeries(@RequestBody VehicleMasterDto.SeriesSave save) {
        return Result.success(vehicleMasterService.saveSeries(save));
    }

    @PutMapping("/series/{id}")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_EDIT)
    public Result<Long> updateSeries(@PathVariable long id, @RequestBody VehicleMasterDto.SeriesSave save) {
        save.setId(id);
        return Result.success(vehicleMasterService.saveSeries(save));
    }

    @DeleteMapping("/series/{id}")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> deleteSeries(@PathVariable long id) {
        vehicleMasterService.deleteSeries(id);
        return Result.success();
    }

    /* ==================== 年款车型 ==================== */

    @GetMapping("/models")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_VIEW,
            anyOf = {VehicleConstants.MENU_MASTER, VehicleConstants.MENU_FILES})
    public Result<List<VehicleMasterDto.ModelVO>> listModels(
            @RequestParam(required = false) Long seriesId,
            @RequestParam(defaultValue = "0") int includeDisabled) {
        return Result.success(vehicleMasterService.listModels(seriesId, includeDisabled == 1));
    }

    @PostMapping("/models")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> createModel(@RequestBody VehicleMasterDto.ModelSave save) {
        return Result.success(vehicleMasterService.saveModel(save));
    }

    @PutMapping("/models/{id}")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_EDIT)
    public Result<Long> updateModel(@PathVariable long id, @RequestBody VehicleMasterDto.ModelSave save) {
        save.setId(id);
        return Result.success(vehicleMasterService.saveModel(save));
    }

    @DeleteMapping("/models/{id}")
    @RequirePermission(menu = VehicleConstants.MENU_MASTER, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> deleteModel(@PathVariable long id) {
        vehicleMasterService.deleteModel(id);
        return Result.success();
    }
}
