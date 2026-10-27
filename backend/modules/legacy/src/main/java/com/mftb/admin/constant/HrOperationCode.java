package com.mftb.admin.constant;

import java.util.Map;
import java.util.Set;

/**
 * 人事异动动作 code（{@code emp_position_record.operation_code}）的唯一真值。
 * <p>
 * 为什么要单独一列 code 而不用 {@code operation} 中文名判定（方案 §5.3）：
 * <ul>
 *   <li>库里存简体、界面显示繁体，历史上已出现「写库必须用简体否则在职状态派生不生效」的踩坑
 *       （见 {@link HrLifecycleConstants} 注释），靠字符串判定状态本身就是脆弱设计；</li>
 *   <li>语言切换、繁简混写、界面回填都会让 {@code "离职".equals(op)} 静默失效；</li>
 *   <li>派生规则（谁算离职、哪条是本次雇佣起点）必须可枚举，不能靠正则匹配中文。</li>
 * </ul>
 * {@code operation} 列继续保留，语义降级为「发生时的名称快照」，只用于展示与历史回溯，
 * 不再参与判定。存量行由 {@code hr:effective-engine:v1.0} 按 {@link #NAME_TO_CODE} 回填。
 */
public final class HrOperationCode {

    private HrOperationCode() {
    }

    /** 入职（本次雇佣的起点） */
    public static final String ONBOARD = "ONBOARD";
    /** 转正 */
    public static final String REGULAR = "REGULAR";
    /** 晋升 */
    public static final String PROMOTION = "PROMOTION";
    /** 调动 */
    public static final String TRANSFER = "TRANSFER";
    /** 降职 */
    public static final String DEMOTION = "DEMOTION";
    /** 离职（雇佣终止） */
    public static final String DIMISSION = "DIMISSION";
    /** 重新入职（新的雇佣期间，不复用上一段的任职时长口径） */
    public static final String REHIRE = "REHIRE";
    /**
     * 兜底值：回填时碰到未知历史名称、或前端传了无法识别的动作时使用。
     * <p>派生逻辑遇到 OTHER 会退回按名称判定（见 {@link #isResigned}），保证历史数据不会因为
     * 归不了类就被改判在职/离职 —— 宁可保留旧口径，也不能静默改变事实。
     */
    public static final String OTHER = "OTHER";

    /** 全部合法 code，落库 CHECK 约束与本集合同源 */
    public static final Set<String> ALL_CODES = Set.of(
            ONBOARD, REGULAR, PROMOTION, TRANSFER, DEMOTION, DIMISSION, REHIRE, OTHER);

    /**
     * 使雇佣关系终止的 code 集合。
     * <p>刻意不含 REHIRE：重新入职是「新雇佣期间的开始」，不是终止。
     */
    public static final Set<String> RESIGNED_CODES = Set.of(DIMISSION);

    /** 开启新雇佣期间的 code 集合（司龄/本次任职时长的起算锚点） */
    public static final Set<String> EMPLOYMENT_START_CODES = Set.of(ONBOARD, REHIRE);

    /** 存量中文名（简体与繁体都收）→ code，回填与前端兼容用 */
    public static final Map<String, String> NAME_TO_CODE = Map.ofEntries(
            Map.entry("入职", ONBOARD), Map.entry("入職", ONBOARD),
            Map.entry("转正", REGULAR), Map.entry("轉正", REGULAR),
            Map.entry("晋升", PROMOTION), Map.entry("晉升", PROMOTION),
            Map.entry("调动", TRANSFER), Map.entry("調動", TRANSFER),
            Map.entry("降职", DEMOTION), Map.entry("降職", DEMOTION),
            Map.entry("离职", DIMISSION), Map.entry("離職", DIMISSION),
            Map.entry("重新入职", REHIRE), Map.entry("重新入職", REHIRE));

    /** code → 简体中文规范名（写库时同步落 operation 快照列，保持既有展示与历史写法一致） */
    public static final Map<String, String> CODE_TO_NAME = Map.of(
            ONBOARD, "入职",
            REGULAR, "转正",
            PROMOTION, "晋升",
            TRANSFER, "调动",
            DEMOTION, "降职",
            DIMISSION, "离职",
            REHIRE, "重新入职",
            OTHER, "其他");

    /** code 是否合法 */
    public static boolean isValid(String code) {
        return code != null && ALL_CODES.contains(code);
    }

    /**
     * 把任意输入（code、简体名或繁体名）解析成 code。
     * <p>迁移期前端仍可能只传中文名，这里兼容并归一到 code，避免「界面选了离职、库里 code 落成
     * OTHER、在职状态不跟着变」这类静默错判。解析不出来返回 {@link #OTHER}。
     */
    public static String resolve(String codeOrName) {
        if (codeOrName == null || codeOrName.isBlank()) {
            return OTHER;
        }
        String trimmed = codeOrName.trim();
        if (isValid(trimmed)) {
            return trimmed;
        }
        return NAME_TO_CODE.getOrDefault(trimmed, OTHER);
    }

    /** 写入用：给定 code 或名称，返回应落库的 code（无法识别归 OTHER） */
    public static String codeForWrite(String codeOrName) {
        return resolve(codeOrName);
    }

    /**
     * 写入用：给定 code 或名称，返回应落库的 operation 名称快照。
     * <p>能归类的写规范简体名（与历史写法一致）；归不了类的（code=OTHER）保留原输入，
     * 不拿「其他」覆盖掉一条本可以看明白的历史记录。
     */
    public static String nameForWrite(String codeOrName) {
        String trimmed = codeOrName == null ? "" : codeOrName.trim();
        String code = resolve(trimmed);
        return OTHER.equals(code) ? trimmed : CODE_TO_NAME.getOrDefault(code, trimmed);
    }

    /**
     * 该记录是否代表雇佣终止。
     * <p>code 已归类时只看 code；OTHER（历史脏值/未回填）退回名称判定，
     * 保持与拆分前一致，不做重新解释。
     */
    public static boolean isResigned(String code, String operationName) {
        if (isValid(code) && !OTHER.equals(code)) {
            return RESIGNED_CODES.contains(code);
        }
        return RESIGNED_CODES.contains(resolve(operationName));
    }

    /** 该记录是否开启了一段新的雇佣关系（司龄锚点） */
    public static boolean isEmploymentStart(String code, String operationName) {
        if (isValid(code) && !OTHER.equals(code)) {
            return EMPLOYMENT_START_CODES.contains(code);
        }
        return EMPLOYMENT_START_CODES.contains(resolve(operationName));
    }
}
