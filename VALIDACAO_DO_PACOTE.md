# Validação do pacote para o Claude — 21/09/2026

## Executado nesta pasta portátil

- **144 testes JavaScript aprovados**, nenhuma falha. Registro: `evidencias/testes-pacote.txt`.
- Build estática e preparação dos arquivos do servidor Go executadas com sucesso.
- **115 arquivos de aplicação, testes e servidor Go idênticos por SHA-256 à versão final reorganizada**: 106 arquivos públicos, cinco arquivos de teste e quatro do servidor.
- **210 cópias geradas conferidas** contra as fontes, em `web/dist/` e `server-go/public/`.
- **74 imports locais resolvidos** e **18 referências estáticas do HTML gerado existentes**.
- Configuração da Vercel conferida localmente: build, diretório de saída e preservação das extensões `.html`.
- Configuração Supabase mantém a chave publicável da origem. A busca limitada por formatos de chave secreta e chave privada não encontrou ocorrências nos arquivos inspecionados. Isso não constitui auditoria completa de segredos.

Detalhes reproduzidos da conferência: `evidencias/validacao-pacote.json`. O manifesto `ENTREGA_SHA256.json` foi gerado depois de concluir o pacote. O verificador está em `scripts/verify-delivery.mjs`.

## Evidências herdadas da revisão anterior

Quatro testes Go, 43 verificações de navegador (21 demo e 22 servidor local), comparação de 156 traçados/frequências, 3.120 comparações de leituras/alarmes, 24 etapas clínicas e quatro configurações de desenho sem diferenças. Os respectivos relatórios foram copiados para `evidencias/`.

Essas verificações Go/browser não foram repetidas no empacotamento: os fontes e os testes permaneceram idênticos. Os resultados não demonstram funcionamento online em Supabase/Vercel. Não houve acesso a projeto remoto, publicação, alteração de banco ou configuração de serviço.

## Diferenças de empacotamento

1. A versão final foi colocada em uma pasta única, sem misturar a entrega original e revisões intermediárias.
2. Documentação antiga foi substituída na entrada por um roteiro atual. Os relatórios relevantes da origem foram preservados como evidência, com seus limites históricos.
3. `package.json` mantém versão e comandos de execução/teste/build. Os dois comandos de auditoria dependentes de backups locais foram arquivados com seus scripts em texto; o pacote oferece `verify:delivery` para conferir os arquivos recebidos.
4. `MAPA_DO_CODIGO.md` foi adaptado para esta pasta portátil. A cópia exata anterior está em `evidencias/MAPA_ORIGEM.md`.
5. `vercel.json` e `.vercelignore` foram acrescentados somente à entrega. Não foram enviados a serviço algum.
6. Executáveis, ferramentas `.tools`, versões antigas, caches, backups e cópias geradas ficaram fora do ZIP. A build e o servidor local podem ser recriados pelos comandos do `LEIA-ME.md`.

Nenhuma regra clínica, função da aplicação, teste existente, autorização ou bloqueio online foi alterado para montar o pacote. O código público é idêntico à versão final de origem. A pendência online e seu critério de resolução estão em `PUBLICACAO_VERCEL_SUPABASE.md`.
