<p align="center"><img src="public/favicon.svg" width="72" height="72" alt="TickDone"></p>

<h1 align="center">TickDone</h1>

<p align="center">Lista de tarefas e gerenciador de tempo que roda no seu navegador: tarefas, calendário, matriz de Eisenhower, timer de foco e rastreador de hábitos.</p>

<p align="center"><a href="https://tickdone.pages.dev"><b>Abrir o TickDone → tickdone.pages.dev</b></a></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <b>Português (Brasil)</b> ·
  <a href="README.ru.md">Русский</a>
</p>

![Tarefas com o painel de detalhes aberto](docs/screenshots/desktop-tasks.png)

| Calendário | Matriz de Eisenhower |
|---|---|
| ![Calendário](docs/screenshots/desktop-calendar.png) | ![Matriz de Eisenhower](docs/screenshots/desktop-matrix.png) |
| **Timer de foco** | **Rastreador de hábitos** |
| ![Timer de foco](docs/screenshots/desktop-pomo.png) | ![Rastreador de hábitos](docs/screenshots/desktop-habit.png) |

## Recursos

- **Tarefas**: Caixa de entrada, Hoje, Amanhã, Próximos 7 dias, Todas, Concluídas, Descartadas e Lixeira; suas próprias listas, pastas e etiquetas; subtarefas, notas, prioridades, datas e horários de vencimento, lembretes e regras de repetição; tarefas fixadas; menu de contexto em cada tarefa; desfazer depois de concluir ou excluir.
- **Adição rápida** que entende o que você digita e destaca o que reconheceu: `call mom tomorrow 3pm !high #family ~Personal` define data, horário, prioridade, etiqueta e lista em uma linha só.
- **Visualizações em lista e kanban**, com agrupamento e ordenação.
- **Calendário** com visualizações de mês, semana e dia.
- **Matriz de Eisenhower** para organizar as tarefas por urgência e importância.
- **Timer de foco** com modos Pomodoro e cronômetro e um histórico das sessões anteriores.
- **Rastreador de hábitos** com check-ins, sequências e estatísticas.
- **Busca**, atalhos de teclado e tema escuro.

Seus dados ficam no seu navegador (localStorage). Não há conta e nada é enviado para um servidor.

### Atalhos de teclado

| Tecla | Ação |
|---|---|
| `N` | Nova tarefa |
| `Ctrl/⌘ F` | Buscar |
| `Alt 1`–`Alt 6` | Trocar de módulo |
| `Ctrl/⌘ Z` | Desfazer, enquanto o aviso de desfazer estiver na tela |
| `Esc` | Fechar os detalhes da tarefa |
| `?` | Mostrar todos os atalhos |

## Roadmap

Cada item tem link para a sua issue. Os itens marcados já estão no ar em [tickdone.pages.dev](https://tickdone.pages.dev).

- [x] Tarefas, listas, etiquetas, adição rápida, calendário, matriz de Eisenhower, timer de foco e rastreador de hábitos
- [x] CI com testes unitários e de ponta a ponta ([#7](https://github.com/suica/tickdone/issues/7))
- [x] Código aberto: README em 10 idiomas, licença MIT, regras do projeto ([#10](https://github.com/suica/tickdone/issues/10))
- [ ] Layouts para celulares, tablets e telas grandes ([#8](https://github.com/suica/tickdone/issues/8))
- [ ] Arrastar e soltar em todo o app ([#9](https://github.com/suica/tickdone/issues/9))
- [ ] Animações ([#3](https://github.com/suica/tickdone/issues/3))
- [x] Link do GitHub e seção Sobre no app ([#4](https://github.com/suica/tickdone/issues/4))
- [ ] Interface em 10 idiomas ([#14](https://github.com/suica/tickdone/issues/14))
- [ ] Refinamento da interface, tela por tela ([#11](https://github.com/suica/tickdone/issues/11))
- [ ] Seleção múltipla e edição em lote ([#15](https://github.com/suica/tickdone/issues/15))
- [ ] Navegação pelo teclado nas listas de tarefas ([#16](https://github.com/suica/tickdone/issues/16))
- [ ] Notificações de lembretes ([#17](https://github.com/suica/tickdone/issues/17))
- [ ] Instalar como app e usar offline ([#18](https://github.com/suica/tickdone/issues/18))
- [ ] Filtros salvos ([#19](https://github.com/suica/tickdone/issues/19))
- [ ] Estatísticas de tarefas, do timer de foco e do rastreador de hábitos ([#20](https://github.com/suica/tickdone/issues/20))
- [ ] Markdown nas notas das tarefas ([#21](https://github.com/suica/tickdone/issues/21))
- [ ] Visualização em linha do tempo ([#22](https://github.com/suica/tickdone/issues/22))
- [ ] Mais regras de repetição ([#23](https://github.com/suica/tickdone/issues/23))
- [ ] Arquivar listas ([#24](https://github.com/suica/tickdone/issues/24))
- [ ] Acessibilidade ([#25](https://github.com/suica/tickdone/issues/25))
- [ ] Rápido mesmo com milhares de tarefas ([#26](https://github.com/suica/tickdone/issues/26))
- [ ] Temas e cores de destaque ([#27](https://github.com/suica/tickdone/issues/27))
- [ ] Calendário: planejar tarefas sem data, visualização de agenda ([#28](https://github.com/suica/tickdone/issues/28))

## Desenvolvimento

Requer Node.js 24.

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npx playwright install chromium
npm run e2e        # end-to-end tests (Playwright)
npm run build      # type check and production build into dist/
```

Feito com React 19, TypeScript, Vite e date-fns.

## Deploy

O site em produção fica no Cloudflare Pages:

```sh
npm run build
npx wrangler pages deploy dist --project-name tickdone --branch main
```

## Como contribuir

Issues e pull requests são bem-vindos. Leia primeiro o [AGENTS.md](AGENTS.md): lá estão as regras do projeto (inglês como idioma de trabalho, traduções para todos os idiomas suportados, layouts responsivos, convenções de animação e de arrastar e soltar, e a CI em que todo PR precisa passar).

## Licença

[MIT](LICENSE)
