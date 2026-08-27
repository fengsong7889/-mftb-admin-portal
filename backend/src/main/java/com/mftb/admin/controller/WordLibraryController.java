package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.SegmentRequest;
import com.mftb.admin.dto.WordLibraryImportResult;
import com.mftb.admin.dto.WordLibraryRequest;
import com.mftb.admin.dto.WordLibraryVO;
import com.mftb.admin.service.SegmentationService;
import com.mftb.admin.service.WordLibraryService;
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
 * 推广词库管理接口
 */
@RestController
@RequestMapping("/api/word-library")
@RequiredArgsConstructor
public class WordLibraryController {

    private final WordLibraryService wordLibraryService;
    private final SegmentationService segmentationService;

    /** 词库列表（分页） */
    @GetMapping
    @RequirePermission(menu = "promotion-word-library")
    public Result<PageResult<WordLibraryVO>> listWords(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String remark,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return Result.success(wordLibraryService.listWords(page, size, keyword, channel, status, updatedBy, remark, startDate, endDate));
    }

    /** 新增词条 */
    @PostMapping
    @RequirePermission(menu = "promotion-word-library", action = "create")
    public Result<WordLibraryVO> createWord(@Valid @RequestBody WordLibraryRequest request) {
        return Result.success("新增成功", wordLibraryService.createWord(request));
    }

    /** 编辑词条 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "promotion-word-library", action = "edit")
    public Result<WordLibraryVO> updateWord(@PathVariable Long id, @Valid @RequestBody WordLibraryRequest request) {
        return Result.success("编辑成功", wordLibraryService.updateWord(id, request));
    }

    /** 切换状态（启用/停用） */
    @PutMapping("/{id}/toggle")
    @RequirePermission(menu = "promotion-word-library", action = "edit")
    public Result<Void> toggleStatus(@PathVariable Long id) {
        wordLibraryService.toggleStatus(id);
        return Result.success();
    }

    /** 删除词条 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "promotion-word-library", action = "delete")
    public Result<Void> deleteWord(@PathVariable Long id) {
        wordLibraryService.deleteWord(id);
        return Result.success();
    }

    /** 批量导入词条 */
    @PostMapping("/batch")
    @RequirePermission(menu = "promotion-word-library", action = "import")
    public Result<WordLibraryImportResult> batchImport(@RequestBody List<WordLibraryRequest> requests) {
        return Result.success(wordLibraryService.batchImport(requests));
    }

    /** 智能分词：对输入文本进行分词，返回词条列表 */
    @PostMapping("/segment")
    @RequirePermission(menu = "promotion-word-library")
    public Result<List<String>> segment(@Valid @RequestBody SegmentRequest request) {
        return Result.success(segmentationService.segment(request.getText()));
    }
}
