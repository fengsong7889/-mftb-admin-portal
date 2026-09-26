package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HrCertificateConstants;
import com.mftb.admin.dto.HrCertificateSaveDTO;
import com.mftb.admin.dto.HrCertificateVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.HrCertificateService;
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

import java.util.Map;

/**
 * 證明開具接口（員工自助）。
 * <p>
 * 全部端点只服务登录人本人：不接收 userId 参数，服务层按当前用户强制过滤，
 * 因此把 ess-certificate 菜单授予全员也不会泄露他人申请。
 */
@RestController
@RequestMapping("/api/hr/certificate")
@RequiredArgsConstructor
public class HrCertificateController {

    private final HrCertificateService hrCertificateService;

    /** 我的证明申请分页 */
    @GetMapping
    @RequirePermission(menu = HrCertificateConstants.MENU)
    public Result<PageResult<HrCertificateVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrCertificateService.page(page, size, status, keyword));
    }

    /** 状态计数（列表 Tab 徽标） */
    @GetMapping("/stats")
    @RequirePermission(menu = HrCertificateConstants.MENU)
    public Result<Map<String, Long>> stats() {
        return Result.success(hrCertificateService.stats());
    }

    /** 申请详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = HrCertificateConstants.MENU)
    public Result<HrCertificateVO> detail(@PathVariable Long id) {
        return Result.success(hrCertificateService.detail(id));
    }

    /** 保存草稿 */
    @PostMapping
    @RequirePermission(menu = HrCertificateConstants.MENU, action = "create")
    public Result<HrCertificateVO> saveDraft(@Valid @RequestBody HrCertificateSaveDTO dto) {
        return Result.success("草稿已保存", hrCertificateService.saveDraft(dto));
    }

    /** 编辑草稿 */
    @PutMapping("/{id}")
    @RequirePermission(menu = HrCertificateConstants.MENU, action = "edit")
    public Result<HrCertificateVO> update(@PathVariable Long id,
                                          @Valid @RequestBody HrCertificateSaveDTO dto) {
        return Result.success("申請已更新", hrCertificateService.update(id, dto));
    }

    /** 提交审批（创建关联 OA 流程） */
    @PostMapping("/{id}/submit")
    @RequirePermission(menu = HrCertificateConstants.MENU, action = "edit")
    public Result<HrCertificateVO> submit(@PathVariable Long id) {
        HrCertificateVO vo = hrCertificateService.submit(id);
        return Result.success("已提交審批，流程編號：" + vo.getFlowNo(), vo);
    }

    /** 撤销审批 */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = HrCertificateConstants.MENU, action = "edit")
    public Result<Void> cancel(@PathVariable Long id) {
        hrCertificateService.cancel(id);
        return Result.success("已撤銷，申請回到草稿", null);
    }

    /** 删除申请（仅草稿/驳回/已撤销） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = HrCertificateConstants.MENU, action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        hrCertificateService.delete(id);
        return Result.success("申請已刪除", null);
    }
}
