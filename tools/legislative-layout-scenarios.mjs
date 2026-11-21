import assert from 'node:assert/strict';

export async function runLegislativeLayoutScenarios({ send, sessionId, navigate, evaluate, wait, input, click, clickSelector, screenshot, setTheme, pause }) {
  const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  const escape = async () => { await pause(150);await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId); };
  const customize = async label => { await clickSelector('button[aria-label="Personalizar visualização"]');await wait('document.querySelector("[role=menu]")');await click(label);await wait('!document.querySelector("[role=menu]")'); };
  const noOverflow = async () => assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'The page must not scroll horizontally');
  const waitSelector = selector => wait(`document.querySelector(${JSON.stringify(selector)})`);
  let scenarios = 0;
  const onlyWidth = Number(process.argv.find(arg => arg.startsWith('--width='))?.split('=')[1]);
  for (const [width, height] of [[390, 844], [1440, 900], [1920, 1080]].filter(([width])=>!onlyWidth||width===onlyWidth)) for (const theme of ['light', 'dark']) {
    setTheme(theme);await viewport(width, height);await navigate('/camara/64');
    await evaluate('localStorage.clear();window.dispatchEvent(new StorageEvent("storage",{key:null}))');
    await wait('document.querySelectorAll(".legislative-metrics dd").length===6');await noOverflow();
    assert.equal(await evaluate('document.querySelectorAll("input[type=date],select").length'), 0, 'Advanced fields start closed');
    assert.equal(await evaluate('document.querySelectorAll(".legislative-distribution-panel").length'), 0, 'Technical charts are optional');
    assert.ok(await evaluate('document.querySelector(".legislative-matter-card").getBoundingClientRect().top < innerHeight*.8'), 'The first proposal must appear in the initial viewport');
    if (width >= 1200) assert.ok(await evaluate('(()=>{const main=document.querySelector("main"),r=main.getBoundingClientRect(),s=getComputedStyle(main);return r.left+parseFloat(s.paddingLeft)<=64&&innerWidth-r.right+parseFloat(s.paddingRight)<=64})()'));
    assert.equal(await evaluate('document.querySelectorAll(".legislative-metric-source[target=_blank]").length'), 6);
    await screenshot(`radar-${theme}-${width}`);

    await clickSelector('button[aria-label="Abrir filtros"]');await waitSelector('select[aria-label="Grupo de propostas"]');
    if (width < 768) await wait('document.querySelector(".legislative-sheet") && document.querySelector(".legislative-sheet").getBoundingClientRect().bottom<=innerHeight+1');
    else assert.ok(await evaluate('Boolean(document.querySelector("[data-radix-popper-content-wrapper] .legislative-floating-panel"))'));
    const beforeFilter = await evaluate('window.calls.length');await input('select[aria-label="Grupo de propostas"]', 'homenagens');await pause(40);assert.equal(await evaluate('window.calls.length'), beforeFilter, 'Draft filters do not trigger network calls');
    await noOverflow();await screenshot(`filtros-${theme}-${width}`);await click('Aplicar');await wait('document.querySelectorAll(".legislative-matter-card").length===1');
    await clickSelector('button[aria-label="Remover filtro Homenagens"]');await wait('document.querySelectorAll(".legislative-matter-card").length===6');

    await clickSelector('button[aria-label="Selecionar período"]');await wait('document.querySelector("input[name=inicio]")');
    await input('input[name=inicio]', '2026-12-20');await input('input[name=fim]', '2026-01-01');await click('Aplicar');await wait('document.querySelector(".legislative-filter-form [role=alert]")');
    await click('Restaurar');assert.equal(await evaluate('document.querySelectorAll(".legislative-filter-form [role=alert]").length'), 0);await click('Desde 2025');await click('Aplicar');await wait('!document.querySelector("input[name=inicio]")');

    await customize('Lista compacta');await wait('document.querySelector("main").dataset.layout==="list"');
    await navigate('/camara/64/materias');await wait('document.querySelectorAll(".legislative-matter-card").length===20');assert.equal(await evaluate('document.querySelector(".legislative-matter-feed").dataset.layout'), 'list');
    await click('Próxima');await wait('document.querySelectorAll(".legislative-matter-card").length===5');
    await input('input[name=busca]', 'nenhum resultado');await clickSelector('button[aria-label="Buscar proposta"]');await wait('document.body.textContent.includes("Nenhuma matéria encontrada")');
    await clickSelector('button[aria-label="Limpar busca"]');await wait('document.querySelectorAll(".legislative-matter-card").length===20');
    await clickSelector('button[aria-label="Abrir filtros"]');await wait('document.querySelector("input[name=territorio]")');await input('input[name=territorio]', 'sao jose');await click('Aplicar');await wait('document.querySelectorAll(".legislative-matter-card").length===2');
    await clickSelector('button[aria-label="Remover filtro sao jose"]');await wait('document.querySelectorAll(".legislative-matter-card").length===20');
    await navigate('/camara/64');await wait('document.querySelector(".legislative-metrics")');
    const beforePreference = await evaluate('window.calls.length');await customize('Mostrar resumo');await wait('!document.querySelector(".legislative-metrics")');assert.equal(await evaluate('window.calls.length'), beforePreference, 'Visual preferences must not refetch or change the data');
    await viewport(width < 768 ? 1440 : 390, height);await wait('document.querySelectorAll(".legislative-metrics dd").length===6');assert.equal(await evaluate('document.querySelector("main").dataset.layout'), 'cards');
    await viewport(width, height);await wait('document.querySelector("main").dataset.layout==="list"&&!document.querySelector(".legislative-metrics")');
    await customize('Restaurar padrão');await wait('document.querySelectorAll(".legislative-metrics dd").length===6&&document.querySelector("main").dataset.layout==="cards"');
    await customize('Mostrar tipos oficiais');await wait('document.querySelector(".legislative-distribution-panel")');await noOverflow();await customize('Mostrar tipos oficiais');
    await click('Como contamos');await wait('document.querySelector("#metodo-legislativo[open]")');await escape();await wait('!document.querySelector(".legislative-info-dialog")');
    assert.ok(await evaluate('document.activeElement.textContent.includes("Como contamos")'), 'Help returns focus to its trigger');
    await click('Sobre os dados');await wait('document.querySelector(".legislative-info-dialog")');await click('Conferência dos dados');await wait('document.body.textContent.includes("A conferência se refere a uma coleta anterior")');await noOverflow();await clickSelector('button[aria-label="Fechar informações"]');await wait('!document.querySelector(".legislative-info-dialog")');

    await click('Propostas');await wait('document.querySelectorAll(".legislative-matter-card").length===20');await clickSelector('.legislative-matter-card h3 a');await wait('document.querySelector(".legislative-detail-title")');
    assert.ok(await evaluate('document.body.textContent.includes("0 contrários")&&document.body.textContent.includes("Bronca TC-001")'));
    await click('Votos nominais publicados (1)');await click('Informar erro');await wait('document.querySelector(".legislative-review-form textarea")');await input('.legislative-review-form textarea', 'Conferir o documento original.');await click('Enviar para revisão');await wait('document.body.textContent.includes("Solicitação enviada")');await clickSelector('button[aria-label="Fechar informações"]');await wait('!document.querySelector(".legislative-info-dialog")');
    await screenshot(`materia-${theme}-${width}`);await noOverflow();
    await click('Vereadores');await wait('document.querySelector(".legislative-person")');await click('Ver atuação na Câmara');await wait('document.querySelector(".legislative-activity")');await click('Votos');await wait('document.body.textContent.includes("1 voto individual publicado")');await click('Presenças');await wait('document.body.textContent.includes("1 presença registrada")');
    assert.ok(await evaluate('document.body.textContent.includes("Registro ausente não comprova falta")'));
    await clickSelector('button[aria-label="Ações do perfil"]');await wait('document.querySelector("[role=menu]")');await click('Criar ou vincular perfil');await wait('document.querySelector(".legislative-admin-table select")');await click('Criar perfil');await click('Confirmar criação');await wait('window.calls.some(c=>c.name==="legislative_decide"&&c.args.p_action==="bind"&&c.args.p_data.create===true)');
    await navigate('/vereadores/64/pessoa-de-teste');await wait('document.querySelectorAll(".legislative-profile .legislative-metrics dd").length===6');await noOverflow();
    await navigate('/camara/64/sessoes/1');await wait('document.body.textContent.includes("A ausência de um nome")');
    await navigate('/camara/64/demandas');await wait('document.querySelector(".legislative-recurrence-card")');assert.ok(await evaluate('document.body.textContent.includes("Atendimento ainda não verificado")'));await click('Ver pedidos e autores');await noOverflow();

    await navigate('/admin/legislativo?cidade=64');await wait('document.querySelector(".legislative-admin-table")');await click('Publicar acervo conferido');await wait('document.body.textContent.includes("Alteração salva")');
    await evaluate('window.qualityBlocked=true;window.published=false');await click('Atualizar');await wait('document.body.textContent.includes("Publicação bloqueada")');assert.ok(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Publicar acervo")).disabled'));
    await input('.legislative-review-form textarea', 'Alteração confirmada nos registros oficiais da Câmara.');await click('Registrar conferência');await wait('document.body.textContent.includes("Alterações conferidas")');await click('Publicar acervo conferido');await wait('window.published');
    await click('Vereadores');await wait('document.querySelector(".legislative-admin-table select")');await input('.legislative-admin-table select', '20000000-0000-4000-8000-000000000001');await click('Confirmar vínculo');await wait('window.bound');
    await navigate('/admin/legislativo?cidade=64&materia=1');await wait('document.querySelector(".legislative-review-form")');await input('select[aria-label="Grupo revisado"]', 'melhorias');await input('.legislative-review-form textarea', 'Tema conferido no texto original.');await click('Salvar revisão');await wait('window.calls.some(c=>c.name==="legislative_decide"&&c.args.p_action==="classify")');
    await wait('!document.querySelector(".legislative-review-form button").disabled');await input('input[placeholder^="/bronca/"]', '/bronca/20000000-0000-4000-8000-000000000001');await input('.legislative-review-form textarea[maxlength="600"]', 'Mesmo endereço, relação conferida no documento.');await click('Confirmar vínculo com o registro');await wait('window.calls.some(c=>c.name==="legislative_decide"&&c.args.p_action==="relate")');
    await wait('!document.querySelector(".legislative-review-form button").disabled');await click('Remover vínculo');await wait('window.calls.some(c=>c.name==="legislative_decide"&&c.args.p_action==="unrelate")');await screenshot(`admin-${theme}-${width}`);await noOverflow();

    await navigate('/camara/64');await wait('document.querySelector(".legislative-metrics")');await clickSelector('button[aria-label="Escolher cidade"]');await wait('document.querySelector(".legislative-city-options")');await click('Recife · PE');await wait('document.body.textContent.includes("Integração oficial ainda não disponível")');assert.equal(await evaluate('document.querySelectorAll(".legislative-matter-card").length'), 0);
    await navigate('/camara/64?pending=1');await wait('document.body.textContent.includes("ainda não foi publicado")');assert.equal(await evaluate('document.querySelectorAll(".legislative-metrics").length'), 0);
    await navigate('/camara/64');await wait('document.querySelector(".legislative-metrics")');await evaluate('window.failLoad=true');await click('Propostas');await wait('document.querySelector("[role=alert]")');await evaluate('window.failLoad=false');await click('Tentar novamente');await wait('document.querySelector(".legislative-matter-card")');
    scenarios++;console.log(`${width}px ${theme}: compact toolbar, responsive panels, per-device preferences, public pages and admin passed.`);
  }
  setTheme('light');await viewport(320, 740);await navigate('/camara/64');await wait('document.querySelector(".legislative-metrics")');await noOverflow();await screenshot('radar-light-320');
  await clickSelector('button[aria-label="Selecionar período"]');await wait('document.querySelector("input[name=inicio]")');await noOverflow();await screenshot('periodo-light-320');await escape();
  return scenarios;
}
