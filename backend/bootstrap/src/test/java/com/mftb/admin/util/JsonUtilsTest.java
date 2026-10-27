package com.mftb.admin.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * JsonUtils 单元测试
 */
class JsonUtilsTest {

    @Test
    @DisplayName("parseLongList: 正常解析 Long 数组")
    void parseLongList_validJson() {
        List<Long> result = JsonUtils.parseLongList("[1,2,3]");
        assertThat(result).containsExactly(1L, 2L, 3L);
    }

    @Test
    @DisplayName("parseLongList: null/空白/非法 JSON 均返回空列表")
    void parseLongList_invalidInput_returnsEmpty() {
        assertThat(JsonUtils.parseLongList(null)).isEmpty();
        assertThat(JsonUtils.parseLongList("  ")).isEmpty();
        assertThat(JsonUtils.parseLongList("not-json")).isEmpty();
        assertThat(JsonUtils.parseLongList("{\"a\":1}")).isEmpty();
    }

    @Test
    @DisplayName("parseStringList: 正常解析与异常降级")
    void parseStringList() {
        assertThat(JsonUtils.parseStringList("[\"a\",\"b\"]")).containsExactly("a", "b");
        assertThat(JsonUtils.parseStringList("[broken")).isEmpty();
    }

    @Test
    @DisplayName("parseMap: 正常解析与异常降级")
    void parseMap() {
        Map<String, Object> map = JsonUtils.parseMap("{\"amount\":\"100.50\",\"note\":\"test\"}");
        assertThat(map).containsEntry("amount", "100.50").containsEntry("note", "test");

        assertThat(JsonUtils.parseMap(null)).isEmpty();
        assertThat(JsonUtils.parseMap("[1,2]")).isEmpty();
    }

    @Test
    @DisplayName("parseMapList: 正常解析与异常降级")
    void parseMapList() {
        List<Map<String, Object>> list =
                JsonUtils.parseMapList("[{\"tier\":1,\"price\":10},{\"tier\":2,\"price\":8}]");
        assertThat(list).hasSize(2);
        assertThat(list.get(0)).containsEntry("tier", 1);

        assertThat(JsonUtils.parseMapList("invalid")).isEmpty();
    }

    @Test
    @DisplayName("toJson: 序列化与失败降级为空数组")
    void toJson() {
        assertThat(JsonUtils.toJson(List.of(1, 2))).isEqualTo("[1,2]");
        assertThat(JsonUtils.toJson(null)).isEqualTo("null");
    }

    @Test
    @DisplayName("parseList: 泛型解析与异常降级")
    void parseList() {
        List<Integer> result = JsonUtils.parseList("[1,2,3]", Integer.class);
        assertThat(result).containsExactly(1, 2, 3);

        assertThat(JsonUtils.parseList("bad", Integer.class)).isEmpty();
        assertThat(JsonUtils.parseList(null, Integer.class)).isEmpty();
    }
}
