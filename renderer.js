// ─── DOM Elements ───────────────────────────────────────────────────────────
const answerText = document.getElementById('answer-text');
const loading = document.getElementById('loading');
const answerBox = document.getElementById('answer-box');
const indexIndicator = document.getElementById('index-indicator');

// ─── Show Answer ────────────────────────────────────────────────────────────
window.finder.onShowAnswer((data) => {
  loading.classList.add('hidden');
  answerText.textContent = data.text;

  // Update index indicator
  if (data.total > 1) {
    indexIndicator.textContent = `${data.index}/${data.total}`;
    indexIndicator.classList.remove('hidden');
  } else {
    indexIndicator.classList.add('hidden');
  }

  // Trigger fade-in
  answerBox.classList.remove('fade-out');
  answerBox.classList.add('fade-in');
});

// ─── Clear Answer ───────────────────────────────────────────────────────────
window.finder.onClearAnswer(() => {
  answerBox.classList.remove('fade-in');
  answerBox.classList.add('fade-out');

  setTimeout(() => {
    answerText.textContent = '';
    indexIndicator.classList.add('hidden');
    answerBox.classList.remove('fade-out');
  }, 300);
});

// ─── Show Loading ───────────────────────────────────────────────────────────
window.finder.onShowLoading(() => {
  answerText.textContent = '';
  indexIndicator.classList.add('hidden');
  loading.classList.remove('hidden');
  answerBox.classList.remove('fade-out');
  answerBox.classList.add('fade-in');
});

// ─── Scroll Content ──────────────────────────────────────────────────────────
window.finder.onScrollContent((direction) => {
  const scrollAmount = 65; // Adjust the scroll distance per keypress
  
  if (direction === 'up') {
    answerText.scrollTop -= scrollAmount;
  } else {
    answerText.scrollTop += scrollAmount;
  }
});

// ─── Toggle Theme ───────────────────────────────────────────────────────────
window.finder.onToggleTheme(() => {
  document.body.classList.toggle('light-theme');
});
