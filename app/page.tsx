/* eslint-disable @next/next/no-html-link-for-pages -- The production vinext router fails on client navigation; use document links. */

export default function Landing() {
  return <main className="portal landing">
    <header><a className="brand" href="/"><span aria-hidden="true">∿</span> Harness Eval</a><nav><a href="/demo">体验演示</a><a className="nav-enter" href="/workspace">企业登录 ↗</a></nav></header>
    <section className="hero"><div><p className="eyebrow">企业 Agent 评测平台</p>
      <h1>看清 Agent<br/>每一次迭代。</h1>
      <p className="intro">把真实运行记录变成可重复评测的样本。让产品、研发和业务团队在同一份证据上，判断一次更新修复了什么，又影响了什么。</p>
      <div className="actions"><a className="cta" href="/workspace">进入企业工作区 →</a><a href="/demo">用示例数据体验 ↗</a></div></div>
      <aside className="report"><div className="report-head"><span>版本回归报告</span><small>演示数据</small></div>
        <p>配对样本成功率</p><div className="scores"><b>2/6</b><span>→</span><b>5/6</b></div>
        <div className="ruler"><i/><i/><i/><i/><i/><i/></div>
        <div className="versions"><span>基线 v1</span><span>候选 v2</span></div>
        <div className="report-line"><span>工具选择正确</span><b>4/6 → 6/6</b></div>
        <a href="/demo?view=eval">查看样本与评测口径 →</a>
      </aside>
    </section>
    <section className="features" aria-label="平台能力">
      <article><small>TRACE</small><h2>还原一次运行</h2><p>从本地 Agent 上报或导入 JSON，查看执行步骤，标记意图、规划、工具等阶段的首要失败原因。</p></article>
      <article><small>DATASET</small><h2>沉淀可复测样本</h2><p>保留预期行为、人工标注和判断依据，按项目组织数据集，并导出 JSONL。</p></article>
      <article><small>EVAL</small><h2>比较版本变化</h2><p>按同一任务配对基线与候选版本，回看修复和退化，比较成功率、Token 与耗时。</p></article>
    </section>
    <footer><div><b>独立企业工作区</b><p>每家企业独立管理项目、Trace 与评测样本。首次开通请联系平台管理员获取企业访问密钥。</p></div><nav><a href="/legacy">原私有工作区</a><a href="/admin">租户管理 ↗</a></nav></footer>
  </main>;
}
