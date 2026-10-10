// Tela da sala no monitor: código, QR code e endereço do controle, escolha da
// rede quando o notebook tem mais de uma, e o botão "Nova sala".
//
// Só tela: não decide autorização nem muda o estado da simulação. O monitor.js
// liga os botões (ele controla quem está agindo e a pausa) e chama daqui.
export function criarSalaUi({
  document, transport, room, toast, guardarSala, irParaSala,
  pagina = () => globalThis.location,
  agora = () => Date.now(), agendar = (f, ms) => setTimeout(f, ms),
  carregarQr = () => import('./vendor/qrcode.mjs'),
}) {
  const $ = id => document.getElementById(id);
  const setTxt = (id, v) => { const el = $(id), s = String(v); if (el.textContent !== s) el.textContent = s; };
  let ipIdx = 0, qrcode = null, novaSalaArmadaAte = 0;

  // Modo local: o celular precisa do IP do notebook na rede, não de "localhost".
  function enderecoDoControle() {
    const info = transport.info;
    let base;
    if (transport.mode === 'local' && info?.ips?.length) base = `http://${info.ips[Math.min(ipIdx, info.ips.length - 1)]}:${info.port}`;
    else { const l = pagina(); base = l.origin + l.pathname.replace(/[^/]*$/, ''); }
    return base.replace(/\/$/, '') + '/controle.html?sala=' + room + (transport.mode === 'demo' ? '&modo=demo' : '');
  }

  async function desenharQr(el) {
    try {
      if (!qrcode) qrcode = (await carregarQr()).default;
      const q = qrcode(0, 'M'); q.addData(enderecoDoControle()); q.make();
      el.innerHTML = q.createImgTag(6, 8, 'QR code do controle');
    } catch (e) { el.innerHTML = '<div style="padding:20px;color:#111;line-height:1.3;font-weight:700">QR indisponível<br>use o código</div>'; }
  }

  function atualizar() {
    ['roomCode', 'roomCodeBig', 'roomCodeModal'].forEach(id => setTxt(id, room));
    const url = enderecoDoControle();
    setTxt('ctrlUrl', url.replace(/^https?:\/\//, '')); setTxt('ctrlUrl2', url.replace(/^https?:\/\//, ''));
    desenharQr($('qrStart')); desenharQr($('qrModalBox'));
    setTxt('modeLbl', { local: 'Modo local (Wi-Fi, sem internet)', online: 'Modo online', demo: 'Modo demonstração (mesmo aparelho)' }[transport.mode] || '');
    // Mais de uma rede (ex.: Wi-Fi e cabo): deixa escolher qual endereço vai no QR.
    const ips = transport.mode === 'local' ? (transport.info?.ips || []) : [];
    ['ipPick', 'ipPick2'].forEach(id => {
      const box = $(id);
      box.hidden = ips.length < 2;
      box.innerHTML = ips.length < 2 ? '' : '<span class="muted small">Rede do celular:</span>' + ips.map((ip, i) => `<button class="btn ghost small ${i === ipIdx ? 'on' : ''}" data-ip="${i}">${ip}</button>`).join('');
    });
  }

  document.addEventListener('click', e => {
    const b = e.target?.closest?.('[data-ip]'); if (!b) return;
    ipIdx = Number(b.dataset.ip); atualizar();
  });

  // Trocar de sala derruba o controle já pareado: exige dois toques.
  function novaSala() {
    const b = $('bNewRoom');
    if (agora() > novaSalaArmadaAte) {
      novaSalaArmadaAte = agora() + 6000; b.textContent = 'Confirmar nova sala';
      toast('O controle atual será desconectado. Toque de novo para confirmar.', 6000);
      agendar(() => { if (agora() > novaSalaArmadaAte) b.textContent = 'Nova sala'; }, 6200);
      return;
    }
    const n = String(Math.floor(1000 + Math.random() * 9000));
    guardarSala(n);
    irParaSala(n);
  }

  return { atualizar, novaSala, enderecoDoControle };
}
