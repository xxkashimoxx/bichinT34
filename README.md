# Lá vem cegonha — chá de bebê

Aplicativo para organizar o chá e a chegada de Anya. Usa identidade violeta, o convite ilustrado enviado pela família, detalhes do evento, convidados com links individuais, confirmações de presença e checklist de enxoval. A marca usa a ilustração da cegonha enviada pela família.

## Recursos

- Configurar o nome do bebê, data, horário, endereço, mensagem e link do mapa; a escolha do nome altera o visual do painel e dos convites compartilhados.
- Cadastrar e editar convidados, pesquisar por nome/telefone e filtrar respostas.
- Copiar um link exclusivo ou abrir uma mensagem pronta para envio pelo WhatsApp.
- Receber RSVP por convidado, incluindo acompanhantes, sem exigir login de quem recebeu o convite.
- Acompanhar totais de presença, exportar convidados para CSV e atualizar os 53 itens do checklist.
- Marcar agora itens como “Temos” ou “Vamos ganhar”; ambos deixam de aparecer na lista pública. Só o registro de entrega por pessoa abre após o chá.
- Após o dia do chá, registrar manualmente os presentes recebidos, associá-los ao enxoval e ao convidado, publicar recados autorizados no mural e preparar agradecimentos ou lembranças digitais para envio pessoal. O site não processa pagamentos.
- Antes do evento, receber recados e dicas dos convidados. A família aprova, oculta ou exclui cada mensagem na aba Recados; só mensagens aprovadas aparecem publicamente.
- Ver as próximas ações no painel e o progresso do enxoval em números e percentual. O convite tem um botão de confirmação de presença logo após a arte.
- Convidados podem informar acompanhantes, crianças e restrições alimentares no RSVP; os detalhes ficam no painel da família.
- Reservar um item pelo convite individual e marcá-lo como comprado, evitando reservas simultâneas do mesmo item. A família gerencia as reservas no checklist.
- Cadastrar até cinco links de lojas e uma faixa de preço estimada por item. Itens sem faixa definida ficam no grupo próprio.
- Ver rotas no Google Maps e Waze; a previsão da região de Guaratiba aparece quando o evento estiver no alcance da previsão de até 16 dias.
- Enviar um palpite de nascimento e peso pelo convite individual. A família vê os palpites no painel.
- Configurar um dress code opcional e uma chave PIX opcional; o PIX só aparece aos convidados quando chave e recebedor estão preenchidos. Não há confirmação automática de pagamento.

## Produção

- Frontend estático publicado no Vercel, projeto `la-vem-cegonha`: https://anyachegou.vercel.app/.
- Banco de dados Supabase dedicado `ninho-cha-bebe`, região `sa-east-1` (São Paulo).
- A Edge Function `ninho-api` valida a senha do painel e mantém os dados administrativos privados; os links de RSVP usam tokens aleatórios individuais.
- A chave `sb_publishable_...` inserida pelo `build.js` é pública e tem privilégios anon restritos. A chave de servidor fica somente no runtime Supabase.
- A senha administrativa não deve ser armazenada no repositório. A sessão expira após 8 horas e fica no `sessionStorage` do navegador.

Para publicar, `npm run build` gera `public/` e injeta a URL da API e a chave publishable. O Vercel reescreve `/convite/:token` para a aplicação; os links enviados aos convidados abrem uma página pública renderizada pela Edge Function Supabase, para continuarem acessíveis mesmo com o painel protegido por SSO.

## Desenvolvimento local

Requer Node.js 18 ou superior, sem dependências adicionais:

```bash
npm start
```

Abra `http://localhost:4173`. Nesse modo, o servidor local salva os dados em `data/ninho.json`; esse arquivo é ignorado pelo Git. `npm run build` prepara o artefato de produção ligado ao Supabase.

## Rotas da API

- `GET /api/data` — detalhes do evento, convidados e checklist (painel autenticado).
- `PUT /api/event` — atualiza detalhes do evento (painel autenticado).
- `POST /api/guests` e `PATCH /api/guests/:id` — cadastro/edição (painel autenticado).
- `GET /api/invite/:token` e `POST /api/rsvp/:token` — convite individual e RSVP público.
- `PATCH /api/checklist/:id` — atualiza o checklist (painel autenticado).
- `GET /api/public-checklist` — itens que ainda não estão em “Temos”.
- `GET /api/public-messages` e `POST /api/public-messages` — leitura de recados aprovados e envio de novos recados para moderação.
- `PATCH /api/messages/:id` e `DELETE /api/messages/:id` — aprovação, ocultação e exclusão no painel autenticado.
- `GET /api/mural` — recados autorizados pelos pais, apenas após o dia do evento.
- `POST /api/gifts`, `PATCH /api/gifts/:id`, `DELETE /api/gifts/:id` — registros manuais após o evento, protegidos pela senha administrativa.

Identidade visual: Anya em violeta. A logo oficial é Lá vem cegonha.
