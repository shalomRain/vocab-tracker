# 英语学习台账（vocab-tracker）

本地单页应用：维护单词 / 短语 / 连词 / 语法，勾选使用后累计学习时间，并按策略推荐练习条目。

## 打开方式

- 直接用浏览器打开 `index.html`
- 或在本目录启动本地静态服务后访问

数据保存在浏览器 `localStorage`。换设备或清站点数据前请先「导出」JSON。

## 已确认产品规则

1. 推荐默认：**少用优先**；可切换「久未复习优先」「高频巩固」
2. 同一天多次勾选：**全部记录**（真实频率）
3. 删除改为：**归档**（保留 `usages`）
4. 以目录形式长期维护（本仓库内）
5. **故事模式**：按推荐策略抽本局词牌（默认 8，可改数量）→ 点选高亮 → 讲完后「确认使用」批量写入 `usages`

## 目录

```
vocab-tracker/
  index.html
  source-data.md   # 原始数据（Markdown 源）
  assets/
    styles.css
    seed.js        # 种子数据（全量同步自 source-data.md）
    storage.js     # localStorage 读写、种子合并、导入导出
    app.js         # 学习端 / 管理端交互
```

## 种子同步

- 维护时先改 `source-data.md`，再同步到 `assets/seed.js`，并递增 `VOCAB_SEED_VERSION`
- 打开页面时若本地 `seedVersion` 落后，会**合并**缺失种子，并更新同 id 的文案；**保留**已有 `usages` / 归档状态

## 备份

顶部「导出」→ 保存 JSON；「导入」可恢复（会覆盖当前本地数据）。
