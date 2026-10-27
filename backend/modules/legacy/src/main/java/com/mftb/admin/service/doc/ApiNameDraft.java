package com.mftb.admin.service.doc;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 接口名草稿：代码扫描只能拿到方法名与路径，人工命名前先给一个可读的中文草稿。
 * <p>规则：方法名里的动词决定动作（page→列表、export→匯出），资源词优先取方法名，取不到再回退路径；
 * 仍然取不到主体时留空，由人工补名——编造「新增物資管理」这类名字对外文档反而有害。
 * 草稿只写 {@code api_name_source='auto'} 的行，人工保存后不再覆盖。
 */
public final class ApiNameDraft {

    /** 动词优先的语义：中文习惯是「新增資產」「匯出花名冊」。 */
    private static final Set<String> VERB_FIRST = Set.of(
            "新增", "保存", "保存草稿", "修改", "刪除", "取消", "確認", "提交", "審核", "審核通過", "駁回",
            "匯出", "匯入", "掃描", "同步", "上傳", "下載", "發布", "啟用", "停用", "切換", "重置",
            "登入", "登出", "登記", "複製", "生成", "還原", "回滾", "撤回", "接收", "移交", "綁定",
            "解綁", "校驗", "簽收", "下單", "發送", "測試");

    /** 属性类资源：单独出现时信息量太低，需要拼上路径里的主体（「修改」+「狀態」→「修改角色狀態」）。 */
    private static final Set<String> ATTRIBUTE_NOUNS = Set.of("狀態", "類型", "名稱", "標題", "排序", "備註", "進度", "系統", "資料");

    private static final Map<String, String> VERBS = verbs();
    private static final Map<String, String> NOUNS = nouns();

    private ApiNameDraft() {
    }

    /**
     * @param httpMethod  用于方法名没有动词时兜底（GET→查詢 / POST→新增 / PUT→修改 / DELETE→刪除）
     * @param methodName  Controller 方法名（camelCase）
     * @param path        接口路径
     * @return 中文草稿；没有可辨识的主体或动作时返回 null，宁可留空也不编造
     */
    public static String draft(String httpMethod, String methodName, String path) {
        List<String> tokens = tokens(methodName);
        String verb = null;
        int verbIndex = -1;
        for (int i = 0; i < tokens.size(); i++) {
            String candidate = VERBS.get(tokens.get(i).toLowerCase());
            if (candidate != null) {
                verb = candidate;
                verbIndex = i;
                break;
            }
        }
        if (verb == null) verb = byHttpMethod(httpMethod);
        if (verb == null) return null;

        String resource = null;
        for (int i = 0; i < tokens.size(); i++) {
            if (i == verbIndex) continue;
            String candidate = NOUNS.get(tokens.get(i).toLowerCase());
            // 「我的/全部」只是限定词，不能单独当主体。
            if (candidate != null && !"我的".equals(candidate) && !"全部".equals(candidate)) {
                resource = candidate;
                break;
            }
        }
        String fromPath = fromPath(path);
        if (resource == null) {
            resource = fromPath;
        } else if (ATTRIBUTE_NOUNS.contains(resource) && fromPath != null && !fromPath.equals(resource)) {
            resource = fromPath + resource;
        }
        // 没有可辨识的主体时宁可留空：编造「新增物资管理」这类名字对外文档反而有害。
        if (!StringUtils.hasText(resource)) return null;

        // 「下單」已经是完整动作，再接宾语反而语义重复。
        if ("下單".equals(verb)) return verb;
        // 动词优先的语义在中文里是「动词+宾语」，名词优先则是「宾语+动词」。
        String name = VERB_FIRST.contains(verb) ? verb + resource : resource + verb;
        return name.length() > 60 ? name.substring(0, 60) : name;
    }

    /** 方法名拆 camelCase / snake_case，保留小写语义。 */
    static List<String> tokens(String value) {
        List<String> tokens = new ArrayList<>();
        if (!StringUtils.hasText(value)) return tokens;
        for (String part : value.split("[_\\-]")) {
            StringBuilder current = new StringBuilder();
            for (char ch : part.toCharArray()) {
                if (Character.isUpperCase(ch) && current.length() > 0) {
                    tokens.add(current.toString());
                    current.setLength(0);
                }
                current.append(Character.toLowerCase(ch));
            }
            if (current.length() > 0) tokens.add(current.toString());
        }
        return tokens;
    }

    private static String fromPath(String path) {
        if (!StringUtils.hasText(path)) return null;
        String[] segments = path.split("/");
        for (int i = segments.length - 1; i >= 0; i--) {
            String segment = segments[i];
            if (!StringUtils.hasText(segment) || segment.startsWith("{") || segment.matches("v\\d+")) continue;
            for (String token : tokens(segment)) {
                if ("api".equals(token)) continue;
                String noun = NOUNS.get(token);
                // 只接受具体主体：「我的/全部」是限定词，狀態/系統/資料是属性，单独成名字只会是空话。
                if (noun == null || ATTRIBUTE_NOUNS.contains(noun) || "我的".equals(noun) || "全部".equals(noun)) continue;
                return noun;
            }
        }
        return null;
    }

    private static String byHttpMethod(String httpMethod) {
        if (!StringUtils.hasText(httpMethod)) return null;
        return switch (httpMethod.toUpperCase()) {
            case "GET" -> "查詢";
            case "POST" -> "新增";
            case "PUT", "PATCH" -> "修改";
            case "DELETE" -> "刪除";
            default -> null;
        };
    }

    private static Map<String, String> verbs() {
        Map<String, String> verbs = new LinkedHashMap<>();
        verbs.put("detail", "詳情");
        verbs.put("info", "詳情");
        verbs.put("get", "詳情");
        verbs.put("getbyid", "詳情");
        verbs.put("view", "詳情");
        verbs.put("query", "查詢");
        verbs.put("search", "搜尋");
        verbs.put("find", "查詢");
        verbs.put("list", "列表");
        verbs.put("listall", "列表");
        verbs.put("page", "列表");
        verbs.put("tree", "樹狀");
        verbs.put("options", "選項");
        verbs.put("stats", "統計");
        verbs.put("statistics", "統計");
        verbs.put("count", "統計");
        verbs.put("summary", "總覽");
        verbs.put("overview", "總覽");
        verbs.put("create", "新增");
        verbs.put("add", "新增");
        verbs.put("insert", "新增");
        verbs.put("save", "保存");
        verbs.put("savedraft", "保存草稿");
        verbs.put("update", "修改");
        verbs.put("edit", "修改");
        verbs.put("modify", "修改");
        verbs.put("delete", "刪除");
        verbs.put("remove", "刪除");
        verbs.put("cancel", "取消");
        verbs.put("confirm", "確認");
        verbs.put("submit", "提交");
        verbs.put("approve", "審核通過");
        verbs.put("reject", "駁回");
        verbs.put("audit", "審核");
        verbs.put("export", "匯出");
        verbs.put("import", "匯入");
        verbs.put("scan", "掃描");
        verbs.put("sync", "同步");
        verbs.put("upload", "上傳");
        verbs.put("download", "下載");
        verbs.put("publish", "發布");
        verbs.put("enable", "啟用");
        verbs.put("disable", "停用");
        verbs.put("active", "啟用");
        verbs.put("deactivate", "停用");
        verbs.put("toggle", "切換");
        verbs.put("reset", "重置");
        verbs.put("login", "登入");
        verbs.put("logout", "登出");
        verbs.put("register", "登記");
        verbs.put("preview", "預覽");
        verbs.put("copy", "複製");
        verbs.put("generate", "生成");
        verbs.put("restore", "還原");
        verbs.put("rollback", "回滾");
        verbs.put("withdraw", "撤回");
        verbs.put("receive", "接收");
        verbs.put("transfer", "移交");
        verbs.put("bind", "綁定");
        verbs.put("unbind", "解綁");
        verbs.put("validate", "校驗");
        verbs.put("check", "校驗");
        verbs.put("sign", "簽收");
        verbs.put("test", "測試");
        verbs.put("place", "下單");
        verbs.put("send", "發送");
        return Map.copyOf(verbs);
    }

    private static Map<String, String> nouns() {
        Map<String, String> nouns = new LinkedHashMap<>();
        nouns.put("employee", "員工");
        nouns.put("employees", "員工");
        nouns.put("roster", "花名冊");
        nouns.put("department", "部門");
        nouns.put("departments", "部門");
        nouns.put("dept", "部門");
        nouns.put("position", "職位");
        nouns.put("positions", "職位");
        nouns.put("organization", "組織");
        nouns.put("contract", "合約");
        nouns.put("contracts", "合約");
        nouns.put("attendance", "考勤");
        nouns.put("leave", "請假");
        nouns.put("shift", "班次");
        nouns.put("shifts", "班次");
        nouns.put("holiday", "假期");
        nouns.put("holidays", "假期");
        nouns.put("overtime", "加班");
        nouns.put("asset", "資產");
        nouns.put("assets", "資產");
        nouns.put("consumable", "耗材");
        nouns.put("vehicle", "用車");
        nouns.put("car", "車輛");
        nouns.put("driver", "司機");
        nouns.put("meeting", "會議");
        nouns.put("booking", "預約");
        nouns.put("room", "會議室");
        nouns.put("rooms", "會議室");
        nouns.put("campus", "校區");
        nouns.put("campuses", "校區");
        nouns.put("certificate", "證照");
        nouns.put("certificates", "證照");
        nouns.put("qualification", "資格");
        nouns.put("qualifications", "資格");
        nouns.put("cycle", "週期");
        nouns.put("cycles", "週期");
        nouns.put("consumables", "耗材");
        nouns.put("inbound", "入庫");
        nouns.put("brand", "品牌");
        nouns.put("brands", "品牌");
        nouns.put("borrows", "借用");
        nouns.put("returns", "歸還");
        nouns.put("run", "運行");
        nouns.put("runs", "運行");
        nouns.put("node", "節點");
        nouns.put("nodes", "節點");
        nouns.put("person", "人員");
        nouns.put("persons", "人員");
        nouns.put("grade", "職級");
        nouns.put("grades", "職級");
        nouns.put("acceptance", "驗收");
        nouns.put("minutes", "紀要");
        nouns.put("checkin", "簽到");
        nouns.put("order", "訂單");
        nouns.put("orders", "訂單");
        nouns.put("gift", "贈品");
        nouns.put("gifts", "贈品");
        nouns.put("promotion", "推廣");
        nouns.put("price", "定價");
        nouns.put("pricing", "定價");
        nouns.put("budget", "預算");
        nouns.put("quota", "配額");
        nouns.put("model", "模型");
        nouns.put("models", "模型");
        nouns.put("provider", "供應商");
        nouns.put("agent", "智能體");
        nouns.put("tool", "工具");
        nouns.put("tools", "工具");
        nouns.put("knowledge", "知識");
        nouns.put("doc", "文檔");
        nouns.put("docs", "文檔");
        nouns.put("document", "文檔");
        nouns.put("documents", "文檔");
        nouns.put("space", "空間");
        nouns.put("spaces", "空間");
        nouns.put("revision", "版本");
        nouns.put("acl", "授權");
        nouns.put("api", "接口");
        nouns.put("system", "系統");
        nouns.put("systems", "系統");
        nouns.put("menu", "選單");
        nouns.put("menus", "選單");
        nouns.put("role", "角色");
        nouns.put("roles", "角色");
        nouns.put("user", "使用者");
        nouns.put("users", "使用者");
        nouns.put("permission", "權限");
        nouns.put("permissions", "權限");
        nouns.put("log", "日誌");
        nouns.put("logs", "日誌");
        nouns.put("report", "報表");
        nouns.put("reports", "報表");
        nouns.put("project", "專案");
        nouns.put("projects", "專案");
        nouns.put("requirement", "需求");
        nouns.put("requirements", "需求");
        nouns.put("delivery", "交付");
        nouns.put("task", "任務");
        nouns.put("tasks", "任務");
        nouns.put("template", "模板");
        nouns.put("templates", "模板");
        nouns.put("config", "配置");
        nouns.put("notification", "通知");
        nouns.put("message", "訊息");
        nouns.put("messages", "訊息");
        nouns.put("file", "檔案");
        nouns.put("files", "檔案");
        nouns.put("batch", "批次");
        nouns.put("batches", "批次");
        nouns.put("inventory", "庫存");
        nouns.put("ledger", "台賬");
        nouns.put("record", "記錄");
        nouns.put("records", "記錄");
        nouns.put("item", "條目");
        nouns.put("items", "條目");
        nouns.put("category", "分類");
        nouns.put("categories", "分類");
        nouns.put("tag", "標籤");
        nouns.put("tags", "標籤");
        nouns.put("archive", "檔案");
        nouns.put("archives", "檔案");
        nouns.put("dashboard", "看板");
        nouns.put("workflow", "流程");
        nouns.put("approval", "審批");
        nouns.put("salary", "薪資");
        nouns.put("performance", "績效");
        nouns.put("profile", "檔案");
        nouns.put("signature", "簽名");
        nouns.put("token", "令牌");
        nouns.put("grant", "授權");
        nouns.put("integration", "集成");
        nouns.put("chat", "對話");
        nouns.put("conversation", "會話");
        nouns.put("session", "會話");
        nouns.put("usage", "用量");
        nouns.put("cost", "成本");
        nouns.put("billing", "帳單");
        nouns.put("application", "應用");
        nouns.put("applications", "應用");
        nouns.put("app", "應用");
        nouns.put("apps", "應用");
        nouns.put("version", "版本");
        nouns.put("versions", "版本");
        nouns.put("endpoint", "端點");
        nouns.put("endpoints", "端點");
        nouns.put("policy", "策略");
        nouns.put("policies", "策略");
        nouns.put("data", "資料");
        nouns.put("status", "狀態");
        nouns.put("type", "類型");
        nouns.put("name", "名稱");
        nouns.put("title", "標題");
        nouns.put("remark", "備註");
        nouns.put("note", "備註");
        nouns.put("phone", "手機號");
        nouns.put("email", "郵箱");
        nouns.put("account", "帳號");
        nouns.put("accounts", "帳號");
        nouns.put("job", "職位");
        nouns.put("level", "職級");
        nouns.put("trip", "出差");
        nouns.put("expense", "報銷");
        nouns.put("purchase", "採購");
        nouns.put("supplier", "供應商");
        nouns.put("warehouse", "倉庫");
        nouns.put("stock", "庫存");
        nouns.put("maintenance", "維護");
        nouns.put("repair", "維修");
        nouns.put("scrap", "報廢");
        nouns.put("claim", "領用");
        nouns.put("return", "歸還");
        nouns.put("borrow", "借用");
        nouns.put("traffic", "流量");
        nouns.put("score", "評分");
        nouns.put("rule", "規則");
        nouns.put("rules", "規則");
        nouns.put("hint", "提示");
        nouns.put("word", "詞條");
        nouns.put("words", "詞條");
        nouns.put("all", "全部");
        nouns.put("my", "我的");
        nouns.put("mine", "我的");
        return Map.copyOf(nouns);
    }
}
