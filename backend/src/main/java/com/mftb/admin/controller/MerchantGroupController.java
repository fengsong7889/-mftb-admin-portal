package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MerchantGroupQuery;
import com.mftb.admin.dto.MerchantGroupRequest;
import com.mftb.admin.dto.MerchantGroupVO;
import com.mftb.admin.dto.OptionVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.MerchantGroupService;
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
 * 商户集团接口
 */
@RestController
@RequestMapping("/api/merchant-groups")
@RequiredArgsConstructor
public class MerchantGroupController {

    private final MerchantGroupService merchantGroupService;

    /** 分页查询集团（集团ID/名称、最后更新人、最后更新时间、创建时间） */
    @GetMapping
    public Result<PageResult<MerchantGroupVO>> list(MerchantGroupQuery query) {
        return Result.success(merchantGroupService.list(query));
    }

    /** 查询全部集团（下拉选项用） */
    @GetMapping("/all")
    public Result<List<MerchantGroupVO>> listAll() {
        return Result.success(merchantGroupService.listAll());
    }

    /** 集团ID/名称搜索下拉选项 */
    @GetMapping("/options")
    public Result<List<OptionVO>> options(@RequestParam(required = false) String keyword) {
        return Result.success(merchantGroupService.searchOptions(keyword));
    }

    /** 集团最后更新人搜索下拉选项 */
    @GetMapping("/updated-by-options")
    public Result<List<OptionVO>> updatedByOptions(@RequestParam(required = false) String keyword) {
        return Result.success(merchantGroupService.searchUpdatedByOptions(keyword));
    }

    /** 新增集团 */
    @PostMapping
    public Result<MerchantGroupVO> create(@Valid @RequestBody MerchantGroupRequest request) {
        return Result.success("集团创建成功", merchantGroupService.create(request));
    }

    /** 编辑集团 */
    @PutMapping("/{id}")
    public Result<MerchantGroupVO> update(@PathVariable Long id, @Valid @RequestBody MerchantGroupRequest request) {
        return Result.success("集团信息已更新", merchantGroupService.update(id, request));
    }

    /** 删除集团(存在关联门店时禁止删除) */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        merchantGroupService.delete(id);
        return Result.success("集团已删除", null);
    }
}
