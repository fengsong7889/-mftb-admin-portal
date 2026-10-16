package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFlowConfigDTO;
import com.mftb.admin.dto.RdmFlowConfigVO;
import com.mftb.admin.entity.RdmFlowConfig;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmFlowConfigMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * V3 灰度管理<b>写侧</b>服务（任务29 D 段）。
 *
 * <p>与任务27 读侧（{@link RdmFlowVersionGuard#isV3ReleaseEnabled} 等）严格分工：
 * 本服务只提供开关的写入与状态查询，<b>不改动任何读判定语义</b>；
 * 开启灰度<b>不等于</b>放开发布门禁 —— 发布仍须通过任务27 全部硬门禁（{@code RdmReleaseGateService}）。
 *
 * <p>核心口径（全部 fail-closed）：
 * <ol>
 *   <li><b>项目级双独立开关</b>：{@code v3_write_enabled} 与 {@code v3_release_enabled} 相互独立、分别灰度；
 *       项目行以 {@code scope_key=PROJECT:<projectId>}（非空唯一 {@code uk_rdm_flow_scope}）定位，
 *       <b>不用 nullable project_id 承担唯一性</b>；</li>
 *   <li><b>GLOBAL 熔断优先</b>：{@code global_*_paused=1} 时所有项目一律关闭（与读侧一致）；
 *       熔断位仅 GLOBAL 行可写（ck_rdm_flow_flags 强制项目行为 0）；</li>
 *   <li><b>默认关闭</b>：只维护唯一 GLOBAL 种子行语义，绝不自动开启任何项目、不自动补建项目行以外
 *       的任何默认开启；GLOBAL 行缺失时拒绝写入（种子行属迁移框架职责，不在此隐式重建）；
 *       项目行缺失时仅可按「默认全关 + 显式携带值」创建；</li>
 *   <li><b>授权</b>：仅管理员可操作，身份取认证主体（{@link OperatorResolver#currentUser()}），
 *       未登录/非管理员一律拒绝；</li>
 *   <li><b>审计</b>：每次开关变更经 {@link PermissionAuditService} 写 {@code sys_permission_audit_log}
 *       （谁/何时/项目/从→到/原因；leader 批准落点，与迁移域审计 rdm_migration_audit 严格分离），
 *       审计插入失败随事务整体回滚，杜绝「改了开关没留痕」；</li>
 *   <li><b>幂等 + 乐观锁</b>：写操作接 {@link RdmIdempotentService#executeOnce}；
 *       既有行更新必须携带 {@code expectedVersion} 且经 @Version 条件更新，受影响行数为 0 即拒绝，
 *       防并发覆盖。</li>
 * </ol>
 *
 * <p><b>事务结构说明</b>：本服务的公开写入口自身标注 {@code @Transactional}，
 * {@code executeOnce} 的写事务模板以 PROPAGATION_REQUIRED 加入同一物理事务 ——
 * 开关变更 + 审计 + 幂等结果写回三者原子提交；业务异常整体回滚（占位行一并回滚，不留半状态）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmFlowConfigService {

    private final RdmFlowConfigMapper flowConfigMapper;
    private final RdmProjectMapper projectMapper;
    private final RdmIdempotentService idempotentService;
    private final OperatorResolver operatorResolver;
    private final PermissionAuditService permissionAuditService;

    /* ==================== 写入：项目级双独立开关 ==================== */

    /**
     * 变更某项目的 V3 写入/发布开关（两个独立开关，null=不变更）。
     * <p>幂等入口：bizType={@link RdmConstants#BIZ_FLOW_CONFIG_UPDATE}，resourceKey={@code flow_config:PROJECT:<id>}。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmFlowConfigVO.GrayscaleStatus updateProjectFlags(RdmFlowConfigDTO.ProjectFlagsUpdate dto) {
        Long actorId = requireAdminActorId();
        String hash = idempotentService.stableRequestHash(List.of(
                "project",
                String.valueOf(dto == null ? null : dto.getProjectId()),
                String.valueOf(dto == null ? null : dto.getV3WriteEnabled()),
                String.valueOf(dto == null ? null : dto.getV3ReleaseEnabled()),
                String.valueOf(dto == null ? null : dto.getExpectedVersion()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(RdmConstants.BIZ_FLOW_CONFIG_UPDATE)
                .resourceKey("flow_config:" + RdmConstants.projectScopeKey(
                        dto != null && dto.getProjectId() != null ? dto.getProjectId() : 0L))
                .clientRequestId(deriveClientRequestId("projectFlags",
                        dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doUpdateProjectFlags(dto, actorId), RdmFlowConfigVO.GrayscaleStatus.class);
    }

    /** 项目级开关变更业务体（经 {@link #updateProjectFlags} 幂等入口调用，不单独暴露给控制器）。 */
    RdmFlowConfigVO.GrayscaleStatus doUpdateProjectFlags(RdmFlowConfigDTO.ProjectFlagsUpdate dto, Long actorId) {
        if (dto == null || dto.getProjectId() == null || dto.getProjectId() <= 0) {
            throw new BusinessException("項目ID不能為空且必須大於 0");
        }
        Integer write = requireFlagOrNull(dto.getV3WriteEnabled(), "V3 寫入開關");
        Integer release = requireFlagOrNull(dto.getV3ReleaseEnabled(), "V3 發布開關");
        if (write == null && release == null) {
            throw new BusinessException("至少需要變更一個開關（v3WriteEnabled / v3ReleaseEnabled）");
        }
        String reason = requireReason(dto.getReason());
        // FK 前置校验（fk_rdm_flow_project）：目标项目必须存在，避免运行期 FK 异常
        RdmProject project = projectMapper.selectById(dto.getProjectId());
        if (project == null) {
            throw new BusinessException("目標項目不存在：" + dto.getProjectId());
        }

        String scopeKey = RdmConstants.projectScopeKey(dto.getProjectId());
        RdmFlowConfig row = findConfig(scopeKey);
        Map<String, Object> before = snapshotOf(row, scopeKey, actorId, reason);
        if (row == null) {
            // 项目行不存在：只允许「显式授权创建」，expectedVersion 必须为空（携带版本=客户端持有陈旧数据）
            if (dto.getExpectedVersion() != null) {
                throw new BusinessException("項目灰度行尚不存在，請勿攜帶 expectedVersion；請刷新後以「新建」語義重試");
            }
            row = new RdmFlowConfig();
            row.setScopeKey(scopeKey);
            row.setProjectId(dto.getProjectId());
            // 默认关闭：未显式携带的开关一律 0，绝不隐式开启
            row.setV3WriteEnabled(write != null ? write : RdmConstants.FLOW_FLAG_OFF);
            row.setV3ReleaseEnabled(release != null ? release : RdmConstants.FLOW_FLAG_OFF);
            row.setGlobalWritePaused(RdmConstants.FLOW_FLAG_OFF);
            row.setGlobalReleasePaused(RdmConstants.FLOW_FLAG_OFF);
            row.setProductVerificationDays(RdmConstants.DEFAULT_PRODUCT_VERIFICATION_DAYS);
            row.setBusinessVerificationDays(RdmConstants.DEFAULT_BUSINESS_VERIFICATION_DAYS);
            row.setUpdatedBy(actorId);
            try {
                flowConfigMapper.insert(row);
            } catch (DuplicateKeyException dup) {
                // uk_rdm_flow_scope 冲突 = 并发下他人已创建该行；拒绝盲写，让客户端刷新后按更新语义重试
                log.warn("並發創建項目灰度行衝突: scopeKey={}", scopeKey, dup);
                throw new BusinessException("項目灰度配置已被並發創建，請刷新後重試");
            }
        } else {
            // 既有行更新：必须携带 expectedVersion 且匹配（乐观锁预检），真实并发由 @Version 条件更新兜底
            if (dto.getExpectedVersion() == null) {
                throw new BusinessException("變更既有灰度配置必須攜帶 expectedVersion（防並發覆蓋）");
            }
            if (!dto.getExpectedVersion().equals(row.getVersion())) {
                throw new BusinessException("灰度配置已被他人修改（版本不一致），請刷新後重試");
            }
            if (write != null) {
                row.setV3WriteEnabled(write);
            }
            if (release != null) {
                row.setV3ReleaseEnabled(release);
            }
            row.setUpdatedBy(actorId);
            // @Version 自动 +1 并作为 WHERE 条件；受影响行数为 0 说明并发覆盖
            if (flowConfigMapper.updateById(row) == 0) {
                throw new BusinessException("灰度配置已被他人修改，請刷新後重試");
            }
        }
        auditFlowConfigChange(row, scopeKey, before, snapshotOf(row, scopeKey, actorId, reason));
        log.info("RDM 項目灰度開關已變更: scopeKey={}, write={}, release={}, operator={}",
                scopeKey, row.getV3WriteEnabled(), row.getV3ReleaseEnabled(), actorId);
        return grayscaleStatus(dto.getProjectId());
    }

    /* ==================== 写入：GLOBAL 总闸与全局熔断 ==================== */

    /**
     * 变更 GLOBAL 行开关（总闸 + 全局熔断，四个开关独立，null=不变更）。
     * <p>全局熔断优先：{@code global_*_paused=1} 时读侧一律判关（任务27 口径），本方法只负责写。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmFlowConfigVO.GrayscaleStatus updateGlobalFlags(RdmFlowConfigDTO.GlobalFlagsUpdate dto) {
        Long actorId = requireAdminActorId();
        String hash = idempotentService.stableRequestHash(List.of(
                "global",
                String.valueOf(dto == null ? null : dto.getV3WriteEnabled()),
                String.valueOf(dto == null ? null : dto.getV3ReleaseEnabled()),
                String.valueOf(dto == null ? null : dto.getGlobalWritePaused()),
                String.valueOf(dto == null ? null : dto.getGlobalReleasePaused()),
                String.valueOf(dto == null ? null : dto.getExpectedVersion()),
                dto == null ? "" : nullToEmpty(dto.getReason())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(actorId)
                .bizType(RdmConstants.BIZ_FLOW_CONFIG_UPDATE)
                .resourceKey("flow_config:" + RdmConstants.FLOW_SCOPE_GLOBAL)
                .clientRequestId(deriveClientRequestId("globalFlags",
                        dto == null ? null : dto.getRequestId(), hash))
                .requestHash(hash)
                .build();
        return idempotentService.executeOnce(key,
                () -> doUpdateGlobalFlags(dto, actorId), RdmFlowConfigVO.GrayscaleStatus.class);
    }

    /** GLOBAL 开关变更业务体（经 {@link #updateGlobalFlags} 幂等入口调用）。 */
    RdmFlowConfigVO.GrayscaleStatus doUpdateGlobalFlags(RdmFlowConfigDTO.GlobalFlagsUpdate dto, Long actorId) {
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        Integer write = requireFlagOrNull(dto.getV3WriteEnabled(), "GLOBAL V3 寫入總閘");
        Integer release = requireFlagOrNull(dto.getV3ReleaseEnabled(), "GLOBAL V3 發布總閘");
        Integer writePaused = requireFlagOrNull(dto.getGlobalWritePaused(), "全局寫入熔斷");
        Integer releasePaused = requireFlagOrNull(dto.getGlobalReleasePaused(), "全局發布熔斷");
        if (write == null && release == null && writePaused == null && releasePaused == null) {
            throw new BusinessException("至少需要變更一個 GLOBAL 開關");
        }
        String reason = requireReason(dto.getReason());

        RdmFlowConfig row = findConfig(RdmConstants.FLOW_SCOPE_GLOBAL);
        if (row == null) {
            // GLOBAL 种子行由迁移框架（238）维护；缺失属数据异常，拒绝隐式重建（fail-closed）
            throw new BusinessException("GLOBAL 灰度種子行缺失，請先核查資料庫遷移狀態（拒絕隱式重建）");
        }
        if (dto.getExpectedVersion() == null) {
            throw new BusinessException("變更 GLOBAL 灰度配置必須攜帶 expectedVersion（防並發覆蓋）");
        }
        if (!dto.getExpectedVersion().equals(row.getVersion())) {
            throw new BusinessException("GLOBAL 灰度配置已被他人修改（版本不一致），請刷新後重試");
        }
        Map<String, Object> before = snapshotOf(row, RdmConstants.FLOW_SCOPE_GLOBAL, actorId, reason);
        if (write != null) {
            row.setV3WriteEnabled(write);
        }
        if (release != null) {
            row.setV3ReleaseEnabled(release);
        }
        if (writePaused != null) {
            row.setGlobalWritePaused(writePaused);
        }
        if (releasePaused != null) {
            row.setGlobalReleasePaused(releasePaused);
        }
        row.setUpdatedBy(actorId);
        if (flowConfigMapper.updateById(row) == 0) {
            throw new BusinessException("GLOBAL 灰度配置已被他人修改，請刷新後重試");
        }
        auditFlowConfigChange(row, RdmConstants.FLOW_SCOPE_GLOBAL,
                before, snapshotOf(row, RdmConstants.FLOW_SCOPE_GLOBAL, actorId, reason));
        log.info("RDM GLOBAL 灰度開關已變更: write={}, release={}, writePaused={}, releasePaused={}, operator={}",
                row.getV3WriteEnabled(), row.getV3ReleaseEnabled(),
                row.getGlobalWritePaused(), row.getGlobalReleasePaused(), actorId);
        return grayscaleStatus(null);
    }

    /* ==================== 查询（只读，供任务23 前端管理页消费） ==================== */

    /**
     * 查询当前灰度状态：GLOBAL 行 +（可选）指定项目行 + 两级合成的有效开关。
     * <p>只读接口，不补建任何行；effective* 仅镜像任务27 读侧口径供展示，门禁判定仍以读侧权威方法为准。
     *
     * @param projectId 可空；非空时附带该项目行状态（缺行=exists:false，默认关闭）
     */
    public RdmFlowConfigVO.GrayscaleStatus grayscaleStatus(Long projectId) {
        RdmFlowConfig globalRow = findConfig(RdmConstants.FLOW_SCOPE_GLOBAL);
        RdmFlowConfig projectRow = (projectId == null || projectId <= 0)
                ? null : findConfig(RdmConstants.projectScopeKey(projectId));

        RdmFlowConfigVO.GrayscaleStatus vo = new RdmFlowConfigVO.GrayscaleStatus();
        vo.setGlobal(toGlobalVO(globalRow));
        vo.setProject(projectId == null || projectId <= 0 ? null : toProjectVO(projectId, projectRow));

        // 与任务27 读侧同口径合成：GLOBAL 缺行/熔断/总闸关 → 一律关闭；项目缺行/开关非 1 → 关闭
        boolean globalOk = globalRow != null
                && !isOn(globalRow == null ? null : globalRow.getGlobalWritePaused())
                && isOn(globalRow == null ? null : globalRow.getV3WriteEnabled());
        boolean globalReleaseOk = globalRow != null
                && !isOn(globalRow.getGlobalReleasePaused())
                && isOn(globalRow.getV3ReleaseEnabled());
        boolean projectWriteOn = projectRow != null && isOn(projectRow.getV3WriteEnabled());
        boolean projectReleaseOn = projectRow != null && isOn(projectRow.getV3ReleaseEnabled());
        boolean hasProject = projectId != null && projectId > 0;
        vo.setEffectiveV3Write(globalOk && (!hasProject || projectWriteOn));
        vo.setEffectiveV3Release(globalReleaseOk && (!hasProject || projectReleaseOn));
        return vo;
    }

    /* ==================== 内部工具 ==================== */

    /** 按 scope_key 读一行灰度配置（uk_rdm_flow_scope 保证唯一）。 */
    private RdmFlowConfig findConfig(String scopeKey) {
        if (scopeKey == null) {
            return null;
        }
        return flowConfigMapper.selectOne(new LambdaQueryWrapper<RdmFlowConfig>()
                .eq(RdmFlowConfig::getScopeKey, scopeKey)
                .last("LIMIT 1"));
    }

    /**
     * 授权闸门（fail-closed）：身份取认证主体，仅管理员可操作灰度开关。
     * <p>灰度开启是「显式授权动作」，不委托给任何菜单 edit 权限，也不允许项目主责自助开启。
     */
    private Long requireAdminActorId() {
        SysUser current = operatorResolver.currentUser();
        if (current == null || current.getId() == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (!operatorResolver.isAdmin(current)) {
            log.warn("拒絕非管理員操作 V3 灰度開關: userId={}", current.getId());
            throw new BusinessException("僅管理員可操作 V3 灰度開關（顯式授權動作）");
        }
        return current.getId();
    }

    /** 开关位变更审计：写 sys_permission_audit_log（从→到 + 原因 + 操作人），失败随事务回滚。 */
    private void auditFlowConfigChange(RdmFlowConfig row, String scopeKey,
                                       Map<String, Object> before, Map<String, Object> after) {
        permissionAuditService.record(
                RdmConstants.AUDIT_TARGET_FLOW_CONFIG,
                row.getId(),
                scopeKey,
                RdmConstants.AUDIT_SYSTEM_RDM,
                RdmConstants.AUDIT_CHANGE_UPDATE,
                before,
                after);
    }

    /** 审计快照：四个开关 + 并发版本 + 原因 + 操作人ID（谁/项目/从→到/原因；何时由 created_at 承载）。 */
    private Map<String, Object> snapshotOf(RdmFlowConfig row, String scopeKey, Long actorId, String reason) {
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("scopeKey", scopeKey);
        snap.put("v3WriteEnabled", row == null ? null : row.getV3WriteEnabled());
        snap.put("v3ReleaseEnabled", row == null ? null : row.getV3ReleaseEnabled());
        snap.put("globalWritePaused", row == null ? null : row.getGlobalWritePaused());
        snap.put("globalReleasePaused", row == null ? null : row.getGlobalReleasePaused());
        snap.put("version", row == null ? null : row.getVersion());
        snap.put("reason", reason);
        snap.put("operatorUserId", actorId);
        return snap;
    }

    private RdmFlowConfigVO.Global toGlobalVO(RdmFlowConfig row) {
        RdmFlowConfigVO.Global vo = new RdmFlowConfigVO.Global();
        vo.setScopeKey(RdmConstants.FLOW_SCOPE_GLOBAL);
        if (row == null) {
            vo.setExists(false);
            vo.setV3WriteEnabled(RdmConstants.FLOW_FLAG_OFF);
            vo.setV3ReleaseEnabled(RdmConstants.FLOW_FLAG_OFF);
            vo.setGlobalWritePaused(RdmConstants.FLOW_FLAG_OFF);
            vo.setGlobalReleasePaused(RdmConstants.FLOW_FLAG_OFF);
            return vo;
        }
        vo.setExists(true);
        vo.setV3WriteEnabled(row.getV3WriteEnabled());
        vo.setV3ReleaseEnabled(row.getV3ReleaseEnabled());
        vo.setGlobalWritePaused(row.getGlobalWritePaused());
        vo.setGlobalReleasePaused(row.getGlobalReleasePaused());
        vo.setProductVerificationDays(row.getProductVerificationDays());
        vo.setBusinessVerificationDays(row.getBusinessVerificationDays());
        vo.setVersion(row.getVersion());
        vo.setUpdatedBy(row.getUpdatedBy());
        vo.setUpdatedAt(row.getUpdatedAt());
        return vo;
    }

    private RdmFlowConfigVO.Project toProjectVO(Long projectId, RdmFlowConfig row) {
        RdmFlowConfigVO.Project vo = new RdmFlowConfigVO.Project();
        vo.setProjectId(projectId);
        vo.setScopeKey(RdmConstants.projectScopeKey(projectId));
        if (row == null) {
            vo.setExists(false);
            vo.setV3WriteEnabled(RdmConstants.FLOW_FLAG_OFF);
            vo.setV3ReleaseEnabled(RdmConstants.FLOW_FLAG_OFF);
            return vo;
        }
        vo.setExists(true);
        vo.setV3WriteEnabled(row.getV3WriteEnabled());
        vo.setV3ReleaseEnabled(row.getV3ReleaseEnabled());
        vo.setVersion(row.getVersion());
        vo.setUpdatedBy(row.getUpdatedBy());
        vo.setUpdatedAt(row.getUpdatedAt());
        return vo;
    }

    /** 开关值校验：仅允许 0/1（ck_rdm_flow_flags），null 表示不变更。 */
    private Integer requireFlagOrNull(Integer flag, String name) {
        if (flag == null) {
            return null;
        }
        if (flag != RdmConstants.FLOW_FLAG_OFF && flag != RdmConstants.FLOW_FLAG_ON) {
            throw new BusinessException(name + "取值非法（僅允許 0/1）：" + flag);
        }
        return flag;
    }

    private String requireReason(String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("灰度開關變更必須填寫原因（審計留痕）");
        }
        return reason.trim();
    }

    /** 幂等 clientRequestId：优先客户端 requestId，否则用服务端派生判别子（中心归一化到 ≤64 ASCII）。 */
    private String deriveClientRequestId(String op, String requestId, String discriminator) {
        String tail = StringUtils.hasText(requestId) ? requestId.trim()
                : (StringUtils.hasText(discriminator) ? discriminator : "na");
        return RdmIdempotentService.normalizeClientRequestId(op + ":" + tail);
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    /** 开关位判定：仅显式 1 算开，null/0/其他一律算关（与任务27 读侧一致的安全默认）。 */
    private static boolean isOn(Integer flag) {
        return flag != null && flag == RdmConstants.FLOW_FLAG_ON;
    }
}
