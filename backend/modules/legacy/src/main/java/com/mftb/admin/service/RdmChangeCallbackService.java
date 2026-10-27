package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmChangeRequest;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmChangeRequestMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 需求变更审批回调：OA 审完 → 回写变更单与需求。
 * <p>与准入回调同口径：办理失败只记日志、不回滚审批流转。
 * <p>刻意<b>不</b>自动改需求状态：变更通过意味着"范围/验收标准真的变了"，
 * 应由产品经理显式决定是回炉 PRD、重排期还是继续推进，系统只在需要回填计划时间时代为落库。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmChangeCallbackService {

    private final RdmChangeRequestMapper changeMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmNotifyService notifyService;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    /** 是否需求变更流程 */
    public boolean isChangeProcess(String processCode) {
        return RdmConstants.CHANGE_PROCESS_CODE.equals(processCode);
    }

    /** 变更审批通过：计变更次数，影响排期时回填新的计划上线日期 */
    public void onFlowApproved(String flowNo) {
        RdmChangeRequest change = findByFlow(flowNo);
        if (change == null) {
            log.warn("需求變更回調未找到變更單: flowNo={}", flowNo);
            return;
        }
        if (!"pending".equals(change.getApprovalStatus())) {
            return;
        }
        RdmRequirement req = requirementMapper.selectById(change.getReqId());
        if (req == null) {
            throw new IllegalStateException("变更单关联的需求不存在: changeNo=" + change.getChangeNo());
        }
        change.setApprovalStatus("approved");
        change.setDecideTime(LocalDateTime.now());
        changeMapper.updateById(change);

        LocalDate newPlanDate = newPlanDateOf(flowNo);
        RdmRequirement patch = new RdmRequirement();
        patch.setId(req.getId());
        patch.setChangeCount((req.getChangeCount() == null ? 0 : req.getChangeCount()) + 1);
        if (newPlanDate != null) {
            patch.setPlanReleaseDate(newPlanDate);
        }
        requirementMapper.updateById(patch);

        notifyApproved(req, change, newPlanDate);
        log.info("需求變更已通過: changeNo={}, reqNo={}, 新計劃上線={}",
                change.getChangeNo(), req.getReqNo(), newPlanDate);
    }

    /** 变更审批驳回：变更单退回，需求保持原状 */
    public void onFlowRejected(String flowNo, String reason) {
        RdmChangeRequest change = findByFlow(flowNo);
        if (change == null) {
            log.warn("需求變更駁回回調未找到變更單: flowNo={}", flowNo);
            return;
        }
        change.setApprovalStatus("rejected");
        change.setDecideTime(LocalDateTime.now());
        change.setDecideRemark(StringUtils.hasText(reason) ? reason : "變更申請未通過審批");
        changeMapper.updateById(change);

        RdmRequirement req = requirementMapper.selectById(change.getReqId());
        if (req != null) {
            notifyService.notifyUserIds(RdmConstants.EVENT_CHANGE_DECIDED, req,
                    change.getApplicantUserId() == null ? List.of() : List.of(change.getApplicantUserId()),
                    "需求變更被駁回", "### ⛔ 需求變更未通過\n\n- **變更單**: " + change.getChangeNo()
                            + "\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                            + "\n- **意見**: " + change.getDecideRemark());
        }
    }

    private RdmChangeRequest findByFlow(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        return changeMapper.selectOne(new LambdaQueryWrapper<RdmChangeRequest>()
                .eq(RdmChangeRequest::getFlowNo, flowNo)
                .orderByDesc(RdmChangeRequest::getId)
                .last("LIMIT 1"));
    }

    /**
     * 从審批表單取「變更後的計劃上線日期」。
     * <p>表单内容可能已在審批环节被修改，因此以库里实际的 {@code form_data} 为准，
     * 不拿变更单创建时的快照回填。解析失败时保留原计划时间：宁可不改，也不乱改排期。
     */
    private LocalDate newPlanDateOf(String flowNo) {
        try {
            String formData = jdbcTemplate.queryForList(
                            "SELECT form_data FROM biz_oa_request WHERE flow_no = ? AND deleted = 0 LIMIT 1",
                            String.class, flowNo)
                    .stream().findFirst().orElse(null);
            Map<String, Object> form = JsonUtils.parseMap(formData);
            Object value = form == null ? null : form.get("newPlanReleaseDate");
            if (value == null || !StringUtils.hasText(value.toString())) {
                return null;
            }
            return LocalDate.parse(value.toString().trim().substring(0, 10));
        } catch (Exception e) {
            log.warn("解析變更表單失敗，保留原計劃時間: flowNo={}, error={}", flowNo, e.getMessage());
            return null;
        }
    }

    private void notifyApproved(RdmRequirement req, RdmChangeRequest change, LocalDate newPlanDate) {
        StringBuilder text = new StringBuilder("### ✅ 需求變更已通過\n\n- **變更單**: ").append(change.getChangeNo())
                .append("\n- **需求**: ").append(req.getReqNo()).append(" ").append(req.getTitle())
                .append("\n- **變更內容**: ").append(change.getAfterContent());
        if (newPlanDate != null) {
            text.append("\n- **新計劃上線**: ").append(newPlanDate);
        }
        text.append("\n\n請產品經理據此更新 PRD 與排期（如需回爐請在需求詳情頁推進狀態）。");
        java.util.List<Long> receivers = new java.util.ArrayList<>();
        if (req.getAssigneePmUserId() != null) {
            receivers.add(req.getAssigneePmUserId());
        }
        if (req.getDevOwnerUserId() != null) {
            receivers.add(req.getDevOwnerUserId());
        }
        if (change.getApplicantUserId() != null) {
            receivers.add(change.getApplicantUserId());
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_CHANGE_DECIDED, req, receivers, "需求變更已通過", text.toString());
    }
}
