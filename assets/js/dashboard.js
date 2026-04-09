    /* ══════════════════════════════════
       CONFIG (backend API routing)
    ══════════════════════════════════ */
    const ACTOR_ID = 'clockworks~tiktok-scraper'; // ~ is valid in URLs per RFC3986
    const POLL_MS = 5000;
    const PROD_API_ORIGIN = 'https://socialstream-analytics.vercel.app';
    const IS_VERCEL_HOST = /(?:^|\.)vercel\.app$/i.test(window.location.hostname);
    const IS_LOCAL_HOST = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    let ACTIVE_API_ORIGIN = IS_LOCAL_HOST ? PROD_API_ORIGIN : '';

    function shouldRetryWithProdOrigin(res) {
      return (res.status === 404 || res.status === 405) && ACTIVE_API_ORIGIN !== PROD_API_ORIGIN;
    }

    async function apiFetch(path, options = {}) {
      let res = await fetch(`${ACTIVE_API_ORIGIN}${path}`, options);
      if (!res.ok && shouldRetryWithProdOrigin(res)) {
        ACTIVE_API_ORIGIN = PROD_API_ORIGIN;
        res = await fetch(`${ACTIVE_API_ORIGIN}${path}`, options);
      }
      return res;
    }

    async function startApifyRun(payload) {
      const res = await apiFetch('/api/apify/run.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.details || `HTTP ${res.status}`);
      }
      return res.json();
    }

    async function getApifyStatus(runId) {
      const res = await apiFetch(`/api/apify/status.js?runId=${encodeURIComponent(runId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.details || `HTTP ${res.status}`);
      }
      return res.json();
    }

    async function fetchDatasetItems(datasetId) {
      const res = await apiFetch(`/api/apify/dataset.js?datasetId=${encodeURIComponent(datasetId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.details || `HTTP ${res.status}`);
      }
      return res.json();
    }

    /* ══════════════════════════════════
       STATE
    ══════════════════════════════════ */
    let globalData = [];
    let usernames = [];
    let selectedDays = 7;
    let customFrom = null;
    let customTo = null;
    let chartInstances = {};
    let pollTimer = null;

    /* ══════════════════════════════════
       STEPS
    ══════════════════════════════════ */
    const STEPS = [
      { id: 's1', label: 'Start Apify Actor Run', detail: 'Sending request to TikTok scraper actor.' },
      { id: 's2', label: 'Scraping TikTok Profiles', detail: 'Polling run status every 5 seconds.' },
      { id: 's3', label: 'Download Dataset', detail: 'Fetching scraped posts as JSON.' },
      { id: 's4', label: 'Filter & Normalize Data', detail: 'Applying date range and normalizing fields.' },
      { id: 's5', label: 'Render Dashboard', detail: 'Building charts and AI insights.' },
    ];
    function renderSteps(activeId, doneIds = [], errorIds = []) {
      document.getElementById('stepsList').innerHTML = STEPS.map(s => {
        let cls = 'pending', icon = s.id.replace('s', '');
        if (doneIds.includes(s.id)) { cls = 'done'; icon = '<i class="fa-solid fa-check" style="font-size:10px;"></i>'; }
        if (activeId === s.id) { cls = 'active'; icon = '<i class="fa-solid fa-circle-notch spin" style="font-size:11px;"></i>'; }
        if (errorIds.includes(s.id)) { cls = 'error'; icon = '<i class="fa-solid fa-xmark" style="font-size:11px;"></i>'; }
        const color = cls === 'done' ? '#17b26a' : cls === 'active' ? '#2667ff' : cls === 'error' ? '#f04438' : '#475467';
        return `<div style="display:flex;align-items:flex-start;gap:14px;">
      <div class="step-dot ${cls}">${icon}</div>
      <div style="padding-top:3px;">
        <div style="font-size:13px;font-weight:600;color:${color};">${s.label}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">${s.detail}</div>
      </div>
    </div>`;
      }).join('');
    }
    function setProgress(pct, msg) {
      document.getElementById('progressBar').style.width = pct + '%';
      document.getElementById('progressPct').textContent = pct + '%';
      if (msg) document.getElementById('progressMsg').textContent = msg;
    }
    function setText(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
    function setHTML(id, value) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = value;
    }
    function setObjective(fillId, valueId, pct) {
      const safe = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
      const fill = document.getElementById(fillId);
      const value = document.getElementById(valueId);
      if (fill) fill.style.width = safe + '%';
      if (value) value.textContent = safe + '%';
    }
    function updateObjectiveMirrors() {
      ['Reach', 'Cadence', 'Paid'].forEach(name => {
        const mainVal = document.getElementById(`objective${name}Value`)?.textContent || '0%';
        const mainWidth = document.getElementById(`objective${name}Fill`)?.style.width || '0%';
        const mirrorFill = document.getElementById(`objective${name}FillMirror`);
        const mirrorValue = document.getElementById(`objective${name}ValueMirror`);
        if (mirrorFill) mirrorFill.style.width = mainWidth;
        if (mirrorValue) mirrorValue.textContent = mainVal;
      });
    }
    function resetWorkspaceChrome() {
      setText('workspaceProfileCount', '—');
      setText('workspacePostCount', '—');
      setText('workspaceDateRange', 'Ready to run');
      setText('workspaceMedianReach', '—');
      setText('masthead-kpi-posts', '–');
      setText('masthead-kpi-likes', '–');
      setText('masthead-kpi-plays', '–');
      setText('masthead-kpi-er', '–');
      setText('toolbarProfileScope', 'No scope selected');
      setText('toolbarDateScope', 'No range yet');
      setText('signalBestDay', '–');
      setText('signalBestHour', '–');
      setText('signalBoostMix', '0%');
      ['exp-topPosts', 'exp-engPerPost', 'exp-pie', 'exp-day', 'exp-hashtag', 'exp-hour', 'exp-timeline', 'exp-plays', 'exp-shares', 'exp-reposts']
        .forEach(id => setText(id, 'Run analysis or load demo data to populate this module.'));
      ['kpi-videos', 'kpi-likes', 'kpi-comments', 'kpi-saves', 'kpi-shares', 'kpi-reposts', 'kpi-ads'].forEach(id => setText(id, '–'));
      setObjective('objectiveReachFill', 'objectiveReachValue', 0);
      setObjective('objectiveCadenceFill', 'objectiveCadenceValue', 0);
      setObjective('objectiveEfficiencyFill', 'objectiveEfficiencyValue', 0);
      setObjective('objectivePaidFill', 'objectivePaidValue', 0);
      updateObjectiveMirrors();
    }
    resetWorkspaceChrome();

    /* ══════════════════════════════════
       TIMEFRAME SELECTOR
    ══════════════════════════════════ */
    function selectPreset(days) {
      selectedDays = days;
      customFrom = customTo = null;
      document.querySelectorAll('.tf-pill').forEach(p => p.classList.remove('active'));
      document.querySelector(`.tf-pill[data-days="${days}"]`)?.classList.add('active');
      document.getElementById('customDatesWrap').style.display = 'none';
    }
    function selectCustom() {
      selectedDays = -1;
      document.querySelectorAll('.tf-pill').forEach(p => p.classList.remove('active'));
      document.querySelector('.tf-pill[data-days="-1"]').classList.add('active');
      const wrap = document.getElementById('customDatesWrap');
      wrap.style.display = 'grid';
      // Set defaults
      const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
      document.getElementById('dateFrom').value = from.toISOString().split('T')[0];
      document.getElementById('dateTo').value = to.toISOString().split('T')[0];
    }
    function getDateFilter() {
      if (selectedDays === -1) {
        customFrom = document.getElementById('dateFrom').value ? new Date(document.getElementById('dateFrom').value) : null;
        customTo = document.getElementById('dateTo').value ? new Date(document.getElementById('dateTo').value) : null;
        if (customTo) customTo.setHours(23, 59, 59);
        return { from: customFrom, to: customTo };
      }
      if (selectedDays === 0) return { from: null, to: null };
      const to = new Date(); const from = new Date();
      from.setDate(from.getDate() - selectedDays);
      return { from, to };
    }

    /* ══════════════════════════════════
       USERNAME MANAGEMENT
    ══════════════════════════════════ */
    function addUsername() {
      const inp = document.getElementById('usernameInput');
      let val = inp.value.trim().replace(/^@/, '').replace(/,+$/, '').trim();
      if (!val || usernames.includes(val)) { inp.value = ''; return; }
      usernames.push(val); inp.value = ''; renderUsernames();
    }
    function removeUsername(u) { usernames = usernames.filter(x => x !== u); renderUsernames(); }
    function renderUsernames() {
      const c = document.getElementById('usernameTags');
      if (!usernames.length) {
        c.innerHTML = '<span class="field-note" id="noUsernamesHint">No usernames added yet.</span>';
        return;
      }
      c.innerHTML = usernames.map(u => `<span class="user-tag">@${u}<button onclick="removeUsername('${u.replace(/'/g, "\\'")}')">×</button></span>`).join('');
    }
    document.getElementById('usernameInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addUsername(); }
    });

    /* ══════════════════════════════════
       TOAST
    ══════════════════════════════════ */
    let toastT = null;
    function showToast(msg, type = '') {
      const t = document.getElementById('toast');
      const icon = type === 'error' ? '<i class="fa-solid fa-circle-exclamation" style="color:#f43f5e;margin-right:8px;"></i>'
        : type === 'success' ? '<i class="fa-solid fa-circle-check" style="color:#17b26a;margin-right:8px;"></i>'
          : '<i class="fa-solid fa-circle-info" style="color:#53b1fd;margin-right:8px;"></i>';
      t.innerHTML = icon + msg;
      t.className = `show ${type}`;
      clearTimeout(toastT);
      toastT = setTimeout(() => { t.className = ''; }, 4500);
    }

    /* ══════════════════════════════════
       BADGE
    ══════════════════════════════════ */
    function showBadge(type, msg) {
      const b = document.getElementById('statusBadge'), t = document.getElementById('statusText');
      if (!b || !t) return;
      b.style.display = 'inline-flex';
      t.textContent = msg;
      b.className = 'badge ' + (type === 'live' ? 'badge-live' : type === 'error' ? 'badge-error' : 'badge-running');
      b.querySelectorAll('.pulse-green, .pulse-orange').forEach(el => el.remove());
      const dot = document.createElement('span');
      dot.className = type === 'live' ? 'pulse-green' : 'pulse-orange';
      b.prepend(dot);
    }
    function showIdleBadge(msg = 'No active run') {
      const b = document.getElementById('statusBadge'), t = document.getElementById('statusText');
      if (!b || !t) return;
      b.style.display = 'inline-flex';
      t.textContent = msg;
      b.className = 'badge';
      const first = b.querySelector('span:first-child');
      if (first && (first.classList.contains('pulse-green') || first.classList.contains('pulse-orange'))) first.remove();
    }

    /* ══════════════════════════════════
       MAIN SCRAPE FLOW
    ══════════════════════════════════ */
    async function startScrape() {
      if (!usernames.length) { showToast('Add at least one TikTok username first.', 'error'); return; }
      const maxResults = parseInt(document.getElementById('maxResultsRange').value) || 50;

      document.getElementById('setupPanel').style.display = 'none';
      document.getElementById('progressPanel').style.display = 'block';
      document.getElementById('runBtn').disabled = true;
      renderSteps('s1');
      showBadge('running', 'Initializing…');
      setProgress(5, 'Starting Apify actor…');

      try {
        /* STEP 1 — Start run */
        const dateFilter = getDateFilter();
        const hasDateFilter = dateFilter && (dateFilter.from || dateFilter.to);

        // Auto-bump maxResults when a date filter is active:
        // fetch more posts so the client-side filter has enough to work with.
        let effectiveMax = maxResults;
        if (hasDateFilter && selectedDays > 0 && selectedDays !== -1) {
          // For preset windows scale up: 7d→50, 30d→150, 90d→300, etc.
          effectiveMax = Math.max(maxResults, Math.min(500, selectedDays * 2));
        } else if (selectedDays === -1) {
          // Custom range — always fetch at least 200 posts
          effectiveMax = Math.max(maxResults, 200);
        }

        const payload = buildInput(usernames, effectiveMax, dateFilter);
        console.log('[Clabstream] Starting actor with payload:', JSON.stringify(payload, null, 2));

        const runData = await startApifyRun(payload);

        const runId = runData.runId || runData.data?.id;
        if (!runId) throw new Error('No run ID returned from Apify. Actor may be misconfigured.');
        console.log('[Clabstream] Run ID:', runId);

        renderSteps('s2', ['s1']);
        setProgress(15, 'Scraping TikTok profiles…');
        showBadge('running', 'Scraping…');

        /* STEP 2 — Poll until finished */
        await pollUntilDone(runId);
        renderSteps('s3', ['s1', 's2']);
        setProgress(60, 'Downloading dataset…');
        showBadge('running', 'Downloading…');

        /* STEP 3 — Download dataset */
        const dsId = await getDatasetId(runId);
        if (!dsId) throw new Error('No dataset ID found. The run may not have produced output.');

        const items = await fetchDataset(dsId);
        if (!items.length) throw new Error('0 posts returned. Try a larger Max Results value or verify the usernames exist on TikTok.');

        renderSteps('s4', ['s1', 's2', 's3']);
        setProgress(80, 'Processing & analyzing data…');

        /* STEP 4 — Filter & normalize (dateFilter already computed above) */
        const normalized = normalizeData(items, usernames, dateFilter);
        if (!normalized.length) throw new Error(`0 posts matched the selected timeframe. Try selecting "All time" or a wider date range.`);

        renderSteps('s5', ['s1', 's2', 's3', 's4']);
        setProgress(95, 'Rendering dashboard…');
        await new Promise(r => setTimeout(r, 280));

        /* STEP 5 — Render */
        loadDashboard(normalized);
        renderSteps(null, ['s1', 's2', 's3', 's4', 's5']);
        setProgress(100, 'Done! Dashboard ready.');
        showBadge('live', `${normalized.length} posts`);
        showToast(`✓ ${normalized.length} posts loaded for @${usernames.join(', @')}.`, 'success');

        await new Promise(r => setTimeout(r, 700));
        document.getElementById('progressPanel').style.display = 'none';
        document.getElementById('dashboardPanel').style.display = 'block';
        document.getElementById('pdfBtn').style.display = 'inline-flex';
        document.getElementById('resetBtn').style.display = 'inline-flex';
        document.getElementById('headerSub').textContent = `${normalized.length} posts · @${usernames.join(', @')} · just scraped`;
        showToast('Analysis completed successfully!', 'success');

      } catch (err) {
        console.error('[Clabstream] Error:', err);

        // Friendly diagnosis for common errors
        let friendlyMsg = err.message;
        if (err.message.toLowerCase().includes('failed to fetch') ||
          err.message.toLowerCase().includes('networkerror') ||
          err.message.toLowerCase().includes('load failed')) {
          friendlyMsg = 'Network error — could not reach Apify. Check your internet connection or try disabling browser extensions/VPN.';
        } else if (err.message.includes('405') || err.message.toLowerCase().includes('method not allowed')) {
          friendlyMsg = 'API route rejected the request (HTTP 405). Ensure the app runs with Vercel serverless functions (use "vercel dev" locally and redeploy on Vercel).';
        } else if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
          friendlyMsg = 'Invalid API token. Please check your Apify account has an active subscription.';
        } else if (err.message.includes('402') || err.message.toLowerCase().includes('payment')) {
          friendlyMsg = 'Apify account has insufficient compute units. Top up at console.apify.com.';
        } else if (err.message.toLowerCase().includes('remaining usage') || err.message.toLowerCase().includes('exceed your remaining usage')) {
          friendlyMsg = 'Apify usage limit reached. Add billing/credits in console.apify.com, then run analysis again.';
        } else if (err.message.includes('429')) {
          friendlyMsg = 'Rate limited by Apify. Wait a minute and try again.';
        }

        setProgress(0, `Error: ${friendlyMsg}`);
  renderSteps(null, [], ['s1', 's2', 's3', 's4', 's5']);
        showBadge('error', 'Failed');
        showToast(friendlyMsg, 'error');
        document.getElementById('runBtn').disabled = false;
        setTimeout(() => {
          document.body.classList.add('is-pristine');
          document.getElementById('progressPanel').style.display = 'none';
          document.getElementById('setupPanel').style.display = 'block';
        }, 3500);
      }
    }

    /* ══════════════════════════════════
       BUILD ACTOR INPUT
       clockworks~tiktok-scraper schema
    ══════════════════════════════════ */
    function buildInput(usernames, maxResults, dateFilter) {
      const sort = document.getElementById('sortBy').value;
      // When a date filter is active, always use 'latest' sort so we don't
      // miss older posts; also pass oldestPostDate so the actor stops early.
      const hasDateFilter = dateFilter && (dateFilter.from || dateFilter.to);
      const effectiveSort = hasDateFilter ? 'latest' : (sort === 'popular' ? 'mostLiked' : 'latest');

      const payload = {
        profiles: usernames.map(u => `https://www.tiktok.com/@${u}`),
        resultsPerPage: Math.min(maxResults, 50),
        maxResults: maxResults,
        sortBy: effectiveSort,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
        profilesPerQuery: usernames.length,
      };

      // Pass date boundaries to the actor so it stops scraping at the right point
      // clockworks~tiktok-scraper accepts oldestPostDate / newestPostDate as ISO strings
      if (hasDateFilter) {
        if (dateFilter.from) {
          payload.oldestPostDate = dateFilter.from.toISOString().split('T')[0];
        }
        if (dateFilter.to) {
          payload.newestPostDate = dateFilter.to.toISOString().split('T')[0];
        }
      }

      return payload;
    }

    /* ══════════════════════════════════
       POLLING
    ══════════════════════════════════ */
    async function pollUntilDone(runId) {
      return new Promise((resolve, reject) => {
        const start = Date.now(); let dots = 0;
        async function check() {
          if (Date.now() - start > 12 * 60 * 1000) { reject(new Error('Scrape timed out after 12 minutes.')); return; }
          try {
            const d = await getApifyStatus(runId);
            const status = d.status || d.data?.status;
            dots = (dots + 1) % 4;
            const elapsed = Math.round((Date.now() - start) / 1000);
            document.getElementById('progressMsg').textContent = `Scraping TikTok${'.'.repeat(dots + 1)} (${elapsed}s elapsed)`;
            console.log('[Clabstream] Run status:', status);
            if (status === 'SUCCEEDED') { resolve(); return; }
            if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
              const detail = d.statusMessage ? ` Detail: ${d.statusMessage}` : '';
              reject(new Error(`Apify run ended with status: ${status}.${detail}`)); return;
            }
            pollTimer = setTimeout(check, POLL_MS);
          } catch (e) { reject(e); }
        }
        check();
      });
    }

    /* ══════════════════════════════════
       FETCH DATASET
    ══════════════════════════════════ */
    async function getDatasetId(runId) {
      const d = await getApifyStatus(runId);
      return d.defaultDatasetId || d.data?.defaultDatasetId;
    }
    async function fetchDataset(datasetId) {
      const d = await fetchDatasetItems(datasetId);
      // Apify can return an array directly or wrap it in { data: { items: [] } }
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.items)) return d.items;
      if (Array.isArray(d?.data?.items)) return d.data.items;
      return [];
    }

    /* ══════════════════════════════════
       NORMALIZE DATA
    ══════════════════════════════════ */
    function normalizeData(items, usernames, dateFilter) {
      const results = [];
      for (const item of items) {
        // Extract author
        const authorId = item.authorMeta?.name || item.author?.uniqueId || item.uniqueId || '';
        const authorNick = item.authorMeta?.nickName || item.author?.nickname || item.authorMeta?.name || '';

        // Match to a requested username
        let matchedUser = '';
        for (const u of usernames) {
          if (authorId.toLowerCase() === u.toLowerCase() ||
            authorNick.toLowerCase() === u.toLowerCase() ||
            (item.webVideoUrl || '').includes('/' + u + '/')) {
            matchedUser = u; break;
          }
        }
        if (!matchedUser) matchedUser = authorId || usernames[0] || 'Unknown';

        // Parse date
        let createDate = null;
        if (item.createTimeISO) createDate = new Date(item.createTimeISO);
        else if (item.createTime) createDate = new Date(Number(item.createTime) * 1000);

        // Apply date filter
        if (dateFilter.from && createDate && createDate < dateFilter.from) continue;
        if (dateFilter.to && createDate && createDate > dateFilter.to) continue;

        // Flatten hashtags
        const hashtagFields = {};
        (item.hashtags || []).forEach((h, i) => {
          // h can be a string or an object {name, id, ...} — always coerce to string
          const tagName = (typeof h === 'string' ? h : (h?.name || h?.title || '')).toString().trim();
          if (tagName) hashtagFields[`hashtags/${i}/name`] = tagName;
        });

        // Video description snippet (for tooltip/title)
        const desc = (item.desc || item.text || '').slice(0, 80);

        const isAd = !!(item.isAd || item.isPaid || item.sponsored || item.isSponsored || item.duetInfo?.isAd || false);
        // Cover image priority:
        // 1) originalCoverUrl 2) coverUrl 3) covers[0] 4) coverImage 5) thumbnailUrl
        // 6) videoMeta.cover 7) video.cover 8) musicMeta.coverLarge 9) cover
        const bestCoverUrl = resolveBestCoverUrl(item);
        const videoUrl = item.webVideoUrl || item.shareUrl || item.url ||
          (authorId ? `https://www.tiktok.com/@${authorId}` : '');
        results.push({
          profile: matchedUser,
          diggCount: Number(item.diggCount ?? item.stats?.diggCount ?? item.statsV2?.diggCount ?? 0),
          commentCount: Number(item.commentCount ?? item.stats?.commentCount ?? item.statsV2?.commentCount ?? 0),
          collectCount: Number(item.collectCount ?? item.stats?.collectCount ?? item.statsV2?.collectCount ?? 0),
          shareCount: Number(item.shareCount ?? item.stats?.shareCount ?? item.statsV2?.shareCount ?? 0),
          playCount: Number(item.playCount ?? item.stats?.playCount ?? item.statsV2?.playCount ?? 0),
          // Repost count — TikTok field names vary by scraper version
          repostCount: Number(item.repostCount ?? item.forwardCount ?? item.reshareCount ??
            item.stats?.repostCount ?? item.statsV2?.repostCount ?? 0),
          createTimeISO: createDate ? createDate.toISOString() : '',
          'authorMeta/name': authorId,
          'authorMeta/nickName': authorNick,
          isAd,
          bestCoverUrl,
          cover: item.cover || '',
          videoUrl,
          desc,
          ...hashtagFields,
        });
      }
      return results;
    }

    /* ══════════════════════════════════
       DASHBOARD ENGINE
    ══════════════════════════════════ */
    function loadDashboard(data) {
      document.body.classList.remove('is-pristine');
      globalData = data;
      populateFilter(data);
      const uniqueProfiles = [...new Set(data.map(r => r.profile).filter(Boolean))];
      setText('workspaceProfileCount', String(uniqueProfiles.length));
      setText('workspacePostCount', fmt(data.length));
      setText('toolbarProfileScope', `${uniqueProfiles.length} profile${uniqueProfiles.length === 1 ? '' : 's'}`);
      updateDashboard();
    }
    function populateFilter(data) {
      const select = document.getElementById('profileFilter');
      select.innerHTML = '<option value="all">All Profiles (Overview)</option>';
      [...new Set(data.map(r => r.profile).filter(Boolean))].sort()
        .forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = '@' + u; select.appendChild(o); });
    }
    function updateDashboard() {
      const sel = document.getElementById('profileFilter').value;
      document.getElementById('activeViewLabel').textContent = sel === 'all' ? 'All Profiles — Overview' : '@' + sel;
      const filtered = sel === 'all' ? globalData : globalData.filter(r => r.profile === sel);
      const uniq = [...new Set(globalData.map(r => r.profile).filter(Boolean))];
      const scopedProfiles = sel === 'all' ? uniq.length : (filtered.length ? 1 : 0);
      setText('toolbarProfileScope', `${scopedProfiles} profile${scopedProfiles === 1 ? '' : 's'}`);
      setText('workspacePostCount', fmt(filtered.length));
      if (sel === 'all' && uniq.length > 1) {
        document.getElementById('profileComparisonContainer').style.display = 'block';
        renderProfileComparison(globalData);
      } else {
        document.getElementById('profileComparisonContainer').style.display = 'none';
      }
      processData(filtered);
      generateInsights(filtered);
      renderDataTable(filtered);
    }

    /* ══════════════════════════════════
       HELPERS
    ══════════════════════════════════ */
    function parseDate(v) {
      if (!v) return null; if (!isNaN(v)) { const n = Number(v); return new Date(n.toString().length === 10 ? n * 1000 : n); }
      const d = new Date(v); return isNaN(d) ? null : d;
    }
    function resolveBestCoverUrl(item) {
      return item.originalCoverUrl
        || item.coverUrl
        || item.covers?.[0]
        || item.coverImage
        || item.thumbnailUrl
        || item.videoMeta?.cover
        || item.video?.cover
        || item.musicMeta?.coverLarge
        || item.cover
        || '';
    }
    function fmt(n) {
      if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return Math.round(n).toLocaleString();
    }
    function percentile(arr, p) {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = lo + 1;
      return hi >= s.length ? s[lo] : s[lo] * (1 - (i % 1)) + s[hi] * (i % 1);
    }
    function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

    const CHART_OPTS = {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          padding: 12,
          cornerRadius: 10,
          displayColors: false
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#edf2f7' }, border: { display: false }, ticks: { color: '#667085', font: { size: 11 } } },
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#667085', font: { size: 11 }, maxRotation: 30 } }
      }
    };
    const PALETTE = [
      'rgba(38,103,255,.86)', 'rgba(83,177,253,.9)', 'rgba(23,178,106,.82)', 'rgba(142,115,255,.82)',
      'rgba(52,211,153,.82)', 'rgba(245,181,70,.85)', 'rgba(17,138,178,.82)', 'rgba(246,97,81,.8)',
      'rgba(120,131,255,.8)', 'rgba(95,205,228,.78)'
    ];

    /* ══════════════════════════════════
       INSIGHTS
    ══════════════════════════════════ */
    function generateInsights(data) {
      if (!data.length) return;
      document.getElementById('insight-total-posts').textContent = data.length;

      const dates = data.map(r => parseDate(r.createTimeISO)).filter(Boolean);
      let dateStart = '–', dateEnd = '–', spanDays = 0;
      if (dates.length) {
        const minD = new Date(Math.min(...dates)), maxD = new Date(Math.max(...dates));
        dateStart = minD.toISOString().split('T')[0];
        dateEnd = maxD.toISOString().split('T')[0];
        spanDays = Math.max(1, Math.round((maxD - minD) / (864e5)));
      }
      document.getElementById('insight-date-start').textContent = dateStart;
      document.getElementById('insight-date-end').textContent = dateEnd;
      setText('workspaceDateRange', dateStart !== '–' && dateEnd !== '–' ? `${dateStart} → ${dateEnd}` : '–');
      setText('toolbarDateScope', dateStart !== '–' && dateEnd !== '–' ? `${dateStart} → ${dateEnd}` : 'No range yet');
      const ppd = (data.length / spanDays).toFixed(1);
      document.getElementById('exec-posts-per-day').textContent = ppd;

      // Hourly & play analysis
      const hourly = {}, allPlays = [], allLikes = [], allEngs = [];
      data.forEach(row => {
        const plays = Number(row.playCount || 0), likes = Number(row.diggCount || 0),
          comments = Number(row.commentCount || 0), saves = Number(row.collectCount || 0), shares = Number(row.shareCount || 0);
        allPlays.push(plays); allLikes.push(likes);
        allEngs.push(likes + comments + saves + shares);
        const d = parseDate(row.createTimeISO);
        const h = d ? d.getHours().toString().padStart(2, '0') : '00';
        if (!hourly[h]) hourly[h] = { plays: [], eng: [] };
        hourly[h].plays.push(plays);
        hourly[h].eng.push(plays > 0 ? (likes + comments + saves + shares) / (plays / 1000) : 0);
      });
      const medPlays = percentile(allPlays, .5), p90Plays = percentile(allPlays, .9);
      document.getElementById('insight-median-plays').textContent = fmt(medPlays);
      document.getElementById('insight-p90-plays').textContent = fmt(p90Plays);
      setText('workspaceMedianReach', fmt(medPlays));

      let bestH = '–', bestMed = 0; const engH = [];
      for (const h in hourly) {
        const med = percentile(hourly[h].plays, .5);
        if (med >= bestMed) { bestMed = med; bestH = h; }
        engH.push({ h, rate: percentile(hourly[h].eng, .5) });
      }
      engH.sort((a, b) => b.rate - a.rate);
      document.getElementById('insight-reach-hour').textContent = bestH;
      document.getElementById('insight-reach-val').textContent = fmt(bestMed);
      const eH = engH[0]?.h || '–';
      document.getElementById('insight-eng-val1').textContent = eH;
      document.getElementById('insight-eng-rate1').textContent = (engH[0]?.rate || 0).toFixed(2);

      // Boosted vs organic
      const adPosts = data.filter(r => r.isAd), organicPosts = data.filter(r => !r.isAd);
      const adCount = adPosts.length, organicCount = organicPosts.length;
      const adRate = data.length > 0 ? ((adCount / data.length) * 100).toFixed(1) : 0;
      const adAvgLikes = adCount > 0 ? adPosts.reduce((s, r) => s + Number(r.diggCount || 0), 0) / adCount : 0;
      const orgAvgLikes = organicCount > 0 ? organicPosts.reduce((s, r) => s + Number(r.diggCount || 0), 0) / organicCount : 0;
      document.getElementById('exec-ad-rate').textContent = adRate;
      document.getElementById('exec-ad-count').textContent = adCount;
      document.getElementById('exec-organic-count').textContent = organicCount;
      document.getElementById('kpi-ads').textContent = adCount;
      document.getElementById('exec-ad-avg-likes').textContent = adCount ? fmt(adAvgLikes) : 'N/A';
      document.getElementById('exec-organic-avg-likes').textContent = organicCount ? fmt(orgAvgLikes) : 'N/A';

      // Derive best weekday
      const dayTotals = { 'Sun': 0, 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0 };
      const DA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      data.forEach(r => { const d = parseDate(r.createTimeISO); if (d) dayTotals[DA[d.getDay()]] += Number(r.diggCount || 0); });
      const topDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '–';
      setText('signalBestDay', topDay);
      setText('signalBestHour', eH === '–' ? '–' : `${eH}:00`);
      setText('signalBoostMix', `${adRate}%`);

      const reachScore = p90Plays > 0 ? Math.min(100, (medPlays / p90Plays) * 100) : 0;
      const cadenceScore = Math.min(100, (Number(ppd) / 3) * 100);
      const efficiencyScore = Math.min(100, (Number(engH[0]?.rate || 0) / 12) * 100);
      const paidRatio = adCount === 0 ? 0 : (adAvgLikes / Math.max(orgAvgLikes || adAvgLikes || 1, 1)) * 100;
      const paidScore = Math.min(100, paidRatio);
      setObjective('objectiveReachFill', 'objectiveReachValue', reachScore);
      setObjective('objectiveCadenceFill', 'objectiveCadenceValue', cadenceScore);
      setObjective('objectiveEfficiencyFill', 'objectiveEfficiencyValue', efficiencyScore);
      setObjective('objectivePaidFill', 'objectivePaidValue', paidScore);
      updateObjectiveMirrors();

      // Narrative paragraph
      const profileSet = [...new Set(data.map(r => r.profile).filter(Boolean))];
      const profileStr = profileSet.length > 1 ? `${profileSet.length} profiles` : '@' + profileSet[0];
      const viralRatio = allPlays.length > 0 ? ((allPlays.filter(p => p > p90Plays).length / allPlays.length) * 100).toFixed(1) : 0;
      const boostNote = adCount > 0
        ? ` Of these, <strong>${adCount} posts (${adRate}%)</strong> were paid/boosted (isAd), averaging <strong>${fmt(adAvgLikes)}</strong> likes vs <strong>${fmt(orgAvgLikes)}</strong> for organic. ${adAvgLikes > orgAvgLikes ? 'Boosted content is outperforming organic, suggesting spend is well-directed.' : 'Organic content is outperforming paid, consider reviewing targeting or creative on boosted posts.'}`
        : ' No boosted posts were detected in this dataset.';
      document.getElementById('exec-narrative').innerHTML =
        `Across <strong>${data.length} posts</strong> from <strong>${profileStr}</strong> between <strong>${dateStart}</strong> and <strong>${dateEnd}</strong> (${spanDays} days), the data shows an average posting cadence of <strong>${ppd} posts/day</strong>. ` +
        `The typical post earns <strong>~${fmt(medPlays)} plays</strong>, while top-performing content (P90) exceeds <strong>${fmt(p90Plays)} plays</strong> — a <strong>${p90Plays > 0 ? (p90Plays / Math.max(medPlays, 1)).toFixed(1) + '×' : '–'}</strong> spread indicating high variance and occasional viral breakouts.${boostNote} ` +
        `Engagement peaks on <strong>${topDay}s</strong>, and the highest reach window is at <strong>${bestH}:00</strong>. ` +
        `The optimal efficiency slot (most interactions per 1k plays) is <strong>${eH}:00</strong>.`;

      // Strategic recommendations
      const recs = [];
      recs.push(`Schedule posts on <strong>${topDay}</strong> during the <strong>${bestH}:00</strong> window to maximize raw reach.`);
      recs.push(`For highest engagement efficiency, target the <strong>${eH}:00</strong> slot — ${(engH[0]?.rate || 0).toFixed(2)} interactions per 1,000 plays.`);
      if (adCount > 0 && adAvgLikes < orgAvgLikes) recs.push('Boosted posts are underperforming organic — audit creative or audience targeting on paid campaigns.');
      if (adCount > 0 && adAvgLikes > orgAvgLikes) recs.push('Paid amplification is effective. Consider increasing budget on top organic posts to amplify their reach.');
      if (adCount === 0) recs.push('No boosted content detected. Test paid promotion on top organic posts to extend reach.');
      recs.push(`P90 plays (${fmt(p90Plays)}) are <strong>${p90Plays > 0 ? (p90Plays / Math.max(medPlays, 1)).toFixed(1) + '×' : '–'}</strong> the median — study viral outliers for content patterns and try to replicate.`);
      document.getElementById('exec-recs').innerHTML = recs.map(r => `<li>${r}</li>`).join('');
    }

    /* ══════════════════════════════════
       PROCESS DATA
    ══════════════════════════════════ */
    function processData(data) {
      let likes = 0, comments = 0, saves = 0, shares = 0, reposts = 0;
      const timeSt = {}, hashSt = {}, daysSt = {}, engPP = {}, hourSt = {}, playsSt = {}, sharesSt = {}, repostsSt = {};
      const DA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      DA.forEach(d => { daysSt[d] = 0; });
      const topPosts = [];
      data.forEach(row => {
        const l = Number(row.diggCount || 0), c = Number(row.commentCount || 0),
          s = Number(row.collectCount || 0), p = Number(row.playCount || 0),
          sh = Number(row.shareCount || 0), rp = Number(row.repostCount || 0);
        likes += l; comments += c; saves += s; shares += sh; reposts += rp;
        topPosts.push({
          desc: row.desc || '(no description)',
          likes: l,
          plays: p,
          isAd: row.isAd,
          bestCoverUrl: row.bestCoverUrl || '',
          cover: row.cover || '',
          videoUrl: row.videoUrl || '',
          profile: row.profile,
          commentCount: c,
          collectCount: s,
          shareCount: sh,
          repostCount: rp,
          createTimeISO: row.createTimeISO
        });
        const d = parseDate(row.createTimeISO);
        if (d) {
          const ds = d.toISOString().split('T')[0];
          timeSt[ds] = (timeSt[ds] || 0) + l;
          playsSt[ds] = (playsSt[ds] || 0) + p;
          sharesSt[ds] = (sharesSt[ds] || 0) + sh;
          repostsSt[ds] = (repostsSt[ds] || 0) + rp;
          if (!engPP[ds]) engPP[ds] = { likes: 0, count: 0 };
          engPP[ds].likes += l; engPP[ds].count += 1;
          daysSt[DA[d.getDay()]] += l;
          const h = d.getHours().toString().padStart(2, '0');
          hourSt[h] = (hourSt[h] || 0) + 1;
        }
        for (const k in row) {
          // Guard: only process string hashtag values (objects would throw on .toLowerCase)
          if (k.startsWith('hashtags/') && k.endsWith('/name') && row[k] && typeof row[k] === 'string')
            hashSt[row[k].toLowerCase()] = (hashSt[row[k].toLowerCase()] || 0) + 1;
        }
      });
      document.getElementById('kpi-videos').textContent = fmt(data.length);
      document.getElementById('kpi-likes').textContent = fmt(likes);
      document.getElementById('kpi-comments').textContent = fmt(comments);
      document.getElementById('kpi-saves').textContent = fmt(saves);
      document.getElementById('kpi-shares').textContent = fmt(shares);
      document.getElementById('kpi-reposts').textContent = fmt(reposts);
      const totalPlays = data.reduce((sum, row) => sum + Number(row.playCount || 0), 0);
            // masthead quick stats
            setText('masthead-kpi-posts', fmt(data.length));
            setText('masthead-kpi-likes', fmt(likes));
        setText('masthead-kpi-plays', fmt(totalPlays));
            const avgEr = data.length > 0 ? (data.reduce((s, r) => {
              const p = Number(r.playCount || 0), l = Number(r.diggCount || 0) + Number(r.commentCount || 0) + Number(r.collectCount || 0) + Number(r.shareCount || 0);
              return s + (p > 0 ? (l / p) * 100 : 0);
            }, 0) / data.length).toFixed(2) : 0;
            setText('masthead-kpi-er', avgEr + '%');
      renderTopPosts(topPosts);
      renderPie(likes, comments, saves, shares);
      renderTimeline(timeSt);
      renderPlaysTimeline(playsSt);
      renderSharesTimeline(sharesSt);
      renderRepostsTimeline(repostsSt);
      renderHashtags(hashSt);
      renderDays(daysSt);
      renderEngPP(engPP);
      renderHours(hourSt);
      renderHighlightsLowlights(topPosts);
    }

    /* ══════════════════════════════════
       CHART RENDERERS
    ══════════════════════════════════ */
    function renderProfileComparison(data) {
      destroyChart('profileComparisonChart');
      const totals = {};
      data.forEach(r => { totals[r.profile] = (totals[r.profile] || 0) + Number(r.diggCount || 0); });
      const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      const ctx = document.getElementById('profileComparisonChart').getContext('2d');
      chartInstances['profileComparisonChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: sorted.map(e => '@' + e[0]),
          datasets: [{ label: 'Total Likes', data: sorted.map(e => e[1]), backgroundColor: sorted.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 8 }]
        }, options: { ...CHART_OPTS }
      });
    }

    function renderTopPosts(posts) {
      destroyChart('topPostsChart');
      const top = posts.sort((a, b) => b.likes - a.likes).slice(0, 8);
      document.getElementById('exp-topPosts').innerHTML = top.length
        ? `Top post: <strong>${top[0].desc.slice(0, 40) || '(no desc)'}</strong> — <strong>${fmt(top[0].likes)}</strong> likes. Use this as a content blueprint.`
        : 'No posts found.';
      const ctx = document.getElementById('topPostsChart').getContext('2d');
      chartInstances['topPostsChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: top.map((_, i) => `#${i + 1}`),
          datasets: [{ label: 'Likes', data: top.map(p => p.likes), backgroundColor: top.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 7 }]
        }, options: { ...CHART_OPTS, plugins: { ...CHART_OPTS.plugins, tooltip: { callbacks: { title: (items) => 'Post ' + items[0].label, label: (item) => { const p = top[item.dataIndex]; return [`Likes: ${fmt(p.likes)}`, `Plays: ${fmt(p.plays)}`, p.desc.slice(0, 50)]; } } } } }
      });
    }

    function renderPie(l, c, s, sh) {
      destroyChart('engagementPieChart');
      const total = l + c + s + (sh || 0), pct = total > 0 ? ((l / total) * 100).toFixed(1) : 0;
      document.getElementById('exp-pie').innerHTML = total > 0
        ? `Likes account for <strong>${pct}%</strong> of all interactions.${Number(s) > 0 ? ' Saves indicate strong intent-driven content.' : ''}${Number(sh) > 0 ? ' <strong>' + fmt(sh) + ' shares</strong> show active distribution behaviour.' : ''}`
        : 'No engagement data.';
      const ctx = document.getElementById('engagementPieChart').getContext('2d');
      chartInstances['engagementPieChart'] = new Chart(ctx, {
        type: 'doughnut', data: {
          labels: ['Likes', 'Comments', 'Saves', 'Shares'],
          datasets: [{ data: [l, c, s, sh || 0], backgroundColor: ['rgba(249,115,22,.85)', 'rgba(124,58,237,.85)', 'rgba(34,211,238,.8)', 'rgba(251,191,36,.8)'], borderWidth: 0, hoverOffset: 8 }]
        }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#667085', padding: 12, font: { size: 11 } } } }, cutout: '62%' }
      });
    }

    function renderTimeline(timeSt) {
      destroyChart('timelineChart');
      const sorted = Object.keys(timeSt).sort(), data = sorted.map(d => timeSt[d]);
      const maxVal = Math.max(...data), maxDate = sorted[data.indexOf(maxVal)];
      document.getElementById('exp-timeline').innerHTML = sorted.length
        ? `Peak day: <strong>${maxDate}</strong> with <strong>${fmt(maxVal)}</strong> likes. Study that day's content for viral signals.`
        : 'No timeline data.';
      const ctx = document.getElementById('timelineChart').getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 290);
      g.addColorStop(0, 'rgba(249,115,22,.22)'); g.addColorStop(1, 'rgba(249,115,22,.01)');
      chartInstances['timelineChart'] = new Chart(ctx, {
        type: 'line', data: {
          labels: sorted,
          datasets: [{ label: 'Total Likes', data, fill: true, backgroundColor: g, borderColor: 'rgba(249,115,22,.9)', borderWidth: 2, tension: .4, pointRadius: 0, pointHoverRadius: 5 }]
        }, options: { ...CHART_OPTS }
      });
    }

    function renderPlaysTimeline(playsSt) {
      destroyChart('playsTimelineChart');
      const sorted = Object.keys(playsSt).sort(), data = sorted.map(d => playsSt[d]);
      const maxVal = Math.max(...data, 0), maxDate = sorted[data.indexOf(maxVal)];
      document.getElementById('exp-plays').innerHTML = sorted.length
        ? `Highest play day: <strong>${maxDate}</strong> with <strong>${fmt(maxVal)}</strong> total plays.`
        : 'No play data.';
      const ctx = document.getElementById('playsTimelineChart').getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 250);
      g.addColorStop(0, 'rgba(124,58,237,.22)'); g.addColorStop(1, 'rgba(124,58,237,.01)');
      chartInstances['playsTimelineChart'] = new Chart(ctx, {
        type: 'line', data: {
          labels: sorted,
          datasets: [{ label: 'Total Plays', data, fill: true, backgroundColor: g, borderColor: 'rgba(124,58,237,.9)', borderWidth: 2, tension: .4, pointRadius: 0, pointHoverRadius: 5 }]
        }, options: { ...CHART_OPTS }
      });
    }

    function renderSharesTimeline(sharesSt) {
      destroyChart('sharesTimelineChart');
      const sorted = Object.keys(sharesSt).sort(), data = sorted.map(d => sharesSt[d]);
      const maxVal = Math.max(...data, 0), maxDate = sorted[data.indexOf(maxVal)];
      const hasData = sorted.length > 0 && maxVal > 0;
      document.getElementById('exp-shares').innerHTML = hasData
        ? `Peak share day: <strong>${maxDate}</strong> with <strong>${fmt(maxVal)}</strong> shares — high distribution activity indicates content that resonates beyond the follower base.`
        : 'No share data available in this dataset. Shares may not be returned by the scraper for this account.';
      const ctx = document.getElementById('sharesTimelineChart').getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 250);
      g.addColorStop(0, 'rgba(34,211,238,.22)'); g.addColorStop(1, 'rgba(34,211,238,.01)');
      chartInstances['sharesTimelineChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: sorted.length ? sorted : ['No data'],
          datasets: [{ label: 'Shares', data: sorted.length ? data : [0], backgroundColor: 'rgba(34,211,238,.65)', borderRadius: 5 }]
        }, options: { ...CHART_OPTS }
      });
    }

    function renderRepostsTimeline(repostsSt) {
      destroyChart('repostsTimelineChart');
      const sorted = Object.keys(repostsSt).sort(), data = sorted.map(d => repostsSt[d]);
      const maxVal = Math.max(...data, 0), maxDate = sorted[data.indexOf(maxVal)];
      const hasData = sorted.length > 0 && maxVal > 0;
      document.getElementById('exp-reposts').innerHTML = hasData
        ? `Most reposts on <strong>${maxDate}</strong> with <strong>${fmt(maxVal)}</strong> reposts — a strong virality signal worth studying.`
        : 'No repost data available. TikTok\'s API may not expose repost counts for this account or region.';
      const ctx = document.getElementById('repostsTimelineChart').getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 250);
      g.addColorStop(0, 'rgba(251,191,36,.22)'); g.addColorStop(1, 'rgba(251,191,36,.01)');
      chartInstances['repostsTimelineChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: sorted.length ? sorted : ['No data'],
          datasets: [{ label: 'Reposts', data: sorted.length ? data : [0], backgroundColor: 'rgba(251,191,36,.65)', borderRadius: 5 }]
        }, options: { ...CHART_OPTS }
      });
    }

    function renderHashtags(hashSt) {
      destroyChart('hashtagChart');
      const sorted = Object.entries(hashSt).sort((a, b) => b[1] - a[1]).slice(0, 10);
      document.getElementById('exp-hashtag').innerHTML = sorted.length
        ? `<strong>#${sorted[0][0]}</strong> leads with ${fmt(sorted[0][1])} uses. Align content with top hashtags to maximise organic reach.`
        : 'No hashtag data found in this dataset.';
      const ctx = document.getElementById('hashtagChart').getContext('2d');
      chartInstances['hashtagChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: sorted.map(e => '#' + e[0]),
          datasets: [{ label: 'Uses', data: sorted.map(e => e[1]), backgroundColor: 'rgba(124,58,237,.8)', borderRadius: 6 }]
        }, options: { ...CHART_OPTS, indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { color: '#edf2f7' }, border: { display: false }, ticks: { color: '#667085', font: { size: 11 } } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: '#667085', font: { size: 11 } } } } }
      });
    }

    function renderDays(daysSt) {
      destroyChart('dayOfWeekChart');
      const DA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const data = DA.map(d => daysSt[d] || 0);
      const max = Math.max(...data), topDay = DA[data.indexOf(max)];
      document.getElementById('exp-day').innerHTML = max > 0
        ? `<strong>${topDay}</strong> posts get the most engagement. Consider scheduling key drops on this day.`
        : 'No day-of-week data found.';
      const ctx = document.getElementById('dayOfWeekChart').getContext('2d');
      chartInstances['dayOfWeekChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: DA,
          datasets: [{ label: 'Total Likes', data, backgroundColor: data.map(v => v === max ? 'rgba(249,115,22,.9)' : 'rgba(124,58,237,.55)'), borderRadius: 6 }]
        }, options: { ...CHART_OPTS }
      });
    }

    function renderEngPP(engPP) {
      destroyChart('engPerPostChart');
      const sorted = Object.keys(engPP).sort(), data = sorted.map(d => engPP[d].count > 0 ? engPP[d].likes / engPP[d].count : 0);
      const max = Math.max(...data), bestDate = sorted[data.indexOf(max)];
      document.getElementById('exp-engPerPost').innerHTML = max > 0
        ? `Best efficiency day: <strong>${bestDate}</strong> — avg <strong>${fmt(max)}</strong> likes/post. Replicate that day's content strategy.`
        : 'Not enough data for efficiency timeline.';
      const ctx = document.getElementById('engPerPostChart').getContext('2d');
      chartInstances['engPerPostChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: sorted,
          datasets: [{ label: 'Avg Likes/Post', data, backgroundColor: 'rgba(251,191,36,.75)', borderRadius: 5 }]
        }, options: { ...CHART_OPTS }
      });
    }

    /* ══════════════════════════════════
       HIGHLIGHTS & LOWLIGHTS
    ══════════════════════════════════ */
    function renderHighlightsLowlights(posts) {
      const sorted = [...posts].sort((a, b) => b.likes - a.likes);
      const highlights = sorted.slice(0, 3);
      // Lowlights: posts with at least 100 plays, sorted by likes ascending, skip any already in highlights
      const hSet = new Set(highlights.map(p => p.desc + p.likes));
      const lowlights = [...posts]
        .filter(p => p.plays >= 100 && !hSet.has(p.desc + p.likes))
        .sort((a, b) => a.likes - b.likes)
        .slice(0, 3);

      const medLikes = highlights.length ? highlights[Math.floor(highlights.length / 2)].likes : 1;
      const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
      const avgLikes = posts.length ? totalLikes / posts.length : 0;

      function whyHighlight(p, rank) {
        const ratio = avgLikes > 0 ? (p.likes / avgLikes).toFixed(1) : 0;
        const engRate = p.plays > 0 ? ((p.likes + p.commentCount + p.collectCount + p.shareCount) / p.plays * 100).toFixed(2) : 0;
        const parts = [];
        if (ratio > 2) parts.push(`Earned <strong>${ratio}× the avg likes</strong> across all posts.`);
        else parts.push(`<strong>${fmt(p.likes)} likes</strong> puts this in the top tier.`);
        if (engRate > 0) parts.push(`Engagement rate of <strong>${engRate}%</strong> vs plays.`);
        if (p.isAd) parts.push('Paid amplification helped broaden reach.');
        if (p.shareCount > 0) parts.push(`<strong>${fmt(p.shareCount)} shares</strong> indicate strong virality potential.`);
        if (p.collectCount > 0) parts.push(`<strong>${fmt(p.collectCount)} saves</strong> — high intent signal.`);
        return parts.slice(0, 2).join(' ');
      }
      function whyLowlight(p) {
        const ratio = avgLikes > 0 ? (p.likes / avgLikes).toFixed(2) : 0;
        const engRate = p.plays > 0 ? ((p.likes + p.commentCount + p.collectCount + p.shareCount) / p.plays * 100).toFixed(2) : 0;
        const parts = [];
        if (ratio < 0.5) parts.push(`Only <strong>${ratio}× the avg likes</strong> — significantly below par.`);
        else parts.push(`<strong>${fmt(p.likes)} likes</strong> against ${fmt(p.plays)} plays is low conversion.`);
        if (engRate < 1) parts.push(`Engagement rate of <strong>${engRate}%</strong> — consider reviewing hook or format.`);
        if (!p.isAd) parts.push('No paid boost; organic reach was limited.');
        if (p.commentCount < 2) parts.push('Minimal comment activity suggests low resonance with audience.');
        return parts.slice(0, 2).join(' ');
      }

      function buildCard(p, rank, type) {
        const isHL = type === 'highlight';
        const rankBg = isHL ? 'rgba(23,178,106,0.92)' : 'rgba(240,68,56,0.92)';
        const rankLabel = isHL ? `#${rank} Highlight` : `#${rank} Lowlight`;
        const reason = isHL ? whyHighlight(p, rank) : whyLowlight(p);
        const dObj = p.createTimeISO ? new Date(p.createTimeISO) : null;
        const dateStr = dObj ? dObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const cardCover = p.bestCoverUrl || '';
        const thumbHtml = cardCover
          ? `<img src="${cardCover}" class="cover-thumb" alt="cover" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
         <div class="cover-thumb-placeholder" style="display:none;"><i class="fa-brands fa-tiktok"></i><span style="font-size:12px;">No preview</span></div>`
          : `<div class="cover-thumb-placeholder"><i class="fa-brands fa-tiktok"></i><span style="font-size:12px;">No cover</span></div>`;
        const linkHtml = p.videoUrl
          ? `<a href="${p.videoUrl}" target="_blank" rel="noopener" class="post-link"><i class="fa-brands fa-tiktok"></i> View Post</a>`
          : '';
        return `<div class="cover-card ${type}">
      <div class="cover-stack">
        ${thumbHtml}
        <div class="cover-rank-badge" style="background:${rankBg};color:white;">${rankLabel}</div>
        ${p.isAd ? '<div class="cover-ad-badge">🚀 Ad</div>' : ''}
      </div>
      <div class="cover-body">
        <div class="cover-meta">${dateStr ? `<i class="fa-regular fa-calendar" style="margin-right:4px;"></i>${dateStr} · ` : ''}@${p.profile}</div>
        <div class="cover-desc">${p.desc || '(no description)'}</div>
        <div class="cover-stats">
          <span><i class="fa-solid fa-heart" style="margin-right:3px;color:#e11d48;"></i>${fmt(p.likes)}</span>
          <span><i class="fa-solid fa-play" style="margin-right:3px;color:#2667ff;"></i>${fmt(p.plays)}</span>
          <span><i class="fa-solid fa-comment" style="margin-right:3px;color:#17b26a;"></i>${fmt(p.commentCount)}</span>
        </div>
        <div class="cover-why ${isHL ? 'cover-why--good' : 'cover-why--risk'}">
          <strong style="display:block;margin-bottom:4px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${isHL ? '#067647' : '#b42318'};">${isHL ? 'Why it works' : 'Why it underperformed'}</strong>
          ${reason}
        </div>
        ${linkHtml}
      </div>
    </div>`;
      }

      document.getElementById('highlightCards').innerHTML =
        highlights.length ? highlights.map((p, i) => buildCard(p, i + 1, 'highlight')).join('')
          : '<p style="color:#667085;font-size:13px;">No data available.</p>';
      document.getElementById('lowlightCards').innerHTML =
        lowlights.length ? lowlights.map((p, i) => buildCard(p, i + 1, 'lowlight')).join('')
          : '<p style="color:#667085;font-size:13px;">Not enough posts with play data to determine lowlights.</p>';
    }

    function renderHours(hourSt) {
      destroyChart('hourChart');
      const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
      const data = hours.map(h => hourSt[h] || 0);
      const max = Math.max(...data), peakH = hours[data.indexOf(max)];
      document.getElementById('exp-hour').innerHTML = max > 0
        ? `Most posts are published at <strong>${peakH}:00</strong>. This is the preferred posting window — correlate with engagement data for optimal timing.`
        : 'No hourly data found.';
      const ctx = document.getElementById('hourChart').getContext('2d');
      chartInstances['hourChart'] = new Chart(ctx, {
        type: 'bar', data: {
          labels: hours.map(h => h + ':00'),
          datasets: [{ label: 'Posts', data, backgroundColor: data.map(v => v === max ? 'rgba(249,115,22,.9)' : 'rgba(249,115,22,.3)'), borderRadius: 5 }]
        }, options: { ...CHART_OPTS, scales: { y: { beginAtZero: true, grid: { color: '#edf2f7' }, border: { display: false }, ticks: { color: '#667085', font: { size: 11 } } }, x: { grid: { display: false }, border: { display: false }, ticks: { color: '#667085', font: { size: 10 }, maxRotation: 45 } } } }
      });
    }

    function renderDataTable(data) {
      const tbody = document.getElementById('dataTableBody');
      if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:20px; color:#667085;">No posts available.</td></tr>';
        return;
      }

      const rows = data.map(r => {
        const dObj = parseDate(r.createTimeISO);
        const dateStr = dObj ? dObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
        const desc = (r.desc || '').replace(/\n/g, ' ');
        const shortDesc = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;
        const linkStr = r.videoUrl ? `<a href="${r.videoUrl}" target="_blank" class="table-link"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : '-';
        const typeBadge = r.isAd
          ? `<span class="table-type table-type--paid">Boosted</span>`
          : `<span class="table-type table-type--organic">Organic</span>`;

        const plays = Number(r.playCount || 0);
        const lcs = Number(r.diggCount || 0) + Number(r.commentCount || 0) + Number(r.collectCount || 0) + Number(r.shareCount || 0);
        const er = plays > 0 ? ((lcs / plays) * 100).toFixed(2) : '0.00';

        return `<tr>
          <td>${dateStr}</td>
          <td style="color:#2667ff;font-weight:700;">@${r.profile || '?'}</td>
          <td title="${desc.replace(/"/g, '&quot;')}">${shortDesc}</td>
          <td style="text-align:right;">${Number(r.diggCount || 0).toLocaleString()}</td>
          <td style="text-align:right;">${plays.toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.commentCount || 0).toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.collectCount || 0).toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.shareCount || 0).toLocaleString()}</td>
          <td style="text-align:right;">${Number(r.repostCount || 0).toLocaleString()}</td>
          <td style="text-align:right; color:#6941c6; font-weight:700;">${er}%</td>
          <td style="text-align:center;">${typeBadge}</td>
          <td style="text-align:center;">${linkStr}</td>
        </tr>`;
      }).join('');

      tbody.innerHTML = rows;
    }

    function downloadTableCSV(event) {
      if (event) event.stopPropagation();
      const table = document.getElementById('dataTable');
      const profile = document.getElementById('profileFilter').value;
      const rows = Array.from(table.rows);

      let csv = [];
      for (let i = 0; i < rows.length; i++) {
        const row = [], cols = rows[i].cells;
        for (let j = 0; j < cols.length; j++) {
          let data = cols[j].innerText.replace(/,/g, '');
          if (j === cols.length - 1) {
            const link = cols[j].querySelector('a');
            data = link ? link.href : '-';
          }
          row.push('"' + data.replace(/"/g, '""') + '"');
        }
        csv.push(row.join(','));
      }

      const csvString = csv.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `socialstream_${profile}_${timestamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV downloaded successfully!', 'success');
    }

    function downloadChartImage(chartId) {
      const canvas = document.getElementById(chartId);
      if (!canvas) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvas, 0, 0);

      const url = tempCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `socialstream_chart_${chartId}_${timestamp}.png`;
      a.click();
      showToast('Chart exported as PNG!', 'success');
    }

    function exportReport() {
      const chartIds = ['profileComparisonChart', 'topPostsChart', 'engPerPostChart', 'engagementPieChart', 'dayOfWeekChart', 'hashtagChart', 'hourChart', 'timelineChart', 'playsTimelineChart', 'sharesTimelineChart', 'repostsTimelineChart'];
      const charts = chartIds
        .map(id => {
          const canvas = document.getElementById(id);
          if (!canvas) return null;
          return {
            id,
            title: (canvas.closest('.chart-card')?.querySelector('.chart-title')?.textContent || id).trim(),
            image: canvas.toDataURL('image/png')
          };
        })
        .filter(Boolean);

      const kpiIds = ['kpi-videos', 'kpi-likes', 'kpi-comments', 'kpi-saves', 'kpi-shares', 'kpi-reposts', 'kpi-ads'];
      const kpis = kpiIds.map(id => {
        const el = document.getElementById(id);
        if (!el) return '';
        const label = el.closest('.kpi')?.querySelector('.kpi-label')?.textContent || id;
        return `<article class="report-card"><h3>${label}</h3><p style="font-size:28px;font-weight:700;margin:0;">${el.textContent}</p></article>`;
      }).join('');

      const payload = {
        generatedAt: new Date().toISOString(),
        activeView: document.getElementById('activeViewLabel')?.textContent || 'Overview',
        findings: [
          `Best weekday: ${document.getElementById('signalBestDay')?.textContent || '—'}`,
          `Best efficiency slot: ${document.getElementById('signalBestHour')?.textContent || '—'}`,
          `Boost mix: ${document.getElementById('signalBoostMix')?.textContent || '0%'}`
        ],
        narrative: document.getElementById('exec-narrative')?.innerHTML || '',
        recs: document.getElementById('exec-recs')?.innerHTML || '',
        kpis,
        charts,
        highlights: document.getElementById('highlightCards')?.innerHTML || '',
        lowlights: document.getElementById('lowlightCards')?.innerHTML || '',
        table: document.getElementById('dataTable')?.outerHTML || ''
      };

      localStorage.setItem('socialstreamReportPayload', JSON.stringify(payload));
      window.open('report.html', '_blank');
      showToast('Executive report prepared in a new tab.', 'success');
    }

    /* ══════════════════════════════════
       RESET
    ══════════════════════════════════ */
    function resetToSetup() {
      clearTimeout(pollTimer);
      document.body.classList.add('is-pristine');
      document.getElementById('dashboardPanel').style.display = 'none';
      document.getElementById('progressPanel').style.display = 'none';
      document.getElementById('setupPanel').style.display = 'block';
      document.getElementById('pdfBtn').style.display = 'none';
      document.getElementById('resetBtn').style.display = 'none';
      showIdleBadge();
      document.getElementById('runBtn').disabled = false;
      document.getElementById('headerSub').textContent = 'TikTok profile intelligence · editorial, reach, and publishing diagnostics';
      globalData = [];
      Object.keys(chartInstances).forEach(id => { try { chartInstances[id].destroy(); } catch (e) { } });
      chartInstances = {};
      renderSteps(null, [], []);
      setProgress(0, 'This may take up to 2 minutes…');
      resetWorkspaceChrome();
    }

    /* ══════════════════════════════════
       DEMO DATA
    ══════════════════════════════════ */
    function loadDemoData() {
      document.body.classList.remove('is-pristine');
      showToast('Loading demo dataset…', '');
      const profiles = ['brandacccount', 'creator_demo', 'viral_studio'];
      const demo = []; const now = Date.now();
      const tags = ['fyp', 'viral', 'tiktoktrend', 'sponsored', 'review', 'unboxing', 'lifestyle', 'trending'];
      for (let i = 0; i < 200; i++) {
        const profile = profiles[i % profiles.length];
        const d = new Date(now - Math.random() * 30 * 86400000);
        const plays = Math.floor(Math.random() * 800000 + 1000);
        const isAd = Math.random() < 0.18;
        // Placeholder covers using picsum for demo (portrait ratio)
        const coverSeed = (i * 37 + profile.length) % 1000;
        const item = {
          profile,
          diggCount: Math.floor(plays * (isAd ? 0.09 : 0.04) + Math.random() * plays * 0.06),
          commentCount: Math.floor(plays * (0.005 + Math.random() * 0.02)),
          collectCount: Math.floor(plays * (0.003 + Math.random() * 0.012)),
          shareCount: Math.floor(plays * (0.003 + Math.random() * 0.015)),
          repostCount: Math.floor(plays * (0.001 + Math.random() * 0.008)),
          playCount: plays,
          createTimeISO: d.toISOString(),
          'authorMeta/name': profile,
          isAd,
          cover: `https://picsum.photos/seed/${coverSeed}/360/640`,
          videoUrl: `https://www.tiktok.com/@${profile}`,
          desc: `${isAd ? '[Ad] ' : ''}Demo post for @${profile} featuring #${tags[i % tags.length]}`,
        };
        tags.slice(0, 3 + i % 4).forEach((t, j) => { item[`hashtags/${j}/name`] = t; });
        demo.push(item);
      }
      loadDashboard(demo);
      document.getElementById('setupPanel').style.display = 'none';
      document.getElementById('dashboardPanel').style.display = 'block';
      document.getElementById('pdfBtn').style.display = 'inline-flex';
      document.getElementById('resetBtn').style.display = 'inline-flex';
      showBadge('live', 'Demo — 200 posts');
      document.getElementById('headerSub').textContent = '200 demo posts · @brandacccount, @creator_demo, @viral_studio';
      showToast('Demo data loaded. Real analysis runs automatically — just add usernames & click Run.', 'success');
    }

    if (new URLSearchParams(location.search).get('demo') === '1') {
      setTimeout(() => loadDemoData(), 80);
    } else {
      showIdleBadge();
    }
