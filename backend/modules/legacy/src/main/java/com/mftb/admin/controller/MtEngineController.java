package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MtEngineRequest;
import com.mftb.admin.dto.MtEngineVO;
import com.mftb.admin.service.MtEngineService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 机翻引擎配置 REST 控制器
 */
@RestController
@RequestMapping("/api/mt-engines")
@RequiredArgsConstructor
public class MtEngineController {

    private final MtEngineService mtEngineService;

    /** 引擎列表 */
    @GetMapping
    @RequirePermission(menu = "i18n-mt-engine")
    public Result<List<MtEngineVO>> list() {
        return Result.success(mtEngineService.list());
    }

    /** 更新引擎配置 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "i18n-mt-engine", action = "edit")
    public Result<MtEngineVO> update(@PathVariable Long id, @RequestBody MtEngineRequest request) {
        return Result.success("已保存", mtEngineService.update(id, request));
    }

    /** 测试翻译 */
    @PostMapping("/{id}/test")
    @RequirePermission(menu = "i18n-mt-engine", action = "edit")
    public Result<Map<String, Object>> testTranslate(
            @PathVariable Long id,
            @RequestParam String text,
            @RequestParam(defaultValue = "en") String targetLang) {
        return Result.success(mtEngineService.testTranslate(id, text, targetLang));
    }

    /** 获取当前启用的引擎 */
    @GetMapping("/active")
    @RequirePermission(menu = "i18n-mt-engine")
    public Result<MtEngineVO> active() {
        return Result.success(mtEngineService.getActiveEngine());
    }
}
