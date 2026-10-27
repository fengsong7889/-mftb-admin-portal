package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.contracts.rdm.RdmProjectVisibility;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmIssueDefer;
import com.mftb.admin.entity.RdmIssueFollowup;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueDeferMapper;
import com.mftb.admin.mapper.RdmIssueFollowupMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.impl.RdmScheduleServiceImpl;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * RDM 統一權威事實源（任務22 A.1 / A.2 / A.5 / A.6 / A.7）。
 *
 * <p><b>為什麼需要這個類</b>：改造前 {@link RdmSummaryService} 與 {@link RdmProjectService} 各有一套
 * 統計口徑與一套數據範圍口徑，同一個事實能算出兩個數字（詳情頁說 3 個阻塞、列表卡說 2 個；
 * 卡片說 7 個待裁決、行級恆為 0）。本類把「取數 + 授權收斂 + 事實計算」收斂成<b>唯一</b>一處，
 * 項目總覽、統計卡片、項目下鑽、工作台待辦、全量導出、對賬全部消費同一批
 * {@link RdmFactVO} 事實對象，因此「卡片 = 行級 = 下鑽 = 導出 = 對賬」是結構性質，
 * 不再依賴各處「記得用同一個條件」。
 *
 * <p><b>一次載入、多處聚合</b>：{@link #loadSnapshot} 把範圍內的項目/交付項/需求/任務/問題/延期單/
 * 承接/提測批次一次性載入 {@link Snapshot}，之後所有事實都從這份快照聚合，不再回頭查庫。
 * 這既是口徑一致的保證（不會出現「待辦查到的問題和卡片查到的問題不是同一批」），
 * 也避免了逐項目逐指標的 N+1 查詢。
 *
 * <p>本類落地的口徑修復（逐條對應任務書 A.5）：
 * <ol>
 *   <li><b>集合條件 + 空集合</b>：提測批次按需求ID<b>集合</b> {@code in(reqId, reqIds)} 統計，
 *       空集合<b>直接返回 0 且不發 SQL</b>。舊實現寫成 {@code eq(RdmTestBatch::getReqId, projectReqIds(projectId))}
 *       —— 對一個 {@code List} 用 {@code eq} 單值條件，語義是「reqId 等於這個 List 對象」，
 *       恆不命中（統計恆為 0），且一旦集合為空還會退化為全表命中，兩種錯都佔了。</li>
 *   <li><b>不由任務狀態推導測試通過、不由交付狀態推導驗收</b>：
 *       {@link RdmFactVO.ItemFact#isTestPassed()} 取自任務20 {@link RdmTestBatchService#isTestPassed}，
 *       {@link RdmFactVO.ItemFact#isProductAccepted()} / {@link RdmFactVO.ItemFact#isBizAccepted()} 取自
 *       {@link RdmAcceptanceRecordService#hasProductAcceptancePassed} /
 *       {@link RdmAcceptanceRecordService#hasBizAcceptancePassed}（傳入交付項<b>當前 scopeVersion</b>）。
 *       舊實現 {@code deriveTestStatus} 由「有 doing 任務」推導 testing、{@code deriveAcceptanceStatus}
 *       由「交付項 status=done」推導 passed，等於讓被門禁的對象自己給自己發通行證。</li>
 *   <li><b>不混算歷史驗收</b>：驗收結論按當前 scopeVersion 判定，且任務20 的查詢已過濾
 *       {@code RdmEvidenceInvalidation} 登記的失效證據；本類<b>不</b>再自行 {@code count(conclusion=pass)}
 *       （舊 {@code getDeliveryItemSummary} 正是這麼做的：範圍改過之後舊版本的 pass 仍被計入，
 *       「改一次範圍就把不合格洗成合格」）。</li>
 *   <li><b>行級待裁決 = 卡片待裁決</b>：兩側同一條件（交付項ID集合 + {@link RdmConstants#ISSUE_OPEN_STATUSES}），
 *       卡片值恆等於各行相加；舊實現 {@code applyDeliveryStats} 把行級 {@code pendingDecisionCount} 硬編碼為 0，
 *       卡片卻是真實查詢，兩者永遠對不上。</li>
 *   <li><b>關閉項目 ≠ 交付完成</b>：{@link RdmFactVO.ProjectFact#isAllDelivered()} 只認
 *       {@code status=all_delivered}，{@link RdmFactVO.ProjectFact#isClosed()} 只認 {@code status=closed}，
 *       兩個布爾互不推導，卡片也分列 {@code allDeliveredProjects} 與 {@code closedProjects}。
 *       舊 {@code getProjectListStats} 把 closed 併入 completed，等於「歸檔就算交付完成」。</li>
 *   <li><b>原範圍延期殘餘</b>：見 {@link #isResidualDefer}。</li>
 * </ol>
 *
 * <p><b>數據範圍 fail-closed（A.2）</b>：見 {@link #resolveScope}。身份一律取認證主體
 * {@code SysUser.id}（由控制器經 {@code OperatorResolver.currentUser().getId()} 傳入），
 * 拿不到身份時 {@code authenticated=false} 且 {@code projectIds} 為空集合 —— 任何消費方都只能看到 0 行，
 * <b>絕不</b>因為 {@code userId==null} 就跳過收斂而退化為全量（舊 {@code getProjectListStats} 正是
 * {@code if (userId != null) {收斂}}，null 時直接查全表）。
 *
 * <p><b>資源守衛（A.6）</b>：見 {@link #requireProjectVisible}。allowedActions 只供前端渲染按鈕，
 * 後端每個下鑽/導出/對賬入口都獨立重鑑權，前端藏按鈕不構成安全邊界。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmProjectFactService implements RdmProjectVisibility {

    /** 未指派 / 無責任人時的去重占位，与 {@link RdmTodoBoardService} 保持同一顆粒度 */
    private static final String TASK_STATUS_DONE = "done";
    private static final String TASK_STATUS_DOING = "doing";
    private static final String TASK_STATUS_CANCELLED = "cancelled";

    /**
     * 统计卡下钻口径码（与前端 ProjectOverview 的 DrillKey 逐字对齐）。
     * <p>放在服务端而不是常量类里，是因为它只服务于本类的事实位过滤；
     * 真正的口径（哪些项目算进行中/需关注）依然由 {@code toProjectFact} 的
     * isInProgress / isAttention 定义，这里不重新写一份判定条件。
     */
    static final String DRILL_IN_PROGRESS = "inProgress";
    static final String DRILL_ATTENTION = "attention";
    static final String DRILL_PENDING = "pending";

    private final RdmProjectMapper projectMapper;
    private final RdmProjectMemberMapper memberMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmTestBatchMapper testBatchMapper;
    private final RdmIssueMapper issueMapper;
    private final RdmIssueDeferMapper issueDeferMapper;
    private final RdmIssueFollowupMapper issueFollowupMapper;
    private final SysUserMapper userMapper;
    private final RdmAccessGuard accessGuard;
    private final RdmScheduleServiceImpl scheduleService;
    /** 任務20 權威門禁事實：測試是否通過（有效批次 + 當前凍結輪次 + 必測全 pass + 無 critical/major 未閉環） */
    private final RdmTestBatchService testBatchService;
    /** 任務20 權威門禁事實：產品/業務驗收是否通過（當前 scopeVersion 最新有效結論=pass，失效證據已過濾） */
    private final RdmAcceptanceRecordService acceptanceRecordService;
    /** 待辦這一事實的唯一計算處（A.3 去重 + 等待他人、A.4 正確路由） */
    private final RdmTodoBoardService todoBoardService;

    /* ==================== 数据范围（A.2 fail-closed） ==================== */

    /**
     * 解析數據範圍。
     *
     * <p><b>fail-closed</b>：{@code userId==null} 或查不到該用戶時，{@code authenticated} 為 false 或
     * {@code restricted} 為 true 且 {@code projectIds} 為空集合，消費方只能得到 0 行。
     * 這裡<b>沒有</b>「userId 為 null 就不收斂」的分支 —— 那正是 mine 退化為全量的歷史缺陷。
     *
     * <p>{@code canSeeAll} 沿用任務19 {@link RdmAccessGuard#canSeeAll} 的分配側授權口徑
     * （管理員 / 需求池 view / 可分發者），本類不自行放寬。
     */
    public RdmFactVO.Scope resolveScope(Long userId) {
        RdmFactVO.Scope scope = new RdmFactVO.Scope();
        scope.setComputedAt(DateTimeUtils.format(LocalDateTime.now()));
        if (userId == null) {
            scope.setAuthenticated(false);
            scope.setCanSeeAll(false);
            scope.setRestricted(true);
            scope.setProjectIds(new ArrayList<>());
            log.debug("RDM 數據範圍 fail-closed：未取得認證主體，可見項目集合置空（不退化全量）");
            return scope;
        }
        scope.setUserId(userId);
        scope.setAuthenticated(true);
        SysUser user = userMapper.selectById(userId);
        boolean canSeeAll = accessGuard.canSeeAll(user);
        scope.setCanSeeAll(canSeeAll);
        scope.setRestricted(!canSeeAll);
        scope.setProjectIds(canSeeAll ? new ArrayList<>() : joinedProjectIds(userId));
        return scope;
    }

    /**
     * 項目級資源守衛（A.6）：summary / pending / checklist / 下鑽 / 導出 / 對賬 全部先過這裡。
     *
     * <p>拒絕三類越權：
     * <ol>
     *   <li><b>拿不到身份</b>：未登錄（{@code userId==null}）直接拒絕，絕不當成「匿名可看全部」；</li>
     *   <li><b>他項目數據</b>：非全量授權者且不在該項目成員範圍內 → 拒絕；</li>
     *   <li><b>不存在的項目</b>：按「項目不存在」拒絕，不洩露「存在但你無權」與「不存在」的差異。</li>
     * </ol>
     *
     * <p>項目經理 / 產品負責人即使沒有成員行也放行：他們是該項目的責任人，
     * 存量項目存在「建項目時未回填成員行」的情況，把他們鎖在外面等於讓項目無人可管。
     * 這是<b>擴大到責任人本人</b>，不是放寬到無關人。
     */
    /**
     * 契约实现：只保留「校验」语义，不把 RdmProject 实体暴露给跨域调用方
     * （契约在 contracts/rdm，见 RdmProjectVisibility 的说明）。
     */
    @Override
    public void assertProjectVisible(Long projectId, Long userId) {
        requireProjectVisible(projectId, userId);
    }

    public RdmProject requireProjectVisible(Long projectId, Long userId) {
        if (projectId == null) {
            throw new BusinessException("項目ID不能為空");
        }
        RdmFactVO.Scope scope = resolveScope(userId);
        if (!scope.isAuthenticated()) {
            throw new BusinessException("未取得登錄身份，無法查看項目數據");
        }
        RdmProject project = projectMapper.selectById(projectId);
        if (project == null) {
            throw new BusinessException("項目不存在或已刪除");
        }
        if (scope.isCanSeeAll()) {
            return project;
        }
        if (scope.getProjectIds() != null && scope.getProjectIds().contains(projectId)) {
            return project;
        }
        if (userId.equals(project.getPmUserId()) || userId.equals(project.getProductOwnerUserId())) {
            return project;
        }
        log.warn("RDM 項目資源守衛拒絕越權訪問: projectId={}, userId={}", projectId, userId);
        throw new BusinessException("您不是該項目成員，無法查看該項目數據");
    }

    /** 消歧先取授权 ID 集合；负责人没有成员行时仍与单项目守卫保持一致。 */
    public RdmFactVO.Scope resolveLookupScope(Long userId) {
        SysUser user = userId == null ? null : userMapper.selectById(userId);
        if (user == null || !Integer.valueOf(1).equals(user.getStatus())) return resolveScope(null);
        RdmFactVO.Scope scope = resolveScope(userId);
        if (!scope.isCanSeeAll()) {
            java.util.Set<Long> ids = new java.util.LinkedHashSet<>(scope.getProjectIds());
            projectMapper.selectList(new LambdaQueryWrapper<RdmProject>()
                    .select(RdmProject::getId)
                    .and(w -> w.eq(RdmProject::getPmUserId, userId).or().eq(RdmProject::getProductOwnerUserId, userId)))
                    .stream().map(RdmProject::getId).filter(Objects::nonNull).forEach(ids::add);
            scope.setProjectIds(new ArrayList<>(ids));
        }
        return scope;
    }

    /* ==================== 对外事实入口 ==================== */

    /**
     * 單項目下鑽事實（項目詳情卡片 / 概覽 / 待辦 / 交付清單共用同一份）。
     * <p>先過資源守衛，越權直接拋 {@link BusinessException}。
     */
    public RdmFactVO.ProjectFact projectFact(Long projectId, Long userId) {
        requireProjectVisible(projectId, userId);
        Snapshot snapshot = loadSnapshot(scopeOfProject(projectId, userId), queryOfProject());
        List<RdmFactVO.ProjectFact> facts = toProjectFacts(snapshot);
        return facts.isEmpty() ? null : facts.get(0);
    }

    /** 單項目下鑽的逐交付項明細（前端「展開行」與導出明細 Sheet 共用，口徑與卡片同源）。 */
    public List<RdmFactVO.ItemFact> itemFacts(Long projectId, Long userId) {
        requireProjectVisible(projectId, userId);
        Snapshot snapshot = loadSnapshot(scopeOfProject(projectId, userId), queryOfProject());
        return snapshot.itemFacts;
    }

    /**
     * 項目待辦看板（A.3）。
     * <p>{@code projectId==null} 表示「我的工作台」跨項目視角：此時範圍收斂為「我參與的項目」，
     * 未登錄則返回空看板（fail-closed，不退化全量）。
     */
    public RdmFactVO.TodoBoard todoBoard(Long projectId, Long userId) {
        RdmFactVO.Scope scope = projectId == null
                ? resolveScope(userId)
                : scopeOfProject(requireProjectVisible(projectId, userId).getId(), userId);
        Snapshot snapshot = loadSnapshot(scope, queryOfProject());
        return snapshot.board;
    }

    /** 統計卡片（跟隨查詢條件；每個計數都等於對應明細行的聚合）。 */
    public RdmFactVO.CardSummary cards(RdmFactVO.FactQuery query, Long userId) {
        return toCards(loadSnapshot(resolveScope(userId), normalize(query)));
    }

    /** 範圍內全部項目事實行（總覽列表 / 導出項目 Sheet）。 */
    public List<RdmFactVO.ProjectFact> projectFacts(RdmFactVO.FactQuery query, Long userId) {
        return toProjectFacts(loadSnapshot(resolveScope(userId), normalize(query)));
    }

    /**
     * 系統級項目事實（<b>僅供無認證上下文的系統作業</b>，如每日日報定時/手動觸發）。
     *
     * <p><b>為什麼必須有這個方法</b>：{@link #resolveScope} 對 {@code userId == null} 是 fail-closed
     * （可見項目集合置空、絕不退化全量），因此定時作業直接調 {@code projectFacts(query, null)}
     * 會拿到空列表、日報恆為「0 個項目」。日報作業是<b>系統身份</b>而非某個用戶的越權請求，
     * 故在這裡顯式構造全量 Scope；其餘鏈路與用戶視角<b>完全共用同一個</b> {@code loadSnapshot}
     * 與 {@code toProjectFacts}，因此「日報數字 == 項目總覽數字」的口徑單點不被破壞。
     *
     * <p><b>安全邊界（不得放寬）</b>：任何來自 HTTP 請求的路徑都必須走
     * {@link #projectFacts(RdmFactVO.FactQuery, Long)} 並傳入認證用戶 id，由 {@code RdmAccessGuard}
     * 裁決可見範圍；<b>禁止</b>把本方法暴露給請求側當作「看全部」的後門，也禁止用請求傳入的
     * userId 調用本方法（那等於繞過權限收斂）。
     */
    public List<RdmFactVO.ProjectFact> projectFactsForSystem(RdmFactVO.FactQuery query) {
        RdmFactVO.Scope scope = new RdmFactVO.Scope();
        scope.setAuthenticated(true);
        scope.setCanSeeAll(true);
        scope.setRestricted(false);
        scope.setProjectIds(new ArrayList<>());
        scope.setComputedAt(DateTimeUtils.format(LocalDateTime.now()));
        return toProjectFacts(loadSnapshot(scope, normalize(query)));
    }

    /**
     * 項目事實分頁（總覽列表用）。
     *
     * <p><b>為什麼在內存切片而不是 {@code selectPage}</b>：統計卡必須與列表<b>同一批</b>項目事實行，
     * 否則「卡片按全量算、列表按當前頁算」就會重新出現兩個數字。這裡先算出範圍內全部事實行
     * （與 {@link #cards} 用的是同一個 {@link Snapshot}），再按 {@code updatedAt desc} 切片，
     * {@code total} 就是全部事實行數 —— 卡片、列表、導出、對賬因此恆等。
     *
     * <p>RDM 項目是「多需求協同交付」的組織單位，量級遠小於交付項/任務，全量載入後切片的代價可接受；
     * 若後續項目數增長到需要 DB 分頁，應改為「先分頁取項目ID、再對這批ID算事實、卡片另走同一批ID」，
     * 絕不能讓卡片與列表各查一次。
     */
    public com.baomidou.mybatisplus.extension.plugins.pagination.Page<RdmFactVO.ProjectFact> projectFactPage(
            RdmFactVO.FactQuery query, Long userId, Integer pageNo, Integer pageSize) {
        List<RdmFactVO.ProjectFact> all = applyDrill(projectFacts(query, userId), query == null ? null : query.getDrill());
        long current = pageNo == null || pageNo < 1 ? 1L : pageNo;
        long size = pageSize == null || pageSize < 1 ? 20L : Math.min(pageSize, 200L);
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<RdmFactVO.ProjectFact> page =
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(current, size, all.size());
        int from = (int) Math.min((current - 1) * size, all.size());
        int to = (int) Math.min(from + size, all.size());
        page.setRecords(new ArrayList<>(all.subList(from, to)));
        return page;
    }

    /**
     * 统计卡下钻的口径过滤（仅列表走这里）。
     *
     * <p><b>为什么必须在服务端</b>：前端过去只能过滤“当前已加载的那一页”，
     * 卡片说的是范围内全部项目的数、表格只给本页命中的行，跳页时两个数永远对不上；
     * 口径一旦分别写在两端（前端谓词 vs {@link #toProjectFacts} 的 inProgress/attention）就一定漂移，
     * 实测出现过「卡片 4 / 下钻 0 行」。现在卡片与下钻共用 {@link RdmFactVO.ProjectFact} 上的同一批布尔位。
     *
     * <p>未知口径一律抛错而不是“当没传”：静默返回全量会让用户以为看到的就是该口径。
     */
    static List<RdmFactVO.ProjectFact> applyDrill(List<RdmFactVO.ProjectFact> facts, String drill) {
        if (!StringUtils.hasText(drill)) {
            return facts;
        }
        String key = drill.trim();
        List<RdmFactVO.ProjectFact> kept = facts.stream().filter(f -> switch (key) {
            // 与卡片 inProgressCount 同源：preparing + in_progress
            case DRILL_IN_PROGRESS -> f.isInProgress();
            // 与卡片 attentionCount 同源：风险 / 逾期 / 已暂停（不含阻塞数）
            case DRILL_ATTENTION -> f.isAttention();
            // 卡片是“待裁决事项总数”，下钻行是“持有待裁决事项的项目”；
            // 两个数天生不等位（一个是事项数、一个是项目数），前端已负责把口径文案区分开
            case DRILL_PENDING -> f.getPendingDecisionCount() > 0;
            default -> throw new BusinessException("不支援的下钻口径: " + key);
        }).toList();
        return new ArrayList<>(kept);
    }

    /**
     * 對賬口径（A.7）：同一批數據用<b>兩條獨立路徑</b>各算一次，不等即逐條寫入
     * {@link RdmFactVO.Reconciliation#getMismatches()}。
     * <p>路徑A = 從項目事實行逐項相加；路徑B = 繞開聚合、直接查庫 / 直接數明細行。
     */
    public RdmFactVO.Reconciliation reconcile(RdmFactVO.FactQuery query, Long userId) {
        Snapshot snapshot = loadSnapshot(resolveScope(userId), normalize(query));
        List<RdmFactVO.ProjectFact> projects = toProjectFacts(snapshot);
        return toReconciliation(snapshot, projects, toCards(snapshot, projects));
    }

    /**
     * 全量導出包（A.7，供任務23 前端 ExcelJS 多 Sheet 導出消費）。
     *
     * <p><b>全量語義</b>：範圍內<b>全部</b>項目 / 交付項 / 待辦 + 統計卡 + 對賬結論，
     * 不是當前頁、也不是前端「已加載行」。前端不得再用表格已渲染的 dataSource 拼導出
     * （翻頁沒翻到的行會靜默缺失，且與卡片對不上）。
     */
    public RdmFactVO.ExportBundle exportBundle(RdmFactVO.FactQuery query, Long userId) {
        RdmFactVO.Scope scope = resolveScope(userId);
        Snapshot snapshot = loadSnapshot(scope, normalize(query));
        List<RdmFactVO.ProjectFact> projects = toProjectFacts(snapshot);
        RdmFactVO.CardSummary cards = toCards(snapshot, projects);

        RdmFactVO.ExportBundle bundle = new RdmFactVO.ExportBundle();
        bundle.setScope(scope);
        bundle.setCards(cards);
        bundle.setProjects(projects);
        bundle.setItems(snapshot.itemFacts);
        bundle.setTodos(snapshot.board == null ? new ArrayList<>() : new ArrayList<>(snapshot.board.getTodos()));
        bundle.setReconciliation(toReconciliation(snapshot, projects, cards));
        bundle.setComputedAt(DateTimeUtils.format(LocalDateTime.now()));
        return bundle;
    }

    /* ==================== 快照载入（一次查库，多处聚合） ==================== */

    /** 範圍內全部事實的中間態；所有對外事實都從這裡聚合，不再回頭查庫。 */
    private static final class Snapshot {
        private RdmFactVO.Scope scope;
        private LocalDate today = LocalDate.now();
        private List<RdmProject> projects = new ArrayList<>();
        private List<RdmFactVO.ItemFact> itemFacts = new ArrayList<>();
        private Map<Long, List<RdmFactVO.ItemFact>> itemFactsByProject = new HashMap<>();
        /** 範圍內未決問題（待辦與對賬路徑A共用） */
        private List<RdmIssue> openIssues = new ArrayList<>();
        /** 原範圍延期殘餘延期單 */
        private List<RdmIssueDefer> residualDefers = new ArrayList<>();
        /** issueId → projectId（rdm_issue 無 project_id 列，由交付項/需求回填） */
        private Map<Long, Long> projectIdByIssueId = new HashMap<>();
        private Map<Long, Integer> requirementTotalByProject = new HashMap<>();
        private Map<Long, Integer> testBatchTotalByProject = new HashMap<>();
        /** 範圍內全部交付項ID（對賬路徑B 直接查庫用） */
        private List<Long> itemIds = new ArrayList<>();
        private RdmFactVO.TodoBoard board;
    }

    private Snapshot loadSnapshot(RdmFactVO.Scope scope, RdmFactVO.FactQuery query) {
        Snapshot s = new Snapshot();
        s.scope = scope;
        s.projects = queryProjects(scope, query);
        if (s.projects.isEmpty()) {
            // 範圍為空（未登錄 / 未參與任何項目 / 篩選無命中）：所有事實恆為 0，且不发多余 SQL
            if (query.isIncludeTodos()) {
                s.board = todoBoardService.build(todoInput(s, scope));
            }
            return s;
        }

        List<Long> projectIds = ids(s.projects, RdmProject::getId);
        List<RdmDeliveryItem> items = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>().in(RdmDeliveryItem::getProjectId, projectIds));
        List<RdmRequirement> requirements = requirementMapper.selectList(
                new LambdaQueryWrapper<RdmRequirement>().in(RdmRequirement::getProjectId, projectIds));

        Map<Long, Long> projectByReqId = new HashMap<>();
        Map<Long, Integer> reqCount = new HashMap<>();
        for (RdmRequirement req : requirements) {
            if (req == null || req.getId() == null) {
                continue;
            }
            projectByReqId.put(req.getId(), req.getProjectId());
            if (req.getProjectId() != null) {
                reqCount.merge(req.getProjectId(), 1, Integer::sum);
            }
        }
        s.requirementTotalByProject = reqCount;
        s.testBatchTotalByProject = countTestBatchesByProject(requirements, projectByReqId);

        s.itemIds = ids(items, RdmDeliveryItem::getId);
        Map<Long, List<RdmWorkTask>> tasksByItem = loadTasksByItem(s.itemIds);
        Map<Long, List<RdmIssue>> issuesByItem = loadIssuesByItem(s.itemIds);
        Map<Long, List<RdmIssueDefer>> defersByIssue = loadApprovedDefersByIssue(s.itemIds, issuesByItem);
        Map<Long, RdmIssueFollowup> activeFollowupByIssue = loadActiveFollowups(issuesByItem);
        Map<Long, String> statusByIdOfFollowupIssues = loadFollowupIssueStatuses(activeFollowupByIssue);

        List<RdmFactVO.ItemFact> facts = new ArrayList<>();
        for (RdmDeliveryItem item : items) {
            if (item == null || item.getId() == null) {
                continue;
            }
            List<RdmIssue> itemIssues = issuesByItem.getOrDefault(item.getId(), List.of());
            RdmFactVO.ItemFact fact = toItemFact(item, s.today,
                    tasksByItem.getOrDefault(item.getId(), List.of()),
                    itemIssues,
                    countResidualDefers(item, itemIssues, defersByIssue, activeFollowupByIssue,
                            statusByIdOfFollowupIssues));
            facts.add(fact);
            // issueId → projectId 回填：問題待辦與延期殘餘待辦都要能歸到項目行，否則卡片與行級對不上
            for (RdmIssue issue : itemIssues) {
                if (issue != null && issue.getId() != null) {
                    s.projectIdByIssueId.put(issue.getId(), item.getProjectId());
                }
            }
        }
        s.itemFacts = facts;
        s.itemFactsByProject = facts.stream()
                .filter(f -> f.getProjectId() != null)
                .collect(java.util.stream.Collectors.groupingBy(RdmFactVO.ItemFact::getProjectId));

        s.openIssues = facts.isEmpty() ? new ArrayList<>() : collectOpenIssues(issuesByItem);
        s.residualDefers = collectResidualDefers(items, issuesByItem, defersByIssue,
                activeFollowupByIssue, statusByIdOfFollowupIssues);

        if (query.isIncludeTodos()) {
            s.board = todoBoardService.build(todoInput(s, scope));
        }
        return s;
    }

    private RdmTodoBoardService.TodoInput todoInput(Snapshot s, RdmFactVO.Scope scope) {
        RdmTodoBoardService.TodoInput input = new RdmTodoBoardService.TodoInput();
        input.setUserId(scope.getUserId());
        input.setAuthenticated(scope.isAuthenticated());
        input.setItems(s.itemFacts);
        input.setOpenIssues(s.openIssues);
        input.setResidualDefers(s.residualDefers);
        input.setProjects(s.projects);
        input.setProjectIdByIssueId(s.projectIdByIssueId);
        input.setToday(s.today);
        return input;
    }

    /**
     * 提測批次數按<b>需求ID集合</b>統計（A.5 第1條）。
     *
     * <p><b>空集合直接返回空 Map 且不發 SQL</b>：{@code in(column, emptyList)} 在 MyBatis-Plus 下
     * 會生成非法的 {@code IN ()} 或被忽略而退化為全表命中，兩種結果都是錯的。
     * 舊實現 {@code eq(RdmTestBatch::getReqId, projectReqIds(projectId))} 更是對集合用了 {@code eq} 單值條件。
     */
    private Map<Long, Integer> countTestBatchesByProject(List<RdmRequirement> requirements,
                                                         Map<Long, Long> projectByReqId) {
        Map<Long, Integer> result = new HashMap<>();
        List<Long> reqIds = ids(requirements, RdmRequirement::getId);
        if (reqIds.isEmpty()) {
            return result;
        }
        List<RdmTestBatch> batches = testBatchMapper.selectList(
                new LambdaQueryWrapper<RdmTestBatch>().in(RdmTestBatch::getReqId, reqIds));
        for (RdmTestBatch batch : batches) {
            if (batch == null || batch.getReqId() == null) {
                continue;
            }
            Long projectId = projectByReqId.get(batch.getReqId());
            if (projectId != null) {
                result.merge(projectId, 1, Integer::sum);
            }
        }
        return result;
    }

    private Map<Long, List<RdmWorkTask>> loadTasksByItem(List<Long> itemIds) {
        if (itemIds.isEmpty()) {
            return Map.of();
        }
        return taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                        .in(RdmWorkTask::getDeliveryItemId, itemIds)
                        .ne(RdmWorkTask::getStatus, TASK_STATUS_CANCELLED))
                .stream()
                .filter(t -> t != null && t.getDeliveryItemId() != null)
                .collect(java.util.stream.Collectors.groupingBy(RdmWorkTask::getDeliveryItemId));
    }

    private Map<Long, List<RdmIssue>> loadIssuesByItem(List<Long> itemIds) {
        if (itemIds.isEmpty()) {
            return Map.of();
        }
        return issueMapper.selectList(new LambdaQueryWrapper<RdmIssue>()
                        .in(RdmIssue::getDeliveryItemId, itemIds))
                .stream()
                .filter(i -> i != null && i.getDeliveryItemId() != null)
                .collect(java.util.stream.Collectors.groupingBy(RdmIssue::getDeliveryItemId));
    }

    /** 只載入<b>已批准</b>的延期單（{@link RdmConstants#DEFER_APPROVED_STATUSES}）：待裁決/駁回的延期不構成殘餘。 */
    private Map<Long, List<RdmIssueDefer>> loadApprovedDefersByIssue(List<Long> itemIds,
                                                                    Map<Long, List<RdmIssue>> issuesByItem) {
        List<Long> issueIds = new ArrayList<>();
        for (List<RdmIssue> list : issuesByItem.values()) {
            for (RdmIssue issue : list) {
                if (issue != null && issue.getId() != null) {
                    issueIds.add(issue.getId());
                }
            }
        }
        if (issueIds.isEmpty() || itemIds.isEmpty()) {
            return Map.of();
        }
        return issueDeferMapper.selectList(new LambdaQueryWrapper<RdmIssueDefer>()
                        .in(RdmIssueDefer::getIssueId, issueIds)
                        .in(RdmIssueDefer::getStatus, RdmConstants.DEFER_APPROVED_STATUSES))
                .stream()
                .filter(d -> d != null && d.getIssueId() != null)
                .collect(java.util.stream.Collectors.groupingBy(RdmIssueDefer::getIssueId));
    }

    /** 每个问题的最新有效承接（active=1，按 id 降序取第一条），与任务21 {@code findActiveFollowup} 同口径。 */
    private Map<Long, RdmIssueFollowup> loadActiveFollowups(Map<Long, List<RdmIssue>> issuesByItem) {
        List<Long> issueIds = new ArrayList<>();
        for (List<RdmIssue> list : issuesByItem.values()) {
            for (RdmIssue issue : list) {
                if (issue != null && issue.getId() != null) {
                    issueIds.add(issue.getId());
                }
            }
        }
        if (issueIds.isEmpty()) {
            return Map.of();
        }
        List<RdmIssueFollowup> followups = issueFollowupMapper.selectList(
                new LambdaQueryWrapper<RdmIssueFollowup>()
                        .in(RdmIssueFollowup::getIssueId, issueIds)
                        .eq(RdmIssueFollowup::getActive, RdmConstants.FOLLOWUP_ACTIVE));
        Map<Long, RdmIssueFollowup> latest = new HashMap<>();
        for (RdmIssueFollowup f : followups) {
            if (f == null || f.getIssueId() == null) {
                continue;
            }
            RdmIssueFollowup existing = latest.get(f.getIssueId());
            if (existing == null || compareById(f, existing) > 0) {
                latest.put(f.getIssueId(), f);
            }
        }
        return latest;
    }

    /** 承接所指新问题的状态（判断承接是否已闭环），一次集合查询，空集合不发 SQL。 */
    private Map<Long, String> loadFollowupIssueStatuses(Map<Long, RdmIssueFollowup> activeFollowupByIssue) {
        List<Long> activeIssueIds = activeFollowupByIssue.values().stream()
                .map(RdmIssueFollowup::getActiveIssueId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (activeIssueIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> statuses = new HashMap<>();
        for (RdmIssue issue : issueMapper.selectList(
                new LambdaQueryWrapper<RdmIssue>().in(RdmIssue::getId, activeIssueIds))) {
            if (issue != null && issue.getId() != null) {
                statuses.put(issue.getId(), issue.getStatus());
            }
        }
        return statuses;
    }

    private static int compareById(RdmIssueFollowup a, RdmIssueFollowup b) {
        long left = a.getId() == null ? Long.MIN_VALUE : a.getId();
        long right = b.getId() == null ? Long.MIN_VALUE : b.getId();
        return Long.compare(left, right);
    }

    /* ==================== 交付项事实 ==================== */

    private RdmFactVO.ItemFact toItemFact(RdmDeliveryItem item, LocalDate today, List<RdmWorkTask> tasks,
                                          List<RdmIssue> itemIssues, int deferResidualCount) {
        RdmFactVO.ItemFact f = new RdmFactVO.ItemFact();
        f.setItemId(item.getId());
        f.setItemNo(item.getItemNo());
        f.setTitle(item.getTitle());
        f.setProjectId(item.getProjectId());
        f.setReqId(item.getReqId());
        f.setStatus(item.getStatus());
        f.setScopeVersion(item.getScopeVersion() == null ? 0 : item.getScopeVersion());
        // B.2：并发版本随事实行一路带到待办与通知，作为去重 event_version 的 VERSION:<n>
        f.setVersion(item.getVersion());
        f.setScopeFrozen(item.getScopeFrozenAt() != null);
        f.setCoordinatorUserId(item.getCoordinatorUserId());
        f.setCoordinatorUserName(item.getCoordinatorUserName());
        f.setProductAcceptorUserId(item.getProductAcceptorUserId());
        f.setProductAcceptorUserName(item.getProductAcceptorUserName());
        f.setBizAcceptorUserId(item.getBizAcceptorUserId());
        f.setBizAcceptorUserName(item.getBizAcceptorUserName());
        f.setAcceptancePath(item.getAcceptancePath());
        f.setPlanStartDate(DateTimeUtils.format(item.getPlanStartDate()));
        f.setPlanEndDate(DateTimeUtils.format(item.getPlanEndDate()));
        f.setDelivered(RdmConstants.DI_DONE.equals(item.getStatus()));
        f.setBlocked(Integer.valueOf(1).equals(item.getBlockedFlag()));
        f.setOverdue(!f.isDelivered() && item.getPlanEndDate() != null && item.getPlanEndDate().isBefore(today));

        int total = 0;
        int done = 0;
        int doing = 0;
        for (RdmWorkTask task : tasks) {
            if (task == null) {
                continue;
            }
            total++;
            if (TASK_STATUS_DONE.equals(task.getStatus())) {
                done++;
            } else if (TASK_STATUS_DOING.equals(task.getStatus())) {
                doing++;
            }
        }
        f.setTaskTotal(total);
        f.setTaskCompleted(done);
        f.setTaskInProgress(doing);
        // 跨交付項依賴阻斷：複用調度側口徑，不自行推導，避免關鍵路徑口徑分裂
        f.setBlockedTaskCount(scheduleService.getBlockedTasks(item.getId()).size());

        // A.5：測試/驗收是任務20 的獨立權威事實，絕不由任務狀態或交付項狀態推導
        f.setTestPassed(testBatchService.isTestPassed(item.getId()));
        f.setProductAccepted(acceptanceRecordService.hasProductAcceptancePassed(item.getId(), item.getScopeVersion()));
        f.setBizAccepted(acceptanceRecordService.hasBizAcceptancePassed(item.getId(), item.getScopeVersion()));

        int open = 0;
        int critical = 0;
        int major = 0;
        for (RdmIssue issue : itemIssues) {
            if (issue == null || !RdmConstants.ISSUE_OPEN_STATUSES.contains(issue.getStatus())) {
                continue;
            }
            open++;
            if (RdmConstants.SEV_CRITICAL.equals(issue.getSeverity())) {
                critical++;
            } else if (RdmConstants.SEV_MAJOR.equals(issue.getSeverity())) {
                major++;
            }
        }
        f.setOpenIssueCount(open);
        f.setCriticalIssueCount(critical);
        f.setMajorIssueCount(major);
        // 行級「待裁決」與卡片同條件（未決問題），故恆等於 openIssueCount；
        // 保留兩個字段只是因為卡片文案叫「待裁決」、行級叫「未決問題」，絕不允許取不同條件。
        f.setPendingDecisionCount(open);
        f.setDeferResidualCount(deferResidualCount);
        f.setActionUrl(RdmConstants.deliveryItemRoute(item.getId()));
        return f;
    }

    /* ==================== 原范围延期残余（A.5 第6条） ==================== */

    /**
     * 判定「原範圍延期殘餘」。
     *
     * <p>三個條件<b>同時</b>成立才算殘餘：
     * <ol>
     *   <li><b>延期已批准</b>：{@code defer.status ∈ }{@link RdmConstants#DEFER_APPROVED_STATUSES}
     *       （{@code pending_bind} / {@code effective}）。僅憑問題狀態 {@code deferred} 不算 ——
     *       那是任務21 明確禁止的口徑（未批先延）。</li>
     *   <li><b>屬於舊範圍</b>：{@code defer.scopeVersion < item.scopeVersion}。
     *       範圍變更後，這筆欠帳的證據（舊版本的提測批次/驗收記錄）已被
     *       {@code RdmEvidenceInvalidation} 登記失效，因此它<b>不會</b>再出現在
     *       {@link RdmFactVO.ItemFact#isOpenIssueCount()}（問題狀態已非 open）也不會被
     *       {@code isTestPassed}/{@code hasXAcceptancePassed} 採信 —— 如果這裡不單獨呈現，
     *       「改一次範圍就把延期問題洗白」。</li>
     *   <li><b>承接尚未閉環</b>：沒有有效承接（{@code active=1}）、或承接未綁定新問題
     *       （{@code activeIssueId==null}）、或承接所指的新問題仍未關閉
     *       （{@code status ∉ }{@link RdmConstants#ISSUE_CLOSED_STATUSES}）。已閉環的不再算欠帳。</li>
     * </ol>
     *
     * <p>證據失效維度<b>不在本類重複實現</b>：它由任務20 的
     * {@link RdmTestBatchService#isTestPassed} / {@link RdmAcceptanceRecordService#hasProductAcceptancePassed}
     * 內部過濾，本類只消費結論。兩處各寫一套失效過濾正是任務20 註釋裡點名的漂移風險。
     */
    private boolean isResidualDefer(RdmDeliveryItem item, RdmIssueDefer defer,
                                    Map<Long, RdmIssueFollowup> activeFollowupByIssue,
                                    Map<Long, String> statusByIdOfFollowupIssues) {
        if (defer == null || defer.getIssueId() == null) {
            return false;
        }
        if (!RdmConstants.DEFER_APPROVED_STATUSES.contains(defer.getStatus())) {
            return false;
        }
        Integer deferVersion = defer.getScopeVersion();
        Integer itemVersion = item == null ? null : item.getScopeVersion();
        if (deferVersion == null || itemVersion == null || deferVersion >= itemVersion) {
            return false; // 同一範圍內的延期由問題口徑呈現，不算「原範圍殘餘」
        }
        RdmIssueFollowup followup = activeFollowupByIssue.get(defer.getIssueId());
        if (followup == null || followup.getActiveIssueId() == null) {
            return true; // 已批准但承接未綁定 → 欠帳仍在
        }
        String activeStatus = statusByIdOfFollowupIssues.get(followup.getActiveIssueId());
        return activeStatus == null || !RdmConstants.ISSUE_CLOSED_STATUSES.contains(activeStatus);
    }

    private int countResidualDefers(RdmDeliveryItem item, List<RdmIssue> itemIssues,
                                    Map<Long, List<RdmIssueDefer>> defersByIssue,
                                    Map<Long, RdmIssueFollowup> activeFollowupByIssue,
                                    Map<Long, String> statusByIdOfFollowupIssues) {
        int count = 0;
        for (RdmIssue issue : itemIssues) {
            if (issue == null || issue.getId() == null) {
                continue;
            }
            for (RdmIssueDefer defer : defersByIssue.getOrDefault(issue.getId(), List.of())) {
                if (isResidualDefer(item, defer, activeFollowupByIssue, statusByIdOfFollowupIssues)) {
                    count++;
                }
            }
        }
        return count;
    }

    /**
     * 範圍內全部殘餘延期單（去重後）。
     * <p>與 {@link #countResidualDefers} 用<b>同一個</b> {@link #isResidualDefer} 判定，
     * 因此「各交付項殘餘數相加」恆等於「殘餘延期單條數」—— 這條恆等式就是對賬路徑A/路徑B 的核對點。
     */
    private List<RdmIssueDefer> collectResidualDefers(List<RdmDeliveryItem> items,
                                                      Map<Long, List<RdmIssue>> issuesByItem,
                                                      Map<Long, List<RdmIssueDefer>> defersByIssue,
                                                      Map<Long, RdmIssueFollowup> activeFollowupByIssue,
                                                      Map<Long, String> statusByIdOfFollowupIssues) {
        List<RdmIssueDefer> result = new ArrayList<>();
        Map<Long, RdmDeliveryItem> itemById = new HashMap<>();
        for (RdmDeliveryItem item : items) {
            if (item != null && item.getId() != null) {
                itemById.put(item.getId(), item);
            }
        }
        for (Map.Entry<Long, List<RdmIssue>> entry : issuesByItem.entrySet()) {
            RdmDeliveryItem item = itemById.get(entry.getKey());
            if (item == null) {
                continue;
            }
            for (RdmIssue issue : entry.getValue()) {
                if (issue == null || issue.getId() == null) {
                    continue;
                }
                for (RdmIssueDefer defer : defersByIssue.getOrDefault(issue.getId(), List.of())) {
                    if (isResidualDefer(item, defer, activeFollowupByIssue, statusByIdOfFollowupIssues)) {
                        result.add(defer);
                    }
                }
            }
        }
        return result;
    }

    private static List<RdmIssue> collectOpenIssues(Map<Long, List<RdmIssue>> issuesByItem) {
        List<RdmIssue> open = new ArrayList<>();
        for (List<RdmIssue> list : issuesByItem.values()) {
            for (RdmIssue issue : list) {
                if (issue != null && RdmConstants.ISSUE_OPEN_STATUSES.contains(issue.getStatus())) {
                    open.add(issue);
                }
            }
        }
        open.sort(Comparator.comparing(RdmIssue::getId, Comparator.nullsLast(Comparator.naturalOrder())));
        return open;
    }

    /* ==================== 项目事实 ==================== */

    private List<RdmFactVO.ProjectFact> toProjectFacts(Snapshot s) {
        List<RdmFactVO.ProjectFact> result = new ArrayList<>();
        Map<Long, int[]> todoCountsByProject = groupTodoCounts(s.board);
        // 负责人工号一次 IN 回填：项目列表是管理者识别人的主场景，只有姓名时同名同事无法区分
        Set<Long> ownerIds = new HashSet<>();
        for (RdmProject project : s.projects) {
            if (project == null) {
                continue;
            }
            if (project.getPmUserId() != null) {
                ownerIds.add(project.getPmUserId());
            }
            if (project.getProductOwnerUserId() != null) {
                ownerIds.add(project.getProductOwnerUserId());
            }
        }
        Map<Long, String> ownerEmpNos = new HashMap<>();
        if (!ownerIds.isEmpty()) {
            userMapper.selectBatchIds(ownerIds).forEach(u -> {
                if (u.getId() != null && StringUtils.hasText(u.getEmpId())) {
                    ownerEmpNos.put(u.getId(), u.getEmpId());
                }
            });
        }
        for (RdmProject project : s.projects) {
            if (project == null || project.getId() == null) {
                continue;
            }
            result.add(toProjectFact(project, s, todoCountsByProject.get(project.getId()), ownerEmpNos));
        }
        return result;
    }

    /**
     * 待辦計數按項目分組。
     * <p><b>只算一次看板、再按項目切分</b>，而不是逐項目各建一次看板：
     * 逐項目建會讓「同一個人同一個對象」在跨項目視角下被算多次（分組相加產生重複），
     * 這正是 A.3 要消滅的缺陷。切分後 {@code Σ project.todoTotal == board.total} 恆成立，
     * 因為範圍內每條待辦都能歸到唯一項目（問題的 projectId 已在快照載入時回填）。
     */
    private Map<Long, int[]> groupTodoCounts(RdmFactVO.TodoBoard board) {
        Map<Long, int[]> counts = new HashMap<>();
        if (board == null || board.getTodos() == null) {
            return counts;
        }
        for (RdmFactVO.Todo todo : board.getTodos()) {
            if (todo == null || todo.getProjectId() == null) {
                continue;
            }
            int[] c = counts.computeIfAbsent(todo.getProjectId(), k -> new int[4]);
            c[0]++;
            String bucket = todo.getBucket() == null ? "" : todo.getBucket();
            if (RdmConstants.TODO_BUCKET_MINE.equals(bucket)) {
                c[1]++;
            } else if (RdmConstants.TODO_BUCKET_WAITING_OTHERS.equals(bucket)) {
                c[2]++;
            } else {
                c[3]++;
            }
        }
        return counts;
    }

    private RdmFactVO.ProjectFact toProjectFact(RdmProject p, Snapshot s, int[] todoCounts, Map<Long, String> ownerEmpNos) {
        RdmFactVO.ProjectFact f = new RdmFactVO.ProjectFact();
        f.setProjectId(p.getId());
        f.setProjectNo(p.getProjectNo());
        f.setProjectName(p.getName());
        f.setObjective(p.getObjective());
        f.setStatus(p.getStatus());
        f.setPmUserId(p.getPmUserId());
        f.setPmUserName(p.getPmUserName());
        f.setPmUserEmpNo(p.getPmUserId() == null ? null : ownerEmpNos.get(p.getPmUserId()));
        f.setProductOwnerUserId(p.getProductOwnerUserId());
        f.setProductOwnerUserName(p.getProductOwnerUserName());
        f.setProductOwnerUserEmpNo(p.getProductOwnerUserId() == null ? null : ownerEmpNos.get(p.getProductOwnerUserId()));
        // 角色负责人直接取项目主表快照：看板“相關負責人”只展示已配置的人，不在这里做成员表联查。
        // userId 一并带出：日报收件人要按角色推导到人，只有姓名无法映射钉钉 userId
        f.setTechLeadUserId(p.getTechLeadUserId());
        f.setTechLeadUserName(p.getTechLeadUserName());
        f.setQaLeadUserId(p.getQaLeadUserId());
        f.setQaLeadUserName(p.getQaLeadUserName());
        f.setUiDesignerUserId(p.getUiDesignerUserId());
        f.setUiDesignerUserName(p.getUiDesignerUserName());
        f.setOpsLeadUserId(p.getOpsLeadUserId());
        f.setOpsLeadUserName(p.getOpsLeadUserName());
        f.setPlanStartDate(DateTimeUtils.format(p.getPlanStartDate()));
        f.setPlanEndDate(DateTimeUtils.format(p.getPlanEndDate()));
        f.setPausedFlag(p.getPausedFlag());
        f.setRiskFlag(p.getRiskFlag());
        f.setOverdueFlag(p.getOverdueFlag());
        f.setVersion(p.getVersion());
        f.setCreatedAt(DateTimeUtils.format(p.getCreatedAt()));
        f.setUpdatedAt(DateTimeUtils.format(p.getUpdatedAt()));
        f.setUpdatedBy(p.getUpdatedBy());
        f.setRequirementTotal(s.requirementTotalByProject.getOrDefault(p.getId(), 0));
        f.setTestBatchTotal(s.testBatchTotalByProject.getOrDefault(p.getId(), 0));

        List<RdmFactVO.ItemFact> items = s.itemFactsByProject.getOrDefault(p.getId(), List.of());
        int completed = 0;
        int inProgress = 0;
        int testing = 0;
        int pendingAcceptance = 0;
        int blocked = 0;
        int overdue = 0;
        int testPassed = 0;
        int productAccepted = 0;
        int bizAccepted = 0;
        int taskTotal = 0;
        int taskCompleted = 0;
        int taskInProgress = 0;
        int blockedTask = 0;
        int issueOpen = 0;
        int issueCritical = 0;
        int issueMajor = 0;
        int pendingDecision = 0;
        int deferResidual = 0;
        LocalDate next = null;
        for (RdmFactVO.ItemFact item : items) {
            if (item.isDelivered()) {
                completed++;
            } else {
                if (RdmConstants.DI_ACTIVE_STATUSES.contains(item.getStatus())) {
                    inProgress++;
                }
                if (RdmConstants.DI_TESTING.equals(item.getStatus())) {
                    testing++;
                }
                // 「到达验收环节」的定义只有一处（RdmTodoBoardService），待办与统计不可能漂移
                if (RdmTodoBoardService.isReachedAcceptanceStage(item)) {
                    pendingAcceptance++;
                }
                if (item.isBlocked()) {
                    blocked++;
                }
                if (item.isOverdue()) {
                    overdue++;
                }
                LocalDate end = parseDate(item.getPlanEndDate());
                if (end != null && (next == null || end.isBefore(next))) {
                    next = end;
                }
            }
            if (item.isTestPassed()) {
                testPassed++;
            }
            if (item.isProductAccepted()) {
                productAccepted++;
            }
            if (item.isBizAccepted()) {
                bizAccepted++;
            }
            taskTotal += item.getTaskTotal();
            taskCompleted += item.getTaskCompleted();
            taskInProgress += item.getTaskInProgress();
            blockedTask += item.getBlockedTaskCount();
            issueOpen += item.getOpenIssueCount();
            issueCritical += item.getCriticalIssueCount();
            issueMajor += item.getMajorIssueCount();
            pendingDecision += item.getPendingDecisionCount();
            deferResidual += item.getDeferResidualCount();
        }
        f.setDeliveryItemTotal(items.size());
        f.setDeliveryItemCompleted(completed);
        f.setDeliveryItemInProgress(inProgress);
        f.setDeliveryItemTesting(testing);
        f.setDeliveryItemPendingAcceptance(pendingAcceptance);
        f.setDeliveryItemBlocked(blocked);
        f.setDeliveryItemOverdue(overdue);
        f.setTestPassedItemCount(testPassed);
        f.setProductAcceptedItemCount(productAccepted);
        f.setBizAcceptedItemCount(bizAccepted);
        f.setTaskTotal(taskTotal);
        f.setTaskCompleted(taskCompleted);
        f.setTaskInProgress(taskInProgress);
        f.setBlockedTaskCount(blockedTask);
        f.setIssueOpen(issueOpen);
        f.setIssueCritical(issueCritical);
        f.setIssueMajor(issueMajor);
        f.setPendingDecisionCount(pendingDecision);
        f.setDeferResidualCount(deferResidual);
        f.setNextDeliveryDate(DateTimeUtils.format(next));

        // 關閉 ≠ 交付完成：兩個獨立布爾，任何一處把它們相加或互相推導都會被對賬檢出
        f.setAllDelivered(RdmConstants.PROJECT_ALL_DELIVERED.equals(p.getStatus()));
        f.setClosed(RdmConstants.PROJECT_CLOSED.equals(p.getStatus()));
        f.setAttention(Integer.valueOf(1).equals(p.getRiskFlag())
                || Integer.valueOf(1).equals(p.getOverdueFlag())
                || Integer.valueOf(1).equals(p.getPausedFlag()));
        f.setInProgress(RdmConstants.PROJECT_PREPARING.equals(p.getStatus())
                || RdmConstants.PROJECT_IN_PROGRESS.equals(p.getStatus()));

        if (todoCounts != null) {
            f.setTodoTotal(todoCounts[0]);
            f.setTodoMineCount(todoCounts[1]);
            f.setTodoWaitingOthersCount(todoCounts[2]);
            f.setTodoUnassignedCount(todoCounts[3]);
        }
        f.setActionUrl(RdmConstants.projectDetailRoute(p.getId()));
        f.setComputedAt(DateTimeUtils.format(LocalDateTime.now()));
        return f;
    }

    /* ==================== 统计卡 ==================== */

    private RdmFactVO.CardSummary toCards(Snapshot s) {
        return toCards(s, toProjectFacts(s));
    }

    /**
     * 統計卡<b>由項目事實行聚合</b>而來，不另查一次庫。
     * <p>這是「卡片 = 行級相加」的結構保證：卡片沒有自己的查詢條件，就不可能與行級條件漂移。
     */
    private RdmFactVO.CardSummary toCards(Snapshot s, List<RdmFactVO.ProjectFact> projects) {
        RdmFactVO.CardSummary c = new RdmFactVO.CardSummary();
        c.setTotalProjects(projects.size());
        int inProgress = 0;
        int attention = 0;
        int pendingDecision = 0;
        int active = 0;
        int allDelivered = 0;
        int closed = 0;
        int paused = 0;
        int totalItems = 0;
        int deliveredItems = 0;
        int blocked = 0;
        int testPassed = 0;
        int productAccepted = 0;
        int bizAccepted = 0;
        int issueOpen = 0;
        int issueCritical = 0;
        int deferResidual = 0;
        int todoTotal = 0;
        int todoMine = 0;
        int todoWaiting = 0;
        int todoUnassigned = 0;
        for (RdmFactVO.ProjectFact p : projects) {
            if (p.isInProgress()) {
                inProgress++;
            }
            if (p.isAttention()) {
                attention++;
            }
            pendingDecision += p.getPendingDecisionCount();
            if (RdmConstants.PROJECT_ACTIVE_STATUSES.contains(p.getStatus())) {
                active++;
            }
            if (p.isAllDelivered()) {
                allDelivered++;
            }
            if (p.isClosed()) {
                closed++;
            }
            if (Integer.valueOf(1).equals(p.getPausedFlag())) {
                paused++;
            }
            totalItems += p.getDeliveryItemTotal();
            deliveredItems += p.getDeliveryItemCompleted();
            blocked += p.getDeliveryItemBlocked();
            testPassed += p.getTestPassedItemCount();
            productAccepted += p.getProductAcceptedItemCount();
            bizAccepted += p.getBizAcceptedItemCount();
            issueOpen += p.getIssueOpen();
            issueCritical += p.getIssueCritical();
            deferResidual += p.getDeferResidualCount();
            todoTotal += p.getTodoTotal();
            todoMine += p.getTodoMineCount();
            todoWaiting += p.getTodoWaitingOthersCount();
            todoUnassigned += p.getTodoUnassignedCount();
        }
        c.setInProgressCount(inProgress);
        c.setAttentionCount(attention);
        c.setPendingDecisionCount(pendingDecision);
        c.setActiveProjects(active);
        c.setAllDeliveredProjects(allDelivered);
        c.setClosedProjects(closed);
        c.setPausedProjects(paused);
        c.setTotalDeliveryItems(totalItems);
        c.setDeliveredItems(deliveredItems);
        c.setBlockedCount(blocked);
        c.setTestPassedItemCount(testPassed);
        c.setProductAcceptedItemCount(productAccepted);
        c.setBizAcceptedItemCount(bizAccepted);
        c.setIssueOpen(issueOpen);
        c.setIssueCritical(issueCritical);
        c.setDeferResidualCount(deferResidual);
        c.setTodoTotal(todoTotal);
        c.setTodoMineCount(todoMine);
        c.setTodoWaitingOthersCount(todoWaiting);
        c.setTodoUnassignedCount(todoUnassigned);
        c.setComputedAt(DateTimeUtils.format(LocalDateTime.now()));
        // 卡片待辦若與看板不一致，說明有待辦沒能歸到項目行，必須暴露而不是靜默返回錯數
        if (s.board != null && todoTotal != s.board.getTotal()) {
            log.error("統計卡待辦數與看板不一致（存在無法歸項目的待辦）: card={}, board={}", todoTotal, s.board.getTotal());
        }
        return c;
    }

    /* ==================== 对账（A.7） ==================== */

    /**
     * 兩條獨立路徑各算一次並核對。
     *
     * <p>路徑B 的「直接查庫」刻意繞開聚合邏輯（另發一次 {@code selectCount}），
     * 這樣才能證明「聚合出來的數」與「直接數出來的數」相等；
     * 若兩條路徑共用同一段代碼，對賬就退化為 {@code x == x} 的同義反覆，什麼也證明不了。
     */
    private RdmFactVO.Reconciliation toReconciliation(Snapshot s, List<RdmFactVO.ProjectFact> projects,
                                                      RdmFactVO.CardSummary cards) {
        RdmFactVO.Reconciliation r = new RdmFactVO.Reconciliation();
        r.setComputedAt(DateTimeUtils.format(LocalDateTime.now()));

        // ---- 路径A：从项目事实行逐项相加 ----
        int projectCount = projects.size();
        int deliveryItemCount = 0;
        int pendingDecisionSum = 0;
        int deferResidualSum = 0;
        int closedProjectCount = 0;
        int allDeliveredProjectCount = 0;
        for (RdmFactVO.ProjectFact p : projects) {
            deliveryItemCount += p.getDeliveryItemTotal();
            pendingDecisionSum += p.getPendingDecisionCount();
            deferResidualSum += p.getDeferResidualCount();
            if (p.isClosed()) {
                closedProjectCount++;
            }
            if (p.isAllDelivered()) {
                allDeliveredProjectCount++;
            }
        }

        // ---- 路径B：绕开聚合，直接数明细行 / 直接查库 ----
        int projectRowCount = projects.size();
        int deliveryItemRowCount = s.itemFacts.size();
        int pendingDecisionDirect = s.itemIds.isEmpty() ? 0
                : Math.toIntExact(issueMapper.selectCount(new LambdaQueryWrapper<RdmIssue>()
                        .in(RdmIssue::getDeliveryItemId, s.itemIds)
                        .in(RdmIssue::getStatus, RdmConstants.ISSUE_OPEN_STATUSES)));
        int deferResidualDirect = s.residualDefers.size();
        int closedDirect = countProjectsByStatus(s.projects, RdmConstants.PROJECT_CLOSED);
        int allDeliveredDirect = countProjectsByStatus(s.projects, RdmConstants.PROJECT_ALL_DELIVERED);

        r.setProjectCount(projectCount);
        r.setProjectRowCount(projectRowCount);
        r.setDeliveryItemCount(deliveryItemCount);
        r.setDeliveryItemRowCount(deliveryItemRowCount);
        r.setPendingDecisionSum(pendingDecisionSum);
        r.setPendingDecisionDirect(pendingDecisionDirect);
        r.setDeferResidualSum(deferResidualSum);
        r.setDeferResidualDirect(deferResidualDirect);
        r.setClosedProjectCount(closedProjectCount);
        r.setAllDeliveredProjectCount(allDeliveredProjectCount);

        if (s.board != null) {
            r.setTodoTotal(s.board.getTotal());
            r.setTodoRowCount(s.board.getTodos() == null ? 0 : s.board.getTodos().size());
            r.setTodoBucketSum(s.board.getMineCount() + s.board.getWaitingOthersCount()
                    + s.board.getUnassignedCount());
            r.setTodoRawReasonHits(s.board.getRawReasonHits());
        }

        List<String> mismatches = new ArrayList<>();
        if (projectCount != projectRowCount) {
            mismatches.add("項目數不一致: 聚合=" + projectCount + ", 明細行=" + projectRowCount);
        }
        if (deliveryItemCount != deliveryItemRowCount) {
            mismatches.add("交付項數不一致: 逐項目相加=" + deliveryItemCount + ", 明細行=" + deliveryItemRowCount);
        }
        if (pendingDecisionSum != pendingDecisionDirect) {
            mismatches.add("待裁決數不一致: 行級相加=" + pendingDecisionSum + ", 直接查庫=" + pendingDecisionDirect);
        }
        if (cards != null && cards.getPendingDecisionCount() != pendingDecisionSum) {
            mismatches.add("待裁決數不一致: 卡片=" + cards.getPendingDecisionCount() + ", 行級相加=" + pendingDecisionSum);
        }
        if (deferResidualSum != deferResidualDirect) {
            mismatches.add("延期殘餘數不一致: 行級相加=" + deferResidualSum + ", 直接集合=" + deferResidualDirect);
        }
        if (closedProjectCount != closedDirect) {
            mismatches.add("已關閉項目數不一致: 聚合=" + closedProjectCount + ", 直接統計=" + closedDirect);
        }
        if (allDeliveredProjectCount != allDeliveredDirect) {
            mismatches.add("交付完成項目數不一致: 聚合=" + allDeliveredProjectCount + ", 直接統計=" + allDeliveredDirect);
        }
        if (closedProjectCount + allDeliveredProjectCount > projectCount) {
            mismatches.add("關閉與交付完成被混算: closed=" + closedProjectCount
                    + " + allDelivered=" + allDeliveredProjectCount + " > 項目總數=" + projectCount);
        }
        if (s.board != null) {
            if (r.getTodoTotal() != r.getTodoRowCount()) {
                mismatches.add("待辦總數與明細行數不一致（存在重複計數）: total=" + r.getTodoTotal()
                        + ", rows=" + r.getTodoRowCount());
            }
            if (r.getTodoTotal() != r.getTodoBucketSum()) {
                mismatches.add("待辦分桶不互斥或不窮盡: total=" + r.getTodoTotal()
                        + ", mine+waiting+unassigned=" + r.getTodoBucketSum());
            }
            if (r.getTodoRawReasonHits() < r.getTodoTotal()) {
                mismatches.add("去重前命中次數小於去重後待辦數（不可能）: raw=" + r.getTodoRawReasonHits()
                        + ", total=" + r.getTodoTotal());
            }
            if (cards != null && cards.getTodoTotal() != r.getTodoTotal()) {
                mismatches.add("卡片待辦數與看板不一致（存在無法歸項目的待辦）: card=" + cards.getTodoTotal()
                        + ", board=" + r.getTodoTotal());
            }
        }
        r.setMismatches(mismatches);
        r.setConsistent(mismatches.isEmpty());
        if (!mismatches.isEmpty()) {
            log.error("RDM 對賬不一致: {}", mismatches);
        }
        return r;
    }

    private static int countProjectsByStatus(List<RdmProject> projects, String status) {
        int count = 0;
        for (RdmProject p : projects) {
            if (p != null && status.equals(p.getStatus())) {
                count++;
            }
        }
        return count;
    }

    /* ==================== 查询构造 ==================== */

    /**
     * 按查詢條件 + 數據範圍取項目。
     * <p>{@code scope.restricted} 且 {@code projectIds} 為空時<b>直接返回空集合</b>，
     * 絕不省略 {@code in} 條件而退化為全表 —— 那就是 mine 變 all 的歷史缺陷。
     */
    private List<RdmProject> queryProjects(RdmFactVO.Scope scope, RdmFactVO.FactQuery query) {
        if (scope == null || !scope.isAuthenticated()) {
            return List.of();
        }
        LambdaQueryWrapper<RdmProject> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(RdmProject::getName, kw).or().like(RdmProject::getProjectNo, kw));
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(RdmProject::getStatus, query.getStatus().trim());
        }
        if (query.getPmUserId() != null) {
            wrapper.eq(RdmProject::getPmUserId, query.getPmUserId());
        }
        if (query.getProductOwnerUserId() != null) {
            wrapper.eq(RdmProject::getProductOwnerUserId, query.getProductOwnerUserId());
        }
        // 计划日期区间按「与项目计划区间有交集」判定：plan_start_date <= 所选止 AND plan_end_date >= 所选起。
        // 两个日期列都可空，未填计划的项目不满足任何区间，故必须配 isNotNull 排除（NULL 参与比较恒为 unknown）。
        LocalDate planFrom = parseFilterDate(query.getPlanDateFrom(), "計劃日期起");
        LocalDate planTo = parseFilterDate(query.getPlanDateTo(), "計劃日期止");
        if (planFrom != null) {
            wrapper.isNotNull(RdmProject::getPlanEndDate).ge(RdmProject::getPlanEndDate, planFrom);
        }
        if (planTo != null) {
            wrapper.isNotNull(RdmProject::getPlanStartDate).le(RdmProject::getPlanStartDate, planTo);
        }
        if (scope.isRestricted()) {
            List<Long> projectIds = scope.getProjectIds();
            if (projectIds == null || projectIds.isEmpty()) {
                return List.of();
            }
            wrapper.in(RdmProject::getId, projectIds);
        }
        wrapper.orderByDesc(RdmProject::getUpdatedAt);
        List<RdmProject> projects = projectMapper.selectList(wrapper);
        return projects == null ? List.of() : projects;
    }

    /** 單項目下鑽用的範圍：已通過資源守衛，故直接以該項目為可見集合（不再依賴成員行是否存在）。 */
    private RdmFactVO.Scope scopeOfProject(Long projectId, Long userId) {
        RdmFactVO.Scope base = resolveScope(userId);
        RdmFactVO.Scope scope = new RdmFactVO.Scope();
        scope.setUserId(base.getUserId());
        scope.setAuthenticated(base.isAuthenticated());
        scope.setCanSeeAll(base.isCanSeeAll());
        scope.setRestricted(true);
        scope.setProjectIds(new ArrayList<>(List.of(projectId)));
        scope.setComputedAt(base.getComputedAt());
        return scope;
    }

    private RdmFactVO.FactQuery queryOfProject() {
        RdmFactVO.FactQuery q = new RdmFactVO.FactQuery();
        q.setIncludeTodos(true);
        q.setIncludeItems(true);
        return q;
    }

    private static RdmFactVO.FactQuery normalize(RdmFactVO.FactQuery query) {
        return query == null ? new RdmFactVO.FactQuery() : query;
    }

    /** 我參與（在途）的項目ID集合；未登錄返回空集合（fail-closed）。 */
    private List<Long> joinedProjectIds(Long userId) {
        if (userId == null) {
            return new ArrayList<>();
        }
        List<RdmProjectMember> members = memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getUserId, userId)
                .isNull(RdmProjectMember::getLeaveTime));
        return members.stream()
                .map(RdmProjectMember::getProjectId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
    }

    /* ==================== 内部工具 ==================== */

    private static <T> List<Long> ids(List<T> list, java.util.function.Function<T, Long> getter) {
        if (list == null || list.isEmpty()) {
            return new ArrayList<>();
        }
        return list.stream()
                .filter(Objects::nonNull)
                .map(getter)
                .filter(Objects::nonNull)
                .distinct()
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
    }

    private static LocalDate parseDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        try {
            return LocalDate.parse(trimmed.substring(0, Math.min(10, trimmed.length())));
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * 解析筛选用日期。与 {@link #parseDate} 的区别：格式错必须抛出，不能返回 null。
     * <p>筛选条件被静默丢弃等于把用户要的小范围放大成全量返回（fail-open），比直接报错更危险；
     * 与「未知 drill 值一律拒」同一条口径。
     */
    private static LocalDate parseFilterDate(String value, String label) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        try {
            return LocalDate.parse(trimmed.substring(0, Math.min(10, trimmed.length())));
        } catch (RuntimeException e) {
            throw new BusinessException(label + "格式錯誤，應為 yyyy-MM-dd");
        }
    }
}
