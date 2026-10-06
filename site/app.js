const state = {
  theme: 'dark',
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  selectedDate: new Date().toISOString().slice(0, 10),
  checkins: [],
  assessments: [],
  memoryCards: [],
  memoryFlipped: [],
  memoryMatched: [],
  moves: 0,
};

const STORAGE_KEY = 'rumoData';
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
const themeIcon = document.querySelector('.theme-icon');
const calendarGrid = document.getElementById('calendarGrid');
const monthLabel = document.getElementById('monthLabel');
const selectedDateLabel = document.getElementById('selectedDateLabel');
const checkinResponse = document.getElementById('checkinResponse');
const assessmentForm = document.getElementById('assessmentForm');
const assessmentResult = document.getElementById('assessmentResult');
const assessmentMessage = document.getElementById('assessmentMessage');
const goalProgressBar = document.getElementById('goalProgressBar');
const dailyGoalText = document.getElementById('dailyGoalText');
const memoryGame = document.getElementById('memoryGame');
const movesCount = document.getElementById('movesCount');
const brainQuestion = document.getElementById('brainQuestion');
const brainFeedback = document.getElementById('brainFeedback');
const numberGame = document.getElementById('numberGame');
const numberFeedback = document.getElementById('numberFeedback');
const wordGame = document.getElementById('wordGame');
const wordFeedback = document.getElementById('wordFeedback');

function saveData() {
  const data = {
    theme: state.theme,
    checkins: state.checkins,
    assessments: state.assessments
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  state.theme = theme;
  const isDark = theme === 'dark';
  themeLabel.textContent = isDark ? 'Modo escuro' : 'Modo claro';
  themeIcon.textContent = isDark ? '☾' : '☀';
  themeToggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
}

function loadData() {
  try {
    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const oldSettings = JSON.parse(localStorage.getItem('rumoSettings') || '{}');
    const oldCheckins = JSON.parse(localStorage.getItem('rumoCheckins') || '[]');
    const oldAssessments = JSON.parse(localStorage.getItem('rumoAssessments') || '[]');

    state.theme = savedData.theme || oldSettings.theme || 'dark';
    state.checkins = Array.isArray(savedData.checkins) ? savedData.checkins : oldCheckins;
    state.assessments = Array.isArray(savedData.assessments) ? savedData.assessments : oldAssessments;
  } catch {
    state.theme = 'dark';
    state.checkins = [];
    state.assessments = [];
  }

  setTheme(state.theme);
  saveData();
}

function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderCalendar() {
  calendarGrid.innerHTML = '';
  const today = new Date();
  const firstDay = new Date(state.year, state.month, 1);
  const startWeekDay = firstDay.getDay();
  const totalDays = new Date(state.year, state.month + 1, 0).getDate();
  const prevMonthDays = new Date(state.year, state.month, 0).getDate();

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  weekDays.forEach((day) => {
    const name = document.createElement('div');
    name.className = 'day-name';
    name.textContent = day;
    calendarGrid.appendChild(name);
  });

  for (let i = 1; i <= startWeekDay; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day muted';
    cell.textContent = prevMonthDays - startWeekDay + i;
    calendarGrid.appendChild(cell);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const cell = document.createElement('button');
    const currentDate = new Date(state.year, state.month, day);
    const dateString = currentDate.toISOString().slice(0, 10);
    const isToday = currentDate.toDateString() === today.toDateString();
    const isSelected = state.selectedDate === dateString;
    const exists = state.checkins.some((entry) => entry.date === dateString);

    cell.type = 'button';
    cell.className = 'calendar-day';
    if (isToday) cell.classList.add('today');
    if (isSelected) cell.classList.add('selected');
    if (exists) cell.classList.add('has-checkin');
    cell.textContent = day;
    cell.addEventListener('click', () => {
      state.selectedDate = dateString;
      renderCalendar();
      renderCheckinCard();
    });
    calendarGrid.appendChild(cell);
  }

  monthLabel.textContent = new Date(state.year, state.month).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

function renderCheckinCard() {
  const selectedDate = state.selectedDate;
  const formatted = formatDate(selectedDate);
  selectedDateLabel.textContent = `Data selecionada: ${formatted}`;

  const checkin = state.checkins.find((entry) => entry.date === selectedDate);

  if (!checkin) {
    checkinResponse.className = 'checkin-response empty';
    checkinResponse.textContent = 'Sua resposta aparecerá aqui com apoio e técnicas.';
    return;
  }

  if (Number(checkin.smoked_today) === 1) {
    checkinResponse.className = 'checkin-response';
    checkinResponse.innerHTML = `
      <strong>Frase motivacional:</strong><br>
      ${checkin.message || 'Você não precisa desistir. Cada dia é uma nova chance de recomeçar.'}
    `;
    return;
  }

  checkinResponse.className = 'checkin-response';
  checkinResponse.innerHTML = `
    <strong>Técnicas para aliviar sintomas da nicotina:</strong><br>
    ${checkin.tips || 'Hidratação, caminhada curta, chá de hortelã, respiração profunda e distração com música ou água.'}
  `;
}

function updateMetaProgress() {
  const checkins = state.checkins.filter((entry) => Number(entry.smoked_today) === 0);
  const progress = Math.min(Math.round((checkins.length / 7) * 100), 100);
  goalProgressBar.style.width = `${progress}%`;
  dailyGoalText.textContent = `${progress}% da meta`;
}

function loadCheckins() {
  renderCalendar();
  renderCheckinCard();
  updateMetaProgress();
}

function saveCheckin(smokedToday) {
  const message = smokedToday
    ? 'Você já passou por dias difíceis antes e isso não define o seu valor. Cada passo conta.'
    : 'Parabéns por escolher cuidar de si. Respire fundo, beba água e mantenha o foco.';
  const tips = smokedToday
    ? 'Técnicas úteis: beba água, respire por 4 segundos e expire por 6, dê um passo para fora da rotina, e ligue para alguém de confiança.'
    : 'Para aliviar sintomas da nicotina: caminhe 10 minutos, tome água, chupe gelo, use hortelã, ou faça respiração profunda por 5 minutos.';

  const existing = state.checkins.find((entry) => entry.date === state.selectedDate);
  const checkin = {
    date: state.selectedDate,
    smoked_today: smokedToday ? 1 : 0,
    message,
    tips
  };

  if (existing) {
    Object.assign(existing, checkin);
  } else {
    state.checkins.push(checkin);
  }

  saveData();
  renderCalendar();
  renderCheckinCard();
  updateMetaProgress();
}

function setupAssessment() {
  assessmentForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const answers = {};
    let score = 0;
    const questions = Array.from(document.querySelectorAll('.question input[type="radio"]'));

    questions.forEach((radio) => {
      const key = radio.name;
      if (radio.checked) {
        answers[key] = radio.value;
        score += Number(radio.value);
      }
    });

    if (Object.keys(answers).length !== 5) {
      assessmentMessage.textContent = 'Responda todas as perguntas antes de continuar.';
      assessmentResult.classList.remove('hidden');
      return;
    }

    let level = 'Baixa';
    if (score >= 4) {
      level = 'Muita ajuda';
    } else if (score >= 2) {
      level = 'Pouca ajuda';
    }

    const message =
      level === 'Muita ajuda'
        ? 'Seu retorno indica que pode ser importante pedir apoio de um adulto, professor ou profissional de saúde. Você não precisa lidar com isso sozinho.'
        : level === 'Pouca ajuda'
          ? 'Você está com sinais moderados. Acompanhe sua rotina e procure conversas abertas com alguém de confiança.'
          : 'Seu quadro parece mais estável neste momento; continue com hábitos saudáveis e atenção aos sinais do dia a dia.';

    assessmentMessage.textContent = `${message} Nível: ${level}.`;
    assessmentResult.classList.remove('hidden');

    state.assessments.unshift({
      score,
      level,
      answers,
      createdAt: new Date().toISOString()
    });
    state.assessments = state.assessments.slice(0, 10);
    saveData();
  });
}

function initMemoryGame() {
  const icons = ['🌱', '🧠', '💪', '🌊', '🚭', '💙'];
  state.memoryCards = [...icons, ...icons].sort(() => Math.random() - 0.5);
  state.memoryFlipped = [];
  state.memoryMatched = [];
  state.moves = 0;
  movesCount.textContent = '0';
  memoryGame.innerHTML = '';

  state.memoryCards.forEach((icon, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'memory-card';
    card.dataset.icon = icon;
    card.dataset.index = index;
    card.textContent = '?';
    card.addEventListener('click', () => handleMemoryClick(card, icon));
    memoryGame.appendChild(card);
  });
}

function handleMemoryClick(card, icon) {
  if (
    state.memoryFlipped.includes(card) ||
    state.memoryMatched.includes(card) ||
    state.memoryFlipped.length >= 2
  ) {
    return;
  }

  card.textContent = icon;
  card.classList.add('flipped');
  state.memoryFlipped.push(card);

  if (state.memoryFlipped.length === 2) {
    state.moves += 1;
    movesCount.textContent = String(state.moves);

    const [first, second] = state.memoryFlipped;
    if (first.dataset.icon === second.dataset.icon) {
      state.memoryMatched.push(first, second);
      setTimeout(() => {
        first.classList.add('matched');
        second.classList.add('matched');
        state.memoryFlipped = [];
        if (state.memoryMatched.length === state.memoryCards.length) {
          brainFeedback.textContent = 'Parabéns! Você venceu o jogo mental e manteve o foco.';
        }
      }, 400);
    } else {
      setTimeout(() => {
        first.textContent = '?';
        second.textContent = '?';
        first.classList.remove('flipped');
        second.classList.remove('flipped');
        state.memoryFlipped = [];
      }, 600);
    }
  }
}

function setupBrainChallenge() {
  document.querySelectorAll('.brain-option').forEach((button) => {
    button.addEventListener('click', () => {
      const answer = button.dataset.answer === '1';
      brainFeedback.textContent = answer
        ? 'Correto! Foco é uma escolha diária que fortalece a mente.'
        : 'Tente novamente. A resposta certa é “foco”.';
    });
  });
}

function setupNumberGame() {
  const sequence = [3, 7, 2, 9];
  const options = [3, 7, 2, 9, 5];
  let current = 0;

  numberGame.innerHTML = `
    <p>Ordem: ${sequence.join(' · ')}</p>
    <div class="number-options"></div>
  `;
  const optionContainer = numberGame.querySelector('.number-options');
  options.forEach((option) => {
    const button = document.createElement('button');
    button.className = 'number-option';
    button.textContent = option;
    button.addEventListener('click', () => {
      if (option === sequence[current]) {
        button.classList.add('correct');
        current += 1;
        numberFeedback.textContent = `${current} de ${sequence.length} correto${current === sequence.length ? '!' : ''}`;
        if (current === sequence.length) {
          numberFeedback.textContent = 'Ordem concluída! Você treinou seu raciocínio.';
        }
      } else {
        numberFeedback.textContent = 'Não é esse número. Tente novamente.';
        current = 0;
      }
    });
    optionContainer.appendChild(button);
  });
}

function setupWordGame() {
  const word = { scrambled: 'HONOS', answer: 'SONHO' };
  const options = ['SONHO', 'HOSNO', 'HONOS', 'NOHOS'];

  wordGame.innerHTML = `
    <p>Palavra: ${word.scrambled}</p>
    <div class="word-options"></div>
  `;
  const optionContainer = wordGame.querySelector('.word-options');
  options.forEach((option) => {
    const button = document.createElement('button');
    button.className = 'word-option';
    button.textContent = option;
    button.addEventListener('click', () => {
      const correct = option === word.answer;
      button.classList.toggle('correct', correct);
      wordFeedback.textContent = correct
        ? 'Correto! A palavra é “SONHO”.'
        : 'Tente novamente. A palavra correta é “SONHO”.';
    });
    optionContainer.appendChild(button);
  });
}

function setupCalendarActions() {
  document.getElementById('prevMonth').addEventListener('click', () => {
    state.month -= 1;
    if (state.month < 0) {
      state.month = 11;
      state.year -= 1;
    }
    renderCalendar();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    state.month += 1;
    if (state.month > 11) {
      state.month = 0;
      state.year += 1;
    }
    renderCalendar();
  });

  document.querySelectorAll('[data-smoked]').forEach((button) => {
    button.addEventListener('click', () => {
      const smokedToday = button.dataset.smoked === '1';
      saveCheckin(smokedToday);
    });
  });
}

themeToggle.addEventListener('click', () => {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
  saveData();
});

loadData();
setupAssessment();
setupCalendarActions();
setupBrainChallenge();
setupNumberGame();
setupWordGame();
initMemoryGame();
loadCheckins();
