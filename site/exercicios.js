(() => {
  const breathingStart = document.getElementById('startBreathing');
  const breathingStop = document.getElementById('stopBreathing');
  const breathingInstruction = document.getElementById('breathingInstruction');
  const breathingCircle = document.getElementById('breathingCircle');
  const breathingTimer = document.getElementById('breathingTimer');
  if (breathingStart && breathingStop && breathingInstruction && breathingCircle && breathingTimer) {
    let breathingInterval;
    let remaining = 60;
    let phaseSeconds = 0;
    let inhale = true;

    const finishBreathing = (completed) => {
      window.clearInterval(breathingInterval);
      breathingStart.disabled = false;
      breathingStop.disabled = true;
      breathingCircle.classList.remove('breathing-in', 'breathing-out');
      breathingCircle.textContent = completed ? 'Muito bem!' : 'Pausa';
      breathingInstruction.textContent = completed
        ? 'Você terminou esta pausa. Volte ao seu ritmo normal de respiração.'
        : 'Respire normalmente. Você pode tentar novamente quando quiser.';
      breathingTimer.textContent = completed ? 'Concluído' : 'Interrompido';
    };

    breathingStart.addEventListener('click', () => {
      window.clearInterval(breathingInterval);
      remaining = 60;
      phaseSeconds = 0;
      inhale = true;
      breathingStart.disabled = true;
      breathingStop.disabled = false;
      breathingCircle.classList.add('breathing-in');
      breathingCircle.textContent = 'Inspire suavemente';
      breathingInstruction.textContent = 'Sem prender o ar. Se não estiver confortável, pare.';
      breathingTimer.textContent = '1:00';

      breathingInterval = window.setInterval(() => {
        remaining -= 1;
        phaseSeconds += 1;
        breathingTimer.textContent = `0:${String(remaining).padStart(2, '0')}`;
        if (phaseSeconds >= (inhale ? 4 : 6)) {
          inhale = !inhale;
          phaseSeconds = 0;
          breathingCircle.classList.toggle('breathing-in', inhale);
          breathingCircle.classList.toggle('breathing-out', !inhale);
          breathingCircle.textContent = inhale ? 'Inspire suavemente' : 'Expire devagar';
          breathingInstruction.textContent = inhale
            ? 'Puxe o ar sem esforço, no seu ritmo.'
            : 'Solte o ar com calma. Não precisa esvaziar os pulmões.';
        }
        if (remaining <= 0) finishBreathing(true);
      }, 1000);
    });

    breathingStop.addEventListener('click', () => finishBreathing(false));
  }

  const groundingList = document.querySelector('.grounding-list');
  const groundingFeedback = document.getElementById('groundingFeedback');
  const resetGrounding = document.getElementById('resetGrounding');
  if (groundingList && groundingFeedback && resetGrounding) {
    const steps = Array.from(groundingList.querySelectorAll('li'));
    steps.forEach((step) => {
      step.setAttribute('tabindex', '0');
      step.setAttribute('role', 'checkbox');
      step.setAttribute('aria-checked', 'false');

      const toggleStep = () => {
        const complete = step.classList.toggle('completed');
        step.setAttribute('aria-checked', String(complete));
        const completedCount = steps.filter((item) => item.classList.contains('completed')).length;
        groundingFeedback.textContent = completedCount === steps.length
          ? 'Você concluiu as etapas. Obrigado por reservar este momento para si.'
          : `${completedCount} de ${steps.length} etapas concluídas. Siga no seu ritmo.`;
      };

      step.addEventListener('click', toggleStep);
      step.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleStep();
        }
      });
    });

    resetGrounding.addEventListener('click', () => {
      steps.forEach((step) => {
        step.classList.remove('completed');
        step.setAttribute('aria-checked', 'false');
      });
      groundingFeedback.textContent = 'Marque cada etapa quando terminar, sem pressa.';
    });
  }

  const urgeLevel = document.getElementById('urgeLevel');
  const urgeValue = document.getElementById('urgeValue');
  if (urgeLevel && urgeValue) {
    urgeLevel.addEventListener('input', () => {
      urgeValue.value = `${urgeLevel.value} de 10`;
      urgeValue.textContent = `${urgeLevel.value} de 10`;
    });
  }

  const urgeFeedback = document.getElementById('urgeFeedback');
  document.querySelectorAll('.urge-prompt').forEach((button) => {
    button.addEventListener('click', () => {
      if (urgeFeedback) urgeFeedback.textContent = button.dataset.prompt;
    });
  });

  const urgeTimerButton = document.getElementById('startUrgeTimer');
  const urgeTimer = document.getElementById('urgeTimer');
  if (urgeTimerButton && urgeTimer) {
    let timer;
    let remaining = 120;
    urgeTimerButton.addEventListener('click', () => {
      window.clearInterval(timer);
      remaining = 120;
      urgeTimerButton.disabled = true;
      urgeTimerButton.textContent = 'Pausa em andamento…';
      urgeTimer.textContent = '2:00 restantes';
      if (urgeFeedback) urgeFeedback.textContent = 'Observe a vontade sem se julgar. Escolha algo seguro para fazer enquanto a pausa passa.';

      timer = window.setInterval(() => {
        remaining -= 1;
        urgeTimer.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} restantes`;
        if (remaining <= 0) {
          window.clearInterval(timer);
          urgeTimerButton.disabled = false;
          urgeTimerButton.textContent = 'Fazer outra pausa de 2 minutos';
          urgeTimer.textContent = 'Pausa concluída.';
          if (urgeFeedback) urgeFeedback.textContent = 'Confira como você está agora. Se quiser, ajuste a escala ou converse com alguém de confiança.';
        }
      }, 1000);
    });
  }
})();
