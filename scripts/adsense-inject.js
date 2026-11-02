/**
 * AdSense 广告随机放置
 *
 * 构建期：模板在候选位置预置隐藏锚点 .kr-ad-anchor，广告元素渲染在
 * 列表/正文末尾作为兜底位置。
 * 客户端：页面每次加载时随机选择一个锚点，把广告移动到该位置展示
 * （刷新即换位置），再按域名白名单决定展示真实广告或占位框。
 *
 * 两个入口：
 *   1. ad_relocate_script(hasSlot) —— 控制脚本（ad.ejs 与本文件共用）
 *   2. ad_between_h2(content)      —— 文章正文注入（段落末尾锚点）
 *
 * 以 helper 形式提供（而非 after_post_render 过滤器），保证 RSS、搜索
 * 索引、列表摘要与字数统计使用的 post.content 保持干净，广告仅在渲染
 * 输出中出现。
 *
 * 行为矩阵：
 *   slot 已填 + 生产域名（KR_ADSENSE_DOMAINS 白名单）→ 随机位置展示真实广告
 *   slot 已填 + 其他域名（localhost 等）            → 随机位置展示占位框
 *   slot 未填 + 其他域名                            → 随机位置展示「未配置」占位框
 *   slot 未填 + 生产域名                            → 不展示任何内容
 *
 * 单篇文章关闭广告：front-matter 中写 no_ads: true
 * 注意：代码块中的 <h2> 会被 Markdown 渲染转义为 &lt;h2&gt;，不会误判。
 */

"use strict";

/**
 * 生成广告随机放置控制脚本
 * @param {boolean} hasSlot - 是否已配置广告单元 ID
 */
hexo.extend.helper.register("ad_relocate_script", function (hasSlot) {
  const domainCheck =
    "var w=window,d=w.KR_ADSENSE_DOMAINS,h=location.hostname,ok=!d||!d.length;" +
    "if(!ok){for(var j=0;j<d.length;j++){var x=d[j];if(h===x||h.slice(-(x.length+1))==='.'+x){ok=true;break;}}}";
  const place =
    "var as=document.querySelectorAll('.kr-ad-anchor');" +
    "if(as.length){var pick=as[Math.floor(Math.random()*as.length)];" +
    "pick.parentNode.insertBefore(ad,pick);" +
    "for(var i=0;i<as.length;i++)as[i].remove();}";
  const ready =
    "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();";
  const head =
    "(function(){" +
    "var s=document.currentScript,ad=s&&s.closest?s.closest('.kr-ad-slot'):null;" +
    "if(!ad)return;";

  if (hasSlot) {
    return (
      "<script>" +
      head +
      "function run(){" +
      place +
      domainCheck +
      "if(ok){(w.adsbygoogle=w.adsbygoogle||[]).push({});}" +
      "else{var el=ad.querySelector('ins.adsbygoogle');if(el){var ph=document.createElement('div');ph.className='kr-ad-ph';ph.textContent='广告占位（当前域名不在生产白名单，未加载真实广告）';el.replaceWith(ph);}}" +
      "}" +
      ready +
      "})();</script>"
    );
  }
  // slot 未填：本地环境随机位置显示占位框，生产环境整体移除
  return (
    "<script>" +
    head +
    "function run(){" +
    domainCheck +
    "if(ok){ad.remove();return;}" +
    place +
    "}" +
    ready +
    "})();</script>"
  );
});

/**
 * 文章正文注入：在每个二级标题（H2）段落的末尾（该段落内容结束、下一个
 * H2 之前；最后一个 H2 段落的末尾即正文末尾）预置锚点，广告元素追加到
 * 正文末尾，由控制脚本随机放置。
 */
hexo.extend.helper.register("ad_between_h2", function (content) {
  const ads = hexo.theme.config.adsense;

  // 配置不完整时原样返回，不影响页面
  if (!ads || !ads.client || !ads.post_content) return content;
  const conf = ads.post_content;
  // slot 未填时仍注入占位框：非白名单（本地）环境显示，生产环境客户端移除
  if (!conf.enable) return content;

  if (typeof content !== "string" || content.length === 0) return content;

  // 单篇文章 opt-out 与加密文章跳过
  const page = this.page;
  if (page && (page.no_ads || page.encrypt)) return content;

  const minLength = Number(conf.min_length) || 0;
  if (minLength > 0 && content.length < minLength) return content;

  // 收集每个二级标题段落的末尾位置：
  // 第 i 个 H2 段落的末尾 = 第 i+1 个 H2 起始标签之前；
  // 最后一个 H2 段落的末尾 = 正文末尾。
  const re = /<h2\b/gi;
  const starts = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    starts.push(m.index);
  }
  if (starts.length === 0) return content; // 没有 H2 段落，无法定位段落末尾
  const ends = starts.slice(1); // 第 2..N 个 H2 之前 = 各段落末尾
  ends.push(content.length); // 最后一个 H2 段落的末尾 = 正文末尾

  const label = ads.label || "广告";
  const anchor = '<div class="kr-ad-anchor" hidden></div>';
  const adHtml =
    '<div class="kr-ad-slot kr-ad-inarticle" role="complementary" aria-label="' +
    label +
    '">' +
    '<span class="kr-ad-tag"><i class="fa fa-bullhorn" aria-hidden="true"></i>' +
    label +
    "</span>" +
    (conf.slot
      ? '<ins class="adsbygoogle" style="display:block;text-align:center;"' +
        ' data-ad-layout="in-article" data-ad-format="fluid"' +
        ' data-ad-client="' +
        ads.client +
        '" data-ad-slot="' +
        conf.slot +
        '"></ins>'
      : '<div class="kr-ad-ph">广告占位（未配置广告单元 ID）</div>') +
    hexo.extend.helper.get("ad_relocate_script")(!!conf.slot) +
    "</div>";

  // 在各段落末尾插入锚点（按位置升序拼接），广告元素置于正文末尾（无 JS 时的兜底位置）
  let out = "";
  let cursor = 0;
  for (const p of ends) {
    out += content.slice(cursor, p) + anchor;
    cursor = p;
  }
  out += content.slice(cursor) + adHtml;
  return out;
});
