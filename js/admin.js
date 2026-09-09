(() => {
  const $ = (id) => document.getElementById(id);

  const adminDate = $('admin-date');
  const adminDateStatus = $('admin-date-status');
  const adminReservasBody = $('admin-reservas-body');
  const adminDesksBody = $('admin-desks-body');
  const adminUsersBody = $('admin-users-body');

  const deskModal = $('desk-modal');
  const userModal = $('user-modal');
  const confirmModal = $('confirm-modal');
  const reservarModal = $('reservar-modal');

  const zonaList = $('zona-list');
  let deskModalInstance = null;
  let userModalInstance = null;
  let confirmModalInstance = null;
  let reservarModalInstance = null;

  let allDesks = [];
  let allUsers = [];
  let pendingConfirm = null;

  const toISODate = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const showToast = (msg, ok = true) => {
    const t = $('admin-toast');
    t.classList.toggle('text-bg-success', ok);
    t.classList.toggle('text-bg-danger', !ok);
    t.querySelector('.toast-body').textContent = msg;
    bootstrap.Toast.getOrCreateInstance(t, { delay: 2500 }).show();
  };

  const askConfirm = (message, onYes) => {
    $('confirm-modal-text').textContent = message;
    pendingConfirm = onYes;
    confirmModalInstance.show();
  };

  $('confirm-modal-ok').addEventListener('click', async () => {
    confirmModalInstance.hide();
    if (pendingConfirm) await pendingConfirm();
    pendingConfirm = null;
  });

  const sortDesks = (list) => {
    const zoneMinY = {};
    list.forEach((d) => {
      zoneMinY[d.zona] = Math.min(zoneMinY[d.zona] ?? Infinity, d.pos_y);
    });
    return list.sort((a, b) => {
      const za = zoneMinY[a.zona] ?? 0;
      const zb = zoneMinY[b.zona] ?? 0;
      if (za !== zb) return za - zb;
      if (a.pos_y !== b.pos_y) return a.pos_y - b.pos_y;
      return a.pos_x - b.pos_x;
    });
  };

  const badge = (estado, text) =>
    `<span class="badge ${estado === 'ok' ? 'text-bg-success' : estado === 'warn' ? 'text-bg-warning' : 'text-bg-secondary'}">${text}</span>`;

  async function init() {
    const { data: sessionData } = await supabaseClient.auth.getUser();
    if (!sessionData?.user) {
      location.href = 'login.html';
      return;
    }
    const { data: me } = await supabaseClient
      .from('allowed_users')
      .select('rol')
      .eq('email', sessionData.user.email)
      .maybeSingle();
    if (!me || me.rol !== 'admin') {
      location.href = 'index.html';
      return;
    }

    adminDate.min = toISODate(new Date());
    adminDate.value = toISODate(new Date());

    $('logout-btn').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      location.href = 'login.html';
    });

    adminDate.addEventListener('change', renderReservations);
    $('btn-add-desk').addEventListener('click', () => openDeskModal());
    $('btn-save-desk').addEventListener('click', saveDesk);
    $('btn-add-user').addEventListener('click', () => openUserModal());
    $('btn-save-user').addEventListener('click', saveUser);

    deskModalInstance = new bootstrap.Modal(deskModal);
    userModalInstance = new bootstrap.Modal(userModal);
    confirmModalInstance = new bootstrap.Modal(confirmModal);
    reservarModalInstance = new bootstrap.Modal(reservarModal);

    $('btn-admin-reservar').addEventListener('click', openReservarModal);
    $('btn-confirm-reservar').addEventListener('click', confirmReserva);

    await loadDesks();
    await loadUsers();
    await renderReservations();
    renderDesks();
    renderUsers();
  }

  async function loadDesks() {
    const { data } = await supabaseClient.from('desks').select('*');
    allDesks = data || [];
    const zonas = [...new Set(allDesks.map((d) => d.zona))];
    const zoneMinY = {};
    allDesks.forEach((d) => {
      zoneMinY[d.zona] = Math.min(zoneMinY[d.zona] ?? Infinity, d.pos_y);
    });
    zonas.sort((a, b) => (zoneMinY[a] ?? 0) - (zoneMinY[b] ?? 0));
    zonaList.innerHTML = zonas.map((z) => `<option value="${z}"></option>`).join('');
  }

  async function loadUsers() {
    const { data } = await supabaseClient
      .from('allowed_users')
      .select('*')
      .order('nombre');
    allUsers = data || [];
  }

  async function renderReservations() {
    const fecha = adminDate.value;
    adminDateStatus.textContent = '';
    adminReservasBody.innerHTML = '';

    const { data: reservas, error } = await supabaseClient
      .from('reservas')
      .select('id, desk_id, user_email, user_nombre')
      .eq('fecha', fecha);
    if (error) {
      adminDateStatus.textContent = 'Error al cargar reservas: ' + error.message;
      return;
    }

    const byDesk = new Map(reservas.map((r) => [r.desk_id, r]));
    const active = sortDesks(allDesks.filter((d) => d.activo));

    if (!active.length) {
      adminReservasBody.innerHTML =
        '<tr><td colspan="5" class="text-center text-secondary py-4">No hay escritorios registrados.</td></tr>';
      return;
    }

    for (const desk of active) {
      const res = byDesk.get(desk.id);
      const tr = document.createElement('tr');
      tr.innerHTML = res
        ? `
          <td class="fw-semibold">${desk.nombre}</td>
          <td class="text-secondary">${desk.zona}</td>
          <td>${badge('ok', 'Ocupado')}</td>
          <td>${res.user_nombre || ''} <span class="text-secondary small">(${res.user_email})</span></td>
          <td class="text-end">
            <button class="btn btn-outline-danger btn-sm" data-cancel="${res.id}">Cancelar</button>
          </td>`
        : `
          <td class="fw-semibold">${desk.nombre}</td>
          <td class="text-secondary">${desk.zona}</td>
          <td>${badge('warn', 'Libre')}</td>
          <td class="text-secondary">—</td>
          <td></td>`;
      adminReservasBody.appendChild(tr);
    }

    adminReservasBody.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () =>
        askConfirm('¿Cancelar la reserva para siempre?', async () => {
          const { error } = await supabaseClient
            .from('reservas')
            .delete()
            .eq('id', btn.dataset.cancel);
          if (error) {
            showToast('No se pudo cancelar: ' + error.message, false);
          } else {
            showToast('Reserva cancelada.');
            await renderReservations();
          }
        })
      );
    });
  }

  function renderDesks() {
    adminDesksBody.innerHTML = '';
    if (!allDesks.length) {
      adminDesksBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-secondary py-4">No hay escritorios registrados.</td></tr>';
      return;
    }
    for (const desk of sortDesks(allDesks)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-semibold">${desk.nombre}</td>
        <td class="text-secondary">${desk.zona}</td>
        <td>${desk.pos_y}</td>
        <td>${desk.pos_x}</td>
        <td>${badge(desk.activo ? 'ok' : 'no', desk.activo ? 'Activo' : 'Inactivo')}</td>
        <td class="text-end">
          <button class="btn btn-outline-primary btn-sm me-1" data-edit="${desk.id}">Editar</button>
          <button class="btn btn-outline-secondary btn-sm me-1" data-toggle="${desk.id}">${desk.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-outline-danger btn-sm" data-del="${desk.id}">Eliminar</button>
        </td>`;
      adminDesksBody.appendChild(tr);
    }

    adminDesksBody.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => openDeskModal(deskById(btn.dataset.edit)))
    );
    adminDesksBody.querySelectorAll('[data-toggle]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const desk = deskById(btn.dataset.toggle);
        const { error } = await supabaseClient
          .from('desks')
          .update({ activo: !desk.activo })
          .eq('id', desk.id);
        if (error) return showToast('Error: ' + error.message, false);
        showToast(desk.activo ? 'Escritorio desactivado.' : 'Escritorio activado.');
        await loadDesks();
        renderDesks();
        await renderReservations();
      })
    );
    adminDesksBody.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', () =>
        askConfirm('¿Eliminar este escritorio definitivamente? (Se borran sus reservas)', async () => {
          const { error } = await supabaseClient
            .from('desks')
            .delete()
            .eq('id', btn.dataset.del);
          if (error) return showToast('Error: ' + error.message, false);
          showToast('Escritorio eliminado.');
          await loadDesks();
          renderDesks();
          await renderReservations();
        })
      )
    );
  }

  function renderUsers() {
    adminUsersBody.innerHTML = '';
    if (!allUsers.length) {
      adminUsersBody.innerHTML =
        '<tr><td colspan="5" class="text-center text-secondary py-4">No hay usuarios autorizados.</td></tr>';
      return;
    }
    for (const u of allUsers) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-semibold">${u.nombre || '—'}</td>
        <td class="text-secondary">${u.email}</td>
        <td>
          <select class="form-select form-select-sm role-select" data-role="${u.email}" style="width:110px">
            <option value="user" ${u.rol === 'user' ? 'selected' : ''}>user</option>
            <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </td>
        <td>${badge(u.activo ? 'ok' : 'no', u.activo ? 'Activo' : 'Inactivo')}</td>
        <td class="text-end">
          <button class="btn btn-outline-secondary btn-sm me-1" data-utoggle="${u.email}">${u.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-outline-danger btn-sm" data-udel="${u.email}">Eliminar</button>
        </td>`;
      adminUsersBody.appendChild(tr);
    }

    adminUsersBody.querySelectorAll('.role-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const { error } = await supabaseClient
          .from('allowed_users')
          .update({ rol: sel.value })
          .eq('email', sel.dataset.role);
        if (error) return showToast('Error: ' + error.message, false);
        showToast(`Rol actualizado a ${sel.value}.`);
      });
    });
    adminUsersBody.querySelectorAll('[data-utoggle]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const user = userByEmail(btn.dataset.utoggle);
        const { error } = await supabaseClient
          .from('allowed_users')
          .update({ activo: !user.activo })
          .eq('email', user.email);
        if (error) return showToast('Error: ' + error.message, false);
        showToast(user.activo ? 'Usuario desactivado.' : 'Usuario activado.');
        await loadUsers();
        renderUsers();
      })
    );
    adminUsersBody.querySelectorAll('[data-udel]').forEach((btn) =>
      btn.addEventListener('click', () =>
        askConfirm(`¿Eliminar a ${btn.dataset.udel} de los usuarios autorizados?`, async () => {
          const { error } = await supabaseClient
            .from('allowed_users')
            .delete()
            .eq('email', btn.dataset.udel);
          if (error) return showToast('Error: ' + error.message, false);
          showToast('Usuario eliminado.');
          await loadUsers();
          renderUsers();
        })
      )
    );
  }

  const deskById = (id) => allDesks.find((d) => d.id === id);
  const userByEmail = (email) => allUsers.find((u) => u.email === email);

  function openDeskModal(desk = null) {
    $('desk-modal-title').textContent = desk ? 'Editar escritorio' : 'Añadir escritorio';
    if (desk) {
      $('desk-id').value = desk.id;
      $('desk-nombre').value = desk.nombre;
      $('desk-zona').value = desk.zona;
      $('desk-posy').value = desk.pos_y;
      $('desk-posx').value = desk.pos_x;
      $('desk-activo').checked = desk.activo;
    } else {
      $('desk-id').value = '';
      $('desk-nombre').value = '';
      $('desk-posy').value = '';
      $('desk-posx').value = '';
      $('desk-activo').checked = true;

      const zonas = [...new Set(allDesks.map((d) => d.zona))];
      const zoneMinY = {};
      allDesks.forEach((d) => {
        zoneMinY[d.zona] = Math.min(zoneMinY[d.zona] ?? Infinity, d.pos_y);
      });
      zonas.sort((a, b) => (zoneMinY[a] ?? 0) - (zoneMinY[b] ?? 0));
      const zona = zonas[0] || '';
      $('desk-zona').value = zona;

      const inZone = allDesks.filter((d) => d.zona === zona);
      if (inZone.length) {
        const minY = Math.min(...inZone.map((d) => d.pos_y));
        const row = inZone.filter((d) => d.pos_y === minY);
        $('desk-posy').value = minY;
        $('desk-posx').value = Math.max(...row.map((d) => d.pos_x)) + 100;
      } else {
        $('desk-posy').value = 100;
        $('desk-posx').value = 100;
      }
    }
    deskModalInstance.show();
  }

  async function saveDesk() {
    const id = $('desk-id').value;
    const nombre = $('desk-nombre').value.trim();
    const zona = $('desk-zona').value.trim();
    const pos_y = parseInt($('desk-posy').value, 10);
    const pos_x = parseInt($('desk-posx').value, 10);
    const activo = $('desk-activo').checked;

    if (!nombre || !zona || Number.isNaN(pos_y) || Number.isNaN(pos_x)) {
      showToast('Completa los campos obligatorios.', false);
      return;
    }
    if (id) {
      const { error } = await supabaseClient
        .from('desks')
        .update({ nombre, zona, pos_y, pos_x, activo })
        .eq('id', id);
      if (error) return showToast('Error: ' + error.message, false);
      showToast('Escritorio actualizado.');
    } else {
      const { error } = await supabaseClient
        .from('desks')
        .insert({ nombre, zona, pos_y, pos_x, activo });
      if (error) return showToast('Error: ' + error.message, false);
      showToast('Escritorio añadido.');
    }
    deskModalInstance.hide();
    await loadDesks();
    renderDesks();
    await renderReservations();
  }

  function openUserModal() {
    $('user-email').value = '';
    $('user-nombre').value = '';
    $('user-rol').value = 'user';
    $('user-activo').checked = true;
    userModalInstance.show();
  }

  async function saveUser() {
    const email = $('user-email').value.trim().toLowerCase();
    const nombre = $('user-nombre').value.trim();
    const rol = $('user-rol').value;
    const activo = $('user-activo').checked;

    if (!email || !nombre) {
      showToast('Completa los campos obligatorios.', false);
      return;
    }
    userModalInstance.hide();
    const { error } = await supabaseClient
      .from('allowed_users')
      .insert({ email, nombre, rol, activo });
    if (error) {
      showToast('Error: ' + error.message, false);
      return;
    }
    showToast('Usuario añadido.');
    await loadUsers();
    renderUsers();
  }

  function cargarDesksDisponibles(fecha) {
    const deskSelect = $('reservar-desk');
    deskSelect.innerHTML = '<option value="">Cargando escritorios...</option>';

    supabaseClient
      .from('reservas')
      .select('desk_id')
      .eq('fecha', fecha)
      .then(({ data }) => {
        const takenDeskIds = new Set();
        if (data) data.forEach((r) => takenDeskIds.add(r.desk_id));
        const libres = allDesks.filter((d) => d.activo && !takenDeskIds.has(d.id));
        if (!libres.length) {
          deskSelect.innerHTML = '<option value="">No hay escritorios disponibles</option>';
          return;
        }
        deskSelect.innerHTML = '<option value="">Seleccionar escritorio...</option>';
        libres.forEach((d) => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = `${d.nombre} (${d.zona})`;
          deskSelect.appendChild(opt);
        });
      })
      .catch((err) => {
        console.error(err);
        deskSelect.innerHTML = '<option value="">Error al cargar escritorios</option>';
      });
  }

  function openReservarModal() {
    const userSelect = $('reservar-user');
    const deskSelect = $('reservar-desk');
    const fechaInput = $('reservar-fecha');
    const msg = $('reservar-msg');

    userSelect.innerHTML = '<option value="">Seleccionar usuario...</option>';
    msg.className = 'alert d-none mb-0';

    allUsers.filter((u) => u.activo).forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.email;
      opt.textContent = `${u.nombre} (${u.email})`;
      userSelect.appendChild(opt);
    });

    fechaInput.min = toISODate(new Date());
    fechaInput.value = adminDate.value;
    cargarDesksDisponibles(fechaInput.value);

    reservarModalInstance.show();
  }

  $('reservar-fecha').addEventListener('change', (e) => {
    cargarDesksDisponibles(e.target.value);
  });

  async function confirmReserva() {
    const userSelect = $('reservar-user');
    const deskSelect = $('reservar-desk');
    const fechaInput = $('reservar-fecha');
    const msg = $('reservar-msg');
    const btn = $('btn-confirm-reservar');

    const email = userSelect.value;
    const deskId = deskSelect.value;
    const fecha = fechaInput.value;

    if (!email || !deskId || !fecha) {
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = 'Selecciona el usuario, la fecha y el escritorio.';
      return;
    }

    const selectedUser = allUsers.find((u) => u.email === email);
    if (!selectedUser) {
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = 'Usuario no encontrado.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'RESERVANDO…';

    const { data: sessionData } = await supabaseClient.auth.getUser();
    const userAuthId = sessionData.user.id;

    const { error } = await supabaseClient.from('reservas').insert({
      fecha,
      desk_id: deskId,
      user_id: userAuthId,
      user_email: email,
      user_nombre: selectedUser.nombre
    });

    btn.disabled = false;
    btn.textContent = 'RESERVAR';

    if (error) {
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = error.code === '23505'
        ? 'Ese escritorio ya está reservado para esta fecha.'
        : error.message;
      return;
    }

    reservarModalInstance.hide();
    showToast(`Reserva creada: ${deskSelect.options[deskSelect.selectedIndex].text} para ${selectedUser.nombre}`);
    await renderReservations();
  }

  init();
})();