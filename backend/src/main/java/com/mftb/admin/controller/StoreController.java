package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.OptionVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.StoreBdVO;
import com.mftb.admin.dto.StoreBindBdRequest;
import com.mftb.admin.dto.StoreQuery;
import com.mftb.admin.dto.StoreRequest;
import com.mftb.admin.dto.StoreVO;
import com.mftb.admin.service.StoreService;
import jakarta.validation.Valid;
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
 * 门店接口
 */
@RestController
@RequestMapping("/api/stores")
@RequiredArgsConstructor
public class StoreController {

    private final StoreService storeService;

    /** 分页查询门店（集团ID/名称、门店ID/名称、所属品牌、业务频道、最后更新人、最后更新时间、创建时间） */
    @GetMapping
    @RequirePermission(menu = "store-list")
    public Result<PageResult<StoreVO>> list(StoreQuery query) {
        return Result.success(storeService.list(query));
    }

    /** 按集团查询门店（下拉选项用） */
    @GetMapping("/by-group/{groupId}")
    public Result<List<StoreVO>> listByGroup(@PathVariable Long groupId) {
        return Result.success(storeService.listByGroupId(groupId));
    }

    /** 按集团编码+品牌查询门店下拉选项（充值扣款门店用） */
    @GetMapping("/by-group-code")
    public Result<List<OptionVO>> listByGroupCode(@RequestParam String groupCode,
                                                   @RequestParam(required = false) String brand) {
        return Result.success(storeService.listByGroupCode(groupCode, brand));
    }

    /** 门店ID/名称搜索下拉选项 */
    @GetMapping("/options")
    public Result<List<OptionVO>> options(@RequestParam(required = false) String keyword) {
        return Result.success(storeService.searchOptions(keyword));
    }

    /** 门店最后更新人搜索下拉选项 */
    @GetMapping("/updated-by-options")
    public Result<List<OptionVO>> updatedByOptions(@RequestParam(required = false) String keyword) {
        return Result.success(storeService.searchUpdatedByOptions(keyword));
    }

    /** 按集团ID（group_code）查询集团下门店已绑定的BD选项（推广金充值归属BD用） */
    @GetMapping("/bd-options")
    public Result<List<OptionVO>> bdOptions(@RequestParam String groupCode) {
        return Result.success(storeService.listBdOptionsByGroupCode(groupCode));
    }

    /** 新增门店 */
    @PostMapping
    @RequirePermission(menu = "store-list", action = "create")
    public Result<StoreVO> create(@Valid @RequestBody StoreRequest request) {
        return Result.success("门店创建成功", storeService.create(request));
    }

    /** 编辑门店 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "store-list", action = "edit")
    public Result<StoreVO> update(@PathVariable Long id, @Valid @RequestBody StoreRequest request) {
        return Result.success("门店信息已更新", storeService.update(id, request));
    }

    /** 查询门店已绑定的BD列表（含部门/职位/职级） */
    @GetMapping("/{id}/bds")
    @RequirePermission(menu = "store-list")
    public Result<List<StoreBdVO>> listBds(@PathVariable Long id) {
        return Result.success(storeService.listBds(id));
    }

    /** 新增绑定BD */
    @PostMapping("/{id}/bds")
    @RequirePermission(menu = "store-list", action = "edit")
    public Result<StoreBdVO> addBd(@PathVariable Long id, @RequestBody StoreBindBdRequest request) {
        return Result.success("BD绑定成功", storeService.addBd(id, request.getBdEmpId()));
    }

    /** 解除绑定BD */
    @DeleteMapping("/{id}/bds/{bindId}")
    @RequirePermission(menu = "store-list", action = "edit")
    public Result<Void> removeBd(@PathVariable Long id, @PathVariable Long bindId) {
        storeService.removeBd(id, bindId);
        return Result.success("BD已解绑", null);
    }

    /** 删除门店 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "store-list", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        storeService.delete(id);
        return Result.success("门店已删除", null);
    }
}
