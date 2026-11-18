(() => {
  const nameEl = document.getElementById('user-name');
  const logoutBtn = document.getElementById('logout-btn');
  const adminLink = document.getElementById('admin-link');
  const monthInput = document.getElementById('month-input');
  const weekSelect = document.getElementById('week-select');
  const dateStatus = document.getElementById('date-status');
  const gridEl = document.getElementById('booking-grid');
  const myResEl = document.getElementById('my-reservations');
  const btnReserve = document.getElementById('btn-reserve');
  const btnClear = document.getElementById('btn-clear');
  const panelMsg = document.getElementById('panel-msg');

  let user = null;
  let profile = null;
  let allDesks = [];
  let reservas = [];
  let diasEspeciales = [];
  let weekDays = [];
  let selected = new Set(); // claves "fecha|deskId"
  let cancelTarget = null;

  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fromISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
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

  function panelAlert(type, message) {
    panelMsg.className = `alert alert-${type} mt-3 mb-0`;
    panelMsg.textContent = message;
    // Si es un error, también se muestra arriba y se lleva la vista al mensaje
    if (type === 'danger') {
      showToast(message, 'danger');
      panelMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearPanelMsg() {
    panelMsg.className = 'alert mt-3 mb-0 d-none';
    panelMsg.textContent = '';
  }

  function addDays(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  // Fecha de hoy en Costa Rica (misma zona que usa el trigger de Supabase).
  function hoyCR() {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valor = (tipo) => Number(partes.find((p) => p.type === tipo).value);
    return { y: valor('year'), m: valor('month'), d: valor('day') };
  }

  // Mes maximo con reservas abiertas:
  //   dia 1-24  -> mes actual
  //   dia 25+   -> mes siguiente (el actual NO se cierra)
  function maxMesPermitido() {
    const { y, m, d } = hoyCR();
    const permitido = d >= 25 ? new Date(y, m, 1) : new Date(y, m - 1, 1);
    return `${permitido.getFullYear()}-${String(permitido.getMonth() + 1).padStart(2, '0')}`;
  }

  function textoVentanaReservas() {
    const [y, m] = maxMesPermitido().split('-').map(Number);
    const nombre = new Date(y, m - 1, 1).toLocaleString('es-CR', {
      month: 'long', year: 'numeric'
    });
    return hoyCR().d >= 25
      ? `Reservas abiertas para el mes actual y ${nombre}.`
      : `Solo se puede reservar para ${nombre}. El día 25 se habilita el mes siguiente.`;
  }

  // Recalcula el aviso y el limite, y corrige el mes elegido si quedó fuera.
  function actualizarVentanaReservas() {
    const max = maxMesPermitido();
    monthInput.max = max;
    document.getElementById('month-hint').textContent = textoVentanaReservas();
    if (monthInput.value > max) {
      monthInput.value = max;
      populateWeeks();
      refresh();
    }
  }

  // Programa el proximo cambio de dia en hora Costa Rica.
  // CR no usa horario de verano: medianoche CR = 06:00 UTC.
  let timerMedianoche = null;
  let claveVentana = '';
  function programarMedianoche(alCambiar) {
    if (timerMedianoche) clearTimeout(timerMedianoche);
    const { y, m, d } = hoyCR();
    const proximo = Date.UTC(y, m - 1, d + 1, 6, 0, 0);
    timerMedianoche = setTimeout(() => {
      claveVentana = `${maxMesPermitido()}|${hoyCR().d}`;
      alCambiar();
      programarMedianoche(alCambiar);
    }, Math.max(proximo - Date.now(), 1000));
  }

  function vigilarDia(alCambiar) {
    const clave = `${maxMesPermitido()}|${hoyCR().d}`;
    if (clave !== claveVentana) {
      claveVentana = clave;
      alCambiar();
      programarMedianoche(alCambiar);
    }
  }

  // Primer lunes del mes (la semana 1 empieza ahí, aunque el mes haya
  // empezado en martes, miércoles... o domingo).
  function firstMondayOfMonth(year, month) {
    const d = new Date(year, month, 1);
    const diff = (8 - d.getDay()) % 7; // 0 si ya es lunes
    d.setDate(d.getDate() + diff);
    return d;
  }

  // Semanas (lunes a viernes) desde el primer lunes del mes.
  // Salen 4 semanas; la 5ª aparece solo cuando la última semana del mes
  // incluye días del inicio del mes siguiente.
  function buildWeeks(year, month) {
    const last = new Date(year, month + 1, 0);
    const weeks = [];
    let monday = firstMondayOfMonth(year, month);
    while (monday <= last) {
      const days = [];
      for (let i = 0; i < 5; i++) {
        const d = addDays(monday, i);
        days.push({
          iso: toISODate(d),
          label: DIAS[i],
          numero: d.getDate(),
          esDelMes: d.getMonth() === month
        });
      }
      weeks.push(days);
      monday = addDays(monday, 7);
    }
    return weeks;
  }

  function populateWeeks() {
    const [year, month] = monthInput.value.split('-').map(Number);
    const weeks = buildWeeks(year, month - 1);
    const hoyISO = toISODate(new Date());

    // Por defecto, la semana que contiene hoy (si el mes es el actual)
    let selectedIndex = 0;
    weeks.forEach((w, i) => {
      if (w.some((d) => d.iso === hoyISO)) selectedIndex = i;
    });

    weekSelect.innerHTML = '';
    weeks.forEach((w, i) => {
      const option = document.createElement('option');
      option.value = String(i);
      const primero = w[0];
      const ultimo = w[4];
      option.textContent = `Semana ${i + 1} (${primero.numero} – ${ultimo.numero})`;
      weekSelect.appendChild(option);
    });
    weekSelect.value = String(selectedIndex);
    return weeks;
  }

  function currentDays() {
    const [year, month] = monthInput.value.split('-').map(Number);
    return buildWeeks(year, month - 1)[Number(weekSelect.value)] || [];
  }

  async function refresh() {
    try {
      clearPanelMsg();
      weekDays = currentDays();
      const desde = weekDays[0].iso;
      const hasta = weekDays[weekDays.length - 1].iso;

      const [desksRes, reservasRes, diasRes] = await Promise.all([
        supabaseClient
          .from('desks')
          .select('*')
          .eq('activo', true)
          .order('pos_y', { ascending: true })
          .order('pos_x', { ascending: true }),
        supabaseClient
          .from('reservas')
          .select('id, desk_id, fecha, user_email, user_nombre')
          .gte('fecha', desde)
          .lte('fecha', hasta),
        supabaseClient
          .from('dias_especiales')
          .select('fecha, tipo, descripcion')
          .gte('fecha', desde)
          .lte('fecha', hasta)
      ]);

      if (desksRes.error) throw desksRes.error;
      if (reservasRes.error) throw reservasRes.error;
      // Si la tabla de días especiales aún no existe, la app sigue funcionando.
      if (diasRes.error) console.warn('Días especiales no disponibles:', diasRes.error.message);

      allDesks = desksRes.data || [];
      reservas = reservasRes.data || [];
      diasEspeciales = diasRes.error ? [] : (diasRes.data || []);
      selected.clear();
      renderGrid();
      renderMyReservations();
    } catch (err) {
      console.error(err);
      showError(err.message || 'No se pudieron cargar los datos.');
    }
  }

  function resDeCelda(fecha, deskId) {
    return reservas.find((r) => r.fecha === fecha && r.desk_id === deskId) || null;
  }

  function diaEspecial(fecha) {
    return diasEspeciales.find((d) => d.fecha === fecha) || null;
  }

  function esObligatorio(fecha) {
    return diaEspecial(fecha)?.tipo === 'obligatorio';
  }

  function clave(fecha, deskId) {
    return `${fecha}|${deskId}`;
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    const hoy = toISODate(new Date());

    // Agrupar escritorios por zona (mismo orden que el mapa)
    const byZone = {};
    const zoneMinY = {};
    allDesks.forEach((d) => {
      (byZone[d.zona] = byZone[d.zona] || []).push(d);
      zoneMinY[d.zona] = Math.min(zoneMinY[d.zona] ?? Infinity, d.pos_y);
    });
    const zones = Object.keys(byZone).sort((a, b) => zoneMinY[a] - zoneMinY[b]);

    // Tabla: primera columna = escritorio, luego los 5 días
    const table = document.createElement('table');
    table.className = 'table table-bordered booking-table mb-0';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const thDesk = document.createElement('th');
    thDesk.className = 'booking-th-desk';
    thDesk.textContent = 'ESCRITORIO';
    headRow.appendChild(thDesk);

    weekDays.forEach((day) => {
      const th = document.createElement('th');
      const esp = diaEspecial(day.iso);
      let thClass = 'booking-th-day' + (day.iso === hoy ? ' hoy' : '');
      if (esp?.tipo === 'obligatorio') thClass += ' holiday';
      else if (esp?.tipo === 'flotante') thClass += ' floating';
      th.className = thClass;
      if (esp) {
        th.title = `${esp.tipo === 'obligatorio' ? 'Feriado obligatorio' : 'Día flotante'}: ${esp.descripcion || ''}`;
      }
      const nombre = document.createElement('div');
      nombre.className = 'day-name';
      nombre.textContent = day.label;
      const numero = document.createElement('div');
      numero.className = 'day-number';
      numero.textContent = day.numero;
      th.appendChild(nombre);
      th.appendChild(numero);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    zones.forEach((zona, zi) => {
      // Fila de separador de zona
      const zoneRow = document.createElement('tr');
      zoneRow.className = 'booking-zone-row';
      const zoneCell = document.createElement('td');
      zoneCell.colSpan = 6;
      zoneCell.textContent = zona.toUpperCase();
      zoneRow.appendChild(zoneCell);
      tbody.appendChild(zoneRow);

      byZone[zona].forEach((desk) => {
        const row = document.createElement('tr');
        const th = document.createElement('th');
        th.className = 'booking-row-desk';
        th.textContent = desk.nombre;
        row.appendChild(th);

        weekDays.forEach((day) => {
          const td = document.createElement('td');
          td.className = 'booking-cell-wrap';
          const res = resDeCelda(day.iso, desk.id);
          const esPasado = day.iso < hoy;
          const esp = diaEspecial(day.iso);
          const obligatorio = esp?.tipo === 'obligatorio';
          const flotante = esp?.tipo === 'flotante';
          const key = clave(day.iso, desk.id);

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'booking-cell';

          if (obligatorio) {
            // Feriado obligatorio: bloqueado, no se puede seleccionar.
            btn.classList.add('holiday');
            btn.disabled = true;
            btn.textContent = 'FERIADO';
            btn.title = `Feriado obligatorio: ${esp.descripcion || ''}`;
          } else {
            if (res) btn.classList.add('taken');
            else if (esPasado) btn.classList.add('past');
            else if (selected.has(key)) btn.classList.add('selected');
            else btn.classList.add('available');

            // El amarillo solo se aplica si no está ocupada ni es pasada.
            // Si está seleccionada, el azul de .selected prevalece.
            if (flotante && !res && !esPasado) {
              btn.classList.add('floating');
              if (esp.descripcion) {
                btn.title = `Día flotante: ${esp.descripcion} — se puede reservar`;
              }
            }

            if (res) {
              btn.title = `Ocupado por ${res.user_nombre || res.user_email}`;
              const who = document.createElement('span');
              who.className = 'cell-who';
              who.textContent = res.user_nombre || res.user_email;
              btn.appendChild(who);
            } else if (esPasado) {
              btn.title = 'Fecha pasada';
            } else {
              btn.title = btn.title || `${desk.nombre} · ${day.label} ${day.numero} — clic para seleccionar`;
              btn.addEventListener('click', () => toggleCelda(fechaKey(day.iso), desk, day));
            }
          }

          td.appendChild(btn);
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
    });
    table.appendChild(tbody);
    gridEl.appendChild(table);
  }

  // Guarda la fecha como string para evitar desfases de zona horaria
  function fechaKey(iso) {
    return iso;
  }

  function toggleCelda(fecha, desk, day) {
    const key = clave(fecha, desk.id);
    if (selected.has(key)) {
      selected.delete(key);
    } else {
      selected.add(key);
    }
    renderGrid();
  }

  function limpiarSeleccion() {
    selected.clear();
    clearPanelMsg();
    renderGrid();

    if (!weekDays.length) {
      showToast('Selección limpia.');
      return;
    }

    const desde = weekDays[0].iso;
    const hasta = weekDays[weekDays.length - 1].iso;
    const propias = reservas.filter((r) =>
      r.user_email === user.email && r.fecha >= desde && r.fecha <= hasta
    );

    if (!propias.length) {
      showToast('Selección limpia. No tenías reservas en esta semana.');
      return;
    }

    cancelTarget = {
      ids: propias.map((r) => r.id),
      label: `${propias.length} reserva(s) de esta semana`
    };
    document.getElementById('cancel-modal-text').textContent =
      `¿Cancelar tus ${propias.length} reserva(s) de esta semana? Las celdas volverán a estar disponibles. Esta acción no se puede deshacer.`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('cancel-modal')).show();
  }

  btnReserve.addEventListener('click', async () => {
    if (selected.size === 0) {
      panelAlert('danger', 'Selecciona al menos un escritorio y día en la cuadrícula.');
      return;
    }

    // Validar límite: 1 reserva por día a nombre del usuario actual.
    // Aplica también a los admins cuando reservan para sí mismos
    // (los admins solo pueden excederse cuando reservan a nombre de otros
    // desde el panel de administración).
    const porDia = new Map();
    for (const key of selected) {
      const fecha = key.split('|')[0];
      porDia.set(fecha, (porDia.get(fecha) || 0) + 1);
    }
    const bloqueados = Array.from(porDia.keys()).filter(esObligatorio);
    if (bloqueados.length) {
      const esp = diaEspecial(bloqueados[0]);
      panelAlert('danger', `No se puede reservar en feriado obligatorio${esp?.descripcion ? ': ' + esp.descripcion : ''}.`);
      return;
    }
    const duplicados = Array.from(porDia.entries()).filter(([, n]) => n > 1);
    if (duplicados.length) {
      panelAlert('danger', 'Solo puedes reservar 1 escritorio por día a tu nombre. Quita la selección extra.');
      return;
    }
    for (const fecha of porDia.keys()) {
      if (reservas.some((r) => r.fecha === fecha && r.user_email === user.email)) {
        panelAlert('danger', `Ya tienes una reserva el ${formatFecha(fecha)}. Cancela la existente primero.`);
        return;
      }
    }

    btnReserve.disabled = true;
    btnReserve.textContent = 'RESERVANDO…';

    const rows = Array.from(selected).map((key) => {
      const [fecha, deskId] = key.split('|');
      return {
        fecha,
        desk_id: deskId,
        user_id: user.id,
        user_email: user.email,
        user_nombre: profile.nombre
      };
    });

    const { error } = await supabaseClient.from('reservas').insert(rows);

    btnReserve.disabled = false;
    btnReserve.textContent = 'RESERVAR';

    if (error) {
      let message = error.message;
      if (error.code === '23505') {
        message = 'Uno de los escritorios acaba de ser reservado por otra persona.';
      } else if (message.includes('un escritorio por día') ||
                 message.includes('una reserva por día por persona')) {
        message = 'Solo puedes reservar 1 escritorio por día a tu nombre. Quita la selección extra.';
      } else if (message.includes('Reservas solo están abiertas')) {
        message = 'Solo se puede reservar para el mes actual. A partir del día 25 se habilita el mes siguiente.';
      }
      panelAlert('danger', message);
      return;
    }

    showToast(`✓ ${rows.length} reserva(s) confirmada(s).`);
    await refresh();
  });

  function renderMyReservations() {
    const rangoEl = document.getElementById('my-reservas-rango');

    if (!weekDays.length) {
      if (rangoEl) rangoEl.textContent = '';
      myResEl.innerHTML = '<div class="empty-note">Selecciona una semana.</div>';
      return;
    }

    const desde = weekDays[0].iso;
    const hasta = weekDays[weekDays.length - 1].iso;
    const hoy = toISODate(new Date());

    if (rangoEl) {
      rangoEl.textContent = `(${formatFecha(desde)} – ${formatFecha(hasta)})`;
    }

    // Reutilizamos las reservas que refresh() ya cargó para la semana visible.
    // Así "Mis reservas" siempre coincide con la cuadrícula: nada de semanas
    // pasadas ni futuras.
    const rows = (reservas || [])
      .filter((r) => r.user_email === user.email && r.fecha >= desde && r.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (rows.length === 0) {
      myResEl.innerHTML = '<div class="empty-note">No tienes reservas en esta semana.</div>';
      return;
    }

    myResEl.innerHTML = '';
    for (const r of rows) {
      const desk = allDesks.find((d) => d.id === r.desk_id);
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

      item.appendChild(info);

      // En semanas pasadas la vista es de solo lectura: no se puede cancelar.
      if (r.fecha >= hoy) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline-danger btn-sm';
        btn.textContent = 'Cancelar';
        btn.type = 'button';
        btn.addEventListener('click', () => cancelarReserva(r.id, `${deskLabel} · ${fechaLabel}`));
        item.appendChild(btn);
      }

      myResEl.appendChild(item);
    }
  }

  function cancelarReserva(id, label) {
    cancelTarget = { ids: [id], label };
    document.getElementById('cancel-modal-text').textContent =
      `¿Seguro que quieres cancelar la reserva de ${label}? Esta acción no se puede deshacer.`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('cancel-modal')).show();
  }

  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  confirmCancelBtn.addEventListener('click', async () => {
    const modal = bootstrap.Modal.getInstance(document.getElementById('cancel-modal'));
    if (modal) modal.hide();

    if (!cancelTarget) return;
    const { ids, label } = cancelTarget;
    cancelTarget = null;

    confirmCancelBtn.disabled = true;
    const { error } = await supabaseClient.from('reservas').delete().in('id', ids);
    confirmCancelBtn.disabled = false;

    if (error) {
      showToast('No se pudo cancelar la reserva: ' + error.message, 'danger');
      return;
    }
    showToast(ids.length > 1 ? `Se cancelaron ${label}.` : `Reserva de ${label} cancelada.`);
    await refresh();
  });

  document.getElementById('cancel-modal').addEventListener('hidden.bs.modal', () => {
    if (cancelTarget) cancelTarget = null;
  });

  async function init() {
    const { y, m } = hoyCR();
    monthInput.value = `${y}-${String(m).padStart(2, '0')}`;
    actualizarVentanaReservas();
    claveVentana = `${maxMesPermitido()}|${hoyCR().d}`;
    programarMedianoche(actualizarVentanaReservas);
    populateWeeks();

    // Si el equipo se durmió o la pestaña quedó en segundo plano,
    // recalculamos al volver y cada minuto como respaldo.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) vigilarDia(actualizarVentanaReservas);
    });
    setInterval(() => vigilarDia(actualizarVentanaReservas), 60 * 1000);

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
    document.getElementById('user-avatar').textContent =
      (profile.nombre || user.email || 'U').trim().charAt(0).toUpperCase();
    if (profile.rol === 'admin') adminLink.classList.remove('d-none');

    // Sesión válida: recién aquí se muestra la interfaz
    document.body.classList.remove('pending-auth');

    btnClear.addEventListener('click', limpiarSeleccion);
    monthInput.addEventListener('change', () => {
      const max = maxMesPermitido();
      if (monthInput.value > max) monthInput.value = max;
      populateWeeks();
      refresh();
    });
    weekSelect.addEventListener('change', refresh);
    logoutBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });

    await refresh();
  }

  init();
})();
