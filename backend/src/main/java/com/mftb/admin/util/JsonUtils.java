package com.mftb.admin.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.MenuPermissionDTO;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSON 工具: 处理 function_roles / permissions 字段的序列化与反序列化
 */
@Slf4j
public final class JsonUtils {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonUtils() {
    }

    /** 解析角色ID JSON数组, 解析失败返回空列表 */
    public static List<Long> parseLongList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<Long>>() {
            });
        } catch (Exception e) {
            log.warn("解析角色ID列表失败, 返回空列表: json={}, msg={}", json, e.getMessage());
            return new ArrayList<>();
        }
    }

    /** 解析菜单权限 JSON数组, 解析失败返回空列表 */
    public static List<MenuPermissionDTO> parsePermissions(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<MenuPermissionDTO>>() {
            });
        } catch (Exception e) {
            log.warn("解析菜单权限列表失败, 返回空列表: json={}, msg={}", json, e.getMessage());
            return new ArrayList<>();
        }
    }

    /** 解析字符串 JSON数组, 解析失败返回空列表 */
    public static List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception e) {
            log.warn("解析字符串列表失败, 返回空列表: json={}, msg={}", json, e.getMessage());
            return new ArrayList<>();
        }
    }

    /** 解析 JSON 对象为 Map（财务模块 extra 扩展数据），解析失败返回空 Map */
    public static Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("解析 JSON Map 失败, 返回空 Map: json={}, msg={}", json, e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    /** 解析 JSON 对象数组为 List<Map>（广告模块折扣/扣费梯度等），解析失败返回空列表 */
    public static List<Map<String, Object>> parseMapList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<Map<String, Object>>>() {
            });
        } catch (Exception e) {
            log.warn("解析 JSON Map 列表失败, 返回空列表: json={}, msg={}", json, e.getMessage());
            return new ArrayList<>();
        }
    }

    /** 序列化为 JSON 字符串 */
    public static String toJson(Object obj) {
        try {
            return MAPPER.writeValueAsString(obj);
        } catch (Exception e) {
            log.warn("JSON 序列化失败, 返回空数组: type={}, msg={}",
                    obj != null ? obj.getClass().getSimpleName() : "null", e.getMessage());
            return "[]";
        }
    }

    /** 泛型解析 JSON 数组为 List<T>，解析失败返回空列表 */
    public static <T> List<T> parseList(String json, Class<T> elementClass) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json,
                MAPPER.getTypeFactory().constructCollectionType(List.class, elementClass));
        } catch (Exception e) {
            log.warn("解析 JSON 列表失败, 返回空列表: elementClass={}, msg={}",
                    elementClass.getSimpleName(), e.getMessage());
            return new ArrayList<>();
        }
    }
}
