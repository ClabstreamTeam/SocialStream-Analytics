(() => {
  const root = document.querySelector('[data-pricing]');
  const header = document.querySelector('.site-top');
  const reveals = Array.from(document.querySelectorAll('.reveal'));
  const tiltRoot = document.querySelector('[data-tilt-root]');
  const tiltPanel = document.querySelector('[data-tilt-panel]');
  const tiltFloats = Array.from(document.querySelectorAll('[data-tilt-float]'));
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (reveals.length) {
    reveals.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i * 70, 280)}ms`;
    });
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

  if (tiltRoot && tiltPanel && !prefersReduced) {
    const handleMove = (ev) => {
      const rect = tiltRoot.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) - 0.5;
      const y = ((ev.clientY - rect.top) / rect.height) - 0.5;
      tiltPanel.style.transform = `perspective(900px) rotateX(${(-y * 3.8).toFixed(2)}deg) rotateY(${(x * 5.2).toFixed(2)}deg)`;
      tiltFloats.forEach((el, idx) => {
        const mult = idx === 0 ? 16 : 12;
        el.style.transform = `translate3d(${(x * mult).toFixed(1)}px, ${(y * mult).toFixed(1)}px, 0)`;
      });
    };
    const resetTilt = () => {
      tiltPanel.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
      tiltFloats.forEach(el => { el.style.transform = 'translate3d(0,0,0)'; });
    };
    tiltRoot.addEventListener('mousemove', handleMove);
    tiltRoot.addEventListener('mouseleave', resetTilt);
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
