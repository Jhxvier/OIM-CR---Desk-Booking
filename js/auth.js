(() => {
  if (!window.supabase) {
    alert('No se pudo cargar el cliente de Supabase. Revisa tu conexión.');
  }

  const emailForm = document.getElementById('email-form');
  const otpForm = document.getElementById('otp-form');
  const backBtn = document.getElementById('back-btn');
  const emailInput = document.getElementById('email');
  const otpInput = document.getElementById('otp');
  const emailMsg = document.getElementById('email-msg');
  const otpMsg = document.getElementById('otp-msg');
  const loadingMsg = document.getElementById('loading-msg');

  let currentEmail = '';

  const show = (elm) => elm.classList.remove('d-none');
  const hide = (elm) => elm.classList.add('d-none');

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(emailMsg);
    const email = emailInput.value.trim().toLowerCase();
    if (!email) return;

    loadingMsg.textContent = 'Comprobando email…';
    show(loadingMsg);
    hide(emailForm);

    try {
      const { data } = await supabaseClient.rpc('check_email_authorized', { target_email: email });
      if (!data) {
        hide(loadingMsg);
        show(emailForm);
        emailMsg.textContent = 'Este email no está autorizado.';
        show(emailMsg);
        return;
      }
      await requestCode(email);
    } catch (err) {
      console.error(err);
      hide(loadingMsg);
      show(emailForm);
      emailMsg.textContent = err.message || 'Error al comprobar el email. Inténtalo de nuevo.';
      show(emailMsg);
    }
  });

  async function requestCode(email) {
    const { error } = await supabaseClient.auth.signInWithOtp({ email });
    if (error) {
      hide(loadingMsg);
      show(emailForm);
      emailMsg.textContent = error.message;
      show(emailMsg);
      return;
    }
    currentEmail = email;
    hide(loadingMsg);
    hide(emailForm);
    hide(otpMsg);
    otpInput.value = '';
    show(otpForm);
  }

  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(otpMsg);
    const token = otpInput.value.trim();
    if (!token) return;

    loadingMsg.textContent = 'Verificando…';
    show(loadingMsg);
    const { error } = await supabaseClient.auth.verifyOtp({ email: currentEmail, token, type: 'email' });
    hide(loadingMsg);

    if (error) {
      otpMsg.textContent = 'Código incorrecto. Inténtalo de nuevo.';
      show(otpMsg);
      return;
    }
    window.location.href = 'index.html';
  });

  backBtn.addEventListener('click', () => {
    hide(otpForm);
    hide(otpMsg);
    otpInput.value = '';
    show(emailForm);
  });
})();