package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 產研交付（RDM）統一事實投影（任務22）。
 *
 * <p>本 VO 是「一處計算、多處消費」的<b>唯一</b>出口形狀：項目總覽、統計卡片、項目下鑽、
 * 個人工作台待辦、全量導出、對賬全部消費 {@code RdmProjectFactService} 算出的同一批事實對象，
 * 因此卡片數字 = 行級數字 = 下鑽數字 = 導出數字 = 對賬數字，結構上不可能再出現「同一事實兩個數字」。
 *
 * <p>三條口徑紅線在形狀上就被固定下來：
 * <ol>
 *   <li><b>測試通過 / 驗收通過是獨立事實</b>：{@link ItemFact#isTestPassed()}、
 *       {@link ItemFact#isProductAccepted()}、{@link ItemFact#isBizAccepted()} 直接承載任務20
 *       的權威判定結果，<b>不得</b>由任務狀態或交付項狀態推導，故本 VO 不提供任何「按狀態換算」的便捷方法；</li>
 *   <li><b>關閉項目 ≠ 交付完成</b>：{@link ProjectFact#isAllDelivered()} 與 {@link ProjectFact#isClosed()}
 *       是兩個獨立布爾，任何一處把它們相加或互相推導都會被 {@link Reconciliation} 檢出；</li>
 *   <li><b>待辦三桶互斥且窮盡</b>：{@code mine + waitingOthers + unassigned == total}，
 *       且同一對象只出現一條（去重鍵 {@code objectType:refId}），{@link Todo#getReasons()} 只承載明細成因。</li>
 * </ol>
 *
 * <p>日期一律 {@code String}（{@code yyyy-MM-dd} / {@code yyyy-MM-dd HH:mm:ss}），與本項目既有 RDM VO 保持一致，
 * 避免前端再各自處理時區與格式。
 */
public class RdmFactVO {

    /* ==================== 查询条件 ==================== */

    /**
     * 事實查詢條件（與項目列表取數<b>同一組</b> filters）。
     * <p>統計卡必須跟隨篩選條件，禁止「卡片顯示全量、列表已篩選」的口徑錯位（前端 UI 規範 §E.8）。
     */
    @Data
    public static class FactQuery {
        /** 項目名稱 / 項目編號模糊匹配 */
        private String keyword;
        /** 項目狀態精確篩選 */
        private String status;
        /** 項目經理篩選 */
        private Long pmUserId;
        /** 產品負責人篩選（精確匹配 product_owner_user_id） */
        private Long productOwnerUserId;
        /**
         * 計劃日期區間（yyyy-MM-dd）：與項目「計劃開始~計劃結束」區間求交集（overlap），
         * 即 {@code plan_start_date <= planDateTo AND plan_end_date >= planDateFrom}；只給一側就只卡一側。
         * <p>必須在 SQL 側收窄（而非記憶體過濾），否則分頁 total 與統計卡都會錯。
         */
        private String planDateFrom;
        private String planDateTo;
        /**
         * 统计卡下钻口径（inProgress / attention / pending）；空值不下钻。
         * <p><b>只对 {@code projectFactPage} 生效</b>：卡片/导出/对账必须继续按未下钻的
         * 全量口径出数，否则被下钻的那张卡会只显示自己筛出的数，三张卡之间也失去可比性。
         */
        private String drill;
        /** 是否連帶計算待辦看板（導出/對賬需要；純卡片可關掉以省開銷） */
        private boolean includeTodos = true;
        /** 是否輸出逐交付項明細（下鑽/導出需要） */
        private boolean includeItems = true;
    }

    /* ==================== 数据范围 ==================== */

    /**
     * 數據範圍解析結果（fail-closed）。
     * <p>{@link #authenticated} 為 false 時 {@link #projectIds} 必為空集合：
     * <b>mine 視角絕不因 null userId 退化為全量</b>（與任務19 的哨兵口徑一致）。
     */
    @Data
    public static class Scope {
        /** 認證主體 SysUser.id；未登錄為 null */
        private Long userId;
        /** 是否已取得認證主體 */
        private boolean authenticated;
        /** 是否全量授權者（分配側授權 / 管理員），不受「我參與的」收斂 */
        private boolean canSeeAll;
        /** 是否被收斂為「我參與的項目」 */
        private boolean restricted;
        /** restricted=true 時的可見項目ID集合；未登錄或未參與任何項目時為空集合 */
        private List<Long> projectIds = new ArrayList<>();
        private String computedAt;
    }

    /* ==================== 交付项事实 ==================== */

    /**
     * 交付項事實（單一權威口徑的最小粒度）。
     * <p>項目匯總、統計卡、下鑽、導出、對賬全部由本對象<b>聚合</b>而來，不再各自查庫。
     */
    @Data
    public static class ItemFact {
        private Long itemId;
        private String itemNo;
        private String title;
        private Long projectId;
        private Long reqId;
        private String status;
        /** 當前範圍版本；驗收事實按此版本判定，舊版本證據不算通過 */
        private Integer scopeVersion;
        /**
         * 交付項並發版本（{@code rdm_delivery_item.version}）。
         * <p>任務22 B.2：事件級去重的 {@code event_version} 用「VERSION:並發版本」語義，
         * 因此事實行必須把版本一路帶到待辦與通知，<b>不得</b>在通知側另查一次版本
         * （另查就會出現「看板看到的版本」與「去重用的版本」不是同一個）。
         */
        private Integer version;
        private boolean scopeFrozen;
        private Long coordinatorUserId;
        private String coordinatorUserName;
        private Long productAcceptorUserId;
        private String productAcceptorUserName;
        private Long bizAcceptorUserId;
        private String bizAcceptorUserName;
        /** 驗收路徑 A（先驗收後上線）/ B（先上線後驗收） */
        private String acceptancePath;
        private String planStartDate;
        private String planEndDate;
        private boolean blocked;
        private boolean overdue;

        private int taskTotal;
        private int taskCompleted;
        private int taskInProgress;
        /** 依賴阻斷任務數（跨交付項依賴，複用調度側口徑） */
        private int blockedTaskCount;

        /**
         * 測試是否通過。<b>取自任務20 {@code RdmTestBatchService#isTestPassed}</b>：
         * 有效（未因範圍變更失效）提測批次的當前凍結輪次內必測用例全 pass，且無 critical/major 未閉環問題。
         * 絕不由「QA 任務 100%」推導。
         */
        private boolean testPassed;
        /**
         * 產品驗收是否通過。<b>取自任務20 {@code hasProductAcceptancePassed(itemId, scopeVersion)}</b>：
         * 當前 scopeVersion 下最新有效結論 = pass；conditional/fail 不算通過，失效證據已過濾。
         */
        private boolean productAccepted;
        /** 業務驗收是否通過（口徑同 {@link #productAccepted}） */
        private boolean bizAccepted;

        private int openIssueCount;
        private int criticalIssueCount;
        private int majorIssueCount;
        /**
         * 原範圍延期殘餘：在<b>舊 scopeVersion</b> 下被延期、且承接尚未閉環的問題數。
         * <p>這些問題不計入 {@link #openIssueCount}（狀態已非 open），但範圍變更後它們依然是真實欠帳，
         * 必須單獨呈現，否則「改一次範圍就把延期問題洗白」。
         */
        private int deferResidualCount;
        /** 行級待裁決數（未決問題）：與統計卡口徑<b>同源同條件</b>，卡片 = 各行相加 */
        private int pendingDecisionCount;

        /** 是否已交付完成（status=done）。與「項目已關閉」無關。 */
        private boolean delivered;
        /** 待辦成因明細（一條交付項可命中多個成因，但只算一條待辦） */
        private List<String> todoReasons = new ArrayList<>();
        /** 前端已註冊路由（由 {@code RdmConstants#deliveryItemRoute} 統一拼裝） */
        private String actionUrl;
    }

    /* ==================== 项目事实 ==================== */

    /** 項目事實（總覽行 / 統計卡 / 下鑽 / 導出 / 對賬共用）。 */
    @Data
    public static class ProjectFact {
        private Long projectId;
        private String projectNo;
        private String projectName;
        private String objective;
        private String status;
        private Long pmUserId;
        private String pmUserName;
        /** 产品经理工号（批量按 pmUserId 回填，列表统一姓名+工号） */
        private String pmUserEmpNo;
        private Long productOwnerUserId;
        private String productOwnerUserName;
        /** 产品负责人工号（批量按 productOwnerUserId 回填） */
        private String productOwnerUserEmpNo;
        /** 研发负责人（看板项目卡“相關負責人”有配置就展示） */
        private Long techLeadUserId;
        private String techLeadUserName;
        /** 测试负责人 */
        private Long qaLeadUserId;
        private String qaLeadUserName;
        /** 设计负责人 */
        private Long uiDesignerUserId;
        private String uiDesignerUserName;
        /** 运维负责人 */
        private Long opsLeadUserId;
        private String opsLeadUserName;
        private String planStartDate;
        private String planEndDate;
        private Integer pausedFlag;
        private Integer riskFlag;
        private Integer overdueFlag;
        private Integer version;
        private String createdAt;
        private String updatedAt;
        /** 最後更新人姓名快照（與 updatedAt 同為一對事實，列表與導出共用同一行） */
        private String updatedBy;

        private int requirementTotal;
        private int deliveryItemTotal;
        private int deliveryItemCompleted;
        private int deliveryItemInProgress;
        private int deliveryItemTesting;
        /** 已推进到验收/上线环节但尚未交付完成的交付項數（pending_acceptance / pending_release / released_pending） */
        private int deliveryItemPendingAcceptance;
        private int deliveryItemBlocked;
        private int deliveryItemOverdue;
        /** 測試已通過的交付項數（消費 isTestPassed，非按狀態推導） */
        private int testPassedItemCount;
        /** 產品驗收已通過的交付項數 */
        private int productAcceptedItemCount;
        /** 業務驗收已通過的交付項數 */
        private int bizAcceptedItemCount;

        private int taskTotal;
        private int taskCompleted;
        private int taskInProgress;
        private int blockedTaskCount;

        private int issueOpen;
        private int issueCritical;
        private int issueMajor;
        /** 待裁決（未決問題）：與 {@link CardSummary#getPendingDecisionCount()} 同口徑 */
        private int pendingDecisionCount;
        /** 原範圍延期殘餘合計 */
        private int deferResidualCount;
        /** 提測批次數（按需求ID<b>集合</b>條件統計，空集合直接為 0） */
        private int testBatchTotal;

        private int todoTotal;
        private int todoMineCount;
        private int todoWaitingOthersCount;
        private int todoUnassignedCount;

        /** 交付完成（status=all_delivered）。<b>與 {@link #closed} 互不推導。</b> */
        private boolean allDelivered;
        /** 已關閉（status=closed）。關閉只是歸檔動作，<b>不代表交付完成</b>。 */
        private boolean closed;
        /** 需關注（風險 / 逾期 / 暫停 任一命中） */
        private boolean attention;
        /** 進行中（preparing / in_progress） */
        private boolean inProgress;
        private String nextDeliveryDate;
        private String actionUrl;
        private String computedAt;
    }

    /* ==================== 待办 ==================== */

    /**
     * 待辦（去重後的一條）。
     * <p>去重鍵 {@code key = objectType + ":" + refId}：同一對象無論命中幾個成因都只有一條，
     * 因此待辦總數<b>不會</b>按分組直接相加而重複。
     */
    @Data
    public static class Todo {
        /** 去重鍵：{@code objectType:refId} */
        private String key;
        /** 對象類型（{@code RdmConstants.NOTIFY_OBJECT_*} 同源） */
        private String objectType;
        private Long refId;
        private String refNo;
        private String title;
        private Long projectId;
        /**
         * 所屬問題ID（僅延期殘餘待辦使用）。
         * <p>{@code RdmIssueDefer} 本身不是前端可跳轉的頁面，延期殘餘待辦必須跳回它所屬的<b>問題詳情頁</b>；
         * 缺失時退化到項目總覽，<b>絕不</b>退化到交付項頁（問題與交付項是不同對象、不同頁面）。
         */
        private Long refIssueId;
        /** 責任人（決定分桶）；null = 未指派 */
        private Long responsibleUserId;
        private String responsibleName;
        /** mine / waiting_others / unassigned */
        private String bucket;
        /** 成因明細（可多條，不影響計數） */
        private List<String> reasons = new ArrayList<>();
        private String dueDate;
        private boolean overdue;
        /** 按責任人真實工作日曆計算的逾期工作日數（含請假/週末支援），未逾期為 0 */
        private Integer overdueWorkingDays;
        /**
         * 所屬對象的並發版本（交付項/問題/延期單/項目各自的 {@code version} 列）。
         * <p>任務22 B.2：PM 待辦通知的去重 {@code event_version} 取
         * {@code VERSION:<refVersion>} —— 待辦<b>產生或變更</b>（版本推進）才再通知一次，
         * 同一版本內重複掃描絕不重發；{@code null} 表示存量數據未啟用樂觀鎖列，通知側退化為 {@code VERSION:0}。
         * <p>催辦走另一種語義：{@code DATE:<yyyy-MM-dd>}（提醒日），同一提醒日只催一次。
         */
        private Integer refVersion;
        /** 前端已註冊路由；問題走問題頁，交付項走交付項頁，绝不混用 */
        private String actionUrl;
    }

    /** 待辦看板（分桶互斥且窮盡，{@code mine + waitingOthers + unassigned == total}）。 */
    @Data
    public static class TodoBoard {
        /** 項目ID；null 表示「我的工作臺」跨項目視角 */
        private Long projectId;
        private Long userId;
        /** 未登錄時為 false，且 total 恆為 0（fail-closed，不退化全量） */
        private boolean authenticated;
        private int total;
        private int mineCount;
        private int waitingOthersCount;
        private int unassignedCount;
        /** 未去重前的成因命中次數（恆 ≥ total），用於展示去重效果與對賬 */
        private int rawReasonHits;
        private List<Todo> todos = new ArrayList<>();
        private String computedAt;
    }

    /* ==================== 统计卡 ==================== */

    /** 統計卡（跟隨查詢條件；每個計數都等於對應明細行的聚合，供對賬核對）。 */
    @Data
    public static class CardSummary {
        private int totalProjects;
        private int inProgressCount;
        private int attentionCount;
        /** 待裁決：等於各項目 {@link ProjectFact#getPendingDecisionCount()} 相加 */
        private int pendingDecisionCount;
        private int activeProjects;
        /** 交付完成項目數（all_delivered） */
        private int allDeliveredProjects;
        /** 已關閉項目數。<b>不計入交付完成</b>，兩者分列。 */
        private int closedProjects;
        private int pausedProjects;
        private int totalDeliveryItems;
        private int deliveredItems;
        private int blockedCount;
        private int testPassedItemCount;
        private int productAcceptedItemCount;
        private int bizAcceptedItemCount;
        private int issueOpen;
        private int issueCritical;
        private int deferResidualCount;
        private int todoTotal;
        private int todoMineCount;
        private int todoWaitingOthersCount;
        private int todoUnassignedCount;
        private String computedAt;
    }

    /* ==================== 对账 ==================== */

    /**
     * 對賬口径：同一批數據用<b>兩條獨立路徑</b>各算一次（聚合明細行 vs 直接全量查庫），
     * 兩者必須相等；不等即把差異逐條寫入 {@link #mismatches} 並把 {@link #consistent} 置 false。
     * <p>這是「卡片=行級=下鑽=導出=對賬」的可執行證明，也是任務24 集成測試的核對入口。
     */
    @Data
    public static class Reconciliation {
        /** 路徑A：範圍內項目數（聚合側） */
        private int projectCount;
        /** 路徑B：導出的項目明細行數 */
        private int projectRowCount;
        /** 路徑A：範圍內交付項總數（逐項目相加） */
        private int deliveryItemCount;
        /** 路徑B：交付項明細行數 */
        private int deliveryItemRowCount;
        /** 路徑A：待裁決合計（逐項目相加） */
        private int pendingDecisionSum;
        /** 路徑B：直接按交付項ID集合查未決問題數 */
        private int pendingDecisionDirect;
        /** 路徑A：延期殘餘合計（逐項目相加） */
        private int deferResidualSum;
        /** 路徑B：直接按延期單集合查殘餘數 */
        private int deferResidualDirect;
        /** 待辦去重後總數 */
        private int todoTotal;
        /** 待辦明細行數（必須 == todoTotal，證明無重複） */
        private int todoRowCount;
        /** 三桶相加（必須 == todoTotal，證明分桶互斥且窮盡） */
        private int todoBucketSum;
        /** 未去重的成因命中次數（≥ todoTotal，差值即被去重掉的重複計數） */
        private int todoRawReasonHits;
        /** 已關閉項目數 */
        private int closedProjectCount;
        /** 交付完成項目數（與關閉數分列，不得混算） */
        private int allDeliveredProjectCount;
        /** 全部核对是否一致 */
        private boolean consistent;
        /** 不一致明細（每條都可被人讀懂並定位） */
        private List<String> mismatches = new ArrayList<>();
        private String computedAt;
    }

    /* ==================== 全量导出包 ==================== */

    /**
     * 全量導出包（供任務23 前端 ExcelJS 多 Sheet 導出消費）。
     * <p><b>全量語義</b>：這裡是數據範圍內<b>全部</b>項目/交付項/待辦，不是當前頁、也不是前端「已加載行」。
     * 前端不得再用表格已渲染的 dataSource 拼導出（那樣翻頁沒翻到的行會靜默缺失）。
     */
    @Data
    public static class ExportBundle {
        private Scope scope;
        private CardSummary cards;
        private List<ProjectFact> projects = new ArrayList<>();
        private List<ItemFact> items = new ArrayList<>();
        private List<Todo> todos = new ArrayList<>();
        private Reconciliation reconciliation;
        private String computedAt;
    }
}
