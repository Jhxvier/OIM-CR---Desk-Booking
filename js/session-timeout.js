(() => {
  const TIMEOUT_MS = 5 * 60 * 1000;
  const WARNING_MS = 60 * 1000;
  const CHECK_INTERVAL = 10 * 1000;

  let isAdmin = false;
  let lastActive = Date.now();
  let warned = false;
  let expired = false;
  let modal = null;
  let countdownInterval = null;

  const secondsLeft = () =>
    Math.max(0, Math.ceil((TIMEOUT_MS - (Date.now() - lastActive)) / 1000));

  const stopCountdown = () => {
    clearInterval(countdownInterval);
    countdownInterval = null;
  };

  const reset = () => {
    lastActive = Date.now();
    warned = false;
    stopCountdown();
    if (modal) modal.hide();
  };

  const ACTIVITY_EVENTS = ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'];
  ACTIVITY_EVENTS.forEach((ev) =>
    document.addEventListener(ev, reset, { passive: true })
  );

  async function expires() {
    if (expired) return;
    expired = true;
    stopCountdown();
    try {
      await supabaseClient.auth.signOut();
    } catch (_) {
      /* la sesión podría ya no existir */
    }
    location.href = 'login.html';
  }

  function showWarning() {
    if (warned) return;
    warned = true;
    if (modal) modal.show();
  }

  function startCountdown() {
    const el = document.getElementById('idle-remaining');
    if (!el) return;
    const tick = () => {
      const s = secondsLeft();
      el.textContent = `La sesión se cerrará en ${s} segundo${s === 1 ? '' : 's'} por inactividad.`;
      if (s <= 0) {
        stopCountdown();
        expires();
      }
    };
    tick();
    if (countdownInterval) stopCountdown();
    countdownInterval = setInterval(tick, 1000);
  }

  function buildUi() {
    const div = document.createElement('div');
    div.className = 'modal fade';
    div.id = 'idle-modal';
    div.tabIndex = -1;
    div.setAttribute('aria-hidden', 'true');
    div.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Sesión inactiva</h5>
          </div>
          <div class="modal-body">
            <p class="mb-1">Por seguridad, la sesión se cierra tras 5 minutos sin actividad.</p>
            <p id="idle-remaining" class="mb-0 fw-semibold text-danger"></p>
          </div>
          <div class="modal-footer">
            <button type="button" id="idle-continue" class="btn btn-primary">Continuar conectado</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);

    modal = new bootstrap.Modal(div, { backdrop: 'static', keyboard: false });
    document.getElementById('idle-continue').addEventListener('click', reset);
  }

  async function init() {
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) return;

    const { data: me } = await supabaseClient
      .from('allowed_users')
      .select('rol')
      .eq('email', data.session.user.email)
      .maybeSingle()
      .catch(() => ({ data: null }));

    isAdmin = !!me && me.rol === 'admin';

    if (!isAdmin) {
      buildUi();

      setInterval(() => {
        const idle = Date.now() - lastActive;
        if (idle > TIMEOUT_MS) {
          expires();
          return;
        }
        if (!warned && idle > TIMEOUT_MS - WARNING_MS) {
          startCountdown();
          showWarning();
        } else if (idle <= TIMEOUT_MS - WARNING_MS && warned) {
          warned = false;
          stopCountdown();
        }
      }, CHECK_INTERVAL);
    }
  }

  init();
})();