// Monta um pacote autossuficiente com as 57 imagens de exame, a galeria e o
// catálogo, para levar a outro projeto.
//
//   npm run empacotar:exames
//
// Sai em ferramentas/dist/exames-bravomike.zip (~7,5 MB), com tudo dentro:
// as imagens, o catálogo, a leitura inicial, duas versões da galeria e um
// LEIA-ME escrito para quem for usar o pacote do outro lado.
//
// O pacote não depende do SimMonitor: nem da pasta, nem do site publicado
// (exceto a galeria "online", que é opcional e existe só por conveniência).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { montarGaleria, esc } from './galeria-template.mjs';

const BASE_PUBLICA = 'https://bravomike-simmonitor.vercel.app/';
const NOME = 'exames-bravomike';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const saida = path.join(raiz, 'ferramentas', 'dist');
const pasta = path.join(saida, NOME);

const { EXAMS } = await import(new URL('../public/js/exams.js', import.meta.url));
const leitura = JSON.parse(readFileSync(new URL('./ecg-leitura-inicial.json', import.meta.url), 'utf8'));
const leituras = leitura.leituras || {};

rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });

// ---------------------------------------------------------------- imagens ---
cpSync(path.join(raiz, 'public', 'exams'), path.join(pasta, 'exams'), { recursive: true });

// --------------------------------------------------------------- catálogo ---
// Catálogo em JSON, não no formato de módulo do SimMonitor: quem receber o
// pacote não deveria precisar saber como o SimMonitor organiza o código.
writeFileSync(path.join(pasta, 'exames.json'), JSON.stringify({
  _: 'Catálogo das imagens. "id" é como o SimMonitor se refere a cada uma; mantenha se quiser compatibilidade.',
  total: EXAMS.length,
  imagens: EXAMS.map(e => ({
    id: e.id,
    tipo: e.kind === 'ecg' ? 'ecg' : 'raio-x',
    arquivo: e.src,
    rotulo: e.label,
    leitura_inicial: leituras[e.id]?.texto || null,
    confianca: leituras[e.id]?.conf || null,
  })),
}, null, 2) + '\n');

cpSync(new URL('./ecg-leitura-inicial.json', import.meta.url), path.join(pasta, 'ecg-leitura-inicial.json'));
cpSync(new URL('./galeria-template.mjs', import.meta.url), path.join(pasta, 'galeria-template.mjs'));

// ---------------------------------------------------------------- galerias ---
writeFileSync(path.join(pasta, 'galeria.html'),
  montarGaleria({ exams: EXAMS, leituras, base: '' }));

writeFileSync(path.join(pasta, 'galeria-online.html'), montarGaleria({
  exams: EXAMS, leituras, base: BASE_PUBLICA,
  aviso: `<br><br><b>Esta versão busca as imagens na internet</b>, em
<code>${esc(BASE_PUBLICA)}</code>, e por isso funciona sem a pasta <code>exams/</code> ao
lado. Se aquele endereço sair do ar, use a <code>galeria.html</code>, que usa as
imagens locais do pacote.`,
}));

// --------------------------------------------------- regerador autônomo ---
writeFileSync(path.join(pasta, 'gerar-galeria.mjs'), `// Regera as duas galerias a partir de exames.json e da leitura inicial.
//
//   node gerar-galeria.mjs
//
// Só precisa de Node. Rode depois de editar ecg-leitura-inicial.json para que
// as páginas reflitam os nomes corrigidos.
import { readFileSync, writeFileSync } from 'node:fs';
import { montarGaleria, esc } from './galeria-template.mjs';

const BASE_PUBLICA = ${JSON.stringify(BASE_PUBLICA)};
const catalogo = JSON.parse(readFileSync(new URL('./exames.json', import.meta.url), 'utf8'));
const leituras = JSON.parse(readFileSync(new URL('./ecg-leitura-inicial.json', import.meta.url), 'utf8')).leituras || {};

const exams = catalogo.imagens.map(i => ({
  kind: i.tipo === 'ecg' ? 'ecg' : 'xray',
  id: i.id, src: i.arquivo, label: i.rotulo,
}));

writeFileSync(new URL('./galeria.html', import.meta.url),
  montarGaleria({ exams, leituras, base: '' }));
writeFileSync(new URL('./galeria-online.html', import.meta.url), montarGaleria({
  exams, leituras, base: BASE_PUBLICA,
  aviso: '<br><br><b>Esta versão busca as imagens na internet</b>, em <code>' + esc(BASE_PUBLICA) + '</code>.',
}));
console.log('galeria.html e galeria-online.html regeradas (' + exams.length + ' imagens).');
`);

// ----------------------------------------------------------------- LEIA-ME ---
const ecgs = EXAMS.filter(e => e.kind === 'ecg').length;
const xrays = EXAMS.length - ecgs;
const porConf = c => Object.entries(leituras).filter(([, v]) => v.conf === c).map(([k]) => k);

writeFileSync(path.join(pasta, 'LEIA-ME.md'), `# Exames — ${EXAMS.length} imagens (ECG e radiografias)

Pacote autossuficiente: ${ecgs} eletrocardiogramas de 12 derivações e ${xrays}
radiografias de tórax, com catálogo, leitura inicial e uma galeria para
consultar tudo de uma vez.

Vem do **SimMonitor Bravo Mike**, onde essas imagens já são usadas como exames
associados aos casos clínicos.

## O que tem aqui

| Arquivo | O que é |
| --- | --- |
| \`exams/ecg/*.jpg\` | ${ecgs} ECGs de 12 derivações |
| \`exams/xray/*.jpg\` | ${xrays} radiografias de tórax |
| \`exames.json\` | Catálogo: id, tipo, arquivo, rótulo, leitura inicial e confiança |
| \`ecg-leitura-inicial.json\` | Só as leituras, em formato fácil de editar |
| \`galeria.html\` | **Abra este.** Todas as imagens lado a lado, com busca e anotação |
| \`galeria-online.html\` | Mesma coisa, mas buscando as imagens da internet |
| \`gerar-galeria.mjs\` | Regera as galerias depois de editar as leituras |
| \`galeria-template.mjs\` | O template usado pelo regerador |

## Como usar

**Para olhar as imagens:** abra \`galeria.html\` com dois cliques. Funciona
offline, sem servidor e sem instalar nada — as imagens estão na pasta \`exams/\`
ao lado.

**Para pegar uma imagem:** cada cartão tem um botão *copiar id*. O \`id\`
(\`ecg-16\`, \`xray-12\`…) é como o SimMonitor se refere àquela imagem; o caminho
do arquivo está em \`exames.json\`.

**Para corrigir as leituras:** edite os campos na galeria e clique em *Copiar
anotações*, ou edite \`ecg-leitura-inicial.json\` direto e rode
\`node gerar-galeria.mjs\`.

## A leitura inicial NÃO é laudo

As descrições dos ECGs foram feitas por **observação das imagens**, como ponto de
partida para poupar tempo. Cada uma traz o nível de confiança:

- **alta** (${porConf('alta').length}): categorias inequívocas — fibrilação, assistolia, taquicardia rápida,
  bradicardia grave, deterioração de ritmo.
- **média** (${porConf('media').length}): provável, mas confirme antes de usar.
- **baixa** (${porConf('baixa').length}): distinções finas que não dá para garantir nessa resolução —
  parede do infarto, tipo exato de bloqueio, se um alargamento é bloqueio de ramo
  ou ritmo ventricular.

**Confirme com um profissional antes de usar em ensino.** Nada aqui foi validado
clinicamente.

### Um ponto aberto

\`ecg-31\` e \`ecg-34\` parecem visualmente a mesma imagem. Os arquivos são
diferentes (hashes distintos), mas vale conferir lado a lado — se for repetição,
sobra um espaço para outra imagem.

## As radiografias

Já vêm com nome descritivo, em inglês, no campo \`rotulo\`. Tradução:

| id | Em português |
| --- | --- |
| \`xray-0\` | Infiltrados bilaterais graves, 11 anos |
| \`xray-1\` | Intubação seletiva à direita, 2 meses |
| \`xray-2\` | Tamponamento cardíaco, adulto |
| \`xray-3\` | Colapso de lobo superior esquerdo, médio e inferior direitos |
| \`xray-4\` | DPOC |
| \`xray-5\` | Laringotraqueíte (crupe) |
| \`xray-6\` | Infiltrados pulmonares difusos bilaterais |
| \`xray-7\` | Tamponamento cardíaco, lactente |
| \`xray-8\` | Enfisema de mediastino com derrame pleural bilateral |
| \`xray-9\` | Radiografia de tórax normal |
| \`xray-10\` | Pneumonia |
| \`xray-11\` | Pneumonia de lobo inferior esquerdo |
| \`xray-12\` | Edema pulmonar |
| \`xray-13\` | Tuberculose pulmonar |
| \`xray-14\` | Intubação seletiva à direita |
| \`xray-15\` | Colapso de lobo superior direito |
| \`xray-16\` | Hemopneumotórax hipertensivo |
| \`xray-17\` | Pneumotórax hipertensivo |
| \`xray-18\` | Fraturas de arcos costais |
| \`xray-19\` | Opacificação total do pulmão direito |

Essa tradução é do rótulo do arquivo, **não** é laudo.

## Se for usar num app de arquivo único (Artifact)

${Math.round(EXAMS.reduce((s, e) => s + 0, 0)) || ''}As imagens somam cerca de 7,4 MB — muito para embutir em base64 num HTML único.
Duas saídas:

1. **Referenciar pela internet:** as imagens estão publicadas em
   \`${BASE_PUBLICA}exams/…\`. É o que a \`galeria-online.html\` faz. Simples, mas
   depende daquele endereço continuar no ar.
2. **Hospedar junto do seu projeto:** copie a pasta \`exams/\` para onde o seu app
   é servido e use caminhos relativos. Não depende de ninguém.

Escolher entre as duas é decisão de quem monta o app.

## Origem e uso

Imagens reunidas para o SimMonitor Bravo Mike, ferramenta de simulação de
urgência e emergência. São exemplos educacionais estáticos: não são traçados
gerados pelo monitor, nem recomendações clínicas, nem prova de pulso.
`);

// -------------------------------------------------------------------- zip ---
mkdirSync(saida, { recursive: true });
const zip = path.join(saida, NOME + '.zip');
rmSync(zip, { force: true });
execFileSync('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${pasta}' -DestinationPath '${zip}' -CompressionLevel Optimal`],
  { stdio: 'pipe' });

if (!existsSync(zip)) throw new Error('o ZIP não foi criado');
const mb = (readFileSync(zip).length / 1024 / 1024).toFixed(1);
console.log(`pacote pronto: ferramentas/dist/${NOME}.zip  (${mb} MB)`);
console.log(`${EXAMS.length} imagens · catálogo · leitura inicial · 2 galerias · LEIA-ME`);
