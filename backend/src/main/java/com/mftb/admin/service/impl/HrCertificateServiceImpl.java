package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrCertificateConstants;
import com.mftb.admin.dto.HrCertificateSaveDTO;
import com.mftb.admin.dto.HrCertificateVO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrCertificateRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrCertificateRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.HrCertificateService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 證明開具服务实现（员工自助）。
 * <p>
 * 数据范围在服务层硬约束：所有读写字句都以 {@code user_id = 登录人} 起过滤，
 * 因此本模块只需授予 ess-certificate 菜单即可开放给全员，无需额外的数据范围表。
 * 审批委托 OA 引擎（流程定义 hr_certificate），formData 携带 bizId 作为双向锚点。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrCertificateServiceImpl implements HrCertificateService {

    private final HrCertificateRequestMapper certMapper;
    private final SysUserMapper sysUserMapper;
    private final OaRequestService oaRequestService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;

    @Override
    public PageResult<HrCertificateVO> page(long page, long size, String status, String keyword) {
        Long me = requirePermission("view");
        LambdaQueryWrapper<HrCertificateRequest> wrapper = new LambdaQueryWrapper<HrCertificateRequest>()
                .eq(HrCertificateRequest::getUserId, me)
                .orderByDesc(HrCertificateRequest::getId);
        if (StringUtils.hasText(status)) {
            wrapper.eq(HrCertificateRequest::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(HrCertificateRequest::getReqNo, kw)
                    .or().like(HrCertificateRequest::getPurpose, kw)
                    .or().like(HrCertificateRequest::getRecipient, kw));
        }
        Page<HrCertificateRequest> result = certMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<HrCertificateVO> records = result.getRecords().stream().map(HrCertificateVO::from).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public Map<String, Long> stats() {
        Long me = requirePermission("view");
        List<HrCertificateRequest> rows = certMapper.selectList(
                new LambdaQueryWrapper<HrCertificateRequest>()
                        .eq(HrCertificateRequest::getUserId, me)
                        .select(HrCertificateRequest::getStatus));
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("all", (long) rows.size());
        for (String s : List.of(HrCertificateConstants.STATUS_DRAFT, HrCertificateConstants.STATUS_PENDING,
                HrCertificateConstants.STATUS_REJECTED, HrCertificateConstants.STATUS_APPROVED,
                HrCertificateConstants.STATUS_COMPLETED)) {
            counts.put(s, 0L);
        }
        for (HrCertificateRequest r : rows) {
            counts.merge(r.getStatus(), 1L, Long::sum);
        }
        return counts;
    }

    @Override
    public HrCertificateVO detail(Long id) {
        return HrCertificateVO.from(requireOwn(id, "view"));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrCertificateVO saveDraft(HrCertificateSaveDTO dto) {
        Long me = requirePermission("create");
        HrCertificateRequest entity = new HrCertificateRequest();
        entity.setStatus(HrCertificateConstants.STATUS_DRAFT);
        entity.setReqNo(generateReqNo());
        applyDto(entity, dto, me);
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        certMapper.insert(entity);
        return HrCertificateVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrCertificateVO update(Long id, HrCertificateSaveDTO dto) {
        HrCertificateRequest entity = requireOwn(id, "edit");
        requireEditable(entity);
        applyDto(entity, dto, entity.getUserId());
        touch(entity);
        certMapper.updateById(entity);
        return HrCertificateVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrCertificateVO submit(Long id) {
        HrCertificateRequest entity = requireOwn(id, "edit");
        requireEditable(entity);
        validateForSubmit(entity);

        Map<String, Object> formData = new HashMap<>();
        formData.put("bizId", entity.getId());
        formData.put("bizType", "certificate");
        formData.put("empName", entity.getEmpName());
        formData.put("certType", entity.getCertType());
        formData.put("copies", entity.getCopies());

        OaRequestCreateDTO oa = new OaRequestCreateDTO();
        oa.setProcessCode(HrCertificateConstants.PROCESS_CODE);
        oa.setTitle("證明開具-" + entity.getEmpName() + "(" + entity.getReqNo() + ")");
        oa.setFormData(JsonUtils.toJson(formData));
        String flowNo = oaRequestService.submit(oa);

        entity.setFlowNo(flowNo);
        entity.setStatus(HrCertificateConstants.STATUS_PENDING);
        touch(entity);
        certMapper.updateById(entity);
        log.info("HR certificate submitted: reqNo={}, flowNo={}", entity.getReqNo(), flowNo);
        return HrCertificateVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long id) {
        HrCertificateRequest entity = requireOwn(id, "edit");
        if (!HrCertificateConstants.STATUS_PENDING.equals(entity.getStatus())) {
            throw new BusinessException("僅審批中的申請可以撤銷");
        }
        oaRequestService.cancel(entity.getFlowNo());
        entity.setStatus(HrCertificateConstants.STATUS_DRAFT);
        touch(entity);
        certMapper.updateById(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        HrCertificateRequest entity = requireOwn(id, "delete");
        requireEditable(entity);
        certMapper.deleteById(id);
    }

    // ==================== 内部逻辑 ====================

    /**
     * 功能权限校验并返回登录人 id。
     * <p>本模块天然只服务本人数据，故权限通过即等于拿到数据范围边界，不给调用方传别人的 id。
     */
    private Long requirePermission(String action) {
        SysUser user = operatorResolver.currentUser();
        if (user == null || user.getId() == null) {
            throw new PermissionDeniedException(HrCertificateConstants.MENU, action);
        }
        if (!permissionService.hasPermission(user, HrCertificateConstants.MENU, action)) {
            throw new PermissionDeniedException(HrCertificateConstants.MENU, action);
        }
        return user.getId();
    }

    /** 取单据并校验归属：他人申请一律按数据范围拒绝（提示区分于"缺菜单权限"） */
    private HrCertificateRequest requireOwn(Long id, String action) {
        HrCertificateRequest entity = id == null ? null : certMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("證明申請不存在");
        }
        Long me = requirePermission(action);
        if (!me.equals(entity.getUserId())) {
            throw PermissionDeniedException.outOfDataScope("他人的證明申請單");
        }
        return entity;
    }

    /** 天数/日期口径统一在此校验：期望取得日期不得早于今天 */
    private void applyDto(HrCertificateRequest entity, HrCertificateSaveDTO dto, Long userId) {
        if (!HrCertificateConstants.isValidType(dto.getCertType())) {
            throw new BusinessException("無效的證明類型: " + dto.getCertType());
        }
        if (!HrCertificateConstants.isValidLanguage(dto.getLanguage())) {
            throw new BusinessException("無效的證明語種: " + dto.getLanguage());
        }
        if (dto.getExpectDate() != null && dto.getExpectDate().isBefore(LocalDate.now())) {
            throw new BusinessException("期望取得日期不能早於今天");
        }
        SysUser user = requireUser(userId);
        entity.setUserId(user.getId());
        entity.setEmpName(user.getName());
        entity.setEmpNo(user.getEmpId());
        entity.setDeptName(user.getDepartment());
        entity.setCertType(dto.getCertType());
        entity.setPurpose(trim(dto.getPurpose()));
        entity.setRecipient(trim(dto.getRecipient()));
        entity.setLanguage(StringUtils.hasText(dto.getLanguage()) ? dto.getLanguage() : HrCertificateConstants.LANG_ZH);
        entity.setCopies(dto.getCopies());
        entity.setExpectDate(dto.getExpectDate());
        entity.setRemark(trim(dto.getRemark()));
    }

    /** 提交前的完整性校验（草稿允许残缺，提交必须齐全） */
    private void validateForSubmit(HrCertificateRequest entity) {
        if (!StringUtils.hasText(entity.getPurpose())) {
            throw new BusinessException("提交前請填寫證明用途");
        }
        if (entity.getCopies() == null || entity.getCopies() <= 0) {
            throw new BusinessException("提交前請填寫證明份數");
        }
    }

    /** 申请人必须是在职员工；员工不存在时直接拒绝，避免写入无主单据 */
    private SysUser requireUser(Long userId) {
        SysUser user = userId == null ? null : sysUserMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("申請人不存在或已離職");
        }
        return user;
    }

    private void requireEditable(HrCertificateRequest entity) {
        if (!HrCertificateConstants.EDITABLE_STATUSES.contains(entity.getStatus())) {
            throw new BusinessException("當前狀態不允許該操作");
        }
    }

    private void touch(HrCertificateRequest entity) {
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        // MetaObjectHandler 的 strictUpdateFill 在实体已带非空 updatedAt 时会跳过，需显式刷新
        entity.setUpdatedAt(LocalDateTime.now());
    }

    private String generateReqNo() {
        try {
            return bizSeqService.next(HrCertificateConstants.SEQ_RULE_KEY);
        } catch (Exception e) {
            log.warn("證明申請編號規則不可用，回退時間戳: {}", e.getMessage());
            return "ZM" + LocalDate.now().toString().replace("-", "")
                    + String.format("%04d", (int) (System.nanoTime() % 10000));
        }
    }

    private static String trim(String v) {
        return v == null ? null : v.trim();
    }
}
