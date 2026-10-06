# Rumo ao Equilíbrio

## Iniciar localmente

Requer Node.js 22.13 ou posterior. Na pasta do projeto, execute:

```sh
npm start
```

Sem `DATABASE_URL`, o servidor usa SQLite local em `data/surveys.sqlite`. Abra <http://127.0.0.1:3000>. A página de pesquisa precisa ser aberta pelo servidor; abrir o HTML como arquivo não conecta à API.

## Códigos individuais da pesquisa

Na primeira visita à pesquisa, o servidor cria automaticamente um código aleatório para o navegador e a página o mostra para a pessoa guardar. O código fica salvo no navegador e é usado ao enviar a pesquisa; não é necessário digitá-lo. O banco guarda apenas os hashes do código e do identificador do navegador. Um navegador só pode registrar um código; cada código só pode enviar uma pesquisa. O banco impõe as regras mesmo se duas tentativas forem feitas ao mesmo tempo.

O nome digitado não é enviado ao servidor nem guardado junto às respostas. A identificação automática vale por navegador: limpar os dados ou usar outro dispositivo cria uma identidade diferente. Para garantir uma pesquisa por pessoa entre dispositivos, será necessário adicionar cadastro com identidade verificada.

## Publicar com Render e Supabase

O arquivo `render.yaml` configura o servidor web, e `supabase/schema.sql` documenta o esquema PostgreSQL utilizado. Para gerar o link público:

1. Crie um projeto no Supabase e espere a base de dados ficar disponível.
2. No Supabase, abra as configurações de conexão do banco e copie uma URI PostgreSQL com TLS. Use a connection string indicada para aplicações/connection pooling, se disponível.
3. No Supabase SQL Editor, execute o conteúdo de `supabase/schema.sql`. O servidor também cria essas tabelas na inicialização se ainda não existirem.
4. Publique este repositório no GitHub e, no Render, crie um Blueprint a partir do repositório para carregar `render.yaml`.
5. Quando o Render pedir `DATABASE_URL`, cole a URI PostgreSQL do Supabase como variável secreta. Não a coloque no código, no GitHub ou em mensagens.
6. Aguarde o deploy concluir. O Render mostrará um domínio `https://...onrender.com`; esse é o link para compartilhar nas redes.

O serviço web gratuito do Render pode entrar em suspensão quando não é acessado; a primeira visita após a suspensão pode demorar. O plano gratuito do Supabase também tem limites e pode pausar projetos inativos. Confirme os limites atuais antes de publicar para uso contínuo. Para uso remoto, compartilhe somente a URL HTTPS do site, nunca a `DATABASE_URL`.

Para desenvolvimento local com Supabase, defina `DATABASE_URL` no ambiente antes de executar `npm start`. Sem essa variável, os dados continuam usando SQLite local em `data/surveys.sqlite`. `PORT` e `HOST` também podem ser configurados pelo ambiente.

## Testes

```sh
npm test
```
