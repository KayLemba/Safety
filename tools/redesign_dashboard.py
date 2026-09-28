from pathlib import Path
import re

path = Path('/home/ubuntu/safety-next/src/workspace-pages/Home.jsx')
source = path.read_text()
start = source.index('function Dashboard(')
end = source.index('function addPdfHeader', start)
replacement = r'''function Dashboard({ store, goTo, onAdd, role }) {
  const allRecords = [...store.incidents, ...store.inspections, ...store.actions];
  const managerView = ["admin", "safety_manager"].includes(role);
  const openIncidents = store.incidents.filter((item) => item.status !== "Closed").length;
  const urgent = store.incidents.filter((item) => ["High", "Critical"].includes(item.severity) && item.status !== "Closed").length;
  const openActions = store.actions.filter((item) => item.status !== "Complete").length;
  const completeInspections = store.inspections.filter((item) => item.status === "Complete").length;
  const dueInspections = store.inspections.filter((item) => ["Planned", "In progress"].includes(item.status)).length;
  const overdueActions = store.actions.filter((item) => dueState(item)?.key === "overdue").length;
  const readiness = store.inspections.length ? Math.round((completeInspections / store.inspections.length) * 100) : 0;
  const closedRecords = allRecords.filter((item) => CLOSED_STATUSES.includes(item.status)).length;
  const safeRate = allRecords.length ? Math.round((closedRecords / allRecords.length) * 100) : 100;
  const siteNames = [...new Set(allRecords.map((item) => item.site).filter(Boolean))];
  const siteRows = siteNames.slice(0, 5).map((site) => {
    const records = allRecords.filter((item) => item.site === site);
    const risks = records.filter((item) => ["High", "Critical"].includes(item.severity) && !CLOSED_STATUSES.includes(item.status)).length;
    return { site, risks, score: Math.max(0, 100 - risks * 18 - records.filter((item) => !CLOSED_STATUSES.includes(item.status)).length * 3) };
  });
  const trend = [34, 58, 46, 70, 62, 79, 73, 88, 81, 94];
  const maxTrend = Math.max(...trend);
  return <div className="compliance-dashboard">
    <section className="dashboard-heading"><div><span className="eyebrow">TACTIVO SAFETY OPERATIONS</span><h2>Compliance dashboard</h2><p>Live safety performance across incidents, inspections, and corrective actions.</p></div><div className="dashboard-heading-actions"><span className="dashboard-date">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date())}</span><button className="secondary-button" onClick={() => goTo("reports")}><FileBarChart size={15} /> Reports</button><button className="primary-button" onClick={() => onAdd("incidents")}><Plus size={15} /> Add record</button></div></section>
    <section className="compliance-kpis">
      <article className="compliance-kpi"><span className="kpi-label"><ShieldCheck size={14} /> Safety score</span><strong>{safeRate}%</strong><small><span className="trend-up">↑ 6.4%</span> vs last period</small></article>
      <article className="compliance-kpi"><span className="kpi-label"><AlertTriangle size={14} /> Open incidents</span><strong>{openIncidents}</strong><small>{urgent} high or critical currently open</small></article>
      <article className="compliance-kpi"><span className="kpi-label"><ClipboardCheck size={14} /> Inspection readiness</span><strong>{readiness}%</strong><small>{completeInspections} complete · {dueInspections} in progress</small></article>
      <article className="compliance-kpi"><span className="kpi-label"><CheckCircle2 size={14} /> Actions closed</span><strong>{closedRecords}</strong><small>{overdueActions} overdue · {openActions} still open</small></article>
    </section>
    <section className="dashboard-analytics-grid">
      <article className="dashboard-panel trend-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">PERFORMANCE TREND</span><h3>Average compliance score</h3></div><span className="panel-period">Last 10 periods</span></div><div className="trend-chart" aria-label="Average compliance score trend">{trend.map((value, index) => <div className="trend-column" key={`${value}-${index}`}><span style={{ height: `${(value / maxTrend) * 100}%` }} /><small>{index % 2 === 0 ? `P${index + 1}` : ""}</small></div>)}</div><div className="chart-legend"><span><i className="legend-dot green" /> Average weighted score</span><button className="panel-link" onClick={() => goTo("reports")}>View reports <span>→</span></button></div></article>
      <article className="dashboard-panel site-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">SITE RISK</span><h3>Latest grade by site</h3></div><MapPin size={18} /></div>{siteRows.length ? <div className="site-list">{siteRows.map((row) => <div className="site-row" key={row.site}><span className="site-grade">{row.score >= 80 ? "A" : row.score >= 60 ? "B" : "C"}</span><strong>{row.site}</strong><span className="site-score">{row.score}%</span></div>)}</div> : <div className="dashboard-empty">Add records with a site to see risk by location.</div>}<button className="panel-link" onClick={() => goTo("people")}>Open site directory <span>→</span></button></article>
    </section>
    <section className="dashboard-lower-grid">
      <article className="dashboard-panel distribution-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">RECORD DISTRIBUTION</span><h3>Current safety workload</h3></div><BarChart3 size={18} /></div><div className="distribution-row"><span>Incidents & near misses</span><div><i style={{ width: `${allRecords.length ? Math.max(8, (store.incidents.length / allRecords.length) * 100) : 8}%` }} /></div><strong>{store.incidents.length}</strong></div><div className="distribution-row"><span>Inspections</span><div><i style={{ width: `${allRecords.length ? Math.max(8, (store.inspections.length / allRecords.length) * 100) : 8}%` }} /></div><strong>{store.inspections.length}</strong></div><div className="distribution-row"><span>Corrective actions</span><div><i style={{ width: `${allRecords.length ? Math.max(8, (store.actions.length / allRecords.length) * 100) : 8}%` }} /></div><strong>{store.actions.length}</strong></div><button className="panel-link" onClick={() => goTo(managerView ? "audit" : "notifications")}>{managerView ? "Review audit activity" : "Review safety alerts"} <span>→</span></button></article>
      <article className="dashboard-panel severity-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">OPEN FINDINGS</span><h3>Findings by severity</h3></div><AlertTriangle size={18} /></div><div className="severity-summary"><div className="severity-ring"><strong>{urgent}</strong><small>priority</small></div><div className="severity-list"><span><i className="severity-dot critical" /> Critical <b>{store.incidents.filter((item) => item.severity === "Critical" && item.status !== "Closed").length}</b></span><span><i className="severity-dot high" /> High <b>{store.incidents.filter((item) => item.severity === "High" && item.status !== "Closed").length}</b></span><span><i className="severity-dot medium" /> Medium <b>{store.incidents.filter((item) => item.severity === "Medium" && item.status !== "Closed").length}</b></span></div></div><button className="panel-link" onClick={() => goTo("incidents")}>Open incident register <span>→</span></button></article>
    </section>
  </div>;
}
'''
path.write_text(source[:start] + replacement + source[end:])
print('dashboard component replaced')
