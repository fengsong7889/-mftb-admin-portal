package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.RdmReleaseDTO;
import com.mftb.admin.dto.RdmReleaseVO;
import com.mftb.admin.service.RdmReleaseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 发布放行控制器（阶段 4：上线前的质量闸门）。
 * <p>与「业务验收」分开的理由：放行回答"质量上能不能上线"，由 PMO/研发负责人裁决；
 * 业务验收回答"上线后是否解决了业务问题"，由业务方打分。合并成一个动作时，
 * 签字上线的人和质量责任人变成同一个人，出问题没有第二双眼睛。
 */
@RestController
@RequestMapping("/api/rdm/release")
@RequiredArgsConstructor
public class RdmReleaseController {

    private final RdmReleaseService releaseService;

    /** 检查项实时预览（不落库，供发起前自查） */
    @GetMapping("/requirement/{reqId}/check")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<RdmReleaseVO.Gate> check(@PathVariable Long reqId) {
        return Result.success(releaseService.preview(reqId));
    }

    /** 放行单历史 */
    @GetMapping("/requirement/{reqId}")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-acceptance", "rdm-intake"})
    public Result<List<RdmReleaseVO.Gate>> list(@PathVariable Long reqId) {
        return Result.success(releaseService.list(reqId));
    }

    /** 发起放行单（冻结检查项快照，等待他人裁决） */
    @PostMapping("/requirement/{reqId}/apply")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmReleaseVO.Gate> apply(@PathVariable Long reqId, @RequestBody RdmReleaseDTO.Apply dto) {
        return Result.success("放行單已發起，等待他人裁決", releaseService.apply(reqId, dto));
    }

    /** 放行 / 驳回 */
    @PostMapping("/{id}/decide")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmReleaseVO.Gate> decide(@PathVariable Long id, @RequestBody RdmReleaseDTO.Decide dto) {
        RdmReleaseVO.Gate gate = releaseService.decide(id, dto);
        return Result.success("passed".equals(gate.getStatus()) ? "已准許上線" : "已駁回放行", gate);
    }
}
