(() => {
  const nameEl = document.getElementById('user-name');
  const logoutBtn = document.getElementById('logout-btn');
  const adminLink = document.getElementById('admin-link');
  const dateInput = document.getElementById('date-input');
  const dateStatus = document.getElementById('date-status');
  const mapEl = document.getElementById('map');
  const panelEl = document.getElementById('desk-panel');
  const myResEl = document.getElementById('my-reservations');

  let user = null;
  let profile = null;
  let allDesks = [];
  let reservas = [];
  let selectedDesk = null;
  let cancelTarget = null;

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatFecha(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function escapeHtml(value) {
    const text = String(value ?? '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type = 'success') {
    const toast = document.getElementById('app-toast');
    toast.className = `toast align-items-center border-0 ${type === 'danger' ? 'text-bg-danger' : 'text-bg-success'}`;
    toast.querySelector('.toast-body').textContent = message;
    bootstrap.Toast.getOrCreateInstance(toast).show();
  }

  function showError(msg) {
    dateStatus.textContent = msg;
    setTimeout(() => { dateStatus.textContent = ''; }, 4000);
  }

  async function refresh() {
    try {
      const data = await DesksApp.loadMapData(dateInput.value);
      allDesks = data.desks;
      reservas = data.reservas;
      selectedDesk = null;
      renderMap();
      renderPanel(null);
      await renderMyReservations();
    } catch (err) {
      console.error(err);
      showError(err.message || 'No se pudieron cargar los datos.');
    }
  }

  function renderMap() {
    DesksApp.renderMap(mapEl, allDesks, reservas, {
      selectedDeskId: selectedDesk ? selectedDesk.id : null,
      onSelect: handleSelect
    });
  }

  let mapResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(mapResizeTimer);
    mapResizeTimer = setTimeout(renderMap, 150);
  });

  function handleSelect(desk) {
    selectedDesk = desk;
    renderMap();
    renderPanel(desk);
  }

  function reservaDeDesk(desk) {
    return reservas.find((r) => r.desk_id === desk.id) || null;
  }

  function renderPanel(desk) {
    if (!desk) {
      panelEl.innerHTML = `
        <h6 class="fw-bold text-uppercase text-secondary">Escritorio</h6>
        <p class="text-secondary small mb-0">Selecciona un escritorio del mapa para ver su estado y reservarlo.</p>
      `;
      return;
    }

    const res = reservaDeDesk(desk);
    panelEl.innerHTML = `
      <h6 class="fw-bold text-uppercase text-secondary">Escritorio</h6>
      <div class="panel-title">${escapeHtml(desk.nombre)}</div>
      <div class="small text-secondary mb-2">Zona: <b class="text-dark">${escapeHtml(desk.zona)}</b></div>
      <div class="mb-3">
        <span class="badge rounded-pill fs-6 ${res ? 'text-bg-danger' : 'text-bg-success'}">${res ? 'Ocupado' : 'Disponible'}</span>
        ${res ? `<span class="small text-secondary ms-1">por <b>${escapeHtml(res.user_nombre || res.user_email)}</b></span>` : ''}
      </div>
      ${res
        ? '<button class="btn w-100" disabled>RESERVAR</button>'
        : `<button id="btn-reserve" class="btn btn-success w-100">RESERVAR</button>`}
      <div id="panel-msg" class="alert mt-3 mb-0 d-none" role="alert"></div>
    `;

    const btn = document.getElementById('btn-reserve');
    if (btn) btn.addEventListener('click', () => reservar(desk));
  }

  function panelAlert(type, message) {
    const msg = document.getElementById('panel-msg');
    if (!msg) return;
    msg.className = `alert alert-${type} mt-3 mb-0`;
    msg.textContent = message;
  }

  async function reservar(desk) {
    const btn = document.getElementById('btn-reserve');
    if (btn) { btn.disabled = true; btn.textContent = 'RESERVANDO…'; }

    const { error } = await supabaseClient.from('reservas').insert({
      fecha: dateInput.value,
      desk_id: desk.id,
      user_id: user.id,
      user_email: user.email,
      user_nombre: profile.nombre
    });

    if (error) {
      if (btn) { btn.disabled = false; btn.textContent = 'RESERVAR'; }
      const message = error.code === '23505'
        ? 'Ese escritorio acaba de ser reservado por otra persona.'
        : error.message;
      panelAlert('danger', message);
      return;
    }

    showToast(`✓ Reserva confirmada: ${desk.nombre} el ${formatFecha(dateInput.value)}`);
    await refresh();
  }

  async function renderMyReservations() {
    const { data: rows, error } = await supabaseClient
      .from('reservas')
      .select('id, fecha, desk_id, desks(nombre, zona)')
      .eq('user_email', user.email)
      .gte('fecha', dateInput.min || toISODate(new Date()))
      .order('fecha', { ascending: true });

    if (error) {
      console.error(error);
      myResEl.innerHTML = '<p class="text-secondary small">No se pudieron cargar tus reservas.</p>';
      return;
    }

    if (!rows || rows.length === 0) {
      myResEl.innerHTML = '<div class="empty-note">No tienes reservas todavía.</div>';
      return;
    }

    myResEl.innerHTML = '';
    for (const r of rows) {
      const desk = Array.isArray(r.desks) ? r.desks[0] : r.desks;
      const deskLabel = desk ? desk.nombre : '—';
      const fechaLabel = formatFecha(r.fecha);

      const item = document.createElement('div');
      item.className = 'reservation-item';

      const info = document.createElement('div');
      info.innerHTML = `
        <div class="reservation-date">${fechaLabel}</div>
        <div class="reservation-desk">${escapeHtml(deskLabel)}</div>
        <div class="reservation-zona">${desk ? escapeHtml(desk.zona) : ''}</div>
      `;

      const btn = document.createElement('button');
      btn.className = 'btn btn-outline-danger btn-sm';
      btn.textContent = 'Cancelar';
      btn.type = 'button';
      btn.addEventListener('click', () => cancelarReserva(r.id, `${deskLabel} · ${fechaLabel}`));

      item.appendChild(info);
      item.appendChild(btn);
      myResEl.appendChild(item);
    }
  }

  function cancelarReserva(id, label) {
    cancelTarget = { id, label };
    document.getElementById('cancel-modal-text').textContent =
      `¿Seguro que quieres cancelar la reserva de ${label}? Esta acción no se puede deshacer.`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('cancel-modal')).show();
  }

  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  confirmCancelBtn.addEventListener('click', async () => {
    const modal = bootstrap.Modal.getInstance(document.getElementById('cancel-modal'));
    if (modal) modal.hide();

    if (!cancelTarget) return;
    const { id, label } = cancelTarget;
    cancelTarget = null;

    confirmCancelBtn.disabled = true;
    const { error } = await supabaseClient.from('reservas').delete().eq('id', id);
    confirmCancelBtn.disabled = false;

    if (error) {
      showToast('No se pudo cancelar la reserva: ' + error.message, 'danger');
      return;
    }
    showToast(`Reserva de ${label} cancelada.`);
    await refresh();
  });

  document.getElementById('cancel-modal').addEventListener('hidden.bs.modal', () => {
    if (cancelTarget) cancelTarget = null;
  });

  async function init() {
    dateInput.min = toISODate(new Date());
    dateInput.value = dateInput.min;

    const { data: { user: u } } = await supabaseClient.auth.getUser();
    if (!u) {
      window.location.href = 'login.html';
      return;
    }
    user = u;

    const { data: rows } = await supabaseClient
      .from('allowed_users')
      .select('nombre, rol')
      .eq('email', user.email)
      .maybeSingle();

    if (!rows) {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
      return;
    }

    profile = rows;
    nameEl.textContent = profile.nombre;
    if (profile.rol === 'admin') adminLink.classList.remove('d-none');

    dateInput.addEventListener('change', refresh);
    logoutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });

    await refresh();
  }

  init();
})();