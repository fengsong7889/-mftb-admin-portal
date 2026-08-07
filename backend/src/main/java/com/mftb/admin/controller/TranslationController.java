package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.LanguageVO;
import com.mftb.admin.dto.TranslationCoverageVO;
import com.mftb.admin.dto.TranslationRequest;
import com.mftb.admin.dto.TranslationVO;
import com.mftb.admin.service.TranslationService;
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
import java.util.Map;

/**
 * 多语言翻译管理接口
 */
@RestController
@RequestMapping("/api/translations")
@RequiredArgsConstructor
public class TranslationController {

    private final TranslationService translationService;

    /* ========== 翻译字段 ========== */

    /** 字段列表（可按关键词/分类过滤） */
    @GetMapping
    @RequirePermission(menu = "translation-manage")
    public Result<List<TranslationVO>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category) {
        return Result.success(translationService.list(keyword, category));
    }

    /** 新增字段 */
    @PostMapping
    @RequirePermission(menu = "translation-manage", action = "create")
    public Result<TranslationVO> create(@RequestBody TranslationRequest request) {
        return Result.success("字段已添加", translationService.create(request));
    }

    /** 编辑字段 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "translation-manage", action = "edit")
    public Result<TranslationVO> update(@PathVariable Long id, @RequestBody TranslationRequest request) {
        return Result.success("已保存", translationService.update(id, request));
    }

    /** 删除字段 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "translation-manage", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        translationService.delete(id);
        return Result.success("已删除", null);
    }

    /** 语言包：{fieldKey: 译文} 平铺映射（已应用回退链），前端注入 i18next 用 */
    @GetMapping("/bundle")
    public Result<Map<String, String>> bundle(@RequestParam String lang) {
        return Result.success(translationService.bundle(lang));
    }

    /** 语言翻译完成率统计（供顶部语言切换校验） */
    @GetMapping("/coverage")
    public Result<TranslationCoverageVO> coverage(@RequestParam String lang) {
        return Result.success(translationService.coverage(lang));
    }

    /* ========== 已注册语言 ========== */

    /** 语言列表 */
    @GetMapping("/languages")
    public Result<List<LanguageVO>> listLanguages() {
        return Result.success(translationService.listLanguages());
    }

    /** 注册新语言 */
    @PostMapping("/languages")
    @RequirePermission(menu = "translation-manage", action = "create")
    public Result<LanguageVO> createLanguage(@RequestBody LanguageVO request) {
        return Result.success("语言已添加", translationService.createLanguage(request));
    }

    /** 删除语言 */
    @DeleteMapping("/languages/{code}")
    @RequirePermission(menu = "translation-manage", action = "delete")
    public Result<Void> deleteLanguage(@PathVariable String code) {
        translationService.deleteLanguage(code);
        return Result.success("语言已移除", null);
    }
}
