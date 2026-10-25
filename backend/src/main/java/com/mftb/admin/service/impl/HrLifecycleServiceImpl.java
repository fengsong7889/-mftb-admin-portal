package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.dto.HrEmployeeBriefVO;
import com.mftb.admin.dto.HrLifecycleRequestSaveDTO;
import com.mftb.admin.dto.HrLifecycleVO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EmpContract;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEffectiveTask;
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
import com.mftb.admin.service.HrEffectiveTaskService;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.HrLifecycleCallbackService;
import com.mftb.admin.service.HrLifecycleService;
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
 * HR 入转调离生命周期单据服务实现。
 * <p>
 * 单据本身承载业务数据与状态机；审批环节委托 OA 引擎（{@link OaRequestService}），
 * formData 携带 bizId/bizFlowNo 双向锚点，审批通过后由 {@code HrLifecycleCallbackServiceImpl}
 * 校验锚点并执行办理动作。每次提交生成新的 OA 流程，旧流程号保留在单据上仅作审计。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrLifecycleServiceImpl implements HrLifecycleService {

    private final HrLifecycleRequestMapper hrLifecycleRequestMapper;
    private final SysUserMapper sysUserMapper;
    private final SysDepartmentMapper sysDepartmentMapper;
    private final SysPositionMapper sysPositionMapper;
    private final EmpPositionRecordMapper empPositionRecordMapper;
    private final EmpContractMapper empContractMapper;
    private final OaRequestService oaRequestService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final HrEffectiveTaskService effectiveTaskService;
    private final HrAssignmentQuery hrAssignmentQuery;
    private final HrLifecycleCallbackService lifecycleCallbackService;

    @Override
    public PageResult<HrLifecycleVO> page(long page, long size, String type, String status, String keyword) {
        if (!HrLifecycleConstants.isValidType(type)) {
            throw new BusinessException("無效的單據類型: " + type);
        }
        requireTypePermission(type, "view");
        LambdaQueryWrapper<HrLifecycleRequest> wrapper = new LambdaQueryWrapper<HrLifecycleRequest>()
                .eq(HrLifecycleRequest::getType, type)
                .orderByDesc(HrLifecycleRequest::getId);
        if (StringUtils.hasText(status)) {
            wrapper.eq(HrLifecycleRequest::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(HrLifecycleRequest::getEmpName, keyword)
                    .or().like(HrLifecycleRequest::getEmpNo, keyword)
                    .or().like(HrLifecycleRequest::getReqNo, keyword)
                    .or().like(HrLifecycleRequest::getFlowNo, keyword));
        }
        Page<HrLifecycleRequest> result = hrLifecycleRequestMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<HrLifecycleVO> records = result.getRecords().stream().map(HrLifecycleVO::from).toList();
        attachTasks(records);
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public List<HrLifecycleVO> listByUser(Long userId, int limit) {
        if (userId == null) {
            return List.of();
        }
        // limit 先夹到 1~100：接口来自页面聚合，不能让它变成全表导出
        int size = Math.min(Math.max(limit, 1), 100);
        List<HrLifecycleRequest> rows = hrLifecycleRequestMapper.selectList(
                new LambdaQueryWrapper<HrLifecycleRequest>()
                        .eq(HrLifecycleRequest::getUserId, userId)
                        .orderByDesc(HrLifecycleRequest::getId)
                        .last("LIMIT " + size));
        List<HrLifecycleVO> records = rows.stream().map(HrLifecycleVO::from).toList();
        attachTasks(records);
        return records;
    }

    /**
     * 批量贴执行状态（一次 IN 查完，不在循环里逐单查）。
     * <p>列表不贴就看不出哪单在「等生效」、哪单「办理失败」，只能一个个点迚详情看。 */
    private void attachTasks(List<HrLifecycleVO> records) {
        if (records.isEmpty()) {
            return;
        }
        Map<Long, HrEffectiveTask> tasks =
                effectiveTaskService.ofRequests(records.stream().map(HrLifecycleVO::getId).toList());
        records.forEach(vo -> vo.attachTask(tasks.get(vo.getId())));
    }

    @Override
    public Map<String, Long> stats(String type) {
        if (!HrLifecycleConstants.isValidType(type)) {
            throw new BusinessException("無效的單據類型: " + type);
        }
        requireTypePermission(type, "view");
        List<HrLifecycleRequest> all = hrLifecycleRequestMapper.selectList(
                new LambdaQueryWrapper<HrLifecycleRequest>()
                        .eq(HrLifecycleRequest::getType, type)
                        .select(HrLifecycleRequest::getStatus));
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("all", (long) all.size());
        for (String status : List.of(HrLifecycleConstants.STATUS_DRAFT, HrLifecycleConstants.STATUS_PENDING,
                HrLifecycleConstants.STATUS_APPROVED, HrLifecycleConstants.STATUS_REJECTED,
                HrLifecycleConstants.STATUS_COMPLETED)) {
            counts.put(status, 0L);
        }
        for (HrLifecycleRequest r : all) {
            counts.merge(r.getStatus(), 1L, Long::sum);
        }
        return counts;
    }

    @Override
    public HrLifecycleVO detail(Long id) {
        HrLifecycleRequest entity = require(id);
        requireTypePermission(entity.getType(), "view");
        HrLifecycleVO vo = HrLifecycleVO.from(entity);
        vo.attachTask(effectiveTaskService.ofRequest(entity.getId()).orElse(null));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLifecycleVO saveDraft(HrLifecycleRequestSaveDTO dto) {
        if (!HrLifecycleConstants.isValidType(dto.getType())) {
            throw new BusinessException("無效的單據類型: " + dto.getType());
        }
        requireTypePermission(dto.getType(), "create");
        HrLifecycleRequest entity = new HrLifecycleRequest();
        entity.setType(dto.getType());
        entity.setStatus(HrLifecycleConstants.STATUS_DRAFT);
        entity.setReqNo(generateReqNo());
        applyDto(entity, dto);
        entity.setCreatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setDeleted(0);
        hrLifecycleRequestMapper.insert(entity);
        return HrLifecycleVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLifecycleVO update(Long id, HrLifecycleRequestSaveDTO dto) {
        HrLifecycleRequest entity = require(id);
        requireEditable(entity);
        requireTypePermission(entity.getType(), "edit");
        // 类型不可变更，按库内类型走各自的字段装配
        applyDto(entity, dto);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        // MetaObjectHandler.strictUpdateFill 在实体已带非空 updatedAt 时会跳过，需显式刷新
        entity.setUpdatedAt(LocalDateTime.now());
        hrLifecycleRequestMapper.updateById(entity);
        return HrLifecycleVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLifecycleVO submit(Long id) {
        HrLifecycleRequest entity = require(id);
        requireEditable(entity);
        requireTypePermission(entity.getType(), "edit");
        validateForSubmit(entity);

        String processCode = HrLifecycleConstants.TYPE_TO_PROCESS_CODE.get(entity.getType());
        Map<String, Object> formData = new HashMap<>();
        formData.put("bizId", entity.getId());
        formData.put("bizType", entity.getType());
        formData.put("empName", entity.getEmpName());

        OaRequestCreateDTO oa = new OaRequestCreateDTO();
        oa.setProcessCode(processCode);
        oa.setTitle(buildFlowTitle(entity));
        oa.setFormData(JsonUtils.toJson(formData));
        String flowNo = oaRequestService.submit(oa);

        entity.setFlowNo(flowNo);
        entity.setStatus(HrLifecycleConstants.STATUS_PENDING);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        // MetaObjectHandler.strictUpdateFill 在实体已带非空 updatedAt 时会跳过，需显式刷新
        entity.setUpdatedAt(LocalDateTime.now());
        hrLifecycleRequestMapper.updateById(entity);
        log.info("HR lifecycle submitted: reqNo={}, type={}, flowNo={}", entity.getReqNo(), entity.getType(), flowNo);
        return HrLifecycleVO.from(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long id) {
        HrLifecycleRequest entity = require(id);
        requireTypePermission(entity.getType(), "edit");
        if (!HrLifecycleConstants.STATUS_PENDING.equals(entity.getStatus())) {
            throw new BusinessException("僅審批中的單據可以撤銷");
        }
        if (!StringUtils.hasText(entity.getFlowNo())) {
            throw new BusinessException("單據未關聯審批流程，無法撤銷");
        }
        // OA 撤销会校验申请人/管理员与节点状态，失败直接抛出
        oaRequestService.cancel(entity.getFlowNo());
        entity.setStatus(HrLifecycleConstants.STATUS_DRAFT);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        // MetaObjectHandler.strictUpdateFill 在实体已带非空 updatedAt 时会跳过，需显式刷新
        entity.setUpdatedAt(LocalDateTime.now());
        hrLifecycleRequestMapper.updateById(entity);
        // 撤销同时作废待生效任务：否则单据回到草稿后到点仍会被定时任务执行，等于绕过审批改人事数据
        effectiveTaskService.cancel(entity.getId(), operatorResolver.currentOperatorName());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrLifecycleVO retryExecution(Long id) {
        HrLifecycleRequest entity = require(id);
        requireTypePermission(entity.getType(), "edit");
        if (!HrLifecycleConstants.STATUS_APPROVED.equals(entity.getStatus())) {
            throw new BusinessException("僅「審批通過待辦理」的單據可以重試");
        }
        HrEffectiveTask task = effectiveTaskService.ofRequest(id).orElse(null);
        if (task != null && HrEffectiveTask.STATUS_PENDING.equals(task.getStatus())
                && task.getEffectiveDate() != null && task.getEffectiveDate().isAfter(LocalDate.now())) {
            throw new BusinessException("尚未到生效日 " + task.getEffectiveDate() + "，不可提前辦理");
        }
        if (!StringUtils.hasText(entity.getFlowNo())) {
            throw new BusinessException("單據未關聯審批流程，無法執行辦理");
        }
        // 复用审批回调入口：到点执行与人工重试走完全相同的代码，不养出第二套办理逻辑
        lifecycleCallbackService.onFlowApproved(entity.getFlowNo());
        HrLifecycleVO vo = HrLifecycleVO.from(require(id));
        vo.attachTask(effectiveTaskService.ofRequest(id).orElse(null));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        HrLifecycleRequest entity = require(id);
        requireEditable(entity);
        requireTypePermission(entity.getType(), "delete");
        hrLifecycleRequestMapper.deleteById(id);
    }

    @Override
    public HrEmployeeBriefVO employeeBrief(Long userId) {
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("所選員工不存在");
        }
        return toBrief(user);
    }

    @Override
    public List<HrEmployeeBriefVO> searchEmployees(String type, String keyword) {
        if (!HrLifecycleConstants.isValidType(type)) {
            throw new BusinessException("無效的單據類型: " + type);
        }
        requireTypePermission(type, "view");
        // 重新入職的候选恰好相反：要的是已离职的人。但**不能拿账号状态当离职依据**——
        // 一来被冻结的在职员工 status 也是 0（混进来会给在职者凭空开一段雇佣），
        // 二来“已离职但账号被重新启用”的人（返聘失败后留启用、或尚未走到停号）用 status=0 根本搜不到。
        // 所以返聘**不加账号状态条件**，只拉宽窗口做粗筛，离职与否全部交给统一的 as-of 口径判定。
        boolean rehiring = HrLifecycleConstants.TYPE_REHIRE.equals(type);
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(!rehiring, SysUser::getStatus, 1)
                // 内置系统管理员不是员工：本查询按 id 倒序取 20 条，而系统账号是最后插入的（id 最大），
                // 不排除会直接占掉入转调离人员搜索的首位
                .ne(SysUser::getUsername, BuiltinAccounts.ADMIN_USERNAME)
                .orderByDesc(SysUser::getId)
                // 离职候选可能远多于在职，多取后过滤再取前 20，避免返聘搜索“搜不到人”
                .last(rehiring ? "LIMIT 100" : "LIMIT 20");
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysUser::getName, keyword)
                    .or().like(SysUser::getEmpId, keyword));
        }
        List<SysUser> users = sysUserMapper.selectList(wrapper);
        if (rehiring) {
            List<Long> ids = users.stream().map(SysUser::getId).toList();
            Map<Long, String> statusById = hrAssignmentQuery.employmentStatusOf(ids, LocalDate.now());
            users = users.stream()
                    .filter(u -> HrAssignmentQuery.STATUS_RESIGNED
                            .equals(statusById.getOrDefault(u.getId(), HrAssignmentQuery.STATUS_ACTIVE)))
                    .limit(20)
                    .toList();
        }
        return users.stream().map(this::toBrief).toList();
    }

    /** 员工实体 → 概要 VO（含最新职务记录的公司/上级/在职状态） */
    private HrEmployeeBriefVO toBrief(SysUser user) {
        HrEmployeeBriefVO vo = new HrEmployeeBriefVO();
        vo.setUserId(user.getId());
        vo.setEmpId(user.getEmpId());
        vo.setName(user.getName());
        vo.setDepartmentId(user.getDepartmentId());
        vo.setDepartment(user.getDepartment());
        vo.setPositionId(user.getPositionId());
        vo.setPosition(user.getPosition());
        vo.setSequence(user.getSequence());
        vo.setJobLevel(user.getJobLevel());
        vo.setRank(user.getRank());
        EmpPositionRecord latest = latestPositionRecord(user.getId());
        if (latest != null) {
            vo.setCompany(latest.getCompany());
            vo.setDirectSuperior(latest.getDirectSuperior());
            vo.setEmploymentStatus(HrLifecycleConstants.OPERATION_DIMISSION.equals(latest.getOperation()) ? "resigned" : "active");
        } else {
            vo.setEmploymentStatus("active");
        }
        return vo;
    }

    // ==================== 内部逻辑 ====================

    /**
     * 按单据类型校验对应 HR 菜单的功能权限（四菜单共享端点, 注解层仅能 anyOf 粗粒度拦截,
     * 类型级细粒度在此兜底）。超管在 hasPermission 内部直通。
     */
    private void requireTypePermission(String type, String action) {
        String menuKey = HrLifecycleConstants.TYPE_TO_MENU_KEY.get(type);
        SysUser user = operatorResolver.currentUser();
        if (menuKey == null || user == null || !permissionService.hasPermission(user, menuKey, action)) {
            throw new PermissionDeniedException(menuKey, action);
        }
    }

    private HrLifecycleRequest require(Long id) {
        HrLifecycleRequest entity = hrLifecycleRequestMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("單據不存在");
        }
        return entity;
    }

    /** 仅草稿/驳回/已撤销回到草稿态可编辑、可提交、可删 */
    private void requireEditable(HrLifecycleRequest entity) {
        String s = entity.getStatus();
        if (!HrLifecycleConstants.STATUS_DRAFT.equals(s)
                && !HrLifecycleConstants.STATUS_REJECTED.equals(s)
                && !HrLifecycleConstants.STATUS_CANCELLED.equals(s)) {
            throw new BusinessException("當前狀態不允許該操作");
        }
    }

    /** 提交前完整性校验（按类型） */
    private void validateForSubmit(HrLifecycleRequest entity) {
        if (!StringUtils.hasText(entity.getEmpName())) {
            throw new BusinessException("姓名不能為空");
        }
        switch (entity.getType()) {
            case HrLifecycleConstants.TYPE_ONBOARD -> {
                if (entity.getEffectiveDate() == null) {
                    throw new BusinessException("入職單需要計劃入職日期");
                }
                if (entity.getDeptId() == null || entity.getPositionId() == null) {
                    throw new BusinessException("入職單需要入職部門與職位");
                }
            }
            case HrLifecycleConstants.TYPE_REGULAR -> {
                if (entity.getUserId() == null) {
                    throw new BusinessException("轉正單需要選擇員工");
                }
                if (entity.getEffectiveDate() == null) {
                    throw new BusinessException("轉正單需要轉正生效日期");
                }
            }
            case HrLifecycleConstants.TYPE_TRANSFER -> {
                if (entity.getUserId() == null) {
                    throw new BusinessException("調動單需要選擇員工");
                }
                if (entity.getNewDeptId() == null && entity.getNewPositionId() == null) {
                    throw new BusinessException("調動單需要調入部門或調入職位");
                }
                if (entity.getEffectiveDate() == null) {
                    throw new BusinessException("調動單需要生效日期");
                }
            }
            case HrLifecycleConstants.TYPE_DIMISSION -> {
                if (entity.getUserId() == null) {
                    throw new BusinessException("離職單需要選擇員工");
                }
                if (entity.getLastWorkDate() == null) {
                    throw new BusinessException("離職單需要最後工作日");
                }
                if (!StringUtils.hasText(entity.getDimissionType())
                        || !HrLifecycleConstants.ALL_DIMISSION_TYPES.contains(entity.getDimissionType())) {
                    throw new BusinessException("離職單需要選擇離職類型");
                }
            }
            case HrLifecycleConstants.TYPE_REHIRE -> {
                if (entity.getUserId() == null) {
                    throw new BusinessException("重新入職單需要選擇已離職員工");
                }
                if (entity.getEffectiveDate() == null) {
                    throw new BusinessException("重新入職單需要復職生效日期");
                }
                if (entity.getNewDeptId() == null && entity.getNewPositionId() == null) {
                    throw new BusinessException("重新入職單需要入職部門或職位");
                }
            }
            case HrLifecycleConstants.TYPE_RENEW -> {
                if (entity.getContractId() == null) {
                    throw new BusinessException("續簽單需要選擇原合同");
                }
                if (entity.getNewContractEndDate() == null) {
                    throw new BusinessException("續簽單需要新合同結束日期");
                }
                if (entity.getNewContractStartDate() != null
                        && entity.getNewContractEndDate().isBefore(entity.getNewContractStartDate())) {
                    throw new BusinessException("新合同結束日期不能早於開始日期");
                }
                EmpContract origin = empContractMapper.selectById(entity.getContractId());
                if (origin == null) {
                    throw new BusinessException("原合同不存在");
                }
                if (HrLifecycleConstants.CONTRACT_STATUS_TERMINATED.equals(origin.getStatus())) {
                    throw new BusinessException("原合同已終止，無需續簽");
                }
            }
            default -> throw new BusinessException("無效的單據類型: " + entity.getType());
        }
    }

    /** 将 DTO 装配到实体，并补齐部门/职位/员工名称快照 */
    private void applyDto(HrLifecycleRequest entity, HrLifecycleRequestSaveDTO dto) {
        entity.setUserId(dto.getUserId());
        entity.setEmpName(dto.getEmpName());
        entity.setDeptId(dto.getDeptId());
        entity.setPositionId(dto.getPositionId());
        entity.setEffectiveDate(dto.getEffectiveDate());
        entity.setReason(dto.getReason());
        entity.setOfferDate(dto.getOfferDate());
        entity.setProbationMonths(dto.getProbationMonths());
        entity.setExpectedRegularDate(dto.getExpectedRegularDate());
        entity.setIdCardNo(dto.getIdCardNo());
        entity.setMobile(dto.getMobile());
        entity.setEmail(dto.getEmail());
        entity.setCandidateInfo(dto.getCandidateInfo());
        entity.setNewDeptId(dto.getNewDeptId());
        entity.setNewPositionId(dto.getNewPositionId());
        entity.setNewCompany(dto.getNewCompany());
        entity.setNewSuperior(dto.getNewSuperior());
        entity.setDimissionType(dto.getDimissionType());
        entity.setLastWorkDate(dto.getLastWorkDate());
        entity.setSettlementInfo(dto.getSettlementInfo());
        entity.setRemark(dto.getRemark());
        applyContractRenewFields(entity, dto);

        // 员工工号快照（转正/调动/离职选择员工后随 userId 带出）
        if (dto.getUserId() != null) {
            SysUser user = sysUserMapper.selectById(dto.getUserId());
            if (user == null) {
                throw new BusinessException("所選員工不存在");
            }
            entity.setEmpNo(user.getEmpId());
            if (!StringUtils.hasText(dto.getEmpName())) {
                entity.setEmpName(user.getName());
            }
        }

        // 名称快照
        entity.setDeptName(resolveDeptName(dto.getDeptId()));
        entity.setPositionName(resolvePositionName(dto.getPositionId()));
        entity.setNewDeptName(resolveDeptName(dto.getNewDeptId()));
        entity.setNewPositionName(resolvePositionName(dto.getNewPositionId()));

        // 调动/转正/离职：调动前快照与目标部门默认取员工当前任职信息
        if (dto.getUserId() != null) {
            SysUser user = sysUserMapper.selectById(dto.getUserId());
            if (user != null) {
                entity.setOldDeptName(user.getDepartment());
                entity.setOldPositionName(user.getPosition());
                if (entity.getDeptId() == null) {
                    entity.setDeptId(user.getDepartmentId());
                    entity.setDeptName(user.getDepartment());
                }
                if (entity.getPositionId() == null) {
                    entity.setPositionId(user.getPositionId());
                    entity.setPositionName(user.getPosition());
                }
            }
        }
    }

    /**
     * 合同续签单据装配：由原合同带出员工/部门/职位快照，新合同类型与主体默认继承原合同，
     * 开始日期默认取原合同结束日次日，生效日期跟随新合同开始日。
     */
    private void applyContractRenewFields(HrLifecycleRequest entity, HrLifecycleRequestSaveDTO dto) {
        entity.setContractId(dto.getContractId());
        entity.setNewContractNo(StringUtils.hasText(dto.getNewContractNo()) ? dto.getNewContractNo().trim() : null);
        entity.setNewContractType(dto.getNewContractType());
        entity.setNewContractCompany(dto.getNewContractCompany());
        entity.setNewContractStartDate(dto.getNewContractStartDate());
        entity.setNewContractEndDate(dto.getNewContractEndDate());
        if (dto.getContractId() == null) {
            entity.setContractNo(null);
            return;
        }
        EmpContract origin = empContractMapper.selectById(dto.getContractId());
        if (origin == null) {
            throw new BusinessException("原合同不存在");
        }
        entity.setContractNo(origin.getContractNo());
        entity.setUserId(origin.getUserId());
        SysUser user = sysUserMapper.selectById(origin.getUserId());
        if (user != null) {
            entity.setEmpNo(user.getEmpId());
            if (!StringUtils.hasText(entity.getEmpName())) {
                entity.setEmpName(user.getName());
            }
            if (entity.getDeptId() == null) {
                entity.setDeptId(user.getDepartmentId());
                entity.setDeptName(user.getDepartment());
            }
            if (entity.getPositionId() == null) {
                entity.setPositionId(user.getPositionId());
                entity.setPositionName(user.getPosition());
            }
        }
        if (!StringUtils.hasText(entity.getNewContractType())) {
            entity.setNewContractType(origin.getContractType());
        }
        if (!StringUtils.hasText(entity.getNewContractCompany())) {
            entity.setNewContractCompany(origin.getCompany());
        }
        if (entity.getNewContractStartDate() == null && origin.getEndDate() != null) {
            entity.setNewContractStartDate(origin.getEndDate().plusDays(1));
        }
        if (entity.getEffectiveDate() == null) {
            entity.setEffectiveDate(entity.getNewContractStartDate());
        }
    }

    private String resolveDeptName(Long deptId) {
        if (deptId == null) {
            return null;
        }
        SysDepartment dept = sysDepartmentMapper.selectById(deptId);
        if (dept == null) {
            throw new BusinessException("所選部門不存在");
        }
        return dept.getName();
    }

    private String resolvePositionName(Long positionId) {
        if (positionId == null) {
            return null;
        }
        SysPosition position = sysPositionMapper.selectById(positionId);
        if (position == null) {
            throw new BusinessException("所選職位不存在");
        }
        return position.getName();
    }

    private EmpPositionRecord latestPositionRecord(Long userId) {
        return empPositionRecordMapper.selectOne(
                new LambdaQueryWrapper<EmpPositionRecord>()
                        .eq(EmpPositionRecord::getUserId, userId)
                        .orderByDesc(EmpPositionRecord::getEffectiveSeq)
                        .last("LIMIT 1"));
    }

    /** 单据编号：RS + YYYYMMDD + 4位自增；规则缺失时退回日期+ID风格兜底（由办理保存时兜底） */
    private String generateReqNo() {
        try {
            return bizSeqService.next(HrLifecycleConstants.SEQ_RULE_KEY);
        } catch (Exception e) {
            log.warn("HR lifecycle seq rule unavailable, fallback to timestamp code: {}", e.getMessage());
            return "RS" + LocalDate.now().toString().replace("-", "")
                    + String.format("%04d", (int) (System.nanoTime() % 10000));
        }
    }

    /** OA 流程标题：类型中文名 + 员工姓名 */
    private String buildFlowTitle(HrLifecycleRequest entity) {
        String typeLabel = switch (entity.getType()) {
            case HrLifecycleConstants.TYPE_ONBOARD -> "入職";
            case HrLifecycleConstants.TYPE_REGULAR -> "轉正";
            case HrLifecycleConstants.TYPE_TRANSFER -> "調動";
            case HrLifecycleConstants.TYPE_DIMISSION -> "離職";
            case HrLifecycleConstants.TYPE_RENEW -> "合同續簽";
            case HrLifecycleConstants.TYPE_REHIRE -> "重新入職";
            default -> "人事";
        };
        return typeLabel + "手續-" + entity.getEmpName() + "(" + entity.getReqNo() + ")";
    }
}
