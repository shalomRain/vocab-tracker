# 英语学习台账（vocab-tracker）

本地单页应用：维护单词 / 短语 / 连词 / 语法，勾选使用后累计学习时间，并按策略推荐练习条目。支持 Supabase 登录后多端同步。

## 打开方式

- 直接用浏览器打开 `index.html`（仅本地，不同步）
- 或部署到 Vercel / Cloudflare Pages 后用 HTTPS 访问（手机可用）
- 登录后，学习记录会写入 Supabase，多设备自动对齐

未登录时数据仍保存在浏览器 `localStorage`。换设备或清站点数据前请先「导出」JSON，或先登录完成同步。

## 已确认产品规则

1. 推荐默认：**少用优先**；可切换「久未复习优先」「高频巩固」
2. 同一天多次勾选：**全部记录**（真实频率）
3. 删除改为：**归档**（保留 `usages`）
4. 以目录形式长期维护（本仓库内）
5. **故事模式**：按推荐策略抽本局词牌（默认 8，可改数量）→ 点选高亮 → 讲完后「确认使用」批量写入 `usages`
6. **云端同步**：Magic Link 登录后，本地与云端快照自动合并 / 上传 / 下载

## 目录

```
vocab-tracker/
  index.html
  source-data.md          # 原始数据（Markdown 源）
  supabase-setup.sql      # Supabase 建表 + RLS（需手动执行一次）
  assets/
    config.js             # Supabase URL / anon key
    styles.css
    seed.js               # 种子数据
    storage.js            # localStorage 读写、种子合并、导入导出
    sync.js               # Supabase 登录与云端快照同步
    app.js                # 学习端 / 管理端交互
```

## 云端同步（方案 A）

### 你需要在控制台完成的步骤

1. **执行 SQL**：Supabase → SQL Editor → 粘贴并运行 `supabase-setup.sql`
2. **开启 Email 登录**：Authentication → Providers → Email（Magic Link / OTP）保持开启
3. **配置回调地址**：Authentication → URL Configuration
   - Site URL：你的线上正式域名（生产 URL，不要用带密码墙的预览链）
   - Redirect URLs 建议同时包含：
     - `https://你的生产域名/`
     - `http://localhost:任意端口/`（本地调试）
     - 若有稳定预览域名也一并加入
4. **部署前端**：把本目录发布到 Vercel；Root Directory 指向 `vocab-tracker`
5. **关闭 Vercel 访问保护**（若打开页面会跳到 Vercel Login）：Project → Settings → Deployment Protection → 对生产环境关闭，否则手机/访客无法直接用，且 Magic Link 回调也会失败
6. 打开线上页面 →「登录同步」→ 查收邮件点链接 → 顶栏显示邮箱与「已同步」

### 同步行为

- 仅本地有数据：首次登录后上传到云端
- 仅云端有 / 本地几乎无学习痕迹：拉取云端
- 两边都有：按词条 id 合并，`usages` 按时间戳去重并集，再写回云端
- 之后每次变更：先写 localStorage，再 debounce 推送到云端

## 种子同步

- 维护时先改 `source-data.md`，再同步到 `assets/seed.js`，并递增 `VOCAB_SEED_VERSION`
- 打开页面时若本地 `seedVersion` 落后，会**合并**缺失种子，并更新同 id 的文案；**保留**已有 `usages` / 归档状态

## 备份

顶部「导出」→ 保存 JSON；「导入」可恢复（会覆盖当前本地数据；已登录时随后会推上云端）。
