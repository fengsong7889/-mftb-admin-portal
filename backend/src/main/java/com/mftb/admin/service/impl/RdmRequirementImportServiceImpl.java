package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmRequirementImportDTO;
import com.mftb.admin.dto.RdmRequirementImportVO;
import com.mftb.admin.entity.RdmIteration;
import com.mftb.admin.entity.RdmPrd;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmStatusLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmPrdMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmRequirementImportService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 存量需求导入实现（云效迁移）。
 *
 * <p><b>为什么先全量校验再写入</b>：导入是低频、成批的写操作。边校验边写会在第 N 行失败时
 * 留下半批数据，用户既不知道哪几条进了库，也无法简单重跑（部分云效编号已存在）。
 * 因此本实现把「解析/校验」和「落库」严格分开：只有全部行可导入时才进入写事务。
 *
 * <p><b>为什么固定 flow_version=1</b>：导入的是系统启用前就存在的历史需求，本来就没有
 * 五节点计划、PRD 定稿快照与工时明细。标成新链路会让发布闸门把它们全判为「未做验收准备」，
 * 与真实质量无关（与 RdmRequirementServiceImpl.create 的存量口径一致）。
 *
 * <p><b>为什么必须发正式需求号</b>：rdm_requirement 上有 CHECK 约束
 * {@code ck_rdm_req_no_admitted}：不在可空集合里的状态必须有 req_no。导入行天然已准入，
 * 所以逐行走 BizSeqService 发号；云效编号只进 external_no，不冒充正式号。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmRequirementImportServiceImpl implements RdmRequirementImportService {

    /** 单次导入上限：与前端模板预置的 500 行下拉对齐，防止一次请求撑爆事务 */
    private static final int MAX_ROWS = 500;

    private static final String SOURCE_YUNXIAO = "YUNXIAO";
    private static final String IMPORT_ACTION = "import";
    private static final String IMPORT_OPERATOR_ROLE = "IMPORT";
    private static final String PRD_SEQ_RULE = "rdm_prd";
    /** PRD 正文按段落拼接，单段上限与需求描述一致 */
    private static final int MAX_DESCRIPTION = 20000;

    /** 「姓名(工号)」：中英文括号都接受，工号为字母数字 */
    private static final Pattern USER_WITH_EMP_NO = Pattern.compile("^(.+?)\\s*[（(]\\s*([A-Za-z0-9]+)\\s*[)）]$");

    /**
     * 不允许导入落地的状态：草稿 / 待审批 / 审批驳回。
     * <p>这三态在系统里表示「还没提交」或「审批链路中」，而导入行没有 OA 审批单，
     * 落进去会在「提需求」页出现一批永远无法推进的孤儿单。
     */
    private static final Set<String> REJECTED_STATUS = Set.of(
            RdmConstants.STATUS_DRAFT,
            RdmConstants.STATUS_INTAKE_PENDING,
            RdmConstants.STATUS_INTAKE_REJECTED);

    private final RdmRequirementMapper requirementMapper;
    private final RdmPrdMapper prdMapper;
    private final RdmStatusLogMapper statusLogMapper;
    private final RdmRequirementRoleMapper roleMapper;
    private final RdmProjectMapper projectMapper;
    private final RdmIterationMapper iterationMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    private final RdmAccessGuard accessGuard;
    private final JdbcTemplate jdbcTemplate;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmRequirementImportVO importRequirements(RdmRequirementImportDTO dto) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        /*
         * 导入是全局写动作：能建单不等于能往公司需求池里批量灌数据。
         * 沿用「全量可见」口径（管理员 / view_all / 需求池管理），与列表里的批量分配同侧。
         */
        if (!accessGuard.canSeeAll(current)) {
            throw new BusinessException("您沒有批量導入存量的權限");
        }
        List<RdmRequirementImportDTO.Row> rows = dto == null ? null : dto.getRows();
        if (rows == null || rows.isEmpty()) {
            throw new BusinessException("請至少填寫一行需求");
        }
        if (rows.size() > MAX_ROWS) {
            throw new BusinessException("單次最多導入 " + MAX_ROWS + " 條需求，請分批導入");
        }

        RdmRequirementImportVO result = new RdmRequirementImportVO();
        result.setTotal(rows.size());
        Set<String> enabledStatuses = enabledStatusCodes();
        Set<String> existingExternalNos = findExistingExternalNos(rows);
        Map<String, Integer> seenInBatch = new HashMap<>();

        List<RowPlan> plans = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            RdmRequirementImportDTO.Row row = rows.get(i);
            int rowNo = row != null && row.getRowNo() != null ? row.getRowNo() : i + 2;
            String externalNo = trim(row == null ? null : row.getExternalNo());
            String title = trim(row == null ? null : row.getTitle());

            // 云效编号已存在：直接跳过，不当作失败（重复导入是常态）
            if (StringUtils.hasText(externalNo) && existingExternalNos.contains(externalNo)) {
                result.getItems().add(item(rowNo, externalNo, title, "skipped",
                        "雲效編號已導入過，本次跳過", null));
                result.setSkipped(result.getSkipped() + 1);
                continue;
            }

            List<String> errors = new ArrayList<>();
            if (!StringUtils.hasText(title)) {
                errors.add("需求名稱不能為空");
            } else if (title.length() > 200) {
                errors.add("需求名稱超過 200 字");
            }
            if (!StringUtils.hasText(externalNo)) {
                errors.add("雲效編號不能為空");
            } else if (externalNo.length() > 64) {
                errors.add("雲效編號超過 64 字");
            } else {
                Integer firstRow = seenInBatch.putIfAbsent(externalNo, rowNo);
                if (firstRow != null) {
                    errors.add("雲效編號與第 " + firstRow + " 行重複");
                }
            }

            String status = trim(row == null ? null : row.getStatus());
            if (!StringUtils.hasText(status)) {
                errors.add("需求狀態不能為空");
            } else if (!enabledStatuses.contains(status)) {
                errors.add("需求狀態「" + status + "」不在啟用中的狀態字典內");
            } else if (REJECTED_STATUS.contains(status)) {
                errors.add("需求狀態「" + status + "」屬於准入前狀態，存量導入不支持");
            }

            String description = trim(row == null ? null : row.getDescription());
            if (description != null && description.length() > MAX_DESCRIPTION) {
                errors.add("需求描述超過 " + MAX_DESCRIPTION + " 字");
            }

            RdmProject project = null;
            String projectName = trim(row == null ? null : row.getProjectName());
            if (StringUtils.hasText(projectName)) {
                project = resolveProject(projectName, errors);
            }

            RdmIteration iteration = null;
            String iterationName = trim(row == null ? null : row.getIterationName());
            if (StringUtils.hasText(iterationName)) {
                iteration = resolveIteration(iterationName, project, errors);
            }
            // 只填了迭代没填项目：用迭代所属项目回填，避免「需求挂迭代但不挂项目」的孤儿排期
            if (project == null && iteration != null && iteration.getProjectId() != null) {
                project = projectMapper.selectById(iteration.getProjectId());
            }

            // 项目经理：行内填了以行为准；没填且绑了项目则继承项目 PM（业务口径：两者结合）
            SysUser projectManager = resolveUser(row == null ? null : row.getProjectManager(), "項目經理", errors);
            if (projectManager == null && StringUtils.hasText(trim(row == null ? null : row.getProjectManager()))) {
                // 明确填写但匹配失败，错误已进 errors，不再继承项目 PM 掩盖问题
                projectManager = null;
            } else if (projectManager == null && project != null && project.getPmUserId() != null) {
                projectManager = userMapper.selectById(project.getPmUserId());
            }
            SysUser productManager = resolveUser(row == null ? null : row.getProductManager(), "產品經理", errors);

            if (!errors.isEmpty()) {
                result.getItems().add(item(rowNo, externalNo, title, "failed", String.join("；", errors), null));
                result.setFailed(result.getFailed() + 1);
                continue;
            }

            RowPlan plan = new RowPlan();
            plan.rowNo = rowNo;
            plan.title = title;
            plan.externalNo = externalNo;
            plan.status = status;
            plan.description = description;
            plan.project = project;
            plan.iteration = iteration;
            plan.projectManager = projectManager;
            plan.productManager = productManager;
            plans.add(plan);
            // 占位成功项，写入阶段再回填 reqNo；保证返回顺序与请求一致
            result.getItems().add(item(rowNo, externalNo, title, "imported", null, null));
        }

        /*
         * 有任何一行校验失败就整批不写：用户修完重新上传即可，库里不会出现
         * 「导入了一半」的中间态。已存在的编号仍在上面记为 skipped，不计入失败。
         */
        if (result.getFailed() > 0) {
            result.setImported(0);
            log.info("RDM 存量導入校驗未通過，未寫入任何數據: total={}, failed={}, skipped={}",
                    result.getTotal(), result.getFailed(), result.getSkipped());
            return result;
        }

        int imported = 0;
        int cursor = 0;
        for (RdmRequirementImportVO.Item item : result.getItems()) {
            if (!"imported".equals(item.getResult())) {
                continue;
            }
            RowPlan plan = plans.get(cursor++);
            String reqNo = persist(plan, current);
            item.setReqNo(reqNo);
            imported++;
        }
        result.setImported(imported);
        log.info("RDM 存量導入完成: total={}, imported={}, skipped={}, operator={}",
                result.getTotal(), imported, result.getSkipped(), current.getEmpId());
        return result;
    }

    /** 单行落库：需求主表 + 参与角色 + 初始状态流水 + 一份已确认 PRD */
    private String persist(RowPlan plan, SysUser current) {
        LocalDateTime now = LocalDateTime.now();
        String signature = operatorResolver.operatorSignature(current);

        RdmRequirement req = new RdmRequirement();
        req.setReqNo(bizSeqService.next(BizSeqService.RULE_RDM_REQUIREMENT));
        req.setTitle(plan.title);
        req.setReqType(RdmConstants.TYPE_OTHER);
        req.setPriority("P2");
        req.setDescription(plan.description);
        req.setSourceChannel(SOURCE_YUNXIAO);
        req.setExternalNo(plan.externalNo);
        req.setExternalSource(SOURCE_YUNXIAO);
        // 历史记录口径：没有五节点/定稿快照/工时明细，不能被新链路闸门按新口径卡住
        req.setFlowVersion(1);
        req.setNeedApproval(0);
        req.setSubmitTime(now);
        req.setAcceptTime(now);
        req.setStatusEnterTime(now);
        req.setSubmitterUserId(current.getId());
        req.setSubmitterEmpNo(current.getEmpId());
        req.setSubmitterName(current.getName());
        req.setSubmitDeptId(current.getDepartmentId());
        req.setStatus(plan.status);
        req.setProgress(progressOf(plan.status));
        req.setBlockedFlag(0);
        req.setOverdueFlag(0);
        req.setRejectCount(0);
        req.setReopenCount(0);
        req.setReworkCount(0);
        req.setChangeCount(0);
        req.setProjectId(plan.project == null ? null : plan.project.getId());
        req.setIterationCode(plan.iteration == null ? null : plan.iteration.getCode());
        if (plan.productManager != null) {
            req.setAssigneePmUserId(plan.productManager.getId());
            req.setAssigneePmEmpNo(plan.productManager.getEmpId());
            req.setAssigneePmName(plan.productManager.getName());
        }
        if (plan.projectManager != null) {
            req.setProjectManagerUserId(plan.projectManager.getId());
            req.setProjectManagerUserName(plan.projectManager.getName());
        }
        req.setCurrentHandlerName(plan.productManager != null
                ? plan.productManager.getName()
                : (plan.projectManager == null ? null : plan.projectManager.getName()));
        req.setCreatedBy(signature);
        req.setUpdatedBy(signature);
        requirementMapper.insert(req);

        insertRole(req.getId(), current, RdmConstants.ROLE_SUBMITTER);
        if (plan.productManager != null) {
            insertRole(req.getId(), plan.productManager, RdmConstants.ROLE_PM);
        }
        insertStatusLog(req.getId(), plan, current, now);

        RdmPrd prd = new RdmPrd();
        prd.setPrdNo(bizSeqService.next(PRD_SEQ_RULE));
        prd.setReqId(req.getId());
        prd.setTitle(plan.title);
        prd.setContentRich(toPrdHtml(plan.description));
        prd.setStatus("approved");
        prd.setVersionNo("v1.0");
        prd.setAuthorUserId(plan.productManager != null ? plan.productManager.getId() : current.getId());
        prd.setAuthorName(plan.productManager != null ? plan.productManager.getName() : current.getName());
        prd.setReviewTime(now);
        prd.setReviewConclusion("存量導入，免評審");
        prd.setCreatedBy(signature);
        prd.setUpdatedBy(signature);
        prdMapper.insert(prd);

        return req.getReqNo();
    }

    private void insertRole(Long reqId, SysUser user, String roleCode) {
        if (user == null) {
            return;
        }
        RdmRequirementRole role = new RdmRequirementRole();
        role.setReqId(reqId);
        role.setUserId(user.getId());
        role.setEmpNo(user.getEmpId());
        role.setEmpName(user.getName());
        role.setRoleCode(roleCode);
        role.setIsActive(1);
        role.setJoinTime(LocalDateTime.now());
        roleMapper.insert(role);
    }

    private void insertStatusLog(Long reqId, RowPlan plan, SysUser current, LocalDateTime now) {
        RdmStatusLog statusLog = new RdmStatusLog();
        statusLog.setReqId(reqId);
        statusLog.setFromStatus(null);
        statusLog.setToStatus(plan.status);
        statusLog.setActionCode(IMPORT_ACTION);
        statusLog.setOperatorUserId(current.getId());
        statusLog.setOperatorName(current.getName());
        statusLog.setOperatorRole(IMPORT_OPERATOR_ROLE);
        statusLog.setRemark("存量導入（雲效 " + plan.externalNo + "）");
        statusLog.setEnterTime(now);
        statusLog.setIsOverdue(0);
        statusLogMapper.insert(statusLog);
    }

    /** 启用中的状态码：以 rdm_status_def 为唯一真值，前后端常量只做展示 */
    private Set<String> enabledStatusCodes() {
        List<String> codes = jdbcTemplate.queryForList(
                "SELECT code FROM rdm_status_def WHERE status = 1 AND deleted = 0", String.class);
        return new HashSet<>(codes);
    }

    /**
     * 已存在的云效编号（含已逻辑删除的行）。
     * <p>故意不走实体查询：MyBatis-Plus 的逻辑删除过滤会漏掉被删过的编号，
     * 随后插入会撞唯一索引整批失败。这里用参数化 IN（占位符字符串是常量，不拼接用户值）。
     */
    private Set<String> findExistingExternalNos(List<RdmRequirementImportDTO.Row> rows) {
        List<String> externalNos = rows.stream()
                .map(row -> trim(row == null ? null : row.getExternalNo()))
                .filter(StringUtils::hasText)
                .distinct()
                .toList();
        if (externalNos.isEmpty()) {
            return Collections.emptySet();
        }
        String placeholders = String.join(",", Collections.nCopies(externalNos.size(), "?"));
        List<String> found = jdbcTemplate.queryForList(
                "SELECT external_no FROM rdm_requirement WHERE external_no IN (" + placeholders + ")",
                String.class, externalNos.toArray());
        return new HashSet<>(found);
    }

    /** 按项目名称匹配；重名与不存在都阻断，避免把需求挂到错误项目上 */
    private RdmProject resolveProject(String name, List<String> errors) {
        List<RdmProject> projects = projectMapper.selectList(new LambdaQueryWrapper<RdmProject>()
                .eq(RdmProject::getName, name));
        if (projects.isEmpty()) {
            errors.add("所屬項目「" + name + "」不存在，請先在產研交付系統建好項目");
            return null;
        }
        if (projects.size() > 1) {
            errors.add("所屬項目「" + name + "」存在 " + projects.size() + " 個同名項目，請先改名區分");
            return null;
        }
        return projects.get(0);
    }

    /** 按迭代编码或名称匹配；同时校验与项目归属一致 */
    private RdmIteration resolveIteration(String nameOrCode, RdmProject project, List<String> errors) {
        List<RdmIteration> iterations = iterationMapper.selectList(new LambdaQueryWrapper<RdmIteration>()
                .and(w -> w.eq(RdmIteration::getCode, nameOrCode).or().eq(RdmIteration::getName, nameOrCode)));
        if (iterations.isEmpty()) {
            errors.add("所屬迭代「" + nameOrCode + "」不存在，請先在迭代排期裡建好迭代");
            return null;
        }
        if (iterations.size() > 1) {
            errors.add("所屬迭代「" + nameOrCode + "」匹配到 " + iterations.size() + " 條，請填迭代編碼");
            return null;
        }
        RdmIteration iteration = iterations.get(0);
        if (project != null && iteration.getProjectId() != null
                && !project.getId().equals(iteration.getProjectId())) {
            errors.add("所屬迭代「" + nameOrCode + "」不屬於項目「" + project.getName() + "」");
            return null;
        }
        return iteration;
    }

    /**
     * 解析人员：「姓名(工号)」优先；只填姓名时必须全库唯一。
     * <p>重名不猜：猜错会把需求派给另一个人，且导入后很难被发现。
     */
    private SysUser resolveUser(String raw, String label, List<String> errors) {
        String text = trim(raw);
        if (!StringUtils.hasText(text)) {
            return null;
        }
        Matcher matcher = USER_WITH_EMP_NO.matcher(text);
        if (matcher.matches()) {
            String name = matcher.group(1).trim();
            String empNo = matcher.group(2).trim();
            List<SysUser> matched = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                    .eq(SysUser::getEmpId, empNo)
                    .eq(SysUser::getName, name)
                    .eq(SysUser::getStatus, 1));
            if (matched.size() == 1) {
                return matched.get(0);
            }
            errors.add(label + "「" + text + "」不存在或已停用，請核對姓名與工號");
            return null;
        }
        List<SysUser> matched = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getName, text)
                .eq(SysUser::getStatus, 1));
        if (matched.size() == 1) {
            return matched.get(0);
        }
        if (matched.isEmpty()) {
            errors.add(label + "「" + text + "」不存在或已停用");
        } else {
            errors.add(label + "「" + text + "」有 " + matched.size() + " 位同名員工，請填「姓名(工號)」");
        }
        return null;
    }

    /** 状态对应的研发进度初值：只影响进度条展示，不参与任何质量判定 */
    private int progressOf(String status) {
        return switch (status) {
            case RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_VERIFIED, RdmConstants.STATUS_CLOSED -> 100;
            case RdmConstants.STATUS_TEST_PASSED, RdmConstants.STATUS_UAT_PENDING,
                    RdmConstants.STATUS_UAT_REJECTED -> 90;
            case RdmConstants.STATUS_TESTING -> 80;
            case RdmConstants.STATUS_INTEGRATION -> 70;
            case RdmConstants.STATUS_DEVELOPING -> 50;
            case RdmConstants.STATUS_DESIGNING -> 30;
            case RdmConstants.STATUS_SCHEDULED -> 10;
            default -> 0;
        };
    }

    /**
     * 纯文本转 PRD 段落 HTML。
     * <p>必须逐行转义：描述来自外部表格，直接拼进富文本会形成存储型 XSS；
     * 前端保存时虽会 DOMPurify，但不能把安全性寄托在另一个入口上。
     */
    private static String toPrdHtml(String description) {
        String text = StringUtils.hasText(description) ? description : "（存量導入，無原始需求描述）";
        StringBuilder html = new StringBuilder();
        for (String line : text.split("\\r?\\n", -1)) {
            html.append("<p>").append(escapeHtml(line)).append("</p>");
        }
        return html.toString();
    }

    private static String escapeHtml(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String trim(String text) {
        return text == null ? null : text.trim();
    }

    private static RdmRequirementImportVO.Item item(int rowNo, String externalNo, String title,
                                                    String result, String message, String reqNo) {
        RdmRequirementImportVO.Item item = new RdmRequirementImportVO.Item();
        item.setRowNo(rowNo);
        item.setExternalNo(externalNo);
        item.setTitle(title);
        item.setResult(result);
        item.setMessage(message);
        item.setReqNo(reqNo);
        return item;
    }

    /** 校验通过、等待落库的一行 */
    private static final class RowPlan {
        private int rowNo;
        private String title;
        private String externalNo;
        private String status;
        private String description;
        private RdmProject project;
        private RdmIteration iteration;
        private SysUser projectManager;
        private SysUser productManager;
    }
}
