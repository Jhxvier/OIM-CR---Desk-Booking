window.DesksApp = (() => {
  const ZONE_PALETTE = [
    { bg: 'rgba(59, 130, 246, 0.10)', border: 'rgba(59, 130, 246, 0.40)' },
    { bg: 'rgba(16, 185, 129, 0.10)', border: 'rgba(16, 185, 129, 0.40)' },
    { bg: 'rgba(217, 119, 6, 0.10)', border: 'rgba(217, 119, 6, 0.40)' },
    { bg: 'rgba(139, 92, 246, 0.10)', border: 'rgba(139, 92, 246, 0.40)' },
    { bg: 'rgba(236, 72, 153, 0.10)', border: 'rgba(236, 72, 153, 0.40)' },
    { bg: 'rgba(14, 165, 233, 0.10)', border: 'rgba(14, 165, 233, 0.40)' }
  ];

  async function loadMapData(fecha) {
    const [desksRes, reservasRes] = await Promise.all([
      supabaseClient
        .from('desks')
        .select('*')
        .eq('activo', true)
        .order('pos_y', { ascending: true })
        .order('pos_x', { ascending: true }),
      supabaseClient
        .from('reservas')
        .select('id, desk_id, user_email, user_nombre')
        .eq('fecha', fecha)
    ]);

    if (desksRes.error) throw desksRes.error;
    if (reservasRes.error) throw reservasRes.error;

    return { desks: desksRes.data || [], reservas: reservasRes.data || [] };
  }

  function renderMap(mapEl, desks, reservas, opts = {}) {
    const { onSelect, selectedDeskId } = opts;
    mapEl.innerHTML = '';

    const taken = new Map(reservas.map((r) => [r.desk_id, r]));

    const byZone = {};
    const zoneMinY = {};
    desks.forEach((d) => {
      (byZone[d.zona] = byZone[d.zona] || []).push(d);
      zoneMinY[d.zona] = Math.min(zoneMinY[d.zona] ?? Infinity, d.pos_y);
    });

    const zones = Object.keys(byZone).sort((a, b) => zoneMinY[a] - zoneMinY[b]);

    zones.forEach((zona, zi) => {
      const palette = ZONE_PALETTE[zi % ZONE_PALETTE.length];

      const block = document.createElement('div');
      block.className = 'zone-block';
      block.style.background = palette.bg;
      block.style.borderColor = palette.border;

      const title = document.createElement('div');
      title.className = 'zone-title';
      title.textContent = zona;

      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'zone-rows';

      const byRow = {};
      byZone[zona].forEach((d) => {
        (byRow[d.pos_y] = byRow[d.pos_y] || []).push(d);
      });

      const rows = Object.keys(byRow).map(Number).sort((a, b) => a - b);
      for (const y of rows) {
        const row = document.createElement('div');
        row.className = 'zone-row';
        byRow[y]
          .slice()
          .sort((a, b) => a.pos_x - b.pos_x)
          .forEach((desk) => {
            row.appendChild(makeDesk(desk, taken.get(desk.id), { onSelect, selectedDeskId }));
          });
        rowsWrap.appendChild(row);
      }

      block.appendChild(title);
      block.appendChild(rowsWrap);
      mapEl.appendChild(block);
    });
  }

  function makeDesk(desk, res, { onSelect, selectedDeskId }) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'desk';
    if (res) el.classList.add('taken');
    if (selectedDeskId === desk.id) el.classList.add('selected');

    const name = document.createElement('span');
    name.className = 'desk-name';
    name.textContent = desk.nombre;
    el.appendChild(name);

    if (res) {
      const who = document.createElement('span');
      who.className = 'desk-who';
      who.textContent = res.user_nombre || res.user_email;
      el.appendChild(who);
    }

    el.title = res ? `Ocupado por ${res.user_nombre || res.user_email}` : 'Disponible';
    el.addEventListener('click', () => onSelect && onSelect(desk));
    return el;
  }

  return { loadMapData, renderMap };
})();