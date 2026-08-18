const sexToggle = document.getElementById('sex-toggle');
const goalToggle = document.getElementById('goal-toggle');
const weightInput = document.getElementById('weight');
const waterAmountEl = document.getElementById('water-amount');

let sex = 'female';
let goal = 'maintain';

function setupSegmented(container, onChange) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment');
    if (!btn) return;
    container.querySelectorAll('.segment').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    onChange(btn.dataset.value);
  });
}

setupSegmented(sexToggle, (value) => { sex = value; });
setupSegmented(goalToggle, (value) => { goal = value; });

const GOAL_CONFIG = {
  cut: { calorieAdjust: -0.20, proteinPerKg: 2.2, fatPct: 0.30, note: 'Déficit calórico de 20% com proteína alta para preservar massa muscular durante o emagrecimento.' },
  maintain: { calorieAdjust: 0, proteinPerKg: 1.8, fatPct: 0.28, note: 'Calorias de manutenção com distribuição equilibrada para sustentar performance e recuperação.' },
  bulk: { calorieAdjust: 0.15, proteinPerKg: 2.0, fatPct: 0.25, note: 'Superávit calórico de 15% priorizando carboidratos para energia e ganho de massa muscular.' },
};

function calculateBMR(sex, weight, height, age) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

function updateWater(weight) {
  const liters = (weight * 0.035).toFixed(1);
  waterAmountEl.textContent = liters;
}

weightInput.addEventListener('input', () => {
  const w = parseFloat(weightInput.value);
  if (!isNaN(w) && w > 0) updateWater(w);
});

document.getElementById('calc-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const age = parseFloat(document.getElementById('age').value);
  const weight = parseFloat(document.getElementById('weight').value);
  const height = parseFloat(document.getElementById('height').value);
  const activity = parseFloat(document.getElementById('activity').value);

  const bmr = calculateBMR(sex, weight, height, age);
  const maintenance = bmr * activity;
  const config = GOAL_CONFIG[goal];
  const tdee = Math.round(maintenance * (1 + config.calorieAdjust));

  const proteinG = Math.round(config.proteinPerKg * weight);
  const proteinKcal = proteinG * 4;

  const fatKcal = Math.round(tdee * config.fatPct);
  const fatG = Math.round(fatKcal / 9);

  const carbsKcal = Math.max(tdee - proteinKcal - fatKcal, 0);
  const carbsG = Math.round(carbsKcal / 4);

  document.getElementById('tdee-value').textContent = tdee.toLocaleString('pt-BR');

  document.getElementById('protein-g').textContent = proteinG;
  document.getElementById('protein-kcal').textContent = proteinKcal.toLocaleString('pt-BR');
  document.getElementById('carbs-g').textContent = carbsG;
  document.getElementById('carbs-kcal').textContent = carbsKcal.toLocaleString('pt-BR');
  document.getElementById('fat-g').textContent = fatG;
  document.getElementById('fat-kcal').textContent = fatKcal.toLocaleString('pt-BR');

  const totalKcal = proteinKcal + carbsKcal + fatKcal;
  requestAnimationFrame(() => {
    document.getElementById('protein-bar').style.width = (proteinKcal / totalKcal * 100) + '%';
    document.getElementById('carbs-bar').style.width = (carbsKcal / totalKcal * 100) + '%';
    document.getElementById('fat-bar').style.width = (fatKcal / totalKcal * 100) + '%';
  });

  document.getElementById('result-note').textContent = config.note;
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  updateWater(weight);
});

updateWater(parseFloat(weightInput.value));
