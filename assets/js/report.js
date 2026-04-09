(() => {
  const payload = JSON.parse(localStorage.getItem('socialstreamReportPayload') || 'null');
  const root = document.getElementById('reportRoot');
  if (!root) return;

  if (!payload) {
    root.innerHTML = `<section class="report-empty"><h1>No report data found</h1><p>Return to dashboard, run analysis or demo, then click Export Report.</p><a href="dashboard.html" class="report-link">Open workspace</a></section>`;
    return;
  }

  const set = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html || '';
  };

  const generatedAt = document.getElementById('reportGeneratedAt');
  if (generatedAt) {
    const ts = payload.generatedAt ? new Date(payload.generatedAt) : new Date();
    const view = payload.activeView ? ` · ${payload.activeView}` : '';
    generatedAt.textContent = `Generated on ${ts.toLocaleString()}${view}`;
  }

  set('reportNarrative', payload.narrative || '<p>No narrative available.</p>');
  set('reportRecs', payload.recs || '<li>No recommendations available.</li>');
  set('reportFindings', (payload.findings || []).map(v => `<article class="finding-card">${v}</article>`).join('') || '<article class="finding-card">No findings available.</article>');
  set('reportKpis', payload.kpis || '<p>No KPI data.</p>');
  set('reportHighlights', payload.highlights || '<p>No highlights available.</p>');
  set('reportLowlights', payload.lowlights || '<p>No lowlights available.</p>');
  set('reportTable', payload.table || '<p>No appendix data.</p>');

  const chartsWrap = document.getElementById('reportCharts');
  if (chartsWrap) {
    (payload.charts || []).forEach(c => {
      const card = document.createElement('article');
      card.className = 'report-card report-chart';
      card.innerHTML = `<h3>${c.title}</h3><img src="${c.image}" alt="${c.title}">`;
      chartsWrap.appendChild(card);
    });
  }

})();
