# BTC GENERAL 官网

BTC GENERAL / 比特司令官网项目，包含：

- 黑金金融科技风首页
- Gate 返佣比例与收益示例
- 三大核心服务能力功能卡
- Telegram 社区/合作/套利引擎 CTA
- Cloudflare Pages Function 实时 BTC 行情接口：`/api/market`

## 项目结构

```text
index.html                 # 首页
styles.css                 # 样式
script.js                  # 前端交互与行情渲染
assets/bitcommander-logo.png
functions/api/market.js    # Cloudflare Pages Function，提供 /api/market
market_server.py           # 本地预览服务器，提供同源 /api/market
```

## 本地预览

推荐使用本地预览服务器，这样实时行情接口也可用：

```bash
python market_server.py
```

然后打开：

```text
http://127.0.0.1:8788/index.html
```

## Cloudflare Pages 部署

部署设置：

- Framework preset: `None`
- Build command: 留空
- Build output directory: `/` 或留空/根目录
- Functions directory: 自动识别 `functions/`

部署后检查：

```text
https://你的项目.pages.dev/index.html
https://你的项目.pages.dev/api/market
```

`/api/market` 成功时会返回 BTC 实时行情 JSON。

## 自定义域名

推荐主域名：

```text
https://www.btcgeneral.com
```

同时设置根域名跳转：

```text
https://btcgeneral.com -> https://www.btcgeneral.com
```

## 注意

网站内容仅作市场观察，不构成投资建议。
