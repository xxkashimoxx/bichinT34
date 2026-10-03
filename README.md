# bichinT34
repositório referente ao ainda projeto porém já em fase de deploy

# Ninho — chá de bebê

Mini aplicativo para organizar o chá de bebê e a chegada de Anya ou LEVI. Inclui painel, checklist original de 53 itens, lista de convidados, convites individuais por link, confirmação de presença, respostas por WhatsApp, CSV e configurações do evento.

## Rodar

Requer Node.js 18 ou superior. Não precisa instalar dependências nem configurar Supabase ou Vercel.

```bash
npm start
```

Abra `http://localhost:4173`. O backend HTTP usa apenas módulos nativos do Node e salva os dados em `data/ninho.json`. Esse arquivo é criado automaticamente e não deve ser compartilhado publicamente: contém nomes e telefones de convidados.

## Funcionalidades

- Configurar o bebê (Anya/menina ou LEVI/menino), data, hora, endereço, mensagem e link do mapa.
- Criar/editar convidados; pesquisar e filtrar por resposta.
- Gerar link exclusivo de convite e abrir uma mensagem pronta no WhatsApp.
- Receber resposta de presença e número de acompanhantes pela página `/convite/:token`.
- Ver totais de confirmados e pendentes e exportar os convidados em CSV.
- Marcar os itens do checklist como “Tenho” ou “Comprar”; o progresso fica salvo no backend local.

## Limite do modo local

O convite pode ser testado na mesma rede executando `HOST=0.0.0.0 npm start` e usando o endereço IP do computador no link. Para compartilhar com pessoas fora da rede, será necessário hospedar o servidor e usar HTTPS. Antes de publicar, deve-se acrescentar login à área administrativa. O projeto não envia mensagens automaticamente: o botão WhatsApp abre o aplicativo com o texto pronto para a pessoa responsável revisar e enviar.

## Prévia Vercel

`npm run build` prepara uma versão estática em `public/`. Sem banco persistente conectado, essa prévia salva alterações no navegador em uso; convites e confirmações não sincronizam entre aparelhos. A API local continua disponível por `npm start`. Para liberar convites reais, conecte uma base de dados compartilhada e proteja o painel administrativo antes da publicação pública.

## API principal

- `GET /api/data`
- `PUT /api/event`
- `POST /api/guests` e `PATCH /api/guests/:id`
- `GET /api/invite/:token`
- `POST /api/rsvp/:token`
- `PATCH /api/checklist/:id`


Vercel deployment preview is configured for this Ninho front end.
