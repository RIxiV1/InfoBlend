/**
 * InfoBlend — Command Palette
 * Ctrl+K interface. Injected dynamically on first trigger.
 */
(() => {
  if (window.__ib?._paletteLoaded && typeof window.__ib.togglePalette === 'function') return;

  const ib = window.__ib;
  ib._paletteLoaded = true;

  let paletteHost = null;

  function togglePalette() {
    if (paletteHost) {
      paletteHost.remove();
      paletteHost = null;
      return;
    }

    const { host, shadow } = ib.createShadowHost('infoblend-palette-host', ['overlay/overlay.css']);
    paletteHost = host;

    const overlayBg = document.createElement('div');
    overlayBg.className = 'ib-palette-overlay';

    // Theme: read from the eager cache populated in contentScript.js. This avoids
    // the FOUC where the palette flashed in the wrong theme for ~10-50ms while
    // chrome.storage resolved. The cache is kept in sync via storage.onChanged.
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const cached = ib._settings?.theme;
    const theme = cached || 'system';
    const isDark = theme === 'dark' || (theme === 'system' && systemDark);
    if (!isDark) overlayBg.classList.add('ib-light-theme');
    // Belt-and-suspenders: if the cache wasn't populated yet (palette opened
    // before the bootstrap storage call resolved), correct on next tick.
    if (cached === undefined) {
      ib.getStorage(['theme']).then(settings => {
        const t = settings.theme || 'system';
        const dark = t === 'dark' || (t === 'system' && systemDark);
        overlayBg.classList.toggle('ib-light-theme', !dark);
      });
    }

    overlayBg.onclick = () => togglePalette();

    const paletteDiv = document.createElement('div');
    paletteDiv.className = 'ib-palette';
    paletteDiv.onclick = (e) => e.stopPropagation();

    // Search bar
    const searchArea = document.createElement('div');
    searchArea.className = 'ib-palette-search';
    const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchIcon.setAttribute('width', '18');
    searchIcon.setAttribute('height', '18');
    searchIcon.setAttribute('viewBox', '0 0 24 24');
    searchIcon.setAttribute('fill', 'none');
    searchIcon.setAttribute('stroke', 'currentColor');
    searchIcon.setAttribute('stroke-width', '2');
    searchIcon.setAttribute('stroke-linecap', 'round');
    searchIcon.setAttribute('stroke-linejoin', 'round');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '8');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '21');
    line.setAttribute('y1', '21');
    line.setAttribute('x2', '16.65');
    line.setAttribute('y2', '16.65');
    searchIcon.appendChild(circle);
    searchIcon.appendChild(line);
    searchArea.appendChild(searchIcon);

    const input = document.createElement('input');
    input.className = 'ib-palette-input';
    input.placeholder = 'Search commands or define a word...';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'ib-palette-listbox');
    input.setAttribute('aria-label', 'Search commands or define a word');
    searchArea.appendChild(input);

    const resultsArea = document.createElement('div');
    resultsArea.className = 'ib-palette-results';
    resultsArea.id = 'ib-palette-listbox';
    resultsArea.setAttribute('role', 'listbox');

    const commands = [
      { id: 'summarize', label: 'Summarize Page', hint: 'Enter' },
      { id: 'define', label: 'Define...', hint: 'Type word' }
    ];

    let selectedIndex = 0;

    const renderResults = (filter = '') => {
      resultsArea.innerHTML = '';
      const filtered = commands.filter(c =>
        c.label.toLowerCase().includes(filter.toLowerCase()) ||
        filter.startsWith('define ')
      );

      if (filter.startsWith('define ')) {
        const word = filter.replace('define ', '').trim();
        if (word) filtered.unshift({ id: 'define-word', label: `Define "${word}"`, hint: 'Enter', word });
      } else if (filter && !filtered.length) {
        filtered.push({ id: 'define-word', label: `Define "${filter}"`, hint: 'Enter', word: filter });
      }

      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'ib-palette-empty';
        empty.innerHTML = `
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>No matching commands</span>
        `;
        resultsArea.appendChild(empty);
        input.removeAttribute('aria-activedescendant');
        return filtered;
      }

      filtered.forEach((cmd, i) => {
        const item = document.createElement('div');
        const isSelected = i === selectedIndex;
        item.className = `ib-palette-item ${isSelected ? 'selected' : ''}`;
        item.id = `ib-palette-opt-${i}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(isSelected));

        const left = document.createElement('div');
        left.className = 'ib-palette-item-left';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'ib-palette-label';
        labelSpan.textContent = cmd.label;
        left.appendChild(labelSpan);

        const hintSpan = document.createElement('span');
        hintSpan.className = 'ib-palette-hint';
        hintSpan.textContent = cmd.hint;

        item.appendChild(left);
        item.appendChild(hintSpan);
        item.onclick = () => executeCommand(cmd);
        resultsArea.appendChild(item);

        if (isSelected) {
          item.scrollIntoView({ block: 'nearest' });
          input.setAttribute('aria-activedescendant', item.id);
        }
      });
      if (!filtered.length) input.removeAttribute('aria-activedescendant');
      return filtered;
    };

    let currentFiltered = renderResults();

    const executeCommand = (cmd) => {
      if (cmd.id === 'define') {
        input.value = 'define ';
        input.focus();
        selectedIndex = 0;
        currentFiltered = renderResults(input.value);
        return;
      }

      togglePalette();
      // Palette interactions are inherently keyboard-driven — pass the
      // flag through so the resulting overlay auto-focuses its first
      // button instead of leaving the user stranded after Ctrl+K → Enter.
      if (cmd.id === 'summarize') {
        ib.handlePageSummarization({ viaKeyboard: true });
      } else if (cmd.id === 'define-word') {
        ib.showLoadingOverlay({ mode: 'panel', viaKeyboard: true });
        ib.sendMessage({ type: ib.MSG.FETCH_DEFINITION, word: cmd.word }, (response) => {
          if (response?.success) ib.updateOverlay(response.data.title, response.data.content, response.data.source, response.data);
        });
      }
    };

    input.oninput = (e) => {
      selectedIndex = 0;
      currentFiltered = renderResults(e.target.value);
    };

    input.onkeydown = (e) => {
      // Escape must work even when results are empty — handle it before the length guard
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (!currentFiltered.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % currentFiltered.length;
        currentFiltered = renderResults(input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + currentFiltered.length) % currentFiltered.length;
        currentFiltered = renderResults(input.value);
      } else if (e.key === 'Enter') {
        if (currentFiltered[selectedIndex]) executeCommand(currentFiltered[selectedIndex]);
      }
    };

    paletteDiv.appendChild(searchArea);
    paletteDiv.appendChild(resultsArea);

    const footer = document.createElement('div');
    footer.className = 'ib-palette-footer';
    [
      ['\u2191\u2193', 'navigate'],
      ['\u21B5', 'select'],
      ['esc', 'close']
    ].forEach(([key, desc]) => {
      const hint = document.createElement('div');
      hint.className = 'ib-key-hint';
      const keyBox = document.createElement('span');
      keyBox.className = 'ib-key-box';
      keyBox.textContent = key;
      hint.appendChild(keyBox);
      hint.appendChild(document.createTextNode(` ${desc}`));
      footer.appendChild(hint);
    });
    paletteDiv.appendChild(footer);

    overlayBg.appendChild(paletteDiv);
    shadow.appendChild(overlayBg);

    requestAnimationFrame(() => input.focus());
  }

  ib.togglePalette = togglePalette;
})();
