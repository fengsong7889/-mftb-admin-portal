package com.mftb.admin.service.doc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PageResult;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 接口文档结构化：出参字段表、示例脱敏、请求参数位置、鉴权 scope 与接口名草稿。 */
class ApiSchemaResolverTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void responseUnwrapsWrapperAndKeepsFieldSemantics() throws Exception {
        JsonNode schema = JSON.readTree(ApiSchemaResolver.responseJson(method("page")));
        assertEquals("Result<PageResult<DemoVO>>", schema.get("raw").asText());
        JsonNode fields = schema.get("fields");
        assertEquals("code", field(fields, "code").get("name").asText());
        assertEquals("狀態碼/編碼", field(fields, "code").get("description").asText());

        JsonNode data = field(fields, "data");
        assertEquals("data", data.get("path").asText());
        assertEquals("物件", data.get("typeLabel").asText());

        JsonNode records = field(data.get("children"), "records");
        assertEquals("data.records", records.get("path").asText());
        assertEquals("陣列", records.get("typeLabel").asText());

        JsonNode id = field(records.get("children"), "id");
        assertEquals("data.records[].id", id.get("path").asText());
        assertEquals("主鍵", id.get("description").asText());
        assertTrue(id.get("required").asBoolean(), "@NotNull 必须标记必填");
        assertEquals("長整數", id.get("typeLabel").asText());

        JsonNode name = field(records.get("children"), "name");
        assertEquals("名稱", name.get("description").asText());
        assertTrue(name.get("required").asBoolean(), "@NotBlank 必须标记必填");

        JsonNode status = field(records.get("children"), "status");
        assertEquals("枚舉", status.get("typeLabel").asText());
        assertEquals("ACTIVE", status.get("enumValues").get(0).asText());
    }

    @Test
    void responseExpandsNestedListInsideElement() throws Exception {
        JsonNode schema = JSON.readTree(ApiSchemaResolver.responseJson(method("page")));
        JsonNode records = field(field(schema.get("fields"), "data").get("children"), "records");
        JsonNode items = field(records.get("children"), "items");
        assertEquals("data.records[].items", items.get("path").asText());
        assertEquals("data.records[].items[].label", field(items.get("children"), "label").get("path").asText());
    }

    @Test
    void exampleUsesEnvelopeAndMasksSecrets() throws Exception {
        JsonNode example = JSON.readTree(ApiSchemaResolver.example(method("page")));
        assertEquals(200, example.get("code").asInt());
        assertEquals("操作成功", example.get("message").asText());
        assertEquals("string", example.at("/data/records/0/name").asText());
        assertEquals("***", example.at("/data/records/0/password").asText(), "密码字段示例值必须脱敏");
        assertFalse(example.toString().contains("demo-secret"), "示例不得出现任何真实值");
    }

    @Test
    void requestParamsCarryLocationRequiredAndFieldTrees() throws Exception {
        JsonNode params = JSON.readTree(ApiSchemaResolver.requestParams(method("page")));

        JsonNode keyword = param(params, "keyword");
        assertEquals("query", keyword.get("location").asText());
        assertFalse(keyword.get("required").asBoolean());

        JsonNode id = param(params, "id");
        assertEquals("path", id.get("location").asText());
        assertTrue(id.get("required").asBoolean());

        JsonNode body = param(params, "body");
        assertEquals("body", body.get("location").asText());
        assertTrue(body.get("required").asBoolean());
        JsonNode title = field(body.get("children"), "title");
        assertTrue(title.get("required").asBoolean(), "DTO 字段的 @NotBlank 必须透传必填");
        assertEquals("標題", title.get("description").asText());
    }

    @Test
    void requestExampleUsesBodyDtoAndMasksSecrets() throws Exception {
        JsonNode body = JSON.readTree(ApiSchemaResolver.requestExample(method("page")));
        assertEquals("string", body.get("title").asText());
        assertEquals("***", body.get("password").asText(), "请求体示例同样要脱敏");
        assertEquals("***", body.get("accessToken").asText(), "令牌字段必须脱敏");
        assertEquals(0, body.get("promptTokens").asInt(), "用量计数不是凭据，不应脱敏");
        assertNull(ApiSchemaResolver.requestExample(method("node")), "无 @RequestBody 时不应编造请求体");
    }

    @Test
    void authScopeCollectsPrimaryAndAlternativeMenus() throws Exception {
        assertEquals("demo:edit | demo-backup:edit", ApiSchemaResolver.authScope(method("page")));
        String codes = ApiSchemaResolver.errorCodes(ApiSchemaResolver.authScope(method("page")));
        assertTrue(codes.contains("403"), "错误码必须包含 403");
        assertTrue(codes.contains("demo:edit"), "403 文案必须点明所需权限");
        assertTrue(codes.startsWith("200"), "错误码以 200 开头");
    }

    @Test
    void cyclicTypeDoesNotLoopForever() throws Exception {
        JsonNode schema = JSON.readTree(ApiSchemaResolver.responseJson(method("node")));
        assertNotNull(schema.get("fields"));
        assertTrue(schema.get("fields").size() > 0);
    }

    @Test
    void draftNamesPreferVerbAndResourceFromMethodThenPath() {
        assertEquals("員工列表", ApiNameDraft.draft("GET", "page", "/api/employees"));
        assertEquals("資產詳情", ApiNameDraft.draft("GET", "detail", "/api/eam/assets/{id}"));
        assertEquals("新增資產", ApiNameDraft.draft("POST", "create", "/api/eam/assets"));
        assertEquals("匯出花名冊", ApiNameDraft.draft("POST", "rosterExport", "/api/employees/roster/export"));
        assertEquals("修改角色狀態", ApiNameDraft.draft("PUT", "updateStatus", "/api/roles/{id}/status"));
        assertEquals("員工選項", ApiNameDraft.draft("GET", "employeeOptions", "/api/employees/options"));
        assertEquals("運行統計", ApiNameDraft.draft("GET", "myStats", "/api/agent/runs"));
        assertEquals("下單", ApiNameDraft.draft("POST", "placeOrder", "/api/finance/orders"));
        assertEquals("借用列表", ApiNameDraft.draft("GET", "list", "/api/eam/borrows"));
        assertEquals("新增入庫", ApiNameDraft.draft("POST", "create", "/api/eam/consumables/inbound"));
        assertEquals("證照詳情", ApiNameDraft.draft("GET", "detail", "/api/hr/certificate/{id}"));
        assertEquals("測試通知", ApiNameDraft.draft("POST", "test", "/api/notification-channels/{id}/test"));
    }

    @Test
    void draftLeavesNameBlankWhenNoResourceIsIdentifiable() {
        assertNull(ApiNameDraft.draft("GET", "mysteryThing", "/api/x"));
        assertNull(ApiNameDraft.draft("GET", "my", "/api/oa/system-access-requests/my"),
                "限定词不能单独当主体，宁可不给名字");
    }

    private static Method method(String name) throws Exception {
        for (Method method : DemoController.class.getDeclaredMethods()) {
            if (method.getName().equals(name)) return method;
        }
        throw new IllegalStateException("找不到用例方法: " + name);
    }

    private static JsonNode field(JsonNode nodes, String name) {
        if (nodes != null) {
            for (JsonNode node : nodes) {
                if (name.equals(node.get("name").asText())) return node;
            }
        }
        throw new AssertionError("缺少字段: " + name);
    }

    private static JsonNode param(JsonNode nodes, String name) {
        for (JsonNode node : nodes) {
            if (name.equals(node.get("name").asText())) return node;
        }
        throw new AssertionError("缺少参数: " + name);
    }

    /* ==================== 夹具 ==================== */

    enum DemoStatus { ACTIVE, DISABLED }

    static class DemoItem {
        private String label;
        private int count;
    }

    static class DemoVO {
        @NotNull
        private Long id;
        @NotBlank
        private String name;
        private DemoStatus status;
        @Schema(description = "登入密碼")
        private String password;
        private List<DemoItem> items;
    }

    static class DemoBody {
        @NotBlank
        private String title;
        private Integer page;
        private String password;
        private String accessToken;
        private Integer promptTokens;
    }

    static class DemoNode {
        private String name;
        private DemoNode parent;
    }

    @SuppressWarnings("unused")
    static class DemoController {

        @RequirePermission(menu = "demo", action = "edit", anyOf = {"demo-backup"})
        public Result<PageResult<DemoVO>> page(@RequestParam(required = false) String keyword,
                                               @RequestBody DemoBody body,
                                               @PathVariable long id) {
            return Result.success();
        }

        public Result<DemoNode> node() {
            return Result.success();
        }
    }
}
