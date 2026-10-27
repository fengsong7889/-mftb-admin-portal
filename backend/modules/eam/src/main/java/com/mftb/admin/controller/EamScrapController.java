package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamScrapQuery;
import com.mftb.admin.dto.EamScrapSaveDTO;
import com.mftb.admin.dto.EamScrapVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.EamScrapService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 资产报废管理接口
 * <p>
 * 管理端点（列表/详情/创建/删除）需 asset-scrap 权限。
 */
@RestController
@RequestMapping("/api/eam/scraps")
@RequiredArgsConstructor
public class EamScrapController {

    private static final String MENU = "asset-scrap";
    private final EamScrapService scrapService;

    /** 报废记录分页列表 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamScrapVO>> page(@ModelAttribute EamScrapQuery query) {
        return Result.success(scrapService.page(query));
    }

    /** 报废记录详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamScrapVO> detail(@PathVariable long id) {
        return Result.success(scrapService.detail(id));
    }

    /** 创建报废记录 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> create(@RequestBody EamScrapSaveDTO dto) {
        return Result.success(scrapService.create(dto));
    }

    /** 删除报废记录（同时恢复关联资产为闲置状态） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> delete(@PathVariable long id) {
        scrapService.delete(id);
        return Result.success();
    }
}
