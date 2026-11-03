(() => {
  const labs = window.LABS || [];
  const grid = document.querySelector('#labGrid');
  const dialog = document.querySelector('#detailDialog');
  const search = document.querySelector('#search');
  const library = document.querySelector('#library');
  const imageByVisual = { pendulum:'TPEND6.webp', volleyball:'VBPASS.webp', heart:'HEART8.webp', water:'WATER6.webp', agriculture:'AGWATR.png', chip:'CHNASH.png' };
  let filter = 'all';
  let saved = [];
  try { const value = JSON.parse(localStorage.getItem('conceptlab-studio-saved') || '[]'); if (Array.isArray(value)) saved = value.filter(code => labs.some(lab => lab.code === code)); } catch (_) {}
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const art = lab => imageByVisual[lab.visual] ? `<img src="assets/${imageByVisual[lab.visual]}" alt="">` : `<div class="abstract-art" aria-hidden="true">${lab.visual === 'attention' ? 'Q · K · V' : '01 → 10'}</div>`;
  const spaceName = lab => lab.space === 'school2lab' ? 'School2Lab' : 'Paper2Explorer';
  function render() {
    const q = normalize(search.value.trim());
    const visible = labs.filter(lab => (filter === 'all' || (filter === 'saved' ? saved.includes(lab.code) : lab.space === filter)) && normalize([lab.title, lab.subject, lab.description, lab.code].join(' ')).includes(q));
    grid.innerHTML = visible.map(lab => `<article class="lab-card"><div class="lab-image ${escape(lab.visual)}">${art(lab)}<button class="save-button ${saved.includes(lab.code) ? 'saved' : ''}" data-save="${escape(lab.code)}" aria-label="${saved.includes(lab.code) ? 'Bỏ lưu' : 'Lưu'} ${escape(lab.title)}" aria-pressed="${saved.includes(lab.code)}"><svg><use href="#bookmark"/></svg></button></div><div class="lab-body"><div class="lab-meta"><span class="category">${escape(lab.subject)}</span><span>${escape(lab.level)}</span></div><h3>${escape(lab.title)}</h3><p>${escape(lab.description)}</p><div class="card-bottom"><span>${spaceName(lab)}</span><button class="open-lab" data-open="${escape(lab.code)}">Xem chi tiết →</button></div></div></article>`).join('');
    document.querySelector('#resultCount').textContent = `${visible.length} bài mẫu`;
    document.querySelector('#empty').hidden = visible.length !== 0;
    document.querySelector('.saved-count').textContent = saved.length;
    document.querySelectorAll('.filter').forEach(button => { const active = button.dataset.filter === filter; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  }
  function setFilter(value, scroll = false) {
    filter = value; render();
    if (scroll) library.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function openDetail(code) {
    const lab = labs.find(item => item.code === code); if (!lab) return;
    document.querySelector('#detailBody').innerHTML = `<div class="dialog-visual lab-image ${escape(lab.visual)}">${art(lab)}</div><div class="dialog-content"><div class="lab-meta"><span class="category">${escape(lab.subject)} / ${spaceName(lab)}</span><span>${escape(lab.level)}</span></div><h2 id="detailTitle">${escape(lab.title)}</h2><p>${escape(lab.description)}</p><p class="dialog-notice">Đây là bản xem trước giao diện dùng dữ liệu mẫu. Bài tương tác đầy đủ có mã <strong>${escape(lab.code)}</strong> trong ứng dụng ConceptLab hiện có; bản xem trước này chưa kết nối backend.</p><div class="dialog-actions"><button data-dialog-save="${escape(lab.code)}">${saved.includes(lab.code) ? 'Bỏ khỏi danh sách lưu' : 'Lưu bài này'}</button><button class="secondary" data-close>Đóng</button></div></div>`;
    if (!dialog.open) dialog.showModal();
  }
  function toggleSaved(code) {
    saved = saved.includes(code) ? saved.filter(item => item !== code) : [...saved, code];
    try { localStorage.setItem('conceptlab-studio-saved', JSON.stringify(saved)); } catch (_) {}
    render();
  }
  grid.addEventListener('click', event => { const save = event.target.closest('[data-save]'); const open = event.target.closest('[data-open]'); if (save) toggleSaved(save.dataset.save); if (open) openDetail(open.dataset.open); });
  dialog.addEventListener('click', event => { const save = event.target.closest('[data-dialog-save]'); if (save) { toggleSaved(save.dataset.dialogSave); openDetail(save.dataset.dialogSave); } if (event.target === dialog || event.target.closest('[data-close]')) dialog.close(); });
  document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
  document.querySelector('#featuredButton').addEventListener('click', () => openDetail('TPEND6'));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  document.querySelectorAll('[data-space]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.space, true)));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelector('#breadcrumb').textContent = button.textContent.trim().replace(/\d+$/, '').trim();
    const view = button.dataset.view;
    if (view === 'all') { setFilter('all'); window.scrollTo({top:0, behavior:'smooth'}); }
    else setFilter(view === 'library' ? 'all' : view, true);
    document.querySelector('#sidebar').classList.remove('open'); document.querySelector('#menuButton').setAttribute('aria-expanded','false');
  }));
  search.addEventListener('input', render);
  document.querySelector('#menuButton').addEventListener('click', event => { const open = document.querySelector('#sidebar').classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { document.querySelector('#sidebar').classList.remove('open'); document.querySelector('#menuButton').setAttribute('aria-expanded','false'); } });
  render();
})();
