# Lá vem cegonha — chá de bebê

Aplicativo para organizar o chá e a chegada de Anya ou Levi. Anya usa a identidade violeta e o convite ilustrado enviado pela família; Levi usa tons de sálvia e creme, tipografia sem cursiva e um convite próprio. Reúne detalhes do evento, convidados com links individuais, confirmações de presença e checklist de enxoval. A marca usa a ilustração da cegonha enviada pela família.

## Recursos

- Configurar o nome do bebê, data, horário, endereço, mensagem e link do mapa; a escolha do nome altera o visual do painel e dos convites compartilhados.
- Cadastrar e editar convidados, pesquisar por nome/telefone e filtrar respostas.
- Copiar um link exclusivo ou abrir uma mensagem pronta para envio pelo WhatsApp.
- Receber RSVP por convidado, incluindo acompanhantes, sem exigir login de quem recebeu o convite.
- Acompanhar totais de presença, exportar convidados para CSV e atualizar os 53 itens do checklist.

## Produção

- Frontend estático publicado no Vercel, projeto `bichint34`.
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
Identidade visual: Anya em violeta; Levi em sálvia e creme. A logo oficial é Lá vem cegonha.
