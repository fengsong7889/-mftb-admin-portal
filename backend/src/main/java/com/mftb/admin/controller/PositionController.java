package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PositionRequest;
import com.mftb.admin.dto.PositionVO;
import com.mftb.admin.service.PositionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 集团人事-职位接口
 */
@RestController
@RequestMapping("/api/positions")
@RequiredArgsConstructor
public class PositionController {

    private final PositionService positionService;

    /** 查询全部职位 */
    @GetMapping
    public Result<List<PositionVO>> list() {
        return Result.success(positionService.list());
    }

    /** 新增职位 */
    @PostMapping
    public Result<PositionVO> create(@Valid @RequestBody PositionRequest request) {
        return Result.success("职位创建成功", positionService.create(request));
    }

    /** 编辑职位 */
    @PutMapping("/{id}")
    public Result<PositionVO> update(@PathVariable Long id, @Valid @RequestBody PositionRequest request) {
        return Result.success("职位信息已更新", positionService.update(id, request));
    }

    /** 删除职位 */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        positionService.delete(id);
        return Result.success();
    }
}
