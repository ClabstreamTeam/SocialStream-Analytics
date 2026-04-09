window.SS = window.SS || {};
SS.$ = (sel, root = document) => root.querySelector(sel);
SS.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
SS.escapeHtml = (s = '') => s.replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
SS.fmtInt = n => Number(n || 0).toLocaleString('en-US');
