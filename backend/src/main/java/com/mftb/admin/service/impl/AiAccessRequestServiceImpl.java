package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.AiAccessRequestDTO;
import com.mftb.admin.entity.AiAccessRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiAccessRequestMapper;
import com.mftb.admin.service.AiAccessRequestService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiAccessRequestServiceImpl implements AiAccessRequestService {

    private final AiAccessRequestMapper requestMapper;
    private final OperatorResolver operatorResolver;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submitRequest(AiAccessRequestDTO.SubmitRequest request, String operator) {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            throw new RuntimeException("未登錄或登錄已過期");
        }

        AiAccessRequest entity = new AiAccessRequest();
        entity.setApplicantId(user.getId());
        entity.setApplicantName(StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        entity.setDepartmentId(user.getDepartmentId());
        entity.setDepartmentName(user.getDepartment());
        entity.setPositionId(user.getPositionId());
        entity.setPositionName(user.getPosition());
        entity.setRequestType(request.getRequestType());
        entity.setRequestedModels(request.getRequestedModels() != null ? JsonUtils.toJson(request.getRequestedModels()) : null);
        entity.setUsageDescription(request.getUsageDescription());
        entity.setUsageScenarios(request.getUsageScenarios() != null ? JsonUtils.toJson(request.getUsageScenarios()) : null);
        entity.setUsageFrequency(request.getUsageFrequency());
        entity.setStatus("pending");
        entity.setCreatedBy(operator);
        entity.setUpdatedBy(operator);

        requestMapper.insert(entity);
        log.info("AI使用申請已提交: id={}, applicant={}, type={}", entity.getId(), entity.getApplicantName(), entity.getRequestType());
        return entity.getId();
    }

    @Override
    public List<AiAccessRequestDTO.RequestVO> listRequests(AiAccessRequestDTO.QueryRequest query) {
        LambdaQueryWrapper<AiAccessRequest> wrapper = buildQueryWrapper(query);
        wrapper.orderByDesc(AiAccessRequest::getUpdatedAt);
        return requestMapper.selectList(wrapper).stream().map(this::toVO).toList();
    }

    @Override
    public List<AiAccessRequestDTO.RequestVO> listMyRequests(AiAccessRequestDTO.QueryRequest query) {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            throw new RuntimeException("未登錄或登錄已過期");
        }
        LambdaQueryWrapper<AiAccessRequest> wrapper = buildQueryWrapper(query);
        wrapper.eq(AiAccessRequest::getApplicantId, user.getId());
        wrapper.orderByDesc(AiAccessRequest::getUpdatedAt);
        return requestMapper.selectList(wrapper).stream().map(this::toVO).toList();
    }

    @Override
    public AiAccessRequestDTO.RequestVO getRequestById(Long id) {
        AiAccessRequest entity = requestMapper.selectById(id);
        return entity != null ? toVO(entity) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveRequest(Long id, AiAccessRequestDTO.ApproveRequest request, String operator) {
        AiAccessRequest entity = requestMapper.selectById(id);
        if (entity == null) {
            throw new RuntimeException("申請記錄不存在");
        }
        if (!"pending".equals(entity.getStatus())) {
            throw new RuntimeException("該申請已處理，不可重複審批");
        }

        SysUser approver = operatorResolver.currentUser();
        entity.setStatus("approved");
        entity.setApprovedModels(request.getApprovedModels() != null ? JsonUtils.toJson(request.getApprovedModels()) : null);
        entity.setApprovedQuotaType(request.getApprovedQuotaType());
        entity.setApprovedQuotaValue(request.getApprovedQuotaValue());
        entity.setApprovedQuotaPeriod(request.getApprovedQuotaPeriod());
        entity.setApprovedOverLimitAction(request.getApprovedOverLimitAction());
        entity.setApproverId(approver != null ? approver.getId() : null);
        entity.setApproverName(operator);
        entity.setApproveRemark(request.getApproveRemark());
        entity.setApprovedAt(LocalDateTime.now());
        entity.setUpdatedBy(operator);

        requestMapper.updateById(entity);
        log.info("AI使用申請已審批通過: id={}, approver={}", id, operator);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectRequest(Long id, String remark, String operator) {
        AiAccessRequest entity = requestMapper.selectById(id);
        if (entity == null) {
            throw new RuntimeException("申請記錄不存在");
        }
        if (!"pending".equals(entity.getStatus())) {
            throw new RuntimeException("該申請已處理，不可重複審批");
        }

        SysUser approver = operatorResolver.currentUser();
        entity.setStatus("rejected");
        entity.setApproverId(approver != null ? approver.getId() : null);
        entity.setApproverName(operator);
        entity.setApproveRemark(remark);
        entity.setApprovedAt(LocalDateTime.now());
        entity.setUpdatedBy(operator);

        requestMapper.updateById(entity);
        log.info("AI使用申請已駁回: id={}, approver={}", id, operator);
    }

    /* ==================== 私有方法 ==================== */

    private LambdaQueryWrapper<AiAccessRequest> buildQueryWrapper(AiAccessRequestDTO.QueryRequest query) {
        LambdaQueryWrapper<AiAccessRequest> wrapper = new LambdaQueryWrapper<>();
        if (query != null) {
            if (StringUtils.hasText(query.getStatus())) {
                wrapper.eq(AiAccessRequest::getStatus, query.getStatus());
            }
            if (StringUtils.hasText(query.getRequestType())) {
                wrapper.eq(AiAccessRequest::getRequestType, query.getRequestType());
            }
            if (StringUtils.hasText(query.getApplicantName())) {
                wrapper.like(AiAccessRequest::getApplicantName, query.getApplicantName());
            }
        }
        return wrapper;
    }

    private AiAccessRequestDTO.RequestVO toVO(AiAccessRequest entity) {
        AiAccessRequestDTO.RequestVO vo = new AiAccessRequestDTO.RequestVO();
        vo.setId(entity.getId());
        vo.setApplicantId(entity.getApplicantId());
        vo.setApplicantName(entity.getApplicantName());
        vo.setDepartmentId(entity.getDepartmentId());
        vo.setDepartmentName(entity.getDepartmentName());
        vo.setPositionId(entity.getPositionId());
        vo.setPositionName(entity.getPositionName());
        vo.setRequestType(entity.getRequestType());
        vo.setRequestedModels(parseJsonArray(entity.getRequestedModels()));
        vo.setUsageDescription(entity.getUsageDescription());
        vo.setUsageScenarios(parseStringArray(entity.getUsageScenarios()));
        vo.setUsageFrequency(entity.getUsageFrequency());
        vo.setStatus(entity.getStatus());
        vo.setWorkflowInstanceId(entity.getWorkflowInstanceId());
        vo.setApprovedModels(parseJsonArray(entity.getApprovedModels()));
        vo.setApprovedQuotaType(entity.getApprovedQuotaType());
        vo.setApprovedQuotaValue(entity.getApprovedQuotaValue());
        vo.setApprovedQuotaPeriod(entity.getApprovedQuotaPeriod());
        vo.setApprovedOverLimitAction(entity.getApprovedOverLimitAction());
        vo.setApproverId(entity.getApproverId());
        vo.setApproverName(entity.getApproverName());
        vo.setApproveRemark(entity.getApproveRemark());
        vo.setApprovedAt(entity.getApprovedAt() != null ? entity.getApprovedAt().format(DT_FMT) : null);
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt() != null ? entity.getCreatedAt().format(DT_FMT) : null);
        vo.setUpdatedAt(entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DT_FMT) : null);
        return vo;
    }

    private List<Long> parseJsonArray(String json) {
        if (!StringUtils.hasText(json)) return null;
        return JsonUtils.parseLongList(json);
    }

    private List<String> parseStringArray(String json) {
        if (!StringUtils.hasText(json)) return null;
        return JsonUtils.parseStringList(json);
    }
}
