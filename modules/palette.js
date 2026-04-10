/**
 * InfoBlend AI — Command Palette
 * Ctrl+K interface. Injected dynamically on first trigger.
 */
(() => {
  if (window.__ib?._paletteLoaded) return;

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

    // Theme (synchronous — reads cached value via matchMedia fallback)
    ib.getStorage(['theme']).then(settings => {
      const theme = settings.theme || 'dark';
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (!isDark) overlayBg.classList.add('ib-light-theme');
    });

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
    searchArea.appendChild(input);

    const resultsArea = document.createElement('div');
    resultsArea.className = 'ib-palette-results';

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
        empty.textContent = 'No matching commands';
        resultsArea.appendChild(empty);
        return filtered;
      }

      filtered.forEach((cmd, i) => {
        const item = document.createElement('div');
        item.className = `ib-palette-item ${i === selectedIndex ? 'selected' : ''}`;

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

        if (i === selectedIndex) item.scrollIntoView({ block: 'nearest' });
      });
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
      if (cmd.id === 'summarize') {
        ib.handlePageSummarization();
      } else if (cmd.id === 'define-word') {
        ib.showLoadingOverlay();
        ib.sendMessage({ type: 'FETCH_DEFINITION', word: cmd.word }, (response) => {
          if (response?.success) ib.updateOverlay(response.data.title, response.data.content, response.data.source, response.data);
        });
      }
    };

    input.oninput = (e) => {
      selectedIndex = 0;
      currentFiltered = renderResults(e.target.value);
    };

    input.onkeydown = (e) => {
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
      } else if (e.key === 'Escape') {
        togglePalette();
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
