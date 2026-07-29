package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.OptionVO;
import com.mftb.admin.dto.PageResult;
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
    public Result<PageResult<StoreVO>> list(StoreQuery query) {
        return Result.success(storeService.list(query));
    }

    /** 按集团查询门店（下拉选项用） */
    @GetMapping("/by-group/{groupId}")
    public Result<List<StoreVO>> listByGroup(@PathVariable Long groupId) {
        return Result.success(storeService.listByGroupId(groupId));
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

    /** 新增门店 */
    @PostMapping
    public Result<StoreVO> create(@Valid @RequestBody StoreRequest request) {
        return Result.success("门店创建成功", storeService.create(request));
    }

    /** 编辑门店 */
    @PutMapping("/{id}")
    public Result<StoreVO> update(@PathVariable Long id, @Valid @RequestBody StoreRequest request) {
        return Result.success("门店信息已更新", storeService.update(id, request));
    }

    /** 删除门店 */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        storeService.delete(id);
        return Result.success("门店已删除", null);
    }
}
