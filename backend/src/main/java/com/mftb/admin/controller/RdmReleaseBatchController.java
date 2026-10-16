package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmReleaseBatchDTO;
import com.mftb.admin.dto.RdmReleaseBatchVO;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseExemption;
import com.mftb.admin.entity.RdmReleaseExemptionDecision;
import com.mftb.admin.entity.RdmSupplementaryVerification;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmReleaseBatchService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研交付（RDM）发布批次接口（Batch 1，任务27 纯增量扩展）。
 * <p>菜单归属：{@code rdm-delivery-release}（发布中心）。发布批次是「多系统一次上线」的编排单位：
 * 部署顺序、逐系统验证、<b>业务开放</b>、失败回滚都在批次内闭环；放行裁决不得由申请人本人签，
 * 由服务层校验发布负责人资格与状态机，控制器只做鉴权与封装。
 *
 * <p><b>任务27 新增四个端点（供任务23 前端消费，纯增量、不改既有字段与路径）</b>：
 * <table border="1">
 *   <caption>任务27 新增端点契约</caption>
 *   <tr><th>方法与路径</th><th>请求体</th><th>响应</th><th>说明</th></tr>
 *   <tr><td>{@code POST /api/rdm/release-batch/{id}/open}</td>
 *       <td>{@link RdmReleaseBatchDTO.Open}</td><td>{@code Result<Void>}</td>
 *       <td>业务开放（独立事实）；<b>验证通过不等于已发布</b>，全部开放后才置 released</td></tr>
 *   <tr><td>{@code POST /api/rdm/release-batch/{id}/exemption}</td>
 *       <td>{@link RdmReleaseBatchDTO.Exemption}</td><td>{@code Result<RdmReleaseExemption>}</td>
 *       <td>紧急豁免申请（只豁免缺失的产品验收，业务验收永不可豁免）</td></tr>
 *   <tr><td>{@code POST /api/rdm/release-batch/{id}/exemption/{exemptionId}/decision}</td>
 *       <td>{@link RdmReleaseBatchDTO.ExemptionDecision}</td>
 *       <td>{@code Result<RdmReleaseExemptionDecision>}</td>
 *       <td>豁免裁决（<b>四眼</b>：申请人 ≠ 批准人，管理员亦不得自批）</td></tr>
 *   <tr><td>{@code POST /api/rdm/release-batch/supplementary/{id}/complete}</td>
 *       <td>{@link RdmReleaseBatchDTO.SupplementaryComplete}</td>
 *       <td>{@code Result<RdmSupplementaryVerification>}</td>
 *       <td>产品补验完成登记（仅冻结的补验人本人可登记，无 admin 直通）</td></tr>
 * </table>
 * <p>四个写端点全部已接入 {@code executeOnce} 原子幂等：请求体的 {@code requestId} 重试时保持不变即可，
 * {@code expectedVersion} 取详情接口返回的 {@code version}（补验取 {@code SupplementaryRecord.version}）。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/release-batch")
@RequiredArgsConstructor
public class RdmReleaseBatchController {

    private final RdmReleaseBatchService releaseBatchService;
    private final RdmAllowedActionsService allowedActionsService;
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    /** 发布批次分页列表（非全量授权者收敛为「与我相关」的批次） */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "view")
    public Result<PageResult<RdmReleaseBatchVO.ListItem>> listBatches(RdmReleaseBatchDTO.Query query) {
        Page<RdmReleaseBatchVO.ListItem> page = releaseBatchService.listBatches(query, currentUserId());
        return Result.success(new PageResult<>(page.getRecords(), page.getTotal()));
    }

    /** 批次详情（含部署记录与实时放行检查结果） */
    @GetMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "view")
    public Result<RdmReleaseBatchVO.Detail> getBatchDetail(@PathVariable Long id) {
        return Result.success(releaseBatchService.getBatchDetail(id, currentUserId()));
    }

    /** 发布批次可执行动作（第二批阶段发布能力未开放，仅下发查看/加入交付项等准备动作） */
    @GetMapping("/{id}/actions")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "view")
    @Operation(summary = "獲取發布批次可執行動作")
    public Result<List<RdmAllowedActionsService.AllowedAction>> getActions(@PathVariable Long id) {
        return Result.success(allowedActionsService.computeReleaseBatchActions(id, currentUserId()));
    }

    /* ==================== 写入 ==================== */

    /** 创建发布批次（随批次提交部署清单） */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "create")
    public Result<RdmReleaseBatch> createBatch(@RequestBody RdmReleaseBatchDTO.Create dto) {
        SysUser user = operatorResolver.currentUser();
        RdmReleaseBatch batch = releaseBatchService.createBatch(
                dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已创建: id={}, batchNo={}, operator={}",
                batch.getId(), batch.getBatchNo(), operatorResolver.currentOperatorName());
        return Result.success("發布批次已創建", batch);
    }

    /** 放行前检查（实时计算检查项，供发起前自查） */
    @PostMapping("/{id}/check")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<List<RdmReleaseBatchVO.CheckResult>> runCheck(@PathVariable Long id) {
        return Result.success(releaseBatchService.runCheck(id, currentUserId()));
    }

    /** 申请发布（冻结检查项快照，等待他人裁决） */
    @PostMapping("/{id}/apply")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> applyRelease(@PathVariable Long id) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.applyRelease(id, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已申请发布: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("發布申請已提交，等待他人裁決", null);
    }

    /** 放行裁决（不得由申请人本人签） */
    @PostMapping("/{id}/decide")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> decideRelease(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Decide dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.decideRelease(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已裁决: id={}, decision={}, operator={}",
                id, dto == null ? null : dto.getDecision(), operatorResolver.currentOperatorName());
        return Result.success("裁決已提交", null);
    }

    /** 上报部署结果 */
    @PostMapping("/{id}/deployments")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> submitDeployment(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Deploy dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.submitDeployment(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布部署结果已上报: id={}, systemCode={}, operator={}",
                id, dto == null ? null : dto.getSystemCode(), operatorResolver.currentOperatorName());
        return Result.success("部署結果已上報", null);
    }

    /**
     * 上报部署后验证结果。
     * <p><b>任务27 口径变更</b>：全部验证通过后批次<b>仍停在 verifying</b>，
     * 不再直接置 released；必须再走 {@link #openRelease} 建立真实开放事实。
     */
    @PostMapping("/{id}/verification")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> submitVerification(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Verify dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.submitVerification(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布验证结果已上报: id={}, systemCode={}, operator={}",
                id, dto == null ? null : dto.getSystemCode(), operatorResolver.currentOperatorName());
        return Result.success("驗證結果已上報", null);
    }

    /**
     * 登记业务开放（任务27 新增）。
     * <p><b>端点契约</b>：{@code POST /api/rdm/release-batch/{id}/open}，body
     * {@link RdmReleaseBatchDTO.Open}（{@code requestId} / {@code expectedVersion} /
     * {@code systemCodes}（缺省=全部）/ {@code openStatus}（opened|not_opened，缺省 opened）/ {@code remark}）。
     * <p>开放是<b>独立事实</b>：只有全部系统 opened 后批次才置 released 并推进交付项状态；
     * 开放前重验硬门禁，且<b>产品验收必须真实建立</b>（紧急豁免不豁免开放）。
     */
    @PostMapping("/{id}/open")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    @Operation(summary = "登記業務開放（獨立事實，驗證通過不等於已發布）")
    public Result<Void> openRelease(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Open dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.openRelease(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布业务开放已登记: id={}, openStatus={}, systems={}, operator={}",
                id, dto == null ? null : dto.getOpenStatus(),
                dto == null ? null : dto.getSystemCodes(), operatorResolver.currentOperatorName());
        return Result.success("開放登記已提交", null);
    }

    /** 回滚（缺省回滚批次内已部署成功的全部系统）。
     * <p><b>任务27 口径变更</b>：回滚除标记部署记录外，还会<b>追加 rollback 事实并撤销开放事实</b>，
     * 使路径B（先上线后验收）的 post_release 业务验收被重新门禁。 */
    @PostMapping("/{id}/rollback")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    public Result<Void> rollback(@PathVariable Long id, @RequestBody RdmReleaseBatchDTO.Rollback dto) {
        SysUser user = operatorResolver.currentUser();
        releaseBatchService.rollback(id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 发布批次已回滚: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("已回滾", null);
    }

    /* ==================== 紧急豁免与产品补验（任务27 新增） ==================== */

    /**
     * 申请紧急豁免（任务27 新增）。
     * <p><b>端点契约</b>：{@code POST /api/rdm/release-batch/{id}/exemption}，body
     * {@link RdmReleaseBatchDTO.Exemption}（{@code requestId} / {@code expectedVersion} /
     * {@code reason}（必填）/ {@code risk}（必填）/ {@code rollbackPlan}（必填）/
     * {@code supplementaryPlan}（可选，逐项指定补验人；缺省取交付项产品验收人））。
     * <p>缺失项由<b>服务端</b>计算，客户端不得自行声明；申请即冻结补验计划与
     * <b>真实工作日</b>期限（按补验人本人日历）。
     */
    @PostMapping("/{id}/exemption")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    @Operation(summary = "申請緊急豁免（僅可豁免缺失的產品驗收）")
    public Result<RdmReleaseExemption> applyExemption(@PathVariable Long id,
                                                      @RequestBody RdmReleaseBatchDTO.Exemption dto) {
        SysUser user = operatorResolver.currentUser();
        RdmReleaseExemption exemption = releaseBatchService.applyExemption(
                id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 紧急豁免已申请: batchId={}, exemptionId={}, operator={}",
                id, exemption == null ? null : exemption.getId(), operatorResolver.currentOperatorName());
        return Result.success("緊急豁免已申請，需產品風險與發布兩類裁決均通過後才生效", exemption);
    }

    /**
     * 裁决紧急豁免（任务27 新增）。
     * <p><b>端点契约</b>：{@code POST /api/rdm/release-batch/{id}/exemption/{exemptionId}/decision}，
     * body {@link RdmReleaseBatchDTO.ExemptionDecision}（{@code requestId} / {@code expectedVersion} /
     * {@code decisionType}（product_risk|release，必填）/ {@code decision}（approved|rejected，必填）/
     * {@code reason}（必填））。
     * <p><b>四眼</b>：裁决人不得是豁免申请人本人，<b>系统管理员亦无自批豁免</b>；
     * 两类裁决必须齐备且均为 approved 豁免才生效。
     */
    @PostMapping("/{id}/exemption/{exemptionId}/decision")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    @Operation(summary = "裁決緊急豁免（四眼：申請人不得自批）")
    public Result<RdmReleaseExemptionDecision> decideExemption(
            @PathVariable Long id, @PathVariable Long exemptionId,
            @RequestBody RdmReleaseBatchDTO.ExemptionDecision dto) {
        SysUser user = operatorResolver.currentUser();
        RdmReleaseExemptionDecision decision = releaseBatchService.decideExemption(
                id, exemptionId, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 紧急豁免已裁决: batchId={}, exemptionId={}, type={}, decision={}, operator={}",
                id, exemptionId, dto == null ? null : dto.getDecisionType(),
                dto == null ? null : dto.getDecision(), operatorResolver.currentOperatorName());
        return Result.success("豁免裁決已提交", decision);
    }

    /**
     * 登记产品补验完成（任务27 新增）。
     * <p><b>端点契约</b>：{@code POST /api/rdm/release-batch/supplementary/{id}/complete}，body
     * {@link RdmReleaseBatchDTO.SupplementaryComplete}（{@code requestId} / {@code expectedVersion}（补验单 version）/
     * {@code acceptanceRecordId}（必填，必须引用真实存在的验收记录）/ {@code result}（pass|fail，必填）/
     * {@code evidenceJson}（可选））。
     * <p>仅<b>冻结的补验人本人</b>可登记（无 admin 直通）；fail 即置 failed + 升级整改，
     * 且产品验收未真实建立时仍<b>拒绝开放</b>。
     */
    @PostMapping("/supplementary/{id}/complete")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    @Operation(summary = "登記產品補驗完成（僅補驗人本人）")
    public Result<RdmSupplementaryVerification> completeSupplementary(
            @PathVariable Long id, @RequestBody RdmReleaseBatchDTO.SupplementaryComplete dto) {
        SysUser user = operatorResolver.currentUser();
        RdmSupplementaryVerification sv = releaseBatchService.completeSupplementary(
                id, dto, userId(user), operatorResolver.currentOperatorName());
        log.info("RDM 产品补验已登记: supplementaryId={}, result={}, operator={}",
                id, dto == null ? null : dto.getResult(), operatorResolver.currentOperatorName());
        return Result.success("補驗結果已登記", sv);
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        return userId(operatorResolver.currentUser());
    }

    private Long userId(SysUser user) {
        return user == null ? null : user.getId();
    }
}
