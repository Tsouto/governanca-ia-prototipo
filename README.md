# Governança de IA · NuAudit (NuFuturo, UFBA/IFBA)

Todos os nomes, soluções e números são fictícios.

| O quê | Endereço |
|---|---|
| **MVP funcional** | https://tsouto.github.io/governanca-ia-prototipo/mvp/ |
| Protótipo v1 (projeto final de 12/11) | https://tsouto.github.io/governanca-ia-prototipo/ |

## MVP (`mvp/`)

Aplicação web estática, sem servidor próprio:

- `index.html`, `styles.css`, `app.js` — interface (perfis simulados, painel, pendências, área por solução, cadastro em passos).
- `rules.js` — regras do framework (M1 a M6), funções puras.
- `rules.test.js` — teste das regras: `node mvp/rules.test.js`.
- `seed.js` — seis soluções fictícias para demonstração.
- `apps-script.gs` — backend no Google Apps Script. Grava na planilha "MVP - base de dados" (abas `solucoes` e `eventos`) e recebe as avaliações do protótipo v1.

### Dados

- Conectado, o MVP lê e grava pela URL do App da Web do Apps Script (constante `API` em `app.js`).
- Sem resposta da base, entra em modo local (dados só no navegador) e avisa no topo.
- Gravação concorrente na mesma solução é recusada (controle de versão por registro).
- Quem tiver a URL do App da Web lê e grava: use só dados fictícios e arquive a implantação ao fim do uso.

### Atualizar o backend

1. Abra o projeto do Apps Script vinculado à planilha de avaliações, cole `mvp/apps-script.gs` e salve.
2. Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar (a URL não muda).
   Com várias contas Google no navegador, faça isso numa janela anônima só com a conta dona do projeto.

### Publicar mudanças na interface

Commit em `main` publica pelo GitHub Pages em cerca de 1 minuto. Ao mudar JS ou CSS, aumente o `?v=` em `mvp/index.html` para evitar cache.
