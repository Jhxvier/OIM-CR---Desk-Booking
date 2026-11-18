(() => {
  const $ = (id) => document.getElementById(id);

  const adminDate = $('admin-date');
  const adminDateStatus = $('admin-date-status');
  const adminReservasBody = $('admin-reservas-body');
  const adminDesksBody = $('admin-desks-body');
  const adminUsersBody = $('admin-users-body');
  const userRolFilter = $('user-rol-filter');
  const userSearch = $('user-search');
  const auditBody = $('audit-body');
  const auditStatus = $('audit-status');
  const auditUsuario = $('audit-usuario');
  const auditAccion = $('audit-accion');
  const auditFecha = $('audit-fecha');
  const auditMes = $('audit-mes');
  const auditSemana = $('audit-semana');
  const diasBody = $('admin-dias-body');
  const diasStatus = $('dias-status');
  const diaFecha = $('dia-fecha');
  const diaTipo = $('dia-tipo');
  const diaDesc = $('dia-desc');
  const diaLista = $('dia-lista');

  let auditRows = [];
  let allDias = [];
  let currentUserEmail = '';

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

  // Ignora mayúsculas y acentos al buscar usuarios.
  const normText = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  // Fecha de hoy en Costa Rica (misma zona que usa el trigger de Supabase).
  function hoyCRAdmin() {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valor = (tipo) => Number(partes.find((p) => p.type === tipo).value);
    return { y: valor('year'), m: valor('month'), d: valor('day') };
  }

  // Mes maximo con reservas abiertas (dia 25 habilita el siguiente).
  function maxMesPermitidoAdmin() {
    const { y, m, d } = hoyCRAdmin();
    const permitido = d >= 25 ? new Date(y, m, 1) : new Date(y, m - 1, 1);
    return `${permitido.getFullYear()}-${String(permitido.getMonth() + 1).padStart(2, '0')}`;
  }

  function textoVentanaReservasAdmin() {
    const [y, m] = maxMesPermitidoAdmin().split('-').map(Number);
    const nombre = new Date(y, m - 1, 1).toLocaleString('es-CR', {
      month: 'long', year: 'numeric'
    });
    return hoyCRAdmin().d >= 25
      ? `Abierto el mes actual y ${nombre}.`
      : `Solo mes actual. El día 25 se abre ${nombre}.`;
  }

  // Actualiza el aviso y el limite del modal (si está abierto, lo corrige).
  function actualizarVentanaReservasAdmin() {
    const max = maxMesPermitidoAdmin();
    $('reservar-mes').max = max;
    $('reservar-mes-hint').textContent = textoVentanaReservasAdmin();
    if ($('reservar-mes').value > max) {
      $('reservar-mes').value = max;
      reservarFecha = '';
      $('reservar-desk').innerHTML = '<option value="">Selecciona primero un día</option>';
      $('reservar-desk-msg').textContent = '';
      renderReservarSemanas();
    }
  }

  let timerMedianocheAdmin = null;
  let claveVentanaAdmin = '';
  function programarMedianocheAdmin(alCambiar) {
    if (timerMedianocheAdmin) clearTimeout(timerMedianocheAdmin);
    const { y, m, d } = hoyCRAdmin();
    const proximo = Date.UTC(y, m - 1, d + 1, 6, 0, 0); // 00:00 CR = 06:00 UTC
    timerMedianocheAdmin = setTimeout(() => {
      claveVentanaAdmin = `${maxMesPermitidoAdmin()}|${hoyCRAdmin().d}`;
      alCambiar();
      programarMedianocheAdmin(alCambiar);
    }, Math.max(proximo - Date.now(), 1000));
  }

  function vigilarDiaAdmin(alCambiar) {
    const clave = `${maxMesPermitidoAdmin()}|${hoyCRAdmin().d}`;
    if (clave !== claveVentanaAdmin) {
      claveVentanaAdmin = clave;
      alCambiar();
      programarMedianocheAdmin(alCambiar);
    }
  }

  const DIAS_SEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  let reservarSemanas = [];
  let reservarFecha = '';

  function addDaysAdmin(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  // Misma lógica que la app: semana 1 = primer lunes del mes.
  function buildWeeksAdmin(year, month) {
    const last = new Date(year, month + 1, 0);
    const weeks = [];
    const first = new Date(year, month, 1);
    const diff = (8 - first.getDay()) % 7;
    first.setDate(first.getDate() + diff);
    let monday = first;
    while (monday <= last) {
      const days = [];
      for (let i = 0; i < 5; i++) days.push(toISODate(addDaysAdmin(monday, i)));
      weeks.push(days);
      monday = addDaysAdmin(monday, 7);
    }
    return weeks;
  }

  function specialDayFor(iso) {
    return allDias.find((d) => d.fecha === iso) || null;
  }

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

    // Sesión de admin válida: recién aquí se muestra el panel
    document.body.classList.remove('pending-auth');
    currentUserEmail = sessionData.user.email;
    $('admin-user-name').textContent = currentUserEmail;
    $('admin-user-avatar').textContent = currentUserEmail.charAt(0).toUpperCase();

    actualizarVentanaReservasAdmin();
    claveVentanaAdmin = `${maxMesPermitidoAdmin()}|${hoyCRAdmin().d}`;
    programarMedianocheAdmin(actualizarVentanaReservasAdmin);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) vigilarDiaAdmin(actualizarVentanaReservasAdmin);
    });
    setInterval(() => vigilarDiaAdmin(actualizarVentanaReservasAdmin), 60 * 1000);

    $('logout-btn').addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      location.href = 'login.html';
    });

    adminDate.value = toISODate(new Date());
    adminDate.addEventListener('change', renderReservations);

    $('btn-add-desk').addEventListener('click', () => openDeskModal());
    $('btn-save-desk').addEventListener('click', saveDesk);
    $('btn-add-user').addEventListener('click', () => openUserModal());
    $('btn-save-user').addEventListener('click', saveUser);
    userRolFilter.addEventListener('change', renderUsers);
    userSearch.addEventListener('input', renderUsers);

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
    await loadAuditoria();

    auditUsuario.addEventListener('change', renderAuditoria);
    auditAccion.addEventListener('change', renderAuditoria);
    auditFecha.addEventListener('change', renderAuditoria);
    auditMes.addEventListener('change', renderAuditoria);
    auditSemana.addEventListener('change', renderAuditoria);
    $('btn-audit-excel').addEventListener('click', exportarExcel);
    $('btn-audit-pdf').addEventListener('click', exportarPDF);
    $('tab-auditoria-btn').addEventListener('shown.bs.tab', loadAuditoria);

    $('btn-add-dia').addEventListener('click', addDia);
    $('btn-add-dias-lista').addEventListener('click', addDiasLista);
    $('tab-dias-btn').addEventListener('shown.bs.tab', loadDias);
    await loadDias();
    renderDias();
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

    // Quién ejecutó cada INSERT: si es distinto del beneficiario, fue un
    // admin reservando en nombre de alguien.
    const hechasPor = new Map();
    const ids = reservas.map((r) => r.id);
    if (ids.length) {
      const { data: aud } = await supabaseClient
        .from('auditoria')
        .select('reserva_id, accionado_por_email')
        .eq('accion', 'INSERT')
        .in('reserva_id', ids);
      (aud || []).forEach((a) => {
        if (a.accionado_por_email) hechasPor.set(a.reserva_id, a.accionado_por_email);
      });
    }

    const realizadaPorCelda = (res) => {
      const por = hechasPor.get(res.id);
      if (!por) return '<td class="small text-secondary">Sin registro</td>';
      const mismo = por.toLowerCase() === String(res.user_email || '').toLowerCase();
      if (mismo) {
        return `<td class="small">
          <span class="badge text-bg-light border">Ella misma</span>
          <div class="text-secondary mt-1">${escapeAttr(por)}</div>
        </td>`;
      }
      return `<td class="small">
        <span class="badge text-bg-info">En nombre de</span>
        <div class="mt-1"><strong>${escapeAttr(por)}</strong> en nombre de
          ${escapeAttr(res.user_nombre || res.user_email || '')}</div>
      </td>`;
    };

    const byDesk = new Map(reservas.map((r) => [r.desk_id, r]));
    const active = sortDesks(allDesks.filter((d) => d.activo));

    if (!active.length) {
      adminReservasBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-secondary py-4">No hay escritorios registrados.</td></tr>';
      return;
    }

    for (const desk of active) {
      const res = byDesk.get(desk.id);
      const tr = document.createElement('tr');
      tr.innerHTML = res
        ? `
          <td class="fw-semibold">${escapeAttr(desk.nombre)}</td>
          <td class="text-secondary">${escapeAttr(desk.zona)}</td>
          <td>${badge('ok', 'Ocupado')}</td>
          <td>${escapeAttr(res.user_nombre || '')} <span class="text-secondary small">(${escapeAttr(res.user_email)})</span></td>
          ${realizadaPorCelda(res)}
          <td class="text-end">
            <button class="btn btn-outline-danger btn-sm" data-cancel="${res.id}">Cancelar</button>
          </td>`
        : `
          <td class="fw-semibold">${escapeAttr(desk.nombre)}</td>
          <td class="text-secondary">${escapeAttr(desk.zona)}</td>
          <td>${badge('warn', 'Libre')}</td>
          <td class="text-secondary">—</td>
          <td class="text-secondary">—</td>
          <td></td>`;
      adminReservasBody.appendChild(tr);
    }

    adminReservasBody.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () =>
        askConfirm('¿Cancelar esta reserva y liberar el escritorio?', async () => {
          const { error } = await supabaseClient
            .from('reservas')
            .delete()
            .eq('id', btn.dataset.cancel);
          if (error) {
            showToast('No se pudo cancelar: ' + error.message, false);
          } else {
            showToast('Reserva cancelada. El escritorio ya está disponible.');
            await renderReservations();
            await loadAuditoria();
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
    const filtro = userRolFilter.value;
    const q = normText(userSearch.value.trim());
    const users = allUsers.filter((u) => {
      const porRol = filtro === 'todos' || u.rol === filtro;
      const porTexto = !q || normText(u.nombre).includes(q) || normText(u.email).includes(q);
      return porRol && porTexto;
    });
    if (!users.length) {
      adminUsersBody.innerHTML =
        `<tr><td colspan="5" class="text-center text-secondary py-4">${
          q || filtro !== 'todos'
            ? 'No se encontraron usuarios con esos filtros.'
            : 'No hay usuarios autorizados.'
        }</td></tr>`;
      return;
    }
    for (const u of users) {
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
          <button class="btn btn-outline-primary btn-sm me-1" data-uedit="${u.email}">Editar</button>
          <button class="btn btn-outline-secondary btn-sm me-1" data-utoggle="${u.email}">${u.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-outline-danger btn-sm" data-udel="${u.email}">Eliminar</button>
        </td>`;
      adminUsersBody.appendChild(tr);
    }

    adminUsersBody.querySelectorAll('[data-uedit]').forEach((btn) =>
      btn.addEventListener('click', () => openUserModal(userByEmail(btn.dataset.uedit)))
    );

    adminUsersBody.querySelectorAll('.role-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const { error } = await supabaseClient
          .from('allowed_users')
          .update({ rol: sel.value })
          .eq('email', sel.dataset.role);
        if (error) return showToast('Error: ' + error.message, false);
        showToast(`Rol actualizado a ${sel.value}.`);
        await loadUsers();
        renderUsers();
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

  // ============================================================
  // DÍAS ESPECIALES — feriados obligatorios y días flotantes
  // ============================================================

  const fmtDia = (iso) => {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${d}/${m}/${y}` : '—';
  };

  async function loadDias() {
    const { data, error } = await supabaseClient
      .from('dias_especiales')
      .select('fecha, tipo, descripcion, creado_por')
      .order('fecha', { ascending: true });

    if (error) {
      diasStatus.textContent = 'No se pudo cargar la tabla de días especiales: ' + error.message;
      diasBody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-4">Tabla no disponible todavía.</td></tr>';
      return;
    }
    allDias = data || [];
    diasStatus.textContent = allDias.length
      ? `${allDias.length} día(s) configurado(s).`
      : 'No hay días especiales configurados.';
    renderDias();
  }

  function renderDias() {
    if (!allDias.length) {
      diasBody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-4">Sin días configurados.</td></tr>';
      return;
    }
    diasBody.innerHTML = allDias
      .map((d) => {
        const esOblig = d.tipo === 'obligatorio';
        const badgeTipo = esOblig
          ? '<span class="badge text-bg-danger">Obligatorio</span>'
          : '<span class="badge text-bg-warning text-dark">Flotante</span>';
        return `<tr>
          <td class="fw-semibold">${fmtDia(d.fecha)}</td>
          <td>${badgeTipo}</td>
          <td>${escapeAttr(d.descripcion || '—')}</td>
          <td>
            <button class="btn btn-outline-danger btn-sm" type="button"
              data-dia-del="${escapeAttr(d.fecha)}">Eliminar</button>
          </td>
        </tr>`;
      })
      .join('');

    diasBody.querySelectorAll('[data-dia-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fecha = btn.dataset.diaDel;
        const item = allDias.find((d) => d.fecha === fecha);
        askConfirm(
          `¿Eliminar el día ${fmtDia(fecha)} (${item ? item.descripcion || item.tipo : ''})?`,
          async () => {
            const { error } = await supabaseClient
              .from('dias_especiales')
              .delete()
              .eq('fecha', fecha);
            if (error) return showToast('Error: ' + error.message, false);
            showToast('Día eliminado.');
            await loadDias();
          }
        );
      });
    });
  }

  async function addDia() {
    const fecha = diaFecha.value;
    const tipo = diaTipo.value;
    const descripcion = diaDesc.value.trim();

    if (!fecha) {
      showToast('Selecciona una fecha.', false);
      return;
    }
    const { error } = await supabaseClient
      .from('dias_especiales')
      .upsert(
        { fecha, tipo, descripcion, creado_por: currentUserEmail },
        { onConflict: 'fecha' }
      );

    if (error) return showToast('Error: ' + error.message, false);
    showToast(`Día ${fmtDia(fecha)} guardado.`);
    diaFecha.value = '';
    diaDesc.value = '';
    await loadDias();
  }

  async function addDiasLista() {
    const lineas = diaLista.value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (!lineas.length) {
      showToast('Pega al menos una línea en la lista.', false);
      return;
    }

    const filas = [];
    const errores = [];
    lineas.forEach((linea, i) => {
      const partes = linea.split('|').map((p) => p.trim());
      const fecha = partes[0] || '';
      const tipo = (partes[1] || '').toLowerCase();
      const descripcion = partes.slice(2).join('|').trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        errores.push(`Línea ${i + 1}: fecha inválida`);
        return;
      }
      if (tipo !== 'obligatorio' && tipo !== 'flotante') {
        errores.push(`Línea ${i + 1}: tipo debe ser obligatorio o flotante`);
        return;
      }
      filas.push({ fecha, tipo, descripcion, creado_por: currentUserEmail });
    });

    if (errores.length) {
      showToast(errores[0], false);
      return;
    }

    const { error } = await supabaseClient
      .from('dias_especiales')
      .upsert(filas, { onConflict: 'fecha' });

    if (error) return showToast('Error: ' + error.message, false);
    showToast(`${filas.length} día(s) guardado(s).`);
    diaLista.value = '';
    await loadDias();
  }

  // ============================================================
  // AUDITORÍA — historial de reservas y cambios
  // ============================================================
  const estadoBadge = (estado) => {
    if (estado === 'ACTIVA') return '<span class="badge text-bg-success">Reserva</span>';
    if (estado === 'CANCELADA') return '<span class="badge text-bg-danger">Cancelada</span>';
    return `<span class="badge text-bg-secondary">${estado || '—'}</span>`;
  };

  const fmtFechaHora = (iso) => {
    if (!iso) return '—';
    // Supabase devuelve UTC; mostramos hora local
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  const fmtFechaCorta = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  // Misma lógica que la app: la semana 1 empieza en el PRIMER LUNES del mes.
  // Van de lunes a viernes; la 5ª aparece solo si la última semana cruza
  // al mes siguiente.
  function numeroSemana(iso, mesRef) {
    if (!iso) return null;
    const [y, m, dia] = iso.split('-').map(Number);

    // Si se eligió mes, usamos ese. Si no, probamos el mes de la fecha y
    // el anterior (por si cae en una semana que cruza de mes, ej. 30-nov
    // que pertenece a la semana 5 de noviembre).
    const candidatos = [];
    if (mesRef) {
      candidatos.push([Number(mesRef.split('-')[0]), Number(mesRef.split('-')[1]) - 1]);
    } else {
      candidatos.push([y, m - 1]);
      const prev = new Date(y, m - 2, 1);
      candidatos.push([prev.getFullYear(), prev.getMonth()]);
    }

    for (const [cy, cm] of candidatos) {
      const primero = new Date(cy, cm, 1);
      const diff = (8 - primero.getDay()) % 7; // 0 si ya es lunes
      primero.setDate(primero.getDate() + diff);
      const ultimo = new Date(cy, cm + 1, 0); // último día del mes cm

      let i = 1;
      const lunes = new Date(primero);
      while (lunes <= ultimo) {
        for (let k = 0; k < 5; k++) {
          const d = new Date(lunes);
          d.setDate(lunes.getDate() + k);
          if (d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === dia) {
            return i;
          }
        }
        lunes.setDate(lunes.getDate() + 7);
        i++;
      }
    }
    return null;
  }

  // Convierte los eventos sueltos (INSERT / DELETE) en una fila por reserva,
  // con su estado final y el historial legible de lo que le pasó.
  function agruparAuditoria(rows) {
    const grupos = new Map();

    for (const r of rows) {
      const key = r.reserva_id ||
        [r.fecha_reserva, r.desk_id, r.usuario_email, r.creado_en].join('|');
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(r);
    }

    const resultado = [];

    for (const [reserva_id, eventos] of grupos) {
      eventos.sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

      const insert = eventos.find((e) => e.accion === 'INSERT') || eventos[0];
      const ultimo = eventos[eventos.length - 1];
      const cancelada = eventos.some((e) => e.accion === 'DELETE');

      const historial = eventos.map((e) => {
        const verbo = e.accion === 'INSERT' ? 'Reservó'
          : e.accion === 'DELETE' ? 'Canceló' : 'Cambió';
        const por = e.accionado_por_email ? ` (${e.accionado_por_email})` : '';
        return `${verbo} el ${fmtFechaCorta(e.creado_en)}${por}`;
      }).join(' · ');

      resultado.push({
        reserva_id,
        estado: cancelada ? 'CANCELADA' : 'ACTIVA',
        fecha_reserva: insert.fecha_reserva,
        desk_id: insert.desk_id,
        desk_nombre: insert.desk_nombre,
        zona: insert.zona,
        usuario_email: insert.usuario_email,
        usuario_nombre: insert.usuario_nombre,
        accionado_por_email: ultimo.accionado_por_email || insert.usuario_email,
        creado_en: ultimo.creado_en,
        ultima_accion_en: ultimo.creado_en,
        historial
      });
    }

    return resultado.sort((a, b) =>
      new Date(b.ultima_accion_en) - new Date(a.ultima_accion_en));
  }

  async function loadAuditoria() {
    try {
      const { data, error } = await supabaseClient
        .from('auditoria')
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(1000);

      let rows = data || [];

      // Si la tabla de auditoría está vacía (o no existe), reconstruimos
      // las reservas actuales desde la tabla reservas (que ya tiene created_at).
      // Así se ven también las reservas anteriores al trigger.
      if (error || rows.length === 0) {
        const { data: reservasData, error: errRes } = await supabaseClient
          .from('reservas')
          .select('id, fecha, desk_id, user_email, user_nombre, created_at')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (!errRes && reservasData) {
          rows = reservasData.map((r) => {
            const desk = allDesks.find((d) => d.id === r.desk_id);
            return {
              accion: 'INSERT',
              reserva_id: r.id,
              fecha_reserva: r.fecha,
              desk_id: r.desk_id,
              desk_nombre: desk ? desk.nombre : '—',
              zona: desk ? desk.zona : '',
              usuario_email: r.user_email,
              usuario_nombre: r.user_nombre || '',
              accionado_por_email: r.user_email,
              creado_en: r.created_at,
              _reconstruido: true
            };
          });
          auditStatus.textContent = 'Mostrando reservas reconstruidas (el historial completo aparecerá al crear/cancelar reservas nuevas).';
        } else if (error) {
          auditStatus.textContent = 'No se pudo cargar la auditoría: ' + error.message;
          auditBody.innerHTML = '<tr><td colspan="7" class="text-center text-secondary py-4">Tabla de auditoría no disponible.</td></tr>';
          return;
        }
      }

      auditRows = agruparAuditoria(rows);

      // Llenar filtro de usuarios con los que aparecen en el historial
      const emails = [...new Set(auditRows.map((r) => r.usuario_email).filter(Boolean))];
      const actual = auditUsuario.value;
      auditUsuario.innerHTML = '<option value="">Todos</option>' +
        emails.map((e) => `<option value="${escapeAttr(e)}">${escapeAttr(e)}</option>`).join('');
      auditUsuario.value = actual;

      renderAuditoria();
    } catch (err) {
      auditStatus.textContent = 'Error: ' + err.message;
    }
  }

  function escapeAttr(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function auditoriaFiltrada() {
    return auditRows.filter((r) => {
      if (auditUsuario.value && r.usuario_email !== auditUsuario.value) return false;
      if (auditAccion.value === 'ACTIVA' && r.estado !== 'ACTIVA') return false;
      if (auditAccion.value === 'CANCELADA' && r.estado !== 'CANCELADA') return false;
      if (auditFecha.value && r.fecha_reserva !== auditFecha.value) return false;
      if (auditMes.value) {
        const pref = auditMes.value; // YYYY-MM
        if (!String(r.fecha_reserva || '').startsWith(pref)) {
          // Permitir días que cruzan de mes (ej. 1-4 de diciembre dentro
          // de la semana 5 de noviembre)
          const semana = numeroSemana(r.fecha_reserva, auditMes.value);
          if (semana === null) return false;
        }
      }
      if (auditSemana.value) {
        const semana = numeroSemana(r.fecha_reserva, auditMes.value || null);
        if (semana !== Number(auditSemana.value)) return false;
      }
      return true;
    });
  }

  function renderAuditoria() {
    const rows = auditoriaFiltrada();
    // Los botones muestran cuántos registros se exportarán con los filtros actuales
    $('btn-audit-excel').textContent = `↓ Excel (${rows.length})`;
    $('btn-audit-pdf').textContent = `↓ PDF (${rows.length})`;

    auditBody.innerHTML = '';
    if (!rows.length) {
      auditBody.innerHTML = '<tr><td colspan="7" class="text-center text-secondary py-4">Sin registros para los filtros seleccionados.</td></tr>';
      auditStatus.textContent = `${rows.length} registro(s)`;
      return;
    }
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeAttr(r.fecha_reserva || '—')}</td>
        <td>${estadoBadge(r.estado)}</td>
        <td class="fw-semibold">${escapeAttr(r.usuario_nombre || '')} <span class="text-secondary small">(${escapeAttr(r.usuario_email || '')})</span></td>
        <td class="small">${escapeAttr(r.accionado_por_email || '—')}</td>
        <td>${escapeAttr(r.desk_nombre || '—')}</td>
        <td class="text-secondary small">${escapeAttr(r.zona || '')}</td>
        <td class="small" style="min-width:260px">${escapeAttr(r.historial || '—')}</td>`;
      auditBody.appendChild(tr);
    }
    auditStatus.textContent = `${rows.length} registro(s) — actualizado en tiempo real al recargar`;
  }

  // Devuelve un arreglo de líneas con los filtros actualmente aplicados
  function filtrosResumen() {
    const lines = [];
    if (auditUsuario.value) lines.push(`Usuario: ${auditUsuario.value}`);
    if (auditAccion.value) {
      const nombres = { ACTIVA: 'Reservas activas', CANCELADA: 'Canceladas' };
      lines.push(`Estado: ${nombres[auditAccion.value] || auditAccion.value}`);
    }
    if (auditFecha.value) lines.push(`Fecha reservada: ${auditFecha.value}`);
    if (auditMes.value) lines.push(`Mes: ${auditMes.value}`);
    if (auditSemana.value) lines.push(`Semana: ${auditSemana.value}`);
    if (!lines.length) lines.push('Sin filtros (se exporta todo el historial)');
    return lines;
  }

  // Sufijo corto para el nombre del archivo según los filtros
  function sufijoArchivo() {
    const partes = [];
    if (auditUsuario.value) partes.push(auditUsuario.value.split('@')[0]);
    if (auditFecha.value) partes.push(auditFecha.value);
    if (auditMes.value) partes.push(auditMes.value);
    if (auditSemana.value) partes.push(`sem${auditSemana.value}`);
    return partes.length ? '_' + partes.join('_').replace(/[^A-Za-z0-9_-]/g, '') : '';
  }

  function datosExportacion() {
    return auditoriaFiltrada().map((r) => ({
      'Fecha reservada': r.fecha_reserva || '',
      'Estado': r.estado === 'ACTIVA' ? 'Reserva' : r.estado === 'CANCELADA' ? 'Cancelada' : r.estado || '',
      'Usuario': r.usuario_nombre || '',
      'Email': r.usuario_email || '',
      'Realizado por': r.accionado_por_email || '',
      'Escritorio': r.desk_nombre || '',
      'Zona': r.zona || '',
      'Historial': r.historial || ''
    }));
  }

  function exportarExcel() {
    const rows = datosExportacion();
    if (!rows.length) return showToast('No hay registros para exportar con estos filtros.', false);

    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(libro, hoja, 'Auditoría');

    // Hoja con el detalle de los filtros aplicados
    const filtros = [
      ['OIM CR - Desk Booking · Auditoría'],
      ['Generado', fmtFechaHora(new Date().toISOString())],
      ['Registros exportados', rows.length],
      [],
      ['FILTROS APLICADOS']
    ].concat(filtrosResumen().map((l) => [l]));
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filtros), 'Filtros');

    XLSX.writeFile(libro, `auditoria_desk_booking_${toISODate(new Date())}${sufijoArchivo()}.xlsx`);
    showToast(`Excel descargado: ${rows.length} registro(s) según los filtros.`);
  }

  function exportarPDF() {
    const rows = datosExportacion();
    if (!rows.length) return showToast('No hay registros para exportar con estos filtros.', false);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('OIM CR - Desk Booking · Auditoría', 14, 16);
    doc.setFontSize(9);
    doc.text(`Generado: ${fmtFechaHora(new Date().toISOString())}`, 14, 23);
    doc.text(`Registros exportados: ${rows.length} (según filtros aplicados)`, 14, 29);
    filtrosResumen().forEach((linea, i) => {
      doc.text(`Filtro: ${linea}`, 14, 35 + i * 5);
    });

    doc.autoTable({
      head: [Object.keys(rows[0])],
      body: rows.map((r) => Object.values(r)),
      startY: 40 + filtrosResumen().length * 5,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] }
    });
    doc.save(`auditoria_desk_booking_${toISODate(new Date())}${sufijoArchivo()}.pdf`);
    showToast(`PDF descargado: ${rows.length} registro(s) según los filtros.`);
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

  function openUserModal(user = null) {
    $('user-modal-title').textContent = user ? 'Editar usuario' : 'Añadir usuario';
    $('user-email-original').value = user ? user.email : '';
    $('user-email').value = user ? user.email : '';
    $('user-nombre').value = user ? user.nombre || '' : '';
    $('user-rol').value = user ? user.rol : 'user';
    $('user-activo').checked = user ? user.activo : true;
    $('user-email-help').textContent = user
      ? 'El usuario deberá entrar con el correo nuevo. Si ya tenía sesión abierta, se cerrará. Su historial de reservas conservará el correo anterior.'
      : 'Debe coincidir exactamente con el correo institucional.';
    userModalInstance.show();
  }

  async function saveUser() {
    const original = $('user-email-original').value;
    const email = $('user-email').value.trim().toLowerCase();
    const nombre = $('user-nombre').value.trim();
    const rol = $('user-rol').value;
    const activo = $('user-activo').checked;
    const cambiaEmail = Boolean(original) && email !== original;

    if (!email || !nombre) {
      showToast('Completa los campos obligatorios.', false);
      return;
    }
    if (allUsers.some((u) => u.email === email && u.email !== original)) {
      showToast('Ya existe un usuario con ese email.', false);
      return;
    }
    if (cambiaEmail && original === currentUserEmail) {
      showToast('No puedes cambiar tu propio correo desde aquí.', false);
      return;
    }

    userModalInstance.hide();

    if (original) {
      const { error } = await supabaseClient
        .from('allowed_users')
        .update(cambiaEmail ? { email, nombre, rol, activo } : { nombre, rol, activo })
        .eq('email', original);
      if (error) {
        showToast('Error: ' + error.message, false);
        return;
      }
      showToast(
        cambiaEmail
          ? 'Usuario actualizado. Debe entrar con el correo nuevo.'
          : 'Usuario actualizado.'
      );
    } else {
      const { error } = await supabaseClient
        .from('allowed_users')
        .insert({ email, nombre, rol, activo });
      if (error) {
        showToast('Error: ' + error.message, false);
        return;
      }
      showToast('Usuario añadido.');
    }

    await loadUsers();
    renderUsers();
    if (cambiaEmail) await renderReservations();
  }

  async function cargarDesksDisponibles(fecha) {
    const deskSelect = $('reservar-desk');
    const info = $('reservar-desk-msg');
    deskSelect.innerHTML = '<option value="">Cargando escritorios...</option>';
    info.textContent = '';

    if (!fecha) {
      deskSelect.innerHTML = '<option value="">Selecciona primero un día</option>';
      return;
    }

    const { data, error } = await supabaseClient
      .from('reservas')
      .select('desk_id')
      .eq('fecha', fecha);

    // Si falla la consulta, NO mostramos todos los escritorios para evitar
    // ofrecer uno que ya está ocupado.
    if (error) {
      console.error(error);
      deskSelect.innerHTML = '<option value="">No se pudo consultar la disponibilidad</option>';
      info.textContent = 'Revisa tu conexión e inténtalo de nuevo.';
      return;
    }

    const takenDeskIds = new Set((data || []).map((r) => r.desk_id));
    const libres = allDesks.filter((d) => d.activo && !takenDeskIds.has(d.id));
    const [, m, d] = fecha.split('-');

    if (!libres.length) {
      deskSelect.innerHTML = '<option value="">No hay escritorios disponibles</option>';
      info.textContent = `Todos los escritorios están reservados para el ${d}/${m}.`;
      return;
    }

    deskSelect.innerHTML = '<option value="">Seleccionar escritorio...</option>';
    libres.forEach((desk) => {
      const opt = document.createElement('option');
      opt.value = desk.id;
      opt.textContent = `${desk.nombre} (${desk.zona})`;
      deskSelect.appendChild(opt);
    });
    info.textContent = `${libres.length} disponible(s) para el ${d}/${m}. Los ocupados no aparecen.`;
  }

  function renderReservarSemanas() {
    const [y, m] = $('reservar-mes').value.split('-').map(Number);
    reservarSemanas = buildWeeksAdmin(y, m - 1);
    const sel = $('reservar-semana');
    sel.innerHTML = reservarSemanas
      .map((w, i) => {
        const [, am, ad] = w[0].split('-');
        const [, bm, bd] = w[4].split('-');
        return `<option value="${i}">Semana ${i + 1} (${ad}/${am} – ${bd}/${bm})</option>`;
      })
      .join('');
    sel.value = '0';
    renderReservarDias();
  }

  function renderReservarDias() {
    const idx = Number($('reservar-semana').value || 0);
    const days = reservarSemanas[idx] || [];
    const hoy = toISODate(new Date());
    const container = $('reservar-dias');
    const msg = $('reservar-dia-msg');

    if (!days.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = days
      .map((iso, i) => {
        const esp = specialDayFor(iso);
        const oblig = esp?.tipo === 'obligatorio';
        const flot = esp?.tipo === 'flotante';
        const past = iso < hoy;
        let cls = 'admin-day-btn';
        if (oblig) cls += ' holiday';
        else if (past) cls += ' past';
        else if (flot) cls += ' floating';
        if (iso === reservarFecha) cls += ' active';

        const disabled = oblig || past ? 'disabled' : '';
        const title = oblig
          ? `Feriado obligatorio: ${esp.descripcion || ''}`
          : flot
            ? `Día flotante: ${esp.descripcion || ''}`
            : past
              ? 'Fecha pasada'
              : 'Disponible';
        const label = oblig ? 'FERIADO' : flot ? 'FLOTANTE' : DIAS_SEM[i];
        const [, m, d] = iso.split('-');
        return `<button type="button" class="${cls}" data-reservar-dia="${iso}" ${disabled} title="${escapeAttr(title)}">
          ${DIAS_SEM[i]} ${d}/${m}<small>${label}</small>
        </button>`;
      })
      .join('');

    msg.textContent = '';
    container.querySelectorAll('[data-reservar-dia]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        reservarFecha = btn.dataset.reservarDia;
        renderReservarDias();
        cargarDesksDisponibles(reservarFecha);
        const esp = specialDayFor(reservarFecha);
        msg.textContent = esp?.tipo === 'flotante'
          ? `Día flotante: ${esp.descripcion}. Se puede reservar normalmente.`
          : '';
      });
    });
  }

  function openReservarModal() {
    const userSelect = $('reservar-user');
    const msg = $('reservar-msg');

    userSelect.innerHTML = '<option value="">Seleccionar usuario...</option>';
    msg.className = 'alert d-none mb-0';
    msg.textContent = '';
    $('reservar-dia-msg').textContent = '';
    $('reservar-desk-msg').textContent = '';
    $('reservar-desk').innerHTML = '<option value="">Selecciona primero un día</option>';

    allUsers.filter((u) => u.activo).forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.email;
      opt.textContent = `${u.nombre} (${u.email})`;
      userSelect.appendChild(opt);
    });

    const base = toISODate(new Date());
    $('reservar-mes').max = maxMesPermitidoAdmin();
    $('reservar-mes-hint').textContent = textoVentanaReservasAdmin();
    $('reservar-mes').value = base.slice(0, 7);
    reservarFecha = '';
    renderReservarSemanas();

    const idx = reservarSemanas.findIndex((w) => w.includes(base));
    if (idx >= 0) {
      $('reservar-semana').value = String(idx);
      renderReservarDias();
      const esp = specialDayFor(base);
      if (base >= toISODate(new Date()) && esp?.tipo !== 'obligatorio') {
        reservarFecha = base;
        renderReservarDias();
        cargarDesksDisponibles(base);
      }
    }

    reservarModalInstance.show();
  }

  $('reservar-mes').addEventListener('change', () => {
    const max = maxMesPermitidoAdmin();
    if ($('reservar-mes').value > max) $('reservar-mes').value = max;
    reservarFecha = '';
    $('reservar-desk').innerHTML = '<option value="">Selecciona primero un día</option>';
    $('reservar-desk-msg').textContent = '';
    renderReservarSemanas();
  });

  $('reservar-semana').addEventListener('change', () => {
    reservarFecha = '';
    $('reservar-desk').innerHTML = '<option value="">Selecciona primero un día</option>';
    $('reservar-desk-msg').textContent = '';
    renderReservarDias();
  });

  async function confirmReserva() {
    const userSelect = $('reservar-user');
    const deskSelect = $('reservar-desk');
    const msg = $('reservar-msg');
    const btn = $('btn-confirm-reservar');

    const email = userSelect.value;
    const deskId = deskSelect.value;
    const fecha = reservarFecha;

    if (!email || !deskId || !fecha) {
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = 'Selecciona el usuario, el día y el escritorio.';
      return;
    }

    const selectedUser = allUsers.find((u) => u.email === email);
    if (!selectedUser) {
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = 'Usuario no encontrado.';
      return;
    }

    const esp = specialDayFor(fecha);
    if (esp?.tipo === 'obligatorio') {
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = `No se puede reservar en feriado obligatorio: ${esp.descripcion || ''}.`;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'RESERVANDO…';

    // Verificación final: alguien pudo reservar el escritorio mientras el
    // modal estaba abierto. Evitamos ofrecerlo como disponible.
    const { data: yaOcupado, error: errCheck } = await supabaseClient
      .from('reservas')
      .select('id')
      .eq('fecha', fecha)
      .eq('desk_id', deskId)
      .limit(1);

    if (errCheck || (yaOcupado && yaOcupado.length)) {
      btn.disabled = false;
      btn.textContent = 'RESERVAR';
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = 'Ese escritorio ya fue reservado para ese día. Elige otro de la lista.';
      await cargarDesksDisponibles(fecha);
      return;
    }

    // El dueño de la reserva debe ser el beneficiario. Si nunca ha ingresado
    // a la app no existe en auth.users, por lo que no se puede reservar a su nombre.
    const { data: foundId, error: errId } = await supabaseClient.rpc(
      'get_auth_id_by_email',
      { target_email: email }
    );

    if (errId || !foundId) {
      btn.disabled = false;
      btn.textContent = 'RESERVAR';
      msg.className = 'alert alert-danger mb-0';
      msg.textContent =
        'El usuario seleccionado nunca ha ingresado a la app. Debe iniciar sesión al menos una vez antes de poder reservar a su nombre.';
      return;
    }

    const { error } = await supabaseClient.from('reservas').insert({
      fecha,
      desk_id: deskId,
      user_id: foundId,
      user_email: email,
      user_nombre: selectedUser.nombre
    });

    btn.disabled = false;
    btn.textContent = 'RESERVAR';

    if (error) {
      msg.className = 'alert alert-danger mb-0';
      msg.textContent = error.code === '23505'
        ? 'Ese escritorio ya está reservado para esta fecha.'
        : error.message.includes('una reserva por día por persona')
          ? 'Ese usuario ya tiene una reserva ese día.'
          : error.message.includes('Reservas solo están abiertas')
            ? 'Solo se puede reservar para el mes actual. A partir del día 25 se habilita el mes siguiente.'
            : error.message;
      return;
    }

    reservarModalInstance.hide();
    showToast(
      `Reserva creada: ${deskSelect.options[deskSelect.selectedIndex].text} para ${selectedUser.nombre}`
    );
    // Si la reserva es para la fecha que se está viendo, actualiza la tabla.
    if (fecha === adminDate.value) await renderReservations();
    await loadAuditoria();
  }

  init();
})();