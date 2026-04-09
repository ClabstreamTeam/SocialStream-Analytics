(() => {
  const root = document.querySelector('[data-pricing]');
  if (!root) return;

  const buttons = Array.from(document.querySelectorAll('.billing-btn'));
  const prices = Array.from(document.querySelectorAll('.price'));

  const applyBilling = (mode) => {
    root.dataset.pricing = mode;
    buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.billing === mode));
    prices.forEach(el => {
      const v = el.dataset[mode];
      if (v) el.textContent = v;
    });
  };

  buttons.forEach(btn => btn.addEventListener('click', () => applyBilling(btn.dataset.billing)));
  applyBilling('monthly');
})();
