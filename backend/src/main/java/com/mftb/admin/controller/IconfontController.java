package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * IconFont 数据访问接口
 */
@Slf4j
@RestController
@RequestMapping("/api/iconfont")
@RequiredArgsConstructor
public class IconfontController {

    /**
     * 获取 IconFont 卡片头像列表（模拟从 https://www.iconfont.cn/search/index?searchType=icon&q=%E5%8D%A1%E9%80%9A%E5%A4%B4%E5%83%8F&page=1 抓取）
     * @param q 搜索关键词
     * @param page 页码
     * @param pageSize 每页数量
     */
    @GetMapping("/avatars")
    public Result<Map<String, Object>> getAvatars(
            @RequestParam(defaultValue = "卡通头像") String q,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "40") int pageSize) {
        
        try {
            // 模拟从 IconFont 网站获取数据（实际项目中应该使用爬虫或官方 API）
            List<Map<String, Object>> data = simulateIconFontData(q, page, pageSize);
            
            Map<String, Object> result = new HashMap<>();
            result.put("data", data);
            result.put("total", page * pageSize * 3); // 模拟总数
            result.put("page", page);
            result.put("pageSize", pageSize);
            
            return Result.success(result);
        } catch (Exception e) {
            log.error("获取 IconFont 头像失败", e);
            return Result.error("Failed to load avatars: " + e.getMessage());
        }
    }

    /**
     * 模拟 IconFont 数据结构（用于测试和演示）
     * 实际生产环境中应该替换为真实的爬虫实现或使用第三方服务
     */
    private List<Map<String, Object>> simulateIconFontData(String keyword, int page, int pageSize) {
        List<Map<String, Object>> results = new ArrayList<>();
        
        // 生成一些模拟数据（每个页面 40 条）
        int startId = (page - 1) * pageSize + 1;
        for (int i = 0; i < pageSize && i < 40; i++) {
            Map<String, Object> avatar = new HashMap<>();
            avatar.put("id", startId + i);
            avatar.put("title", generateAvatarTitle(keyword, startId + i));
            // 使用 Placeholder 图片作为模拟数据
            // 实际应用中应该解析 IconFont 网页并提取 icon_url
            avatar.put("icon_url", "https://placehold.co/128x128/E8720C/ffffff.png?text=" + (startId + i));
            avatar.put("category", "卡通");
            results.add(avatar);
        }
        
        return results;
    }

    /**
     * 生成头像标题
     */
    private String generateAvatarTitle(String keyword, int id) {
        String[] prefixes = {"可爱", "商务", "科技", "创意", "简约", "卡通", "动漫", "萌趣"};
        String prefix = prefixes[id % prefixes.length];
        return prefix + keyword + "-" + id;
    }
}
