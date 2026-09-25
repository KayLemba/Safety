from pathlib import Path

path = Path('/home/ubuntu/safety-next/src/index.css')
css = path.read_text()
marker = '/* ---------- professional shell refinement ---------- */'
base = css.split(marker, 1)[0].rstrip() + '\n\n'
append = r'''/* ---------- safety beacon loading transition ---------- */
.loading-beacon { height: 96px; position: relative; width: 96px; z-index: 1; }
.loading-beacon::before, .loading-beacon::after { border: 1px solid rgba(46,196,182,.55); border-radius: 50%; content: ""; inset: 7px; position: absolute; }
.loading-beacon::after { animation: beacon-wave 2.2s ease-out infinite; border-color: rgba(255,159,28,.5); inset: -20px; }
.beacon-light { animation: beacon-flash 1.15s ease-in-out infinite; background: var(--amber); border-radius: 50%; box-shadow: 0 0 0 9px rgba(255,159,28,.12), 0 0 42px rgba(255,159,28,.7); height: 28px; left: 34px; position: absolute; top: 34px; width: 28px; }
.beacon-ring { animation: beacon-spin 3.8s linear infinite; border: 2px solid transparent; border-left-color: var(--mint); border-radius: 50%; border-top-color: var(--amber); inset: 18px; position: absolute; }
@keyframes beacon-flash { 0%, 100% { opacity: .55; transform: scale(.82); } 50% { opacity: 1; transform: scale(1.08); } }
@keyframes beacon-wave { 0% { opacity: .7; transform: scale(.55); } 80%, 100% { opacity: 0; transform: scale(1.1); } }
@keyframes beacon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .beacon-light, .beacon-ring, .loading-beacon::after { animation: none; } }

/* Collapse control remains directly below Notifications. */
.sidebar-collapse-row { border-top: 1px solid rgba(255,255,255,.09); margin: 18px 5px 0; padding-top: 14px; }
.sidebar-collapse-row .sidebar-toggle { align-items: center; display: flex; gap: 10px; justify-content: flex-start; margin: 0; padding: 0 10px; width: 100%; }
.sidebar-collapse-row .sidebar-toggle span { color: #9eabb3; font-size: 10px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; }
@media (min-width: 761px) {
  .sidebar.collapsed .sidebar-collapse-row { margin-left: 0; margin-right: 0; }
  .sidebar.collapsed .sidebar-collapse-row .sidebar-toggle { justify-content: center; padding: 0; }
  .sidebar.collapsed .sidebar-collapse-row .sidebar-toggle span { display: none; }
}
@media (max-width: 760px) { .sidebar-collapse-row { display: none; } }
'''
path.write_text(base + append)
print('restored prior styling baseline and preserved beacon/collapse styles')
