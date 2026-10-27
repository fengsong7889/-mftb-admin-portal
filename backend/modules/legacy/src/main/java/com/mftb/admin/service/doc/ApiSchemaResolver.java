package com.mftb.admin.service.doc;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.annotation.RequirePermission;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ResolvableType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Parameter;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 接口文档结构化：从 Controller 方法签名推导出参字段表、示例、请求参数表与鉴权 scope。
 * <p>只读反射元数据，不读取任何运行时值；示例按类型占位，敏感字段固定输出 {@code ***}。
 * 出参结构是代码派生的只读资料，接口本身的行为与鉴权不因本文档改变。
 */
public final class ApiSchemaResolver {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Logger log = LoggerFactory.getLogger(ApiSchemaResolver.class);
    /** 单接口字段行上限，防止大 DTO 把内容表撑爆。 */
    private static final int MAX_ROWS = 150;
    /** 嵌套展开深度上限（data.records[].field 已 2 层，留 3 层余量）。 */
    private static final int MAX_DEPTH = 5;
    private static final int MAX_ENUM_VALUES = 20;

    /** 示例值必须脱敏的字段名；用量计数（promptTokens 等）不是凭据，不脱敏。 */
    private static final Set<String> SENSITIVE_EXACT = Set.of(
            "token", "accesstoken", "refreshtoken", "idtoken", "apitoken", "secret", "clientsecret",
            "password", "passwd", "pwd", "privatekey", "credential", "credentials", "passwordhash");
    private static final List<String> SENSITIVE_SUFFIX = List.of(
            "password", "passwd", "pwd", "secret", "credential", "privatekey", "passwordhash");

    /** 常见业务字段释义：DTO 普遍没有 @Schema，字段名是唯一可用的语义线索。 */
    private static final Map<String, String> FIELD_LABELS = fieldLabels();

    private ApiSchemaResolver() {
    }

    /** 出参结构：raw 为原始 Java 返回类型，fields 为可展开的字段树。 */
    public record Node(String path, String name, String type, String typeLabel, Boolean required,
                       String description, List<Node> children, List<String> enumValues) {
    }

    public record ResponseSchema(String raw, List<Node> fields) {
    }

    /** 出参结构 JSON：{@code {"raw":"Result<PageResult<XxxVO>>","fields":[...]}}。 */
    public static String responseJson(Method method) {
        ResolvableType root = ResolvableType.forMethodReturnType(method);
        try {
            List<Node> fields = beanChildren(root, "", 0, new LinkedHashSet<>(), new int[]{0});
            return JSON.writeValueAsString(new ResponseSchema(display(root), fields));
        } catch (Exception | LinkageError e) {
            log.debug("出参结构推导失败 {}#{}: {}", method.getDeclaringClass().getSimpleName(), method.getName(), e.toString());
            return "{\"raw\":\"" + escape(display(root)) + "\",\"fields\":[]}";
        }
    }

    /** 响应示例：按真实包装层（Result / PageResult / List）生成占位 JSON，敏感字段已脱敏。 */
    public static String example(Method method) {
        try {
            Object sample = sample(ResolvableType.forMethodReturnType(method), 0, new LinkedHashSet<>());
            return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(sample);
        } catch (Exception | LinkageError e) {
            log.debug("响应示例生成失败 {}#{}: {}", method.getDeclaringClass().getSimpleName(), method.getName(), e.toString());
            return null;
        }
    }

    /** 请求参数表 JSON：含位置（query/path/body/header）、必填、说明与 DTO 字段树。 */
    public static String requestParams(Method method) {
        try {
            List<Map<String, Object>> rows = new ArrayList<>();
            Parameter[] parameters = method.getParameters();
            for (int i = 0; i < parameters.length; i++) {
                Parameter parameter = parameters[i];
                if (isServletType(parameter.getType())) continue;
                String name = parameterName(parameter);
                ResolvableType type = ResolvableType.forMethodParameter(method, i);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", name);
                row.put("type", display(type));
                row.put("location", location(parameter));
                row.put("required", required(parameter));
                String description = description(parameter, name);
                if (StringUtils.hasText(description)) row.put("description", description);
                List<String> annotations = annotations(parameter);
                if (!annotations.isEmpty()) row.put("annotations", annotations);
                List<Node> children = beanChildren(type, name, 1, new LinkedHashSet<>(), new int[]{0});
                if (!children.isEmpty()) row.put("children", children);
                rows.add(row);
            }
            return JSON.writeValueAsString(rows);
        } catch (Exception | LinkageError e) {
            log.debug("请求参数推导失败 {}#{}: {}", method.getDeclaringClass().getSimpleName(), method.getName(), e.toString());
            return "[]";
        }
    }

    /** 请求体示例：按 {@code @RequestBody} 的 DTO 生成占位 JSON；无请求体时返回 null。 */
    public static String requestExample(Method method) {
        try {
            Parameter[] parameters = method.getParameters();
            Map<String, Object> named = new LinkedHashMap<>();
            Object single = null;
            int bodies = 0;
            for (int i = 0; i < parameters.length; i++) {
                if (!parameters[i].isAnnotationPresent(RequestBody.class)) continue;
                Object sample = sample(ResolvableType.forMethodParameter(method, i), 0, new LinkedHashSet<>());
                if (sample == null) continue;
                bodies++;
                single = sample;
                named.put(parameterName(parameters[i]), sample);
            }
            if (bodies == 0) return null;
            return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(bodies == 1 ? single : named);
        } catch (Exception | LinkageError e) {
            log.debug("请求示例生成失败 {}#{}: {}", method.getDeclaringClass().getSimpleName(), method.getName(), e.toString());
            return null;
        }
    }

    /** 所需权限：{@code menu:action}，备选权限以 " | " 连接。 */
    public static String authScope(Method method) {
        RequirePermission permission = method.getAnnotation(RequirePermission.class);
        if (permission == null) return null;
        Set<String> scopes = new LinkedHashSet<>();
        scopes.add(permission.menu() + ":" + permission.action());
        for (String menu : permission.anyOf()) {
            if (StringUtils.hasText(menu)) scopes.add(menu.trim() + ":" + permission.action());
        }
        for (String scope : permission.anyPermissions()) {
            if (StringUtils.hasText(scope)) scopes.add(scope.trim());
        }
        return String.join(" | ", scopes);
    }

    /** 通用错误码：本平台业务错误走 HTTP 200 + body.code，只有 404/405 是真实 HTTP 状态。 */
    public static String errorCodes(String authScope) {
        String forbidden = StringUtils.hasText(authScope)
                ? "403 無權限：當前賬號缺少所需權限（" + authScope + "）"
                : "403 無權限：當前賬號無此接口權限";
        return String.join("\n",
                "200 成功：業務處理成功",
                "400 參數錯誤：參數缺失、類型不符或業務校驗失敗，message 給出具體原因",
                "401 未認證：未攜帶令牌或令牌已失效，需要重新登入",
                forbidden,
                "404 資源不存在：路徑或標識對應的資源不存在（HTTP 404）",
                "405 請求方法不支援（HTTP 405）",
                "500 系統繁忙：服務端異常，可稍後重試",
                "1006 併發衝突：資源已被他人修改，需刷新後重試");
    }

    /* ==================== 出参结构 ==================== */

    private static List<Node> beanChildren(ResolvableType type, String parentPath, int depth,
                                           Set<Class<?>> stack, int[] budget) {
        Class<?> raw = type.resolve();
        if (raw == null || depth > MAX_DEPTH || budget[0] >= MAX_ROWS) return List.of();
        if (raw.isArray()) {
            // 数组/集合本身不额外占一层：元素字段与集合同一深度，否则 data.records[].items[] 会被截断。
            return beanChildren(type.getComponentType(), parentPath + "[]", depth, stack, budget);
        }
        if (Collection.class.isAssignableFrom(raw)) {
            ResolvableType element = type.asCollection().getGeneric(0);
            return beanChildren(element, parentPath + "[]", depth, stack, budget);
        }
        if (isSimple(raw) || Map.class.isAssignableFrom(raw) || !stack.add(raw)) return List.of();
        List<Node> nodes = new ArrayList<>();
        try {
            for (Class<?> current = raw; current != null && current != Object.class; current = current.getSuperclass()) {
                for (Field field : current.getDeclaredFields()) {
                    if (skip(field)) continue;
                    if (budget[0]++ >= MAX_ROWS) return nodes;
                    ResolvableType fieldType = ResolvableType.forField(field, type);
                    String name = fieldName(field);
                    String path = parentPath.isEmpty() ? name : parentPath + "." + name;
                    nodes.add(new Node(path, name, display(fieldType), typeLabel(fieldType),
                            required(field), fieldDescription(field, name),
                            beanChildren(fieldType, path, depth + 1, stack, budget), enumValues(fieldType)));
                }
            }
        } finally {
            stack.remove(raw);
        }
        return nodes;
    }

    private static boolean skip(Field field) {
        if (Modifier.isStatic(field.getModifiers()) || field.isSynthetic() || Modifier.isTransient(field.getModifiers())) {
            return true;
        }
        if (field.isAnnotationPresent(JsonIgnore.class)) return true;
        String name = field.getName();
        return "serialVersionUID".equals(name) || name.startsWith("$");
    }

    private static String fieldName(Field field) {
        JsonProperty property = field.getAnnotation(JsonProperty.class);
        return property != null && StringUtils.hasText(property.value()) ? property.value() : field.getName();
    }

    private static boolean required(Field field) {
        Schema schema = field.getAnnotation(Schema.class);
        if (schema != null && schema.requiredMode() == Schema.RequiredMode.REQUIRED) return true;
        return field.isAnnotationPresent(NotNull.class) || field.isAnnotationPresent(NotBlank.class)
                || field.isAnnotationPresent(NotEmpty.class);
    }

    private static String fieldDescription(Field field, String name) {
        Schema schema = field.getAnnotation(Schema.class);
        if (schema != null && StringUtils.hasText(schema.description())) return schema.description().trim();
        JsonPropertyDescription description = field.getAnnotation(JsonPropertyDescription.class);
        if (description != null && StringUtils.hasText(description.value())) return description.value().trim();
        return FIELD_LABELS.get(name);
    }

    /* ==================== 请求参数 ==================== */

    private static String parameterName(Parameter parameter) {
        // 显式命名的参数以注解为准（-parameters 未开启时反射名只是 arg0/arg1）。
        RequestParam query = parameter.getAnnotation(RequestParam.class);
        if (query != null && StringUtils.hasText(query.value())) return query.value();
        PathVariable path = parameter.getAnnotation(PathVariable.class);
        if (path != null && StringUtils.hasText(path.value())) return path.value();
        RequestHeader header = parameter.getAnnotation(RequestHeader.class);
        if (header != null && StringUtils.hasText(header.value())) return header.value();
        return StringUtils.hasText(parameter.getName()) ? parameter.getName() : "arg";
    }

    private static String location(Parameter parameter) {
        if (parameter.isAnnotationPresent(RequestBody.class)) return "body";
        if (parameter.isAnnotationPresent(PathVariable.class)) return "path";
        if (parameter.isAnnotationPresent(RequestHeader.class)) return "header";
        if (parameter.isAnnotationPresent(CookieValue.class)) return "cookie";
        return "query";
    }

    private static boolean required(Parameter parameter) {
        if (parameter.isAnnotationPresent(RequestBody.class)) {
            return parameter.getAnnotation(RequestBody.class).required();
        }
        if (parameter.isAnnotationPresent(PathVariable.class)) {
            return parameter.getAnnotation(PathVariable.class).required();
        }
        if (parameter.isAnnotationPresent(RequestHeader.class)) {
            return parameter.getAnnotation(RequestHeader.class).required();
        }
        if (parameter.isAnnotationPresent(RequestParam.class)) {
            return parameter.getAnnotation(RequestParam.class).required();
        }
        return false;
    }

    private static String description(Parameter parameter, String name) {
        io.swagger.v3.oas.annotations.Parameter doc =
                parameter.getAnnotation(io.swagger.v3.oas.annotations.Parameter.class);
        if (doc != null && StringUtils.hasText(doc.description())) return doc.description().trim();
        return FIELD_LABELS.get(name);
    }

    private static List<String> annotations(Parameter parameter) {
        List<String> names = new ArrayList<>();
        for (var annotation : parameter.getAnnotations()) {
            String name = annotation.annotationType().getSimpleName();
            if (Set.of("RequestParam", "PathVariable", "RequestBody", "RequestHeader", "CookieValue").contains(name)) {
                names.add(name);
            }
        }
        return names;
    }

    private static boolean isServletType(Class<?> type) {
        String name = type.getName();
        return name.startsWith("jakarta.servlet.") || name.startsWith("javax.servlet.")
                || name.equals("org.springframework.ui.Model")
                || name.equals("org.springframework.validation.BindingResult")
                || name.equals("java.security.Principal");
    }

    /* ==================== 示例 ==================== */

    private static Object sample(ResolvableType type, int depth, Set<Class<?>> stack) {
        Class<?> raw = type.resolve();
        if (raw == null || depth > MAX_DEPTH) return null;
        if (raw.isArray()) {
            return sampleList(type.getComponentType(), depth, stack);
        }
        if (Collection.class.isAssignableFrom(raw)) {
            return sampleList(type.asCollection().getGeneric(0), depth, stack);
        }
        if (Map.class.isAssignableFrom(raw)) return Map.of();
        if (raw.isEnum()) {
            Object[] constants = raw.getEnumConstants();
            return constants == null || constants.length == 0 ? null : String.valueOf(constants[0]);
        }
        if (raw == String.class || CharSequence.class.isAssignableFrom(raw)) return "string";
        if (raw == boolean.class || raw == Boolean.class) return false;
        if (raw == BigDecimal.class || raw == Double.class || raw == double.class
                || raw == Float.class || raw == float.class) return 0.0;
        if (Number.class.isAssignableFrom(raw) || raw.isPrimitive()) return 0;
        if (raw == LocalDate.class) return LocalDate.now().withMonth(1).withDayOfMonth(1).toString();
        if (raw == LocalDateTime.class) {
            return LocalDateTime.of(2026, 1, 1, 0, 0).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        }
        if (raw == LocalTime.class) return LocalTime.of(0, 0).toString();
        if (raw == Date.class || raw == Instant.class) return "2026-01-01 00:00:00";
        if (isSimple(raw)) return null;
        if (!stack.add(raw)) return null;
        Map<String, Object> object = new LinkedHashMap<>();
        boolean result = "Result".equals(raw.getSimpleName());
        try {
            for (Class<?> current = raw; current != null && current != Object.class; current = current.getSuperclass()) {
                for (Field field : current.getDeclaredFields()) {
                    if (skip(field) || object.size() >= MAX_ROWS) continue;
                    String name = fieldName(field);
                    if (object.containsKey(name)) continue;
                    if (result && "code".equals(name)) {
                        object.put(name, 200);
                    } else if (result && "message".equals(name)) {
                        object.put(name, "操作成功");
                    } else if (sensitive(name)) {
                        object.put(name, "***");
                    } else {
                        object.put(name, sample(ResolvableType.forField(field, type), depth + 1, stack));
                    }
                }
            }
        } finally {
            stack.remove(raw);
        }
        return object;
    }

    /** 集合示例：元素推不出类型（泛型擦除/循环）时给空数组，绝不把 null 放进 List。 */
    private static List<Object> sampleList(ResolvableType element, int depth, Set<Class<?>> stack) {
        Object item = sample(element, depth, stack);
        List<Object> list = new ArrayList<>();
        if (item != null) list.add(item);
        return list;
    }

    private static boolean sensitive(String name) {
        String lower = name.toLowerCase();
        // 用量/统计字段（promptTokens、tokenCount）描述数量，不是凭据。
        if (lower.endsWith("tokens") || lower.endsWith("count") || lower.endsWith("counts")) return false;
        if (SENSITIVE_EXACT.contains(lower)) return true;
        for (String suffix : SENSITIVE_SUFFIX) {
            if (lower.endsWith(suffix)) return true;
        }
        return lower.endsWith("token");
    }

    /* ==================== 类型展示 ==================== */

    private static boolean isSimple(Class<?> raw) {
        if (raw.isPrimitive() || raw.isEnum()) return true;
        return raw == String.class || CharSequence.class.isAssignableFrom(raw)
                || Number.class.isAssignableFrom(raw) || raw == Boolean.class || raw == Character.class
                || raw == LocalDate.class || raw == LocalDateTime.class || raw == LocalTime.class
                || raw == Date.class || raw == Instant.class || raw == java.sql.Date.class
                || raw == java.sql.Timestamp.class || raw == java.util.UUID.class || raw == Class.class
                || raw.getName().startsWith("java.time.");
    }

    private static String display(ResolvableType type) {
        Class<?> raw = type.resolve();
        if (raw == null) return "Object";
        if (raw.isArray()) return display(type.getComponentType()) + "[]";
        String base = raw.getSimpleName();
        ResolvableType[] generics = type.getGenerics();
        if (generics.length > 0 && !raw.isEnum()) {
            String args = String.join(",", Arrays.stream(generics).map(ApiSchemaResolver::display).toList());
            return base + "<" + args + ">";
        }
        return base;
    }

    private static String typeLabel(ResolvableType type) {
        Class<?> raw = type.resolve();
        if (raw == null) return "物件";
        if (raw.isArray() || Collection.class.isAssignableFrom(raw)) return "陣列";
        if (Map.class.isAssignableFrom(raw)) return "鍵值對";
        if (raw.isEnum()) return "枚舉";
        if (raw == String.class || CharSequence.class.isAssignableFrom(raw) || raw == Character.class) return "字串";
        if (raw == int.class || raw == Integer.class || raw == short.class || raw == Short.class
                || raw == byte.class || raw == Byte.class) return "整數";
        if (raw == long.class || raw == Long.class || raw == BigInteger.class) return "長整數";
        if (raw == BigDecimal.class || raw == double.class || raw == Double.class
                || raw == float.class || raw == Float.class) return "小數";
        if (raw == boolean.class || raw == Boolean.class) return "布林";
        if (raw == LocalDate.class || raw == java.sql.Date.class) return "日期";
        if (raw == LocalTime.class) return "時間";
        if (raw == LocalDateTime.class || raw == Date.class || raw == Instant.class
                || raw == java.sql.Timestamp.class) return "日期時間";
        return "物件";
    }

    private static List<String> enumValues(ResolvableType type) {
        Class<?> raw = type.resolve();
        if (raw == null || !raw.isEnum()) return List.of();
        Object[] constants = raw.getEnumConstants();
        if (constants == null) return List.of();
        return Arrays.stream(constants).limit(MAX_ENUM_VALUES).map(String::valueOf).toList();
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("\"", "\\\"");
    }

    /** 常见字段 → 中文释义；没命中时保持空，前端显示 “—”，不编造语义。 */
    private static Map<String, String> fieldLabels() {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put("id", "主鍵");
        labels.put("code", "狀態碼/編碼");
        labels.put("message", "提示信息");
        labels.put("data", "業務資料");
        labels.put("name", "名稱");
        labels.put("title", "標題");
        labels.put("status", "狀態");
        labels.put("type", "類型");
        labels.put("remark", "備註");
        labels.put("description", "說明");
        labels.put("content", "內容");
        labels.put("sort", "排序");
        labels.put("enabled", "是否啟用");
        labels.put("deleted", "是否刪除");
        labels.put("createdAt", "建立時間");
        labels.put("updatedAt", "更新時間");
        labels.put("createdBy", "建立人");
        labels.put("updatedBy", "更新人");
        labels.put("createTime", "建立時間");
        labels.put("updateTime", "更新時間");
        labels.put("page", "頁碼，從 1 開始");
        labels.put("size", "每頁筆數");
        labels.put("total", "總筆數");
        labels.put("records", "當前頁資料");
        labels.put("list", "資料列表");
        labels.put("keyword", "關鍵字");
        labels.put("startDate", "開始日期");
        labels.put("endDate", "結束日期");
        labels.put("startTime", "開始時間");
        labels.put("endTime", "結束時間");
        labels.put("amount", "金額");
        labels.put("price", "單價");
        labels.put("quantity", "數量");
        labels.put("unit", "單位");
        labels.put("phone", "手機號");
        labels.put("email", "電子郵箱");
        labels.put("deptId", "部門標識");
        labels.put("deptName", "部門名稱");
        labels.put("userId", "使用者標識");
        labels.put("userName", "使用者名稱");
        labels.put("employeeId", "員工標識");
        labels.put("employeeNo", "工號");
        labels.put("employeeName", "員工姓名");
        labels.put("avatar", "頭像地址");
        labels.put("path", "路徑");
        labels.put("method", "請求方法");
        labels.put("version", "版本");
        labels.put("ownerUserId", "負責人標識");
        labels.put("ownerUserName", "負責人姓名");
        labels.put("systemCode", "所屬系統標識");
        labels.put("systemName", "所屬系統名稱");
        labels.put("apiName", "接口名稱");
        labels.put("scenario", "使用場景");
        labels.put("authType", "鑑權方式");
        labels.put("authScope", "所需權限");
        labels.put("visibility", "可見範圍");
        labels.put("docStatus", "發布狀態");
        labels.put("requestExample", "請求示例");
        labels.put("responseExample", "響應示例");
        labels.put("errorCodes", "錯誤碼說明");
        labels.put("changelog", "變更記錄");
        labels.put("fields", "欄位清單");
        labels.put("children", "子節點");
        labels.put("count", "數量");
        labels.put("reason", "原因");
        labels.put("note", "備註");
        labels.put("level", "層級");
        labels.put("parentId", "上級標識");
        labels.put("menuKey", "選單標識");
        labels.put("roleId", "角色標識");
        labels.put("roleName", "角色名稱");
        labels.put("beginTime", "開始時間");
        labels.put("finishTime", "完成時間");
        labels.put("updateBy", "更新人");
        labels.put("createBy", "建立人");
        return Map.copyOf(labels);
    }
}
