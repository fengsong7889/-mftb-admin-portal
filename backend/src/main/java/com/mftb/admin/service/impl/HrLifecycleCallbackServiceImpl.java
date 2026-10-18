package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.entity.EmpContract;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrLifecycleRequest;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysPosition;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EmpContractMapper;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.HrLifecycleRequestMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEffectiveTaskService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrMasterDataResolver;
import com.mftb.admin.service.HrOffboardingTaskService;
import com.mftb.admin.service.HrLifecycleCallbackService;
import com.mftb.admin.util.ConvertUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 入转调离审批回调实现。
 * <p>
 * 独立事务（REQUIRES_NEW）：办理动作失败只回滚本回调，不影响 OA 流程状态落库，
 * 失败信息写入单据 remark 供 HR 排查；OA 侧调用方 catch 后记录 error 日志。
 * <p>
 * <b>生效日口径</b>（方案 §7.2）：审批通过不等于生效。生效日晚于今天时，单据停在
 * {@code approved}（待生效）并登记一条 {@code hr_effective_task}，由定时任务到点回调本类
 * 的同一个入口执行；否则会把「下周一离职」的人今天就读成已离职、今天就把账号停掉。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrLifecycleCallbackServiceImpl implements HrLifecycleCallbackService {

    private final HrLifecycleRequestMapper hrLifecycleRequestMapper;
    private final SysUserMapper sysUserMapper;
    private final SysDepartmentMapper sysDepartmentMapper;
    private final SysPositionMapper sysPositionMapper;
    private final EmpPositionRecordMapper empPositionRecordMapper;
    private final EmpContractMapper empContractMapper;
    private final EmployeeService employeeService;
    private final OperatorResolver operatorResolver;
    private final HrEffectiveTaskService effectiveTaskService;
    private final HrMasterDataResolver masterDataResolver;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final HrAuditService hrAuditService;
    private final HrOffboardingTaskService offboardingTaskService;
    private final com.mftb.admin.service.HrAssignmentQuery hrAssignmentQuery;

    @Override
    public boolean isHrLifecycleProcess(String processCode) {
        return processCode != null && HrLifecycleConstants.PROCESS_CODE_TO_TYPE.containsKey(processCode);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void onFlowApproved(String flowNo) {
        HrLifecycleRequest req = findByFlowNo(flowNo);
        if (req == null) {
            log.warn("HR lifecycle callback: flow not bound to any request, flowNo={}", flowNo);
            return;
        }
        // 幂等：已完成跳过；approved 为上次办理失败的待重试态，允许重入
        if (HrLifecycleConstants.STATUS_COMPLETED.equals(req.getStatus())) {
            log.info("HR lifecycle callback skipped (already completed): reqNo={}", req.getReqNo());
            return;
        }
        if (HrLifecycleConstants.STATUS_APPROVED.equals(req.getStatus())
                && req.getRemark() != null && req.getRemark().contains("辦理完成")) {
            log.info("HR lifecycle callback skipped (applied but not marked): reqNo={}", req.getReqNo());
            req.setStatus(HrLifecycleConstants.STATUS_COMPLETED);
            req.setUpdatedAt(LocalDateTime.now());
            hrLifecycleRequestMapper.updateById(req);
            return;
        }
        req.setStatus(HrLifecycleConstants.STATUS_APPROVED);
        req.setUpdatedAt(LocalDateTime.now());
        hrLifecycleRequestMapper.updateById(req);

        // 待生效：审批通过但生效日未到，只登记任务，绝不提前改写任职投影与账号状态。
        LocalDate today = LocalDate.now();
        LocalDate effective = effectiveDateOf(req);
        if (effective != null && effective.isAfter(today)) {
            effectiveTaskService.schedule(req, effective, operatorResolver.currentOperatorName());
            req.setRemark(trimRemark("審批通過，待生效日期 " + effective + " 自動辦理"));
            req.setUpdatedAt(LocalDateTime.now());
            hrLifecycleRequestMapper.updateById(req);
            log.info("HR lifecycle approved and scheduled: reqNo={}, type={}, effectiveDate={}",
                    req.getReqNo(), req.getType(), effective);
            return;
        }

        try {
            executeApply(req);
        } catch (Exception e) {
            // 办理失败：单据停在 approved 并记录原因，不阻断审批流转；
            // 同时把任务落成 FAILED，否则“办理失败”只存在 remark 里，没人看得见也没法重试。
            req.setRemark(trimRemark("辦理失敗: " + e.getMessage()));
            req.setUpdatedBy(operatorResolver.currentOperatorName());
            req.setUpdatedAt(LocalDateTime.now());
            hrLifecycleRequestMapper.updateById(req);
            effectiveTaskService.markFailed(req.getId(), req, e.getMessage(), operatorResolver.currentOperatorName());
            log.error("HR lifecycle apply failed: reqNo={}, type={}, error={}", req.getReqNo(), req.getType(), e.getMessage(), e);
            throw e;
        }

        req.setStatus(HrLifecycleConstants.STATUS_COMPLETED);
        req.setUpdatedBy(operatorResolver.currentOperatorName());
        // MetaObjectHandler.strictUpdateFill 在实体已带非空 updatedAt 时会跳过，需显式刷新
        req.setUpdatedAt(LocalDateTime.now());
        hrLifecycleRequestMapper.updateById(req);
        effectiveTaskService.markDone(req.getId(), operatorResolver.currentOperatorName());
        log.info("HR lifecycle completed: reqNo={}, type={}, flowNo={}", req.getReqNo(), req.getType(), flowNo);
    }

    /** 按单据类型分发办理动作（回调与到点定时任务共用同一入口，保证两条路径结果一致） */
    private void executeApply(HrLifecycleRequest req) {
        switch (req.getType()) {
            case HrLifecycleConstants.TYPE_ONBOARD -> applyOnboard(req);
            case HrLifecycleConstants.TYPE_REGULAR -> applyRegular(req);
            case HrLifecycleConstants.TYPE_TRANSFER -> applyTransfer(req);
            case HrLifecycleConstants.TYPE_DIMISSION -> applyDimission(req);
            case HrLifecycleConstants.TYPE_REHIRE -> applyRehire(req);
            case HrLifecycleConstants.TYPE_RENEW -> applyRenew(req);
            default -> throw new BusinessException("無效的單據類型: " + req.getType());
        }
    }

    /**
     * 该单据的生效日。
     * <p>离职取「最后在职日」（账号也在那天之后才停），续签取新合同开始日，
     * 其余取单据生效日；都没填时返回 null 表示「立即办理」，保持旧行为不变成永久待生效。
     */
    private LocalDate effectiveDateOf(HrLifecycleRequest req) {
        if (HrLifecycleConstants.TYPE_DIMISSION.equals(req.getType()) && req.getLastWorkDate() != null) {
            return req.getLastWorkDate();
        }
        if (HrLifecycleConstants.TYPE_RENEW.equals(req.getType())) {
            return req.getNewContractStartDate();
        }
        return req.getEffectiveDate();
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void onFlowRejected(String flowNo) {
        HrLifecycleRequest req = findByFlowNo(flowNo);
        if (req == null) {
            return;
        }
        if (!HrLifecycleConstants.STATUS_PENDING.equals(req.getStatus())) {
            log.info("HR lifecycle reject callback skipped (status={}): reqNo={}", req.getStatus(), req.getReqNo());
            return;
        }
        req.setStatus(HrLifecycleConstants.STATUS_REJECTED);
        req.setUpdatedBy(operatorResolver.currentOperatorName());
        // MetaObjectHandler.strictUpdateFill 在实体已带非空 updatedAt 时会跳过，需显式刷新
        req.setUpdatedAt(LocalDateTime.now());
        hrLifecycleRequestMapper.updateById(req);
        // 驳回同时作废待生效任务：已驳回的单据到点仍改任职事实，是比不执行更糟的错账
        effectiveTaskService.cancel(req.getId(), operatorResolver.currentOperatorName());
        log.info("HR lifecycle rejected, back to editable: reqNo={}, flowNo={}", req.getReqNo(), flowNo);
    }

    // ==================== 各类型办理动作 ====================

    /** 入职：创建员工账号（自动写「入职」职务记录 + 默认角色），回填 userId/empNo */
    private void applyOnboard(HrLifecycleRequest req) {
        // 证件重复校验：同号证件已有在册账号则拒绝办理
        if (StringUtils.hasText(req.getIdCardNo())) {
            Long dup = sysUserMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getIdNumber, req.getIdCardNo()));
            if (dup != null && dup > 0) {
                throw new BusinessException("證件號碼已存在在册員工，無法重複入職");
            }
        }

        Map<String, Object> candidate = JsonUtils.parseMap(req.getCandidateInfo());
        String company = ConvertUtils.str(candidate, "company");

        EmployeeRequest er = new EmployeeRequest();
        er.setName(req.getEmpName());
        er.setDepartmentId(req.getDeptId());
        er.setPositionId(req.getPositionId());
        er.setCompany(StringUtils.hasText(company) ? company : req.getNewCompany());
        // 初始登录密码 = MF + 单据编号后4位，HR 可在员工管理重置
        String password = HrLifecycleConstants.DEFAULT_PASSWORD_PREFIX
                + tail4(req.getReqNo());
        er.setPassword(password);
        EmployeeVO created = employeeService.create(er);

        // 基础信息回填（证件/通讯 + 候选人资料中的可选字段）
        BasicInfoRequest basic = new BasicInfoRequest();
        basic.setIdType(StringUtils.hasText(ConvertUtils.str(candidate, "idType"))
                ? ConvertUtils.str(candidate, "idType") : "身份证");
        basic.setIdNumber(req.getIdCardNo());
        basic.setMobile(req.getMobile());
        basic.setEmail(req.getEmail());
        basic.setGender(ConvertUtils.str(candidate, "gender"));
        basic.setBirthDate(parseDate(candidate.get("birthDate")));
        basic.setNativePlace(ConvertUtils.str(candidate, "nativePlace"));
        basic.setAddressDetail(ConvertUtils.str(candidate, "address"));
        employeeService.saveBasicInfo(created.getId(), basic);

        req.setUserId(created.getId());
        req.setEmpNo(created.getEmpId());
        req.setRemark(trimRemark("入職辦理完成，工號 " + created.getEmpId() + "，初始密碼 MF+單據號後4位"));
        log.info("HR onboard applied: reqNo={}, empId={}, userId={}", req.getReqNo(), created.getEmpId(), created.getId());
    }

    /** 转正规避：按最新职务记录复制任职信息，追加一条「转正」记录（库内存简体 operation） */
    private void applyRegular(HrLifecycleRequest req) {
        SysUser user = requireUser(req);
        EmpPositionRecord latest = latestPositionRecord(user.getId());
        EmpPositionRecord record = latest != null ? copyAppointment(latest) : new EmpPositionRecord();
        record.setUserId(user.getId());
        record.setEffectiveDate(req.getEffectiveDate() != null ? req.getEffectiveDate() : LocalDate.now());
        record.setEffectiveSeq(nextSeq(user.getId()));
        record.setOperation(HrLifecycleConstants.OPERATION_REGULAR);
        record.setOperationCode(HrOperationCode.REGULAR);
        record.setReason(req.getReason());
        record.setCreatedBy(operatorResolver.currentOperatorName());
        record.setUpdatedBy(operatorResolver.currentOperatorName());
        record.setDeleted(0);
        writePositionRecord(record, req.getReqNo());
        req.setEmpNo(user.getEmpId());
        req.setRemark(trimRemark("轉正辦理完成，生效日期 " + record.getEffectiveDate()));
    }

    /** 调动：更新 sys_user 部门/职位快照，追加一条「調動」职务记录 */
    private void applyTransfer(HrLifecycleRequest req) {
        SysUser user = requireUser(req);
        applyTargetAssignment(user, req);
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);

        EmpPositionRecord latest = latestPositionRecord(user.getId());
        EmpPositionRecord record = latest != null ? copyAppointment(latest) : new EmpPositionRecord();
        record.setUserId(user.getId());
        record.setEffectiveDate(req.getEffectiveDate() != null ? req.getEffectiveDate() : LocalDate.now());
        record.setEffectiveSeq(nextSeq(user.getId()));
        record.setOperation(HrLifecycleConstants.OPERATION_TRANSFER);
        record.setOperationCode(HrOperationCode.TRANSFER);
        record.setReason(req.getReason());
        record.setServiceDept(user.getDepartment());
        record.setSequenceType(user.getSequence());
        record.setPositionLevel(user.getJobLevel());
        record.setRankCode(user.getRank());
        record.setPositionName(user.getPosition());
        if (StringUtils.hasText(req.getNewCompany())) {
            record.setCompany(req.getNewCompany());
        }
        if (StringUtils.hasText(req.getNewSuperior())) {
            record.setDirectSuperior(req.getNewSuperior());
        }
        record.setCreatedBy(operatorResolver.currentOperatorName());
        record.setUpdatedBy(operatorResolver.currentOperatorName());
        record.setDeleted(0);
        writePositionRecord(record, req.getReqNo());

        req.setEmpNo(user.getEmpId());
        req.setRemark(trimRemark("調動辦理完成：" + req.getOldDeptName() + " → " + user.getDepartment()
                + " / " + user.getPosition()));
    }

    /** 离职：写「離職」职务记录（员工在职状态由职务记录派生），并停用登录账号 */
    private void applyDimission(HrLifecycleRequest req) {
        SysUser user = requireUser(req);
        EmpPositionRecord latest = latestPositionRecord(user.getId());
        EmpPositionRecord record = latest != null ? copyAppointment(latest) : new EmpPositionRecord();
        record.setUserId(user.getId());
        record.setEffectiveDate(req.getLastWorkDate() != null ? req.getLastWorkDate() : LocalDate.now());
        record.setEffectiveSeq(nextSeq(user.getId()));
        record.setOperation(HrLifecycleConstants.OPERATION_DIMISSION);
        record.setOperationCode(HrOperationCode.DIMISSION);
        record.setReason(req.getReason());
        record.setCreatedBy(operatorResolver.currentOperatorName());
        record.setUpdatedBy(operatorResolver.currentOperatorName());
        record.setDeleted(0);
        writePositionRecord(record, req.getReqNo());

        // 停用账号（禁止登录）；离职态由「离职」职务记录派生（EmployeeServiceImpl 比较简体）
        employeeService.updateStatus(user.getId(), 0);

        // 跨模块联动与离职事实同事务登记（方案 §7.4）：资产交接与待办改派不能在这里同步做完——
        // 接收人常常还没定，EAM 也可能拒登记，把它们做成任务才能追踪与重试。
        offboardingTaskService.scheduleForDimission(req, record.getEffectiveDate(),
                operatorResolver.currentOperatorName());

        req.setEmpNo(user.getEmpId());
        req.setRemark(trimRemark("離職辦理完成，最後工作日 " + record.getEffectiveDate() + "，賬號已停用"));
    }

    /**
     * 把单据上的「调入部门/调入职位」写到员工投影上（异动与复职共用）。
     * <p>抽成一个方法而不是抄一份：调动与重新入职都要做同一件事，两处写必然漂移
     * （职位带的序列/职级/职等漏一个，列表与异动记录就对不上）。
     */
    private void applyTargetAssignment(SysUser user, HrLifecycleRequest req) {
        if (req.getNewDeptId() != null) {
            SysDepartment dept = sysDepartmentMapper.selectById(req.getNewDeptId());
            if (dept == null) {
                throw new BusinessException("調入部門不存在");
            }
            user.setDepartmentId(dept.getId());
            user.setDepartment(dept.getName());
            user.setDepartmentEn(dept.getNameEn());
        }
        if (req.getNewPositionId() != null) {
            SysPosition position = sysPositionMapper.selectById(req.getNewPositionId());
            if (position == null) {
                throw new BusinessException("調入職位不存在");
            }
            user.setPositionId(position.getId());
            user.setPosition(position.getName());
            user.setPositionEn(position.getNameEn());
            user.setSequence(position.getSequence());
            user.setJobLevel(position.getJobLevel());
            user.setRank(position.getRank());
        }
    }

    /**
     * 重新入职：复用离职员工的**同一个账号**（不新建人），写 REHIRE 异动并重新启用。
     * <p>三条口径：
     * <ol>
     *   <li>是否真离职走统一 as-of 口径，不看账号状态也不看「最新一条记录」——
     *       后者会被一张未来生效的离职单骗到，把还在职的人再开一段雇佣。</li>
     *   <li>不新建账号：工号/历史单据/资产归属/授权记录全部挂在原 userId 上，
     *       重新建号会把同一个人拆成两份档案（P4 雇佣期间的「一人多段」就是为这个而存在的）。</li>
     *   <li>复职必须强制改密：离职期间密码可能被任何人留存，沿用旧密码等于把账号默认交还。</li>
     * </ol>
     */
    private void applyRehire(HrLifecycleRequest req) {
        SysUser user = requireUser(req);
        if (!hrAssignmentQuery.isResignedAt(user.getId(), LocalDate.now())) {
            throw new BusinessException("所選員工當前並非離職狀態，無需重新入職");
        }
        applyTargetAssignment(user, req);
        user.setUpdatedBy(operatorResolver.currentOperatorName());
        sysUserMapper.updateById(user);

        EmpPositionRecord latest = latestPositionRecord(user.getId());
        EmpPositionRecord record = latest != null ? copyAppointment(latest) : new EmpPositionRecord();
        record.setUserId(user.getId());
        record.setEffectiveDate(req.getEffectiveDate());
        record.setEffectiveSeq(nextSeq(user.getId()));
        // code 与名称同时写：派生雇佣新段只看 code（方案 §5.3）
        record.setOperation(HrOperationCode.CODE_TO_NAME.get(HrOperationCode.REHIRE));
        record.setOperationCode(HrOperationCode.REHIRE);
        record.setReason(req.getReason());
        record.setServiceDept(user.getDepartment());
        record.setSequenceType(user.getSequence());
        record.setPositionLevel(user.getJobLevel());
        record.setRankCode(user.getRank());
        record.setPositionName(user.getPosition());
        if (StringUtils.hasText(req.getNewCompany())) {
            record.setCompany(req.getNewCompany());
        }
        if (StringUtils.hasText(req.getNewSuperior())) {
            record.setDirectSuperior(req.getNewSuperior());
        }
        record.setCreatedBy(operatorResolver.currentOperatorName());
        record.setUpdatedBy(operatorResolver.currentOperatorName());
        record.setDeleted(0);
        writePositionRecord(record, req.getReqNo());

        // 启用账号（含强制首次改密）；雇佣期间由 writePositionRecord 里的 sync 自动开出新一段
        employeeService.reactivate(user.getId());

        req.setEmpNo(user.getEmpId());
        req.setRemark(trimRemark("重新入職辦理完成，復職日期 " + record.getEffectiveDate()
                + "，賬號已重新啟用且首次登錄必須改密"));
    }

    /**
     * 合同续签：审批通过后写入新合同（生效中），并把原合同置「已终止」。
     * 新合同编号为空时按「原编号-R{序号}」派生；开始日期为空时取原合同结束日次日。
     */
    private void applyRenew(HrLifecycleRequest req) {
        if (req.getContractId() == null) {
            throw new BusinessException("單據未關聯原合同，無法續簽");
        }
        if (req.getNewContractEndDate() == null) {
            throw new BusinessException("續簽單缺少新合同結束日期");
        }
        EmpContract origin = empContractMapper.selectById(req.getContractId());
        if (origin == null) {
            throw new BusinessException("原合同不存在");
        }
        if (HrLifecycleConstants.CONTRACT_STATUS_TERMINATED.equals(origin.getStatus())) {
            throw new BusinessException("原合同已終止，無需續簽");
        }
        LocalDate startDate = req.getNewContractStartDate() != null
                ? req.getNewContractStartDate()
                : (origin.getEndDate() != null ? origin.getEndDate().plusDays(1) : LocalDate.now());
        if (req.getNewContractEndDate().isBefore(startDate)) {
            throw new BusinessException("新合同結束日期早於開始日期");
        }

        String operator = operatorResolver.currentOperatorName();
        EmpContract renewed = new EmpContract();
        renewed.setUserId(origin.getUserId());
        renewed.setContractNo(StringUtils.hasText(req.getNewContractNo())
                ? req.getNewContractNo().trim()
                : nextContractNo(origin.getContractNo(), origin.getUserId()));
        renewed.setContractType(StringUtils.hasText(req.getNewContractType())
                ? req.getNewContractType() : origin.getContractType());
        renewed.setCompany(StringUtils.hasText(req.getNewContractCompany())
                ? req.getNewContractCompany() : origin.getCompany());
        renewed.setStartDate(startDate);
        renewed.setEndDate(req.getNewContractEndDate());
        renewed.setSignDate(LocalDate.now());
        renewed.setStatus(HrLifecycleConstants.CONTRACT_STATUS_ACTIVE);
        renewed.setRemark("由續簽單據 " + req.getReqNo() + " 審批通過自動創建");
        renewed.setCreatedBy(operator);
        renewed.setUpdatedBy(operator);
        renewed.setDeleted(0);
        empContractMapper.insert(renewed);

        // 原合同终止（保留历史可追溯，不物理删除）
        origin.setStatus(HrLifecycleConstants.CONTRACT_STATUS_TERMINATED);
        origin.setUpdatedBy(operator);
        empContractMapper.updateById(origin);

        req.setRemark(trimRemark("續簽辦理完成：新合同 " + renewed.getContractNo()
                + "（" + renewed.getStartDate() + " ~ " + renewed.getEndDate() + "），原合同 "
                + origin.getContractNo() + " 已終止"));
        log.info("HR renew applied: reqNo={}, oldContract={}, newContract={}",
                req.getReqNo(), origin.getContractNo(), renewed.getContractNo());
    }

    /** 新合同编号派生：原编号-R{该员工合同数+1}（如 HT2024-001 → HT2024-001-R2） */
    private String nextContractNo(String originNo, Long userId) {
        Long existing = empContractMapper.selectCount(new LambdaQueryWrapper<EmpContract>()
                .eq(EmpContract::getUserId, userId));
        int seq = (existing == null ? 0 : existing.intValue()) + 1;
        String base = StringUtils.hasText(originNo) ? originNo.trim() : "HT";
        // 已带 -R{n} 后缀的原编号（多次续签）先剥掉，避免出现 -R2-R3
        int idx = base.lastIndexOf("-R");
        if (idx > 0 && base.substring(idx + 2).chars().allMatch(Character::isDigit)) {
            base = base.substring(0, idx);
        }
        return base + "-R" + seq;
    }

    // ==================== 工具方法 ====================

    /** 按流程号定位单据：flowNo 必须与单据当前记录的流程号一致（旧流程回调直接跳过） */
    private HrLifecycleRequest findByFlowNo(String flowNo) {
        List<HrLifecycleRequest> list = hrLifecycleRequestMapper.selectList(
                new LambdaQueryWrapper<HrLifecycleRequest>()
                        .eq(HrLifecycleRequest::getFlowNo, flowNo));
        return list.isEmpty() ? null : list.get(0);
    }

    private SysUser requireUser(HrLifecycleRequest req) {
        if (req.getUserId() == null) {
            throw new BusinessException("單據未綁定員工，無法辦理");
        }
        SysUser user = sysUserMapper.selectById(req.getUserId());
        if (user == null) {
            throw new BusinessException("關聯員工不存在");
        }
        return user;
    }

    /**
     * 任职记录写入的统一收口：先按名称解析稳定 ID（必须在落库前），落库后同步雇佣期间并记审计。
     * <p>审批回调是人事事实最重要的写入源，漏了这一步，新表就永远只有手工录入那一份数据。
     * 审计带上来源单号：「这份异动是哪张单子批出来的」必须能反查（方案 §7.4）。
     */
    private void writePositionRecord(EmpPositionRecord record, String sourceReqNo) {
        masterDataResolver.applyStableIds(record);
        empPositionRecordMapper.insert(record);
        employmentPeriodService.syncFromRecords(record.getUserId(), operatorResolver.currentOperatorName());
        hrAuditService.record(HrAuditEntry.of(HrAuditAction.POSITION_WRITE, record.getUserId())
                .detail("单据办理写入异动 " + record.getOperationCode() + " @ " + record.getEffectiveDate())
                .reason(record.getReason())
                .sourceReqNo(sourceReqNo)
                .effectiveDate(record.getEffectiveDate()));
    }

    private EmpPositionRecord latestPositionRecord(Long userId) {
        return empPositionRecordMapper.selectOne(
                new LambdaQueryWrapper<EmpPositionRecord>()
                        .eq(EmpPositionRecord::getUserId, userId)
                        // 先按生效日再按同日序号：跨日期只比 effectiveSeq 会挑中旧记录
                        //（序号只在同一天内递增，方案 §3.2 「错误派生」那一行）
                        .orderByDesc(EmpPositionRecord::getEffectiveDate)
                        .orderByDesc(EmpPositionRecord::getEffectiveSeq)
                        .last("LIMIT 1"));
    }

    private Integer nextSeq(Long userId) {
        EmpPositionRecord latest = latestPositionRecord(userId);
        return latest == null || latest.getEffectiveSeq() == null ? 0 : latest.getEffectiveSeq() + 1;
    }

    /** 复制最新职务记录的任职/工作信息（不含变动信息与审计字段） */
    private EmpPositionRecord copyAppointment(EmpPositionRecord src) {
        EmpPositionRecord r = new EmpPositionRecord();
        r.setServiceDept(src.getServiceDept());
        r.setSequenceType(src.getSequenceType());
        r.setPositionLevel(src.getPositionLevel());
        r.setRankCode(src.getRankCode());
        r.setCompany(src.getCompany());
        r.setEmployeeCategory(src.getEmployeeCategory());
        r.setWorkSystem(src.getWorkSystem());
        r.setPositionName(src.getPositionName());
        r.setDirectSuperior(src.getDirectSuperior());
        r.setMentor(src.getMentor());
        r.setWorkCountry(src.getWorkCountry());
        r.setWorkCity(src.getWorkCity());
        r.setOfficeAddress(src.getOfficeAddress());
        r.setContractLocation(src.getContractLocation());
        return r;
    }

    private LocalDate parseDate(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    private String tail4(String text) {
        if (text == null) {
            return "0000";
        }
        return text.length() <= 4 ? text : text.substring(text.length() - 4);
    }

    private String trimRemark(String remark) {
        return remark != null && remark.length() > 500 ? remark.substring(0, 500) : remark;
    }
}
