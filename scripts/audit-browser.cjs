const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), baseline=process.argv.includes('--baseline'),local=process.argv.includes('--local');
const source=baseline?path.resolve(root,'..','public'):path.join(root,'public');
const output=path.join(root,'auditoria',local?'browser-local':baseline?'browser-antes':'browser-depois');fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
(async()=>{
 let executable;
 const startExecutable=()=>new Promise((resolve,reject)=>{
  executable=require('node:child_process').spawn(path.join(root,'BravoMike-SimMonitor-2.3.2.exe'),[],{windowsHide:true,env:{...process.env,NO_BROWSER:'1'}});
  let log='';const timer=setTimeout(()=>reject(Error('servidor não iniciou')),10000);
  executable.on('error',reject);executable.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});
 });
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/info'){res.setHeader('Content-Type','application/json');return res.end('{"preview":true}');}
  const file=path.resolve(source,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(source+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(e?'Not found':b);});
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=local?await startExecutable():process.env.BASE_URL || 'http://127.0.0.1:'+server.address().port;
 const mode=local?'':'&modo=demo';
 const report={baseline,origin,completed:false,checks:[],errors:[],external:[],layouts:[]};let browser;
 try {
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const context=await browser.newContext({hasTouch:true});await context.route('**/*',r=>{if(!r.request().url().startsWith(origin+'/')){report.external.push(r.request().url());return r.abort();}return r.continue();});
  const monitor=await context.newPage(),control=await context.newPage();for(const p of [monitor,control])p.on('pageerror',e=>report.errors.push(e.message));
  await monitor.setViewportSize({width:1366,height:768});await monitor.goto(origin+'/monitor.html?sala=9876'+mode);
  // Iniciar sem tela cheia para manter os tamanhos exatos dos testes.
  await monitor.evaluate(()=>document.documentElement.requestFullscreen=undefined);await monitor.locator('#bStart').click();
  await control.setViewportSize({width:360,height:640});await control.goto(origin+'/controle.html?sala=9876'+mode);
  await control.waitForFunction(()=>document.querySelector('#lRhythm').textContent.length>0);
  const authorize=async()=>{await monitor.locator('#pairRequests button').first().click();await control.waitForFunction(()=>document.querySelector('#preflight').textContent.includes('Autorizado'));};
  if(!baseline){
   await authorize();
   assert.equal(await control.locator('#teachingMode').inputValue(),'assessment');
   assert.deepEqual(await control.locator('#stageWait option').evaluateAll(els=>els.map(el=>Number(el.value))),[300,180,120,60,30,15]);
   report.checks.push('Padrão sem diagnóstico de ritmo; tempos decrescentes desde 5 min');
   await control.locator('#bMuteAll').click();
   await monitor.waitForFunction(()=>document.querySelector('#bMonitorMute').getAttribute('aria-pressed')==='true');
   await monitor.locator('#bMonitorMute').click();
   await control.waitForFunction(()=>document.querySelector('#bMuteAll').getAttribute('aria-pressed')==='false');
   report.checks.push('Silenciar todos os sons sincroniza nos dois sentidos');
   await control.locator('[data-go="sinais"]').click();
   await control.locator('[data-spo2-signal="low"]').click();await monitor.waitForFunction(()=>document.querySelector('#nSpo2').textContent==='--');
   assert.equal(await control.locator('#v-spo2').textContent(),'98');
   await control.locator('[data-spo2-signal="absent"]').click();await control.waitForFunction(()=>document.querySelector('[data-spo2-signal="absent"]').getAttribute('aria-pressed')==='true');
   await control.locator('[data-spo2-signal="normal"]').click();await monitor.waitForFunction(()=>document.querySelector('#nSpo2').textContent==='98');await control.waitForFunction(()=>document.querySelector('#lSpo2').textContent==='98');
   assert.equal(await control.locator('#presetOptions').evaluate(el=>el===el.parentElement.firstElementChild),true);
   assert.equal(await control.locator('#capnoOptions').evaluate(el=>el.previousElementSibling.dataset.vital==='etco2'&&el.nextElementSibling.dataset.vital==='temp'),true);
   assert.equal(await control.locator('#bTimer').count(),0);assert.equal(await control.locator('#settingsDialog #timerOptions').count(),1);assert.equal(await control.locator('.instr-tag').count(),0);
   await control.locator('[data-vital="spo2"]').scrollIntoViewIfNeeded();await control.screenshot({path:path.join(output,'oximetro-mobile.png')});
   report.checks.push('SpO2: hipoperfusão e ausente preservam valor; normal recupera leitura; ordem e menu corrigidos');
   for(const [button,kind] of [['bMonitorXray','xray'],['bMonitorECG','ecg']]){
    await monitor.locator('#'+button).click();
    const values=await monitor.locator('#monitorExamSelect option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
    assert.ok(values.length>0);assert.ok(values.every(value=>value.startsWith(kind+'-')));
    await monitor.locator('#monitorExamSelect').selectOption(values[0]);await monitor.locator('#monitorExamShow').click();
    await monitor.waitForFunction(()=>!document.querySelector('#examImage').hidden);
    assert.equal(await monitor.locator('#examOverlay').isVisible(),true);
    await monitor.locator('#bCloseExam').click();await monitor.waitForFunction(()=>document.querySelector('#examOverlay').hidden);
   }
   report.checks.push('Ícones de raio-X e ECG abrem catálogos corretos e exibem imagens locais');
   await control.locator('[data-go="terapia"]').click();
   assert.equal(await control.locator('#bPacer').isVisible(),false);
   await control.locator('#pacerOptions > summary').click();assert.equal(await control.locator('#bPacer').isVisible(),true);
   await control.locator('#pacerOptions > summary').click();
   await control.locator('#nibpOptions > summary').click();assert.equal(await control.locator('#bNibp').isVisible(),true);
   await control.locator('#nibpOptions > summary').click();
   await control.screenshot({path:path.join(output,'terapia-minimalista.png')});
   await control.locator('[data-go="ritmo"]').click();
   await control.locator('#rhythmOptions > summary').click();assert.ok(await control.locator('[data-rhythm]:visible').count()>20);
   await control.locator('#rhythmOptions > summary').click();
   await control.locator('[data-go="caso"]').click();
   const unique=await control.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return new Set(ids).size===ids.length;});assert.equal(unique,true);
   report.checks.push('Mais opções mantém acesso a marcapasso, PNI e catálogo de ritmos; IDs únicos');
  }
  for(const width of [1366,1024]){await monitor.setViewportSize({width,height:768});await monitor.screenshot({path:path.join(output,'monitor-'+width+'.png')});
   report.layouts.push(await monitor.evaluate(()=>({page:'monitor',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,buttons:['bNibp','bShock','bPacer','bMonitorPrev','bMonitorPause','bMonitorNext','bMonitorXray','bMonitorECG'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,x:r.x,y:r.y,width:r.width,height:r.height,visible:r.bottom<=innerHeight&&r.right<=innerWidth};})})));}
  await control.locator('[data-go="ritmo"]').click();await control.locator('[data-quick="tvsp"]').click();
  await control.waitForFunction(()=>document.querySelector('#commandStatus').textContent.includes('executado'));
  await control.locator('[data-go="sinais"]').click();await control.locator('[data-k="etco2"] [data-d="1"]').tap();
  await control.waitForFunction(()=>document.querySelector('#v-etco2').textContent==='2');
  await monitor.waitForTimeout(1700);report.etco2AfterArrow=await monitor.locator('#nEtco2').textContent();
  if(baseline)assert.equal(report.etco2AfterArrow,'--');else assert.equal(report.etco2AfterArrow,'2');
  report.checks.push('TVSP → aumentar EtCO₂: '+report.etco2AfterArrow);
  if(!baseline){
   // Rolar a tela começando sobre uma seta não pode editar o sinal.
   const plus=control.locator('[data-k="etco2"] [data-d="1"]');await plus.scrollIntoViewIfNeeded();
   const box=await plus.boundingBox(),cdp=await context.newCDPSession(control),x=box.x+box.width/2,y=box.y+box.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-90}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await control.waitForTimeout(700);
   assert.equal(await control.locator('#v-etco2').textContent(),'2');report.checks.push('Toque ajusta; arrastar sobre seta não ajusta');
   for(const value of [8,17,35,45]){await control.locator(`[data-etco2="${value}"]`).click();await monitor.waitForFunction(v=>document.querySelector('#nEtco2').textContent===String(v),value);}
   assert.equal(await monitor.locator('#nSpo2').textContent(),'--');report.checks.push('4 atalhos EtCO₂, mantendo ausência de pulso');
   await control.locator('#v-etco2').click();
   assert.equal(await control.locator('#vitalDialog').count(),0);
   assert.equal(await control.locator('#vitals input').count(),0);
   await control.locator('[data-k="etco2"] [data-d="1"]').click();
   await monitor.waitForFunction(()=>document.querySelector('#nEtco2').textContent==='47');
   await control.locator('[data-k="etco2"] [data-d="-1"]').click();
   await monitor.waitForFunction(()=>document.querySelector('#nEtco2').textContent==='45');
   report.checks.push('Sinais sem digitação; setas EtCO₂ aumentam e diminuem');
  }
  for(const size of [{width:320,height:568},{width:360,height:640},{width:390,height:844}]){
   await control.setViewportSize(size);await control.locator('[data-k="etco2"]').scrollIntoViewIfNeeded();
   await control.screenshot({path:path.join(output,'controle-'+size.width+'.png'),fullPage:true});
   const layout=await control.evaluate(()=>({page:'controle',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}));report.layouts.push(layout);assert.equal(layout.overflow,false);
  }
  if(!baseline){
   await monitor.reload();await control.waitForFunction(()=>document.querySelector('#commandStatus').textContent.includes('reiniciado'));
   await authorize();if(await monitor.locator('#pauseState').isVisible()){await monitor.locator('#bStart').click();await monitor.locator('#bMonitorPause').click();await control.waitForFunction(()=>document.querySelector('#bPauseAll').getAttribute('aria-label')==='Pausar simulação');}await control.locator('[data-etco2="17"]').click();await monitor.waitForFunction(()=>document.querySelector('#nEtco2').textContent==='17');report.checks.push('Recarga do monitor recupera comandos');
   const duplicate=await context.newPage();await duplicate.goto(origin+'/monitor.html?sala=9876'+mode);
   await control.waitForFunction(()=>document.querySelector('#waiting').textContent.includes('Mais de um'));
   await duplicate.close();await control.waitForFunction(()=>document.querySelector('#waiting').hidden,{},{timeout:10000});
   await control.locator('[data-etco2="45"]').click();await monitor.waitForFunction(()=>document.querySelector('#nEtco2').textContent==='45');report.checks.push('Duplicação bloqueia; fechar duplicado recupera');
   await control.locator('.etco2-shortcuts').scrollIntoViewIfNeeded();await control.screenshot({path:path.join(output,'etco2-viewport.png')});
   if(local){
    await control.waitForFunction(()=>document.querySelector('#modeTag').textContent.includes('Wi-Fi local'));
    const stopped=new Promise(r=>executable.once('exit',r));executable.kill();await stopped;
    await control.waitForFunction(()=>document.querySelector('#waiting').textContent.includes('Sem conexão'));
    await control.locator('[data-etco2="8"]').click();
    assert.equal(await startExecutable(),origin);
    await control.waitForFunction(()=>document.querySelector('#waiting').textContent.includes('Aguardando autorização'),{},{timeout:10000});
    await monitor.waitForTimeout(1500);assert.equal(await monitor.locator('#nEtco2').textContent(),'45');await authorize();
    await control.locator('[data-etco2="17"]').click();await monitor.waitForFunction(()=>document.querySelector('#nEtco2').textContent==='17');
    report.checks.push('Servidor Windows interrompido/reiniciado; comando offline descartado; novo comando executado');
   }
   await control.locator('[data-go="terapia"]').click();await control.locator('#bCharge').click();await control.waitForTimeout(3400);await control.locator('#bShock').click();
   await monitor.waitForFunction(()=>document.querySelector('#shockCount').textContent==='Choques: 1');report.checks.push('Carregar e chocar pelo controle');
  }

  if(!baseline){
   await control.locator('[data-go="caso"]').click();await control.locator('[data-scn="fv"]').click();
   await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 1 de'));
   assert.equal(await monitor.locator('#pauseState').isVisible(),true);
   assert.equal(await control.locator('#timer').textContent(),'00:00');
   await monitor.locator('#bMonitorECG').click();assert.equal(await monitor.locator('#monitorExamSelect').textContent(),'Sem exame associado');await monitor.locator('#monitorExamCancel').click();
   await control.waitForTimeout(1100);assert.equal(await control.locator('#timer').textContent(),'00:00');
   report.checks.push('Caso inicia pausado e zerado; ECG ausente em PCR não recebe associação incompatível');
   await control.locator('#bPauseAll').click();await control.waitForFunction(()=>document.querySelector('#bPauseAll').getAttribute('aria-label')==='Pausar simulação');
   await control.locator('#caseTiming > summary').click();assert.equal(await control.locator('#timedAdvance').isChecked(),false);
   await control.locator('#stageWait').selectOption('15');await control.waitForFunction(()=>document.querySelector('#stageWait').value==='15');
   await control.locator('#timedAdvance').check();
   await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 2 de'),{},{timeout:20000});
   await control.locator('#timedAdvance').uncheck();
   await control.waitForFunction(()=>document.querySelector('#stageCountdown').textContent.includes('Desligado'));
   await monitor.locator('#bMonitorPrev').click();await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 1 de'));
   await control.locator('#caseTiming > summary').click();
   report.checks.push('Avanço temporizado inicia desligado; ativar e selecionar tempo avança caso automaticamente');
   assert.equal(await monitor.locator('#bMonitorPrev').isDisabled(),true);
   await monitor.locator('#bMonitorNext').click();await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 2 de'));
   await monitor.locator('#bMonitorPrev').click();await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 1 de'));
   await monitor.locator('#bMonitorPause').click();await control.waitForFunction(()=>document.querySelector('#bPauseAll').getAttribute('aria-label')==='Retomar simulação');
   assert.equal(await monitor.locator('#bMonitorNext').isDisabled(),true);
   await monitor.locator('#bMonitorPause').click();await control.waitForFunction(()=>document.querySelector('#bPauseAll').getAttribute('aria-label')==='Pausar simulação');
   await monitor.screenshot({path:path.join(output,'monitor-controles-topo.png')});
   report.checks.push('Botões do monitor avançam, voltam, pausam e retomam; estado sincronizado com controle');
   assert.equal(await control.locator('#bCasePrev').isDisabled(),true);
   await control.locator('#bCaseNext').click();await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 2 de'));
   await control.locator('#bCasePrev').click();await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 1 de'));
   await control.locator('[data-go="sinais"]').click();assert.equal(await control.locator('#bPauseAll').isVisible(),true);
   await control.locator('[data-go="caso"]').click();
   report.checks.push('Setas no topo avançam e voltam etapa; pausa disponível em todas as abas');
   assert.equal(await control.locator('#bAudioCheck').isVisible(),false);
   assert.equal(await control.locator('[data-scnact="scn-stop"]').isVisible(),false);
   await control.locator('.case-options > summary').click();await control.waitForTimeout(1400);
   assert.equal(await control.locator('.case-options').getAttribute('open'),'');
   await control.locator('.case-options > summary').click();
   await control.screenshot({path:path.join(output,'caso-minimalista.png')});
   report.checks.push('Caso ativo primeiro; comandos secundários recolhidos; painel aberto persiste após atualização');
   await control.locator('#classroomOptions > summary').click();await control.locator('#advanceMode').selectOption('manual');await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Avanço manual'));
   await control.locator('#teachingMode').selectOption('assessment');await monitor.waitForFunction(()=>document.querySelector('#banner').textContent.includes('Verifique'));
   await control.waitForFunction(()=>document.querySelector('#lRhythm').textContent.includes('Fibrilação'));
   await control.locator('[data-go="terapia"]').click();await control.locator('#bCharge').click();await control.locator('[data-go="caso"]').click();await control.locator('#bPauseAll').click();
   await monitor.waitForFunction(()=>!document.querySelector('#pauseState').hidden);await control.waitForFunction(()=>document.querySelector('#bPauseAll').getAttribute('aria-label')==='Retomar simulação');
   const frozen=await monitor.locator('#cvEcg').evaluate(el=>el.toDataURL());const time=await control.locator('#timer').textContent();
   await control.waitForTimeout(3800);assert.equal(await monitor.locator('#cvEcg').evaluate(el=>el.toDataURL()),frozen);assert.equal(await control.locator('#timer').textContent(),time);assert.equal(await monitor.locator('#chargeTxt').textContent(),'Carregando…');
   await control.screenshot({path:path.join(output,'pausa-mobile.png')});await control.locator('#bPauseAll').click();await monitor.waitForFunction(()=>document.querySelector('#chargeTxt').textContent==='Carregado');
   await control.locator('[data-go="terapia"]').click();await control.locator('#bShock').click();await control.waitForTimeout(1800);await control.locator('[data-go="caso"]').click();assert.match(await control.locator('#scnActive').textContent(),/Etapa 1 de/);
   report.checks.push('Pausa congela ECG, cronômetro e carga; retomada sem pular; avanço manual impede salto após choque; avaliação oculta diagnóstico no monitor');
   await control.locator('#debriefPanel summary').click();await control.locator('#bIntubation').click();await control.waitForFunction(()=>document.querySelector('#historyRecent').textContent.includes('Intubação'));
   const downloaded=control.waitForEvent('download');await control.locator('#bDebrief').click();const file=await downloaded;await file.saveAs(path.join(output,'debrief.txt'));assert.match(fs.readFileSync(path.join(output,'debrief.txt'),'utf8'),/instrutor • informado.*Intubação/);
   report.checks.push('Anotação manual identificada e debrief exportado');
   // Associations update with the case and remain available during pause.
   await control.locator('#scnPicker > summary').click();
   await control.locator('[data-scn="tsv"]').click();await control.locator('#confirmOk').click();
   await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('TSV'));
   await monitor.locator('#bMonitorECG').click();assert.deepEqual(await monitor.locator('#monitorExamSelect option').evaluateAll(els=>els.map(e=>e.value).filter(Boolean)),['ecg-6']);
   await monitor.locator('#monitorExamSelect').selectOption('ecg-6');await monitor.locator('#monitorExamShow').click();await monitor.waitForFunction(()=>!document.querySelector('#examImage').hidden);
   await monitor.locator('#bCloseExam').click();await monitor.locator('#bMonitorECG').click();await control.locator('#bPauseAll').click();
   await control.waitForFunction(()=>document.querySelector('#bCaseNext').disabled===false);await control.locator('#bCaseNext').click();
   await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Etapa 2 de'));
   await monitor.waitForFunction(()=>[...document.querySelector('#monitorExamSelect').options].some(o=>o.value==='ecg-0'));assert.deepEqual(await monitor.locator('#monitorExamSelect option').evaluateAll(els=>els.map(e=>e.value).filter(Boolean)),['ecg-0']);await monitor.locator('#monitorExamCancel').click();
   report.checks.push('Exames associados à etapa: TSV e pós-cardioversão; abre também com caso pausado');
   await control.locator('summary').filter({hasText:'Meus cenários'}).click();await control.locator('#bDuplicate').click();
   assert.match(await control.locator('#editSources').inputValue(),/Diretrizes internacionais 2025/);await control.locator('#editTitle').fill('Caso <b>personalizado</b>');await control.locator('[data-step="0"] [data-vital="hr"]').fill('42');
   await control.setViewportSize({width:320,height:568});await control.screenshot({path:path.join(output,'editor-320.png')});
   assert.equal(await control.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await control.locator('#scenarioForm button[type="submit"]').click();await control.waitForFunction(()=>!document.querySelector('#scenarioEditor').open);
   assert.equal(await control.locator('#customCases b').count(),0);control.on('dialog',d=>d.accept());await control.locator('#customCases button').filter({hasText:'Iniciar'}).click();
   await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('Caso <b>personalizado</b>'));
   assert.match(await control.locator('#caseReview').textContent(),/criação:/);assert.doesNotMatch(await control.locator('#caseReview').textContent(),/revisão documental/);assert.equal(await control.locator('#v-hr').textContent(),'42');assert.equal(await control.locator('#scnActive .tt b').count(),0);
   await control.reload();await authorize();assert.match(await control.locator('#customCases').textContent(),/personalizado/);assert.match(await control.locator('#scnActive').textContent(),/personalizado/);
   await monitor.reload();await authorize();await control.waitForFunction(()=>document.querySelector('#scnActive').textContent.includes('personalizado'));
   report.checks.push('Duplicar/editar/iniciar caso, sem HTML injetado; cópia e caso ativo persistem em recargas');
   await control.screenshot({path:path.join(output,'caso-revisado-mobile.png'),fullPage:true});
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.completed=true;
 } catch(error){report.failure=error.message;throw error;}
 finally {fs.writeFileSync(path.join(output,'resultado.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser?.close();executable?.kill();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
