/**
 * InfoBlend AI — Autofill Module
 * Pattern-matches form fields and fills stored user data.
 * Dispatches native events for React/Angular/Vue compatibility.
 */
(() => {
  const ib = window.__ib;

  async function autofillForms() {
    const settings = await ib.getStorage(['autofillEnabled', 'userData']);
    if (!settings.autofillEnabled || !settings.userData) return;

    const { name, email, phone } = settings.userData;
    const inputs = document.querySelectorAll('input');
    let filledCount = 0;

    const nameRegex = /full.name|first.name|last.name|display.name|^name$|^fname$|^lname$/i;
    const emailRegex = /email|e-mail|mail.address/i;
    const phoneRegex = /phone|tel|mobile|cell/i;

    const setNativeValue = (el, value) => {
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    inputs.forEach(input => {
      if (input.value || input.type === 'hidden' || input.type === 'submit') return;

      const nameAttr = (input.name || '').toLowerCase();
      const idAttr = (input.id || '').toLowerCase();
      const labelAttr = (input.getAttribute('aria-label') || '').toLowerCase();
      const typeAttr = (input.type || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const autocomplete = (input.autocomplete || '').toLowerCase();
      const combined = nameAttr + idAttr + labelAttr + placeholder + autocomplete;

      const isName = nameRegex.test(combined) || autocomplete === 'name';
      const isEmail = typeAttr === 'email' || emailRegex.test(combined) || autocomplete === 'email';
      const isPhone = typeAttr === 'tel' || phoneRegex.test(combined) || autocomplete === 'tel';

      if (name && isName) { setNativeValue(input, name); filledCount++; }
      else if (email && isEmail) { setNativeValue(input, email); filledCount++; }
      else if (phone && isPhone) { setNativeValue(input, phone); filledCount++; }
    });

    if (filledCount > 0) console.log(`[InfoBlend AI] Autofilled ${filledCount} fields.`);
  }

  ib.autofillForms = autofillForms;
})();
