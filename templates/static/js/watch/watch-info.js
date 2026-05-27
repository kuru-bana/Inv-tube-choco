function renderVideoInfo(meta, videoId) {
  currentVideoMeta = meta;
  document.title = `${meta.title || '動画'} - Choco-tube-plus`;

  document.getElementById('infoSkeleton').hidden = true;
  const infoEl = document.getElementById('videoInfo');
  infoEl.removeAttribute('hidden');

  document.getElementById('watchTitle').textContent = meta.title || '';

  const views = formatViews(meta.viewCount);
  const date = meta.publishedText || '';
  const likes = meta.likeCount ? `👍 ${meta.likeCount.toLocaleString()}` : '';
  const metaParts = [views, date, likes].filter(Boolean);
  document.getElementById('watchMeta').innerHTML = metaParts.map((p, i) =>
    i < metaParts.length - 1
      ? `<span>${escapeHtml(p)}</span><span class="meta-sep">·</span>`
      : `<span>${escapeHtml(p)}</span>`
  ).join('');

  const channelId = meta.authorId || '';
  const channelLinkEl = document.getElementById('channelLink');
  if (channelId) {
    channelLinkEl.href = `/channel?id=${encodeURIComponent(channelId)}`;
  }

  document.getElementById('channelName').textContent = meta.author || '';

  const subs = meta.subCountText || (meta.subCount ? formatSubs(meta.subCount) : '');
  if (subs) {
    document.getElementById('channelSubs').textContent = `登録者 ${subs}`;
  }

  const thumbs = meta.authorThumbnails;
  const avatarEl = document.getElementById('channelAvatar');
  const placeholderEl = document.getElementById('channelAvatarPlaceholder');

  function showAvatar(iconUrl) {
    avatarEl.src = iconUrl;
    avatarEl.alt = meta.author || '';
    avatarEl.onload = () => {
      avatarEl.classList.add('loaded');
      avatarEl.removeAttribute('hidden');
      placeholderEl.setAttribute('hidden', '');
    };
  }

  if (thumbs && thumbs.length > 0) {
    showAvatar(getChannelIconUrl(thumbs));
  } else if (channelId) {
    fetchChannelAvatar(channelId).then(fetchedThumbs => {
      if (!fetchedThumbs || !avatarEl.isConnected) return;
      showAvatar(getChannelIconUrl(fetchedThumbs));
    });
  }

  document.getElementById('ytLink').href = `https://www.youtube.com/watch?v=${videoId}`;

  const watchSubBtn = document.getElementById('watchSubBtn');
  if (watchSubBtn && channelId) {
    updateWatchSubBtn(watchSubBtn, channelId);
    watchSubBtn.hidden = false;
    watchSubBtn.onclick = () => {
      const subscribed = toggleSubscription({
        authorId: channelId,
        author: meta.author || '',
        authorThumbnails: meta.authorThumbnails || [],
        subCountText: meta.subCountText || null,
        subCount: meta.subCount || null
      });
      updateWatchSubBtn(watchSubBtn, channelId, subscribed);
    };
  }

  initWatchPlaylistBtn(videoId, meta);
  initShareBtn(videoId);
  initDownloadBtn(videoId, meta);
  initFavBtn(videoId, meta);

  addHistory({
    videoId,
    title: meta.title || '',
    author: meta.author || '',
    authorId: channelId,
    lengthSeconds: meta.lengthSeconds || 0,
    videoThumbnails: meta.videoThumbnails || null
  });

  const rawHtml = meta.descriptionHtml || '';
  const rawText = meta.description || '';
  const descEl = document.getElementById('descriptionText');
  const toggleEl = document.getElementById('descToggle');
  const descWrap = document.getElementById('descriptionWrap');
  const formattedDesc = formatDescription(rawHtml, rawText);

  if (!formattedDesc.trim()) {
    descWrap.hidden = true;
  } else {
    descEl.innerHTML = formattedDesc;
    toggleEl.hidden = true;
    requestAnimationFrame(() => {
      if (descEl.scrollHeight > descEl.clientHeight + 4) {
        toggleEl.hidden = false;
        let isExpanded = false;
        toggleEl.addEventListener('click', () => {
          isExpanded = !isExpanded;
          if (isExpanded) {
            descEl.style.maxHeight = descEl.scrollHeight + 'px';
            toggleEl.textContent = '折りたたむ';
          } else {
            descEl.style.maxHeight = '';
            toggleEl.textContent = 'もっと見る';
          }
        });
      }
    });
  }
}

/* ===== COMMENTS ===== */
let currentSortBy = 'top';
let currentContinuation = null;
let commentsLoading = false;

function createCommentSkeleton() {
  const div = document.createElement('div');
  div.className = 'comment-skeleton';
  div.innerHTML = `
    <div class="cs-avatar"></div>
    <div class="cs-body">
      <div class="cs-line cs-name"></div>
      <div class="cs-line cs-t1"></div>
      <div class="cs-line cs-t2"></div>
      <div class="cs-line cs-t3"></div>
    </div>
  `;
  return div;
}

function createCommentItem(c) {
  const div = document.createElement('div');
  div.className = 'comment-item';

  const authorHref = c.authorId ? `/channel?id=${encodeURIComponent(c.authorId)}` : null;
  const thumbs = c.authorThumbnails;
  const iconUrl = thumbs && thumbs.length
    ? wsrv(thumbs[thumbs.length - 1].url || thumbs[0].url, 72)
    : '';

  const likesHtml = c.likeCount
    ? `<span class="comment-likes">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
        ${c.likeCount.toLocaleString()}
       </span>`
    : '';

  const repliesHtml = c.replyCount
    ? `<span class="comment-replies">返信 ${c.replyCount}</span>`
    : '';

  div.innerHTML = `
    <div class="comment-avatar-wrap">
      ${iconUrl
        ? `<img class="comment-avatar" src="${iconUrl}" alt="${escapeHtml(c.author || '')}" loading="lazy" onload="this.classList.add('loaded')" />`
        : `<div class="comment-avatar-placeholder"></div>`
      }
    </div>
    <div class="comment-body">
      <div class="comment-header">
        ${authorHref
          ? `<a class="comment-author${c.authorVerified ? ' verified' : ''}" href="${authorHref}">${escapeHtml(c.author || '')}</a>`
          : `<span class="comment-author${c.authorVerified ? ' verified' : ''}">${escapeHtml(c.author || '')}</span>`
        }
        ${c.publishedText ? `<span class="comment-date">${escapeHtml(c.publishedText)}</span>` : ''}
        ${c.isPinned ? `<span class="comment-pinned">📌 固定</span>` : ''}
      </div>
      <div class="comment-text">${escapeHtml(c.content || '')}</div>
      <div class="comment-footer">${likesHtml}${repliesHtml}</div>
    </div>
  `;
  return div;
}

function showCommentSkeletons(count = 6) {
  const list = document.getElementById('commentsList');
  for (let i = 0; i < count; i++) list.appendChild(createCommentSkeleton());
}

function removeCommentSkeletons() {
  document.querySelectorAll('.comment-skeleton').forEach(el => el.remove());
}

async function loadComments(videoId, sortBy, continuation = null, append = false) {
  if (commentsLoading) return;
  commentsLoading = true;

  const list = document.getElementById('commentsList');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  loadMoreBtn.disabled = true;

  if (!append) {
    list.innerHTML = '';
    showCommentSkeletons(6);
  } else {
    showCommentSkeletons(3);
  }

  try {
    let url = `/api/comments/${videoId}?sort_by=${sortBy}`;
    if (continuation) url += `&continuation=${encodeURIComponent(continuation)}`;

    const data = await withRetry(() => fetchMain(url), 10);
    removeCommentSkeletons();

    if (!append && data.commentCount) {
      const countEl = document.getElementById('commentCount');
      countEl.textContent = `(${Number(data.commentCount).toLocaleString()})`;
    }

    const comments = data.comments || [];
    if (comments.length === 0 && !append) {
      list.innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:0.5rem 0;">コメントはありません。</p>';
    } else {
      comments.forEach(c => list.appendChild(createCommentItem(c)));
    }

    currentContinuation = data.continuation || null;
    if (currentContinuation) {
      loadMoreWrap.hidden = false;
      loadMoreBtn.disabled = false;
    } else {
      loadMoreWrap.hidden = true;
    }
  } catch (e) {
    removeCommentSkeletons();
    if (!append) {
      list.innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:0.5rem 0;">コメントの取得に失敗しました。</p>';
    }
    loadMoreWrap.hidden = true;
    console.error('comments error:', e);
  }

  commentsLoading = false;
}

function initComments(videoId) {
  const sortBtns = document.querySelectorAll('.sort-btn');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.sort === currentSortBy) return;
      sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSortBy = btn.dataset.sort;
      currentContinuation = null;
      document.getElementById('commentCount').textContent = '';
      loadComments(videoId, currentSortBy);
    });
  });

  loadMoreBtn.addEventListener('click', () => {
    loadComments(videoId, currentSortBy, currentContinuation, true);
  });

  loadComments(videoId, currentSortBy);
}
