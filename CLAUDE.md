# Instruções de entrega — SimMonitor

## Objetivo

Preparar esta versão do SimMonitor para que o usuário publique na Vercel com comunicação autorizada via Supabase. Comece pela implementação existente. Preserve layout, traçados/velocidades, casos e regras clínicas. O pacote é a base final da reorganização; a integração online ainda está pendente.

## Sequência de trabalho

1. Leia `PUBLICACAO_VERCEL_SUPABASE.md`. Localize os dois bloqueios online e o canal público descritos ali. Rode `npm run verify:delivery` antes de editar, `npm test` e `npm run build:web`. Conclua esta etapa registrando a base recebida e o resultado dos comandos.
2. Consulte `MAPA_DO_CODIGO.md` para localizar as responsabilidades. Apresente um plano curto para autorização de salas, identidade dos participantes, papéis monitor/controle, revogação, recarga e reconexão. Reaproveite o fluxo de autorização visível já existente.
3. Inspecione o projeto Supabase pretendido e sua configuração antes de propor migrações. Confirme o destino se não estiver identificável no contexto/acesso do usuário. Verifique a documentação atual. Entregue alterações locais e migrações reproduzíveis antes de qualquer aplicação em ambiente remoto.
4. Implemente a integração em etapas pequenas. O receptor precisa verificar identidade/papel por um mecanismo confiável; `msg.from`, `msg.role`, código curto da sala e `lease` informados no próprio payload não são prova de identidade. Preserve rejeição de duplicação, atraso, comandos de sessões anteriores e descarte offline.
5. Exercite os critérios de aceite do guia em ambiente de teste. Só substitua os bloqueios online atuais quando a nova autorização estiver demonstrada pelos testes. Rode a suíte local para provar que a integração não quebrou demonstração/Go.
6. Entregue um `ENTREGA_PARA_REVISAO.md` com arquivos alterados, migrações, comandos, resultados locais/remotos separados, URL de teste se existir, limitações, configuração final e procedimento de retorno à versão anterior. O usuário fará a publicação; este pacote não autoriza publicar ou modificar serviços por conta própria.

## Preservação

- `public/` é a fonte. Gere novamente `web/dist/` e `server-go/public/` pelos scripts; mantenha as duas interfaces na mesma versão de protocolo.
- Preserve bytes de `dart-data.js`, `dart-player.js`, `ecg-shapes.js`, motor e HTML/CSS aprovado, salvo mudança explicitamente necessária ao fluxo online, documentada separadamente. Não redesenhe as telas como parte da integração.
- Preserve os 144 testes. Acrescente testes de autorização online sem enfraquecer as verificações locais. Há seis testes específicos dos limites entre módulos em `tests/organization.test.js`.
- Mantenha decisões clínicas e novos recursos fora desta etapa. Fontes documentais e limitações estão em `evidencias/REVISAO_CLINICA_ORIGEM.md` e `evidencias/REORGANIZACAO_ORIGEM.md`.
- A URL/chave em `public/js/config.js` foi preservada da origem. A chave é publicável; ela não autentica o instrutor. Chaves secretas e `service_role` ficam somente em ambiente confiável de servidor.

## Limites da entrega

Os relatórios em `evidencias/` descrevem testes locais. Não comprovam Supabase configurado, autorização remota, publicação, aparelhos físicos ou revisão clínica. Scripts históricos estão em `evidencias/scripts-origem/` como texto: dependem de backups da máquina de origem. O pacote oferece uma verificação própria de integridade; a ausência desses backups não foi contornada removendo testes da aplicação.
