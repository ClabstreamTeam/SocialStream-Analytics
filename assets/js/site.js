(() => {
  const root = document.querySelector('[data-pricing]');
  const header = document.querySelector('.site-top');
  const reveals = Array.from(document.querySelectorAll('.reveal'));

  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (reveals.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(el => io.observe(el));
  }

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
